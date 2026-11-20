import { Router } from 'express';
import { z } from 'zod';
import { allow, canSeeMoney } from '../auth.js';
import { one, q } from '../db/index.js';
import { BOOKING_SELECT, clashCheck, present } from '../lib/bookings.js';
import { addDays, monthRange, pkParts, periodRange, todayPk } from '../lib/dates.js';
import { moneySummary } from '../lib/money.js';
import { ah } from '../lib/util.js';

export const dashboardRouter = Router();

/** Everything the Today screen needs in one call */
dashboardRouter.get(
  '/today',
  ah(async (req, res) => {
    const ctx = req.ctx;
    const now = pkParts();
    const today = now.date;
    const staff = ctx.role === 'staff';
    const scope = staff ? ` AND $2::uuid = ANY(bk.assigned_user_ids)` : ` AND $2::uuid IS NOT NULL`;
    const base = [ctx.businessId, ctx.userId];
    const biz = await one(`SELECT capacity_per_date, handle, setup_done FROM businesses WHERE id=$1`, [ctx.businessId]);

    // Next 14 dates
    const end14 = addDays(today, 13);
    const upcoming = (await q(`${BOOKING_SELECT} WHERE bk.business_id=$1 ${scope} AND bk.date BETWEEN $3 AND $4 AND bk.status <> 'cancelled' ORDER BY bk.date, bk.start_time NULLS LAST`, [...base, today, addDays(today, 60)])).rows.map((r) => present(r, ctx));
    const dates = [];
    for (let i = 0; i < 14; i++) {
      const d = addDays(today, i);
      const onDay = upcoming.filter((b) => b.date === d);
      const c = staff ? null : await clashCheck(ctx.businessId, d);
      dates.push({ date: d, bookings: onDay, full: c ? c.full : onDay.length > 0, capacity: biz!.capacity_per_date });
    }

    // Next event: today's first not-yet-finished event, else the next one
    const nowHm = now.time;
    const next =
      upcoming.find((b) => b.date === today && (!b.startTime || endsAfter(b.startTime, b.hours, nowHm))) ??
      upcoming.find((b) => b.date > today) ??
      null;
    let nextDetail = null;
    if (next) {
      const open = (await q(`SELECT label FROM checklist_items WHERE booking_id=$1 AND NOT done ORDER BY sort LIMIT 3`, [next.id])).rows.map((r) => r.label);
      nextDetail = { ...next, openItems: open };
    }

    // Month money (spec: booked/collected/due in 7 days)
    let month = null;
    if (canSeeMoney(ctx)) {
      const { from, to } = monthRange(today.slice(0, 7));
      const mrows = (await q(`${BOOKING_SELECT} WHERE bk.business_id=$1 ${scope} AND bk.date BETWEEN $3 AND $4 AND bk.status <> 'cancelled'`, [...base, from, to])).rows;
      const booked = mrows.reduce((s, r) => s + r.total, 0);
      const collected = mrows.reduce((s, r) => s + r.paid, 0);
      const week = upcoming.filter((b) => b.date <= addDays(today, 6));
      const due7 = week.reduce((s, b) => s + b.money.balance, 0);
      month = {
        from, to, events: mrows.length, ahead: mrows.filter((r) => r.date >= today).length,
        booked, collected, outstanding: Math.max(0, booked - collected), dueIn7: due7,
      };
    }

    // Needs you
    const needs: any[] = [];
    if (!staff) {
      const newInq = (await q(`SELECT id, client_name, date, function_type, created_at FROM inquiries WHERE business_id=$1 AND status='new' ORDER BY created_at DESC LIMIT 5`, [ctx.businessId])).rows;
      for (const i of newInq) needs.push({ kind: 'inquiry', level: 'soon', inquiryId: i.id, what: `${i.client_name} asked about ${i.date}`, date: i.date, functionType: i.function_type, act: 'Reply' });
      for (const b of upcoming) {
        const days = Math.round((Date.parse(b.date) - Date.parse(today)) / 86400000);
        if (b.status === 'inquiry' && b.money.paid < b.money.advanceDue && days <= 14) {
          needs.push({ kind: 'no_advance', level: days <= 3 ? 'urgent' : 'soon', bookingId: b.id, what: `No advance yet for ${b.client.name}`, date: b.date, functionType: b.functionType, amount: b.money.advanceDue, phone: b.client.whatsapp, act: 'Remind' });
        }
        if (b.status === 'confirmed' && b.money.balance > 0 && days <= 1) {
          needs.push({ kind: 'balance', level: 'soon', bookingId: b.id, what: `Collect ${b.client.name}'s balance`, date: b.date, functionType: b.functionType, amount: b.money.balance, act: 'Record' });
        }
        if (b.quote?.holdUntil && b.status === 'inquiry' && b.quote.holdUntil < today) {
          needs.push({ kind: 'hold_expired', level: 'soon', bookingId: b.id, what: `Hold on ${b.date} for ${b.client.name} has passed`, date: b.date, functionType: b.functionType, act: 'Open' });
        }
      }
      // Past events still Confirmed with money left (spec: stays and shows in Needs you)
      const overdue = (await q(`${BOOKING_SELECT} WHERE bk.business_id=$1 ${scope} AND bk.date < $3 AND bk.status='confirmed'`, [...base, today])).rows.map((r) => present(r, ctx));
      for (const b of overdue) if (b.money.balance > 0) needs.push({ kind: 'overdue', level: 'urgent', bookingId: b.id, what: `${b.client.name} still owes from ${b.date}`, date: b.date, functionType: b.functionType, amount: b.money.balance, phone: b.client.whatsapp, act: 'Record' });
    }
    // Unfinished prep for events in the next 2 days (everyone)
    for (const b of upcoming.filter((b) => b.date <= addDays(today, 1) && b.prep.done < b.prep.total)) {
      needs.push({ kind: 'prep', level: b.date === today ? 'urgent' : 'later', bookingId: b.id, what: `Prep for ${b.client.name}: ${b.prep.done} of ${b.prep.total} done`, date: b.date, functionType: b.functionType, act: 'Checklist' });
    }
    const rank = { urgent: 0, soon: 1, later: 2 } as Record<string, number>;
    needs.sort((a, b) => rank[a.level] - rank[b.level] || String(a.date).localeCompare(String(b.date)));

    const hasAny = staff ? upcoming.length > 0 : !!(await one(`SELECT 1 FROM bookings WHERE business_id=$1 LIMIT 1`, [ctx.businessId]));
    res.json({
      now: { date: today, time: nowHm },
      next: nextDetail,
      month,
      dates,
      needs,
      after: upcoming.filter((b) => b.id !== next?.id).slice(0, 6),
      firstDay: !hasAny,
      handle: biz!.handle,
      setupDone: biz!.setup_done,
    });
  }),
);

