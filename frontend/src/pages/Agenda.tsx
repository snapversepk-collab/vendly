import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ViewToggle, moneyLine, placeLabel, serviceLabel, who } from '../components/schedule/shared';
import { IconDownload, IconSearch } from '../components/icons';
import { EmptyState, ErrorState, FnDot, Skeleton, StatusPill, useToast } from '../components/ui';
import { download } from '../lib/api';
import { useAuth } from '../lib/auth';
import { DOW, MON, MONTH, addDays, fmtTimeRange, monthYear, rs, startOfWeek, today as todayPk, weekday } from '../lib/format';
import { useApi, useDebounced, useDocumentTitle } from '../lib/hooks';
import type { Booking } from '../lib/types';

type Scope = 'upcoming' | 'past' | 'all';
type StatusOpt = 'active' | 'inquiry' | 'confirmed' | 'due';
const STATUS_OPTIONS: { value: StatusOpt; label: string; money?: boolean }[] = [
  { value: 'active', label: 'All except cancelled' },
  { value: 'inquiry', label: 'Inquiries only' },
  { value: 'confirmed', label: 'Confirmed only' },
  { value: 'due', label: 'Money still due', money: true },
];

/** "18 – 24 Nov", "25 Nov – 1 Dec" */
function rangeLabel(a: string, b: string) {
  const da = Number(a.slice(8, 10)), db = Number(b.slice(8, 10));
  const ma = MON[Number(a.slice(5, 7)) - 1], mb = MON[Number(b.slice(5, 7)) - 1];
  return ma === mb ? `${da} – ${db} ${mb}` : `${da} ${ma} – ${db} ${mb}`;
}

/** "December", "Dec – Feb" for the Later group */
function laterLabel(rows: Booking[]) {
  if (!rows.length) return '';
  const a = rows[0].date.slice(0, 7), b = rows[rows.length - 1].date.slice(0, 7);
  if (a === b) return MONTH[Number(a.slice(5, 7)) - 1];
  return `${MON[Number(a.slice(5, 7)) - 1]} – ${MON[Number(b.slice(5, 7)) - 1]}${a.slice(0, 4) !== b.slice(0, 4) ? ` ${b.slice(0, 4)}` : ''}`;
}

interface Group { key: string; name: string; range: string; rows: Booking[] }

/** This week / Next week / Later (Mon–Sun weeks); anything before this week groups by month */
function groupRows(rows: Booking[], today: string): Group[] {
  const w0 = startOfWeek(today), w1 = addDays(w0, 7), w2 = addDays(w0, 14);
  const groups: Group[] = [];
  const get = (key: string, name: string, range: string) => {
    let g = groups.find((x) => x.key === key);
    if (!g) { g = { key, name, range, rows: [] }; groups.push(g); }
    return g;
  };
  for (const b of rows) {
    if (b.date >= w0 && b.date < w1) get('this', 'This week', rangeLabel(w0, addDays(w0, 6))).rows.push(b);
    else if (b.date >= w1 && b.date < w2) get('next', 'Next week', rangeLabel(w1, addDays(w1, 6))).rows.push(b);
    else if (b.date >= w2) get('later', 'Later', '').rows.push(b);
    else get(b.date.slice(0, 7), monthYear(b.date.slice(0, 7)), '').rows.push(b);
  }
  const later = groups.find((g) => g.key === 'later');
  if (later) later.range = laterLabel(later.rows);
  return groups;
}

const toCollect = (rows: Booking[]) => rows.reduce((s, b) => s + (b.status !== 'cancelled' && b.money ? b.money.balance : 0), 0);

