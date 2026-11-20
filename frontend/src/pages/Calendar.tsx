import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ViewToggle, daysAway, fnTint, fromField, placeLabel, serviceLabel, who } from '../components/schedule/shared';
import { IconChevronLeft, IconChevronRight, IconPlus } from '../components/icons';
import { ErrorState, FnDot, Skeleton, StatusPill } from '../components/ui';
import { useAuth } from '../lib/auth';
import {
  DOW, MONTH, WEEKDAY, addDays, addMonths, fmtShort, fmtTimeRange, fnColor, groupPk, monthName, monthRange, rs, rsShort, startOfWeek, today as todayPk, weekday,
} from '../lib/format';
import { useApi, useDocumentTitle, useIsPhone } from '../lib/hooks';
import { FUNCTION_TYPES, type Booking, type BookingStatus } from '../lib/types';

type StatusFilter = 'active' | BookingStatus;
const STATUS_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: 'active', label: 'All except cancelled' },
  { value: 'inquiry', label: 'Inquiries only' },
  { value: 'confirmed', label: 'Confirmed only' },
  { value: 'completed', label: 'Completed only' },
  { value: 'cancelled', label: 'Cancelled only' },
];

const isDate = (s: string | null): s is string => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);
const longDay = (d: string) => `${WEEKDAY[weekday(d)]}, ${Number(d.slice(8, 10))} ${MONTH[Number(d.slice(5, 7)) - 1]}`;

/** Chip look per status: confirmed = function tint, inquiry = amber dashed, completed = grey, cancelled = struck */
function chipStyle(b: Booking): CSSProperties {
  switch (b.status) {
    case 'confirmed': return { background: fnTint(b.functionType), color: 'var(--ink)' };
    case 'inquiry': return { background: 'var(--surface)', border: '1px dashed var(--amber)', color: 'var(--ink)' };
    case 'completed': return { background: 'var(--track)', color: 'var(--ink-2)' };
    default: return { background: 'transparent', color: 'var(--ink-3)', textDecoration: 'line-through' };
  }
}

