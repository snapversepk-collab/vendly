import { Router } from 'express';
import { z } from 'zod';
import { one, q } from '../db/index.js';
import { clashCheck, quoteTotal } from '../lib/bookings.js';
import { addDays, monthRange, todayPk } from '../lib/dates.js';
import { emails, later } from '../lib/email.js';
import { moneySummary } from '../lib/money.js';
import { FUNCTION_TYPES } from '../lib/templates.js';
import { HttpError, ah, bad, notFound } from '../lib/util.js';
import { normPhone } from './auth.js';

/** No login. Client-facing pages reach data only through a handle or a long random token. */
export const publicRouter = Router();

const bizOut = (b: any) => ({
  name: b.name, handle: b.handle, whatsapp: b.whatsapp, cities: b.cities, trades: b.trades, logo: b.logo,
  advancePct: b.advance_pct, balanceDue: b.balance_due, rescheduleNoticeDays: b.reschedule_notice_days, paymentMethods: b.payment_methods,
});

publicRouter.get(
  '/b/:handle',
  ah(async (req, res) => {
    const b = await one(`SELECT * FROM businesses WHERE handle=$1`, [String(req.params.handle).toLowerCase()]);
    if (!b) throw notFound('This booking page does not exist');
    const services = (await q(`SELECT id, name, trade, hours, price, includes FROM services WHERE business_id=$1 AND active ORDER BY sort, name`, [b.id])).rows;
    const month = z.string().regex(/^\d{4}-\d{2}$/).optional().parse(req.query.month) ?? todayPk().slice(0, 7);
    const { from, to } = monthRange(month);
    const today = todayPk();
    // Full dates are hidden on the booking page (spec: clash check)
    const freeDates: string[] = [];
    for (let d = from < today ? today : from; d <= to; d = addDays(d, 1)) {
      if (!(await clashCheck(b.id, d)).full) freeDates.push(d);
    }
    res.json({ business: bizOut(b), services, month, freeDates, functionTypes: FUNCTION_TYPES });
  }),
);

publicRouter.post(
  '/b/:handle/inquiries',
  ah(async (req, res) => {
    const b = await one(`SELECT id, whatsapp, name FROM businesses WHERE handle=$1`, [String(req.params.handle).toLowerCase()]);
    if (!b) throw notFound('This booking page does not exist');
    const body = z
      .object({
        clientName: z.string().trim().min(1, 'Enter your name').max(120),
        whatsapp: z.string().trim().min(10, 'Enter your WhatsApp number').max(20),
        email: z.string().trim().email().optional().or(z.literal('')),
        functionType: z.string().min(1),
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        serviceId: z.string().uuid().optional().nullable(),
        venue: z.string().max(300).optional(),
        city: z.string().max(80).optional(),
        guests: z.number().int().min(0).max(100000).optional(),
        message: z.string().max(2000).optional(),
        website: z.string().optional(), // honeypot
      })
      .parse(req.body);
    if (body.website) return res.json({ ok: true }); // bot
    if (body.date < todayPk()) throw bad('Pick a date from today onwards');
    if (body.serviceId) {
      const s = await one(`SELECT id FROM services WHERE id=$1 AND business_id=$2 AND active`, [body.serviceId, b.id]);
      if (!s) body.serviceId = null;
    }
    // simple rate limit: at most 5 inquiries per number per day
    const recent = await one(`SELECT COUNT(*)::int AS n FROM inquiries WHERE business_id=$1 AND whatsapp=$2 AND created_at > now() - interval '1 day'`, [b.id, normPhone(body.whatsapp)]);
    if (recent!.n >= 5) throw new HttpError(429, 'You have sent a few requests already. The vendor will reply on WhatsApp.');
    const i = await one(
      `INSERT INTO inquiries (business_id, client_name, whatsapp, email, function_type, date, service_id, venue, city, guests, message)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`,
      [b.id, body.clientName, normPhone(body.whatsapp), body.email || null, FUNCTION_TYPES.includes(body.functionType as any) ? body.functionType : 'Other', body.date, body.serviceId ?? null, body.venue ?? null, body.city ?? null, body.guests ?? null, body.message ?? null],
    );
    later(emails.inquiryReceived(i!.id));
    res.status(201).json({ ok: true, id: i!.id, vendorWhatsapp: b.whatsapp });
  }),
);

