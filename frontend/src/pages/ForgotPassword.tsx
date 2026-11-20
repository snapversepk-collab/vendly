import { useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { post } from '../lib/api';
import { useDocumentTitle } from '../lib/hooks';
import { AuthShell, SignInAside, fieldError } from '../components/onboarding/Onboarding';

export default function ForgotPassword() {
  useDocumentTitle('Reset your password');
  const [params] = useSearchParams();
  const [email, setEmail] = useState(params.get('email') ?? '');
  const [busy, setBusy] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    const v = email.trim();
    if (!/^\S+@\S+\.\S+$/.test(v)) return setError('Enter a valid email');
    setBusy(true);
    try {
      await post('/auth/forgot', { email: v });
      setSentTo(v);
    } catch (err) {
      setError(fieldError(err).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthShell aside={<SignInAside />} phoneTagline="Every booking, in one calm place." footer={<p className="tiny faint">Vendly · Booking software for event vendors</p>}>
      {sentTo ? (
        <>
          <div className="stack" style={{ gap: 10 }}>
            <h1 className="ob-auth-title">Check your email</h1>
            <p className="ob-auth-sub">
              If there's a Vendly account for <b style={{ color: 'var(--ink)' }}>{sentTo}</b>, we've sent a link to set a new password. It works for one hour.
            </p>
          </div>
          <div className="banner banner-neutral">Nothing arrived after a few minutes? Check your spam folder, or try again.</div>
          <div className="row">
            <button type="button" className="btn btn-ghost" onClick={() => setSentTo(null)}>Try another email</button>
            <Link to="/signin" className="btn btn-primary">Back to sign in</Link>
          </div>
        </>
      ) : (
        <>
          <div className="stack" style={{ gap: 10 }}>
            <h1 className="ob-auth-title">Forgot your password?</h1>
            <p className="ob-auth-sub">Enter the email you sign in with. We'll send you a link to set a new one.</p>
          </div>
          <form className="stack" style={{ gap: 16 }} onSubmit={submit} noValidate>
            <div className="field">
              <label className="label" htmlFor="fp-email">Email</label>
              <input id="fp-email" className="input ob-input" type="email" inputMode="email" autoComplete="email" value={email} autoFocus
                onChange={(e) => setEmail(e.target.value)} aria-invalid={!!error || undefined} aria-describedby={error ? 'fp-err' : undefined} />
              {error && <span id="fp-err" className="error-text" role="alert">{error}</span>}
            </div>
            <button type="submit" className="btn btn-primary btn-block ob-btn-main" disabled={busy}>{busy ? 'Sending…' : 'Send reset link'}</button>
          </form>
          <p className="muted" style={{ fontSize: 14 }}>
            Remembered it? <Link to="/signin" style={{ fontWeight: 500, color: 'var(--accent)' }}>Sign in</Link>
          </p>
        </>
      )}
    </AuthShell>
  );
}
