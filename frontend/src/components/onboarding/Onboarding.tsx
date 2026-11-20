// Shared pieces for the onboarding group: landing, auth pages and the setup wizard.
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ApiError, get } from '../../lib/api';
import type { Plan } from '../../lib/types';
import { IconGoogle, Logo } from '../icons';
import './onboarding.css';

// ---------- /config (public) ----------
export interface AppConfig {
  appName: string;
  googleClientId: string | null;
  plans: Record<Plan, { name: string; price: number }>;
  freeBookingsPerMonth: number;
}
let configPromise: Promise<AppConfig> | null = null;
export function loadConfig() {
  if (!configPromise) {
    configPromise = get<AppConfig>('/config').catch((e) => {
      configPromise = null;
      throw e;
    });
  }
  return configPromise;
}
export function useConfig() {
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  useEffect(() => {
    let live = true;
    loadConfig().then((c) => live && setConfig(c), (e) => live && setError(e));
    return () => { live = false; };
  }, []);
  return { config, error, loading: !config && !error };
}

// ---------- Errors ----------
/** Map an API error to a form field. Zod errors carry `issues[0].path`. */
export function fieldError(e: unknown): { field: string | null; message: string } {
  const err = e as ApiError;
  const issue = err?.data?.issues?.[0];
  if (issue?.path?.length) return { field: String(issue.path[0]), message: issue.message };
  return { field: null, message: err?.message ?? 'Something went wrong' };
}

/** Client-side copy of the server's password rule */
export function passwordProblem(p: string): string | null {
  if (p.length < 8) return 'Use at least 8 characters';
  if (!/[A-Za-z]/.test(p) || !/\d/.test(p)) return 'Mix letters and numbers';
  return null;
}

// ---------- Brand ----------
export function Brand({ to = '/', light = false }: { to?: string | null; light?: boolean }) {
  const inner = (
    <>
      {light ? (
        // Same mark as <Logo/>, drawn light for dark backgrounds
        <svg width={30} height={30} viewBox="0 0 32 32" fill="none" aria-hidden="true">
          <rect x="3" y="5" width="26" height="24" rx="7" fill="var(--hero-ink)" />
          <path d="M10 3v5M22 3v5" stroke="var(--hero-ink)" strokeWidth="2.4" strokeLinecap="round" />
          <circle cx="20.5" cy="19.5" r="3.2" fill="var(--accent)" />
        </svg>
      ) : <Logo size={30} />}
      <span className="ob-brand-name">Vendly</span>
    </>
  );
  return to ? <Link to={to} className="ob-brand" aria-label="Vendly home">{inner}</Link> : <span className="ob-brand">{inner}</span>;
}

// ---------- Auth shell ----------
export function AuthShell({ children, aside, phoneTagline, footer }: { children: ReactNode; aside: ReactNode; phoneTagline: string; footer?: ReactNode }) {
  return (
    <div className="ob-auth">
      <div className="ob-phone-hero">
        <Brand light />
        <p>{phoneTagline}</p>
      </div>
      <main className="ob-auth-main">
        <div className="ob-auth-top"><Brand /></div>
        <div className="ob-auth-form">{children}</div>
        <div className="ob-auth-foot">{footer ?? <span />}</div>
      </main>
      {aside}
    </div>
  );
}

