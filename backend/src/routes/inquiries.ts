import { Router } from 'express';
import { z } from 'zod';
import { allow } from '../auth.js';
import { one, q } from '../db/index.js';
import { clashCheck } from '../lib/bookings.js';
import { addDays, fmtDate } from '../lib/dates.js';
import { NEXT_FUNCTION } from '../lib/templates.js';
import { ah, bad, fillTemplate, notFound, waLink } from '../lib/util.js';
import { createBooking } from './bookings.js';

export const inquiriesRouter = Router();
inquiriesRouter.use('/inquiries', allow('owner', 'manager'));

const out = (i: any) => ({
  id: i.id, clientName: i.client_name, whatsapp: i.whatsapp, email: i.email, functionType: i.function_type, date: i.date,
  serviceId: i.service_id, serviceName: i.service_name ?? null, serviceHours: i.service_hours ?? null, servicePrice: i.service_price ?? null,
  venue: i.venue, city: i.city, guests: i.guests, message: i.message, suggestedDates: i.suggested_dates ?? [], status: i.status,
  bookingId: i.booking_id, createdAt: i.created_at,
});

const SELECT = `SELECT i.*, s.name AS service_name, s.hours AS service_hours, s.price AS service_price FROM inquiries i LEFT JOIN services s ON s.id = i.service_id`;

inquiriesRouter.get(
  '/inquiries',
  ah(async (req, res) => {
    const { status } = z.object({ status: z.enum(['new', 'quoted', 'suggested', 'declined', 'all']).default('all') }).parse(req.query);
    const rows = (await q(`${SELECT} WHERE i.business_id=$1 ${status === 'all' ? 'AND $2::text IS NULL' : 'AND i.status=$2'} ORDER BY (i.status='new') DESC, i.created_at DESC LIMIT 200`, [req.ctx.businessId, status === 'all' ? null : status])).rows;
    res.json(rows.map(out));
  }),
);

inquiriesRouter.get(
  '/inquiries/:id',
  ah(async (req, res) => {
    const i = await one(`${SELECT} WHERE i.id=$1 AND i.business_id=$2`, [req.params.id, req.ctx.businessId]);
    if (!i) throw notFound();
    const clash = await clashCheck(req.ctx.businessId, i.date);
    // Nearby free dates for "Suggest another date"
    const free: string[] = [];
    for (let d = -7; d <= 21 && free.length < 8; d++) {
      const dt = addDays(i.date, d);
      if (d === 0) continue;
      if (dt < new Date().toISOString().slice(0, 10)) continue;
      if (!(await clashCheck(req.ctx.businessId, dt)).full) free.push(dt);
    }
    res.json({ ...out(i), clash, freeNearby: free.sort(), relatedFunction: NEXT_FUNCTION[i.function_type] ?? null });
  }),
);

/** Accept: pencil the date in as an Inquiry booking; frontend then opens the quote */
inquiriesRouter.post(
  '/inquiries/:id/accept',
  ah(async (req, res) => {
    const { overrideClash } = z.object({ overrideClash: z.boolean().default(false) }).parse(req.body ?? {});
    const i = await one(`${SELECT} WHERE i.id=$1 AND i.business_id=$2`, [req.params.id, req.ctx.businessId]);
    if (!i) throw notFound();
    if (i.booking_id) return res.json({ bookingId: i.booking_id });
    const bookingId = await createBooking(req, {
      client: { name: i.client_name, whatsapp: i.whatsapp, email: i.email ?? undefined },
      familyLabel: i.client_name,
      functionType: i.function_type,
      date: i.date,
      hours: i.service_hours ?? null,
      serviceId: i.service_id,
      venue: i.venue,
      city: i.city,
      total: i.service_price ?? 0,
      notes: i.message,
      assignedUserIds: [],
      overrideClash,
      allowPast: false,
      source: 'booking_page',
    });
    await q(`UPDATE inquiries SET booking_id=$2 WHERE id=$1`, [i.id, bookingId]);
    res.json({ bookingId });
  }),
);

async function waText(businessId: string, kind: string, vars: Record<string, string>) {
  const t = await one(`SELECT text FROM message_templates WHERE business_id=$1 AND kind=$2 AND channel='whatsapp'`, [businessId, kind]);
  return fillTemplate(t?.text ?? '', vars);
}

inquiriesRouter.post(
  '/inquiries/:id/suggest',
  ah(async (req, res) => {
    const { dates } = z.object({ dates: z.array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).min(1, 'Pick at least one date') }).parse(req.body);
    const i = await one(`UPDATE inquiries SET status='suggested', suggested_dates=$3 WHERE id=$1 AND business_id=$2 RETURNING *`, [req.params.id, req.ctx.businessId, dates]);
    if (!i) throw notFound();
    const text = await waText(req.ctx.businessId, 'suggest', { client: i.client_name.split(' ')[0], date: fmtDate(i.date), dates: dates.map((d) => fmtDate(d)).join(', '), function: i.function_type });
    res.json({ ok: true, text, whatsappUrl: waLink(i.whatsapp, text) });
  }),
);

inquiriesRouter.post(
  '/inquiries/:id/decline',
  ah(async (req, res) => {
    const i = await one(`UPDATE inquiries SET status='declined' WHERE id=$1 AND business_id=$2 RETURNING *`, [req.params.id, req.ctx.businessId]);
    if (!i) throw notFound();
    if (i.booking_id) await q(`UPDATE bookings SET status='cancelled' WHERE id=$1 AND status='inquiry'`, [i.booking_id]);
    const text = await waText(req.ctx.businessId, 'decline', { client: i.client_name.split(' ')[0], date: fmtDate(i.date), function: i.function_type });
    res.json({ ok: true, text, whatsappUrl: waLink(i.whatsapp, text) });
  }),
);

export { bad };
