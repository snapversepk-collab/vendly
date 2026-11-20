import { useCallback, useState, type CSSProperties, type MouseEvent, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ChecklistCard, NotesCard } from '../components/booking/ChecklistCard';
import { EditBookingModal } from '../components/booking/EditBookingModal';
import { PaymentsCard, adjustMoney } from '../components/booking/PaymentsCard';
import { dayWord, hoursLabel, type NextFunctionPrefill } from '../components/booking/shared';
import { IconAlert, IconChevronLeft, IconClock, IconCopy, IconEdit, IconPin, IconPlus, IconWhatsApp } from '../components/icons';
import { CopyField, EmptyState, ErrorState, FnDot, Modal, PageSkeleton, StatusPill, WhatsAppButton, useToast } from '../components/ui';
import { del, get, post, type ApiError } from '../lib/api';
import { useAuth } from '../lib/auth';
import { daysBetween, fmtLong, fmtPhone, fmtShort, fmtTime, fmtTimeRange, groupPk, rs, today, waLink } from '../lib/format';
import { copyText, useApi, useDocumentTitle, useIsPhone } from '../lib/hooks';
import type { Booking, BookingDetail as Detail, BookingStatus, Service } from '../lib/types';

export default function BookingDetail() {
  const { id } = useParams();
  const { data, error, loading, reload, setData } = useApi<Detail>(`/bookings/${id}`);
  useDocumentTitle(data ? `${data.familyLabel ?? data.client.name}, ${data.functionType}` : 'Booking');

  if (loading && !data) return <PageSkeleton />;
  if (error && (!data || data.id !== id)) {
    if (error.status === 404) {
      return (
        <div className="page page-narrow">
          <div className="card">
            <EmptyState title="This booking isn't here" action={<Link className="btn btn-ghost" to="/today">Back to Today</Link>}>
              It may have been deleted, or it isn't assigned to you.
            </EmptyState>
          </div>
        </div>
      );
    }
    return <ErrorState error={error} onRetry={reload} />;
  }
  if (!data) return null;
  return <DetailView key={data.id} b={data} reload={reload} patchLocal={(r) => setData((x) => (x ? { ...x, ...r } : x))} />;
}