/** The dark side panel used on Sign in and the pages styled like it */
export function SignInAside() {
  const cards = [
    { dow: 'Fri', d: 4, title: 'Wedding reception', sub: '7:00 – 11:00 pm · Advance received', pill: 'confirmed', shift: -24 },
    { dow: 'Sat', d: 5, title: 'Corporate dinner', sub: '8:00 pm · Rs 1,20,000 · 40% paid', pill: 'confirmed', shift: 0 },
    { dow: 'Sun', d: 6, title: 'Birthday party', sub: '6:00 pm · Waiting for advance', pill: 'inquiry', shift: 24 },
  ] as const;
  return (
    <aside className="ob-auth-aside" aria-hidden="true">
      <div style={{ width: '100%', maxWidth: 420, display: 'flex', flexDirection: 'column', gap: 12 }}>
        {cards.map((c) => (
          <div key={c.d} className="ob-mini-card" style={{ transform: c.shift ? `translateX(${c.shift}px)` : undefined, opacity: c.shift ? 0.7 : 1 }}>
            <span className="ob-mini-date num">
              <span style={{ fontSize: 11, color: 'var(--ink-3)' }}>{c.dow}</span>
              <span style={{ fontSize: 20, fontWeight: 600, letterSpacing: '-0.02em' }}>{c.d}</span>
            </span>
            <span style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
              <span style={{ fontSize: 15, fontWeight: 600 }}>{c.title}</span>
              <span className="num" style={{ fontSize: 13, color: 'var(--ink-3)' }}>{c.sub}</span>
            </span>
            <span className={`pill pill-${c.pill}`}>{c.pill === 'confirmed' ? 'Confirmed' : 'Inquiry'}</span>
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, textAlign: 'center', maxWidth: 420 }}>
        <p style={{ fontSize: 30, lineHeight: 1.15, fontWeight: 600, letterSpacing: '-0.03em', textWrap: 'balance' } as CSSProperties}>Every booking, in one calm place.</p>
        <p style={{ fontSize: 15, color: 'var(--hero-ink-3)' }}>Dates, advances, prep and follow-ups, from first inquiry to final payment.</p>
      </div>
    </aside>
  );
}

// ---------- Inputs ----------
export function PasswordInput({ id, value, onChange, autoComplete, invalid, describedBy }: {
  id: string; value: string; onChange: (v: string) => void; autoComplete: string; invalid?: boolean; describedBy?: string;
}) {
  const [show, setShow] = useState(false);
  return (
    <div className="ob-pass">
      <input id={id} className="input ob-input" type={show ? 'text' : 'password'} autoComplete={autoComplete} value={value}
        onChange={(e) => onChange(e.target.value)} aria-invalid={invalid || undefined} aria-describedby={describedBy} required />
      <button type="button" aria-label={show ? 'Hide password' : 'Show password'} aria-pressed={show} onClick={() => setShow((s) => !s)}>
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
          <path d="M2 10s3-5.5 8-5.5S18 10 18 10s-3 5.5-8 5.5S2 10 2 10z" stroke="currentColor" strokeWidth="1.5" />
          <circle cx="10" cy="10" r="2.5" stroke="currentColor" strokeWidth="1.5" />
          {show && <path d="M3.5 3.5l13 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />}
        </svg>
      </button>
    </div>
  );
}

export function OrDivider({ children = 'or with email' }: { children?: ReactNode }) {
  return <div className="ob-or">{children}</div>;
}

// ---------- Google Identity Services ----------
declare global {
  interface Window { google?: any }
}
let gisPromise: Promise<void> | null = null;
function loadGis(): Promise<void> {
  if (window.google?.accounts?.id) return Promise.resolve();
  if (!gisPromise) {
    gisPromise = new Promise<void>((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'https://accounts.google.com/gsi/client';
      s.async = true;
      s.defer = true;
      s.onload = () => resolve();
      s.onerror = () => { gisPromise = null; s.remove(); reject(new Error('Could not load Google sign-in')); };
      document.head.appendChild(s);
    });
  }
  return gisPromise;
}
// GIS should be initialised once per page; the active button's handler is swapped in.
let gisHandler: ((credential: string) => void) | null = null;
let gisClientId: string | null = null;
function initGis(clientId: string) {
  if (gisClientId === clientId) return;
  gisClientId = clientId;
  window.google.accounts.id.initialize({
    client_id: clientId,
    callback: (r: { credential?: string }) => { if (r.credential) gisHandler?.(r.credential); },
    ux_mode: 'popup',
    auto_select: false,
    cancel_on_tap_outside: true,
  });
}

/**
 * Our styled "Continue with Google" button. Google's real button is rendered invisibly on top
 * so the click goes straight to Google (it cannot be triggered from a custom button).
 */
export function GoogleButton({ clientId, label, text, onCredential, disabled }: {
  clientId: string; label: string; text: 'signup_with' | 'continue_with' | 'signin_with'; onCredential: (credential: string) => void; disabled?: boolean;
}) {
  const wrap = useRef<HTMLDivElement>(null);
  const slot = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const handler = useRef(onCredential);
  handler.current = onCredential;

  useEffect(() => {
    let live = true;
    loadGis()
      .then(() => {
        if (!live || !slot.current) return;
        initGis(clientId);
        gisHandler = (c) => handler.current(c);
        const width = Math.min(400, Math.max(200, wrap.current?.offsetWidth ?? 320));
        slot.current.innerHTML = '';
        window.google.accounts.id.renderButton(slot.current, { type: 'standard', theme: 'outline', size: 'large', text, shape: 'rectangular', width });
        setState('ready');
      })
      .catch(() => live && setState('error'));
    return () => {
      live = false;
      gisHandler = null;
    };
  }, [clientId, text]);

  return (
    <div className="stack" style={{ gap: 6 }}>
      <div ref={wrap} className="ob-google" style={{ pointerEvents: disabled ? 'none' : undefined, opacity: disabled ? 0.6 : 1 }}>
        <div className="ob-google-visual" aria-hidden="true">
          <IconGoogle size={18} />
          {label}
        </div>
        <div ref={slot} className="ob-google-overlay" aria-label={label} />
      </div>
      {state === 'error' && <span className="error-text" role="alert">Google sign-in didn't load. Check your connection, or use your email below.</span>}
    </div>
  );
}

// ---------- Setup wizard ----------
export function SetupHeader({ step }: { step: 1 | 2 | 3 }) {
  return (
    <header className="ob-setup-head">
      <div className="ob-setup-head-inner">
        <Brand to={null} />
        <div className="ob-progress">
          <span className="num small muted" style={{ whiteSpace: 'nowrap' }}>Step {step} of 3</span>
          <span className="ob-progress-bars" role="progressbar" aria-valuemin={1} aria-valuemax={3} aria-valuenow={step} aria-label="Setup progress">
            {[1, 2, 3].map((n) => <span key={n} data-on={n <= step} />)}
          </span>
        </div>
        <Link to="/today" className="ob-skip">Skip for now</Link>
      </div>
    </header>
  );
}

/** Trade icon paths from the design canvas (24×24 stroke) */
export const TRADE_ICON: Record<string, string> = {
  photo_booth: 'M4 8h3l2-3h6l2 3h3v11H4zM12 16.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z',
  photographer: 'M3 7h12v10H3zM15 10.5l6-3.5v10l-6-3.5',
  decorator: 'M12 3v3M12 18v3M3 12h3M18 12h3M6 6l2 2M16 16l2 2M18 6l-2 2M8 16l-2 2',
  dj: 'M9 18V6l11-2v12M9 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0zM20 16a3 3 0 1 1-6 0 3 3 0 0 1 6 0z',
  mehndi_artist: 'M7 20c0-6 3-12 10-16-1 7-4 12-10 16zM7 20l5-6',
  caterer: 'M3 15h18M5 15a7 7 0 0 1 14 0M12 6V4M4 19h16',
  makeup_artist: 'M14 4l6 6-9 9H5v-6zM12 6l6 6',
  other: 'M12 5v14M5 12h14',
};
export function TradeIcon({ trade, size = 22 }: { trade: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d={TRADE_ICON[trade] ?? TRADE_ICON.other} stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
