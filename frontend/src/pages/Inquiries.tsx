// Inquiries: inbox + request detail with accept / suggest / decline (canvas: New_inquiry)
import { useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ApiError, post } from '../lib/api';
import { useAuth } from '../lib/auth';
import { DOW, MONTH, addDays, bookingPageUrl, daysBetween, firstName, fmtDayMon, fmtPhone, fmtShort, fmtTime, pkNow, startOfWeek, today, weekday } from '../lib/format';
import { useApi, useDocumentTitle, useIsPhone } from '../lib/hooks';
import type { Inquiry, InquiryDetail } from '../lib/types';
import { CopyField, EmptyState, ErrorState, FnDot, Modal, Skeleton, useToast } from '../components/ui';
import { IconCalendar, IconCheck, IconChevronLeft, IconChevronRight, IconX } from '../components/icons';

type IStatus = Inquiry['status'];
const STATUS_PILL: Record<IStatus, { label: string; cls: string }> = {
  new: { label: 'New', cls: 'pill-inquiry' },
  quoted: { label: 'Quoted', cls: 'pill-confirmed' },
  suggested: { label: 'Dates suggested', cls: 'pill-neutral' },
  declined: { label: 'Declined', cls: 'pill-cancelled' },
};
const DETAIL_BADGE: Record<IStatus, { label: string; bg: string; fg: string }> = {
  new: { label: 'Waiting for your reply', bg: 'var(--amber-soft)', fg: 'var(--amber)' },
  quoted: { label: 'Quote started', bg: 'var(--accent-soft)', fg: 'var(--accent)' },
  suggested: { label: 'Other dates suggested', bg: 'var(--track)', fg: 'var(--ink-2)' },
  declined: { label: 'Declined', bg: 'var(--danger-soft)', fg: 'var(--danger)' },
};

/** "Friday 18 December" */
const longNoYear = (d: string) => {
  const [, m, day] = d.split('-').map(Number);
  return `${['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'][weekday(d)]} ${day} ${MONTH[m - 1]}`;
};

/** When the request came in: "9:12 pm" today, "Yesterday", else "5 Dec" */
function agoShort(iso: string) {
  const at = pkNow(new Date(iso));
  const n = daysBetween(at.date, today());
  if (n === 0) return fmtTime(at.time);
  if (n === 1) return 'Yesterday';
  return fmtDayMon(at.date);
}
/** "today, 9:12 pm" / "yesterday, 9:12 pm" / "Sat 5 Dec, 9:12 pm" */
function agoLong(iso: string) {
  const at = pkNow(new Date(iso));
  const n = daysBetween(at.date, today());
  const day = n === 0 ? 'today' : n === 1 ? 'yesterday' : fmtShort(at.date);
  return `${day}, ${fmtTime(at.time)}`;
}

/** Companion functions for the "ask about related functions" tip */
function relatedTip(fn: string, related: string | null, name: string) {
  if (!related) return null;
  const first = firstName(name) || 'them';
  if (fn === 'Barat') return `A Barat usually comes with a Mehndi and a Walima. Ask ${first} if they need you for those too.`;
  if (fn === 'Mehndi') return `A Mehndi usually comes with a Barat and a Walima. Ask ${first} if they need you for those too.`;
  return `A ${fn} often comes with a ${related}. Ask ${first} if they need you for that too.`;
}

const errText = (e: unknown) => (e instanceof ApiError || e instanceof Error ? e.message : 'Something went wrong');

/** Open a tab synchronously (so popup blockers allow it), then point it at WhatsApp */
function openLater() {
  const w = window.open('about:blank', '_blank');
  return {
    go: (url: string) => { if (w) w.location.href = url; else window.location.href = url; },
    close: () => w?.close(),
  };
}

