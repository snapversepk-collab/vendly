// Public booking page (canvas: Client_Booking_page). Services, free dates, inquiry form.
// Spec: save the inquiry first, then open WhatsApp to the vendor with the request filled in.
import { useEffect, useRef, useState, type CSSProperties, type FormEvent, type ReactNode, type RefObject } from 'react';
import { useParams } from 'react-router-dom';
import { ApiError, post } from '../lib/api';
import { addMonths, fmtPhone, monthName, monthRange, monthYear, today, waLink, weekday } from '../lib/format';
import { useApi, useDocumentTitle } from '../lib/hooks';
import { followDevice } from '../lib/theme';
import type { PublicBusiness } from '../lib/types';
import { CopyField, Skeleton } from '../components/ui';
import { IconCheck, IconChevronLeft, IconChevronRight, IconWhatsApp } from '../components/icons';
import { ClientFooter, ClientMessage, ClientShell, Panel, VendorMark, fmtDayMonth, listJoin, policyText, tradeName } from '../components/client/ClientParts';

interface PublicService { id: string; name: string; hours: number | null; price: number | null; includes: string | null }
interface PageData { business: PublicBusiness; services: PublicService[]; month: string; freeDates: string[]; functionTypes: string[] }

const inputStyle: CSSProperties = { height: 46 };

