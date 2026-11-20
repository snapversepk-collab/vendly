// Helpers shared by Booking detail, New booking and the Quote editor.
import { METHOD_LABEL, daysBetween, fmtShort, plural, today } from '../../lib/format';
import type { Business, Clash } from '../../lib/types';
import { IconAlert, IconCheck } from '../icons';
import { FnDot, StatusPill } from '../ui';

/** Prefill handed to /bookings/new through router state ("Add another function") */
export interface NextFunctionPrefill {
  clientId?: string | null;
  client?: { name: string; whatsapp: string | null; email: string | null } | null;
  familyId?: string | null;
  familyLabel?: string | null;
  serviceId?: string | null;
  venue?: string | null;
  city?: string | null;
  startTime?: string | null;
  hours?: number | null;
  functionType?: string | null;
  date?: string | null;
}

export const PHASES: { key: string; label: string }[] = [
  { key: 'Booking', label: 'Booking' },
  { key: 'Before', label: 'Before the event' },
  { key: 'On the day', label: 'Event day' },
  { key: 'After', label: 'After the event' },
];
export const phaseLabel = (p: string) => PHASES.find((x) => x.key === p)?.label ?? p;

/** "Tonight" / "Today" / "Tomorrow" / "In 3 days" / "3 days ago" */
export function dayWord(date: string, startTime?: string | null) {
  const n = daysBetween(today(), date);
  if (n === 0) return startTime && Number(startTime.slice(0, 2)) >= 17 ? 'Tonight' : 'Today';
  if (n === 1) return 'Tomorrow';
  if (n === -1) return 'Yesterday';
  if (n > 1) return `In ${n} days`;
  return `${-n} days ago`;
}

export const hoursLabel = (h?: number | null) => (h ? plural(Number(h), 'hour') : '');
export const withYear = (date: string) => `${fmtShort(date)} ${date.slice(0, 4)}`;

export function methodOptions(business: Business | null) {
  const list = business?.paymentMethods?.length ? business.paymentMethods : Object.keys(METHOD_LABEL);
  return list.map((m) => ({ value: m, label: METHOD_LABEL[m] ?? m }));
}

/** Clash-check result for a date: free / partly booked / full with an override */
export function ClashNotice({ clash, date, override, onOverride }: { clash: Clash | null; date: string; override: boolean; onOverride: (v: boolean) => void }) {
  if (!clash || !date) return null;
  if (!clash.full) {
    return (
      <span className="row small" style={{ gap: 8, color: 'var(--accent)', fontWeight: 500, fontSize: 14 }}>
        <IconCheck size={16} />
        {clash.count === 0 ? `You're free on ${fmtShort(date)}` : `${clash.count} of ${clash.capacity} booked on ${fmtShort(date)}, there's room`}
      </span>
    );
  }
  return (
    <div className="banner banner-amber" role="alert" style={{ flexDirection: 'column', gap: 10 }}>
      <span className="row" style={{ gap: 10, flexWrap: 'nowrap', alignItems: 'flex-start' }}>
        <IconAlert />
        <span>
          <b style={{ fontWeight: 600 }}>Date full.</b> {fmtShort(date)} already has {plural(clash.count, 'booking')}
          {clash.capacity > 1 ? ` (you take ${clash.capacity} a day)` : ''}.
        </span>
      </span>
      <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 6, color: 'var(--ink)' }}>
        {clash.bookings.map((b) => (
          <li key={b.id} className="row small" style={{ gap: 8 }}>
            <FnDot fn={b.functionType} />
            <span style={{ fontWeight: 500 }}>{b.clientName}</span>
            <span className="muted">{b.functionType}</span>
            <StatusPill status={b.status} />
          </li>
        ))}
      </ul>
      <label className="check small" style={{ color: 'var(--ink)' }}>
        <input type="checkbox" checked={override} onChange={(e) => onOverride(e.target.checked)} />
        Add anyway, I can take one more on this date
      </label>
    </div>
  );
}
