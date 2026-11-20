import ExcelJS from 'exceljs';
import { Router, type Request } from 'express';
import { z } from 'zod';
import { allow, canSeeMoney } from '../auth.js';
import { config } from '../config.js';
import { one, q, tx } from '../db/index.js';
import {
  BOOKING_SELECT, bookingsThisMonth, clashCheck, nextReceiptNo, present, quoteTotal, seedChecklist, setStatus, syncAutoChecklist,
} from '../lib/bookings.js';
import { addDays, insideRescheduleWindow, todayPk } from '../lib/dates.js';
import { emails, later } from '../lib/email.js';
import { moneySummary, validatePayment } from '../lib/money.js';
import { FUNCTION_TYPES, NEXT_FUNCTION } from '../lib/templates.js';
import { HttpError, ah, bad, forbidden, notFound, token } from '../lib/util.js';
import { normPhone } from './auth.js';

export const bookingsRouter = Router();

const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD');
const timeStr = z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/, 'Use HH:MM');

/** WHERE fragment restricting staff to their assigned bookings */
function scope(req: Request, alias = 'bk') {
  return req.ctx.role === 'staff' ? ` AND $2::uuid = ANY(${alias}.assigned_user_ids)` : ` AND $2::uuid IS NOT NULL`;
}

async function loadOne(req: Request, idParam: string | string[]) {
  const id = String(idParam);
  const row = await one(`${BOOKING_SELECT} WHERE bk.id=$3 AND bk.business_id=$1 ${scope(req)}`, [req.ctx.businessId, req.ctx.userId, id]);
  if (!row) throw notFound('Booking not found');
  return row;
}

// ---------- List (Calendar, Agenda, search) ----------
bookingsRouter.get(
  '/bookings',
  ah(async (req, res) => {
    const f = z
      .object({
        from: dateStr.optional(),
        to: dateStr.optional(),
        scope: z.enum(['upcoming', 'past', 'all']).default('all'),
        status: z.enum(['inquiry', 'confirmed', 'completed', 'cancelled', 'active', 'due', 'any']).default('any'),
        q: z.string().optional(),
        familyId: z.string().uuid().optional(),
        limit: z.coerce.number().int().min(1).max(2000).default(500),
      })
      .parse(req.query);
    const vals: unknown[] = [req.ctx.businessId, req.ctx.userId];
    let where = `WHERE bk.business_id=$1 ${scope(req)}`;
    const today = todayPk();
    if (f.from) { vals.push(f.from); where += ` AND bk.date >= $${vals.length}`; }
    if (f.to) { vals.push(f.to); where += ` AND bk.date <= $${vals.length}`; }
    if (f.scope === 'upcoming') { vals.push(today); where += ` AND bk.date >= $${vals.length}`; }
    if (f.scope === 'past') { vals.push(today); where += ` AND bk.date < $${vals.length}`; }
    if (f.familyId) { vals.push(f.familyId); where += ` AND bk.family_id = $${vals.length}`; }
    if (['inquiry', 'confirmed', 'completed', 'cancelled'].includes(f.status)) { vals.push(f.status); where += ` AND bk.status = $${vals.length}`; }
    if (f.status === 'active' || f.status === 'due') where += ` AND bk.status <> 'cancelled'`;
    if (f.q?.trim()) {
      const needle = `%${f.q.trim().toLowerCase()}%`;
      const digits = f.q.replace(/\D/g, '');
      vals.push(needle);
      const n = vals.length;
      let cond = `lower(c.name) LIKE $${n} OR lower(COALESCE(bk.venue,'')) LIKE $${n} OR lower(COALESCE(f.label,'')) LIKE $${n}`;
      if (digits.length >= 3) { vals.push(`%${digits}%`); cond += ` OR c.whatsapp LIKE $${vals.length}`; }
      where += ` AND (${cond})`;
    }
    const order = f.scope === 'past' ? 'bk.date DESC, bk.start_time DESC NULLS LAST' : 'bk.date ASC, bk.start_time ASC NULLS LAST';
    vals.push(f.limit);
    let rows = (await q(`${BOOKING_SELECT} ${where} ORDER BY ${order} LIMIT $${vals.length}`, vals)).rows.map((r) => present(r, req.ctx));
    if (f.status === 'due') {
      if (!canSeeMoney(req.ctx)) throw forbidden();
      rows = rows.filter((r) => r.money.balance > 0);
    }
    res.json(rows);
  }),
);

