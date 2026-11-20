import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { post } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useDocumentTitle } from '../lib/hooks';
import { AuthShell, PasswordInput, SignInAside, fieldError, passwordProblem } from '../components/onboarding/Onboarding';

export default function ResetPassword() {
  useDocumentTitle('Set a new password');
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const navigate = useNavigate();
  const { setToken } = useAuth();
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expired, setExpired] = useState(!token);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    const p = passwordProblem(password);
    if (p) return setError(p);
    setBusy(true);
    try {
      const r = await post<{ token: string }>('/auth/reset', { token, password });
      const done = setToken(r.token);
      navigate('/today', { replace: true });
      await done;
    } catch (err: any) {
      setBusy(false);
      if (err?.code === 'expired' || fieldError(err).field === 'token') return setExpired(true);
      setError(fieldError(err).message);
    }
  };

  return (
    <AuthShell aside={<SignInAside />} phoneTagline="Every booking, in one calm place." footer={<p className="tiny faint">Vendly · Booking software for event vendors</p>}>
      {expired ? (
        <>
          <div className="stack" style={{ gap: 10 }}>
            <h1 className="ob-auth-title">This link has expired</h1>
            <p className="ob-auth-sub">Reset links work once, for one hour. Ask for a new one and use it straight away.</p>
          </div>
          <div className="row">
            <Link to="/forgot-password" className="btn btn-primary">Send a new link</Link>
            <Link to="/signin" className="btn btn-ghost">Back to sign in</Link>
          </div>
        </>
      ) : (
        <>
          <div className="stack" style={{ gap: 10 }}>
            <h1 className="ob-auth-title">Set a new password</h1>
            <p className="ob-auth-sub">Choose a password you don't use anywhere else. You'll be signed in straight after.</p>
          </div>
          <form className="stack" style={{ gap: 16 }} onSubmit={submit} noValidate>
            <div className="field">
              <label className="label" htmlFor="rp-pass">New password</label>
              <PasswordInput id="rp-pass" value={password} onChange={(v) => { setPassword(v); setError(null); }} autoComplete="new-password"
                invalid={!!error} describedBy={error ? 'rp-err' : 'rp-hint'} />
              {error ? <span id="rp-err" className="error-text" role="alert">{error}</span> : <span id="rp-hint" className="hint">At least 8 characters, with letters and numbers.</span>}
            </div>
            <button type="submit" className="btn btn-primary btn-block ob-btn-main" disabled={busy}>{busy ? 'Saving…' : 'Save and sign in'}</button>
          </form>
        </>
      )}
    </AuthShell>
  );
}
