// Shared pieces for the client-facing pages (booking page, quote, receipt). No login on these pages.
import type { CSSProperties, ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { DOW, MON, MONTH, METHOD_LABEL, initials, weekday } from '../../lib/format';
import type { PublicBusiness } from '../../lib/types';
import { Logo } from '../icons';

/** Trade keys from the backend templates. `/trades` needs a login, so client pages keep their own copy. */
export const TRADE_NAMES: Record<string, string> = {
  photo_booth: 'Photo booth',
  photographer: 'Photography and video',
  decorator: 'Decor',
  dj: 'DJ and sound',
  mehndi_artist: 'Mehndi artist',
  caterer: 'Catering',
  makeup_artist: 'Makeup artist',
};
export const tradeName = (k: string) => TRADE_NAMES[k] ?? k.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());

/** "a, b and c" */
export function listJoin(items: string[]) {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

/** "Fri 18 December" */
export const fmtDayMonth = (date: string) => {
  const [, m, d] = date.split('-').map(Number);
  return `${DOW[weekday(date)]} ${d} ${MONTH[m - 1]}`;
};
/** "18 Nov 2026" */
export const fmtDMY = (date: string) => {
  const [y, m, d] = date.slice(0, 10).split('-').map(Number);
  return `${d} ${MON[m - 1]} ${y}`;
};

/** Booking rules in one paragraph, from the vendor's settings */
export function policyText(b: Pick<PublicBusiness, 'advancePct' | 'balanceDue' | 'rescheduleNoticeDays' | 'paymentMethods'>) {
  const parts: string[] = [];
  if (b.advancePct > 0) parts.push(`A ${b.advancePct}% advance confirms your date.`);
  parts.push(`The balance is paid ${b.balanceDue === 'before_event' ? 'before the event' : 'on the event day'}.`);
  if (b.rescheduleNoticeDays > 0) parts.push(`Changing the date needs at least ${b.rescheduleNoticeDays} days' notice.`);
  const methods = (b.paymentMethods ?? []).map((m) => METHOD_LABEL[m] ?? m);
  if (methods.length) {
    const lower = methods.map((m, i) => (i === 0 ? m : m === 'Bank transfer' ? 'bank transfer' : m));
    parts.push(`${listJoin(lower)} accepted.`);
  }
  return parts.join(' ');
}

/** Square initials mark (or the vendor's logo) */
export function VendorMark({ name, logo, size = 60 }: { name: string; logo?: string | null; size?: number }) {
  const radius = Math.round(size * 0.3);
  if (logo) return <img src={logo} alt="" width={size} height={size} style={{ width: size, height: size, borderRadius: radius, objectFit: 'cover', flex: 'none' }} />;
  return (
    <span aria-hidden="true" style={{ width: size, height: size, borderRadius: radius, background: 'var(--ink)', color: 'var(--ground)', display: 'grid', placeItems: 'center', fontSize: Math.round(size * 0.32), fontWeight: 600, flex: 'none' }}>
      {initials(name)}
    </span>
  );
}

/** Narrow centred column used by every client page (phone-first, still fine on desktop) */
export function ClientShell({ children, gap = 18, style }: { children: ReactNode; gap?: number; style?: CSSProperties }) {
  return (
    <div style={{ minHeight: '100vh', background: 'var(--ground)', color: 'var(--ink)' }}>
      <div style={{ maxWidth: 480, margin: '0 auto', padding: '40px 16px 32px', display: 'flex', flexDirection: 'column', gap, ...style }}>{children}</div>
    </div>
  );
}

export function ClientFooter({ what = 'Booking page' }: { what?: string }) {
  return (
    <footer className="no-print" style={{ display: 'flex', justifyContent: 'center', paddingTop: 8 }}>
      <Link to="/" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--ink-3)' }}>
        <Logo size={14} />
        {what} by Vendly
      </Link>
    </footer>
  );
}

/** White rounded panel used on client pages */
export function Panel({ children, style, id, label }: { children: ReactNode; style?: CSSProperties; id?: string; label?: string }) {
  return (
    <section id={id} aria-labelledby={label} style={{ background: 'var(--surface)', borderRadius: 22, padding: 18, display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0, ...style }}>
      {children}
    </section>
  );
}

/** Full-page message for a missing / broken link */
export function ClientMessage({ title, children, what }: { title: string; children?: ReactNode; what?: string }) {
  return (
    <ClientShell style={{ minHeight: '80vh', justifyContent: 'center' }}>
      <Panel style={{ padding: 24, gap: 10 }}>
        <h1 style={{ fontSize: 24, fontWeight: 600, letterSpacing: '-0.02em' }}>{title}</h1>
        {children && <div className="muted" style={{ fontSize: 15, lineHeight: 1.5 }}>{children}</div>}
      </Panel>
      <ClientFooter what={what} />
    </ClientShell>
  );
}

/** Two-column definition row used on quote and receipt */
export function DetailRow({ term, children }: { term: string; children: ReactNode }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '10px 0', borderTop: '1px solid var(--line-soft)' }}>
      <dt style={{ color: 'var(--ink-3)', flex: 'none' }}>{term}</dt>
      <dd className="num" style={{ margin: 0, textAlign: 'right', minWidth: 0, overflowWrap: 'anywhere' }}>{children}</dd>
    </div>
  );
}
