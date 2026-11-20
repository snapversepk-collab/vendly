// Settings: plan card, business profile + booking link, appearance, capacity, booking and payment rules
import { useEffect, useState, type CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import { get, patch, put } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { METHOD_LABEL, addMonths, bookingPageUrl, displayHost, fmtPhone, monthName, rs, today } from '../../lib/format';
import { useDebounced } from '../../lib/hooks';
import { applyAppearance, type Appearance } from '../../lib/theme';
import type { Business } from '../../lib/types';
import { CopyField, Field, SaveState } from '../ui';
import { Section, useSaver } from './common';

type SetBiz = (fn: (b: Business) => Business) => void;

// ---------- Plan ----------
export function PlanCard({ b }: { b: Business }) {
  const plans = b.plans;
  if (b.plan !== 'free') {
    const p = plans?.[b.plan];
    return (
      <section id="plan" aria-labelledby="plan-h" className="card-hero" style={{ padding: 24, display: 'flex', flexWrap: 'wrap', gap: 20, alignItems: 'center', justifyContent: 'space-between', scrollMarginTop: 90 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0, flex: '1 1 320px' }}>
          <h2 id="plan-h" className="h-section">You're on the {p?.name ?? b.plan} plan</h2>
          <span className="num" style={{ fontSize: 14, color: 'var(--hero-ink-3)' }}>
            {p?.price ? `${rs(p.price)} a month. ` : ''}Unlimited bookings{b.plan === 'team' ? ', your whole team and full Reports.' : ', your booking page and WhatsApp receipts.'}
          </span>
        </div>
        <Link to="/upgrade" className="btn btn-on-dark" style={{ height: 46 }}>See plans</Link>
      </section>
    );
  }
  const used = b.usage?.bookingsThisMonth ?? 0;
  const limit = b.usage?.freeLimit ?? 10;
  const full = used >= limit;
  const pct = Math.min(100, Math.round((used / Math.max(1, limit)) * 100));
  const next = monthName(addMonths(today().slice(0, 7), 1));
  return (
    <section id="plan" aria-labelledby="plan-h" className="card-hero" style={{ padding: 24, display: 'flex', flexWrap: 'wrap', gap: 20, alignItems: 'center', justifyContent: 'space-between', scrollMarginTop: 90 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0, flex: '1 1 320px' }}>
        <h2 id="plan-h" className="h-section">{full ? `You've used all ${limit} free bookings this month` : "You're on the Free plan"}</h2>
        <div role="progressbar" aria-valuemin={0} aria-valuemax={limit} aria-valuenow={used} aria-label="Bookings used this month"
          style={{ display: 'flex', height: 8, borderRadius: 999, overflow: 'hidden', background: 'rgba(255,255,255,.12)', maxWidth: 360 }}>
          <span style={{ width: `${pct}%`, background: full ? 'var(--amber-bar)' : 'var(--hero-ink-2)', borderRadius: 999 }} />
        </div>
        <span className="num" style={{ fontSize: 14, color: 'var(--hero-ink-3)', lineHeight: 1.45 }}>
          {full
            ? `${used} of ${limit} bookings used. New bookings and accepted inquiries are paused until 1 ${next}. Pro has no limit.`
            : `${used} of ${limit} bookings used this month. Pro adds unlimited bookings, your booking page and WhatsApp receipts.`}
        </span>
      </div>
      <Link to="/upgrade" className="btn" style={{ height: 46, padding: '0 20px', background: 'var(--hero-ink)', color: 'var(--hero)' }}>See Pro</Link>
    </section>
  );
}

// ---------- Business profile + booking link ----------
export function BusinessSection({ b, setBiz }: { b: Business; setBiz: SetBiz }) {
  const { refresh } = useAuth();
  const [f, setF] = useState({ name: b.name, whatsapp: fmtPhone(b.whatsapp), email: b.email ?? '', cities: b.cities.join(', ') });
  const [err, setErr] = useState<{ name?: string; email?: string }>({});
  const saver = useSaver();
  const dirty = f.name !== b.name || f.whatsapp !== fmtPhone(b.whatsapp) || f.email !== (b.email ?? '') || f.cities !== b.cities.join(', ');

  const save = async () => {
    const e: typeof err = {};
    if (!f.name.trim()) e.name = 'Enter your business name';
    if (f.email.trim() && !/^\S+@\S+\.\S+$/.test(f.email.trim())) e.email = 'Enter a valid email';
    setErr(e);
    if (Object.keys(e).length) return;
    const cities = f.cities.split(',').map((c) => c.trim()).filter(Boolean);
    const body: Record<string, unknown> = { name: f.name.trim(), cities };
    if (f.whatsapp.trim()) body.whatsapp = f.whatsapp.trim();
    if (f.email.trim()) body.email = f.email.trim();
    const ok = await saver.run(() => patch('/business', body));
    if (ok) {
      setBiz((x) => ({ ...x, name: f.name.trim(), cities, email: f.email.trim() || x.email, whatsapp: f.whatsapp.replace(/\D/g, '') || x.whatsapp }));
      refresh();
    }
  };

  return (
    <Section id="business" title="Business" sub="Shown on your booking page, quotes, receipts and emails." flush={false}>
      <form className="stack" style={{ gap: 16 }} onSubmit={(e) => { e.preventDefault(); save(); }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 240px), 1fr))', gap: 16 }}>
          <Field label="Business name" htmlFor="biz-name" error={err.name}>
            <input id="biz-name" className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} aria-invalid={!!err.name || undefined} />
          </Field>
          <Field label="WhatsApp number" htmlFor="biz-wa" hint="Clients message you here">
            <input id="biz-wa" className="input num" type="tel" inputMode="tel" placeholder="0300 1234567" value={f.whatsapp} onChange={(e) => setF({ ...f, whatsapp: e.target.value })} />
          </Field>
          <Field label="Email" htmlFor="biz-email" error={err.email} hint="Client replies to automatic emails come here">
            <input id="biz-email" className="input" type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} aria-invalid={!!err.email || undefined} />
          </Field>
          <Field label="Cities you work in" htmlFor="biz-cities" hint="Separate with commas">
            <input id="biz-cities" className="input" placeholder="Islamabad, Rawalpindi" value={f.cities} onChange={(e) => setF({ ...f, cities: e.target.value })} />
          </Field>
        </div>
        <div className="row">
          <button type="submit" className="btn btn-dark" disabled={!dirty || saver.state === 'saving'}>Save changes</button>
          <SaveState state={saver.state} />
          {saver.error && <span className="error-text" role="alert">{saver.error}</span>}
        </div>
      </form>
      <div style={{ borderTop: '1px solid var(--line-soft)', marginTop: 20, paddingTop: 20 }}>
        <HandleEditor b={b} setBiz={setBiz} />
      </div>
    </Section>
  );
}