bookingsRouter.get(
  '/bookings/clash',
  ah(async (req, res) => {
    const { date, excludeId } = z.object({ date: dateStr, excludeId: z.string().uuid().optional() }).parse(req.query);
    res.json(await clashCheck(req.ctx.businessId, date, excludeId));
  }),
);

/** Free dates helper: next N days with remaining capacity */
bookingsRouter.get(
  '/bookings/free-dates',
  ah(async (req, res) => {
    const { from, days } = z.object({ from: dateStr.optional(), days: z.coerce.number().int().min(1).max(120).default(30) }).parse(req.query);
    const start = from ?? todayPk();
    const out: string[] = [];
    for (let i = 0; i < days; i++) {
      const d = addDays(start, i);
      if (!(await clashCheck(req.ctx.businessId, d)).full) out.push(d);
    }
    res.json(out);
  }),
);

// ---------- Export to Excel ----------
bookingsRouter.get(
  '/bookings/export.xlsx',
  allow('owner', 'manager'),
  ah(async (req, res) => {
    const f = z.object({ from: dateStr.optional(), to: dateStr.optional(), scope: z.enum(['upcoming', 'past', 'all']).default('all') }).parse(req.query);
    const vals: unknown[] = [req.ctx.businessId];
    let where = `WHERE bk.business_id=$1`;
    if (f.from) { vals.push(f.from); where += ` AND bk.date >= $${vals.length}`; }
    if (f.to) { vals.push(f.to); where += ` AND bk.date <= $${vals.length}`; }
    if (f.scope === 'upcoming') { vals.push(todayPk()); where += ` AND bk.date >= $${vals.length}`; }
    if (f.scope === 'past') { vals.push(todayPk()); where += ` AND bk.date < $${vals.length}`; }
    const rows = (await q(`${BOOKING_SELECT} ${where} ORDER BY bk.date`, vals)).rows;
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Bookings');
    ws.columns = [
      { header: 'Date', key: 'date', width: 12 }, { header: 'Client', key: 'client', width: 24 }, { header: 'Phone', key: 'phone', width: 16 },
      { header: 'Function', key: 'fn', width: 12 }, { header: 'Service', key: 'service', width: 20 }, { header: 'Venue', key: 'venue', width: 30 },
      { header: 'Status', key: 'status', width: 12 }, { header: 'Total', key: 'total', width: 12 }, { header: 'Paid', key: 'paid', width: 12 },
      { header: 'Balance', key: 'balance', width: 12 },
    ];
    for (const r of rows) {
      const m = moneySummary(r.total, r.advance_pct, r.paid);
      ws.addRow({ date: r.date, client: r.client_name, phone: r.client_whatsapp, fn: r.function_type, service: r.service_name, venue: r.venue, status: r.status, total: m.total, paid: m.paid, balance: m.balance });
    }
    ws.getRow(1).font = { bold: true };
    ['total', 'paid', 'balance'].forEach((k) => (ws.getColumn(k).numFmt = '#,##0'));
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="bookings-${todayPk()}.xlsx"`);
    await wb.xlsx.write(res);
    res.end();
  }),
);

// ---------- Import (rows already parsed by the client from Excel/CSV) ----------
bookingsRouter.post(
  '/bookings/import',
  allow('owner', 'manager'),
  ah(async (req, res) => {
    const rows = z
      .array(z.object({ date: dateStr, clientName: z.string().min(1), whatsapp: z.string().optional(), functionType: z.string().default('Other'), venue: z.string().optional(), total: z.coerce.number().int().min(0).default(0), paid: z.coerce.number().int().min(0).default(0), startTime: timeStr.optional() }))
      .max(1000)
      .parse(req.body.rows);
    const biz = await one(`SELECT advance_pct FROM businesses WHERE id=$1`, [req.ctx.businessId]);
    let n = 0;
    await tx(async (db) => {
      for (const r of rows) {
        const c = (await db.query(`INSERT INTO clients (business_id, name, whatsapp) VALUES ($1,$2,$3) RETURNING id`, [req.ctx.businessId, r.clientName, normPhone(r.whatsapp)])).rows[0];
        const paid = Math.min(r.paid, r.total || r.paid);
        const status = r.date < todayPk() ? 'completed' : paid > 0 ? 'confirmed' : 'inquiry';
        const bk = (await db.query(
          `INSERT INTO bookings (business_id, client_id, function_type, date, start_time, venue, status, total, advance_pct, source) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'import') RETURNING id`,
          [req.ctx.businessId, c.id, r.functionType, r.date, r.startTime ?? null, r.venue ?? null, status, r.total, biz!.advance_pct],
        )).rows[0];
        await seedChecklist(db, req.ctx.businessId, bk.id, null);
        if (paid > 0) {
          await db.query(`INSERT INTO payments (business_id, booking_id, amount, received_on, method, note, receipt_no, receipt_token, recorded_by) VALUES ($1,$2,$3,$4,'other','Imported',$5,$6,$7)`, [
            req.ctx.businessId, bk.id, paid, todayPk(), await nextReceiptNo(db, req.ctx.businessId), token(), req.ctx.userId,
          ]);
          await syncAutoChecklist(db, bk.id);
        }
        n++;
      }
    });
    res.json({ imported: n });
  }),
);

// ---------- Detail ----------
bookingsRouter.get(
  '/bookings/:id',
  ah(async (req, res) => {
    const row = await loadOne(req, req.params.id);
    const b = present(row, req.ctx);
    const biz = await one(`SELECT reschedule_notice_days, balance_due, handle, name, whatsapp FROM businesses WHERE id=$1`, [req.ctx.businessId]);
    const family = row.family_id
      ? (await q(`${BOOKING_SELECT} WHERE bk.business_id=$1 ${scope(req)} AND bk.family_id=$3 ORDER BY bk.date`, [req.ctx.businessId, req.ctx.userId, row.family_id])).rows.map((r) => present(r, req.ctx))
      : [b];
    const checklist = (await q(`SELECT id, label, phase, done, auto, sort FROM checklist_items WHERE booking_id=$1 ORDER BY sort, label`, [row.id])).rows;
    const assigned = row.assigned_user_ids?.length
      ? (await q(`SELECT id, name FROM users WHERE id = ANY($1::uuid[])`, [row.assigned_user_ids])).rows
      : [];
    const out: any = {
      ...b,
      family,
      checklist,
      assigned,
      insideRescheduleWindow: insideRescheduleWindow(row.date, biz!.reschedule_notice_days),
      rescheduleNoticeDays: biz!.reschedule_notice_days,
      balanceDue: biz!.balance_due,
    };
    if (canSeeMoney(req.ctx)) {
      out.payments = (
        await q(`SELECT p.id, p.amount, p.received_on, p.method, p.note, p.receipt_no, p.receipt_token, u.name AS recorded_by_name, p.created_at
                   FROM payments p LEFT JOIN users u ON u.id=p.recorded_by WHERE p.booking_id=$1 ORDER BY p.received_on, p.created_at`, [row.id])
      ).rows.map((p) => ({ id: p.id, amount: p.amount, receivedOn: p.received_on, method: p.method, note: p.note, receiptNo: p.receipt_no, receiptToken: p.receipt_token, recordedBy: p.recorded_by_name }));
      const qt = await one(`SELECT * FROM quotes WHERE booking_id=$1 ORDER BY created_at DESC LIMIT 1`, [row.id]);
      out.quote = qt ? { id: qt.id, lines: qt.lines, advancePct: qt.advance_pct, holdUntil: qt.hold_until, note: qt.note, token: qt.token, sentAt: qt.sent_at, status: qt.status, total: quoteTotal(qt.lines) } : null;
    }
    res.json(out);
  }),
);

// ---------- Create ----------
const createSchema = z.object({
  clientId: z.string().uuid().optional(),
  client: z.object({ name: z.string().trim().min(1, 'Enter the client name'), whatsapp: z.string().trim().optional(), email: z.string().trim().email().optional().or(z.literal('')) }).optional(),
  familyId: z.string().uuid().optional(),
  familyLabel: z.string().trim().optional(),
  functionType: z.string().min(1),
  date: dateStr,
  startTime: timeStr.optional().nullable(),
  hours: z.number().min(0).max(48).optional().nullable(),
  serviceId: z.string().uuid().optional().nullable(),
  venue: z.string().optional().nullable(),
  city: z.string().optional().nullable(),
  total: z.number().int().min(0).default(0),
  status: z.enum(['inquiry', 'confirmed']).optional(),
  notes: z.string().optional().nullable(),
  assignedUserIds: z.array(z.string().uuid()).default([]),
  advance: z.object({ amount: z.number().int().positive(), method: z.string(), receivedOn: dateStr.optional() }).optional().nullable(),
  overrideClash: z.boolean().default(false),
  allowPast: z.boolean().default(false),
  source: z.enum(['manual', 'booking_page', 'import']).default('manual'),
});

export async function createBooking(req: Request, input: z.infer<typeof createSchema>) {
  const ctx = req.ctx;
  if (ctx.plan === 'free' && (await bookingsThisMonth(ctx.businessId)) >= config.freeBookingsPerMonth) {
    throw new HttpError(402, `You've used all ${config.freeBookingsPerMonth} bookings on the Free plan this month.`, 'plan_limit');
  }
  if (!FUNCTION_TYPES.includes(input.functionType as any)) input.functionType = 'Other';
  if (input.date < todayPk() && !input.allowPast) throw bad('This date is in the past. Add it anyway?', 'past_date');
  if (input.advance && input.total > 0 && input.advance.amount > input.total) throw bad('The advance is more than the total', 'advance_over_total');
  if (!input.overrideClash) {
    const c = await clashCheck(ctx.businessId, input.date);
    if (c.full) throw new HttpError(409, `${input.date} is already full`, 'date_full', { clash: c });
  }
  const biz = await one(`SELECT advance_pct FROM businesses WHERE id=$1`, [ctx.businessId]);
  const id = await tx(async (db) => {
    let clientId = input.clientId;
    if (clientId) {
      const c = (await db.query(`SELECT id FROM clients WHERE id=$1 AND business_id=$2`, [clientId, ctx.businessId])).rows[0];
      if (!c) throw notFound('Client not found');
    } else {
      if (!input.client) throw bad('Enter the client name');
      clientId = (await db.query(`INSERT INTO clients (business_id, name, whatsapp, email) VALUES ($1,$2,$3,$4) RETURNING id`, [ctx.businessId, input.client.name, normPhone(input.client.whatsapp), input.client.email || null])).rows[0].id;
    }
    let familyId = input.familyId ?? null;
    if (familyId) {
      const f = (await db.query(`SELECT id FROM families WHERE id=$1 AND business_id=$2`, [familyId, ctx.businessId])).rows[0];
      if (!f) throw notFound('Family not found');
    } else {
      const label = input.familyLabel || input.client?.name || 'Family';
      familyId = (await db.query(`INSERT INTO families (business_id, client_id, label) VALUES ($1,$2,$3) RETURNING id`, [ctx.businessId, clientId, label])).rows[0].id;
    }
    let trade: string | null = null;
    if (input.serviceId) {
      const s = (await db.query(`SELECT trade FROM services WHERE id=$1 AND business_id=$2`, [input.serviceId, ctx.businessId])).rows[0];
      if (!s) throw notFound('Service not found');
      trade = s.trade;
    }
    const advPct = biz!.advance_pct;
    const bk = (await db.query(
      `INSERT INTO bookings (business_id, family_id, client_id, function_type, date, start_time, hours, service_id, venue, city, status, total, advance_pct, notes, source, assigned_user_ids)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'inquiry',$11,$12,$13,$14,$15) RETURNING id`,
      [ctx.businessId, familyId, clientId, input.functionType, input.date, input.startTime ?? null, input.hours ?? null, input.serviceId ?? null, input.venue ?? null, input.city ?? null, input.total, advPct, input.notes ?? null, input.source, input.assignedUserIds],
    )).rows[0];
    await seedChecklist(db, ctx.businessId, bk.id, trade);
    let status = 'inquiry';
    if (input.advance) {
      await db.query(
        `INSERT INTO payments (business_id, booking_id, amount, received_on, method, note, receipt_no, receipt_token, recorded_by) VALUES ($1,$2,$3,$4,$5,'Advance',$6,$7,$8)`,
        [ctx.businessId, bk.id, input.advance.amount, input.advance.receivedOn ?? todayPk(), input.advance.method, await nextReceiptNo(db, ctx.businessId), token(), ctx.userId],
      );
      await syncAutoChecklist(db, bk.id);
      if (input.advance.amount >= moneySummary(input.total, advPct, 0).advanceDue) status = 'confirmed';
    }
    if (input.status === 'confirmed') status = 'confirmed';
    if (status !== 'inquiry') await db.query(`UPDATE bookings SET status=$2 WHERE id=$1`, [bk.id, status]);
    return { id: bk.id as string, status };
  });
  if (id.status === 'confirmed') later(emails.bookingConfirmed(id.id));
  return id.id;
}

