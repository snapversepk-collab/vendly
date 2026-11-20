import { Link } from 'react-router-dom';
import { displayHost, fnColor, groupPk } from '../lib/format';
import { useDocumentTitle } from '../lib/hooks';
import { Skeleton } from '../components/ui';
import { Brand, TradeIcon, useConfig } from '../components/onboarding/Onboarding';

const STRIP: { dow: string; d: number; k: 'conf' | 'inq' | 'open'; today?: boolean }[] = [
  { dow: 'Wed', d: 18, k: 'conf', today: true }, { dow: 'Thu', d: 19, k: 'conf' }, { dow: 'Fri', d: 20, k: 'inq' }, { dow: 'Sat', d: 21, k: 'conf' },
  { dow: 'Sun', d: 22, k: 'conf' }, { dow: 'Mon', d: 23, k: 'open' }, { dow: 'Tue', d: 24, k: 'inq' },
];
const TRADES = [
  ['photo_booth', 'Photo booths'], ['photographer', 'Photography and video'], ['decorator', 'Decor and lighting'], ['dj', 'DJ and sound'],
  ['mehndi_artist', 'Mehndi artists'], ['caterer', 'Catering'], ['makeup_artist', 'Makeup and bridal'],
];

function Tick({ color }: { color: string }) {
  return (
    <svg width="18" height="18" viewBox="0 0 16 16" fill="none" aria-hidden="true" style={{ flex: 'none', marginTop: 1 }}>
      <path d="M3.5 8.5l3 3 6-7" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function Landing() {
  useDocumentTitle('Booking software for event vendors');
  const { config, error } = useConfig();
  const host = displayHost();
  const price = (n: number | undefined) => (n === undefined ? null : n === 0 ? 'Rs 0' : `Rs ${groupPk(n)}`);
  const free = config?.freeBookingsPerMonth;

  const plans = [
    { key: 'free' as const, name: 'Free', per: 'forever', who: 'For trying it out and quieter months.', cta: 'Start free', popular: false,
      items: [free ? `Up to ${free} bookings a month` : 'A few bookings a month', 'Calendar and date clash warnings', 'Payments and checklists', 'Phone and desktop'] },
    { key: 'pro' as const, name: 'Pro', per: 'a month', who: 'For a vendor running a full season.', cta: 'Start free, upgrade later', popular: true,
      items: ['Unlimited bookings', 'Your own booking page', 'WhatsApp reminders and receipts', 'Branded quotes in rupees'] },
    { key: 'team' as const, name: 'Team', per: 'a month', who: 'For vendors with staff or more than one setup.', cta: 'Start free, upgrade later', popular: false,
      items: ['Everything in Pro', 'Staff logins with roles', 'Several teams on the same date', 'Season and money reports'] },
  ];

  return (
    <div className="ob-land">
      <header style={{ borderBottom: '1px solid var(--line)' }}>
        <div className="ob-wrap ob-land-nav">
          <Brand />
          <nav aria-label="Site">
            <a href="#features">Features</a>
            <a href="#trades">Who it's for</a>
            <a href="#pricing">Pricing</a>
          </nav>
          <div style={{ flex: 1 }} />
          <Link to="/signin" style={{ fontSize: 15, fontWeight: 500, minHeight: 44, display: 'inline-flex', alignItems: 'center' }}>Sign in</Link>
          <Link to="/signup" className="btn btn-primary" style={{ fontSize: 15 }}>Start free</Link>
        </div>
      </header>

      <main>
        {/* Hero */}
        <section className="ob-wrap ob-hero">
          <div style={{ flex: '1 1 480px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 24 }}>
            <h1>Bookings, advances and follow-ups for event vendors.</h1>
            <p className="ob-hero-lede">
              Built for how events work in Pakistan. A family's Mehndi, Barat and Walima stay together, advances are tracked in rupees, and every reminder goes out on WhatsApp.
            </p>
            <div className="row">
              <Link to="/signup" className="btn btn-primary btn-lg" style={{ borderRadius: 14, fontSize: 16 }}>Start free</Link>
              <a href="#features" className="btn btn-ghost btn-lg" style={{ borderRadius: 14, fontSize: 16, borderColor: 'var(--field-line)' }}>See how it works</a>
            </div>
            <p className="faint" style={{ fontSize: 14 }}>Free to start. No card needed. Works on your phone.</p>
          </div>

          <div aria-hidden="true" style={{ flex: '1 1 460px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div className="card-hero" style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 18, boxShadow: '0 40px 80px -40px rgba(14,19,17,.6)' }}>
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 13, background: 'rgba(255,255,255,.08)', padding: '6px 12px', borderRadius: 999 }}>
                  <span className="dot" style={{ background: fnColor('Mehndi') }} />Mehndi · Tonight
                </span>
                <span className="num" style={{ fontSize: 13, color: 'var(--hero-ink-3)' }}>in 1 h 16 min</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <span style={{ fontSize: 34, fontWeight: 600, letterSpacing: '-0.035em', lineHeight: 1 }}>Ayesha &amp; Hamza</span>
                <span className="num" style={{ fontSize: 15, color: 'var(--hero-ink-2)' }}>7:00 – 10:00 pm · Shalimar Marquee</span>
              </div>
              <div className="num" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 1, background: 'rgba(255,255,255,.1)', borderRadius: 14, overflow: 'hidden' }}>
                {[['To collect', 'Rs 51,000'], ['Prep', '5 of 6'], ['Next', 'Barat, Thu']].map(([k, v]) => (
                  <span key={k} style={{ background: 'var(--hero-inner)', padding: '12px clamp(10px, 3vw, 14px)', display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
                    <span style={{ fontSize: 12, color: 'var(--hero-ink-3)' }}>{k}</span>
                    <span style={{ fontSize: 'clamp(14px, 3.7vw, 18px)', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{v}</span>
                  </span>
                ))}
              </div>
            </div>
            <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 20, padding: 16, display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gap: 6 }}>
              {STRIP.map((s) => (
                <span key={s.d} className="num" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 11, color: 'var(--ink-3)' }}>{s.dow}</span>
                  <span className="ob-strip-tile" data-k={s.k} data-today={!!s.today} style={{ width: '100%', height: 56, fontSize: 15 }}>{s.d}</span>
                </span>
              ))}
            </div>
          </div>
        </section>

        {/* Trades */}
        <section id="trades" aria-labelledby="trades-h" style={{ borderTop: '1px solid var(--line)', borderBottom: '1px solid var(--line)', background: 'var(--surface)' }}>
          <div className="ob-wrap" style={{ paddingTop: 32, paddingBottom: 32, display: 'flex', alignItems: 'center', gap: '16px 28px', flexWrap: 'wrap' }}>
            <h2 id="trades-h" style={{ fontSize: 15, fontWeight: 500, color: 'var(--ink-2)' }}>Made for</h2>
            <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              {TRADES.map(([key, name]) => (
                <li key={key} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, height: 40, padding: '0 14px', borderRadius: 999, background: 'var(--ground)', fontSize: 14, fontWeight: 500 }}>
                  <TradeIcon trade={key} size={18} />{name}
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* Features */}
        <section id="features" aria-labelledby="feat-h" className="ob-wrap ob-section" style={{ paddingTop: 96, paddingBottom: 96, display: 'flex', flexDirection: 'column', gap: 40 }}>
          <h2 id="feat-h" className="ob-h2" style={{ maxWidth: 640 }}>Everything between "is this date free?" and the final payment.</h2>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 20 }}>
            <article className="ob-feature">
              <div className="stack" style={{ gap: 8 }}>
                <h3>See every date at a glance</h3>
                <p>Booked, held as an inquiry, or still free. Vendly warns you before you double-book a night.</p>
              </div>
              <div aria-hidden="true" style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gap: 6 }}>
                {STRIP.map((s) => (
                  <span key={s.d} className="ob-strip-tile num" data-k={s.k} data-today={!!s.today} style={{ height: 72, fontSize: 16 }}>{s.d}</span>
                ))}
              </div>
            </article>
            <article className="ob-feature">
              <div className="stack" style={{ gap: 8 }}>
                <h3>A family's functions, together</h3>
                <p>Book the Mehndi, Barat and Walima as one family, each with its own date, service and payments.</p>
              </div>
              <div aria-hidden="true" style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                {[['Mehndi', 'Wed 18 Nov'], ['Barat', 'Thu 19 Nov'], ['Walima', 'Sat 21 Nov']].map(([fn, d], i) => (
                  <span key={fn} style={{ flex: '1 1 100px', padding: 14, borderRadius: 16, border: i === 0 ? '2px solid var(--accent)' : '1px solid var(--line)', display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 14, fontWeight: 600 }}><span className="dot" style={{ background: fnColor(fn) }} />{fn}</span>
                    <span className="num" style={{ fontSize: 13, color: 'var(--ink-3)' }}>{d}</span>
                  </span>
                ))}
              </div>
            </article>
            <article className="ob-feature">
              <div className="stack" style={{ gap: 8 }}>
                <h3>Advances and receipts on WhatsApp</h3>
                <p>Record cash, bank transfer, JazzCash or Easypaisa. The client gets a clean receipt link in one tap.</p>
              </div>
              <div aria-hidden="true" style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: 18, borderRadius: 20, background: 'var(--hover)' }}>
                <span style={{ alignSelf: 'flex-end', maxWidth: '80%', padding: '12px 14px', borderRadius: '16px 16px 4px 16px', background: 'var(--accent-soft)', fontSize: 14, lineHeight: 1.45, overflowWrap: 'anywhere' }}>
                  Assalam o Alaikum Laiba, we've received your advance of <b className="num">Rs 48,000</b> for the Barat on Sat 5 Dec. Your receipt: {host}/r/8KQ2
                </span>
                <span style={{ alignSelf: 'flex-start', padding: '10px 14px', borderRadius: '16px 16px 16px 4px', background: 'var(--surface)', fontSize: 14 }}>JazakAllah, received!</span>
              </div>
            </article>
            <article className="ob-feature">
              <div className="stack" style={{ gap: 8 }}>
                <h3>Your own booking page</h3>
                <p>One link for your Instagram bio. Clients see your services and free dates, then send an inquiry straight to your WhatsApp.</p>
              </div>
              <div aria-hidden="true" style={{ display: 'flex', alignItems: 'center', gap: 14, padding: 16, borderRadius: 20, border: '1px solid var(--line)' }}>
                <span style={{ width: 48, height: 48, borderRadius: 14, background: 'var(--ink)', color: 'var(--ground)', display: 'grid', placeItems: 'center', fontSize: 15, fontWeight: 600, flex: 'none' }}>YS</span>
                <span style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0, flex: 1 }}>
                  <span style={{ fontSize: 16, fontWeight: 600 }}>Your Studio</span>
                  <span style={{ fontSize: 13, color: 'var(--ink-3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{host}/b/yourstudio</span>
                </span>
                <span style={{ fontSize: 13, fontWeight: 600, padding: '8px 12px', borderRadius: 10, background: 'var(--accent)', color: 'var(--on-accent)', flex: 'none' }}>Check dates</span>
              </div>
            </article>
          </div>
        </section>

        {/* Pricing */}
        <section id="pricing" aria-labelledby="price-h" className="ob-wrap" style={{ paddingBottom: 96, display: 'flex', flexDirection: 'column', gap: 32 }}>
          <div className="stack" style={{ gap: 10 }}>
            <h2 id="price-h" className="ob-h2">Simple pricing</h2>
            <p className="muted" style={{ fontSize: 17 }}>Start free. Upgrade when the season gets busy.</p>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'stretch' }}>
            {plans.map((p) => {
              const amount = price(config?.plans?.[p.key]?.price ?? (p.key === 'free' ? 0 : undefined));
              return (
                <article key={p.key} className="ob-plan" data-popular={p.popular}>
                  <div className="row" style={{ justifyContent: 'space-between' }}>
                    <h3 style={{ fontSize: 20, fontWeight: 600 }}>{config?.plans?.[p.key]?.name ?? p.name}</h3>
                    {p.popular && <span style={{ fontSize: 12, fontWeight: 600, padding: '4px 10px', borderRadius: 999, background: 'var(--accent)', color: 'var(--on-accent)' }}>Most vendors</span>}
                  </div>
                  <div className="num" style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                    {amount ? (
                      <span style={{ fontSize: 40, fontWeight: 600, letterSpacing: '-0.04em' }}>{amount}</span>
                    ) : error ? (
                      <span style={{ fontSize: 24, fontWeight: 600 }}>See inside</span>
                    ) : (
                      <Skeleton h={44} w={150} style={{ opacity: p.popular ? 0.3 : 1 }} />
                    )}
                    <span className="ob-plan-sub" style={{ fontSize: 15 }}>{p.per}</span>
                  </div>
                  <p className="ob-plan-sub" style={{ fontSize: 15, lineHeight: 1.5 }}>{p.who}</p>
                  <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 10, flex: 1 }}>
                    {p.items.map((i) => (
                      <li key={i} style={{ display: 'flex', gap: 10, fontSize: 15, lineHeight: 1.4 }}>
                        <Tick color={p.popular ? fnColor('Mehndi') : 'var(--accent)'} />{i}
                      </li>
                    ))}
                  </ul>
                  <Link to="/signup" className="ob-plan-cta">{p.cta}</Link>
                </article>
              );
            })}
          </div>
        </section>

        {/* CTA */}
        <section style={{ padding: '0 16px 96px' }}>
          <div className="ob-cta-band">
            <div className="stack" style={{ maxWidth: 560 }}>
              <h2 className="ob-h2">Get ready for the next wedding season.</h2>
              <p style={{ fontSize: 17, color: 'var(--hero-ink-3)' }}>Set up in five minutes. Bring your bookings from your diary or Excel, and your team can start from their phones today.</p>
            </div>
            <Link to="/signup" className="ob-btn-light">Start free</Link>
          </div>
        </section>
      </main>

      <footer style={{ borderTop: '1px solid var(--line)' }}>
        <div className="ob-wrap" style={{ paddingTop: 28, paddingBottom: 28, display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', fontSize: 14, color: 'var(--ink-3)' }}>
          <span>Vendly · Booking software for event vendors</span>
          <span style={{ display: 'flex', gap: 20 }}>
            <Link to="/signin" style={{ color: 'var(--ink-3)' }}>Sign in</Link>
            <a href="#pricing" style={{ color: 'var(--ink-3)' }}>Pricing</a>
            <a href="#features" style={{ color: 'var(--ink-3)' }}>Features</a>
          </span>
        </div>
      </footer>
    </div>
  );
}