function HandleEditor({ b, setBiz }: { b: Business; setBiz: SetBiz }) {
  const { refresh } = useAuth();
  const [editing, setEditing] = useState(!b.handle);
  const [h, setH] = useState(b.handle ?? '');
  const dh = useDebounced(h.trim().toLowerCase(), 350);
  const [check, setCheck] = useState<{ handle: string; available: boolean; reason: string | null } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!editing || !dh || dh === b.handle) { setCheck(null); return; }
    let live = true;
    get<{ available: boolean; reason: string | null }>('/handle-available', { handle: dh })
      .then((r) => live && setCheck({ handle: dh, ...r }))
      .catch(() => {});
    return () => { live = false; };
  }, [dh, editing, b.handle]);

  const save = async () => {
    const v = h.trim().toLowerCase();
    if (!v) { setErr('Pick a name for your link'); return; }
    setBusy(true);
    setErr(null);
    try {
      const r = await put<{ handle: string }>('/business/handle', { handle: v });
      setBiz((x) => ({ ...x, handle: r.handle }));
      setEditing(false);
      refresh();
    } catch (e: any) {
      setErr(e.message ?? "Couldn't save");
    } finally {
      setBusy(false);
    }
  };

  const status = check && check.handle === h.trim().toLowerCase()
    ? check.available ? <span className="small" style={{ color: 'var(--accent)' }}>That link is free</span> : <span className="error-text">{check.reason ?? 'That link is taken'}</span>
    : null;

  return (
    <div className="stack" style={{ gap: 10 }}>
      <span id="handle-l" style={{ fontSize: 15, fontWeight: 600 }}>Booking link</span>
      {!editing && b.handle ? (
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <CopyField value={bookingPageUrl(b.handle)} display={<span>{displayHost()}/b/<strong style={{ fontWeight: 600 }}>{b.handle}</strong></span>} />
          <div className="row" style={{ gap: 8 }}>
            <a className="btn btn-ghost btn-sm" href={`/b/${b.handle}`} target="_blank" rel="noreferrer">Open</a>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setH(b.handle ?? ''); setEditing(true); }}>Edit</button>
          </div>
        </div>
      ) : (
        <form className="stack" style={{ gap: 8 }} onSubmit={(e) => { e.preventDefault(); save(); }}>
          <div className="row" style={{ gap: 8, flexWrap: 'nowrap' }}>
            <div className="input handle-box" style={{ display: 'flex', alignItems: 'center', flex: 1, minWidth: 0, paddingRight: 4 }}>
              <span className="num faint" style={{ fontSize: 14, whiteSpace: 'nowrap' }}>{displayHost()}/b/</span>
              <input aria-labelledby="handle-l" value={h} style={{ border: 0, outline: 'none', background: 'transparent', flex: 1, minWidth: 0, height: '100%', fontSize: 15, padding: 0 }}
                onChange={(e) => setH(e.target.value.replace(/\s+/g, '-'))} aria-invalid={!!err || (check ? !check.available : undefined)} autoCapitalize="none" spellCheck={false} />
            </div>
            <style>{`.handle-box:focus-within{border-color:var(--accent);box-shadow:0 0 0 3px var(--accent-soft)}`}</style>
          </div>
          <div className="row" style={{ gap: 8 }}>
            <button type="submit" className="btn btn-dark btn-sm" disabled={busy || (check ? !check.available : false)}>{busy ? 'Saving…' : 'Save link'}</button>
            {b.handle && <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setEditing(false); setErr(null); }}>Cancel</button>}
            {err ? <span className="error-text" role="alert">{err}</span> : status}
          </div>
          {b.handle && <span className="hint">Changing it breaks links you've already shared.</span>}
        </form>
      )}
    </div>
  );
}