function endsAfter(start: string, hours: number | null, nowHm: string) {
  const [h, m] = start.split(':').map(Number);
  const end = h * 60 + m + Math.round((hours ?? 3) * 60);
  const [nh, nm] = nowHm.split(':').map(Number);
  return end > nh * 60 + nm;
}

/** Reports (owner + manager). Free/Pro get the four totals only. */
dashboardRouter.get(
  '/reports',
  allow('owner', 'manager'),
  ah(async (req, res) => {
    const f = z.object({ period: z.enum(['month', 'season', 'last12', 'custom']).default('season'), from: z.string().optional(), to: z.string().optional() }).parse(req.query);
    const { from, to } = periodRange(f.period, todayPk(), f.from, f.to);
    const rows = (await q(`${BOOKING_SELECT} WHERE bk.business_id=$1 AND bk.date BETWEEN $2 AND $3 AND bk.status <> 'cancelled'`, [req.ctx.businessId, from, to])).rows;
    const booked = rows.reduce((s, r) => s + r.total, 0);
    const collected = rows.reduce((s, r) => s + r.paid, 0);
    const totals = { booked, collected, stillToCollect: booked - collected, average: rows.length ? Math.round(booked / rows.length) : 0, count: rows.length };
    const full = req.ctx.plan === 'team';
    if (!full) return res.json({ period: { key: f.period, from, to }, totals, full: false });

    const byMonth = new Map<string, { booked: number; collected: number }>();
    for (let d = from.slice(0, 7); d <= to.slice(0, 7); ) {
      byMonth.set(d, { booked: 0, collected: 0 });
      const [y, m] = d.split('-').map(Number);
      d = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
    }
    const byFunction: Record<string, number> = {};
    const byService: Record<string, number> = {};
    const bySource: Record<string, number> = { booking_page: 0, manual: 0, import: 0 };
    for (const r of rows) {
      const k = r.date.slice(0, 7);
      const e = byMonth.get(k) ?? { booked: 0, collected: 0 };
      e.booked += r.total;
      e.collected += r.paid;
      byMonth.set(k, e);
      byFunction[r.function_type] = (byFunction[r.function_type] ?? 0) + 1;
      const sname = r.service_name ?? 'No service';
      byService[sname] = (byService[sname] ?? 0) + r.total;
      bySource[r.source] = (bySource[r.source] ?? 0) + 1;
    }
    const months = [...byMonth.entries()].map(([month, v]) => ({ month, ...v }));
    // Funnel: inquiries made in the period -> quoted -> confirmed
    const inq = (await q(
      `SELECT i.status, i.booking_id, bk.status AS booking_status,
              EXISTS (SELECT 1 FROM quotes qt WHERE qt.booking_id = i.booking_id AND qt.status <> 'draft') AS got_quote
         FROM inquiries i LEFT JOIN bookings bk ON bk.id = i.booking_id
        WHERE i.business_id=$1 AND (i.created_at AT TIME ZONE 'Asia/Karachi')::date BETWEEN $2 AND $3`,
      [req.ctx.businessId, from, to],
    )).rows;
    const funnel = {
      inquiries: inq.length,
      quoted: inq.filter((i) => i.got_quote || i.status === 'quoted').length,
      confirmed: inq.filter((i) => ['confirmed', 'completed'].includes(i.booking_status)).length,
    };
    // Headline: biggest month vs earlier months
    let headline: string | null = null;
    const withMoney = months.filter((m) => m.booked > 0);
    if (withMoney.length) {
      const top = withMoney.reduce((a, b) => (b.booked > a.booked ? b : a));
      const earlier = months.filter((m) => m.month < top.month);
      const earlierSum = earlier.reduce((s, m) => s + m.booked, 0);
      headline = JSON.stringify({ month: top.month, booked: top.booked, earlierMonths: earlier.map((m) => m.month), earlierBooked: earlierSum });
    }
    res.json({
      period: { key: f.period, from, to },
      totals,
      full: true,
      months,
      byFunction: Object.entries(byFunction).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count),
      byService: Object.entries(byService).map(([name, total]) => ({ name, total, share: booked ? total / booked : 0 })).sort((a, b) => b.total - a.total),
      funnel,
      bySource,
      headline: headline ? JSON.parse(headline) : null,
    });
  }),
);

