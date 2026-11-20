import { useState, type CSSProperties, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { andList, numWord } from '../components/schedule/shared';
import { IconDownload } from '../components/icons';
import { ErrorState, FnDot, Skeleton, useToast } from '../components/ui';
import { download } from '../lib/api';
import { useAuth } from '../lib/auth';
import { MON, monthName, rs, rsShort, today as todayPk } from '../lib/format';
import { useApi, useDocumentTitle, useIsPhone } from '../lib/hooks';
import type { ReportsData } from '../lib/types';

type Period = 'season' | 'month' | 'last12' | 'custom';
const isDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);
const shortMon = (ym: string) => MON[Number(ym.slice(5, 7)) - 1];

function seasonYear(today: string) {
  const [y, m] = today.split('-').map(Number);
  return m >= 7 ? y : y - 1;
}

const PERIOD_PHRASE: Record<string, string> = { season: 'this season', month: 'this month', last12: 'in the last 12 months', custom: 'in these dates' };

/** "November is your biggest month: Rs 14.6 lakh booked, almost double July and August together." */
function headlineSentence(d: ReportsData, today: string) {
  const h = d.headline;
  const phrase = PERIOD_PHRASE[d.period.key] ?? 'in this period';
  if (!h) {
    if (!d.totals.count) return `No bookings ${phrase} yet.`;
    return `${rsShort(d.totals.booked)} booked across ${d.totals.count} ${d.totals.count === 1 ? 'event' : 'events'} ${phrase}.`;
  }
  const verb = h.month < today.slice(0, 7) ? 'was' : 'is';
  const lead = `${monthName(h.month)} ${verb} your biggest month: ${rsShort(h.booked)} booked`;
  const n = h.earlierMonths.length;
  if (!n) return `${lead}.`;
  if (h.earlierBooked <= 0) return `${lead}, with nothing booked in the ${n === 1 ? 'month' : 'months'} before it.`;
  const names = n <= 3 ? andList(h.earlierMonths.map(monthName)) : `the ${numWord(n)} months before it`;
  const together = n > 1 ? ' together' : '';
  const r = h.booked / h.earlierBooked;
  let cmp: string;
  if (r >= 2.8) cmp = `about ${Math.round(r)} times ${names}${together}`;
  else if (r >= 2.3) cmp = `more than double ${names}${together}`;
  else if (r >= 2) cmp = `about double ${names}${together}`;
  else if (r >= 1.8) cmp = `almost double ${names}${together}`;
  else if (r >= 1.15) cmp = `${Math.round((r - 1) * 100)}% more than ${names}${together}`;
  else if (r >= 0.9) cmp = `about the same as ${names}${together}`;
  else cmp = `while ${names}${together} brought in ${rsShort(h.earlierBooked)}`;
  return `${lead}, ${cmp}.`;
}

/** "Most of it due in Nov and Dec" from per-month balances */
function stillSub(d: ReportsData) {
  const t = d.totals;
  if (t.stillToCollect <= 0) return t.booked > 0 ? 'All collected' : 'Nothing booked yet';
  if (d.months?.length) {
    const owed = d.months.map((m) => ({ m: m.month, v: m.booked - m.collected })).filter((x) => x.v > 0).sort((a, b) => b.v - a.v);
    let acc = 0;
    const pick: string[] = [];
    for (const o of owed) {
      pick.push(o.m);
      acc += o.v;
      if (acc > t.stillToCollect / 2) break;
    }
    if (pick.length && pick.length <= 2) return `${pick.length === owed.length ? 'All' : 'Most'} of it due in ${andList(pick.sort().map(shortMon))}`;
  }
  return `${Math.round((t.stillToCollect / Math.max(1, t.booked)) * 100)}% of booked`;
}