// ---------- Appearance ----------
export function AppearanceSection() {
  const { user, refresh } = useAuth();
  const [a, setA] = useState<Appearance>(user?.appearance ?? 'system');
  const saver = useSaver();
  const choose = async (v: Appearance) => {
    setA(v);
    applyAppearance(v);
    const ok = await saver.run(() => patch('/auth/me', { appearance: v }));
    if (ok) refresh();
  };
  const opts: [Appearance, string][] = [['light', 'Light'], ['dark', 'Dark'], ['system', 'Match phone']];
  return (
    <Section id="appearance" title="Appearance" sub="Saved for you on every device. Client pages always follow their phone." flush={false}
      action={<SaveState state={saver.state} />}>
      <div className="seg" role="group" aria-label="Appearance">
        {opts.map(([v, l]) => (
          <button key={v} type="button" aria-pressed={a === v} onClick={() => choose(v)}>{l}</button>
        ))}
      </div>
      {saver.error && <p className="error-text" role="alert" style={{ marginTop: 8 }}>{saver.error}</p>}
    </Section>
  );
}

// ---------- Events on the same date ----------
export function CapacitySection({ b, setBiz }: { b: Business; setBiz: SetBiz }) {
  const saver = useSaver();
  const set = async (n: number) => {
    if (n < 1 || n > 50) return;
    const prev = b.capacityPerDate;
    setBiz((x) => ({ ...x, capacityPerDate: n }));
    const ok = await saver.run(() => patch('/business', { capacityPerDate: n }));
    if (!ok) setBiz((x) => ({ ...x, capacityPerDate: prev }));
  };
  const stepBtn: CSSProperties = { width: 40, height: 40, borderRadius: 10, border: 0, background: 'var(--ground)', fontSize: 20, color: 'var(--ink)', cursor: 'pointer' };
  return (
    <section id="capacity" aria-labelledby="cap-h" className="card" style={{ padding: 24, display: 'flex', flexWrap: 'wrap', gap: 20, justifyContent: 'space-between', alignItems: 'center', scrollMarginTop: 90 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: '1 1 320px', minWidth: 0 }}>
        <h2 id="cap-h" className="h-section">Events on the same date</h2>
        <span style={{ fontSize: 14, lineHeight: 1.45, color: 'var(--ink-3)' }}>How many teams or setups you can send out at once. A date shows as full when this many events are booked.</span>
        <div className="row" style={{ gap: 8, minHeight: 20 }}>
          <SaveState state={saver.state} />
          {saver.error && <span className="error-text" role="alert">{saver.error}</span>}
        </div>
      </div>
      <div role="group" aria-labelledby="cap-h" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: 4, borderRadius: 14, border: '1px solid var(--line)' }}>
        <button type="button" aria-label="One fewer" style={stepBtn} disabled={b.capacityPerDate <= 1} onClick={() => set(b.capacityPerDate - 1)}>−</button>
        <span className="num" aria-live="polite" style={{ width: 48, textAlign: 'center', fontSize: 20, fontWeight: 600 }}>{b.capacityPerDate}</span>
        <button type="button" aria-label="One more" style={stepBtn} disabled={b.capacityPerDate >= 50} onClick={() => set(b.capacityPerDate + 1)}>+</button>
      </div>
    </section>
  );
}

