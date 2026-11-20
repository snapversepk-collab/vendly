import { useEffect, useMemo, useState, type CSSProperties, type FormEvent, type ReactNode } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { ClashNotice, hoursLabel, methodOptions, type NextFunctionPrefill } from '../components/booking/shared';
import { IconAlert } from '../components/icons';
import { FnDot, RupeeInput, useToast } from '../components/ui';
import { get, post, type ApiError } from '../lib/api';
import { useAuth } from '../lib/auth';
import { DOW, addDays, firstName, fmtLong, fmtPhone, fmtShort, fmtTimeRange, rs, startOfWeek, today } from '../lib/format';
import { useApi, useDebounced, useDocumentTitle, useIsPhone } from '../lib/hooks';
import { FUNCTION_TYPES, type Booking, type Clash, type Service, type TeamMember } from '../lib/types';

type Errs = Partial<Record<'name' | 'date' | 'advance' | 'total' | 'form', string>>;

export default function NewBooking() {
  useDocumentTitle('New booking');
  const { business } = useAuth();
  const isPhone = useIsPhone();
  const nav = useNavigate();
  const toast = useToast();
  const loc = useLocation();
  const [sp] = useSearchParams();
  const pre = (loc.state ?? null) as NextFunctionPrefill | null;
  const qDate = sp.get('date');

  const services = useApi<Service[]>('/services');
  const team = useApi<TeamMember[]>('/team');
  const methods = methodOptions(business);
  const advPct = business?.advancePct ?? 40;
  const capacity = business?.capacityPerDate ?? 1;

  // ---------- Form state ----------
  const [clientId, setClientId] = useState<string | null>(pre?.clientId ?? null);
  const [familyId, setFamilyId] = useState<string | null>(pre?.familyId ?? null);
  const [name, setName] = useState(pre?.client?.name ?? '');
  const [whatsapp, setWhatsapp] = useState(fmtPhone(pre?.client?.whatsapp) ?? '');
  const [email, setEmail] = useState(pre?.client?.email ?? '');
  const [familyLabel, setFamilyLabel] = useState(pre?.familyLabel ?? '');
  const [fn, setFn] = useState<string>(pre?.functionType ?? 'Barat');
  const [date, setDate] = useState(pre?.date ?? (qDate && /^\d{4}-\d{2}-\d{2}$/.test(qDate) ? qDate : ''));
  const [startTime, setStartTime] = useState(pre?.startTime ?? '');
  const [hours, setHours] = useState(pre?.hours != null ? String(pre.hours) : '');
  const [serviceId, setServiceId] = useState<string>(pre?.serviceId ?? '');
  const [venue, setVenue] = useState(pre?.venue ?? '');
  const [city, setCity] = useState(pre?.city ?? business?.cities?.[0] ?? '');
  const [total, setTotal] = useState<number | null>(null);
  const [advOn, setAdvOn] = useState(false);
  const [advAmount, setAdvAmount] = useState<number | null>(null);
  const [advMethod, setAdvMethod] = useState(methods.find((m) => m.value === 'bank')?.value ?? methods[0]?.value ?? 'cash');
  const [notes, setNotes] = useState('');
  const [assigned, setAssigned] = useState<string[]>([]);
  const [overrideClash, setOverrideClash] = useState(false);
  const [allowPast, setAllowPast] = useState(false);
  const [errs, setErrs] = useState<Errs>({});
  const [planLimit, setPlanLimit] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const activeServices = useMemo(() => (services.data ?? []).filter((s) => s.active), [services.data]);
  const svc = activeServices.find((s) => s.id === serviceId) ?? services.data?.find((s) => s.id === serviceId);

  // Prefilled service (Add another function) also fills the total once services load
  useEffect(() => {
    if (pre?.serviceId && total === null && svc?.price != null) setTotal(svc.price);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [svc?.id]);

  // ---------- Live clash check ----------
  const dDate = useDebounced(date, 250);
  const [clash, setClash] = useState<Clash | null>(null);
  useEffect(() => {
    setOverrideClash(false);
    setAllowPast(false);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dDate)) { setClash(null); return; }
    let live = true;
    get<Clash>('/bookings/clash', { date: dDate }).then((c) => live && setClash(c)).catch(() => live && setClash(null));
    return () => { live = false; };
  }, [dDate]);

  const weekStart = date ? startOfWeek(date) : null;
  const week = useApi<Booking[]>(weekStart ? '/bookings' : null, weekStart ? { from: weekStart, to: addDays(weekStart, 6), status: 'active' } : undefined);

  // ---------- Money ----------
  const t = total ?? 0;
  const advanceDue = Math.round((t * advPct) / 100);
  const adv = advOn ? advAmount ?? 0 : 0;
  const balance = Math.max(0, t - adv);
  const willConfirm = advOn && adv > 0 && adv >= advanceDue;
  const advOver = advOn && t > 0 && adv > t;
  const isPast = !!date && date < today();
  const dateFull = !!clash?.full && clash.date === date;

  function pickService(s: Service | null) {
    if (!s) { setServiceId(''); return; }
    setServiceId(s.id);
    if (s.hours != null) setHours(String(s.hours));
    if (s.price != null) setTotal(s.price);
  }

  async function submit(e?: FormEvent) {
    e?.preventDefault();
    const er: Errs = {};
    if (!clientId && !name.trim()) er.name = 'Enter the client name';
    if (!date) er.date = 'Pick the event date';
    else if (isPast && !allowPast) er.date = 'This date is in the past. Tick "Add it anyway" to save it.';
    else if (dateFull && !overrideClash) er.date = 'This date is full. Tick "Add anyway" to double-book it.';
    if (advOver) er.advance = 'The advance is more than the total';
    if (advOn && !adv) er.advance = 'Enter the advance amount';
    setErrs(er);
    setPlanLimit(null);
    if (Object.keys(er).length) {
      document.getElementById(er.name ? 'nb-name' : er.date ? 'nb-date' : 'nb-advamt')?.focus();
      return;
    }
    const body: Record<string, unknown> = {
      functionType: fn, date, startTime: startTime || null, hours: hours.trim() ? Number(hours) : null,
      serviceId: serviceId || null, venue: venue.trim() || null, city: city.trim() || null, total: t,
      notes: notes.trim() || null, assignedUserIds: assigned,
      advance: advOn && adv > 0 ? { amount: adv, method: advMethod } : null,
      overrideClash, allowPast,
    };
    if (clientId) body.clientId = clientId;
    else body.client = { name: name.trim(), whatsapp: whatsapp.trim() || undefined, email: email.trim() };
    if (familyId) body.familyId = familyId;
    else if (familyLabel.trim()) body.familyLabel = familyLabel.trim();
    setSaving(true);
    try {
      const r = await post<Booking>('/bookings', body);
      toast({ text: `Saved as ${r.status === 'confirmed' ? 'Confirmed' : 'an Inquiry'}` });
      nav(`/bookings/${r.id}`, { replace: true });
    } catch (ex) {
      const ae = ex as ApiError;
      if (ae.code === 'plan_limit') setPlanLimit(ae.message);
      else if (ae.code === 'date_full') { if (ae.data?.clash) setClash(ae.data.clash); setErrs({ date: 'This date is full. Tick "Add anyway" to double-book it.' }); }
      else if (ae.code === 'past_date') setErrs({ date: ae.message });
      else if (ae.code === 'advance_over_total') setErrs({ advance: ae.message });
      else setErrs({ form: ae.message });
    } finally {
      setSaving(false);
    }
  }

  const people = (team.data ?? []).filter((m) => m.role === 'staff' || m.role === 'manager');
  const displayName = (clientId ? pre?.client?.name : name.trim()) || 'New client';
  const time = fmtTimeRange(startTime, hours ? Number(hours) : null);
  const place = [venue.trim(), city.trim()].filter(Boolean).join(', ');
  const pkg = svc ? `${svc.name}${hours ? `, ${hoursLabel(Number(hours))}` : ''}` : hours ? `Custom, ${hoursLabel(Number(hours))}` : 'Custom';

  // ---------- Pieces ----------
  const familyBanner = pre?.familyId && familyId && (
    <div className="banner banner-ok" role="status" style={{ justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap' }}>
      <span>Adding to <b style={{ fontWeight: 600 }}>{pre.familyLabel ?? pre.client?.name}</b>. Client, venue and service are copied from their last function.</span>
      <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setFamilyId(null); setClientId(null); }}>Make it a separate booking</button>
    </div>
  );
  const planBanner = planLimit && (
    <div className="banner banner-amber" role="alert" style={{ alignItems: 'center', flexWrap: 'wrap' }}>
      <IconAlert />
      <span style={{ flex: 1 }}>{planLimit} Upgrade to keep adding bookings this month.</span>
      <Link className="btn btn-dark btn-sm" to="/upgrade">See plans</Link>
    </div>
  );

  const clientSection = (
    <Section title="Client" phone={isPhone}>
      {clientId ? (
        <div className="row" style={{ justifyContent: 'space-between', padding: '12px 14px', borderRadius: 14, background: 'var(--ground)' }}>
          <span className="stack" style={{ gap: 2 }}>
            <span style={{ fontWeight: 600 }}>{pre?.client?.name}</span>
            <span className="small muted num">{fmtPhone(pre?.client?.whatsapp) || 'No number'}{pre?.client?.email ? ` · ${pre.client.email}` : ''}</span>
          </span>
          <button type="button" className="btn-link small" onClick={() => setClientId(null)}>Use a different client</button>
        </div>
      ) : (
        <>
          <div style={grid2}>
            <F id="nb-name" label="Client name" error={errs.name}>
              <input id="nb-name" className="input" autoComplete="off" value={name} aria-invalid={!!errs.name || undefined} onChange={(e) => { setName(e.target.value); setErrs((x) => ({ ...x, name: undefined })); }} />
            </F>
            <F id="nb-phone" label="Phone / WhatsApp">
              <input id="nb-phone" type="tel" className="input num" placeholder="0300 1234567" value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} />
            </F>
          </div>
          <F id="nb-email" label={<span>Email <span style={{ fontWeight: 400, color: 'var(--ink-3)' }}>(optional{isPhone ? '' : ', for automatic confirmations and reminders'})</span></span>}>
            <input id="nb-email" type="email" className="input" value={email} onChange={(e) => setEmail(e.target.value)} />
          </F>
        </>
      )}
      {!familyId && (
        <F id="nb-family" label={<span>Family or event name <span style={{ fontWeight: 400, color: 'var(--ink-3)' }}>(optional)</span></span>} hint="Shown on the calendar, e.g. Ayesha & Hamza. Uses the client name if left empty.">
          <input id="nb-family" className="input" value={familyLabel} onChange={(e) => setFamilyLabel(e.target.value)} />
        </F>
      )}
      <div className="stack" style={{ gap: 8 }}>
        <span id="nb-type-l" className="label">Function</span>
        <div role="radiogroup" aria-labelledby="nb-type-l" className="row"
          style={{ gap: isPhone ? 6 : 8, ...(isPhone ? { flexWrap: 'nowrap', overflowX: 'auto', margin: '0 -20px', padding: '2px 20px' } : {}) }}>
          {FUNCTION_TYPES.map((x) => {
            const on = x === fn;
            return (
              <button key={x} type="button" role="radio" aria-checked={on} onClick={() => setFn(x)}
                style={{ flex: 'none', display: 'inline-flex', alignItems: 'center', gap: 8, height: 40, padding: '0 14px', borderRadius: 999, fontSize: 14, fontWeight: 500, cursor: 'pointer',
                  ...(on ? { background: 'var(--ink)', color: 'var(--ground)', border: '1px solid var(--ink)' } : { background: 'var(--surface)', color: 'var(--ink)', border: '1px solid var(--line)' }) }}>
                <FnDot fn={x} />{x}
              </button>
            );
          })}
        </div>
      </div>
    </Section>
  );

  const days = weekStart ? Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)) : [];
  const dateSection = (
    <Section title={isPhone ? 'Event' : 'Date and time'} phone={isPhone}>
      <div style={isPhone ? { display: 'grid', gridTemplateColumns: 'minmax(0,1.4fr) minmax(0,1fr)', gap: 10 } : grid2}>
        <F id="nb-date" label={isPhone ? 'Date' : 'Event date'} error={errs.date} hint={date && !isPhone ? fmtLong(date) : undefined}>
          <input id="nb-date" type="date" className="input num" value={date} aria-invalid={!!errs.date || undefined} onChange={(e) => { setDate(e.target.value); setErrs((x) => ({ ...x, date: undefined })); }} />
        </F>
        <F id="nb-time" label={isPhone ? 'Start' : 'Start time'}>
          <input id="nb-time" type="time" className="input num" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
        </F>
      </div>
      {isPast && (
        <div className="banner banner-amber" role="alert" style={{ flexDirection: 'column', gap: 8 }}>
          <span className="row" style={{ gap: 10, flexWrap: 'nowrap' }}><IconAlert />{fmtShort(date)} is in the past. Adding an old booking for your records?</span>
          <label className="check small" style={{ color: 'var(--ink)' }}>
            <input type="checkbox" checked={allowPast} onChange={(e) => { setAllowPast(e.target.checked); setErrs((x) => ({ ...x, date: undefined })); }} />
            Add it anyway
          </label>
        </div>
      )}
      {clash && clash.date === date && (
        <ClashNotice clash={clash} date={date} override={overrideClash} onOverride={(v) => { setOverrideClash(v); setErrs((x) => ({ ...x, date: undefined })); }} />
      )}
      {!isPhone && days.length > 0 && (
        <ol aria-label="That week" style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gap: 6 }}>
          {days.map((d) => {
            const list = (week.data ?? []).filter((b) => b.date === d);
            const sel = d === date;
            const full = list.length >= capacity;
            const inquiryOnly = list.length > 0 && list.every((b) => b.status === 'inquiry');
            let st: CSSProperties = { background: 'var(--ground)', color: 'var(--ink-2)' };
            let note = 'Open';
            if (sel) { st = { background: 'var(--accent)', color: 'var(--on-accent)' }; note = 'This one'; }
            else if (full && !inquiryOnly) { st = { background: 'var(--confirmed-tile)', color: 'var(--confirmed-tile-ink)' }; note = 'Full'; }
            else if (inquiryOnly) { st = { background: 'var(--amber-soft-2)', color: 'var(--amber)', border: '1px dashed var(--amber)' }; note = 'Inquiry'; }
            else if (list.length) { note = `${list.length} of ${capacity}`; }
            return (
              <li key={d}>
                <button type="button" className="num" aria-pressed={sel} aria-label={`${fmtLong(d)}, ${note}`} onClick={() => setDate(d)}
                  style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, padding: '10px 4px', borderRadius: 12, border: '1px solid transparent', cursor: 'pointer', opacity: d < today() && !sel ? 0.5 : 1, ...st }}>
                  <span style={{ fontSize: 11, opacity: 0.8 }}>{DOW[days.indexOf(d)]}</span>
                  <span style={{ fontSize: 17, fontWeight: 600 }}>{Number(d.slice(8))}</span>
                  <span style={{ fontSize: 11 }}>{note}</span>
                </button>
              </li>
            );
          })}
        </ol>
      )}
      {isPhone && venueFields()}
      {isPhone && cityField()}
    </Section>
  );

  function venueFields() {
    return (
      <F id="nb-venue" label="Venue">
        <input id="nb-venue" className="input" placeholder="Marquee or hall, area" value={venue} onChange={(e) => setVenue(e.target.value)} />
      </F>
    );
  }
  function cityField() {
    return (
      <F id="nb-city" label="City">
        <input id="nb-city" className="input" list="nb-cities" value={city} onChange={(e) => setCity(e.target.value)} />
        <datalist id="nb-cities">{(business?.cities ?? []).map((c) => <option key={c} value={c} />)}</datalist>
      </F>
    );
  }

  const serviceSection = (
    <Section title="Service" phone={isPhone}>
      {services.loading && !services.data ? (
        <p className="small faint">Loading your services…</p>
      ) : (
        <div role="radiogroup" aria-label="Service" style={{ display: 'grid', gridTemplateColumns: isPhone ? '1fr' : 'repeat(auto-fill, minmax(160px, 1fr))', gap: isPhone ? 8 : 10 }}>
          {[...activeServices, null].map((s) => {
            const on = s ? s.id === serviceId : !serviceId;
            const st: CSSProperties = on ? { border: '2px solid var(--accent)', background: 'var(--accent-soft)', padding: isPhone ? '9px 13px' : 15 } : { border: '1px solid var(--line)', background: 'var(--surface)', padding: isPhone ? '10px 14px' : 16 };
            return isPhone ? (
              <button key={s?.id ?? 'custom'} type="button" role="radio" aria-checked={on} onClick={() => pickService(s)}
                style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, minHeight: 54, borderRadius: 14, textAlign: 'left', cursor: 'pointer', color: 'var(--ink)', ...st }}>
                <span className="stack" style={{ gap: 2 }}>
                  <span style={{ fontSize: 15, fontWeight: 600 }}>{s?.name ?? 'Custom'}</span>
                  <span className="tiny faint">{s ? [s.hours ? `${s.hours} h` : null, s.includes].filter(Boolean).join(' · ') : 'Set your own hours and price'}</span>
                </span>
                <span className="num" style={{ fontSize: 14, fontWeight: 500, whiteSpace: 'nowrap' }}>{s?.price != null ? rs(s.price) : ''}</span>
              </button>
            ) : (
              <button key={s?.id ?? 'custom'} type="button" role="radio" aria-checked={on} onClick={() => pickService(s)}
                style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 6, borderRadius: 16, textAlign: 'left', cursor: 'pointer', minWidth: 0, color: 'var(--ink)', ...st }}>
                <span style={{ fontSize: 17, fontWeight: 600, letterSpacing: '-0.01em' }}>{s?.name ?? 'Custom'}</span>
                <span className="num" style={{ fontSize: 26, fontWeight: 600, letterSpacing: '-0.03em' }}>{s ? (s.hours ? `${s.hours} h` : '—') : 'Any'}</span>
                <span className="small muted" style={{ lineHeight: 1.35 }}>{s ? s.includes || (s.price != null ? rs(s.price) : 'No price set') : 'Set your own hours'}</span>
                {s?.price != null && s.includes && <span className="small num" style={{ fontWeight: 500 }}>{rs(s.price)}</span>}
              </button>
            );
          })}
        </div>
      )}
      {services.data && activeServices.length === 0 && (
        <p className="small faint">No services yet. <Link to="/settings" className="btn-link">Add them in Settings</Link> to fill hours and prices in one tap.</p>
      )}
      <div style={{ maxWidth: 240 }}>
        <F id="nb-hours" label="Hours on site">
          <input id="nb-hours" type="number" min={0} max={48} step={0.5} inputMode="decimal" className="input num" value={hours} onChange={(e) => setHours(e.target.value)} />
        </F>
      </div>
    </Section>
  );

  const moneySection = (
    <Section title={isPhone ? 'Payment' : 'Venue and payment'} phone={isPhone}>
      {!isPhone && venueFields()}
      <div style={grid2}>
        {!isPhone && cityField()}
        <F id="nb-total" label="Agreed total" error={errs.total} hint={t > 0 ? `${advPct}% advance = ${rs(advanceDue)}` : undefined}>
          <RupeeInput id="nb-total" value={total} onChange={(v) => { setTotal(v); setErrs((x) => ({ ...x, advance: undefined })); }} />
        </F>
      </div>
      <label htmlFor="nb-adv" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, padding: isPhone ? '12px 14px' : 16, borderRadius: 16, border: '1px solid var(--line)', cursor: 'pointer' }}>
        <span className="stack" style={{ gap: 3 }}>
          <span style={{ fontSize: 15, fontWeight: 600 }}>Advance received now</span>
          <span className="num small muted">
            {!advOn ? `Optional. ${t > 0 ? `${rs(advanceDue)} confirms the date.` : 'Records the advance with a receipt.'}`
              : willConfirm ? `Records ${rs(adv)} and marks the booking confirmed`
              : adv > 0 ? `Records ${rs(adv)}. Less than the ${advPct}% advance, so it stays an Inquiry` : 'Enter the amount below'}
          </span>
        </span>
        <input id="nb-adv" type="checkbox" role="switch" checked={advOn}
          onChange={(e) => { setAdvOn(e.target.checked); if (e.target.checked && advAmount === null && advanceDue > 0) setAdvAmount(advanceDue); setErrs((x) => ({ ...x, advance: undefined })); }}
          style={{ width: 22, height: 22, margin: 0, accentColor: 'var(--accent)', flex: 'none' }} />
      </label>
      {advOn && (
        <div style={grid2}>
          <F id="nb-advamt" label="Advance amount" error={errs.advance ?? (advOver ? 'The advance is more than the total' : undefined)}>
            <RupeeInput id="nb-advamt" value={advAmount} onChange={(v) => { setAdvAmount(v); setErrs((x) => ({ ...x, advance: undefined })); }} invalid={advOver || !!errs.advance} />
          </F>
          <F id="nb-advm" label="Method">
            <select id="nb-advm" className="select" value={advMethod} onChange={(e) => setAdvMethod(e.target.value)}>
              {methods.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
            </select>
          </F>
        </div>
      )}
    </Section>
  );

  const extraSection = (
    <Section title="Team and notes" phone={isPhone}>
      {people.length > 0 ? (
        <fieldset style={{ border: 0, margin: 0, padding: 0, minWidth: 0 }}>
          <legend className="label" style={{ padding: 0, marginBottom: 8 }}>Assign to</legend>
          <div className="row" style={{ gap: 8 }}>
            {people.map((m) => {
              const on = assigned.includes(m.userId);
              return (
                <button key={m.userId} type="button" className="chip" aria-pressed={on} onClick={() => setAssigned(on ? assigned.filter((x) => x !== m.userId) : [...assigned, m.userId])}>
                  {m.name}<span className="tiny faint">{m.role === 'staff' ? 'Staff' : 'Manager'}</span>
                </button>
              );
            })}
          </div>
        </fieldset>
      ) : (
        team.data && <p className="small faint">Working with a team? <Link to="/settings" className="btn-link">Invite them in Settings</Link> and assign them here.</p>
      )}
      <F id="nb-notes" label="Notes">
        <textarea id="nb-notes" className="textarea" placeholder="Colours, venue contact, anything to remember" value={notes} onChange={(e) => setNotes(e.target.value)} />
      </F>
    </Section>
  );

  const dateStatus = !date ? 'Pick a date' : isPast ? 'In the past' : dateFull ? (overrideClash ? 'Full, adding anyway' : 'Date full') : clash && clash.date === date ? (clash.count ? `${clash.count} of ${clash.capacity} booked` : 'Free') : 'Checking…';

  const summary = (
    <aside aria-labelledby="sum-h" className="hide-phone" style={{ flex: '1 1 340px', minWidth: 0, position: 'sticky', top: 88, display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div className="card-hero" style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 20 }}>
        <div className="stack" style={{ gap: 6 }}>
          <span className="row small" style={{ gap: 7, color: 'var(--hero-ink-3)' }}><FnDot fn={fn} />{fn} · will be saved as {willConfirm ? 'Confirmed' : 'an Inquiry'}</span>
          <h2 id="sum-h" style={{ fontSize: 30, fontWeight: 600, letterSpacing: '-0.03em', lineHeight: 1.1, overflowWrap: 'anywhere' }}>{familyLabel.trim() || (familyId ? pre?.familyLabel : null) || displayName}</h2>
        </div>
        <dl style={{ margin: 0, display: 'flex', flexDirection: 'column', gap: 12, fontSize: 14 }}>
          <SRow k="When">{date ? `${fmtShort(date)}${time ? `, ${time}` : ''}` : '—'}</SRow>
          <SRow k="Date">{dateStatus}</SRow>
          <SRow k="Package">{pkg}</SRow>
          {svc?.includes && <SRow k="You deliver">{svc.includes}</SRow>}
          <SRow k="Venue">{place || '—'}</SRow>
        </dl>
        <div className="num" style={{ display: 'flex', flexDirection: 'column', gap: 10, paddingTop: 16, borderTop: '1px solid rgba(255,255,255,.12)', fontSize: 14 }}>
          <div className="row" style={{ justifyContent: 'space-between' }}><span style={{ color: 'var(--hero-ink-3)' }}>Agreed total</span><span>{rs(t)}</span></div>
          <div className="row" style={{ justifyContent: 'space-between' }}><span style={{ color: 'var(--hero-ink-3)' }}>Advance due, {advPct}%</span><span>{rs(advanceDue)}</span></div>
          {advOn && <div className="row" style={{ justifyContent: 'space-between' }}><span style={{ color: 'var(--hero-ink-3)' }}>Advance today</span><span style={{ fontWeight: 600 }}>{rs(adv)}</span></div>}
          <div className="row" style={{ justifyContent: 'space-between', alignItems: 'baseline', paddingTop: 6 }}>
            <span style={{ color: 'var(--hero-ink-3)' }}>{business?.balanceDue === 'before_event' ? 'Balance before the day' : 'Balance on the day'}</span>
            <span style={{ fontSize: 28, fontWeight: 600, letterSpacing: '-0.03em' }}>{rs(balance)}</span>
          </div>
        </div>
        <button type="submit" disabled={saving} style={{ height: 50, borderRadius: 14, border: 0, background: 'var(--hero-ink)', color: 'var(--hero)', fontSize: 15, fontWeight: 600, cursor: 'pointer' }}>
          {saving ? 'Saving…' : 'Save booking'}
        </button>
      </div>
      <p className="small faint" style={{ padding: '0 8px', lineHeight: 1.5 }}>
        {email.trim() || pre?.client?.email
          ? `${firstName(displayName)} gets a confirmation email with the receipt when the booking is confirmed. `
          : 'Add an email and the client gets confirmations and reminders automatically. '}
        Rescheduling needs at least {business?.rescheduleNoticeDays ?? 7} days' notice. Change your advance and reschedule rules in <Link to="/settings" className="btn-link">Settings</Link>.
      </p>
    </aside>
  );

  return (
    <div className="page" style={{ paddingTop: isPhone ? 12 : 36, paddingBottom: isPhone ? 170 : undefined }}>
      {isPhone ? (
        <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'nowrap' }}>
          <button type="button" onClick={() => nav(-1)} style={{ height: 44, display: 'flex', alignItems: 'center', fontSize: 15, color: 'var(--ink-2)', background: 'none', border: 0, padding: 0, cursor: 'pointer' }}>Cancel</button>
          <h1 style={{ fontSize: 16, fontWeight: 600 }}>New booking</h1>
          <span style={{ width: 52 }} />
        </div>
      ) : (
        <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-end' }}>
          <div className="stack" style={{ gap: 8 }}>
            <h1 className="h-display" style={{ lineHeight: 1 }}>New booking</h1>
            <p style={{ fontSize: 16, color: 'var(--ink-2)' }}>Everything on one page. The summary on the right updates as you fill it in.</p>
          </div>
          <button type="button" className="btn btn-ghost" onClick={() => nav(-1)}>Cancel</button>
        </div>
      )}
      {familyBanner}
      {planBanner}
      <form onSubmit={submit} noValidate style={{ display: 'flex', flexWrap: 'wrap', gap: 24, alignItems: 'flex-start' }}>
        <div style={{ flex: '999 1 560px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: isPhone ? 14 : 20 }}>
          {clientSection}
          {dateSection}
          {serviceSection}
          {moneySection}
          {extraSection}
          {errs.form && <div className="banner banner-danger" role="alert">{errs.form}</div>}
        </div>
        {summary}
        <div className="phone-actions show-phone" style={{ flexDirection: 'column', gap: 10 }}>
          <span className="num row small muted" style={{ justifyContent: 'space-between', flexWrap: 'nowrap', gap: 8 }}>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{pkg} · {rs(t)}</span>
            <span style={{ whiteSpace: 'nowrap' }}>Balance <b style={{ color: 'var(--ink)' }}>{rs(balance)}</b></span>
          </span>
          <button type="submit" className="btn btn-primary" disabled={saving} style={{ height: 54, fontSize: 16, borderRadius: 16, flex: 'none' }}>{saving ? 'Saving…' : 'Save booking'}</button>
        </div>
      </form>
    </div>
  );
}