export default function Reports() {
  useDocumentTitle('Reports');
  const { role } = useAuth();
  const isPhone = useIsPhone();
  const toast = useToast();
  const today = todayPk();
  const [period, setPeriod] = useState<Period>('season');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [exporting, setExporting] = useState(false);

  const customOk = isDate(from) && isDate(to) && from <= to;
  const ready = period !== 'custom' || customOk;
  const api = useApi<ReportsData>(ready ? '/reports' : null, period === 'custom' ? { period, from, to } : { period });
  const { error, loading, reload } = api;
  // While custom dates are incomplete, don't show the previous period's figures
  const data = ready ? api.data : null;
  const sy = seasonYear(today);

  const exportXlsx = async () => {
    if (!data) return;
    setExporting(true);
    try {
      await download('/bookings/export.xlsx', { from: data.period.from, to: data.period.to, scope: 'all' }, `bookings-${data.period.from}-to-${data.period.to}.xlsx`);
    } catch (e: any) {
      toast({ text: e?.message ?? 'Export failed', tone: 'error' });
    } finally {
      setExporting(false);
    }
  };

  if (error && !data) return <ErrorState error={error} onRetry={reload} />;

  return (
    <div className="page" style={{ gap: 22 }}>
      <section style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 20, flexWrap: 'wrap' }}>
        <div className="stack" style={{ gap: 8, minWidth: 0 }}>
          <h1 className="h-display" style={{ lineHeight: 1 }}>Reports</h1>
          <p style={{ fontSize: 15, color: 'var(--ink-2)', maxWidth: '72ch' }} aria-live="polite">{data ? headlineSentence(data, today) : ' '}</p>
        </div>
        <div className="row" style={{ gap: 8, alignItems: 'flex-end' }}>
          <label htmlFor="rp-range" className="sr-only">Period</label>
          <select id="rp-range" className="select" style={{ height: 42, fontSize: 14, width: 'auto', borderColor: 'var(--line)' }} value={period} onChange={(e) => setPeriod(e.target.value as Period)}>
            <option value="season">This season · Jul – Dec {sy}</option>
            <option value="month">This month</option>
            <option value="last12">Last 12 months</option>
            <option value="custom">Custom dates</option>
          </select>
          <button type="button" className="btn btn-ghost" style={{ height: 42 }} onClick={exportXlsx} disabled={!data || exporting}>
            <IconDownload />{exporting ? 'Exporting…' : 'Export to Excel'}
          </button>
        </div>
      </section>

      {period === 'custom' && (
        <section aria-label="Custom dates" className="row" style={{ gap: 12, alignItems: 'flex-end' }}>
          <div className="field" style={{ width: 180 }}>
            <label className="label" htmlFor="rp-from">From</label>
            <input id="rp-from" type="date" className="input" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div className="field" style={{ width: 180 }}>
            <label className="label" htmlFor="rp-to">To</label>
            <input id="rp-to" type="date" className="input" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} aria-invalid={!!(from && to && from > to) || undefined} />
          </div>
          {!customOk && <span className={from && to && from > to ? 'error-text' : 'hint'} style={{ paddingBottom: 12 }}>{from && to && from > to ? 'The end date is before the start date.' : 'Pick both dates to see the report.'}</span>}
        </section>
      )}

      {!data ? (
        ready ? (
          <div className="stack" aria-busy="true" style={{ gap: 22 }}>
            <Skeleton h={128} r={24} />
            <Skeleton h={340} r={24} />
          </div>
        ) : null
      ) : (
        <div className="stack" style={{ gap: 22, opacity: loading ? 0.7 : 1, transition: 'opacity .15s' }} aria-busy={loading || undefined}>
          <Totals d={data} />
          {data.full ? <FullReport d={data} today={today} isPhone={isPhone} /> : <UpgradePrompt owner={role === 'owner'} />}
        </div>
      )}
    </div>
  );
}

