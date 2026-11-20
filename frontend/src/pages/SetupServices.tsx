import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { patch, post } from '../lib/api';
import { useAuth } from '../lib/auth';
import { METHOD_LABEL, plural } from '../lib/format';
import { useApi, useDocumentTitle } from '../lib/hooks';
import type { Service, Trade } from '../lib/types';
import { ErrorState, Skeleton } from '../components/ui';
import { SetupHeader, TradeIcon, fieldError } from '../components/onboarding/Onboarding';

interface Row {
  uid: string;
  id: string | null;
  trade: string | null;
  name: string;
  includes: string;
  hours: string;
  price: number | null;
  active: boolean;
  orig: string | null;
}

const METHODS = ['cash', 'bank', 'jazzcash', 'easypaisa'];
const snapshot = (r: Pick<Row, 'name' | 'includes' | 'hours' | 'price' | 'active'>) => JSON.stringify([r.name.trim(), r.includes.trim(), r.hours.trim(), r.price, r.active]);
const fmtHours = (h: number | null) => (h === null || h === undefined ? '' : String(h));
const parseHours = (s: string) => {
  const t = s.trim().replace(/h(ours?)?$/i, '').trim();
  if (!t || t === '—' || t === '-') return null;
  const n = Number(t);
  return Number.isFinite(n) && n >= 0 && n <= 48 ? n : NaN;
};
let uidSeq = 0;
const toRow = (s: Service): Row => {
  const r = { uid: `s${uidSeq++}`, id: s.id, trade: s.trade, name: s.name, includes: s.includes ?? '', hours: fmtHours(s.hours), price: s.price, active: s.active, orig: '' };
  r.orig = snapshot(r);
  return r;
};