export default function Calendar() {
  const { role, canSeeMoney, business } = useAuth();
  const manager = role === 'owner' || role === 'manager';
  const capacity = Math.max(1, business?.capacityPerDate ?? 1);
  const isPhone = useIsPhone();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const today = todayPk();

  const paramDate = params.get('date');
  const [ym, setYm] = useState(() => (isDate(paramDate) ? paramDate.slice(0, 7) : /^\d{4}-\d{2}$/.test(params.get('month') ?? '') ? params.get('month')! : today.slice(0, 7)));
  const [selected, setSelected] = useState(() => (isDate(paramDate) ? paramDate : today));
  const [fn, setFn] = useState<string | null>(null);
  const [status, setStatus] = useState<StatusFilter>('active');
  useDocumentTitle(`${monthName(ym)} ${ym.slice(0, 4)}`);

  // Follow ?date= when another page links here (e.g. a busy tile on Today)
  useEffect(() => {
    if (isDate(paramDate)) { setYm(paramDate.slice(0, 7)); setSelected(paramDate); }
  }, [paramDate]);

  const { from: mFrom, to: mTo } = monthRange(ym);
  const gridFrom = startOfWeek(mFrom);
  const weeks = Math.ceil((weekday(mFrom) + Number(mTo.slice(8, 10))) / 7);
  const gridTo = addDays(gridFrom, weeks * 7 - 1);
  const { data, error, loading, reload } = useApi<Booking[]>('/bookings', { from: gridFrom, to: gridTo, status: 'any', limit: 2000 });

  const goMonth = (n: number) => {
    const next = addMonths(ym, n);
    setYm(next);
    const sel = today.slice(0, 7) === next ? today : `${next}-01`;
    setSelected(sel);
    setParams({ month: next }, { replace: true });
  };
  const goToday = () => { setYm(today.slice(0, 7)); setSelected(today); setParams({}, { replace: true }); };
  const pick = (d: string) => {
    setSelected(d);
    if (d.slice(0, 7) !== ym) setYm(d.slice(0, 7));
  };

  // ← → change month
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (fromField(e)) return;
      if (e.key === 'ArrowLeft') { e.preventDefault(); goMonth(-1); }
      if (e.key === 'ArrowRight') { e.preventDefault(); goMonth(1); }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  });

  const byDate = useMemo(() => {
    const m: Record<string, Booking[]> = {};
    for (const b of data ?? []) (m[b.date] ??= []).push(b);
    return m;
  }, [data]);
  const activeCount = (d: string) => (byDate[d] ?? []).filter((b) => b.status !== 'cancelled').length;
  const shows = (b: Booking) => (fn ? b.functionType === fn : true) && (status === 'active' ? b.status !== 'cancelled' : b.status === status);
  const visibleOn = (d: string) => (byDate[d] ?? []).filter(shows);
  const isFree = (d: string) => d >= today && activeCount(d) < capacity;

  const monthDays = Array.from({ length: Number(mTo.slice(8, 10)) }, (_, i) => addDays(mFrom, i));
  const monthBookings = (data ?? []).filter((b) => b.date >= mFrom && b.date <= mTo && b.status !== 'cancelled');
  const booked = monthBookings.reduce((s, b) => s + (b.money?.total ?? 0), 0);
  const freeDates = monthDays.filter(isFree);

  const headerBits = [`${monthBookings.length} ${monthBookings.length === 1 ? 'event' : 'events'}`];
  if (canSeeMoney) headerBits.push(`${rsShort(booked)} booked`);
  if (manager && mTo >= today) headerBits.push(`${freeDates.length} ${freeDates.length === 1 ? 'date' : 'dates'} still free`);

  if (error && !data) return <ErrorState error={error} onRetry={reload} />;

  return (
    <div className="page" style={{ gap: 24 }}>
      {/* Month header */}
      <section style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 20, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 14, flexWrap: 'wrap' }}>
          <h1 className="h-display" style={{ lineHeight: 1 }}>{monthName(ym)}</h1>
          <span className="num" style={{ fontSize: 22, color: 'var(--ink-3)', fontWeight: 500 }}>{ym.slice(0, 4)}</span>
          <span className="num" style={{ fontSize: 14, color: 'var(--ink-2)' }} aria-live="polite">{data ? headerBits.join(' · ') : ' '}</span>
        </div>
        <div className="row" style={{ gap: 8 }}>
          <ViewToggle active="month" />
          <button type="button" className="btn btn-ghost" style={{ height: 40 }} onClick={goToday}>Today</button>
          <button type="button" className="btn btn-ghost" style={{ width: 40, height: 40, padding: 0 }} aria-label="Previous month" onClick={() => goMonth(-1)}><IconChevronLeft /></button>
          <button type="button" className="btn btn-ghost" style={{ width: 40, height: 40, padding: 0 }} aria-label="Next month" onClick={() => goMonth(1)}><IconChevronRight /></button>
        </div>
      </section>

      {/* Filters */}
      <section aria-label="Filters" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: 6, flexWrap: isPhone ? 'nowrap' : 'wrap', overflowX: isPhone ? 'auto' : undefined, maxWidth: '100%', scrollbarWidth: 'none' }}>
          <button type="button" aria-pressed={fn === null} onClick={() => setFn(null)} style={fnChip(fn === null)}>All functions</button>
          {FUNCTION_TYPES.map((t) => (
            <button key={t} type="button" aria-pressed={fn === t} onClick={() => setFn(fn === t ? null : t)} style={fnChip(fn === t)}>
              <FnDot fn={t} />{t}
            </button>
          ))}
        </div>
        <label htmlFor="cal-status" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--ink-2)' }}>
          Show
          <select id="cal-status" className="select" style={{ height: 36, fontSize: 13, width: 'auto', paddingRight: 8 }} value={status} onChange={(e) => setStatus(e.target.value as StatusFilter)}>
            {STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </label>
      </section>

      <section style={{ display: 'flex', flexWrap: 'wrap', gap: 20, alignItems: 'flex-start' }}>
        {/* Month grid */}
        <div className="card" style={{ flex: '999 1 640px', padding: 0, overflow: 'hidden' }}>
          {!data ? (
            <div style={{ padding: 16 }} aria-busy="true"><Skeleton h={isPhone ? 320 : 640} r={16} /></div>
          ) : (
            <div role="grid" aria-label={`${monthName(ym)} ${ym.slice(0, 4)}`} aria-busy={loading || undefined} style={{ opacity: loading ? 0.7 : 1, transition: 'opacity .15s' }}>
              <div role="row" style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', borderBottom: '1px solid var(--line)' }}>
                {DOW.map((d) => <div key={d} role="columnheader" style={{ padding: isPhone ? '10px 0' : '12px 14px', textAlign: isPhone ? 'center' : 'left', fontSize: 12, fontWeight: 500, color: 'var(--ink-3)' }}>{isPhone ? d.slice(0, 1) : d}</div>)}
              </div>
              {Array.from({ length: weeks }, (_, w) => (
                <div key={w} role="row" style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', borderBottom: w < weeks - 1 ? '1px solid var(--line-soft)' : undefined }}>
                  {Array.from({ length: 7 }, (_, i) => {
                    const d = addDays(gridFrom, w * 7 + i);
                    const props = { d, inMonth: d.slice(0, 7) === ym, isToday: d === today, isSelected: d === selected, list: visibleOn(d), free: manager && isFree(d), last: i === 6 };
                    return isPhone
                      ? <PhoneCell key={d} {...props} onPick={pick} />
                      : <DayCell key={d} {...props} onPick={pick} onBook={() => manager && isFree(d) && navigate(`/bookings/new?date=${d}`)} />;
                  })}
                </div>
              ))}
            </div>
          )}
          <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', padding: '14px 18px', fontSize: 12, color: 'var(--ink-2)', borderTop: '1px solid var(--line-soft)' }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}><span style={{ width: 14, height: 10, borderRadius: 3, background: fnTint('Mehndi') }} />Confirmed</span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}><span style={{ width: 12, height: 8, borderRadius: 3, border: '1px dashed var(--amber)' }} />Inquiry, no advance</span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}><span style={{ width: 14, height: 10, borderRadius: 3, background: 'var(--track)' }} />Completed</span>
            {manager && !isPhone && <span style={{ marginLeft: 'auto' }}>Double-click a day to book it</span>}
          </div>
        </div>

        {/* Day panel */}
        <aside aria-labelledby="day-h" style={{ flex: '1 1 340px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 16 }}>
          <DayPanel
            date={selected} today={today} list={visibleOn(selected)} count={activeCount(selected)} capacity={capacity}
            manager={manager} showMoney={canSeeMoney} loading={!data}
          />
          {manager && data && (
            <div className="card" style={{ padding: 22, display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div className="stack" style={{ gap: 4 }}>
                <h2 style={{ fontSize: 17, fontWeight: 600 }}>Free dates left this month</h2>
                <p style={{ fontSize: 13, color: 'var(--ink-3)' }}>
                  {mTo < today ? 'This month is over.' : freeDates.length ? 'Nothing is booked on these dates yet. Offer them to anyone still deciding.' : 'Every date this month is taken.'}
                </p>
              </div>
              {freeDates.slice(0, 8).map((d) => (
                <Link key={d} to={`/bookings/new?date=${d}`} className="hov" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '12px 14px', borderRadius: 12, border: '1px dashed var(--free-line)', minHeight: 44 }}>
                  <span className="num" style={{ fontSize: 14, fontWeight: 500 }}>{longDay(d)}{capacity > 1 && activeCount(d) > 0 ? <span className="faint" style={{ fontWeight: 400 }}> · {activeCount(d)} of {capacity} booked</span> : null}</span>
                  <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--accent)' }}>Book</span>
                </Link>
              ))}
              {freeDates.length > 8 && <p className="small muted">and {freeDates.length - 8} more free {freeDates.length - 8 === 1 ? 'date' : 'dates'}.</p>}
            </div>
          )}
        </aside>
      </section>
    </div>
  );
}

