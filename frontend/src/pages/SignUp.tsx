import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { post } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useDocumentTitle } from '../lib/hooks';
import { AuthShell, GoogleButton, OrDivider, PasswordInput, fieldError, passwordProblem, useConfig } from '../components/onboarding/Onboarding';

type FieldKey = 'name' | 'businessName' | 'whatsapp' | 'email' | 'password';

const STEPS = [
  { n: 1, title: 'Pick what you do', body: 'Photo booth, photography, decor, DJ, mehndi, catering or makeup. You can choose more than one.' },
  { n: 2, title: 'Check your services and advance rule', body: 'We fill in typical services for your trade. Change the hours, prices and advance to match yours.' },
  { n: 3, title: 'Share your booking page', body: 'Put one link in your Instagram bio and WhatsApp status. Inquiries arrive in Vendly.' },
];

/** "0300 1234567" / "300-1234567" -> "3001234567" (10 digits after +92) */
const waDigits = (s: string) => s.replace(/\D/g, '').replace(/^92(?=3\d{9}$)/, '').replace(/^0/, '');

export default function SignUp() {
  useDocumentTitle('Create your account');
  const navigate = useNavigate();
  const { setToken } = useAuth();
  const { config } = useConfig();
  const [f, setF] = useState({ name: '', businessName: '', whatsapp: '', email: '', password: '' });
  const [errors, setErrors] = useState<Partial<Record<FieldKey, string>>>({});
  const [emailTaken, setEmailTaken] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: FieldKey) => (v: string) => {
    setF((x) => ({ ...x, [k]: v }));
    if (errors[k]) setErrors((x) => ({ ...x, [k]: undefined }));
    if (k === 'email') setEmailTaken(false);
  };

  const validate = () => {
    const e: Partial<Record<FieldKey, string>> = {};
    if (!f.name.trim()) e.name = 'Enter your name';
    if (!f.businessName.trim()) e.businessName = 'Enter your business name';
    const wa = waDigits(f.whatsapp);
    if (!wa) e.whatsapp = 'Enter your WhatsApp number';
    else if (!/^3\d{9}$/.test(wa)) e.whatsapp = 'Enter a mobile number like 300 1234567';
    if (!/^\S+@\S+\.\S+$/.test(f.email.trim())) e.email = 'Enter a valid email';
    const p = passwordProblem(f.password);
    if (p) e.password = p;
    return e;
  };

  const finish = (token: string, to: string) => {
    const p = setToken(token);
    navigate(to, { replace: true });
    return p;
  };

  const submit = async (ev: FormEvent) => {
    ev.preventDefault();
    setFormError(null);
    setEmailTaken(false);
    const e = validate();
    setErrors(e);
    if (Object.keys(e).length) {
      document.getElementById(`su-${Object.keys(e)[0]}`)?.focus();
      return;
    }
    setBusy(true);
    try {
      const r = await post<{ token: string }>('/auth/signup', {
        name: f.name.trim(), businessName: f.businessName.trim(), whatsapp: '0' + waDigits(f.whatsapp), email: f.email.trim(), password: f.password,
      });
      await finish(r.token, '/setup/trade');
    } catch (err: any) {
      setBusy(false);
      if (err?.code === 'email_taken') {
        setEmailTaken(true);
        setErrors({ email: 'An account with this email already exists.' });
        return;
      }
      const fe = fieldError(err);
      if (fe.field && ['name', 'businessName', 'whatsapp', 'email', 'password'].includes(fe.field)) setErrors({ [fe.field]: fe.message });
      else setFormError(fe.message);
    }
  };

  const google = async (credential: string) => {
    setFormError(null);
    setBusy(true);
    try {
      const wa = waDigits(f.whatsapp);
      const r = await post<{ token: string; created: boolean }>('/auth/google', {
        credential, businessName: f.businessName.trim() || undefined, whatsapp: /^3\d{9}$/.test(wa) ? '0' + wa : undefined,
      });
      await finish(r.token, r.created ? '/setup/trade' : '/today');
    } catch (err: any) {
      setBusy(false);
      setFormError(err?.message ?? 'Google sign-up failed');
    }
  };

  const err = (k: FieldKey) => errors[k] && <span id={`su-${k}-err`} className="error-text" role="alert">{errors[k]}</span>;
  const aria = (k: FieldKey) => ({ 'aria-invalid': errors[k] ? true : undefined, 'aria-describedby': errors[k] ? `su-${k}-err` : undefined });
  const inputStyle = { height: 48, borderRadius: 14 };

  return (
    <AuthShell
      phoneTagline="Ready to take bookings in about five minutes."
      aside={
        <aside className="ob-auth-aside" aria-labelledby="next-h">
          <div style={{ width: '100%', maxWidth: 440, display: 'flex', flexDirection: 'column', gap: 32 }}>
            <h2 id="next-h" style={{ fontSize: 34, lineHeight: 1.1, fontWeight: 600, letterSpacing: '-0.03em' }}>You'll be ready to take bookings in about five minutes.</h2>
            <ol className="ob-steps">
              {STEPS.map((s) => (
                <li key={s.n}>
                  <span className="num">{s.n}</span>
                  <span style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                    <span style={{ fontSize: 16, fontWeight: 600 }}>{s.title}</span>
                    <span style={{ fontSize: 14, lineHeight: 1.45, color: 'var(--hero-ink-3)' }}>{s.body}</span>
                  </span>
                </li>
              ))}
            </ol>
          </div>
        </aside>
      }
    >
      <div className="stack" style={{ gap: 8 }}>
        <h1 className="ob-auth-title">Create your account</h1>
        <p className="ob-auth-sub">Free to start. No card needed.</p>
      </div>

      {config?.googleClientId && (
        <>
          <GoogleButton clientId={config.googleClientId} text="signup_with" label="Sign up with Google" onCredential={google} disabled={busy} />
          <OrDivider />
        </>
      )}

      <form className="stack" style={{ gap: 14 }} onSubmit={submit} noValidate>
        {formError && <div className="banner banner-danger" role="alert">{formError}</div>}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12 }}>
          <div className="field">
            <label className="label" htmlFor="su-name">Your name</label>
            <input id="su-name" className="input" style={inputStyle} type="text" autoComplete="name" value={f.name} onChange={(e) => set('name')(e.target.value)} {...aria('name')} />
            {err('name')}
          </div>
          <div className="field">
            <label className="label" htmlFor="su-businessName">Business name</label>
            <input id="su-businessName" className="input" style={inputStyle} type="text" autoComplete="organization" value={f.businessName} onChange={(e) => set('businessName')(e.target.value)} {...aria('businessName')} />
            {err('businessName')}
          </div>
        </div>
        <div className="field">
          <label className="label" htmlFor="su-whatsapp">Business WhatsApp number</label>
          <div className="ob-wa">
            <span className="ob-wa-pre num" aria-hidden="true">+92</span>
            <input id="su-whatsapp" className="input num" style={{ ...inputStyle, flex: 1, minWidth: 0 }} type="tel" inputMode="tel" autoComplete="tel-national"
              placeholder="300 1234567" value={f.whatsapp} onChange={(e) => set('whatsapp')(e.target.value)} {...aria('whatsapp')}
              aria-describedby={errors.whatsapp ? 'su-whatsapp-err' : 'su-whatsapp-hint'} />
          </div>
          {errors.whatsapp ? err('whatsapp') : <span id="su-whatsapp-hint" className="hint">Clients will message you here from your booking page.</span>}
        </div>
        <div className="field">
          <label className="label" htmlFor="su-email">Email</label>
          <input id="su-email" className="input" style={inputStyle} type="email" inputMode="email" autoComplete="email" value={f.email} onChange={(e) => set('email')(e.target.value)} {...aria('email')} />
          {errors.email && (
            <span id="su-email-err" className="error-text" role="alert">
              {errors.email}{' '}
              {emailTaken && <Link to={`/signin?email=${encodeURIComponent(f.email.trim())}`} style={{ color: 'inherit', fontWeight: 600, textDecoration: 'underline' }}>Sign in instead</Link>}
            </span>
          )}
        </div>
        <div className="field">
          <label className="label" htmlFor="su-password">Password</label>
          <PasswordInput id="su-password" value={f.password} onChange={set('password')} autoComplete="new-password" invalid={!!errors.password}
            describedBy={errors.password ? 'su-password-err' : 'su-password-hint'} />
          {errors.password ? err('password') : <span id="su-password-hint" className="hint">At least 8 characters, with letters and numbers.</span>}
        </div>
        <button type="submit" className="btn btn-primary btn-block ob-btn-main" style={{ marginTop: 4 }} disabled={busy}>
          {busy ? 'Creating your account…' : 'Create account'}
        </button>
        <p className="tiny faint" style={{ lineHeight: 1.5 }}>
          By creating an account you agree to the <a href="#terms" style={{ color: 'var(--ink-2)', textDecoration: 'underline' }}>Terms</a> and{' '}
          <a href="#privacy" style={{ color: 'var(--ink-2)', textDecoration: 'underline' }}>Privacy policy</a>.
        </p>
      </form>
      <p className="muted" style={{ fontSize: 14 }}>
        Already have an account? <Link to="/signin" style={{ fontWeight: 500, color: 'var(--accent)' }}>Sign in</Link>
      </p>
    </AuthShell>
  );
}