export default function SetupServices() {
  useDocumentTitle('Your services and prices');
  const navigate = useNavigate();
  const { business, refresh } = useAuth();
  const services = useApi<Service[]>('/services');
  const trades = useApi<Trade[]>('/trades');
  const [rows, setRows] = useState<Row[] | null>(null);
  const [advance, setAdvance] = useState(String(business?.advancePct ?? 40));
  const [balanceDue, setBalanceDue] = useState<'event_day' | 'before_event'>(business?.balanceDue ?? 'event_day');
  const [notice, setNotice] = useState(String(business?.rescheduleNoticeDays ?? 7));
  const [methods, setMethods] = useState<string[]>(() => (business?.paymentMethods?.length ? business.paymentMethods : METHODS));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const focusUid = useRef<string | null>(null);

  useEffect(() => {
    if (services.data && !rows) setRows(services.data.map(toRow));
  }, [services.data, rows]);

  useEffect(() => {
    if (focusUid.current) {
      document.getElementById(`svc-name-${focusUid.current}`)?.focus();
      focusUid.current = null;
    }
  });

  const tradeName = (k: string | null) => (k ? trades.data?.find((t) => t.key === k)?.name ?? (k === 'other' ? 'Your services' : k) : 'Other services');

  const groups = useMemo(() => {
    if (!rows) return [];
    const keys: (string | null)[] = [...(business?.trades ?? [])];
    for (const r of rows) if (!keys.includes(r.trade)) keys.push(r.trade);
    if (!keys.length) keys.push(null);
    return keys.map((k) => ({ key: k, rows: rows.filter((r) => r.trade === k) }));
  }, [rows, business?.trades]);

  const missing = (r: Row) => r.active && r.name.trim() !== '' && r.price === null;
  const totalMissing = rows?.filter(missing).length ?? 0;

  const update = (uid: string, p: Partial<Row>) => {
    setRows((rs) => rs!.map((r) => (r.uid === uid ? { ...r, ...p } : r)));
    setErrors((e) => {
      const n = { ...e };
      for (const k of Object.keys(p)) delete n[`${uid}.${k}`];
      return n;
    });
  };
  const addRow = (trade: string | null) => {
    const uid = `n${uidSeq++}`;
    focusUid.current = uid;
    setRows((rs) => [...rs!, { uid, id: null, trade, name: '', includes: '', hours: '', price: null, active: true, orig: null }]);
  };

  const submit = async () => {
    if (!rows) return;
    const e: Record<string, string> = {};
    const adv = Number(advance);
    if (!/^\d+$/.test(advance.trim()) || adv > 100) e.advance = 'Enter 0 to 100';
    const nd = Number(notice);
    if (!/^\d+$/.test(notice.trim()) || nd > 365) e.notice = 'Enter 0 to 365 days';
    const work: { row: Row; hours: number | null }[] = [];
    for (const r of rows) {
      const blank = !r.name.trim() && !r.includes.trim() && !r.hours.trim() && r.price === null;
      if (!r.id && blank) continue;
      const hours = parseHours(r.hours);
      if (Number.isNaN(hours)) e[`${r.uid}.hours`] = 'Hours from 0 to 48';
      if (!r.name.trim()) e[`${r.uid}.name`] = 'Give this service a name';
      if (r.id && r.orig === snapshot(r)) continue;
      work.push({ row: r, hours: hours as number | null });
    }
    setErrors(e);
    if (Object.keys(e).length) {
      setFormError('Fix the highlighted fields first.');
      return;
    }
    setFormError(null);
    setBusy(true);
    try {
      await patch('/business', { advancePct: adv, balanceDue, rescheduleNoticeDays: nd, paymentMethods: methods, setupDone: { services: true } });
      await Promise.all(
        work.map(({ row: r, hours }) => {
          const body = { name: r.name.trim(), includes: r.includes.trim() || null, hours, price: r.price, active: r.active };
          return r.id ? patch(`/services/${r.id}`, body) : post('/services', { ...body, trade: r.trade });
        }),
      );
      await refresh();
      navigate('/setup/page');
    } catch (err) {
      setFormError(fieldError(err).message);
      setBusy(false);
      // Reload so rows that did save get ids (avoids duplicates on retry)
      setRows(null);
      services.reload();
    }
  };

  const loading = !rows && !services.error;

  return (
    <div className="ob-setup">
      <SetupHeader step={2} />
      {services.error && !rows ? (
        <ErrorState error={services.error} onRetry={services.reload} />
      ) : (
        <main className="ob-setup-main" style={{ gap: 36 }}>
          <div className="stack" style={{ gap: 10 }}>
            <h1 className="ob-setup-title">Your services and prices</h1>
            <p className="ob-setup-lede">We've added typical services for what you do. Set your own hours and prices, switch off what you don't offer.</p>
          </div>

          {loading
            ? [0, 1].map((i) => <Skeleton key={i} h={320} r={24} />)
            : groups.map((g) => {
                const need = g.rows.filter(missing).length;
                const hid = `grp-${g.key ?? 'none'}`;
                return (
                  <section key={g.key ?? 'none'} className="ob-group" aria-labelledby={hid}>
                    <div className="ob-group-head">
                      <h2 id={hid}>
                        <span className="ob-group-icon"><TradeIcon trade={g.key ?? 'other'} size={18} /></span>
                        {tradeName(g.key)}
                      </h2>
                      {g.rows.length > 0 && (
                        <span style={{ fontSize: 13, color: need ? 'var(--amber)' : 'var(--accent)' }}>{need ? `${plural(need, 'price')} to add` : 'All set'}</span>
                      )}
                    </div>
                    {g.rows.length === 0 ? (
                      <p className="small faint" style={{ padding: '4px 18px 6px' }}>No services here yet. Add the packages you offer, with what's included and your price.</p>
                    ) : (
                      <div className="ob-svc-cols" aria-hidden="true">
                        <span>Service and what's included</span><span>Hours on site</span><span>Price (Rs)</span><span style={{ textAlign: 'right' }}>Offer</span>
                      </div>
                    )}
                    {g.rows.map((r) => {
                      const label = r.name.trim() || 'new service';
                      const errName = errors[`${r.uid}.name`];
                      const errHours = errors[`${r.uid}.hours`];
                      return (
                        <div key={r.uid} className="ob-svc" data-off={!r.active}>
                          <div className="ob-svc-text">
                            <input id={`svc-name-${r.uid}`} className="ob-bare ob-bare-name" value={r.name} placeholder="Service name" aria-label="Service name"
                              aria-invalid={!!errName || undefined} onChange={(e) => update(r.uid, { name: e.target.value })} />
                            <input className="ob-bare ob-bare-inc" value={r.includes} placeholder="What's included" aria-label={`What's included in ${label}`}
                              onChange={(e) => update(r.uid, { includes: e.target.value })} />
                            {errName && <span className="error-text" role="alert">{errName}</span>}
                          </div>
                          <label>
                            <span className="ob-svc-lab">Hours on site</span>
                            <input className="ob-svc-num num" type="text" inputMode="decimal" value={r.hours} placeholder="—" aria-label={`Hours for ${label}`}
                              aria-invalid={!!errHours || undefined} style={errHours ? { borderColor: 'var(--danger)' } : undefined}
                              onChange={(e) => update(r.uid, { hours: e.target.value })} />
                            {errHours && <span className="error-text" role="alert">{errHours}</span>}
                          </label>
                          <label>
                            <span className="ob-svc-lab">Price (Rs)</span>
                            <input className="ob-svc-num num" type="text" inputMode="numeric" placeholder="Add your price" aria-label={`Price for ${label}`}
                              data-missing={missing(r)} value={r.price === null ? '' : r.price.toLocaleString('en-IN')}
                              onChange={(e) => { const d = e.target.value.replace(/\D/g, ''); update(r.uid, { price: d ? parseInt(d, 10) : null }); }} />
                          </label>
                          <label className="ob-svc-offer">
                            <span className="ob-svc-lab" style={{ margin: 0 }}>Offer this service</span>
                            <input type="checkbox" role="switch" checked={r.active} aria-label={`Offer ${label}`} onChange={(e) => update(r.uid, { active: e.target.checked })} />
                          </label>
                        </div>
                      );
                    })}
                    <button type="button" className="ob-add-svc" onClick={() => addRow(g.key)}>+ Add a service</button>
                  </section>
                );
              })}

          <section aria-labelledby="pol-h" className="ob-policy">
            <div className="stack" style={{ gap: 4 }}>
              <h2 id="pol-h" style={{ fontSize: 18, fontWeight: 600 }}>Booking and payment rules</h2>
              <p style={{ fontSize: 14, color: 'var(--ink-3)' }}>These show on your quotes, receipts and booking page.</p>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 24 }}>
              <div style={{ flex: '1 1 200px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                <label htmlFor="pol-adv" style={{ fontSize: 14, fontWeight: 500 }}>Advance to confirm a date</label>
                <span className="row" style={{ gap: 8, flexWrap: 'nowrap' }}>
                  <input id="pol-adv" className="ob-small-num num" inputMode="numeric" value={advance} aria-invalid={!!errors.advance || undefined}
                    aria-describedby={errors.advance ? 'pol-adv-err' : undefined}
                    onChange={(e) => { setAdvance(e.target.value.replace(/[^\d]/g, '').slice(0, 3)); setErrors((x) => ({ ...x, advance: '' })); }} />
                  <span style={{ fontSize: 15, color: 'var(--ink-2)' }}>% of the total</span>
                </span>
                {errors.advance && <span id="pol-adv-err" className="error-text" role="alert">{errors.advance}</span>}
              </div>
              <div style={{ flex: '1 1 260px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                <span id="bal-l" style={{ fontSize: 14, fontWeight: 500 }}>The rest is due</span>
                <div role="radiogroup" aria-labelledby="bal-l" className="ob-radio">
                  {([['event_day', 'On the event day'], ['before_event', 'Before the event']] as const).map(([v, l]) => (
                    <button key={v} type="button" role="radio" aria-checked={balanceDue === v} tabIndex={balanceDue === v ? 0 : -1} onClick={() => setBalanceDue(v)}
                      onKeyDown={(e) => {
                        if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) {
                          e.preventDefault();
                          const nv = balanceDue === 'event_day' ? 'before_event' : 'event_day';
                          setBalanceDue(nv);
                          (e.currentTarget.parentElement?.querySelector(`[data-v="${nv}"]`) as HTMLElement | null)?.focus();
                        }
                      }}
                      data-v={v}>{l}</button>
                  ))}
                </div>
              </div>
              <div style={{ flex: '1 1 200px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                <label htmlFor="pol-res" style={{ fontSize: 14, fontWeight: 500 }}>Notice needed to reschedule</label>
                <span className="row" style={{ gap: 8, flexWrap: 'nowrap' }}>
                  <input id="pol-res" className="ob-small-num num" inputMode="numeric" value={notice} aria-invalid={!!errors.notice || undefined}
                    aria-describedby={errors.notice ? 'pol-res-err' : undefined}
                    onChange={(e) => { setNotice(e.target.value.replace(/[^\d]/g, '').slice(0, 3)); setErrors((x) => ({ ...x, notice: '' })); }} />
                  <span style={{ fontSize: 15, color: 'var(--ink-2)' }}>days</span>
                </span>
                {errors.notice && <span id="pol-res-err" className="error-text" role="alert">{errors.notice}</span>}
              </div>
            </div>
            <fieldset className="ob-fieldset" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <legend style={{ fontSize: 14, fontWeight: 500, padding: 0, marginBottom: 10 }}>Ways clients can pay you</legend>
              <div className="row" style={{ gap: 8 }}>
                {METHODS.map((m) => (
                  <label key={m} htmlFor={`pm-${m}`} className="ob-method">
                    <input id={`pm-${m}`} type="checkbox" checked={methods.includes(m)}
                      onChange={() => setMethods((x) => (x.includes(m) ? x.filter((y) => y !== m) : [...x, m]))} />
                    {METHOD_LABEL[m]}
                  </label>
                ))}
              </div>
            </fieldset>
          </section>

          {formError && <div className="banner banner-danger" role="alert">{formError}</div>}
          {totalMissing > 0 && (
            <p className="small show-phone" style={{ color: 'var(--amber)' }}>
              {plural(totalMissing, 'service')} still need{totalMissing === 1 ? 's' : ''} a price. You can add {totalMissing === 1 ? 'it' : 'them'} later in Settings.
            </p>
          )}

          <div className="ob-setup-foot">
            <Link to="/setup/trade" className="ob-back">Back</Link>
            <span className="row" style={{ gap: 16, flexWrap: 'nowrap', minWidth: 0, flex: '1 1 auto', justifyContent: 'flex-end' }}>
              {totalMissing > 0 && <span className="small ob-foot-note" style={{ color: 'var(--amber)', minWidth: 0 }}>{plural(totalMissing, 'service')} still need{totalMissing === 1 ? 's' : ''} a price</span>}
              <button type="button" className="btn btn-primary btn-lg" style={{ borderRadius: 14, padding: '0 28px', flex: 'none' }} disabled={busy || loading} onClick={submit}>
                {busy ? 'Saving…' : 'Continue'}
              </button>
            </span>
          </div>
        </main>
      )}
    </div>
  );
}