// ---------- Booking and payment rules ----------
const METHODS = ['cash', 'bank', 'jazzcash', 'easypaisa', 'other'];

export function RulesSection({ b, setBiz }: { b: Business; setBiz: SetBiz }) {
  const saver = useSaver();
  const [adv, setAdv] = useState(String(b.advancePct));
  const [days, setDays] = useState(String(b.rescheduleNoticeDays));
  const [err, setErr] = useState<{ adv?: string; days?: string }>({});

  const save = async (body: Partial<Business>) => {
    const prev = b;
    setBiz((x) => ({ ...x, ...body }));
    const ok = await saver.run(() => patch('/business', body));
    if (!ok) setBiz(() => prev);
  };
  const saveAdv = () => {
    const n = Number(adv);
    if (!Number.isInteger(n) || n < 0 || n > 100) { setErr((e) => ({ ...e, adv: 'Use 0 to 100' })); return; }
    setErr((e) => ({ ...e, adv: undefined }));
    if (n !== b.advancePct) save({ advancePct: n });
  };
  const saveDays = () => {
    const n = Number(days);
    if (!Number.isInteger(n) || n < 0 || n > 365) { setErr((e) => ({ ...e, days: 'Use 0 to 365' })); return; }
    setErr((e) => ({ ...e, days: undefined }));
    if (n !== b.rescheduleNoticeDays) save({ rescheduleNoticeDays: n });
  };
  const toggleMethod = (m: string) => {
    const has = b.paymentMethods.includes(m);
    save({ paymentMethods: has ? b.paymentMethods.filter((x) => x !== m) : [...b.paymentMethods, m] });
  };

  return (
    <Section id="rules" title="Booking and payment rules" sub="These show on your quotes, receipts and booking page. Changes apply to new bookings only." flush={false}
      action={<SaveState state={saver.state} />}>
      <div className="stack" style={{ gap: 20 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 220px), 1fr))', gap: 20 }}>
          <Field label="Advance to confirm a date" htmlFor="r-adv" error={err.adv}>
            <div className="row" style={{ gap: 10, flexWrap: 'nowrap' }}>
              <input id="r-adv" className="input num" style={{ width: 80 }} inputMode="numeric" value={adv}
                onChange={(e) => setAdv(e.target.value.replace(/\D/g, '').slice(0, 3))} onBlur={saveAdv} aria-invalid={!!err.adv || undefined} />
              <span className="muted">% of the total</span>
            </div>
          </Field>
          <div className="field">
            <span className="label" id="r-due">The rest is due</span>
            <div className="seg" role="group" aria-labelledby="r-due" style={{ alignSelf: 'flex-start' }}>
              <button type="button" aria-pressed={b.balanceDue === 'event_day'} onClick={() => b.balanceDue !== 'event_day' && save({ balanceDue: 'event_day' })}>On the event day</button>
              <button type="button" aria-pressed={b.balanceDue === 'before_event'} onClick={() => b.balanceDue !== 'before_event' && save({ balanceDue: 'before_event' })}>Before the event</button>
            </div>
          </div>
          <Field label="Notice needed to reschedule" htmlFor="r-days" error={err.days}>
            <div className="row" style={{ gap: 10, flexWrap: 'nowrap' }}>
              <input id="r-days" className="input num" style={{ width: 80 }} inputMode="numeric" value={days}
                onChange={(e) => setDays(e.target.value.replace(/\D/g, '').slice(0, 3))} onBlur={saveDays} aria-invalid={!!err.days || undefined} />
              <span className="muted">days</span>
            </div>
          </Field>
        </div>
        <fieldset style={{ border: 0, padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <legend className="label" style={{ marginBottom: 8 }}>Ways clients can pay you</legend>
          <div className="row" style={{ gap: 8 }}>
            {METHODS.map((m) => (
              <label key={m} className="check" style={{ height: 44, padding: '0 14px', border: '1px solid var(--line)', borderRadius: 12 }}>
                <input type="checkbox" checked={b.paymentMethods.includes(m)} onChange={() => toggleMethod(m)} />
                {METHOD_LABEL[m]}
              </label>
            ))}
          </div>
        </fieldset>
        {saver.error && <span className="error-text" role="alert">{saver.error}</span>}
      </div>
    </Section>
  );
}
