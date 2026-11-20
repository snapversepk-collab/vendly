import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { get, post, tokenStore } from './api';
import { applyAppearance } from './theme';
import type { Business, Me, Role, User } from './types';

interface AuthState {
  loading: boolean;
  user: User | null;
  business: Business | null;
  role: Role | null;
  /** Owners and managers see money; event staff never do */
  canSeeMoney: boolean;
  refresh: () => Promise<Me | null>;
  signIn: (email: string, password: string) => Promise<void>;
  setToken: (token: string) => Promise<Me | null>;
  signOut: () => void;
}

const Ctx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!tokenStore.get()) {
      setMe(null);
      setLoading(false);
      return null;
    }
    try {
      const m = await get<Me>('/auth/me');
      setMe(m);
      applyAppearance(m.user.appearance);
      return m;
    } catch {
      setMe(null);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    const onExpired = () => setMe(null);
    window.addEventListener('auth:expired', onExpired);
    return () => window.removeEventListener('auth:expired', onExpired);
  }, [refresh]);

  const setToken = useCallback(async (t: string) => {
    tokenStore.set(t);
    setLoading(true);
    return refresh();
  }, [refresh]);

  const signIn = useCallback(async (email: string, password: string) => {
    const r = await post<{ token: string }>('/auth/signin', { email, password });
    await setToken(r.token);
  }, [setToken]);

  const signOut = useCallback(() => {
    tokenStore.clear();
    setMe(null);
  }, []);

  const role = me?.role ?? null;
  return (
    <Ctx.Provider value={{ loading, user: me?.user ?? null, business: me?.business ?? null, role, canSeeMoney: role === 'owner' || role === 'manager', refresh, signIn, setToken, signOut }}>
      {children}
    </Ctx.Provider>
  );
}

export function useAuth() {
  const c = useContext(Ctx);
  if (!c) throw new Error('useAuth outside AuthProvider');
  return c;
}

/** Gate for signed-in pages. Optionally restrict to roles. */
export function RequireAuth({ children, roles }: { children: ReactNode; roles?: Role[] }) {
  const { loading, user, role } = useAuth();
  const loc = useLocation();
  if (loading) return <FullPageSpinner />;
  if (!user) return <Navigate to={`/signin?next=${encodeURIComponent(loc.pathname + loc.search)}`} replace />;
  if (roles && (!role || !roles.includes(role))) return <Navigate to="/today" replace />;
  return <>{children}</>;
}

export function FullPageSpinner() {
  return (
    <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: 'var(--ground)' }} aria-busy="true">
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, color: 'var(--ink-3)', fontSize: 14 }}>
        <div className="skel" style={{ width: 40, height: 40, borderRadius: 12 }} />
        Loading…
      </div>
    </div>
  );
}