bookingsRouter.post(
  '/bookings',
  allow('owner', 'manager'),
  ah(async (req, res) => {
    const input = createSchema.parse(req.body);
    const id = await createBooking(req, input);
    res.status(201).json(present(await loadOne(req, id), req.ctx));
  }),
);

/** "Add another function": prefill for the next function of a family */
bookingsRouter.get(
  '/bookings/:id/next-function',
  allow('owner', 'manager'),
  ah(async (req, res) => {
    const row = await loadOne(req, req.params.id);
    res.json({
      clientId: row.client_id, client: { name: row.client_name, whatsapp: row.client_whatsapp, email: row.client_email },
      familyId: row.family_id, familyLabel: row.family_label, serviceId: row.service_id, venue: row.venue, city: row.city,
      startTime: row.start_time ? String(row.start_time).slice(0, 5) : null, hours: row.hours,
      functionType: NEXT_FUNCTION[row.function_type] ?? row.function_type,
      date: addDays(row.date, 1),
    });
  }),
);

// ---------- Update ----------
bookingsRouter.patch(
  '/bookings/:id',
  ah(async (req, res) => {
    const row = await loadOne(req, req.params.id);
    if (req.ctx.role === 'staff') {
      // staff may only add notes
      const { notes } = z.object({ notes: z.string().nullable() }).strict().parse(req.body);
      await q(`UPDATE bookings SET notes=$3, updated_at=now() WHERE id=$1 AND business_id=$2`, [row.id, req.ctx.businessId, notes]);
      return res.json(present(await loadOne(req, row.id), req.ctx));
    }
    const b = z
      .object({
        functionType: z.string().optional(), date: dateStr.optional(), startTime: timeStr.nullable().optional(), hours: z.number().nullable().optional(),
        serviceId: z.string().uuid().nullable().optional(), venue: z.string().nullable().optional(), city: z.string().nullable().optional(),
        total: z.number().int().min(0).optional(), notes: z.string().nullable().optional(), assignedUserIds: z.array(z.string().uuid()).optional(),
        familyLabel: z.string().optional(),
        client: z.object({ name: z.string().min(1).optional(), whatsapp: z.string().optional(), email: z.string().email().or(z.literal('')).optional() }).optional(),
        confirmReschedule: z.boolean().default(false), overrideClash: z.boolean().default(false),
      })
      .parse(req.body);
    if (b.date && b.date !== row.date) {
      const biz = await one(`SELECT reschedule_notice_days FROM businesses WHERE id=$1`, [req.ctx.businessId]);
      if (insideRescheduleWindow(row.date, biz!.reschedule_notice_days) && !b.confirmReschedule) {
        throw new HttpError(409, `This is inside the ${biz!.reschedule_notice_days}-day window. Move the date anyway?`, 'reschedule_window');
      }
      if (!b.overrideClash) {
        const c = await clashCheck(req.ctx.businessId, b.date, row.id);
        if (c.full) throw new HttpError(409, `${b.date} is already full`, 'date_full', { clash: c });
      }
    }
    const paid = row.paid ?? 0;
    if (b.total !== undefined && b.total < paid) throw bad('The total cannot be less than what has been paid', 'total_below_paid');
    const n = {
      function_type: b.functionType ?? row.function_type, date: b.date ?? row.date,
      start_time: b.startTime !== undefined ? b.startTime : row.start_time, hours: b.hours !== undefined ? b.hours : row.hours,
      service_id: b.serviceId !== undefined ? b.serviceId : row.service_id, venue: b.venue !== undefined ? b.venue : row.venue,
      city: b.city !== undefined ? b.city : row.city, total: b.total ?? row.total, notes: b.notes !== undefined ? b.notes : row.notes,
      assigned: b.assignedUserIds ?? row.assigned_user_ids,
    };
    await tx(async (db) => {
      await db.query(
        `UPDATE bookings SET function_type=$3, date=$4, start_time=$5, hours=$6, service_id=$7, venue=$8, city=$9, total=$10, notes=$11, assigned_user_ids=$12, updated_at=now() WHERE id=$1 AND business_id=$2`,
        [row.id, req.ctx.businessId, n.function_type, n.date, n.start_time, n.hours, n.service_id, n.venue, n.city, n.total, n.notes, n.assigned],
      );
      if (b.client) {
        await db.query(`UPDATE clients SET name=COALESCE($3,name), whatsapp=COALESCE($4,whatsapp), email=CASE WHEN $5::text IS NULL THEN email WHEN $5='' THEN NULL ELSE $5 END WHERE id=$1 AND business_id=$2`, [
          row.client_id, req.ctx.businessId, b.client.name ?? null, b.client.whatsapp !== undefined ? normPhone(b.client.whatsapp) : null, b.client.email ?? null,
        ]);
      }
      if (b.familyLabel && row.family_id) await db.query(`UPDATE families SET label=$3 WHERE id=$1 AND business_id=$2`, [row.family_id, req.ctx.businessId, b.familyLabel]);
      await syncAutoChecklist(db, row.id);
    });
    res.json(present(await loadOne(req, row.id), req.ctx));
  }),
);