function Totals({ d }: { d: ReportsData }) {
  const t = d.totals;
  const pct = t.booked > 0 ? Math.round((t.collected / t.booked) * 100) : 0;
  const kpis = [
    { label: 'Booked', value: rsShort(t.booked), sub: `${t.count} ${t.count === 1 ? 'event' : 'events'}`, color: 'var(--ink)' },
    { label: 'Collected', value: rsShort(t.collected), sub: t.booked > 0 ? `${pct}% of booked` : '—', color: 'var(--accent)' },
    { label: 'Still to collect', value: rsShort(Math.max(0, t.stillToCollect)), sub: stillSub(d), color: t.stillToCollect > 0 ? 'var(--amber)' : 'var(--ink)' },
    { label: 'Average booking', value: rsShort(t.average), sub: 'Per event', color: 'var(--ink)' },
  ];
  return (
    <dl className="num" style={{ margin: 0, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 1, background: 'var(--line)', border: '1px solid var(--line)', borderRadius: 24, overflow: 'hidden' }}>
      {kpis.map((k) => (
        <div key={k.label} style={{ background: 'var(--surface)', padding: '22px 24px', display: 'flex', flexDirection: 'column', gap: 6 }}>
          <dt style={{ fontSize: 13, color: 'var(--ink-3)' }}>{k.label}</dt>
          <dd style={{ margin: 0, fontSize: 32, fontWeight: 600, letterSpacing: '-0.035em', color: k.color }}>{k.value}</dd>
          <span style={{ fontSize: 13, color: 'var(--ink-2)' }}>{k.sub}</span>
        </div>
      ))}
    </dl>
  );
}

function UpgradePrompt({ owner }: { owner: boolean }) {
  return (
    <section className="card" style={{ display: 'flex', flexWrap: 'wrap', gap: 20, alignItems: 'center', justifyContent: 'space-between' }}>
      <div className="stack" style={{ gap: 6, maxWidth: '60ch' }}>
        <h2 className="h-section">See where your money comes from</h2>
        <p className="muted">The Team plan adds month-by-month charts, events by function, money by service, how many booking page inquiries turn into bookings, and where your bookings came from.</p>
      </div>
      {owner
        ? <Link to="/upgrade" className="btn btn-primary">See the Team plan</Link>
        : <p className="small faint">Ask the owner to move to the Team plan.</p>}
    </section>
  );
}

// ---------- Full report (Team plan) ----------

