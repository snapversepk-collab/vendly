import type { Ctx } from '../auth.js';
import { one, q, type Queryable } from '../db/index.js';
import { todayPk } from './dates.js';
import { emails, later } from './email.js';
import { moneySummary } from './money.js';
import { DEFAULT_CHECKLIST, tradeByKey } from './templates.js';

/** Base SELECT for bookings with client, service, money and prep counts */
export const BOOKING_SELECT = `
  SELECT bk.*, c.name AS client_name, c.whatsapp AS client_whatsapp, c.email AS client_email,
         f.label AS family_label, s.name AS service_name, s.trade AS service_trade,
         COALESCE((SELECT SUM(amount) FROM payments p WHERE p.booking_id = bk.id),0)::int AS paid,
         (SELECT COUNT(*) FROM checklist_items ci WHERE ci.booking_id = bk.id)::int AS prep_total,
         (SELECT COUNT(*) FROM checklist_items ci WHERE ci.booking_id = bk.id AND ci.done)::int AS prep_done,
         (SELECT row_to_json(qq) FROM (SELECT id, status, token, hold_until, sent_at, lines, advance_pct FROM quotes qt WHERE qt.booking_id = bk.id ORDER BY created_at DESC LIMIT 1) qq) AS quote
    FROM bookings bk
    JOIN clients c ON c.id = bk.client_id
    LEFT JOIN families f ON f.id = bk.family_id
    LEFT JOIN services s ON s.id = bk.service_id`;

export function quoteTotal(lines: { amount: number }[] | undefined | null) {
  return (lines ?? []).reduce((s, l) => s + Number(l.amount || 0), 0);
}

/** Shape a booking row for the API. Staff never get money fields. */
export function present(row: any, ctx: Ctx) {
  const m = moneySummary(row.total, row.advance_pct, row.paid ?? 0);
  const out: any = {
    id: row.id,
    familyId: row.family_id,
    familyLabel: row.family_label,
    client: { id: row.client_id, name: row.client_name, whatsapp: row.client_whatsapp, email: row.client_email },
    functionType: row.function_type,
    date: row.date,
    startTime: row.start_time ? String(row.start_time).slice(0, 5) : null,
    hours: row.hours,
    serviceId: row.service_id,
    serviceName: row.service_name,
    venue: row.venue,
    city: row.city,
    status: row.status,
    notes: row.notes,
    source: row.source,
    assignedUserIds: row.assigned_user_ids ?? [],
    prep: { done: row.prep_done ?? 0, total: row.prep_total ?? 0 },
    createdAt: row.created_at,
  };
  if (ctx.role !== 'staff') {
    out.money = { ...m, advancePct: row.advance_pct };
    out.quote = row.quote
      ? { id: row.quote.id, status: row.quote.status, token: row.quote.token, holdUntil: row.quote.hold_until, sentAt: row.quote.sent_at, total: quoteTotal(row.quote.lines) }
      : null;
  }
  return out;
}

/** Bookings that count toward capacity on a date: non-cancelled, and pencilled-in
 *  inquiries only while their quote hold has not passed. */
export async function clashCheck(businessId: string, date: string, excludeId?: string | null, db: Queryable = { query: q }) {
  const biz = (await db.query(`SELECT capacity_per_date FROM businesses WHERE id=$1`, [businessId])).rows[0];
  const rows = (
    await db.query(
      `SELECT bk.id, bk.status, bk.function_type, c.name AS client_name,
              (SELECT hold_until FROM quotes qt WHERE qt.booking_id = bk.id ORDER BY created_at DESC LIMIT 1) AS hold_until
         FROM bookings bk JOIN clients c ON c.id = bk.client_id
        WHERE bk.business_id=$1 AND bk.date=$2 AND bk.status <> 'cancelled' AND ($3::uuid IS NULL OR bk.id <> $3::uuid)`,
      [businessId, date, excludeId ?? null],
    )
  ).rows;
  const today = todayPk();
  const counting = rows.filter((r: any) => r.status !== 'inquiry' || !r.hold_until || r.hold_until >= today);
  const capacity = biz?.capacity_per_date ?? 1;
  return {
    date,
    capacity,
    count: counting.length,
    full: counting.length >= capacity,
    bookings: counting.map((r: any) => ({ id: r.id, status: r.status, functionType: r.function_type, clientName: r.client_name })),
  };
}

/** Copy the checklist template for a booking's trade into checklist_items */
export async function seedChecklist(db: Queryable, businessId: string, bookingId: string, trade: string | null) {
  let items: any[] | undefined;
  if (trade) {
    const t = (await db.query(`SELECT items FROM checklist_templates WHERE business_id=$1 AND trade=$2`, [businessId, trade])).rows[0];
    items = t?.items ?? tradeByKey(trade)?.checklist;
  }
  if (!items) {
    const t = (await db.query(`SELECT items FROM checklist_templates WHERE business_id=$1 ORDER BY trade LIMIT 1`, [businessId])).rows[0];
    items = t?.items ?? DEFAULT_CHECKLIST;
  }
  let i = 0;
  for (const it of items!) {
    await db.query(`INSERT INTO checklist_items (business_id, booking_id, label, phase, auto, sort) VALUES ($1,$2,$3,$4,$5,$6)`, [
      businessId, bookingId, it.label, it.phase ?? 'Before', it.auto ?? null, i++,
    ]);
  }
}

/** After any payment change: tick/untick automatic checklist items. */
export async function syncAutoChecklist(db: Queryable, bookingId: string) {
  const bk = (await db.query(`SELECT total, advance_pct, COALESCE((SELECT SUM(amount) FROM payments WHERE booking_id=$1),0)::int AS paid FROM bookings WHERE id=$1`, [bookingId])).rows[0];
  if (!bk) return;
  const m = moneySummary(bk.total, bk.advance_pct, bk.paid);
  await db.query(`UPDATE checklist_items SET done=$2 WHERE booking_id=$1 AND auto='advance'`, [bookingId, m.advancePaid && m.paid > 0]);
  await db.query(`UPDATE checklist_items SET done=$2 WHERE booking_id=$1 AND auto='balance'`, [bookingId, m.fullyPaid]);
}

/** Status change with side effects (confirmation email). */
export async function setStatus(businessId: string, bookingId: string, status: string) {
  const prev = await one(`SELECT status FROM bookings WHERE id=$1 AND business_id=$2`, [bookingId, businessId]);
  if (!prev) return null;
  await q(`UPDATE bookings SET status=$3, updated_at=now() WHERE id=$1 AND business_id=$2`, [bookingId, businessId, status]);
  if (status === 'confirmed' && prev.status !== 'confirmed') later(emails.bookingConfirmed(bookingId));
  return status;
}

export async function nextReceiptNo(db: Queryable, businessId: string) {
  const r = (await db.query(`UPDATE businesses SET receipt_seq = receipt_seq + 1 WHERE id=$1 RETURNING receipt_seq, receipt_prefix`, [businessId])).rows[0];
  return `${r.receipt_prefix}-${String(r.receipt_seq).padStart(4, '0')}`;
}

/** Plan limit: Free plan can create N bookings per calendar month (by created_at in PKT) */
export async function bookingsThisMonth(businessId: string) {
  const ym = todayPk().slice(0, 7);
  const r = await one(
    `SELECT COUNT(*)::int AS n FROM bookings WHERE business_id=$1 AND to_char(created_at AT TIME ZONE 'Asia/Karachi','YYYY-MM')=$2`,
    [businessId, ym],
  );
  return r?.n ?? 0;
}