function fnChip(on: boolean): CSSProperties {
  return {
    height: 32, padding: '0 12px', borderRadius: 999, font: 'inherit', fontSize: 13, display: 'inline-flex', alignItems: 'center', gap: 7, cursor: 'pointer', whiteSpace: 'nowrap', flex: 'none',
    border: on ? '1px solid var(--ink)' : '1px solid var(--line)', background: on ? 'var(--ink)' : 'var(--surface)', color: on ? 'var(--ground)' : 'var(--ink-2)', fontWeight: on ? 500 : 400,
  };
}

interface CellProps { d: string; inMonth: boolean; isToday: boolean; isSelected: boolean; list: Booking[]; free: boolean; last: boolean; onPick: (d: string) => void }

function cellBg(p: CellProps) {
  if (p.isSelected) return 'color-mix(in srgb, var(--accent) 6%, var(--surface))';
  return p.inMonth ? 'var(--surface)' : 'color-mix(in srgb, var(--ground) 55%, var(--surface))';
}

function dayAria(p: CellProps) {
  return `${longDay(p.d)}${p.isToday ? ', today' : ''}: ${p.list.length ? `${p.list.length} ${p.list.length === 1 ? 'booking' : 'bookings'}` : p.free ? 'free' : 'nothing booked'}`;
}

