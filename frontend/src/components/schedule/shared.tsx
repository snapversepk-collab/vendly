// Small helpers shared by Today, Calendar, Agenda and Reports.
import type { CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import { DOW, daysBetween, fmtShort, fnColor, rs, weekday } from '../../lib/format';
import type { Booking } from '../../lib/types';

/** Soft background tint of a function colour (used for confirmed chips in the month grid). */
export const fnTint = (fn?: string | null, pct = 16) => `color-mix(in srgb, ${fnColor(fn)} ${pct}%, var(--surface))`;

/** Client / family label shown on rows and tiles */
export const who = (b: Booking) => b.familyLabel || b.client.name;

/** "Signature booth, 3 h" */
export function serviceLabel(b: Booking, long = false) {
  if (!b.serviceName) return b.hours ? `${b.hours} ${long ? (b.hours === 1 ? 'hour' : 'hours') : 'h'}` : '';
  return b.hours ? `${b.serviceName}, ${b.hours} ${long ? (b.hours === 1 ? 'hour' : 'hours') : 'h'}` : b.serviceName;
}

/** "Shalimar Marquee, Rawalpindi" */
export const placeLabel = (b: Booking) => [b.venue, b.city].filter(Boolean).join(', ');

/** Google Maps search link for a venue */
export const mapsLink = (b: Booking) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(placeLabel(b))}`;

/** "In 9 days", "Today", "Tomorrow", "3 days ago" */
export function daysAway(date: string, ref: string) {
  const n = daysBetween(ref, date);
  if (n === 0) return 'Today';
  if (n === 1) return 'Tomorrow';
  if (n === -1) return 'Yesterday';
  return n > 0 ? `In ${n} days` : `${-n} days ago`;
}

const WORDS = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve'];
export const numWord = (n: number) => WORDS[n] ?? String(n);

/** Join a list as "a, b and c" */
export function andList(items: string[]) {
  if (items.length <= 1) return items[0] ?? '';
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

/** "Mon 23, Wed 25 and Mon 30 Nov" (month written once per month group) */
export function datesList(dates: string[]) {
  const out: string[] = [];
  dates.forEach((d, i) => {
    const day = `${DOW[weekday(d)]} ${Number(d.slice(8, 10))}`;
    const nextSameMonth = dates[i + 1]?.slice(0, 7) === d.slice(0, 7);
    out.push(nextSameMonth ? day : fmtShort(d));
  });
  return andList(out);
}

/**
 * One money line per booking (spec, Agenda): confirmed with balance → "Rs X due" ("due tonight" on the day);
 * fully paid → "Paid in full"; inquiry with a quote → "Quoted Rs X"; inquiry without → "No advance yet".
 */
export function moneyLine(b: Booking, today: string): { text: string; color: string } | null {
  const m = b.money;
  if (!m) return null;
  if (b.status === 'cancelled') return m.paid > 0 ? { text: `${rs(m.paid)} paid`, color: 'var(--ink-3)' } : null;
  if (m.total > 0 && m.balance <= 0) return { text: 'Paid in full', color: 'var(--accent)' };
  if (b.status === 'inquiry') {
    if (m.paid < m.advanceDue || m.paid === 0) {
      const quoted = b.quote && b.quote.status !== 'draft';
      if (quoted) return { text: `Quoted ${rs(b.quote!.total || m.total)}`, color: 'var(--amber)' };
      return { text: 'No advance yet', color: 'var(--amber)' };
    }
  }
  if (m.total === 0) return { text: 'No price yet', color: 'var(--ink-3)' };
  if (b.date === today) return { text: `${rs(m.balance)} due tonight`, color: 'var(--ink)' };
  if (b.date < today) return { text: `${rs(m.balance)} overdue`, color: 'var(--danger)' };
  return { text: `${rs(m.balance)} due`, color: 'var(--ink)' };
}

/** Month | Agenda segmented toggle (Calendar ↔ Agenda) */
export function ViewToggle({ active }: { active: 'month' | 'agenda' }) {
  const item: CSSProperties = { height: 32, padding: '0 14px', borderRadius: 9, display: 'flex', alignItems: 'center', fontSize: 13, fontWeight: 500, color: 'var(--ink-2)' };
  const on: CSSProperties = { ...item, background: 'var(--raised)', color: 'var(--ink)', boxShadow: 'var(--shadow-tab)' };
  return (
    <div role="group" aria-label="Layout" style={{ display: 'flex', gap: 4, padding: 4, borderRadius: 12, background: 'var(--track)' }}>
      {active === 'month' ? <span aria-current="page" style={on}>Month</span> : <Link to="/calendar" style={item}>Month</Link>}
      {active === 'agenda' ? <span aria-current="page" style={on}>Agenda</span> : <Link to="/agenda" style={item}>Agenda</Link>}
    </div>
  );
}

/** Small date block: "Thu / 19" (accent-filled for today) */
export function DateBlock({ date, today, width = 48, size = 18 }: { date: string; today: string; width?: number; size?: number }) {
  const isToday = date === today;
  return (
    <span className="num" style={{
      width, flex: 'none', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '6px 0', borderRadius: 12,
      background: isToday ? 'var(--accent)' : 'var(--ground)', color: isToday ? 'var(--on-accent)' : 'var(--ink)',
    }}>
      <span style={{ fontSize: 11, color: isToday ? 'var(--on-accent)' : 'var(--ink-3)' }}>{isToday ? 'Today' : DOW[weekday(date)]}</span>
      <span style={{ fontSize: size, fontWeight: 600, letterSpacing: '-0.02em' }}>{Number(date.slice(8, 10))}</span>
    </span>
  );
}

/** True when a key event came from a text field (so page shortcuts stay out of the way) */
export const fromField = (e: KeyboardEvent) =>
  !!(e.target as HTMLElement | null)?.closest?.('input, textarea, select, [contenteditable]') || e.metaKey || e.ctrlKey || e.altKey;