function DetailView({ b, reload, patchLocal }: { b: Detail; reload: () => void; patchLocal: (r: Partial<Detail>) => void }) {
  const { canSeeMoney: manager } = useAuth();
  const isPhone = useIsPhone();
  const nav = useNavigate();
  const toast = useToast();
  const services = useApi<Service[]>(b.serviceId ? '/services' : null);
  const svc = services.data?.find((s) => s.id === b.serviceId);

  const [editOpen, setEditOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [fillTick, setFillTick] = useState(0);
  const [hidden, setHidden] = useState<Set<string>>(() => new Set());
  const closeEdit = useCallback(() => setEditOpen(false), []);
  const closeCancel = useCallback(() => setCancelOpen(false), []);
  const closeDelete = useCallback(() => setDeleteOpen(false), []);

  const title = b.familyLabel ?? b.client.name;
  const cancelled = b.status === 'cancelled';
  const money = b.money && b.payments ? adjustMoney(b.money, b.payments, hidden) : null;
  const place = [b.venue, b.city].filter(Boolean).join(', ');
  const mapsUrl = place ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(place)}` : null;
  const time = fmtTimeRange(b.startTime, b.hours);

  async function setStatus(status: BookingStatus, msg: string) {
    setBusy(status);
    try {
      await post<Booking>(`/bookings/${b.id}/status`, { status });
      toast({ text: msg });
      setCancelOpen(false);
      reload();
    } catch (e) {
      toast({ text: (e as ApiError).message, tone: 'error' });
    } finally {
      setBusy(null);
    }
  }

  async function addFunction() {
    setBusy('next');
    try {
      const prefill = await get<NextFunctionPrefill>(`/bookings/${b.id}/next-function`);
      nav('/bookings/new', { state: prefill });
    } catch (e) {
      toast({ text: (e as ApiError).message, tone: 'error' });
      setBusy(null);
    }
  }

  async function deleteBooking() {
    setBusy('delete');
    try {
      await del(`/bookings/${b.id}`);
      toast({ text: `${title}, ${b.functionType} deleted` });
      nav('/today', { replace: true });
    } catch (e) {
      toast({ text: (e as ApiError).message, tone: 'error' });
      setBusy(null);
    }
  }

  const chips = (
    <div className="row" style={{ gap: 8 }}>
      <span style={fnChip}><FnDot fn={b.functionType} />{b.functionType}</span>
      <StatusPill status={b.status} />
    </div>
  );

  // ---------- Header ----------
  const header = isPhone ? (
    <section className="stack" style={{ gap: 16 }}>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <BackLink round />
        {manager && <button type="button" style={pillBtn} onClick={() => setEditOpen(true)}>Edit</button>}
      </div>
      <div className="stack" style={{ gap: 8 }}>
        {chips}
        <h1 style={{ fontSize: 34, lineHeight: 1.05, fontWeight: 600, letterSpacing: '-0.035em', color: cancelled ? 'var(--ink-3)' : undefined, overflowWrap: 'anywhere' }}>{title}</h1>
        <span className="num" style={{ fontSize: 15, color: 'var(--ink-2)' }}>
          <b style={{ color: 'var(--ink)', fontWeight: 600 }}>{dayWord(b.date, b.startTime)}</b>, {fmtShort(b.date)}{time ? `, ${time}` : ''}
        </span>
        {place && <span style={{ fontSize: 15, color: 'var(--ink-2)' }}>{place}</span>}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8 }}>
        <a href={waLink(b.client.whatsapp)} target="_blank" rel="noreferrer" style={tile} aria-disabled={!b.client.whatsapp || undefined}><IconWhatsApp size={18} />WhatsApp</a>
        {mapsUrl ? <a href={mapsUrl} target="_blank" rel="noreferrer" style={tile}><IconPin size={18} />Directions</a> : <span style={{ ...tile, color: 'var(--ink-3)' }}><IconPin size={18} />No venue</span>}
        <button type="button" style={tile} disabled={!b.client.whatsapp}
          onClick={async () => { if (b.client.whatsapp && (await copyText(b.client.whatsapp))) toast({ text: `Copied ${fmtPhone(b.client.whatsapp)}` }); }}>
          <IconCopy size={18} />Copy number
        </button>
      </div>
    </section>
  ) : (
    <>
      <BackLink />
      <section className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-end', gap: 20 }}>
        <div className="stack" style={{ gap: 12, minWidth: 0 }}>
          {chips}
          <h1 style={{ fontSize: 52, lineHeight: 1, fontWeight: 600, letterSpacing: '-0.04em', color: cancelled ? 'var(--ink-3)' : undefined, overflowWrap: 'anywhere' }}>{title}</h1>
          <p className="num" style={{ fontSize: 17, color: 'var(--ink-2)' }}>
            <b style={{ color: 'var(--ink)', fontWeight: 600 }}>{dayWord(b.date, b.startTime)}</b>, {fmtLong(b.date)}{time ? `, ${time}` : ''}
          </p>
        </div>
        <div className="row" style={{ gap: 8 }}>
          {b.client.whatsapp && <a className="btn btn-ghost" href={waLink(b.client.whatsapp)} target="_blank" rel="noreferrer"><IconWhatsApp />WhatsApp</a>}
          {mapsUrl && <a className="btn btn-ghost" href={mapsUrl} target="_blank" rel="noreferrer"><IconPin />Directions</a>}
          {manager && <button type="button" className="btn btn-dark" onClick={() => setEditOpen(true)}><IconEdit />Edit booking</button>}
        </div>
      </section>
    </>
  );

  const cancelledBanner = cancelled && (
    <div className="banner banner-danger" role="status">
      <IconAlert />
      <span>This booking is cancelled. {manager ? 'Its payments stay on record; record any refund in Payments.' : 'You don\'t need to do anything for it.'}</span>
    </div>
  );

  // ---------- Family functions ----------
  const family = manager && (
    <section aria-labelledby="fam-h" className="stack" style={{ gap: isPhone ? 8 : 12 }}>
      <h2 id="fam-h" style={{ fontSize: 14, fontWeight: 500, color: 'var(--ink-2)' }}>This family's functions</h2>
      <ol style={{ listStyle: 'none', margin: isPhone ? '0 -16px' : 0, padding: isPhone ? '2px 16px' : 0, display: 'flex', gap: isPhone ? 8 : 12, flexWrap: isPhone ? 'nowrap' : 'wrap', overflowX: isPhone ? 'auto' : undefined }}>
        {b.family.map((f) => <FamilyCard key={f.id} f={f} current={f.id === b.id} compact={isPhone} />)}
        <li style={{ flex: isPhone ? '0 0 120px' : '0 1 200px' }}>
          <button type="button" className="hov" onClick={addFunction} disabled={busy === 'next'}
            style={{ width: '100%', height: '100%', minHeight: isPhone ? 60 : 96, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: isPhone ? 14 : 18, border: '1.5px dashed var(--free-line)', background: 'transparent', fontSize: isPhone ? 13 : 14, fontWeight: 500, color: 'var(--ink-2)', cursor: 'pointer', padding: 10 }}>
            <IconPlus size={18} />{busy === 'next' ? 'Getting it ready…' : 'Add another function'}
          </button>
        </li>
      </ol>
    </section>
  );

  // ---------- Status track ----------
  const firstPay = b.payments?.find((p) => p.amount > 0 && !hidden.has(p.id));
  const past = daysBetween(today(), b.date) < 0;
  const stages = [
    { name: 'Inquiry', when: `${fmtShort(b.createdAt.slice(0, 10))}, ${b.source === 'booking_page' ? 'from your booking page' : b.source === 'import' ? 'imported' : 'added by you'}`, done: true },
    { name: 'Advance received', when: money?.advancePaid && firstPay ? `${fmtShort(firstPay.receivedOn)} · ${rs(firstPay.amount)}` : b.status === 'confirmed' || b.status === 'completed' ? 'Confirmed' : 'Not yet', done: !!money?.advancePaid || b.status === 'confirmed' || b.status === 'completed' },
    { name: 'Event day', when: `${past ? fmtShort(b.date) : dayWord(b.date, b.startTime)}${b.startTime ? `, ${fmtTime(b.startTime)}` : ''}`, done: past || b.status === 'completed' },
    { name: 'Completed', when: b.status === 'completed' ? 'Done and paid' : money && money.balance > 0 ? `${rs(money.balance)} still to collect` : 'After the event', done: b.status === 'completed' },
  ];
  const currentIdx = stages.findIndex((s) => !s.done);
  const showWindow = b.insideRescheduleWindow && !cancelled && b.status !== 'completed';
  const quote = b.quote as { id: string; status: string; total: number; sentAt: string | null } | null | undefined;

  const lifecycle = manager && (
    <section aria-label="Booking progress" className="card" style={{ padding: isPhone ? 18 : '22px 24px', display: 'flex', flexDirection: 'column', gap: 18, opacity: cancelled ? 0.7 : 1 }}>
      <ol style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: isPhone ? 6 : 12 }}>
        {stages.map((s, i) => (
          <li key={s.name} className="stack" style={{ gap: 10, minWidth: 0 }} aria-current={i === currentIdx && !cancelled ? 'step' : undefined}>
            <span className="row" style={{ gap: 8, flexWrap: 'nowrap' }}>
              <span style={{ width: 24, height: 24, borderRadius: '50%', display: 'grid', placeItems: 'center', flex: 'none', ...(s.done ? { background: 'var(--accent)', color: 'var(--on-accent)' } : i === currentIdx && !cancelled ? { border: '2px solid var(--accent)', boxShadow: '0 0 0 3px var(--accent-soft)' } : { border: '1.5px solid var(--free-line)' }) }}>
                {s.done && <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M3.5 8.5l3 3 6-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>}
              </span>
              <span style={{ flex: 1, height: 2, borderRadius: 2, background: s.done ? 'var(--accent)' : 'var(--line-soft)' }} />
            </span>
            <span className="stack" style={{ gap: 2 }}>
              <span style={{ fontSize: isPhone ? 13 : 15, fontWeight: 600 }}>{s.name}</span>
              <span className="num faint" style={{ fontSize: isPhone ? 12 : 13 }}>{s.when}</span>
            </span>
          </li>
        ))}
      </ol>
      {b.status === 'inquiry' && (
        <div className="row" style={{ justifyContent: 'space-between', gap: 10, paddingTop: 2 }}>
          <span className="small muted num">
            {quote ? `Quoted ${rs(quote.total)}${quote.sentAt ? ` · sent ${fmtShort(String(quote.sentAt).slice(0, 10))}` : ' · not sent yet'}` : 'No quote yet. The date is pencilled in until the advance comes.'}
          </span>
          <span className="row" style={{ gap: 8 }}>
            <Link className="btn btn-ghost btn-sm" to={`/bookings/${b.id}/quote`}>{quote ? 'Edit quote' : 'Make a quote'}</Link>
            <WhatsAppButton bookingId={b.id} kind="advance_reminder" label="Remind about advance" className="btn btn-ghost btn-sm" />
            <button type="button" className="btn btn-primary btn-sm" disabled={!!busy} onClick={() => setStatus('confirmed', 'Marked as Confirmed')}>Mark as confirmed</button>
          </span>
        </div>
      )}
      <div className="row" style={{ justifyContent: 'space-between', gap: 12, padding: showWindow ? '12px 14px' : 0, borderRadius: 14, background: showWindow ? 'var(--amber-soft)' : 'transparent', color: showWindow ? 'var(--amber)' : 'var(--ink-2)', fontSize: 14 }}>
        <span className="row" style={{ gap: 10, flexWrap: 'nowrap', alignItems: 'flex-start' }}>
          {showWindow ? (
            <><IconClock />Inside the {b.rescheduleNoticeDays}-day window. Moving the date now is outside the rescheduling policy.</>
          ) : cancelled ? 'Cancelled. Restore it if the family comes back.' : b.status === 'completed' ? 'Completed and paid.' : ''}
        </span>
        <span className="row" style={{ gap: 8 }}>
          {b.status === 'confirmed' && past && (
            <button type="button" className="btn btn-ghost btn-sm" disabled={!!busy} onClick={() => setStatus('completed', 'Marked as Completed')}>Mark as completed</button>
          )}
          {b.status === 'completed' && (
            <button type="button" className="btn btn-ghost btn-sm" disabled={!!busy} onClick={() => setStatus('confirmed', 'Moved back to Confirmed')}>Move back to Confirmed</button>
          )}
          {cancelled ? (
            <button type="button" className="btn btn-ghost btn-sm" disabled={!!busy} onClick={() => setStatus(money?.advancePaid ? 'confirmed' : 'inquiry', 'Booking restored')}>Restore booking</button>
          ) : (
            <button type="button" onClick={() => setCancelOpen(true)}
              style={{ height: 32, padding: '0 12px', borderRadius: 10, border: 0, background: 'transparent', fontSize: 13, fontWeight: 500, color: 'inherit', cursor: 'pointer', textDecoration: 'underline' }}>
              Mark as cancelled
            </button>
          )}
        </span>
      </div>
    </section>
  );

  // ---------- Details ----------
  const details = (
    <article aria-labelledby="det-h" className="card" style={{ padding: 22, display: 'flex', flexDirection: 'column', gap: 4 }}>
      <h2 id="det-h" style={{ margin: '0 0 8px', fontSize: 17, fontWeight: 600 }}>Details</h2>
      <dl style={{ margin: 0, display: 'flex', flexDirection: 'column' }}>
        {!manager && <DRow label="Time">{fmtShort(b.date)}{time ? `, ${time}` : ''}</DRow>}
        <DRow label="Package">{b.serviceName ?? 'Custom'}{b.hours ? ` · ${hoursLabel(b.hours)} on site` : ''}</DRow>
        {svc?.includes && <DRow label="Deliverables">{svc.includes}</DRow>}
        <DRow label="Venue">{place || <span className="faint">Not set yet</span>}</DRow>
        <DRow label="Client">{b.client.name}</DRow>
        {b.assigned.length > 0 && <DRow label="Team">{b.assigned.map((a) => a.name).join(', ')}</DRow>}
        {b.client.email && (
          <div style={dRow}>
            <dt className="tiny faint">Email</dt>
            <dd style={{ margin: 0 }}><CopyField value={b.client.email} /></dd>
          </div>
        )}
        <div style={{ ...dRow, borderBottom: 0, paddingBottom: 2 }}>
          <dt className="tiny faint">Phone / WhatsApp</dt>
          <dd style={{ margin: 0, fontSize: 15 }}>{b.client.whatsapp ? <CopyField value={b.client.whatsapp} display={fmtPhone(b.client.whatsapp)} /> : <span className="faint">No number</span>}</dd>
        </div>
      </dl>
    </article>
  );

  const payments = manager && b.money && (
    <PaymentsCard b={b} reload={reload} fillTick={fillTick} hidden={hidden} setHidden={setHidden} />
  );
  const checklist = <ChecklistCard bookingId={b.id} items={b.checklist} manager={manager} compact={isPhone} />;
  const notes = <NotesCard bookingId={b.id} initial={b.notes} />;
  const deleteBtn = manager && (
    <button type="button" onClick={() => setDeleteOpen(true)} style={{ alignSelf: 'flex-start', height: 40, padding: '0 4px', border: 0, background: 'transparent', fontSize: 14, fontWeight: 500, color: 'var(--danger)', cursor: 'pointer' }}>
      Delete booking
    </button>
  );

  // ---------- Phone bottom bar ----------
  let bottom: ReactNode;
  if (manager && money && money.balance > 0 && !cancelled) {
    bottom = <button type="button" className="btn btn-primary num" style={{ height: 54, fontSize: 16, borderRadius: 16 }} onClick={() => setFillTick((n) => n + 1)}>Record {rs(money.balance)} payment</button>;
  } else {
    bottom = (
      <>
        {b.client.whatsapp && <a className="btn btn-ghost" href={waLink(b.client.whatsapp)} target="_blank" rel="noreferrer"><IconWhatsApp />WhatsApp</a>}
        {mapsUrl && <a className="btn btn-ghost" href={mapsUrl} target="_blank" rel="noreferrer"><IconPin />Directions</a>}
      </>
    );
  }

  return (
    <div className="page" style={{ paddingTop: isPhone ? 16 : 28, gap: isPhone ? 16 : 24 }}>
      {header}
      {cancelledBanner}
      {isPhone ? (
        <>
          {payments}
          {family}
          {lifecycle}
          {checklist}
          {notes}
          {details}
          {deleteBtn}
          <div className="phone-actions show-phone">{bottom}</div>
        </>
      ) : (
        <>
          {family}
          {lifecycle}
          <section style={{ display: 'flex', flexWrap: 'wrap', gap: 20, alignItems: 'flex-start' }}>
            <div style={{ flex: '999 1 560px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 20 }}>
              {payments}
              {checklist}
            </div>
            <aside style={{ flex: '1 1 340px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 20 }}>
              {details}
              {notes}
              {deleteBtn}
            </aside>
          </section>
        </>
      )}

      {manager && (
        <EditBookingModal booking={b} open={editOpen} onClose={closeEdit}
          onSaved={(r) => { patchLocal(r); toast({ text: 'Booking updated' }); reload(); }} />
      )}
      <Modal open={cancelOpen} onClose={closeCancel} title="Mark as cancelled?"
        footer={<>
          <button type="button" className="btn btn-ghost" onClick={closeCancel}>Keep booking</button>
          <button type="button" className="btn btn-danger" disabled={!!busy} onClick={() => setStatus('cancelled', 'Booking cancelled')}>Mark as cancelled</button>
        </>}>
        <p className="muted">{title}, {b.functionType} on {fmtShort(b.date)} frees up the date. {money && money.paid > 0 ? `The ${rs(money.paid)} received stays on record; record any refund in Payments.` : ''}</p>
      </Modal>
      <Modal open={deleteOpen} onClose={closeDelete} title="Delete this booking?"
        footer={<>
          <button type="button" className="btn btn-ghost" onClick={closeDelete}>Keep it</button>
          <button type="button" className="btn btn-danger" disabled={busy === 'delete'} onClick={deleteBooking}>{busy === 'delete' ? 'Deleting…' : 'Delete booking'}</button>
        </>}>
        <p className="muted">This removes {title}'s {b.functionType} on {fmtShort(b.date)}, with its payments, receipts and checklist. It can't be undone. If the family called it off, mark it as cancelled instead to keep the record.</p>
      </Modal>
    </div>
  );
}

function BackLink({ round }: { round?: boolean }) {
  const nav = useNavigate();
  const canGoBack = (window.history.state?.idx ?? 0) > 0;
  const go = (e: MouseEvent) => { if (canGoBack) { e.preventDefault(); nav(-1); } };
  if (round) {
    return (
      <Link to="/today" onClick={go} aria-label="Back" style={{ width: 44, height: 44, borderRadius: '50%', background: 'var(--surface)', border: '1px solid var(--line)', display: 'grid', placeItems: 'center' }}>
        <IconChevronLeft size={18} />
      </Link>
    );
  }
  return (
    <Link to="/today" onClick={go} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 14, color: 'var(--ink-2)', width: 'max-content' }}>
      <IconChevronLeft />{canGoBack ? 'Back' : 'Today'}
    </Link>
  );
}

function FamilyCard({ f, current, compact }: { f: Booking; current: boolean; compact: boolean }) {
  const m = f.money;
  const pct = m && m.total > 0 ? Math.min(100, Math.round((m.paid / m.total) * 100)) : 0;
  const n = daysBetween(today(), f.date);
  const box: CSSProperties = current
    ? { background: 'var(--surface)', boxShadow: 'inset 0 0 0 2px var(--accent)' }
    : { background: 'var(--surface)', border: '1px solid var(--line)' };
  const paidText = f.status === 'cancelled' ? 'Cancelled' : !m ? '' : m.fullyPaid ? 'Paid in full' : m.paid > 0 ? `${rs(m.paid)} of ${groupPk(m.total)}` : f.quote ? `Quoted ${rs(f.quote.total)}` : 'No advance yet';
  if (compact) {
    return (
      <li style={{ flex: '1 0 110px' }}>
        <Link to={`/bookings/${f.id}`} aria-current={current ? 'page' : undefined} style={{ ...box, display: 'flex', flexDirection: 'column', gap: 2, padding: '10px 12px', borderRadius: 14, height: '100%', opacity: f.status === 'cancelled' ? 0.6 : 1 }}>
          <span style={{ fontSize: 13, fontWeight: 600 }}>{f.functionType}</span>
          <span className="num tiny faint">{n === 0 ? dayWord(f.date, f.startTime) : fmtShort(f.date)}</span>
        </Link>
      </li>
    );
  }
  return (
    <li style={{ flex: '1 1 220px', minWidth: 0, maxWidth: 420 }}>
      <Link to={`/bookings/${f.id}`} className="hov" aria-current={current ? 'page' : undefined}
        style={{ ...box, display: 'flex', flexDirection: 'column', gap: 10, padding: '16px 18px', borderRadius: 18, opacity: f.status === 'cancelled' ? 0.6 : 1 }}>
        <span className="row" style={{ justifyContent: 'space-between', gap: 8, flexWrap: 'nowrap' }}>
          <span className="row" style={{ gap: 7, fontSize: 14, fontWeight: 600 }}><FnDot fn={f.functionType} />{f.functionType}</span>
          <span className="num small muted">{fmtShort(f.date)}{n === 0 ? ` · ${dayWord(f.date, f.startTime).toLowerCase()}` : ''}</span>
        </span>
        <span style={{ display: 'flex', height: 5, borderRadius: 999, overflow: 'hidden', background: 'var(--line-soft)' }}>
          <span style={{ width: `${pct}%`, background: 'var(--accent)', borderRadius: 999 }} />
        </span>
        <span className="num small faint row" style={{ justifyContent: 'space-between', gap: 8 }}>
          <span>{f.serviceName ?? 'Custom'}{f.hours ? `, ${f.hours} h` : ''}</span>
          <span>{paidText}</span>
        </span>
      </Link>
    </li>
  );
}

function DRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div style={dRow}>
      <dt className="tiny faint">{label}</dt>
      <dd style={{ margin: 0, fontSize: 15 }}>{children}</dd>
    </div>
  );
}

const dRow: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 3, padding: '12px 0', borderBottom: '1px solid var(--line-soft)' };
const fnChip: CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 13, fontWeight: 500, padding: '4px 11px', borderRadius: 999, background: 'var(--surface)', border: '1px solid var(--line)' };
const pillBtn: CSSProperties = { height: 44, padding: '0 16px', borderRadius: 999, background: 'var(--surface)', border: '1px solid var(--line)', fontSize: 14, fontWeight: 500, cursor: 'pointer', color: 'var(--ink)' };
const tile: CSSProperties = { height: 64, borderRadius: 16, background: 'var(--surface)', border: '1px solid var(--line)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4, fontSize: 12, fontWeight: 500, color: 'var(--ink)', cursor: 'pointer' };
