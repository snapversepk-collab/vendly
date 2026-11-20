import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { post } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useApi, useDocumentTitle } from '../lib/hooks';
import { Skeleton } from '../components/ui';
import { AuthShell, PasswordInput, SignInAside, fieldError, passwordProblem } from '../components/onboarding/Onboarding';

interface Invite { name: string; email: string; business_name: string; role: 'owner' | 'manager' | 'staff' }

const ROLE_TEXT: Record<Invite['role'], string> = {
  owner: 'as an owner',
  manager: 'as a manager. You can add bookings, record payments and answer inquiries',
  staff: 'as event staff. You will see your assigned events, times, venues and prep lists',
};

export default function AcceptInvite() {
  useDocumentTitle('Join your team');
  const { token = '' } = useParams();
  const navigate = useNavigate();
  const { setToken } = useAuth();
  const { data, error, loading, reload } = useApi<Invite>(`/auth/invite/${encodeURIComponent(token)}`);
  const [name, setName] = useState<string | null>(null);
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<{ name?: string; password?: string; form?: string }>({});

  const shownName = name ?? data?.name ?? '';

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const next: typeof errors = {};
    if (!shownName.trim()) next.name = 'Enter your name';
    const p = passwordProblem(password);
    if (p) next.password = p;
    setErrors(next);
    if (Object.keys(next).length) return;
    setBusy(true);
    try {
      const r = await post<{ token: string }>(`/auth/invite/${encodeURIComponent(token)}`, { name: shownName.trim(), password });
      const done = setToken(r.token);
      navigate('/today', { replace: true });
      await done;
    } catch (err) {
      setBusy(false);
      const f = fieldError(err);
      if (f.field === 'password') setErrors({ password: f.message });
      else if (f.field === 'name') setErrors({ name: f.message });
      else setErrors({ form: f.message });
    }
  };

  return (
    <AuthShell aside={<SignInAside />} phoneTagline="Every booking, in one calm place." footer={<p className="tiny faint">Vendly · Booking software for event vendors</p>}>
      {loading ? (
        <div className="stack" aria-busy="true" style={{ gap: 16 }}>
          <Skeleton h={44} w="80%" />
          <Skeleton h={20} w="95%" />
          <Skeleton h={50} />
          <Skeleton h={50} />
          <Skeleton h={52} />
        </div>
      ) : error ? (
        <>
          <div className="stack" style={{ gap: 10 }}>
            <h1 className="ob-auth-title">{error.status === 404 ? 'This invite has been used' : "That didn't load"}</h1>
            <p className="ob-auth-sub">
              {error.status === 404
                ? 'The link was already used to set a password, or it was cancelled. Sign in with your email, or ask the owner to send a new invite.'
                : error.message}
            </p>
          </div>
          <div className="row">
            <Link to="/signin" className="btn btn-primary">Sign in</Link>
            {error.status !== 404 && <button type="button" className="btn btn-ghost" onClick={reload}>Try again</button>}
          </div>
        </>
      ) : data ? (
        <>
          <div className="stack" style={{ gap: 10 }}>
            <h1 className="ob-auth-title">Join {data.business_name}</h1>
            <p className="ob-auth-sub">You've been added {ROLE_TEXT[data.role]}. Set a password to sign in.</p>
          </div>
          <form className="stack" style={{ gap: 16 }} onSubmit={submit} noValidate>
            {errors.form && <div className="banner banner-danger" role="alert">{errors.form}</div>}
            <div className="field">
              <span className="label">Email</span>
              <span className="input ob-input" style={{ display: 'flex', alignItems: 'center', background: 'var(--ground)', color: 'var(--ink-2)' }}>{data.email}</span>
            </div>
            <div className="field">
              <label className="label" htmlFor="ai-name">Your name</label>
              <input id="ai-name" className="input ob-input" type="text" autoComplete="name" value={shownName} onChange={(e) => setName(e.target.value)}
                aria-invalid={!!errors.name || undefined} aria-describedby={errors.name ? 'ai-name-err' : undefined} />
              {errors.name && <span id="ai-name-err" className="error-text" role="alert">{errors.name}</span>}
            </div>
            <div className="field">
              <label className="label" htmlFor="ai-pass">Password</label>
              <PasswordInput id="ai-pass" value={password} onChange={setPassword} autoComplete="new-password" invalid={!!errors.password}
                describedBy={errors.password ? 'ai-pass-err' : 'ai-pass-hint'} />
              {errors.password
                ? <span id="ai-pass-err" className="error-text" role="alert">{errors.password}</span>
                : <span id="ai-pass-hint" className="hint">At least 8 characters, with letters and numbers.</span>}
            </div>
            <button type="submit" className="btn btn-primary btn-block ob-btn-main" disabled={busy}>{busy ? 'Joining…' : `Join ${data.business_name}`}</button>
          </form>
        </>
      ) : null}
    </AuthShell>
  );
}