export default function Inquiries() {
  const { id } = useParams();
  const isPhone = useIsPhone();
  const list = useApi<Inquiry[]>('/inquiries');
  useDocumentTitle('Inquiries');

  // Which asked-for dates are still free (one call for the whole open inbox)
  const openDates = useMemo(() => {
    const t = today();
    return (list.data ?? []).filter((i) => i.status === 'new' || i.status === 'suggested').map((i) => i.date).filter((d) => d >= t).sort();
  }, [list.data]);
  const freeFrom = openDates[0];
  const freeDays = freeFrom ? Math.min(120, daysBetween(freeFrom, openDates[openDates.length - 1]!) + 1) : 0;
  const free = useApi<string[]>(freeFrom ? '/bookings/free-dates' : null, { from: freeFrom, days: freeDays });
  const freeSet = useMemo(() => new Set(free.data ?? []), [free.data]);
  const freeKnown = (d: string) => !!freeFrom && !!free.data && d >= freeFrom && d < addDays(freeFrom, freeDays);

  if (list.loading && !list.data) return <InboxSkeleton />;
  if (list.error && !list.data) return <ErrorState error={list.error} onRetry={list.reload} />;
  const items = list.data ?? [];

  if (!items.length) {
    return (
      <div className="page">
        <h1 className="h-page">Inquiries</h1>
        <EmptyInbox />
      </div>
    );
  }

  const selectedId = id ?? (isPhone ? null : items[0]!.id);
  const showList = !isPhone || !id;
  const showDetail = !!selectedId && (!isPhone || !!id);

  return (
    <div className="page" style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-start', gap: 24, paddingTop: isPhone ? 12 : 32 }}>
      {showList && (
        <aside aria-labelledby="inb-h" style={{ flex: '1 1 280px', maxWidth: isPhone ? 'none' : 340, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <h1 id="inb-h" className="h-page" style={{ margin: '0 0 6px 4px', fontSize: 32 }}>Inquiries</h1>
          {items.map((q) => (
            <InboxItem key={q.id} q={q} selected={q.id === selectedId} free={freeKnown(q.date) ? freeSet.has(q.date) : null} />
          ))}
        </aside>
      )}
      {showDetail && (
        <section style={{ flex: '999 1 560px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 20 }}>
          {isPhone && (
            <Link to="/inquiries" className="row small muted" style={{ gap: 6, minHeight: 44 }}>
              <IconChevronLeft /> All inquiries
            </Link>
          )}
          <Detail key={selectedId} id={selectedId!} onChanged={() => { list.reload(); free.reload(); }} />
        </section>
      )}
    </div>
  );
}

function InboxItem({ q, selected, free }: { q: Inquiry; selected: boolean; free: boolean | null }) {
  const t = today();
  let note: ReactNode;
  let noteColor = 'var(--ink-2)';
  if (q.date < t) {
    note = `${fmtShort(q.date)} has passed`;
    noteColor = 'var(--ink-3)';
  } else if ((q.status === 'new' || q.status === 'suggested') && free !== null) {
    note = free ? `${fmtShort(q.date)} is free` : `${fmtShort(q.date)} is already booked`;
    noteColor = free ? 'var(--accent)' : 'var(--danger)';
  } else {
    note = `Asked for ${fmtShort(q.date)}`;
  }
  const pill = STATUS_PILL[q.status];
  const box: CSSProperties = selected
    ? { background: 'var(--surface)', border: '2px solid var(--accent)', padding: '13px 15px' }
    : { background: 'var(--surface)', border: '1px solid var(--line)' };
  return (
    <Link to={`/inquiries/${q.id}`} className="hov" aria-current={selected ? 'true' : undefined}
      style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: '14px 16px', borderRadius: 16, ...box }}>
      <span style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'baseline' }}>
        <span style={{ fontSize: 15, fontWeight: 600, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{q.clientName}</span>
        <span className="num" style={{ fontSize: 12, color: 'var(--ink-3)', whiteSpace: 'nowrap' }}>{agoShort(q.createdAt)}</span>
      </span>
      <span className="num" style={{ fontSize: 13, color: 'var(--ink-2)', display: 'flex', alignItems: 'center', gap: 7 }}>
        <FnDot fn={q.functionType} />
        {q.functionType}{q.serviceName ? ` · ${q.serviceName}` : ''}
      </span>
      <span style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
        <span className="num" style={{ fontSize: 12, fontWeight: 500, color: noteColor }}>{note}</span>
        <span className={`pill ${pill.cls}`}>{pill.label}</span>
      </span>
    </Link>
  );
}

function Detail({ id, onChanged }: { id: string; onChanged: () => void }) {
  const d = useApi<InquiryDetail>(`/inquiries/${id}`);
  const week = useApi<string[]>(d.data ? '/bookings/free-dates' : null, d.data ? { from: startOfWeek(d.data.date), days: 7 } : undefined);
  useDocumentTitle(d.data ? `${d.data.clientName} · Inquiry` : 'Inquiries');

  if (d.loading && !d.data) return <DetailSkeleton />;
  if (d.error && !d.data) {
    return (
      <div className="card stack" style={{ alignItems: 'flex-start' }}>
        <h2 className="h-section">{d.error.status === 404 ? 'This inquiry is gone' : "That didn't load"}</h2>
        <p className="muted">{d.error.status === 404 ? 'It may have been removed.' : d.error.message}</p>
        {d.error.status !== 404 && <button className="btn btn-ghost" onClick={d.reload}>Try again</button>}
      </div>
    );
  }
  const q = d.data!;
  const reload = () => { d.reload(); week.reload(); onChanged(); };
  return (
    <>
      <RequestCard q={q} weekFree={week.data} />
      <ReplyCard q={q} onChanged={reload} />
    </>
  );
}

function RequestCard({ q, weekFree }: { q: InquiryDetail; weekFree: string[] | null }) {
  const badge = DETAIL_BADGE[q.status];
  const tip = relatedTip(q.functionType, q.relatedFunction, q.clientName);
  const t = today();
  const monday = startOfWeek(q.date);
  const freeSet = new Set(weekFree ?? []);
  const dt: CSSProperties = { fontSize: 12, color: 'var(--ink-3)' };
  const dd: CSSProperties = { margin: '4px 0 0', fontSize: 15 };
  const cell: CSSProperties = { background: 'var(--surface)', padding: '14px 16px', minWidth: 0 };
  const service = q.serviceName ? `${q.serviceName}${q.serviceHours ? `, ${q.serviceHours} hours` : ''}` : null;
  const busy = q.clash.count;
  const venue = [q.venue, q.city].filter(Boolean).join(', ');
  const cells: { term: string; value: ReactNode; faint?: boolean; flex?: boolean }[] = [
    { term: 'Function', value: <><FnDot fn={q.functionType} />{q.functionType}</>, flex: true },
    { term: 'Service', value: service ?? 'Not picked. Ask what they need.', faint: !service },
    { term: 'Venue', value: venue || 'Not given yet', faint: !venue },
    { term: 'WhatsApp', value: <CopyField value={q.whatsapp} display={fmtPhone(q.whatsapp)} /> },
    ...(q.email ? [{ term: 'Email', value: q.email }] : []),
    ...(q.guests != null ? [{ term: 'Guests', value: String(q.guests) }] : []),
  ];

  return (
    <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0 }}>
          <span className="num" style={{ fontSize: 13, color: 'var(--ink-3)' }}>From your booking page · {agoLong(q.createdAt)}</span>
          <h2 className="h-page" style={{ fontSize: 'clamp(26px, 4vw, 34px)', overflowWrap: 'anywhere' }}>{q.clientName} wants {longNoYear(q.date)}</h2>
        </div>
        <span style={{ fontSize: 12, fontWeight: 600, padding: '5px 11px', borderRadius: 999, background: badge.bg, color: badge.fg, whiteSpace: 'nowrap' }}>{badge.label}</span>
      </div>

      <dl className="iq-dl" style={{ margin: 0, display: 'grid', gap: 1, background: 'var(--line)', border: '1px solid var(--line)', borderRadius: 16, overflow: 'hidden' }}>
        {cells.map((c, i) => (
          <div key={c.term} style={{ ...cell, gridColumn: i === cells.length - 1 && cells.length % 2 ? '1 / -1' : undefined }}>
            <dt style={dt}>{c.term}</dt>
            <dd className="num" style={{ ...dd, overflowWrap: 'anywhere', ...(c.faint ? { color: 'var(--ink-3)' } : {}), ...(c.flex ? { display: 'flex', alignItems: 'center', gap: 7 } : {}) }}>{c.value}</dd>
          </div>
        ))}
      </dl>
      <style>{`.iq-dl{grid-template-columns:repeat(2,minmax(0,1fr))} @media (max-width:640px){.iq-dl{grid-template-columns:minmax(0,1fr)}}`}</style>

      {q.message && (
        <blockquote style={{ margin: 0, padding: '12px 14px', borderLeft: '3px solid var(--line)', fontSize: 14, lineHeight: 1.5, color: 'var(--ink-2)', whiteSpace: 'pre-wrap' }}>
          “{q.message}”
        </blockquote>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {q.clash.full ? (
          <div className="banner banner-danger" role="status" style={{ flexDirection: 'column', gap: 8 }}>
            <strong style={{ fontWeight: 600 }}>{fmtShort(q.date)} is already full</strong>
            <span>
              {q.clash.capacity > 1 ? `${q.clash.count} of ${q.clash.capacity} events booked:` : 'Already booked:'}
            </span>
            <ul style={{ margin: 0, paddingLeft: 18 }}>
              {q.clash.bookings.map((b) => (
                <li key={b.id}>
                  <Link to={`/bookings/${b.id}`} style={{ color: 'inherit', textDecoration: 'underline' }}>{b.clientName}</Link> · {b.functionType} · {b.status === 'inquiry' ? 'Pencilled in' : 'Confirmed'}
                </li>
              ))}
            </ul>
            <span>Suggest another date below, or accept anyway if you can take one more.</span>
          </div>
        ) : q.date < t ? (
          <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--ink-3)' }}>{fmtShort(q.date)} has already passed</span>
        ) : (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 14, fontWeight: 500, color: 'var(--accent)' }}>
            <IconCheck size={16} />You're free on {fmtShort(q.date)}{busy > 0 ? ` (${busy} of ${q.clash.capacity} booked)` : ''}
          </span>
        )}
        <ol className="num" aria-label="That week" style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gap: 6 }}>
          {Array.from({ length: 7 }, (_, i) => {
            const day = addDays(monday, i);
            const asked = day === q.date;
            const past = day < t;
            const known = !!weekFree;
            const isFree = freeSet.has(day);
            let style: CSSProperties = { background: 'var(--ground)', color: 'var(--ink)' };
            let note = known ? 'Free' : '…';
            if (asked) {
              style = q.clash.full ? { background: 'var(--danger-soft)', color: 'var(--danger)' } : { background: 'var(--accent)', color: 'var(--on-accent)' };
              note = q.clash.full ? 'Full' : 'Asked';
            } else if (past) {
              style = { background: 'transparent', color: 'var(--ink-3)' };
              note = 'Past';
            } else if (known && !isFree) {
              style = { background: 'var(--line-soft)', color: 'var(--ink-3)' };
              note = 'Booked';
            }
            return (
              <li key={day} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, padding: '10px 2px', borderRadius: 12, minWidth: 0, ...style }}>
                <span style={{ fontSize: 11, opacity: 0.8 }}>{DOW[i]}</span>
                <span style={{ fontSize: 16, fontWeight: 600 }}>{Number(day.slice(8))}</span>
                <span style={{ fontSize: 11 }}>{note}</span>
              </li>
            );
          })}
        </ol>
      </div>

      {tip && <p style={{ margin: 0, padding: '12px 14px', borderRadius: 14, background: 'var(--ground)', fontSize: 14, lineHeight: 1.5, color: 'var(--ink-2)' }}>{tip}</p>}
    </div>
  );
}