function DayCell(p: CellProps & { onBook: () => void }) {
  const { d, inMonth, isToday, isSelected, list, free, last, onPick, onBook } = p;
  const past = d < todayPk();
  const numColor = isToday ? 'var(--on-accent)' : !inMonth || past ? 'var(--ink-3)' : 'var(--ink)';
  const more = list.length - 3;
  return (
    <div role="gridcell" aria-selected={isSelected} onClick={() => onPick(d)} onDoubleClick={onBook}
      style={{ minHeight: 116, padding: 8, borderRight: last ? undefined : '1px solid var(--line-soft)', display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0, cursor: 'pointer', background: cellBg(p), boxShadow: isSelected ? 'inset 0 0 0 2px var(--accent)' : undefined }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <button type="button" aria-label={dayAria(p)} aria-pressed={isSelected} onClick={(e) => { e.stopPropagation(); onPick(d); }}
          className="num" style={{ width: 28, height: 28, borderRadius: '50%', display: 'grid', placeItems: 'center', fontSize: 13, fontWeight: 600, border: 0, cursor: 'pointer', padding: 0, background: isToday ? 'var(--accent)' : 'transparent', color: numColor }}>
          {Number(d.slice(8, 10))}
        </button>
        {free && inMonth && <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--accent)', paddingRight: 4 }}>Open</span>}
      </div>
      {list.slice(0, 3).map((b) => (
        <Link key={b.id} to={`/bookings/${b.id}`} onClick={(e) => e.stopPropagation()} onDoubleClick={(e) => e.stopPropagation()}
          title={`${b.functionType} · ${who(b)}`}
          style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 7px', borderRadius: 8, fontSize: 12, lineHeight: 1.2, minWidth: 0, ...chipStyle(b) }}>
          <FnDot fn={b.functionType} size={7} />
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 500, minWidth: 0 }}>{who(b)}</span>
        </Link>
      ))}
      {more > 0 && <span style={{ fontSize: 11, color: 'var(--ink-3)', paddingLeft: 4 }}>+{more} more</span>}
    </div>
  );
}

/** Phone: the grid compresses to dots; tapping a day fills the panel below */
function PhoneCell(p: CellProps) {
  const { d, inMonth, isToday, isSelected, list, free, onPick } = p;
  const past = d < todayPk();
  return (
    <button type="button" role="gridcell" aria-selected={isSelected} aria-label={dayAria(p)} onClick={() => onPick(d)}
      style={{ minHeight: 56, padding: '6px 2px', border: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, cursor: 'pointer', background: cellBg(p), boxShadow: isSelected ? 'inset 0 0 0 2px var(--accent)' : undefined, borderRadius: isSelected ? 10 : 0 }}>
      <span className="num" style={{ width: 26, height: 26, borderRadius: '50%', display: 'grid', placeItems: 'center', fontSize: 13, fontWeight: 600, background: isToday ? 'var(--accent)' : 'transparent', color: isToday ? 'var(--on-accent)' : !inMonth || past ? 'var(--ink-3)' : 'var(--ink)' }}>
        {Number(d.slice(8, 10))}
      </span>
      <span style={{ display: 'flex', gap: 3, flexWrap: 'wrap', justifyContent: 'center', minHeight: 7 }}>
        {list.slice(0, 4).map((b) => (
          <span key={b.id} style={b.status === 'inquiry'
            ? { width: 7, height: 7, borderRadius: '50%', border: `1.5px solid ${fnColor(b.functionType)}` }
            : { width: 7, height: 7, borderRadius: '50%', background: fnColor(b.functionType), opacity: b.status === 'confirmed' ? 1 : 0.45 }} />
        ))}
        {!list.length && free && inMonth && <span style={{ width: 7, height: 7, borderRadius: '50%', border: '1.5px dashed var(--free-line)' }} />}
      </span>
    </button>
  );
}

