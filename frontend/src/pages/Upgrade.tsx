// Plan comparison. Subscription payments aren't built yet: upgrading is a message to support, switched by hand.
import { Link } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { rs } from '../lib/format';
import { useApi, useDocumentTitle } from '../lib/hooks';
import type { Plan } from '../lib/types';
import { ErrorState, Skeleton } from '../components/ui';
import { IconCheck, IconChevronLeft } from '../components/icons';

const SUPPORT_EMAIL = 'support@vendly.pk';

interface Config { plans: Record<Plan, { name: string; price: number }>; freeBookingsPerMonth: number }

export default function Upgrade() {
  useDocumentTitle('Plans');
  const { business, user } = useAuth();
  const cfg = useApi<Config>('/config');
  const current = business?.plan ?? 'free';

  if (cfg.error && !cfg.data) return <ErrorState error={cfg.error} onRetry={cfg.reload} />;

  const n = cfg.data?.freeBookingsPerMonth ?? 10;
  const plans: { key: Plan; blurb: string; features: string[] }[] = [
    { key: 'free', blurb: 'To try Vendly with your next few events.', features: [`Up to ${n} bookings a month`, 'Calendar, Today and Agenda', 'Quotes, payments and checklists', 'Clash check on every date'] },
    { key: 'pro', blurb: 'For a vendor taking bookings every week.', features: ['Unlimited bookings', 'Your own booking page', 'WhatsApp receipts and reminders', 'Automatic emails to clients', 'One teammate'] },
    { key: 'team', blurb: 'For studios with staff at every event.', features: ['Everything in Pro', 'Add your whole team, with roles', 'Staff see their jobs, never money', 'Full Reports: months, functions, services'] },
  ];

  const mailto = (p: Plan) => {
    const name = cfg.data?.plans[p]?.name ?? p;
    const body = `Hi Vendly,\n\nPlease move ${business?.name ?? 'my business'}${business?.handle ? ` (${business.handle})` : ''} to the ${name} plan.\n\nAccount email: ${user?.email ?? ''}\n`;
    return `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(`Upgrade to ${name}`)}&body=${encodeURIComponent(body)}`;
  };

  return (
    <div className="page">
      <div className="stack" style={{ gap: 10 }}>
        <Link to="/settings" className="row small muted" style={{ gap: 6, minHeight: 32 }}><IconChevronLeft /> Settings</Link>
        <h1 className="h-page">Plans</h1>
        <p className="muted" style={{ maxWidth: '60ch' }}>
          You're on the <strong style={{ fontWeight: 600, color: 'var(--ink)' }}>{cfg.data?.plans[current]?.name ?? current}</strong> plan.
          Plans are switched by hand for now: message us and we'll move you over and confirm by email.
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 280px), 1fr))', gap: 20, alignItems: 'stretch' }}>
        {plans.map((p) => {
          const info = cfg.data?.plans[p.key];
          const isCurrent = p.key === current;
          const featured = p.key === 'pro';
          return (
            <section key={p.key} aria-labelledby={`pl-${p.key}`} className={featured ? 'card-hero' : 'card'} style={{ display: 'flex', flexDirection: 'column', gap: 18, padding: 28 }}>
              <div className="stack" style={{ gap: 6 }}>
                <div className="row" style={{ justifyContent: 'space-between' }}>
                  <h2 id={`pl-${p.key}`} className="h-section">{info?.name ?? p.key}</h2>
                  {isCurrent && <span className="pill" style={{ background: featured ? 'rgba(255,255,255,.12)' : 'var(--track)', color: featured ? 'var(--hero-ink)' : 'var(--ink-2)' }}>Your plan</span>}
                </div>
                {cfg.loading && !info ? <Skeleton h={40} w={140} /> : (
                  <p className="num" style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                    <span style={{ fontSize: 36, fontWeight: 600, letterSpacing: '-0.035em' }}>{rs(info?.price ?? 0)}</span>
                    {info && <span style={{ fontSize: 14, color: featured ? 'var(--hero-ink-3)' : 'var(--ink-3)' }}>a month</span>}
                  </p>
                )}
                <p style={{ fontSize: 14, color: featured ? 'var(--hero-ink-2)' : 'var(--ink-2)' }}>{p.blurb}</p>
              </div>
              <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 10, flex: 1 }}>
                {p.features.map((f) => (
                  <li key={f} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: 15 }}>
                    <span style={{ color: featured ? 'var(--hero-ink)' : 'var(--accent)', flex: 'none', marginTop: 1 }}><IconCheck size={18} /></span>
                    {f}
                  </li>
                ))}
              </ul>
              {isCurrent ? (
                <button type="button" className={`btn btn-block ${featured ? 'btn-on-dark' : 'btn-ghost'}`} disabled>Your current plan</button>
              ) : p.key === 'free' ? (
                <a className="btn btn-block btn-ghost" href={mailto('free')}>Message us to switch</a>
              ) : (
                <a className="btn btn-block" href={mailto(p.key)}
                  style={featured ? { background: 'var(--hero-ink)', color: 'var(--hero)' } : { background: 'var(--accent)', color: 'var(--on-accent)' }}>
                  Message us to upgrade
                </a>
              )}
            </section>
          );
        })}
      </div>

      <div className="card" style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 6 }}>
        <h2 className="h-section" style={{ fontSize: 16 }}>How upgrading works for now</h2>
        <p className="muted small" style={{ lineHeight: 1.6 }}>
          Online subscription payments are coming soon. Until then, email <a href={`mailto:${SUPPORT_EMAIL}`} style={{ color: 'var(--accent)' }}>{SUPPORT_EMAIL}</a> with your business name and
          the plan you want. We'll send payment details, switch your plan by hand and confirm by email. Your bookings and settings stay exactly as they are.
        </p>
      </div>
    </div>
  );
}
