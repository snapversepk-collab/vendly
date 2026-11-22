import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { patch } from '../lib/api';
import { useAuth } from '../lib/auth';
import { bookingPageUrl, fmtPhone, fmtShort, plural, rsShort } from '../lib/format';
import { useApi, useDebounced, useDocumentTitle } from '../lib/hooks';
import type { Plan } from '../lib/types';
import { IconSearch } from '../components/icons';
import { EmptyState, ErrorState, PageSkeleton, Skeleton, useToast } from '../components/ui';

interface Overview {
  businesses: number; users: number; bookings: number; bookingsThisMonth: number; inquiries: number;
  signups7d: number; signups30d: number; paymentsRecorded: number; plans: Partial<Record<Plan, number>>; freeLimit: number;
}
interface AdminBusiness {
  id: string; name: string; handle: string | null; plan: Plan; whatsapp: string | null; cities: string[]; trades: string[];
  createdAt: string; ownerName: string | null; ownerEmail: string | null; members: number;
  bookings: number; bookingsThisMonth: number; inquiries: number; lastActive: string | null;
}

const PLANS: Plan[] = ['free', 'pro', 'team'];
const PLAN_LABEL: Record<Plan, string> = { free: 'Free', pro: 'Pro', team: 'Team' };
const day = (iso: string | null) => (iso ? fmtShort(new Date(new Date(iso).getTime() + 5 * 3600e3).toISOString().slice(0, 10)) : '—');

