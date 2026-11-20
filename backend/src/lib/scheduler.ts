import { q } from '../db/index.js';
import { addDays, pkParts } from './dates.js';
import { emails } from './email.js';
import { moneySummary } from './money.js';

/**
 * One job every 15 minutes finds due sends in Asia/Karachi time (spec: Automatic email).
 * Safe to run any number of times: email_log stops duplicates.
 */
export async function runScheduledJobs(at = new Date()) {
  const now = pkParts(at);
  const today = now.date;
  const minutes = now.hour * 60 + now.minute;
  const done: string[] = [];

  // Completed: the day after the event, a Confirmed booking with zero balance moves to Completed
  const toComplete = (await q(
    `SELECT id, total, advance_pct, COALESCE((SELECT SUM(amount) FROM payments p WHERE p.booking_id=bk.id),0)::int AS paid
       FROM bookings bk WHERE status='confirmed' AND date < $1`,
    [today],
  )).rows;
  for (const b of toComplete) {
    if (moneySummary(b.total, b.advance_pct, b.paid).balance === 0) {
      await q(`UPDATE bookings SET status='completed', updated_at=now() WHERE id=$1 AND status='confirmed'`, [b.id]);
      done.push(`completed ${b.id}`);
    }
  }

  // Expire quotes whose hold has passed
  await q(`UPDATE quotes SET status='expired' WHERE status IN ('draft','sent') AND hold_until IS NOT NULL AND hold_until < $1`, [today]);

  // Reminder 2 days before, from 10:00 am
  if (minutes >= 10 * 60) {
    const rows = (await q(`SELECT id FROM bookings WHERE status='confirmed' AND date=$1`, [addDays(today, 2)])).rows;
    for (const r of rows) { await emails.eventReminder(r.id); done.push(`reminder ${r.id}`); }
  }
  // Advance still missing: 3 days before an event still in Inquiry (to vendor), from 9:00 am
  if (minutes >= 9 * 60) {
    const rows = (await q(`SELECT id FROM bookings WHERE status='inquiry' AND date=$1`, [addDays(today, 3)])).rows;
    for (const r of rows) { await emails.advanceMissing(r.id); done.push(`advance_missing ${r.id}`); }
  }
  // Tomorrow at a glance: 8:00 pm the day before any event (to vendor)
  if (minutes >= 20 * 60) {
    const rows = (await q(`SELECT DISTINCT business_id FROM bookings WHERE status <> 'cancelled' AND date=$1`, [addDays(today, 1)])).rows;
    for (const r of rows) { await emails.tomorrowGlance(r.business_id, addDays(today, 1)); done.push(`glance ${r.business_id}`); }
  }
  // Thank you: day after, from 11:00 am (off by default per business)
  if (minutes >= 11 * 60) {
    const rows = (await q(`SELECT id FROM bookings WHERE status IN ('confirmed','completed') AND date=$1`, [addDays(today, -1)])).rows;
    for (const r of rows) await emails.thankYou(r.id);
  }
  return { at: `${today} ${now.time}`, actions: done.length };
}

export function startScheduler() {
  const tick = () => runScheduledJobs().catch((e) => console.error('[cron]', e));
  setTimeout(tick, 10_000);
  setInterval(tick, 15 * 60 * 1000);
}
