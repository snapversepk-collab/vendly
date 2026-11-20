import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { post } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useDocumentTitle } from '../lib/hooks';
import { AuthShell, GoogleButton, OrDivider, PasswordInput, SignInAside, fieldError, useConfig } from '../components/onboarding/Onboarding';

/** Only allow in-app paths for ?next= */
function safeNext(next: string | null) {
  return next && next.startsWith('/') && !next.startsWith('//') ? next : null;
}

export default function SignIn() {
  useDocumentTitle('Sign in');
  const [params] = useSearchParams();
  const next = safeNext(params.get('next'));
  const navigate = useNavigate();
  const { setToken } = useAuth();
  const { config } = useConfig();
  const [email, setEmail] = useState(params.get('email') ?? '');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ field: 'email' | 'password' | null; message: string } | null>(null);

  /** Navigate in the same tick as setToken so the public-only guard doesn't bounce us to /today first */
  const finish = (token: string, created = false) => {
    const p = setToken(token);
    navigate(created ? '/setup/trade' : next ?? '/today', { replace: true });
    return p;
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!email.trim()) return setError({ field: 'email', message: 'Enter your email' });
    if (!password) return setError({ field: 'password', message: 'Enter your password' });
    setBusy(true);
    try {
      const r = await post<{ token: string }>('/auth/signin', { email: email.trim(), password });
      await finish(r.token);
    } catch (err: any) {
      setBusy(false);
      if (err?.code === 'wrong_password') return setError({ field: 'password', message: "That email and password don't match." });
      const f = fieldError(err);
      setError({ field: f.field === 'email' ? 'email' : f.field === 'password' ? 'password' : null, message: f.message });
    }
  };

  const google = async (credential: string) => {
    setError(null);
    setBusy(true);
    try {
      const r = await post<{ token: string; created: boolean }>('/auth/google', { credential });
      await finish(r.token, r.created);
    } catch (err: any) {
      setBusy(false);
      setError({ field: null, message: err?.message ?? 'Google sign-in failed' });
    }
  };

  return (
    <AuthShell aside={<SignInAside />} phoneTagline="Every booking, in one calm place." footer={<p className="tiny faint">Vendly · Booking software for event vendors</p>}>
      <div className="stack" style={{ gap: 10 }}>
        <h1 className="ob-auth-title">Welcome back</h1>
        <p className="ob-auth-sub">
          <span className="hide-phone">Sign in to see today's bookings and what needs your attention.</span>
          <span className="show-phone">Sign in to see today's bookings.</span>
        </p>
      </div>

      {config?.googleClientId && (
        <>
          <GoogleButton clientId={config.googleClientId} text="continue_with" label="Continue with Google" onCredential={google} disabled={busy} />
          <OrDivider />
        </>
      )}

      <form className="stack" style={{ gap: 16 }} onSubmit={submit} noValidate>
        {error && !error.field && <div className="banner banner-danger" role="alert">{error.message}</div>}
        <div className="field">
          <label className="label" htmlFor="li-email">Email</label>
          <input id="li-email" className="input ob-input" type="email" autoComplete="email" inputMode="email" value={email}
            onChange={(e) => setEmail(e.target.value)} aria-invalid={error?.field === 'email' || undefined}
            aria-describedby={error?.field === 'email' ? 'li-email-err' : undefined} required />
          {error?.field === 'email' && <span id="li-email-err" className="error-text" role="alert">{error.message}</span>}
        </div>
        <div className="field">
          <div className="row" style={{ justifyContent: 'space-between', alignItems: 'baseline' }}>
            <label className="label" htmlFor="li-pass">Password</label>
            <Link to={`/forgot-password${email ? `?email=${encodeURIComponent(email)}` : ''}`} className="small" style={{ fontWeight: 500, color: 'var(--accent)' }}>
              <span className="hide-phone">Forgot password?</span>
              <span className="show-phone">Forgot?</span>
            </Link>
          </div>
          <PasswordInput id="li-pass" value={password} onChange={setPassword} autoComplete="current-password"
            invalid={error?.field === 'password'} describedBy={error?.field === 'password' ? 'li-pass-err' : undefined} />
          {error?.field === 'password' && (
            <span id="li-pass-err" className="error-text" role="alert">
              {error.message}{' '}
              {error.message.startsWith('That email') && <Link to="/forgot-password" style={{ color: 'inherit', textDecoration: 'underline' }}>Reset your password</Link>}
            </span>
          )}
        </div>
        <button type="submit" className="btn btn-primary btn-block ob-btn-main" style={{ marginTop: 4 }} disabled={busy}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
      <p className="small muted" style={{ fontSize: 14 }}>
        New to Vendly? <Link to="/signup" style={{ fontWeight: 500, color: 'var(--accent)' }}>Create an account</Link>
      </p>
    </AuthShell>
  );
}