/** Header badge counts */
dashboardRouter.get(
  '/counts',
  ah(async (req, res) => {
    if (req.ctx.role === 'staff') return res.json({ newInquiries: 0 });
    const r = await one(`SELECT COUNT(*)::int AS n FROM inquiries WHERE business_id=$1 AND status='new'`, [req.ctx.businessId]);
    res.json({ newInquiries: r!.n });
  }),
);

/** Global search (⌘K): clients, phones, venues */
dashboardRouter.get(
  '/search',
  ah(async (req, res) => {
    const term = String(req.query.q ?? '').trim();
    if (term.length < 2) return res.json([]);
    const digits = term.replace(/\D/g, '');
    const staff = req.ctx.role === 'staff';
    const rows = (await q(
      `${BOOKING_SELECT} WHERE bk.business_id=$1 ${staff ? 'AND $2::uuid = ANY(bk.assigned_user_ids)' : 'AND $2::uuid IS NOT NULL'}
         AND (lower(c.name) LIKE $3 OR lower(COALESCE(bk.venue,'')) LIKE $3 OR lower(COALESCE(f.label,'')) LIKE $3 ${digits.length >= 3 ? 'OR c.whatsapp LIKE $4' : 'OR $4::text IS NULL'})
       ORDER BY abs(bk.date - $5::date) LIMIT 12`,
      [req.ctx.businessId, req.ctx.userId, `%${term.toLowerCase()}%`, digits.length >= 3 ? `%${digits}%` : null, todayPk()],
    )).rows;
    res.json(rows.map((r) => present(r, req.ctx)));
  }),
);

export { moneySummary };