const choiceBase: CSSProperties = { padding: 16, borderRadius: 16, border: '1px solid var(--line)', background: 'var(--surface)', color: 'var(--ink)', textAlign: 'left', font: 'inherit', width: '100%' };
const iconBox = (accent = false): CSSProperties => ({
  width: 40, height: 40, borderRadius: 12, display: 'grid', placeItems: 'center', flex: 'none',
  background: accent ? 'var(--accent)' : 'var(--ground)', color: accent ? 'var(--on-accent)' : 'var(--ink)',
});

function ReplyCard({ q, onChanged }: { q: InquiryDetail; onChanged: () => void }) {
  const nav = useNavigate();
  const toast = useToast();
  const { role } = useAuth();
  const first = firstName(q.clientName) || q.clientName;
  const [busy, setBusy] = useState<null | 'accept' | 'suggest' | 'decline'>(null);
  const [acceptErr, setAcceptErr] = useState<{ code?: string; message: string } | null>(null);
  const [picked, setPicked] = useState<string[]>(q.status === 'suggested' ? q.suggestedDates.filter((x) => q.freeNearby.includes(x)) : []);
  const [suggestErr, setSuggestErr] = useState<string | null>(null);
  const [declineOpen, setDeclineOpen] = useState(false);
  const [declineErr, setDeclineErr] = useState<string | null>(null);
  const [sent, setSent] = useState<{ text: string; url: string } | null>(null);

  const accept = async (overrideClash = false) => {
    setBusy('accept');
    setAcceptErr(null);
    try {
      const r = await post<{ bookingId: string }>(`/inquiries/${q.id}/accept`, { overrideClash });
      nav(`/bookings/${r.bookingId}/quote`);
    } catch (e) {
      const err = e as ApiError;
      setAcceptErr({ code: err.code, message: errText(e) });
      setBusy(null);
    }
  };

  const suggest = async () => {
    if (!picked.length) { setSuggestErr('Pick at least one date'); return; }
    setSuggestErr(null);
    setBusy('suggest');
    const tab = openLater();
    try {
      const r = await post<{ text: string; whatsappUrl: string }>(`/inquiries/${q.id}/suggest`, { dates: [...picked].sort() });
      tab.go(r.whatsappUrl);
      setSent({ text: r.text, url: r.whatsappUrl });
      toast({ text: `Dates ready to send to ${first} on WhatsApp` });
      onChanged();
    } catch (e) {
      tab.close();
      setSuggestErr(errText(e));
    } finally {
      setBusy(null);
    }
  };

  const decline = async () => {
    setBusy('decline');
    setDeclineErr(null);
    const tab = openLater();
    try {
      const r = await post<{ text: string; whatsappUrl: string }>(`/inquiries/${q.id}/decline`);
      tab.go(r.whatsappUrl);
      setSent({ text: r.text, url: r.whatsappUrl });
      setDeclineOpen(false);
      toast({ text: `Declined. WhatsApp opened with a kind message to ${first}.` });
      onChanged();
    } catch (e) {
      tab.close();
      setDeclineErr(errText(e));
    } finally {
      setBusy(null);
    }
  };

  const hasBooking = !!q.bookingId;

  return (
    <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <h2 className="h-section">Reply to {first}</h2>

      {q.status === 'declined' && (
        <div className="banner banner-neutral">You declined this request. You can still accept it or suggest other dates if you free up.</div>
      )}

      {sent && (
        <div className="banner banner-ok" style={{ flexDirection: 'column', gap: 8 }}>
          <span>WhatsApp should have opened with this message. If it didn't, copy it and send it to {fmtPhone(q.whatsapp)}.</span>
          <span style={{ color: 'var(--ink)', whiteSpace: 'pre-wrap', fontSize: 14 }}>{sent.text}</span>
          <div className="row" style={{ gap: 8 }}>
            <CopyField value={sent.text} display="" label="Copy message" />
            <a className="btn btn-ghost btn-sm" href={sent.url} target="_blank" rel="noreferrer">Open WhatsApp</a>
          </div>
        </div>
      )}

      {/* Accept */}
      {hasBooking ? (
        <Link to={`/bookings/${q.bookingId}/quote`} className="choice" style={{ ...choiceBase, display: 'grid', gridTemplateColumns: '40px minmax(0, 1fr) auto', gap: 14, alignItems: 'center', border: '1px solid var(--accent)', boxShadow: 'inset 0 0 0 1px var(--accent)', background: 'var(--accent-soft)' }}>
          <span style={iconBox(true)}><IconCheck /></span>
          <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span style={{ fontSize: 16, fontWeight: 600 }}>Open the quote</span>
            <span style={{ fontSize: 13, color: 'var(--ink-2)' }}>{fmtDayMon(q.date)} is pencilled in. Finish the quote and send it to {first}.</span>
          </span>
          <IconChevronRight />
        </Link>
      ) : (
        <button type="button" className="choice" onClick={() => accept(false)} disabled={busy !== null} aria-busy={busy === 'accept'}
          style={{ ...choiceBase, display: 'grid', gridTemplateColumns: '40px minmax(0, 1fr) auto', gap: 14, alignItems: 'center', cursor: 'pointer', border: '1px solid var(--accent)', boxShadow: 'inset 0 0 0 1px var(--accent)', background: 'var(--accent-soft)' }}>
          <span style={iconBox(true)}><IconCheck /></span>
          <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span style={{ fontSize: 16, fontWeight: 600 }}>{busy === 'accept' ? 'Pencilling in…' : 'Accept and send a quote'}</span>
            <span style={{ fontSize: 13, color: 'var(--ink-2)' }}>
              Pencils in {fmtDayMon(q.date)} as an inquiry and opens the quote{q.serviceName ? ' with their service already added' : ''}.
            </span>
          </span>
          <IconChevronRight />
        </button>
      )}
      {acceptErr && (
        <div className={`banner ${acceptErr.code === 'date_full' ? 'banner-amber' : 'banner-danger'}`} role="alert" style={{ flexDirection: 'column', gap: 10 }}>
          <span>{acceptErr.code === 'date_full' ? `${fmtShort(q.date)} is already full. You can still take it if you have the people and kit.` : acceptErr.message}</span>
          {acceptErr.code === 'date_full' && (
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => accept(true)} disabled={busy !== null}>Accept anyway</button>
          )}
          {acceptErr.code === 'plan_limit' && role === 'owner' && <Link to="/upgrade" className="btn btn-ghost btn-sm">See Pro</Link>}
        </div>
      )}

      {/* Suggest */}
      <div className="choice" style={{ ...choiceBase, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <span style={{ display: 'grid', gridTemplateColumns: '40px minmax(0, 1fr)', gap: 14, alignItems: 'center' }}>
          <span style={iconBox()}><IconCalendar /></span>
          <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span id={`sg-${q.id}`} style={{ fontSize: 16, fontWeight: 600 }}>Suggest another date</span>
            <span style={{ fontSize: 13, color: 'var(--ink-2)' }}>Pick one or more free dates. {first} gets them on WhatsApp.</span>
          </span>
        </span>
        <div className="sg-dates" style={{ display: 'flex', flexDirection: 'column', gap: 12, paddingLeft: 54 }}>
          {q.freeNearby.length ? (
            <div role="group" aria-labelledby={`sg-${q.id}`} style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {q.freeNearby.map((x) => {
                const on = picked.includes(x);
                return (
                  <button key={x} type="button" className="chip num" aria-pressed={on} style={{ height: 36, padding: '0 12px', fontSize: 13 }}
                    onClick={() => setPicked((p) => (on ? p.filter((y) => y !== x) : [...p, x]))}>
                    {fmtShort(x)}
                  </button>
                );
              })}
            </div>
          ) : (
            <span className="small faint">No free dates in the three weeks around {fmtDayMon(q.date)}.</span>
          )}
          {q.freeNearby.length > 0 && (
            <div className="row" style={{ gap: 10 }}>
              <button type="button" className="btn btn-dark btn-sm" onClick={suggest} disabled={busy !== null || !picked.length}>
                {busy === 'suggest' ? 'Opening WhatsApp…' : picked.length > 1 ? `Send ${picked.length} dates on WhatsApp` : 'Send on WhatsApp'}
              </button>
              {suggestErr && <span className="error-text" role="alert">{suggestErr}</span>}
            </div>
          )}
        </div>
      </div>

      {/* Decline */}
      <div className="choice" style={{ ...choiceBase, display: 'grid', gridTemplateColumns: '40px minmax(0, 1fr) auto', gap: 14, alignItems: 'center' }}>
        <span style={iconBox()}><IconX /></span>
        <span style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
          <span style={{ fontSize: 16, fontWeight: 600 }}>Decline politely</span>
          <span style={{ fontSize: 13, color: 'var(--ink-2)' }}>Sends a kind message and keeps their details in case you free up.</span>
        </span>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setDeclineOpen(true)} disabled={busy !== null || q.status === 'declined'}>Decline</button>
      </div>

      <Modal open={declineOpen} onClose={() => setDeclineOpen(false)} title={`Decline ${first}'s request?`}
        footer={<>
          <button type="button" className="btn btn-ghost" onClick={() => setDeclineOpen(false)}>Keep it</button>
          <button type="button" className="btn btn-dark" onClick={decline} disabled={busy === 'decline'}>{busy === 'decline' ? 'Opening WhatsApp…' : 'Decline and open WhatsApp'}</button>
        </>}>
        <p className="muted">
          We'll mark it declined and open WhatsApp with a kind message for {first} about {fmtShort(q.date)}. Nothing is sent until you tap send.
          {q.bookingId ? ' The pencilled-in date will be cancelled.' : ''}
        </p>
        {declineErr && <p className="error-text" role="alert">{declineErr}</p>}
      </Modal>
      <style>{`.choice:hover{border-color:var(--field-line)} @media (max-width:640px){.sg-dates{padding-left:0 !important}}`}</style>
    </div>
  );
}

function EmptyInbox() {
  const { business } = useAuth();
  return (
    <div className="card">
      <EmptyState title="No inquiries yet">
        When someone asks about a date on your booking page, it shows up here with who, which function and whether you're free.
      </EmptyState>
      {business?.handle && (
        <div className="stack" style={{ alignItems: 'center', gap: 8 }}>
          <span className="small faint">Share your booking page</span>
          <CopyField value={bookingPageUrl(business.handle)} />
        </div>
      )}
    </div>
  );
}

function InboxSkeleton() {
  return (
    <div className="page" aria-busy="true" style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-start', gap: 24 }}>
      <div style={{ flex: '1 1 280px', maxWidth: 340, display: 'flex', flexDirection: 'column', gap: 10 }}>
        <Skeleton h={38} w={180} />
        {[0, 1, 2].map((i) => <Skeleton key={i} h={104} r={16} />)}
      </div>
      <div style={{ flex: '999 1 560px', minWidth: 0 }}><DetailSkeleton /></div>
    </div>
  );
}

function DetailSkeleton() {
  return (
    <div className="stack" aria-busy="true" style={{ gap: 20 }}>
      <Skeleton h={420} r={24} />
      <Skeleton h={320} r={24} />
    </div>
  );
}
