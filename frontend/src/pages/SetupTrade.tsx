import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { post } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useApi, useDocumentTitle } from '../lib/hooks';
import type { Trade } from '../lib/types';
import { ErrorState, Skeleton } from '../components/ui';
import { SetupHeader, TradeIcon, fieldError } from '../components/onboarding/Onboarding';

const CITIES = ['Islamabad', 'Rawalpindi', 'Lahore', 'Karachi', 'Peshawar', 'Faisalabad', 'Multan'];
/** Local option for vendors whose trade isn't listed; the server stores it but seeds nothing */
const OTHER = { key: 'other', name: 'Something else', blurb: 'Tell us, and set up your own services' };

export default function SetupTrade() {
  useDocumentTitle('Set up your trade');
  const navigate = useNavigate();
  const { business, refresh } = useAuth();
  const { data: trades, error, loading, reload } = useApi<Trade[]>('/trades');
  const [picked, setPicked] = useState<string[]>(() => business?.trades ?? []);
  const [cities, setCities] = useState<string[]>(() => business?.cities ?? []);
  const [allCities, setAllCities] = useState<string[]>(() => [...CITIES, ...(business?.cities ?? []).filter((c) => !CITIES.includes(c))]);
  const [capacity, setCapacity] = useState(business?.capacityPerDate ?? 1);
  const [adding, setAdding] = useState(false);
  const [newCity, setNewCity] = useState('');
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const cityInput = useRef<HTMLInputElement>(null);

  useEffect(() => { if (adding) cityInput.current?.focus(); }, [adding]);

  const toggle = (list: string[], v: string) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

  const addCity = (e?: FormEvent) => {
    e?.preventDefault();
    const c = newCity.trim().replace(/\s+/g, ' ').replace(/\b\w/g, (m) => m.toUpperCase());
    if (c) {
      const existing = allCities.find((x) => x.toLowerCase() === c.toLowerCase());
      if (!existing) setAllCities((x) => [...x, c]);
      setCities((x) => (x.includes(existing ?? c) ? x : [...x, existing ?? c]));
    }
    setNewCity('');
    setAdding(false);
  };

  const submit = async () => {
    if (!picked.length) return;
    setBusy(true);
    setFormError(null);
    try {
      await post('/setup/trades', { trades: picked, cities, capacityPerDate: capacity });
      await refresh();
      navigate('/setup/services');
    } catch (err) {
      setFormError(fieldError(err).message);
      setBusy(false);
    }
  };

  const options = trades ? [...trades.map((t) => ({ key: t.key, name: t.name, blurb: t.blurb })), OTHER] : [];

  return (
    <div className="ob-setup">
      <SetupHeader step={1} />
      {error && !trades ? (
        <ErrorState error={error} onRetry={reload} />
      ) : (
        <main className="ob-setup-main">
          <div className="stack" style={{ gap: 10 }}>
            <h1 className="ob-setup-title">What does {business?.name ?? 'your business'} do?</h1>
            <p className="ob-setup-lede">Pick everything you offer. We'll set up typical services and checklists for each one, and you can change them later.</p>
          </div>

          <fieldset className="ob-fieldset">
            <legend className="ob-legend">Your trade</legend>
            <div className="ob-trades">
              {loading && !trades
                ? Array.from({ length: 8 }, (_, i) => <Skeleton key={i} h={150} r={20} />)
                : options.map((t) => {
                    const on = picked.includes(t.key);
                    return (
                      <label key={t.key} className="ob-trade" data-on={on} htmlFor={`tr-${t.key}`}>
                        <input id={`tr-${t.key}`} type="checkbox" checked={on} onChange={() => setPicked((x) => toggle(x, t.key))} />
                        <span className="ob-trade-icon"><TradeIcon trade={t.key} /></span>
                        <span style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                          <span style={{ fontSize: 16, fontWeight: 600 }}>{t.name}</span>
                          <span style={{ fontSize: 13, lineHeight: 1.4, color: 'var(--ink-3)' }}>{t.blurb}</span>
                        </span>
                      </label>
                    );
                  })}
            </div>
          </fieldset>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 32 }}>
            <fieldset className="ob-fieldset" style={{ flex: '2 1 420px' }}>
              <legend className="ob-legend">Cities you cover</legend>
              <div className="row" style={{ gap: 8 }}>
                {allCities.map((c) => (
                  <button key={c} type="button" className="ob-city" aria-pressed={cities.includes(c)} onClick={() => setCities((x) => toggle(x, c))}>{c}</button>
                ))}
                {adding ? (
                  <form onSubmit={addCity} className="row" style={{ gap: 6 }}>
                    <label htmlFor="new-city" className="sr-only">City name</label>
                    <input id="new-city" ref={cityInput} className="input" style={{ height: 40, width: 160, borderRadius: 999 }} value={newCity} placeholder="City name"
                      onChange={(e) => setNewCity(e.target.value)} onKeyDown={(e) => e.key === 'Escape' && (setAdding(false), setNewCity(''))} onBlur={() => !newCity.trim() && setAdding(false)} />
                    <button type="submit" className="btn btn-dark btn-sm" style={{ borderRadius: 999 }}>Add</button>
                  </form>
                ) : (
                  <button type="button" className="ob-city-add" onClick={() => setAdding(true)}>+ Add a city</button>
                )}
              </div>
            </fieldset>
            <div style={{ flex: '1 1 280px', display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0 }}>
              <span id="cap-l" style={{ fontSize: 15, fontWeight: 600 }}>Events you can cover on the same date</span>
              <div role="group" aria-labelledby="cap-l" className="ob-stepper">
                <button type="button" aria-label="One fewer" disabled={capacity <= 1} onClick={() => setCapacity((c) => Math.max(1, c - 1))}>−</button>
                <output className="num" aria-live="polite">{capacity}</output>
                <button type="button" aria-label="One more" disabled={capacity >= 50} onClick={() => setCapacity((c) => Math.min(50, c + 1))}>+</button>
              </div>
              <span style={{ fontSize: 13, lineHeight: 1.45, color: 'var(--ink-3)' }}>
                {capacity === 1
                  ? 'One team or one setup. Vendly warns you when a date is already full.'
                  : `${capacity} teams or setups. Vendly warns you when a date already has ${capacity} events.`}
              </span>
            </div>
          </div>

          {formError && <div className="banner banner-danger" role="alert">{formError}</div>}

          <div className="ob-setup-foot" style={{ justifyContent: 'flex-end' }}>
            {!picked.length && trades && <span className="small faint hide-phone">Pick at least one trade to continue</span>}
            <button type="button" className="btn btn-primary btn-lg" style={{ borderRadius: 14, padding: '0 28px' }} disabled={!picked.length || busy} onClick={submit}>
              {busy ? 'Setting up…' : 'Continue'}
            </button>
          </div>
        </main>
      )}
    </div>
  );
}