export default function Agenda() {
  useDocumentTitle('Agenda');
  const { role, canSeeMoney } = useAuth();
  const manager = role === 'owner' || role === 'manager';
  const toast = useToast();
  const today = todayPk();
  const [scope, setScope] = useState<Scope>('upcoming');
  const [status, setStatus] = useState<StatusOpt>('active');
  const [q, setQ] = useState('');
  const dq = useDebounced(q.trim(), 300);
  const [exporting, setExporting] = useState(false);

  const { data, error, loading, reload } = useApi<Booking[]>('/bookings', { scope, status, q: dq || undefined });
  const rows = data ?? [];
  const groups = groupRows(rows, today);
  const due = toCollect(rows);

  const scopeWord = scope === 'upcoming' ? 'upcoming ' : scope === 'past' ? 'past ' : '';
  const sub = [`${rows.length} ${scopeWord}${rows.length === 1 ? 'event' : 'events'}`];
  if (canSeeMoney && due > 0) sub.push(`${rs(due)} still to collect`);

  const exportXlsx = async () => {
    setExporting(true);
    try {
      await download('/bookings/export.xlsx', { scope }, 'bookings.xlsx');
    } catch (e: any) {
      toast({ text: e?.message ?? 'Export failed', tone: 'error' });
    } finally {
      setExporting(false);
    }
  };

  const seg = (on: boolean) => ({
    height: 34, padding: '0 14px', borderRadius: 9, border: 0, font: 'inherit', fontSize: 13, fontWeight: 500, cursor: 'pointer',
    background: on ? 'var(--raised)' : 'transparent', color: on ? 'var(--ink)' : 'var(--ink-2)', boxShadow: on ? 'var(--shadow-tab)' : undefined,
  });

  return (
    <div className="page" style={{ gap: 24 }}>
      <section style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 20, flexWrap: 'wrap' }}>
        <div className="stack" style={{ gap: 8 }}>
          <h1 className="h-display" style={{ lineHeight: 1 }}>Agenda</h1>
          <p className="num" style={{ fontSize: 15, color: 'var(--ink-2)' }} aria-live="polite">{data ? sub.join(' · ') : ' '}</p>
        </div>
        <div className="row" style={{ gap: 8 }}>
          <ViewToggle active="agenda" />
          {manager && (
            <button type="button" className="btn btn-ghost" style={{ height: 40 }} onClick={exportXlsx} disabled={exporting}>
              <IconDownload />{exporting ? 'Exporting…' : 'Export to Excel'}
            </button>
          )}
        </div>
      </section>

      <section aria-label="Filters" style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        <div role="radiogroup" aria-label="Range" style={{ display: 'flex', gap: 4, padding: 4, borderRadius: 12, background: 'var(--track)' }}>
          {(['upcoming', 'past', 'all'] as Scope[]).map((s) => (
            <button key={s} type="button" role="radio" aria-checked={scope === s} style={seg(scope === s)} onClick={() => setScope(s)}>
              {s === 'upcoming' ? 'Upcoming' : s === 'past' ? 'Past' : 'All'}
            </button>
          ))}
        </div>
        <label htmlFor="ag-find" style={{ position: 'relative', display: 'flex', alignItems: 'center', flex: '1 1 260px', maxWidth: 360 }}>
          <span className="sr-only">Search bookings</span>
          <IconSearch style={{ position: 'absolute', left: 14, color: 'var(--ink-3)' }} />
          <input id="ag-find" type="search" className="input" placeholder="Client, venue or phone" value={q} onChange={(e) => setQ(e.target.value)}
            style={{ height: 42, paddingLeft: 40, fontSize: 14, borderColor: 'var(--line)' }} />
        </label>
        <label htmlFor="ag-status" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--ink-2)' }}>
          Show
          <select id="ag-status" className="select" style={{ height: 42, fontSize: 14, width: 'auto', borderColor: 'var(--line)' }} value={status} onChange={(e) => setStatus(e.target.value as StatusOpt)}>
            {STATUS_OPTIONS.filter((o) => !o.money || canSeeMoney).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </label>
      </section>

      {error && !data ? (
        <ErrorState error={error} onRetry={reload} />
      ) : !data ? (
        <div className="stack" aria-busy="true" style={{ gap: 8 }}>
          <Skeleton h={22} w={200} />
          <Skeleton h={88} r={20} /><Skeleton h={88} r={20} /><Skeleton h={88} r={20} />
        </div>
      ) : rows.length === 0 ? (
        <div className="card">
          <EmptyState
            title={dq ? `Nothing matches "${dq}"` : scope === 'past' ? 'No past events yet' : scope === 'upcoming' ? 'Nothing coming up' : 'No bookings yet'}
            action={!dq && manager && scope !== 'past' ? <Link to="/bookings/new" className="btn btn-primary">New booking</Link> : undefined}
          >
            {dq ? 'Try a client name, a venue, or the last digits of a phone number.' : status !== 'active' ? 'Try "All except cancelled" to see everything.' : manager ? 'Bookings you add show up here, grouped by week.' : 'Events you are assigned to show up here.'}
          </EmptyState>
        </div>
      ) : (
        <div className="stack" style={{ gap: 24, opacity: loading ? 0.7 : 1, transition: 'opacity .15s' }} aria-busy={loading || undefined}>
          {groups.map((g) => {
            const sum = toCollect(g.rows);
            return (
              <section key={g.key} aria-labelledby={`ag-${g.key}`} className="stack" style={{ gap: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, padding: '0 4px', flexWrap: 'wrap' }}>
                  <h2 id={`ag-${g.key}`} className="h-section">
                    {g.name} {g.range && <span className="num" style={{ fontWeight: 400, color: 'var(--ink-3)', fontSize: 14 }}>{g.range}</span>}
                  </h2>
                  <span className="num" style={{ fontSize: 13, color: 'var(--ink-2)' }}>
                    {g.rows.length} {g.rows.length === 1 ? 'event' : 'events'}{canSeeMoney && sum > 0 ? ` · ${rs(sum)} to collect` : ''}
                  </span>
                </div>
                <ul style={{ listStyle: 'none', margin: 0, padding: 0, background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 20, overflow: 'hidden' }}>
                  {g.rows.map((b, i) => <AgendaRow key={b.id} b={b} today={today} first={i === 0} showMoney={canSeeMoney} />)}
                </ul>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}

function AgendaRow({ b, today, first, showMoney }: { b: Booking; today: string; first: boolean; showMoney: boolean }) {
  const isToday = b.date === today;
  const money = showMoney ? moneyLine(b, today) : null;
  const pct = b.prep.total ? Math.round((b.prep.done / b.prep.total) * 100) : 0;
  const place = placeLabel(b);
  return (
    <li style={{ borderTop: first ? undefined : '1px solid var(--line-soft)' }}>
      <Link to={`/bookings/${b.id}`} className="hov" style={{ display: 'flex', flexWrap: 'wrap', gap: '12px 20px', alignItems: 'center', padding: '14px 18px' }}>
        <span className="num" style={{
          width: 52, flex: 'none', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '6px 0', borderRadius: 12,
          background: isToday ? 'var(--accent)' : 'var(--ground)', color: isToday ? 'var(--on-accent)' : 'var(--ink)',
        }}>
          <span style={{ fontSize: 11 }}>{isToday ? 'Today' : DOW[weekday(b.date)]}</span>
          <span style={{ fontSize: 19, fontWeight: 600, letterSpacing: '-0.02em' }}>{Number(b.date.slice(8, 10))}</span>
        </span>
        <span style={{ flex: '2 1 220px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 3 }}>
          <span style={{ fontSize: 16, fontWeight: 600, textDecoration: b.status === 'cancelled' ? 'line-through' : undefined }}>{who(b)}</span>
          <span className="num" style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 13, color: 'var(--ink-2)' }}>
            <FnDot fn={b.functionType} />{[b.functionType, fmtTimeRange(b.startTime, b.hours)].filter(Boolean).join(' · ')}
          </span>
        </span>
        <span style={{ flex: '2 1 200px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 3, fontSize: 13 }}>
          <span>{serviceLabel(b) || <span className="faint">No service</span>}</span>
          <span style={{ color: 'var(--ink-3)' }}>{place || 'Venue not set'}</span>
        </span>
        <span className="num" style={{ flex: '1 1 90px', display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--ink-2)' }}>
          <span style={{ width: 44, display: 'flex', height: 5, borderRadius: 999, overflow: 'hidden', background: 'var(--line-soft)' }} aria-hidden="true">
            <span style={{ width: `${pct}%`, background: 'var(--accent)' }} />
          </span>
          {b.prep.total ? `Prep ${b.prep.done}/${b.prep.total}` : 'No prep'}
        </span>
        <span style={{ flex: '0 0 auto' }}><StatusPill status={b.status} /></span>
        {showMoney && (
          <span className="num" style={{ flex: '1 1 130px', textAlign: 'right', fontSize: 14, fontWeight: 600, color: money?.color ?? 'var(--ink-3)' }}>{money?.text ?? ''}</span>
        )}
      </Link>
    </li>
  );
}