/** Platform admin: every vendor on Vendly, their usage, and their plan. */
export default function Admin() {
  useDocumentTitle('Admin');
  const { isPlatformAdmin, loading: authLoading } = useAuth();
  const toast = useToast();
  const [q, setQ] = useState('');
  const [plan, setPlan] = useState<Plan | ''>('');
  const dq = useDebounced(q, 250);
  const overview = useApi<Overview>(isPlatformAdmin ? '/admin/overview' : null);
  const list = useApi<AdminBusiness[]>(isPlatformAdmin ? '/admin/businesses' : null, { q: dq, plan: plan || undefined });
  const [saving, setSaving] = useState<string | null>(null);

  if (authLoading) return <PageSkeleton />;
  if (!isPlatformAdmin) return <Navigate to="/today" replace />;
  if (overview.error) return <ErrorState error={overview.error} onRetry={overview.reload} />;

  const changePlan = async (b: AdminBusiness, next: Plan) => {
    if (next === b.plan) return;
    setSaving(b.id);
    try {
      await patch(`/admin/businesses/${b.id}`, { plan: next });
      list.setData((rows) => rows?.map((r) => (r.id === b.id ? { ...r, plan: next } : r)) ?? rows);
      overview.reload();
      toast({ text: `${b.name} is now on ${PLAN_LABEL[next]}` });
    } catch (e: any) {
      toast({ text: e.message ?? 'Could not change the plan', tone: 'error' });
    } finally {
      setSaving(null);
    }
  };

  const o = overview.data;
  const tiles: [string, string, string?][] = o
    ? [
        ['Vendors', String(o.businesses), `${o.signups7d} new this week · ${o.signups30d} in 30 days`],
        ['Bookings', String(o.bookings), `${o.bookingsThisMonth} added this month`],
        ['Booking page inquiries', String(o.inquiries)],
        ['Payments recorded', rsShort(o.paymentsRecorded), 'Money vendors logged, all time'],
      ]
    : [];

  return (
    <div className="page">
      <section className="stack" style={{ gap: 8 }}>
        <p className="faint small">Platform admin</p>
        <h1 className="h-page">All vendors</h1>
        <p className="muted">
          Everyone who signed up for Vendly. Change a vendor's plan here once they've paid; subscriptions aren't charged in the app yet.
        </p>
      </section>

      <dl className="stats" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
        {o
          ? tiles.map(([label, value, hint]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd className="num" style={{ fontSize: 28, letterSpacing: '-0.02em' }}>{value}</dd>
                {hint && <p className="tiny faint" style={{ marginTop: 4 }}>{hint}</p>}
              </div>
            ))
          : [0, 1, 2, 3].map((i) => <div key={i}><Skeleton h={14} w={90} /><Skeleton h={30} w={70} style={{ marginTop: 8 }} /></div>)}
      </dl>

      {o && (
        <div className="row small muted" style={{ gap: 16 }}>
          {PLANS.map((p) => (
            <span key={p} className="row" style={{ gap: 6 }}>
              <span className={`pill ${p === 'free' ? 'pill-neutral' : p === 'pro' ? 'pill-inquiry' : 'pill-confirmed'}`}>{PLAN_LABEL[p]}</span>
              <span className="num">{o.plans[p] ?? 0}</span>
            </span>
          ))}
          <span className="faint">Free plan: {o.freeLimit} bookings a month</span>
        </div>
      )}

      <section className="card card-tight">
        <div className="row" style={{ padding: '12px 12px 16px', gap: 10 }}>
          <label style={{ position: 'relative', flex: '1 1 260px', display: 'flex', alignItems: 'center' }}>
            <span style={{ position: 'absolute', left: 14, color: 'var(--ink-3)', display: 'flex' }}><IconSearch /></span>
            <span className="sr-only">Search vendors</span>
            <input className="input" style={{ paddingLeft: 40 }} type="search" placeholder="Search name, link, owner email, phone" value={q} onChange={(e) => setQ(e.target.value)} />
          </label>
          <div className="seg" role="group" aria-label="Filter by plan">
            <button type="button" aria-pressed={plan === ''} onClick={() => setPlan('')}>All</button>
            {PLANS.map((p) => (
              <button key={p} type="button" aria-pressed={plan === p} onClick={() => setPlan(p)}>{PLAN_LABEL[p]}</button>
            ))}
          </div>
        </div>

        {list.loading && !list.data ? (
          <div className="stack" style={{ padding: 12 }}>{[0, 1, 2].map((i) => <Skeleton key={i} h={56} />)}</div>
        ) : list.error ? (
          <EmptyState title="That didn't load">{list.error.message}</EmptyState>
        ) : !list.data?.length ? (
          <EmptyState title={q || plan ? 'No vendors match' : 'No vendors yet'}>
            {q || plan ? 'Try another search or plan.' : 'Vendors appear here as soon as they sign up.'}
          </EmptyState>
        ) : (
          <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {list.data.map((b) => (
              <li key={b.id} className="hov" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 2fr) minmax(0, 1.4fr) auto', gap: 16, alignItems: 'center', padding: '14px 16px', borderRadius: 16, borderTop: '1px solid var(--line-soft)' }}>
                <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 3 }}>
                  <span style={{ fontWeight: 600, fontSize: 15 }}>{b.name}</span>
                  <span className="small faint" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {b.ownerName ?? 'No owner'}{b.ownerEmail ? ` · ${b.ownerEmail}` : ''}{b.whatsapp ? ` · ${fmtPhone(b.whatsapp)}` : ''}
                  </span>
                  {b.handle && (
                    <a className="small" href={bookingPageUrl(b.handle)} target="_blank" rel="noreferrer" style={{ color: 'var(--accent)' }}>/b/{b.handle}</a>
                  )}
                </div>
                <div className="small muted num" style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                  <span>{plural(b.bookings, 'booking')} · {b.bookingsThisMonth} this month</span>
                  <span className="faint">{plural(b.inquiries, 'inquiry', 'inquiries')} · {plural(b.members, 'member')}</span>
                  <span className="faint">Joined {day(b.createdAt)} · active {day(b.lastActive)}</span>
                </div>
                <label className="field" style={{ minWidth: 110 }}>
                  <span className="sr-only">Plan for {b.name}</span>
                  <select className="select" value={b.plan} disabled={saving === b.id} onChange={(e) => changePlan(b, e.target.value as Plan)} style={{ height: 40 }}>
                    {PLANS.map((p) => <option key={p} value={p}>{PLAN_LABEL[p]}</option>)}
                  </select>
                  {b.plan === 'free' && b.bookingsThisMonth >= (o?.freeLimit ?? Infinity) && (
                    <span className="tiny" style={{ color: 'var(--amber)' }}>At the Free limit</span>
                  )}
                </label>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