export default function ClientBookingPage() {
  const { handle = '' } = useParams();
  const thisMonth = today().slice(0, 7);
  const [month, setMonth] = useState(thisMonth);
  const page = useApi<PageData>(`/public/b/${encodeURIComponent(handle)}`, { month });
  const [date, setDate] = useState<string | null>(null);
  const formRef = useRef<HTMLElement>(null);
  useEffect(() => { followDevice(); }, []);
  useDocumentTitle(page.data?.business.name ?? 'Booking page');

  if (page.loading && !page.data) return <PageSkeleton />;
  if (page.error && !page.data) {
    if (page.error.status === 404) {
      return <ClientMessage title="This booking page doesn't exist">Check the link with the vendor. It may have changed.</ClientMessage>;
    }
    return (
      <ClientMessage title="That didn't load">
        <p>{page.error.message}</p>
        <button className="btn btn-ghost" style={{ marginTop: 12 }} onClick={page.reload}>Try again</button>
      </ClientMessage>
    );
  }
  const d = page.data!;
  const b = d.business;
  const greet = `Assalam o Alaikum ${b.name}, I'd like to ask about a date.`;

  return (
    <ClientShell>
      <header style={{ display: 'flex', flexDirection: 'column', gap: 14, paddingTop: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <VendorMark name={b.name} logo={b.logo} />
          <span style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
            <h1 style={{ fontSize: 24, fontWeight: 600, letterSpacing: '-0.02em' }}>{b.name}</h1>
            {b.trades.length > 0 && <span style={{ fontSize: 13, color: 'var(--ink-2)' }}>{b.trades.map(tradeName).join(' · ')}</span>}
            {b.cities.length > 0 && <span style={{ fontSize: 13, color: 'var(--ink-3)' }}>{listJoin(b.cities)}</span>}
          </span>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" className="btn btn-primary" style={{ flex: 1, height: 46, borderRadius: 14, fontSize: 15 }}
            onClick={() => formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>Ask about a date</button>
          {b.whatsapp && (
            <a href={waLink(b.whatsapp, greet)} target="_blank" rel="noreferrer" aria-label={`Message ${b.name} on WhatsApp`} className="btn btn-ghost"
              style={{ width: 46, height: 46, padding: 0, borderRadius: 14, borderColor: 'var(--field-line)' }}><IconWhatsApp size={18} /></a>
          )}
        </div>
      </header>

      {d.services.length > 0 && (
        <Panel label="pp-svc" style={{ gap: 6 }}>
          <h2 id="pp-svc" style={{ margin: '0 0 6px', fontSize: 17, fontWeight: 600 }}>Services</h2>
          {d.services.map((s) => (
            <div key={s.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, padding: '10px 0', borderBottom: '1px solid var(--line-soft)' }}>
              <span style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
                <span style={{ fontSize: 15, fontWeight: 500 }}>{s.name}{s.hours ? ` · ${s.hours} ${s.hours === 1 ? 'hour' : 'hours'}` : ''}</span>
                {s.includes && <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>{s.includes}</span>}
              </span>
              {s.price != null
                ? <span className="num" style={{ fontSize: 14, fontWeight: 600, whiteSpace: 'nowrap' }}>Rs {s.price.toLocaleString('en-IN')}</span>
                : <span style={{ fontSize: 13, color: 'var(--ink-2)', whiteSpace: 'nowrap' }}>Ask for price</span>}
            </div>
          ))}
        </Panel>
      )}

      <DatesPanel data={d} month={month} thisMonth={thisMonth} loading={page.loading} setMonth={setMonth} date={date}
        onPick={(x) => { setDate(x); setTimeout(() => formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50); }} />

      <InquiryForm sectionRef={formRef} handle={handle} data={d} date={date} />

      <section aria-labelledby="pp-pol" style={{ padding: '4px 6px', display: 'flex', flexDirection: 'column', gap: 6 }}>
        <h2 id="pp-pol" style={{ fontSize: 14, fontWeight: 600 }}>How booking works</h2>
        <p style={{ fontSize: 13, lineHeight: 1.55, color: 'var(--ink-2)' }}>{policyText(b)}</p>
        {b.whatsapp && (
          <div style={{ fontSize: 13, color: 'var(--ink-2)', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span>WhatsApp</span>
            <CopyField value={b.whatsapp} display={fmtPhone(b.whatsapp)} />
          </div>
        )}
      </section>
      <ClientFooter />
    </ClientShell>
  );
}

function DatesPanel({ data, month, thisMonth, loading, setMonth, date, onPick }: {
  data: PageData; month: string; thisMonth: string; loading: boolean; setMonth: (m: string) => void; date: string | null; onPick: (d: string) => void;
}) {
  const t = today();
  // While the next month loads, keep showing the old one but dim it
  const shown = data.month;
  const { from, to } = monthRange(shown);
  const last = Number(to.slice(8));
  const lead = weekday(from);
  const free = new Set(data.freeDates);
  const cells: (string | null)[] = [...Array(lead).fill(null), ...Array.from({ length: last }, (_, i) => `${shown}-${String(i + 1).padStart(2, '0')}`)];
  const noneFree = data.freeDates.length === 0;
  const navBtn: CSSProperties = { width: 36, height: 36, padding: 0, borderRadius: 10 };

  return (
    <Panel label="pp-dates" style={{ opacity: loading && month !== shown ? 0.6 : 1, transition: 'opacity .15s' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2 id="pp-dates" style={{ fontSize: 17, fontWeight: 600 }} aria-live="polite">{monthYear(month)}</h2>
        <span style={{ display: 'flex', gap: 6 }}>
          <button type="button" className="btn btn-ghost" style={navBtn} aria-label="Previous month" disabled={month <= thisMonth} onClick={() => setMonth(addMonths(month, -1))}><IconChevronLeft size={14} /></button>
          <button type="button" className="btn btn-ghost" style={navBtn} aria-label="Next month" disabled={month >= addMonths(thisMonth, 18)} onClick={() => setMonth(addMonths(month, 1))}><IconChevronRight size={14} /></button>
        </span>
      </div>
      {noneFree && month === shown ? (
        <div className="banner banner-neutral" style={{ flexDirection: 'column', gap: 10 }}>
          <span>No free dates in {monthName(shown)}. Try next month.</span>
          <button type="button" className="btn btn-ghost btn-sm" style={{ alignSelf: 'flex-start' }} onClick={() => setMonth(addMonths(shown, 1))}>
            See {monthName(addMonths(shown, 1))}<IconChevronRight size={14} />
          </button>
        </div>
      ) : null}
      <div className="num" aria-hidden="true" style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gap: 4, fontSize: 11, color: 'var(--ink-3)', textAlign: 'center' }}>
        {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((x, i) => <span key={i}>{x}</span>)}
      </div>
      <div className="num" role="group" aria-label={`Dates in ${monthYear(shown)}`} style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gap: 4 }}>
        {cells.map((c, i) => {
          if (!c) return <span key={`b${i}`} />;
          const n = Number(c.slice(8));
          const past = c < t;
          const isFree = !past && free.has(c);
          const picked = c === date;
          const base: CSSProperties = { height: 40, borderRadius: 10, display: 'grid', placeItems: 'center', fontSize: 14, fontWeight: 600, border: 0, padding: 0, font: 'inherit' };
          if (isFree) {
            return (
              <button key={c} type="button" aria-pressed={picked} aria-label={`${fmtDayMonth(c)}, free`} onClick={() => onPick(c)}
                style={{ ...base, cursor: 'pointer', fontWeight: 600, background: picked ? 'var(--accent)' : 'var(--accent-soft)', color: picked ? 'var(--on-accent)' : 'var(--accent)' }}>
                {n}
              </button>
            );
          }
          if (past) return <span key={c} aria-hidden="true" style={{ ...base, color: 'var(--ink-3)', opacity: 0.5, fontWeight: 500 }}>{n}</span>;
          return (
            <span key={c} aria-label={`${fmtDayMonth(c)}, booked`} style={{ ...base, background: 'var(--line-soft)', color: 'var(--ink-3)', textDecoration: 'line-through', fontWeight: 500 }}>{n}</span>
          );
        })}
      </div>
      <div style={{ display: 'flex', gap: 14, fontSize: 12, color: 'var(--ink-2)' }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><span style={{ width: 10, height: 10, borderRadius: 3, background: 'var(--accent-soft)', border: '1px solid var(--accent)' }} />Free</span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><span style={{ width: 10, height: 10, borderRadius: 3, background: 'var(--line-soft)' }} />Booked</span>
      </div>
    </Panel>
  );
}

interface FormState { clientName: string; whatsapp: string; email: string; functionType: string; serviceId: string; venue: string; message: string; website: string }
const EMPTY: FormState = { clientName: '', whatsapp: '', email: '', functionType: '', serviceId: '', venue: '', message: '', website: '' };

function InquiryForm({ sectionRef, handle, data, date }: { sectionRef: RefObject<HTMLElement | null>; handle: string; data: PageData; date: string | null }) {
  const b = data.business;
  const [f, setF] = useState<FormState>(EMPTY);
  const [err, setErr] = useState<Partial<Record<keyof FormState | 'date' | 'form', string>>>({});
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{ date: string; vendorWhatsapp: string | null; text: string } | null>(null);
  const set = (k: keyof FormState, v: string) => setF((x) => ({ ...x, [k]: v }));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const er: typeof err = {};
    if (!f.clientName.trim()) er.clientName = 'Enter your name';
    if (f.whatsapp.replace(/\D/g, '').length < 10) er.whatsapp = 'Enter your WhatsApp number';
    if (f.email.trim() && !/^\S+@\S+\.\S+$/.test(f.email.trim())) er.email = 'Check your email address';
    if (!f.functionType) er.functionType = 'Pick a function';
    if (!date) er.date = 'Pick a free date on the calendar above';
    setErr(er);
    if (Object.keys(er).length) return;

    const svc = data.services.find((s) => s.id === f.serviceId);
    const lines = [
      `Assalam o Alaikum ${b.name}, I'm ${f.clientName.trim()}.`,
      `I'd like to ask about ${f.functionType === 'Other' ? 'an event' : `a ${f.functionType}`} on ${fmtDayMonth(date!)} ${date!.slice(0, 4)}${svc ? ` (${svc.name})` : ''}${f.venue.trim() ? ` at ${f.venue.trim()}` : ''}.`,
      f.message.trim(),
    ].filter(Boolean);
    const text = lines.join('\n');

    // Open the tab now so popup blockers allow it; point it at WhatsApp once the inquiry is saved
    const w = b.whatsapp ? window.open('about:blank', '_blank') : null;
    setBusy(true);
    try {
      const r = await post<{ ok: boolean; id?: string; vendorWhatsapp?: string | null }>(`/public/b/${encodeURIComponent(handle)}/inquiries`, {
        clientName: f.clientName.trim(), whatsapp: f.whatsapp.trim(), email: f.email.trim() || undefined, functionType: f.functionType, date,
        serviceId: f.serviceId || null, venue: f.venue.trim() || undefined, message: f.message.trim() || undefined, website: f.website,
      });
      const vw = r.vendorWhatsapp ?? b.whatsapp;
      if (w && vw) w.location.href = waLink(vw, text); else w?.close();
      setDone({ date: date!, vendorWhatsapp: vw, text });
      setF(EMPTY);
    } catch (x) {
      w?.close();
      setErr({ form: x instanceof ApiError ? x.message : 'Something went wrong. Please try again.' });
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <Panel id="ask" label="pp-ask" style={{ gap: 14 }}>
        <span style={{ width: 44, height: 44, borderRadius: '50%', background: 'var(--accent-soft)', color: 'var(--accent)', display: 'grid', placeItems: 'center' }}><IconCheck size={22} /></span>
        <h2 id="pp-ask" style={{ fontSize: 20, fontWeight: 600, letterSpacing: '-0.01em' }}>Request sent</h2>
        <p style={{ fontSize: 14, lineHeight: 1.55, color: 'var(--ink-2)' }}>
          {b.name} has your request for {fmtDayMonth(done.date)}. WhatsApp should have opened so you can chat. If it didn't, message them yourself.
          Your date is held only once {b.name} confirms and the advance is paid.
        </p>
        {done.vendorWhatsapp && (
          <>
            <a href={waLink(done.vendorWhatsapp, done.text)} target="_blank" rel="noreferrer" className="btn btn-dark btn-block" style={{ height: 50, borderRadius: 14, fontSize: 15 }}>
              <IconWhatsApp />Message {b.name}
            </a>
            <div style={{ fontSize: 14, color: 'var(--ink-2)', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span>WhatsApp number</span>
              <CopyField value={done.vendorWhatsapp} display={fmtPhone(done.vendorWhatsapp)} />
            </div>
          </>
        )}
        <button type="button" className="btn btn-link" style={{ alignSelf: 'flex-start', cursor: 'pointer' }} onClick={() => setDone(null)}>Ask about another date</button>
      </Panel>
    );
  }

  const fnTypes = data.functionTypes.length ? data.functionTypes : ['Mehndi', 'Barat', 'Walima', 'Other'];
  return (
    <section ref={sectionRef} id="ask" aria-labelledby="pp-ask" style={{ background: 'var(--surface)', borderRadius: 22, padding: 18, display: 'flex', flexDirection: 'column', gap: 12, scrollMarginTop: 16 }}>
      <h2 id="pp-ask" style={{ fontSize: 17, fontWeight: 600 }}>{date ? `Ask about ${fmtDayMonth(date)}` : 'Ask about a date'}</h2>
      <form noValidate onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {!date && <p className={err.date ? 'error-text' : 'small muted'} role={err.date ? 'alert' : undefined}>{err.date ?? 'Pick a free date on the calendar above.'}</p>}
        <FormField id="pp-name" label="Your name" error={err.clientName}>
          <input id="pp-name" className="input" style={inputStyle} autoComplete="name" value={f.clientName} onChange={(e) => set('clientName', e.target.value)} aria-invalid={!!err.clientName || undefined} />
        </FormField>
        <FormField id="pp-phone" label="WhatsApp number" error={err.whatsapp}>
          <input id="pp-phone" className="input num" style={inputStyle} type="tel" inputMode="tel" autoComplete="tel" placeholder="0300 1234567" value={f.whatsapp} onChange={(e) => set('whatsapp', e.target.value)} aria-invalid={!!err.whatsapp || undefined} />
        </FormField>
        <FormField id="pp-email" label={<>Email <span style={{ fontWeight: 400, color: 'var(--ink-3)' }}>(optional)</span></>} error={err.email}>
          <input id="pp-email" className="input" style={inputStyle} type="email" autoComplete="email" placeholder="For your confirmation and receipt" value={f.email} onChange={(e) => set('email', e.target.value)} aria-invalid={!!err.email || undefined} />
        </FormField>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span id="pp-ev" style={{ fontSize: 13, fontWeight: 500, color: 'var(--ink-2)' }}>Which function?</span>
          <div role="radiogroup" aria-labelledby="pp-ev" style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {fnTypes.map((fn) => {
              const on = f.functionType === fn;
              return (
                <button key={fn} type="button" role="radio" aria-checked={on} onClick={() => set('functionType', fn)}
                  style={{ height: 40, padding: '0 14px', borderRadius: 999, border: `1px solid ${on ? 'var(--ink)' : 'var(--line)'}`, background: on ? 'var(--ink)' : 'var(--surface)', color: on ? 'var(--ground)' : 'var(--ink)', fontSize: 14, cursor: 'pointer' }}>
                  {fn}
                </button>
              );
            })}
          </div>
          {err.functionType && <span className="error-text" role="alert">{err.functionType}</span>}
        </div>
        {data.services.length > 0 && (
          <FormField id="pp-svc-s" label="Service">
            <select id="pp-svc-s" className="select" style={inputStyle} value={f.serviceId} onChange={(e) => set('serviceId', e.target.value)}>
              <option value="">Not sure yet</option>
              {data.services.map((s) => <option key={s.id} value={s.id}>{s.name}{s.hours ? ` · ${s.hours} ${s.hours === 1 ? 'hour' : 'hours'}` : ''}</option>)}
            </select>
          </FormField>
        )}
        <FormField id="pp-venue" label="Venue and city">
          <input id="pp-venue" className="input" style={inputStyle} placeholder="Marquee, hall or home address" value={f.venue} onChange={(e) => set('venue', e.target.value)} />
        </FormField>
        <FormField id="pp-msg" label={<>Anything else? <span style={{ fontWeight: 400, color: 'var(--ink-3)' }}>(optional)</span></>}>
          <textarea id="pp-msg" className="textarea" rows={3} placeholder="Guests, timings, what you have in mind" value={f.message} onChange={(e) => set('message', e.target.value)} maxLength={2000} />
        </FormField>
        {/* Honeypot: people never see or fill this */}
        <div aria-hidden="true" style={{ position: 'absolute', left: -10000, width: 1, height: 1, overflow: 'hidden' }}>
          <label htmlFor="pp-website">Website</label>
          <input id="pp-website" name="website" tabIndex={-1} autoComplete="off" value={f.website} onChange={(e) => set('website', e.target.value)} />
        </div>
        {err.form && <p className="error-text" role="alert">{err.form}</p>}
        <button type="submit" className="btn btn-primary btn-block" disabled={busy} style={{ height: 52, borderRadius: 14, fontSize: 15, marginTop: 4 }}>
          <IconWhatsApp />{busy ? 'Sending…' : 'Send inquiry'}
        </button>
        <p style={{ fontSize: 12, lineHeight: 1.5, color: 'var(--ink-3)' }}>
          {b.name} gets your request right away, and WhatsApp opens so you can chat. Add your email to get the confirmation and receipt there too.
          Your date is held only once {b.name} confirms and the advance is paid.
        </p>
      </form>
    </section>
  );
}

function FormField({ id, label, error, children }: { id: string; label: ReactNode; error?: string; children: ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <label htmlFor={id} style={{ fontSize: 13, fontWeight: 500, color: 'var(--ink-2)' }}>{label}</label>
      {children}
      {error && <span className="error-text" role="alert">{error}</span>}
    </div>
  );
}

function PageSkeleton() {
  return (
    <ClientShell>
      <div aria-busy="true" style={{ display: 'flex', flexDirection: 'column', gap: 18, paddingTop: 16 }}>
        <div className="row" style={{ gap: 14, flexWrap: 'nowrap' }}>
          <Skeleton h={60} w={60} r={18} />
          <div className="stack" style={{ gap: 6, flex: 1 }}><Skeleton h={24} w="60%" /><Skeleton h={14} w="80%" /></div>
        </div>
        <Skeleton h={46} r={14} />
        <Skeleton h={220} r={22} />
        <Skeleton h={320} r={22} />
      </div>
    </ClientShell>
  );
}