publicRouter.get(
  '/q/:token',
  ah(async (req, res) => {
    const qt = await one(
      `SELECT qt.*, bk.function_type, bk.date, bk.start_time, bk.hours, bk.venue, bk.status AS booking_status, c.name AS client_name, row_to_json(b.*) AS biz,
              COALESCE((SELECT SUM(amount) FROM payments p WHERE p.booking_id=bk.id),0)::int AS paid
         FROM quotes qt JOIN bookings bk ON bk.id=qt.booking_id JOIN clients c ON c.id=bk.client_id JOIN businesses b ON b.id=qt.business_id
        WHERE qt.token=$1`,
      [req.params.token],
    );
    if (!qt) throw notFound('This quote link is not valid');
    const total = quoteTotal(qt.lines);
    const m = moneySummary(total, qt.advance_pct, qt.paid);
    const expired = qt.status !== 'accepted' && qt.hold_until && qt.hold_until < todayPk();
    res.json({
      business: bizOut(qt.biz),
      clientName: qt.client_name,
      functionType: qt.function_type, date: qt.date, startTime: qt.start_time ? String(qt.start_time).slice(0, 5) : null, hours: qt.hours, venue: qt.venue,
      lines: qt.lines, note: qt.note, holdUntil: qt.hold_until, status: expired ? 'expired' : qt.status, bookingStatus: qt.booking_status,
      total, advancePct: qt.advance_pct, advanceDue: m.advanceDue, balanceAfterAdvance: total - m.advanceDue, paid: m.paid,
    });
  }),
);

publicRouter.post(
  '/q/:token/accept',
  ah(async (req, res) => {
    const qt = await one(`SELECT * FROM quotes WHERE token=$1`, [req.params.token]);
    if (!qt) throw notFound('This quote link is not valid');
    if (qt.status === 'accepted') return res.json({ ok: true });
    if (qt.hold_until && qt.hold_until < todayPk()) throw bad('This quote has expired. Please message the vendor.', 'expired');
    const bk = await one(`SELECT id, date, business_id FROM bookings WHERE id=$1`, [qt.booking_id]);
    const c = await clashCheck(bk!.business_id, bk!.date, bk!.id);
    if (c.full) throw new HttpError(409, 'Sorry, this date has just been booked. Please message the vendor.', 'date_full');
    await q(`UPDATE quotes SET status='accepted' WHERE id=$1`, [qt.id]);
    // Spec: Total = sum of quote lines once accepted
    await q(`UPDATE bookings SET total=$2, advance_pct=$3, updated_at=now() WHERE id=$1`, [qt.booking_id, Math.max(0, quoteTotal(qt.lines)), qt.advance_pct]);
    res.json({ ok: true });
  }),
);

publicRouter.get(
  '/r/:token',
  ah(async (req, res) => {
    const p = await one(
      `SELECT p.*, bk.function_type, bk.date, bk.start_time, bk.hours, bk.venue, bk.total, bk.advance_pct, bk.status AS booking_status, c.name AS client_name, s.name AS service_name,
              row_to_json(b.*) AS biz
         FROM payments p JOIN bookings bk ON bk.id=p.booking_id JOIN clients c ON c.id=bk.client_id JOIN businesses b ON b.id=p.business_id
         LEFT JOIN services s ON s.id=bk.service_id
        WHERE p.receipt_token=$1`,
      [req.params.token],
    );
    if (!p) throw notFound('This receipt link is not valid');
    const all = (await q(`SELECT amount, received_on, method, receipt_no FROM payments WHERE booking_id=$1 ORDER BY received_on, created_at`, [p.booking_id])).rows;
    const paid = all.reduce((s, x) => s + x.amount, 0);
    const m = moneySummary(p.total, p.advance_pct, paid);
    res.json({
      business: bizOut(p.biz),
      receiptNo: p.receipt_no, amount: p.amount, receivedOn: p.received_on, method: p.method, note: p.note,
      clientName: p.client_name, functionType: p.function_type, date: p.date, startTime: p.start_time ? String(p.start_time).slice(0, 5) : null, hours: p.hours,
      venue: p.venue, serviceName: p.service_name, bookingStatus: p.booking_status,
      payments: all.map((x) => ({ amount: x.amount, receivedOn: x.received_on, method: x.method, receiptNo: x.receipt_no })),
      total: m.total, paid: m.paid, balance: m.balance, fullyPaid: m.fullyPaid,
    });
  }),
);