const card: CSSProperties = { flex: '1 1 400px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 14, padding: 26 };

function Section({ id, title, sub, children, style }: { id: string; title: string; sub?: ReactNode; children: ReactNode; style?: CSSProperties }) {
  return (
    <article className="card" aria-labelledby={id} style={{ ...card, ...style }}>
      <div className="stack" style={{ gap: 4 }}>
        <h2 id={id} className="h-section">{title}</h2>
        {sub && <span style={{ fontSize: 13, color: 'var(--ink-3)' }}>{sub}</span>}
      </div>
      {children}
    </article>
  );
}

function niceStep(max: number) {
  if (max <= 0) return 1e5;
  const raw = max / 3;
  const pow = 10 ** Math.floor(Math.log10(raw));
  for (const m of [1, 2, 2.5, 5, 10]) if (m * pow >= raw) return m * pow;
  return 10 * pow;
}
const trimNum = (x: number) => String(Number(x.toFixed(2)));
const axisLabel = (v: number) => (v === 0 ? '0' : v >= 1e5 ? `${trimNum(v / 1e5)} L` : `${trimNum(v / 1000)}k`);
const barLabel = (v: number) => (v <= 0 ? '' : v >= 1e5 ? (v / 1e5).toFixed(1) : `${Math.round(v / 1000)}k`);

function FullReport({ d, today, isPhone }: { d: ReportsData; today: string; isPhone: boolean }) {
  const phrase = PERIOD_PHRASE[d.period.key] ?? 'in this period';
  return (
    <>
      <MonthsChart months={d.months ?? []} today={today} isPhone={isPhone} />
      <section style={{ display: 'flex', flexWrap: 'wrap', gap: 20, alignItems: 'stretch' }}>
        <ByFunction rows={d.byFunction ?? []} />
        <ByService rows={d.byService ?? []} />
      </section>
      <section style={{ display: 'flex', flexWrap: 'wrap', gap: 20, alignItems: 'stretch' }}>
        <Funnel f={d.funnel ?? { inquiries: 0, quoted: 0, confirmed: 0 }} />
        <Sources s={d.bySource ?? { booking_page: 0, manual: 0, import: 0 }} phrase={phrase} />
      </section>
    </>
  );
}

function MonthsChart({ months, today, isPhone }: { months: NonNullable<ReportsData['months']>; today: string; isPhone: boolean }) {
  const H = isPhone ? 180 : 240;
  const max = Math.max(0, ...months.flatMap((m) => [m.booked, m.collected]));
  const step = niceStep(max);
  const top = step * 3;
  const h = (v: number) => `${Math.max(0, (v / top) * 100)}%`;
  const big = months.reduce((a, b) => (b.booked > (a?.booked ?? -1) ? b : a), months[0]);
  const first = months.find((m) => m.booked > 0);
  const aria = big && big.booked > 0
    ? `Booked ${first && first.month !== big.month ? `went from ${rsShort(first.booked)} in ${monthName(first.month)} to ` : 'peaked at '}${rsShort(big.booked)} in ${monthName(big.month)}`
    : 'No bookings in this period';
  const current = today.slice(0, 7);
  const open = months.filter((m) => m.month >= current && m.booked > 0).map((m) => monthName(m.month));
  const multiYear = months.length > 0 && months[0].month.slice(0, 4) !== months[months.length - 1].month.slice(0, 4);
  const minW = months.length * (isPhone ? 52 : 64);

  return (
    <section className="card" aria-labelledby="rp-months" style={{ padding: 26, display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
        <h2 id="rp-months" className="h-section">Booked and collected by month</h2>
        <span style={{ display: 'flex', gap: 16, fontSize: 13, color: 'var(--ink-2)' }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><span style={{ width: 10, height: 10, borderRadius: 3, background: 'var(--ink)' }} />Booked</span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><span style={{ width: 10, height: 10, borderRadius: 3, background: 'var(--accent)' }} />Collected</span>
        </span>
      </div>
      <div style={{ overflowX: 'auto' }}>
        <div role="img" aria-label={aria} style={{ display: 'grid', gridTemplateColumns: `${isPhone ? 40 : 56}px minmax(0, 1fr)`, gap: 8, minWidth: minW + 64, paddingTop: 10 }}>
          <div className="num" style={{ position: 'relative', height: H, fontSize: 11, color: 'var(--ink-3)' }}>
            {[3, 2, 1, 0].map((i) => (
              <span key={i} style={{ position: 'absolute', right: 0, top: `${((3 - i) / 3) * 100}%`, transform: 'translateY(-50%)', whiteSpace: 'nowrap' }}>
                {i === 3 ? `Rs ${axisLabel(step * i)}` : axisLabel(step * i)}
              </span>
            ))}
          </div>
          <div style={{ position: 'relative', height: H, borderBottom: '1px solid var(--free-line)' }}>
            {[0, 1, 2].map((i) => <span key={i} style={{ position: 'absolute', left: 0, right: 0, top: `${(i / 3) * 100}%`, borderTop: '1px solid var(--line-soft)' }} />)}
            <div style={{ position: 'absolute', inset: 0, display: 'grid', gridTemplateColumns: `repeat(${Math.max(1, months.length)}, minmax(0, 1fr))`, alignItems: 'end' }}>
              {months.map((m) => (
                <div key={m.month} style={{ display: 'flex', justifyContent: 'center', alignItems: 'flex-end', gap: isPhone ? 3 : 6, height: '100%' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', gap: 4, width: 'min(34px, 42%)', height: '100%' }}>
                    <span className="num" style={{ fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap' }}>{barLabel(m.booked)}</span>
                    <span style={{ width: '100%', height: h(m.booked), borderRadius: '6px 6px 0 0', background: 'var(--ink)' }} title={`${monthName(m.month)} booked ${rs(m.booked)}`} />
                  </div>
                  <span style={{ width: 'min(34px, 42%)', height: h(m.collected), borderRadius: '6px 6px 0 0', background: 'var(--accent)' }} title={`${monthName(m.month)} collected ${rs(m.collected)}`} />
                </div>
              ))}
            </div>
          </div>
          <span />
          <div className="num" style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.max(1, months.length)}, minmax(0, 1fr))`, fontSize: 12, color: 'var(--ink-2)', textAlign: 'center' }}>
            {months.map((m, i) => (
              <span key={m.month}>{shortMon(m.month)}{multiYear && (i === 0 || m.month.endsWith('-01')) ? ` ’${m.month.slice(2, 4)}` : ''}</span>
            ))}
          </div>
        </div>
      </div>
      {open.length > 0 && (
        <p style={{ fontSize: 13, color: 'var(--ink-3)' }}>
          {andList(open)} {open.length === 1 ? 'shows' : 'show'} bookings made so far; most of {open.length === 1 ? 'its' : 'their'} balance is due on the event days.
        </p>
      )}
    </section>
  );
}

function ByFunction({ rows }: { rows: NonNullable<ReportsData['byFunction']> }) {
  const max = Math.max(1, ...rows.map((r) => r.count));
  return (
    <Section id="rp-fn" title="Events by function">
      {rows.length === 0 ? <p className="muted small">No events in this period.</p> : rows.map((f) => (
        <div key={f.name} className="num" style={{ display: 'grid', gridTemplateColumns: '108px minmax(0, 1fr) 28px', gap: 12, alignItems: 'center', fontSize: 14 }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}><FnDot fn={f.name} />{f.name}</span>
          <span style={{ height: 12, borderRadius: 999, background: 'var(--line-soft)', display: 'flex' }}>
            <span style={{ width: `${(f.count / max) * 100}%`, borderRadius: 999, background: 'var(--ink-2)' }} />
          </span>
          <span style={{ textAlign: 'right', fontWeight: 600 }}>{f.count}</span>
        </div>
      ))}
    </Section>
  );
}

const SERVICE_COLORS = ['var(--accent)', 'var(--ink)', 'var(--confirmed-tile-ink-2)', 'var(--amber-bar)', 'var(--ink-3)'];

function ByService({ rows }: { rows: NonNullable<ReportsData['byService']> }) {
  const shown = rows.length > 5 ? [...rows.slice(0, 4), { name: 'Other services', total: rows.slice(4).reduce((s, r) => s + r.total, 0), share: rows.slice(4).reduce((s, r) => s + r.share, 0) }] : rows;
  const items = shown.filter((r) => r.total > 0).map((r, i) => ({ ...r, color: SERVICE_COLORS[i % SERVICE_COLORS.length], pct: Math.round(r.share * 100) }));
  return (
    <Section id="rp-svc" title="Money booked by service" style={{ gap: 16 }}>
      {items.length === 0 ? <p className="muted small">No money booked in this period.</p> : (
        <>
          <div role="img" aria-label={items.map((r) => `${r.name} ${r.pct} percent`).join(', ')} style={{ display: 'flex', height: 18, borderRadius: 999, overflow: 'hidden', gap: 2 }}>
            {items.map((r) => <span key={r.name} style={{ width: `${r.share * 100}%`, background: r.color }} />)}
          </div>
          <dl className="num" style={{ margin: 0, display: 'flex', flexDirection: 'column' }}>
            {items.map((r, i) => (
              <div key={r.name} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '10px 0', borderBottom: i < items.length - 1 ? '1px solid var(--line-soft)' : undefined, fontSize: 14 }}>
                <dt style={{ display: 'inline-flex', alignItems: 'center', gap: 8, minWidth: 0 }}><span style={{ width: 10, height: 10, borderRadius: 3, background: r.color, flex: 'none' }} />{r.name}</dt>
                <dd style={{ margin: 0, whiteSpace: 'nowrap' }}><b style={{ fontWeight: 600 }}>{rsShort(r.total)}</b> <span style={{ color: 'var(--ink-3)' }}>· {r.pct}%</span></dd>
              </div>
            ))}
          </dl>
        </>
      )}
    </Section>
  );
}

function Funnel({ f }: { f: NonNullable<ReportsData['funnel']> }) {
  const pct = (n: number) => (f.inquiries ? Math.round((n / f.inquiries) * 100) : 0);
  const steps = [
    { name: 'Asked about a date', n: f.inquiries, pct: '', w: f.inquiries ? 100 : 0, fill: 'var(--confirmed-tile-ink-2)' },
    { name: 'Got a quote', n: f.quoted, pct: `${pct(f.quoted)}%`, w: pct(f.quoted), fill: 'var(--ink-2)' },
    { name: 'Booked', n: f.confirmed, pct: `${pct(f.confirmed)}%`, w: pct(f.confirmed), fill: 'var(--accent)' },
  ];
  return (
    <Section id="rp-fun" title="Booking page inquiries" sub={f.inquiries ? `${pct(f.confirmed)}% of people who asked ended up booking` : 'No one asked through your booking page in this period.'}>
      {steps.map((s) => (
        <div key={s.name} className="stack" style={{ gap: 6 }}>
          <span className="num" style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14 }}>
            <span>{s.name}</span>
            <span><b style={{ fontWeight: 600 }}>{s.n}</b> {s.pct && f.inquiries > 0 && <span style={{ color: 'var(--ink-3)' }}>{s.pct}</span>}</span>
          </span>
          <span style={{ height: 28, borderRadius: 8, background: 'var(--line-soft)', display: 'flex' }}>
            <span style={{ width: `${s.w}%`, borderRadius: 8, background: s.fill }} />
          </span>
        </div>
      ))}
    </Section>
  );
}

function Sources({ s, phrase }: { s: NonNullable<ReportsData['bySource']>; phrase: string }) {
  const total = s.booking_page + s.manual + s.import;
  const pct = (n: number) => (total ? Math.round((n / total) * 100) : 0);
  const rows = [
    { name: 'Booking page', n: s.booking_page, fill: 'var(--accent)' },
    { name: 'Added by hand', n: s.manual, fill: 'var(--ink-2)' },
    { name: 'Imported', n: s.import, fill: 'var(--confirmed-tile-ink-2)' },
  ];
  const share = total ? s.booking_page / total : 0;
  const note = !total ? null
    : share > 0.5 ? 'More than half your bookings started on your booking page. Keep the link in your Instagram bio.'
      : s.booking_page === 0 ? 'None came from your booking page yet. Put the link in your Instagram bio and WhatsApp status.'
        : `${pct(s.booking_page)}% of your bookings started on your booking page. Sharing the link more often brings in more.`;
  return (
    <Section id="rp-src" title="Where bookings came from" sub={`${total} ${total === 1 ? 'booking' : 'bookings'} ${phrase}`}>
      {rows.map((r) => (
        <div key={r.name} className="num" style={{ display: 'grid', gridTemplateColumns: '120px minmax(0, 1fr) 72px', gap: 12, alignItems: 'center', fontSize: 14 }}>
          <span>{r.name}</span>
          <span style={{ height: 12, borderRadius: 999, background: 'var(--line-soft)', display: 'flex' }}>
            <span style={{ width: `${pct(r.n)}%`, borderRadius: 999, background: r.fill }} />
          </span>
          <span style={{ textAlign: 'right' }}><b style={{ fontWeight: 600 }}>{r.n}</b> <span style={{ color: 'var(--ink-3)' }}>{pct(r.n)}%</span></span>
        </div>
      ))}
      {note && <p style={{ marginTop: 4, fontSize: 13, lineHeight: 1.5, color: 'var(--ink-2)' }}>{note}</p>}
    </Section>
  );
}