bookingsRouter.post(
  '/bookings/:id/status',
  allow('owner', 'manager'),
  ah(async (req, res) => {
    const { status } = z.object({ status: z.enum(['inquiry', 'confirmed', 'completed', 'cancelled']) }).parse(req.body);
    const row = await loadOne(req, req.params.id);
    if (status === 'completed' && moneySummary(row.total, row.advance_pct, row.paid).balance > 0) {
      throw bad('There is still a balance to collect. Record it first.', 'balance_left');
    }
    await setStatus(req.ctx.businessId, row.id, status);
    res.json(present(await loadOne(req, row.id), req.ctx));
  }),
);

bookingsRouter.delete(
  '/bookings/:id',
  allow('owner', 'manager'),
  ah(async (req, res) => {
    const row = await loadOne(req, req.params.id);
    await q(`DELETE FROM bookings WHERE id=$1 AND business_id=$2`, [row.id, req.ctx.businessId]);
    if (row.family_id) await q(`DELETE FROM families f WHERE f.id=$1 AND NOT EXISTS (SELECT 1 FROM bookings WHERE family_id=f.id)`, [row.family_id]);
    res.json({ ok: true });
  }),
);

// ---------- Payments ----------
bookingsRouter.post(
  '/bookings/:id/payments',
  allow('owner', 'manager'),
  ah(async (req, res) => {
    const b = z.object({ amount: z.number().int(), receivedOn: dateStr.optional(), method: z.string().min(1), note: z.string().optional().nullable() }).parse(req.body);
    const row = await loadOne(req, req.params.id);
    const err = validatePayment(b.amount, row.total, row.paid);
    if (err) throw bad(err, 'payment_over_balance');
    const pay = await tx(async (db) => {
      const p = (await db.query(
        `INSERT INTO payments (business_id, booking_id, amount, received_on, method, note, receipt_no, receipt_token, recorded_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
        [req.ctx.businessId, row.id, b.amount, b.receivedOn ?? todayPk(), b.method, b.note ?? null, await nextReceiptNo(db, req.ctx.businessId), token(), req.ctx.userId],
      )).rows[0];
      await syncAutoChecklist(db, row.id);
      return p;
    });
    later(emails.paymentReceived(pay.id));
    const m = moneySummary(row.total, row.advance_pct, row.paid + b.amount);
    res.status(201).json({
      payment: { id: pay.id, amount: pay.amount, receivedOn: pay.received_on, method: pay.method, note: pay.note, receiptNo: pay.receipt_no, receiptToken: pay.receipt_token },
      money: m,
      // Spec: paid >= advance on an Inquiry offers to mark it Confirmed
      offerConfirm: row.status === 'inquiry' && m.advancePaid,
    });
  }),
);

bookingsRouter.delete(
  '/payments/:id',
  allow('owner', 'manager'),
  ah(async (req, res) => {
    const p = await one(`DELETE FROM payments WHERE id=$1 AND business_id=$2 RETURNING booking_id`, [req.params.id, req.ctx.businessId]);
    if (!p) throw notFound();
    await syncAutoChecklist({ query: q }, p.booking_id);
    res.json({ ok: true });
  }),
);

// ---------- Checklist ----------
bookingsRouter.patch(
  '/checklist-items/:id',
  ah(async (req, res) => {
    const b = z.object({ done: z.boolean().optional(), label: z.string().min(1).optional() }).parse(req.body);
    const item = await one(`SELECT ci.*, bk.assigned_user_ids FROM checklist_items ci JOIN bookings bk ON bk.id=ci.booking_id WHERE ci.id=$1 AND ci.business_id=$2`, [req.params.id, req.ctx.businessId]);
    if (!item) throw notFound();
    if (req.ctx.role === 'staff' && (!item.assigned_user_ids.includes(req.ctx.userId) || b.label)) throw forbidden();
    if (item.auto && b.done !== undefined) throw bad('This item ticks itself from payments', 'auto_item');
    const r = await one(`UPDATE checklist_items SET done=COALESCE($3,done), label=COALESCE($4,label) WHERE id=$1 AND business_id=$2 RETURNING id, label, phase, done, auto, sort`, [
      req.params.id, req.ctx.businessId, b.done ?? null, b.label ?? null,
    ]);
    res.json(r);
  }),
);
bookingsRouter.post(
  '/bookings/:id/checklist',
  allow('owner', 'manager'),
  ah(async (req, res) => {
    const b = z.object({ label: z.string().trim().min(1), phase: z.string().default('Before') }).parse(req.body);
    const row = await loadOne(req, req.params.id);
    const r = await one(
      `INSERT INTO checklist_items (business_id, booking_id, label, phase, sort) VALUES ($1,$2,$3,$4,(SELECT COALESCE(MAX(sort),0)+1 FROM checklist_items WHERE booking_id=$2)) RETURNING id, label, phase, done, auto, sort`,
      [req.ctx.businessId, row.id, b.label, b.phase],
    );
    res.status(201).json(r);
  }),
);
bookingsRouter.delete(
  '/checklist-items/:id',
  allow('owner', 'manager'),
  ah(async (req, res) => {
    await q(`DELETE FROM checklist_items WHERE id=$1 AND business_id=$2 AND auto IS NULL`, [req.params.id, req.ctx.businessId]);
    res.json({ ok: true });
  }),
);

// ---------- Quotes ----------
const quoteSchema = z.object({
  lines: z.array(z.object({ name: z.string().trim().min(1), amount: z.number().int() })).min(1, 'Add at least one item'),
  advancePct: z.number().int().min(0).max(100),
  holdUntil: dateStr.nullable().optional(),
  note: z.string().max(2000).nullable().optional(),
});

bookingsRouter.put(
  '/bookings/:id/quote',
  allow('owner', 'manager'),
  ah(async (req, res) => {
    const b = quoteSchema.parse(req.body);
    const row = await loadOne(req, req.params.id);
    if (quoteTotal(b.lines) < 0) throw bad('The total cannot be below zero');
    const cur = await one(`SELECT id, status FROM quotes WHERE booking_id=$1 AND status IN ('draft','sent') ORDER BY created_at DESC LIMIT 1`, [row.id]);
    const qt = cur
      ? await one(`UPDATE quotes SET lines=$2, advance_pct=$3, hold_until=$4, note=$5 WHERE id=$1 RETURNING *`, [cur.id, JSON.stringify(b.lines), b.advancePct, b.holdUntil ?? null, b.note ?? null])
      : await one(`INSERT INTO quotes (business_id, booking_id, lines, advance_pct, hold_until, note, token) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`, [
          req.ctx.businessId, row.id, JSON.stringify(b.lines), b.advancePct, b.holdUntil ?? null, b.note ?? null, token(),
        ]);
    // Quote terms flow onto the booking while it is still an inquiry
    if (row.status === 'inquiry') await q(`UPDATE bookings SET total=$2, advance_pct=$3 WHERE id=$1`, [row.id, Math.max(0, quoteTotal(b.lines)), b.advancePct]);
    res.json({ id: qt!.id, token: qt!.token, status: qt!.status, total: quoteTotal(b.lines), link: `${config.publicUrl}/q/${qt!.token}` });
  }),
);

bookingsRouter.post(
  '/quotes/:id/send',
  allow('owner', 'manager'),
  ah(async (req, res) => {
    const { channel } = z.object({ channel: z.enum(['whatsapp', 'email', 'link']).default('whatsapp') }).parse(req.body ?? {});
    const qt = await one(`SELECT qt.*, bk.id AS bid FROM quotes qt JOIN bookings bk ON bk.id=qt.booking_id WHERE qt.id=$1 AND qt.business_id=$2`, [req.params.id, req.ctx.businessId]);
    if (!qt) throw notFound();
    await q(`UPDATE quotes SET status = CASE WHEN status='draft' THEN 'sent' ELSE status END, sent_at=COALESCE(sent_at, now()) WHERE id=$1`, [qt.id]);
    await q(`UPDATE inquiries SET status='quoted' WHERE booking_id=$1 AND status='new'`, [qt.bid]);
    if (channel === 'email') {
      const bk = await one(`SELECT c.email, c.name, bk.function_type, bk.date, row_to_json(b.*) AS biz FROM bookings bk JOIN clients c ON c.id=bk.client_id JOIN businesses b ON b.id=bk.business_id WHERE bk.id=$1`, [qt.bid]);
      if (!bk?.email) throw bad("Add the client's email address first", 'no_email');
      const { sendEmail } = await import('../lib/email.js');
      const total = quoteTotal(qt.lines);
      await sendEmail({
        to: bk.email, replyTo: bk.biz.email, fromName: bk.biz.name, subject: `Your quote from ${bk.biz.name}`,
        html: `<p>Assalam o Alaikum ${bk.name.split(' ')[0]},</p><p>Your quote for the ${bk.function_type} is Rs ${total.toLocaleString('en-IN')}.</p><p><a href="${config.publicUrl}/q/${qt.token}">View your quote</a></p>`,
      });
    }
    res.json({ ok: true, link: `${config.publicUrl}/q/${qt.token}` });
  }),
);