function DayPanel({ date, today, list, count, capacity, manager, showMoney, loading }: {
  date: string; today: string; list: Booking[]; count: number; capacity: number; manager: boolean; showMoney: boolean; loading: boolean;
}) {
  const familyId = list.find((b) => b.familyId)?.familyId ?? null;
  const fam = useApi<Booking[]>(familyId ? '/bookings' : null, familyId ? { familyId } : undefined);
  const others = (fam.data ?? []).filter((b) => b.familyId === familyId && b.date !== date && b.status !== 'cancelled');
  const full = count >= capacity;
  const badge = full
    ? { text: capacity > 1 ? `${count} of ${capacity} booked` : 'Booked', bg: 'var(--track)', fg: 'var(--ink-2)' }
    : count > 0 ? { text: `${count} of ${capacity} booked`, bg: 'var(--track)', fg: 'var(--ink-2)' }
      : date < today ? { text: 'Past', bg: 'var(--track)', fg: 'var(--ink-3)' }
        : { text: 'Free', bg: 'var(--accent-soft)', fg: 'var(--accent)' };

  return (
    <div className="card" style={{ padding: 22, display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
        <div className="stack" style={{ gap: 4 }}>
          <span style={{ fontSize: 13, color: 'var(--ink-3)' }}>{daysAway(date, today)}</span>
          <h2 id="day-h" style={{ fontSize: 24, fontWeight: 600, letterSpacing: '-0.02em' }}>{longDay(date)}</h2>
        </div>
        <span style={{ fontSize: 12, fontWeight: 600, padding: '4px 10px', borderRadius: 999, background: badge.bg, color: badge.fg, whiteSpace: 'nowrap' }}>{badge.text}</span>
      </div>

      {loading ? <Skeleton h={160} r={18} /> : list.length === 0 ? (
        <p className="muted small">{count > 0 ? 'Nothing here matches the filters.' : date < today ? 'Nothing was booked on this day.' : 'Nothing booked on this day yet.'}</p>
      ) : list.map((b) => <DayBooking key={b.id} b={b} showMoney={showMoney} />)}

      {others.length > 0 && (
        <div className="stack" style={{ gap: 10 }}>
          <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--ink-2)' }}>Same family</span>
          {others.map((o) => (
            <Link key={o.id} to={`/bookings/${o.id}`} className="hov" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', borderRadius: 12, border: '1px solid var(--line-soft)', minHeight: 44 }}>
              <FnDot fn={o.functionType} />
              <span style={{ flex: 1, fontSize: 14 }}>{o.functionType} · {fmtShort(o.date)}</span>
              <span className="num" style={{ fontSize: 13, color: 'var(--ink-3)' }}>{serviceLabel(o)}</span>
            </Link>
          ))}
        </div>
      )}

      {manager && date >= today && !full && (
        <Link to={`/bookings/new?date=${date}`} className="btn btn-ghost btn-block"><IconPlus />Add booking on this date</Link>
      )}
    </div>
  );
}

function DayBooking({ b, showMoney }: { b: Booking; showMoney: boolean }) {
  const m = showMoney ? b.money : undefined;
  const pct = m && m.total > 0 ? Math.min(100, Math.round((m.paid / m.total) * 100)) : 0;
  const line1 = [fmtTimeRange(b.startTime, b.hours), serviceLabel(b, true)].filter(Boolean).join(' · ');
  return (
    <Link to={`/bookings/${b.id}`} className="hov" style={{ display: 'flex', flexDirection: 'column', gap: 14, padding: 16, borderRadius: 18, border: '1px solid var(--line)' }}>
      <span style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 13, color: 'var(--ink-2)' }}><FnDot fn={b.functionType} />{b.functionType}</span>
        <StatusPill status={b.status} />
      </span>
      <span className="stack" style={{ gap: 4 }}>
        <span style={{ fontSize: 20, fontWeight: 600, letterSpacing: '-0.02em', textDecoration: b.status === 'cancelled' ? 'line-through' : undefined }}>{who(b)}</span>
        {line1 && <span className="num" style={{ fontSize: 14, color: 'var(--ink-2)' }}>{line1}</span>}
        <span style={{ fontSize: 14, color: placeLabel(b) ? 'var(--ink-2)' : 'var(--ink-3)' }}>{placeLabel(b) || 'Venue not set'}</span>
      </span>
      <span className="stack" style={{ gap: 8 }}>
        {m && (
          <span style={{ display: 'flex', height: 6, borderRadius: 999, overflow: 'hidden', background: 'var(--line-soft)' }}>
            <span style={{ width: `${pct}%`, background: 'var(--accent)', borderRadius: 999 }} />
          </span>
        )}
        <span className="num" style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', fontSize: 13, color: 'var(--ink-2)' }}>
          {m && <span>{m.total > 0 ? `${rs(m.paid)} of ${groupPk(m.total)} received` : 'No price yet'}</span>}
          <span>{b.prep.total ? `Prep ${b.prep.done} of ${b.prep.total}` : 'No checklist'}</span>
        </span>
      </span>
    </Link>
  );
}