function Section({ title, phone, children }: { title: string; phone: boolean; children: ReactNode }) {
  const id = `nb-sec-${title.replace(/\W+/g, '-').toLowerCase()}`;
  return (
    <section aria-labelledby={id} style={{ border: phone ? 0 : '1px solid var(--line)', borderRadius: phone ? 22 : 24, background: 'var(--surface)', padding: phone ? 16 : 24, display: 'flex', flexDirection: 'column', gap: phone ? 12 : 18, minWidth: 0 }}>
      <h2 id={id} style={{ margin: '0 0 4px', fontSize: phone ? 15 : 20, fontWeight: 600, letterSpacing: '-0.01em' }}>{title}</h2>
      {children}
    </section>
  );
}

function F({ id, label, error, hint, children }: { id: string; label: ReactNode; error?: string; hint?: string; children: ReactNode }) {
  return (
    <div className="field">
      <label className="label" htmlFor={id}>{label}</label>
      {children}
      {error ? <span className="error-text" role="alert">{error}</span> : hint ? <span className="hint">{hint}</span> : null}
    </div>
  );
}

function SRow({ k, children }: { k: string; children: ReactNode }) {
  return (
    <div className="row" style={{ justifyContent: 'space-between', gap: 12, flexWrap: 'nowrap', alignItems: 'flex-start' }}>
      <dt style={{ color: 'var(--hero-ink-3)', flex: 'none' }}>{k}</dt>
      <dd className="num" style={{ margin: 0, textAlign: 'right', minWidth: 0 }}>{children}</dd>
    </div>
  );
}

const grid2: CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14 };
