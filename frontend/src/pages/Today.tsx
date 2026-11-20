import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { DateBlock, andList, datesList, mapsLink, moneyLine, numWord, placeLabel, serviceLabel, who } from '../components/schedule/shared';
import { IconAlert, IconCheck, IconChevronRight, IconClock, IconPin, IconPlus } from '../components/icons';
import { EmptyState, ErrorState, FnDot, PageSkeleton, StatusPill, WhatsAppButton, useToast } from '../components/ui';
import { useAuth } from '../lib/auth';
import {
  DOW, MON, WEEKDAY, bookingPageUrl, displayHost, firstName, fmtGreetingDate, fmtPhone, fmtShort, fmtTimeRange, fnColor, greeting,
  lakh, monthName, pkNow, relDay, rs, rsShort, weekday,
} from '../lib/format';
import { copyText, useApi, useDocumentTitle, useIsPhone } from '../lib/hooks';
import type { Booking, NeedsItem, Service, TodayData } from '../lib/types';

type DateCell = TodayData['dates'][number];
type NextEvent = NonNullable<TodayData['next']>;

const toMin = (hm: string) => { const [h, m] = hm.split(':').map(Number); return h * 60 + m; };
const isEvening = (b: Booking) => !!b.startTime && b.startTime >= '16:00';
const article = (w: string) => (/^[aeiou]/i.test(w) ? 'an' : 'a');
const fnNoun = (fn: string) => (fn === 'Other' ? 'event' : fn);
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
/** "tomorrow", "in 3 days", "on Sat 5 Dec" */
function whenPhrase(date: string, today: string) {
  const r = relDay(date, today);
  return r === 'Tomorrow' || r.startsWith('In ') ? r.toLowerCase() : `on ${r}`;
}

/** Ticks every 30 s so the countdown stays fresh */
function useNowTick() {
  const [now, setNow] = useState(() => pkNow());
  useEffect(() => {
    const t = setInterval(() => setNow(pkNow()), 30_000);
    return () => clearInterval(t);
  }, []);
  return now;
}

export default function Today() {
  useDocumentTitle('Today');
  const { role } = useAuth();
  const { data, error, loading, reload } = useApi<TodayData>('/today');
  if (!data && loading) return <PageSkeleton />;
  if (!data) return <ErrorState error={error} onRetry={reload} />;
  if (data.firstDay && role === 'owner') return <FirstDay data={data} />;
  return <TodayMain data={data} />;
}

// ---------------------------------------------------------------------------------------------
// Normal Today
// ---------------------------------------------------------------------------------------------

/** One sentence under the greeting, built from the next 7 days */
function summarySentence(d: TodayData) {
  const today = d.now.date;
  const todays = (d.dates[0]?.bookings ?? []).filter((b) => b.status !== 'cancelled');
  const week = d.dates.slice(1, 7).flatMap((x) => x.bookings).filter((b) => b.status !== 'cancelled');
  if (todays.length) {
    const first = todays.length === 1
      ? `You have ${article(fnNoun(todays[0].functionType))} ${fnNoun(todays[0].functionType)} ${isEvening(todays[0]) ? 'tonight' : 'today'}`
      : `You have ${numWord(todays.length)} events today`;
    if (!week.length) return `${first}. The rest of the week is free.`;
    const last = week[week.length - 1].date;
    return `${first}, then ${numWord(week.length)} more ${week.length === 1 ? 'event' : 'events'} by ${WEEKDAY[weekday(last)]}.`;
  }
  if (week.length) {
    const nx = week[0];
    return `Nothing on today. ${cap(numWord(week.length))} ${week.length === 1 ? 'event' : 'events'} in the next six days, starting with ${article(fnNoun(nx.functionType))} ${fnNoun(nx.functionType)} ${whenPhrase(nx.date, today)}.`;
  }
  if (d.next) return `Nothing on this week. Your next event is ${article(fnNoun(d.next.functionType))} ${fnNoun(d.next.functionType)} ${whenPhrase(d.next.date, today)}.`;
  return 'Nothing booked in the next two weeks.';
}

function TodayMain({ data }: { data: TodayData }) {
  const { user, role, canSeeMoney } = useAuth();
  const isPhone = useIsPhone();
  const manager = role === 'owner' || role === 'manager';
  const today = data.now.date;
  const name = firstName(user?.name);
  const nextIsToday = data.next?.date === today;

  return (
    <div className="page">
      {/* Greeting */}
      <section style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 24, flexWrap: 'wrap' }}>
        <div className="stack" style={{ gap: isPhone ? 4 : 10, minWidth: 0 }}>
          <p style={{ fontSize: isPhone ? 13 : 14, color: 'var(--ink-3)' }}>{fmtGreetingDate(today)}</p>
          <h1 className="h-display">{greeting(pkNow().hour)}{name ? `, ${name}` : ''}</h1>
          <p style={{ fontSize: isPhone ? 15 : 17, color: 'var(--ink-2)', maxWidth: '60ch' }}>{summarySentence(data)}</p>
        </div>
      </section>

      {/* Next event + month money */}
      <section style={{ display: 'flex', flexWrap: 'wrap', gap: 20 }}>
        {data.next ? <Hero b={data.next} today={today} isPhone={isPhone} showMoney={canSeeMoney} /> : <EmptyHero manager={manager} isPhone={isPhone} />}
        {data.month && canSeeMoney && <MonthCard m={data.month} />}
      </section>

      {/* 14 dates */}
      {isPhone ? <PhoneDates dates={data.dates} today={today} manager={manager} /> : <DatesRibbon data={data} manager={manager} />}

      {/* Needs you + after tonight */}
      <section style={{ display: 'flex', flexWrap: 'wrap', gap: 20, alignItems: 'flex-start' }}>
        <NeedsList needs={data.needs} today={today} isPhone={isPhone} />
        <AfterList items={data.after} today={today} title={nextIsToday ? 'After tonight' : 'Coming up'} showMoney={canSeeMoney} />
      </section>

      <p className="hide-phone num" style={{ display: 'flex', gap: 20, flexWrap: 'wrap', justifyContent: 'center', fontSize: 12, color: 'var(--ink-3)' }}>
        {manager && <span>N&nbsp;&nbsp;new booking</span>}
        <span>T&nbsp;&nbsp;today</span>
        <span>← →&nbsp;&nbsp;change month</span>
        <span>⌘K&nbsp;&nbsp;search</span>
      </p>
    </div>
  );
}

// ---------- Hero ----------

const heroCells: CSSProperties = { display: 'grid', gap: 1, background: 'rgba(255,255,255,.10)', borderRadius: 16, overflow: 'hidden' };
const heroCell: CSSProperties = { background: 'var(--hero-inner)', padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 };
const heroLabel: CSSProperties = { fontSize: 12, color: 'var(--hero-ink-3)' };
const heroValue: CSSProperties = { fontSize: 22, fontWeight: 600, letterSpacing: '-0.02em' };

function Countdown({ b, today }: { b: Booking; today: string }) {
  const now = useNowTick();
  if (b.date !== today) {
    return <span className="num" style={{ fontSize: 14, color: 'var(--hero-ink-3)' }}>{fmtShort(b.date)}</span>;
  }
  if (!b.startTime) return null;
  const mins = toMin(b.startTime) - toMin(now.time);
  if (mins <= 0) return <span style={{ fontSize: 14, color: 'var(--hero-ink-3)' }}><b style={{ color: 'var(--hero-ink)', fontWeight: 600 }}>On now</b></span>;
  const h = Math.floor(mins / 60), m = mins % 60;
  return (
    <span className="num" style={{ fontSize: 14, color: 'var(--hero-ink-3)' }}>
      Starts in <b style={{ color: 'var(--hero-ink)', fontWeight: 600 }}>{h ? `${h} h ${m} min` : `${m} min`}</b>
    </span>
  );
}

function Hero({ b, today, isPhone, showMoney }: { b: NextEvent; today: string; isPhone: boolean; showMoney: boolean }) {
  const isToday = b.date === today;
  const when = isToday ? (isEvening(b) ? 'Tonight' : 'Today') : relDay(b.date, today);
  const money = showMoney ? b.money : undefined;
  const collectLabel = isToday ? (isEvening(b) ? 'To collect tonight' : 'To collect today') : 'Still to collect';
  const collectValue = money ? (money.total > 0 && money.balance <= 0 ? 'Paid in full' : rs(money.balance)) : '';
  const prepValue = b.prep.total ? `${b.prep.done} of ${b.prep.total} done` : 'No checklist';
  const meta = [fmtTimeRange(b.startTime, b.hours), serviceLabel(b, true), placeLabel(b)].filter(Boolean);

  const pill = (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: isPhone ? 12 : 13, fontWeight: 500, color: 'var(--hero-ink)', background: 'rgba(255,255,255,.08)', padding: isPhone ? '5px 10px' : '6px 12px', borderRadius: 999 }}>
      <FnDot fn={b.functionType} size={isPhone ? 7 : 8} />{b.functionType} · {when}
    </span>
  );

  if (isPhone) {
    // Phone artboard: the whole card opens the booking; two figures only
    const cells: ReactNode[] = [];
    if (money) cells.push(<span key="c" style={{ ...heroCell, padding: '10px 12px', gap: 2 }}><span style={{ ...heroLabel, fontSize: 11 }}>To collect</span><span style={{ fontSize: 17, fontWeight: 600 }}>{collectValue}</span></span>);
    cells.push(<span key="p" style={{ ...heroCell, padding: '10px 12px', gap: 2 }}><span style={{ ...heroLabel, fontSize: 11 }}>Prep</span><span style={{ fontSize: 17, fontWeight: 600 }}>{prepValue}</span></span>);
    if (!money) cells.push(<span key="o" style={{ ...heroCell, padding: '10px 12px', gap: 2 }}><span style={{ ...heroLabel, fontSize: 11 }}>Still open</span><span style={{ fontSize: 14, fontWeight: 500, color: b.openItems[0] ? 'var(--amber-bar)' : 'var(--hero-ink)' }}>{b.openItems[0] ?? 'Nothing'}</span></span>);
    return (
      <Link to={`/bookings/${b.id}`} className="card-hero" style={{ flex: '1 1 100%', color: 'var(--hero-ink)', borderRadius: 22, padding: 18, display: 'flex', flexDirection: 'column', gap: 14 }}>
        {!isToday && <span style={{ fontSize: 12, color: 'var(--hero-ink-3)' }}>No events today · next up</span>}
        <span style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
          {pill}
          {isToday ? <Countdown b={b} today={today} /> : null}
        </span>
        <span className="stack" style={{ gap: 4 }}>
          <span style={{ fontSize: 28, fontWeight: 600, letterSpacing: '-0.03em', lineHeight: 1.05 }}>{who(b)}</span>
          <span className="num" style={{ fontSize: 14, color: 'var(--hero-ink-2)' }}>{[fmtTimeRange(b.startTime, b.hours), b.venue].filter(Boolean).join(' · ') || fmtShort(b.date)}</span>
        </span>
        <span className="num" style={{ ...heroCells, borderRadius: 14, gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }}>{cells}</span>
      </Link>
    );
  }

  return (
    <article className="card-hero" style={{ flex: '7 1 520px', display: 'flex', flexDirection: 'column', gap: 24 }} aria-label={isToday ? 'Next event' : 'Next upcoming event'}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        {pill}
        <Countdown b={b} today={today} />
      </div>
      <div className="stack" style={{ gap: 8 }}>
        {!isToday && <span style={{ fontSize: 13, color: 'var(--hero-ink-3)' }}>No events today. Next up:</span>}
        <h2 style={{ fontSize: 46, lineHeight: 1, fontWeight: 600, letterSpacing: '-0.035em', overflowWrap: 'anywhere' }}>{who(b)}</h2>
        {meta.length > 0 && <p className="num" style={{ fontSize: 16, color: 'var(--hero-ink-2)', whiteSpace: 'pre-wrap' }}>{meta.join('  ·  ')}</p>}
        {b.client.whatsapp && <HeroPhone phone={b.client.whatsapp} />}
      </div>
      <div style={{ ...heroCells, gridTemplateColumns: `repeat(${money ? 3 : 2}, minmax(0, 1fr))` }}>
        {money && (
          <div style={heroCell}>
            <span style={heroLabel}>{collectLabel}</span>
            <span className="num" style={heroValue}>{collectValue}</span>
          </div>
        )}
        <div style={heroCell}>
          <span style={heroLabel}>Prep</span>
          <span className="num" style={heroValue}>{prepValue}</span>
        </div>
        <div style={heroCell}>
          <span style={heroLabel}>Still open</span>
          <span style={{ fontSize: 15, fontWeight: 500, lineHeight: 1.3, color: b.openItems[0] ? 'var(--amber-bar)' : 'var(--hero-ink)' }}>
            {b.openItems[0] ?? 'Nothing, all done'}
            {b.openItems.length > 1 && <span style={{ color: 'var(--hero-ink-3)', fontSize: 13 }}> · +{b.openItems.length - 1} more</span>}
          </span>
        </div>
      </div>
      <div className="row" style={{ gap: 8 }}>
        <Link to={`/bookings/${b.id}`} className="btn" style={{ background: 'var(--hero-ink)', color: 'var(--hero)' }}>Open booking</Link>
        {b.client.whatsapp && <WhatsAppButton phone={b.client.whatsapp} text="" label={`WhatsApp ${firstName(b.client.name)}`} className="btn btn-on-dark" />}
        {(b.venue || b.city) && (
          <a href={mapsLink(b)} target="_blank" rel="noreferrer" className="btn btn-on-dark"><IconPin />Directions</a>
        )}
      </div>
    </article>
  );
}

/** Client number as copyable text inside the dark hero (links can be blocked) */
function HeroPhone({ phone }: { phone: string }) {
  const [done, setDone] = useState(false);
  return (
    <span className="num" style={{ fontSize: 13, color: 'var(--hero-ink-3)', display: 'inline-flex', gap: 10, alignItems: 'center' }}>
      {fmtPhone(phone)}
      <button type="button" onClick={async () => { if (await copyText(phone)) { setDone(true); setTimeout(() => setDone(false), 1500); } }}
        style={{ background: 'none', border: 0, padding: 0, color: 'var(--hero-ink-2)', fontSize: 13, fontWeight: 500, cursor: 'pointer', textDecoration: 'underline' }}>
        {done ? 'Copied' : 'Copy number'}
      </button>
    </span>
  );
}

function EmptyHero({ manager, isPhone }: { manager: boolean; isPhone: boolean }) {
  return (
    <article className="card-hero" style={{ flex: '7 1 520px', display: 'flex', flexDirection: 'column', gap: isPhone ? 14 : 20, justifyContent: 'center', minHeight: isPhone ? 0 : 280 }}>
      <span style={{ display: 'inline-flex', alignSelf: 'flex-start', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 500, background: 'rgba(255,255,255,.08)', padding: '6px 12px', borderRadius: 999 }}>
        <span className="dot" style={{ background: 'var(--hero-ink-3)' }} />Free
      </span>
      <h2 style={{ fontSize: isPhone ? 28 : 46, lineHeight: 1, fontWeight: 600, letterSpacing: '-0.035em' }}>No events today</h2>
      <p style={{ fontSize: isPhone ? 14 : 16, color: 'var(--hero-ink-2)' }}>Nothing is booked in the next two months.</p>
      <div className="row" style={{ gap: 8 }}>
        {manager && <Link to="/bookings/new" className="btn" style={{ background: 'var(--hero-ink)', color: 'var(--hero)' }}>Add a booking</Link>}
        <Link to="/calendar" className="btn btn-on-dark">Open calendar</Link>
      </div>
    </article>
  );
}

// ---------- Month money ----------

function MonthCard({ m }: { m: NonNullable<TodayData['month']> }) {
  const pct = (n: number) => (m.booked > 0 ? Math.round((n / m.booked) * 100) : 0);
  const collectedPct = Math.min(100, pct(m.collected));
  const duePct = Math.max(0, Math.min(100 - collectedPct, pct(m.dueIn7)));
  const swatch = (bg: string) => <span style={{ width: 8, height: 8, borderRadius: 2, background: bg }} />;
  return (
    <article className="card" style={{ flex: '5 1 360px', display: 'flex', flexDirection: 'column', gap: 22 }} aria-labelledby="month-h">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
        <h2 id="month-h" className="h-section">{monthName(m.from.slice(0, 7))}</h2>
        <span className="num" style={{ fontSize: 13, color: 'var(--ink-3)' }}>{m.events} {m.events === 1 ? 'event' : 'events'} · {m.ahead} still ahead</span>
      </div>
      <div className="stack" style={{ gap: 6 }}>
        <span style={{ fontSize: 14, color: 'var(--ink-2)' }}>Collected</span>
        <div className="num" style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 44, fontWeight: 600, letterSpacing: '-0.04em', lineHeight: 1 }}>{rsShort(m.collected)}</span>
          <span style={{ fontSize: 15, color: 'var(--ink-3)' }}>{m.booked > 0 ? `of ${lakh(m.booked)} booked` : 'nothing booked yet'}</span>
        </div>
      </div>
      <div className="stack" style={{ gap: 10 }}>
        <div className="progress" role="img" aria-label={`Collected ${collectedPct}%, due in 7 days ${duePct}%`}>
          {collectedPct > 0 && <span style={{ width: `${collectedPct}%`, background: 'var(--accent)' }} />}
          {duePct > 0 && <span style={{ width: `${duePct}%`, background: 'var(--amber-bar)' }} />}
        </div>
        <div className="num" style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 13, color: 'var(--ink-2)' }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>{swatch('var(--accent)')}Collected {collectedPct}%</span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>{swatch('var(--amber-bar)')}Due in 7 days {duePct}%</span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>{swatch('var(--field-line)')}Later</span>
        </div>
      </div>
      <dl className="stats num" style={{ gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }}>
        <div><dt>Outstanding</dt><dd>{rsShort(m.outstanding)}</dd></div>
        <div><dt>Due in the next 7 days</dt><dd style={{ color: m.dueIn7 > 0 ? 'var(--amber)' : undefined }}>{rsShort(m.dueIn7)}</dd></div>
      </dl>
    </article>
  );
}

// ---------- Your dates ----------

const taken = (c: DateCell) => c.full;
const allInquiry = (c: DateCell) => c.bookings.length > 0 && !c.bookings.some((b) => b.status === 'confirmed' || b.status === 'completed');

function ribbonSentence(dates: DateCell[], manager: boolean) {
  const n = dates.length;
  if (!manager) {
    const mine = dates.filter((c) => c.bookings.length).length;
    return mine ? `You're working on ${mine} of the next ${n} dates.` : `You're not on any event in the next ${n} days.`;
  }
  const t = dates.filter(taken);
  const inq = t.filter(allInquiry);
  const free = dates.filter((c) => !taken(c)).map((c) => c.date);
  if (!t.length) return `All of your next ${n} dates are free.`;
  let s = `${t.length} of your next ${n} dates ${t.length === 1 ? 'is' : 'are'} taken`;
  if (inq.length) s += `, ${inq.length} of them still ${inq.length === 1 ? 'an inquiry' : 'inquiries'}`;
  s += '.';
  if (!free.length) s += ' No free dates left.';
  else if (free.length <= 5) s += ` Free: ${datesList(free)}.`;
  else s += ` ${free.length} are still free, starting ${fmtShort(free[0])}.`;
  return s;
}

function dayHead(c: DateCell, i: number, dates: DateCell[]) {
  const d = Number(c.date.slice(8, 10));
  const newMonth = i > 0 && dates[i - 1].date.slice(5, 7) !== c.date.slice(5, 7);
  const tonight = i === 0 && c.bookings.some(isEvening);
  return {
    dow: i === 0 ? (tonight ? 'Tonight' : 'Today') : DOW[weekday(c.date)],
    d: newMonth ? `${d} ${MON[Number(c.date.slice(5, 7)) - 1]}` : String(d),
    isToday: i === 0,
  };
}

function DatesRibbon({ data, manager }: { data: TodayData; manager: boolean }) {
  const dates = data.dates;
  return (
    <section className="card" aria-labelledby="dates-h" style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 16, flexWrap: 'wrap' }}>
        <div className="stack" style={{ gap: 6, minWidth: 0 }}>
          <h2 id="dates-h" className="h-section">Your dates</h2>
          <p style={{ fontSize: 15, color: 'var(--ink-2)' }}>{ribbonSentence(dates, manager)}</p>
        </div>
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 13, color: 'var(--ink-2)' }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}><span style={{ width: 14, height: 14, borderRadius: 4, background: 'var(--confirmed-tile)' }} />Confirmed</span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}><span style={{ width: 12, height: 12, borderRadius: 4, border: '1.5px dashed var(--amber)' }} />Inquiry, no advance</span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}><span style={{ width: 12, height: 12, borderRadius: 4, border: '1.5px dashed var(--free-line)' }} />Open</span>
        </div>
      </div>
      <div style={{ overflowX: 'auto' }}>
        <ol style={{ listStyle: 'none', margin: 0, padding: 4, display: 'grid', gridTemplateColumns: `repeat(${dates.length}, minmax(68px, 1fr))`, gap: 8 }}>
          {dates.map((c, i) => {
            const h = dayHead(c, i, dates);
            return (
              <li key={c.date} style={{ display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0 }}>
                <div className="num" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, paddingBottom: 2 }}>
                  <span style={{ fontSize: 12, fontWeight: 500, color: h.isToday ? 'var(--accent)' : 'var(--ink-3)' }}>{h.dow}</span>
                  <span style={{ fontSize: 20, fontWeight: 600, letterSpacing: '-0.02em', color: h.isToday ? 'var(--accent)' : 'var(--ink)', whiteSpace: 'nowrap' }}>{h.d}</span>
                </div>
                <DateTile c={c} isToday={h.isToday} manager={manager} label={`${h.dow === 'Tonight' || h.dow === 'Today' ? 'Today' : DOW[weekday(c.date)]} ${fmtShort(c.date)}`} />
              </li>
            );
          })}
        </ol>
      </div>
    </section>
  );
}

function DateTile({ c, isToday, manager, label }: { c: DateCell; isToday: boolean; manager: boolean; label: string }) {
  const ring = isToday ? ' tile-today' : '';
  const list = c.bookings;
  if (!list.length) {
    if (!manager) {
      return <div className={`tile tile-free${ring}`} style={{ pointerEvents: 'none' }}>Free</div>;
    }
    return (
      <Link to={`/bookings/new?date=${c.date}`} className={`tile tile-free${ring}`} aria-label={`Book ${label}`}>
        <IconPlus size={18} />Open
      </Link>
    );
  }
  const first = list.find((b) => b.status === 'confirmed' || b.status === 'completed') ?? list[0];
  const confirmed = first.status === 'confirmed' || first.status === 'completed';
  const href = list.length === 1 ? `/bookings/${first.id}` : `/calendar?date=${c.date}`;
  const count = c.capacity > 1 ? `${list.length} of ${c.capacity}` : list.length > 1 ? `${list.length}` : '';
  const whoLine = list.length > 1 ? `${who(first)} +${list.length - 1}` : who(first);
  const aria = `${label}: ${list.map((b) => `${b.functionType}, ${who(b)}, ${b.status}`).join('; ')}`;
  if (confirmed) {
    return (
      <Link to={href} className={`tile tile-confirmed${ring}`} aria-label={aria} style={{ color: 'var(--confirmed-tile-ink)' }}>
        <span style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ width: 10, height: 10, borderRadius: '50%', background: fnColor(first.functionType), boxShadow: '0 0 0 2px var(--confirmed-tile), 0 0 0 3px var(--confirmed-tile-ink-2)' }} />
          {count && <span className="num" style={{ fontSize: 11, color: 'var(--confirmed-tile-ink-2)' }}>{count}</span>}
        </span>
        <span style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
          <span style={{ fontSize: 11, color: 'var(--confirmed-tile-ink-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{first.functionType}</span>
          <span style={{ fontSize: 12.5, lineHeight: 1.25, fontWeight: 500, overflowWrap: 'normal', overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical' }}>{whoLine}</span>
        </span>
      </Link>
    );
  }
  return (
    <Link to={href} className={`tile tile-inquiry${ring}`} aria-label={aria} style={{ color: 'var(--ink)' }}>
      <span style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--amber)' }}>Inquiry</span>
        {count && <span className="num" style={{ fontSize: 11, color: 'var(--ink-3)' }}>{count}</span>}
      </span>
      <span style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: 'var(--ink-2)', minWidth: 0 }}><FnDot fn={first.functionType} size={7} /><span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{first.functionType}</span></span>
        <span style={{ fontSize: 12.5, lineHeight: 1.25, fontWeight: 500, overflowWrap: 'normal', overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical' }}>{whoLine}</span>
      </span>
    </Link>
  );
}

/** Phone artboard: one week of compact tiles */
function PhoneDates({ dates, today, manager }: { dates: DateCell[]; today: string; manager: boolean }) {
  const week = dates.slice(0, 7);
  const n = week.filter((c) => (manager ? taken(c) : c.bookings.length > 0)).length;
  return (
    <section aria-labelledby="pdates-h" className="stack" style={{ gap: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <h2 id="pdates-h" style={{ fontSize: 16, fontWeight: 600 }}>Your dates</h2>
        <span style={{ fontSize: 13, color: 'var(--ink-3)' }}>{n} of {week.length} {manager ? 'taken' : 'yours'}</span>
      </div>
      <ol style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gridTemplateColumns: `repeat(${week.length}, minmax(0, 1fr))`, gap: 6 }}>
        {week.map((c) => {
          const b = c.bookings.find((x) => x.status === 'confirmed' || x.status === 'completed') ?? c.bookings[0];
          const confirmed = b && (b.status === 'confirmed' || b.status === 'completed');
          const tile: CSSProperties = !b
            ? { border: '1.5px dashed var(--free-line)', color: 'var(--ink-3)' }
            : confirmed
              ? { background: 'var(--confirmed-tile)', color: 'var(--confirmed-tile-ink)' }
              : { background: 'var(--amber-soft-2)', border: '1.5px dashed var(--amber)', color: 'var(--ink)' };
          const isToday = c.date === today;
          const href = !b ? (manager ? `/bookings/new?date=${c.date}` : null) : c.bookings.length === 1 ? `/bookings/${b.id}` : `/calendar?date=${c.date}`;
          const inner = (
            <>
              <span style={{ fontSize: 15, fontWeight: 600 }}>{Number(c.date.slice(8, 10))}</span>
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: b ? fnColor(b.functionType) : 'transparent' }} />
            </>
          );
          const style: CSSProperties = { width: '100%', height: 64, borderRadius: 12, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0', ...tile };
          return (
            <li key={c.date} className="num" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 11, fontWeight: 500, color: isToday ? 'var(--accent)' : 'var(--ink-3)' }}>{isToday ? 'Today' : DOW[weekday(c.date)]}</span>
              {href
                ? <Link to={href} className={isToday ? 'tile-today' : undefined} style={style} aria-label={`${fmtShort(c.date)}: ${b ? `${b.functionType}, ${who(b)}` : 'free, add a booking'}`}>{inner}</Link>
                : <span className={isToday ? 'tile-today' : undefined} style={style}>{inner}</span>}
            </li>
          );
        })}
      </ol>
    </section>
  );
}

// ---------- Needs you ----------

const LEVEL: Record<NeedsItem['level'], { bg: string; fg: string; icon: ReactNode }> = {
  urgent: { bg: 'var(--danger-soft)', fg: 'var(--danger)', icon: <IconAlert /> },
  soon: { bg: 'var(--amber-soft)', fg: 'var(--amber)', icon: <IconClock /> },
  later: { bg: 'var(--accent-soft)', fg: 'var(--accent)', icon: <IconCheck /> },
};

/** Server text carries ISO dates; show them the way people read them */
const prettyWhat = (s: string) => s.replace(/\b(\d{4}-\d{2}-\d{2})\b/g, (d) => fmtShort(d));

function needSub(n: NeedsItem, today: string) {
  const parts: string[] = [];
  if (n.functionType) parts.push(n.functionType);
  if (n.date) parts.push(n.date === today ? 'today' : fmtShort(n.date));
  if (n.amount) {
    if (n.kind === 'no_advance') parts.push(`advance due ${rs(n.amount)}`);
    else if (n.kind === 'balance' || n.kind === 'overdue') parts.push(`${rs(n.amount)} left`);
  }
  return parts.join(' · ');
}

const needHref = (n: NeedsItem) => (n.kind === 'inquiry' && n.inquiryId ? `/inquiries/${n.inquiryId}` : n.bookingId ? `/bookings/${n.bookingId}` : '/today');

function NeedAction({ n }: { n: NeedsItem }) {
  if (n.kind === 'inquiry' && n.inquiryId) return <Link to={`/inquiries/${n.inquiryId}`} className="btn btn-ghost btn-sm">Reply</Link>;
  if (n.kind === 'no_advance' && n.bookingId) return <WhatsAppButton bookingId={n.bookingId} kind="advance_reminder" label="Send reminder" className="btn btn-ghost btn-sm" />;
  if (!n.bookingId) return null;
  const label = n.kind === 'balance' || n.kind === 'overdue' ? 'Record payment' : n.kind === 'prep' ? 'Checklist' : 'Open';
  return <Link to={`/bookings/${n.bookingId}`} className="btn btn-ghost btn-sm">{label}</Link>;
}

function NeedsList({ needs, today, isPhone }: { needs: NeedsItem[]; today: string; isPhone: boolean }) {
  const urgent = needs.filter((n) => n.level === 'urgent').length;
  const count = needs.length ? `${urgent ? `${urgent} urgent · ` : ''}${needs.length} in all` : '';
  if (isPhone) {
    return (
      <section aria-labelledby="needs-h" className="stack" style={{ gap: 10, flex: '1 1 100%', minWidth: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <h2 id="needs-h" style={{ fontSize: 16, fontWeight: 600 }}>Needs you</h2>
          {urgent > 0 && <span style={{ fontSize: 13, color: 'var(--ink-3)' }}>{urgent} urgent</span>}
        </div>
        {needs.length === 0 ? (
          <div className="card" style={{ padding: 18 }}><p className="muted small">Nothing needs you right now. Missing advances, unfinished prep and new inquiries will show up here.</p></div>
        ) : (
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 18, overflow: 'hidden' }}>
            {needs.map((n, i) => (
              <li key={i} style={{ borderTop: i ? '1px solid var(--line-soft)' : undefined }}>
                <Link to={needHref(n)} style={{ display: 'grid', gridTemplateColumns: '10px minmax(0, 1fr) 16px', gap: 12, alignItems: 'center', padding: '14px 16px', minHeight: 44 }}>
                  <span style={{ width: 10, height: 10, borderRadius: 3, background: LEVEL[n.level].fg }} aria-label={n.level} />
                  <span style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
                    <span style={{ fontSize: 14, fontWeight: 500, lineHeight: 1.3 }}>{prettyWhat(n.what)}</span>
                    <span className="num" style={{ fontSize: 12, color: 'var(--ink-3)' }}>{needSub(n, today)}</span>
                  </span>
                  <IconChevronRight style={{ color: 'var(--ink-3)' }} />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    );
  }
  return (
    <article className="card card-tight" aria-labelledby="needs-h" style={{ flex: '7 1 520px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '16px 16px 12px', gap: 12 }}>
        <h2 id="needs-h" className="h-section">Needs you</h2>
        <span style={{ fontSize: 13, color: 'var(--ink-3)' }}>{count}</span>
      </div>
      {needs.length === 0 ? (
        <EmptyState title="Nothing needs you right now">Missing advances, unfinished prep and new inquiries will show up here.</EmptyState>
      ) : (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column' }}>
          {needs.map((n, i) => (
            <li key={i} className="list-row hov" style={{ gridTemplateColumns: '36px minmax(0, 1fr) auto' }}>
              <span style={{ width: 36, height: 36, borderRadius: 12, display: 'grid', placeItems: 'center', background: LEVEL[n.level].bg, color: LEVEL[n.level].fg }}>
                {LEVEL[n.level].icon}<span className="sr-only">{n.level}</span>
              </span>
              <span style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
                <span style={{ fontSize: 15, fontWeight: 500, lineHeight: 1.35 }}>{prettyWhat(n.what)}</span>
                <span className="num" style={{ fontSize: 13, color: 'var(--ink-3)' }}>{needSub(n, today)}</span>
              </span>
              <NeedAction n={n} />
            </li>
          ))}
        </ul>
      )}
    </article>
  );
}

// ---------- After tonight ----------

function AfterList({ items, today, title, showMoney }: { items: Booking[]; today: string; title: string; showMoney: boolean }) {
  return (
    <article className="card card-tight" aria-labelledby="after-h" style={{ flex: '5 1 360px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '16px 16px 12px', gap: 12 }}>
        <h2 id="after-h" className="h-section">{title}</h2>
        <Link to="/calendar" style={{ fontSize: 13, fontWeight: 500, color: 'var(--accent)' }}>Open calendar</Link>
      </div>
      {items.length === 0 ? (
        <EmptyState title="Nothing else coming up">Bookings in the next two months will show here.</EmptyState>
      ) : (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column' }}>
          {items.map((b) => {
            const money = showMoney ? moneyLine(b, today) : null;
            const meta = [b.functionType, serviceLabel(b), b.venue].filter(Boolean).join(' · ');
            return (
              <li key={b.id}>
                <Link to={`/bookings/${b.id}`} className="list-row hov" style={{ gridTemplateColumns: '48px minmax(0, 1fr) auto', padding: '12px 16px' }}>
                  <DateBlock date={b.date} today={today} />
                  <span style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
                    <span style={{ fontSize: 15, fontWeight: 500 }}>{who(b)}</span>
                    <span style={{ display: 'inline-flex', alignItems: 'flex-start', gap: 6, fontSize: 13, color: 'var(--ink-3)' }}>
                      <FnDot fn={b.functionType} size={7} style={{ marginTop: 6 }} />{meta}
                    </span>
                  </span>
                  <span className="num" style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, textAlign: 'right' }}>
                    <StatusPill status={b.status} />
                    {money && <span style={{ fontSize: 13, color: 'var(--ink-2)' }}>{money.text}</span>}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </article>
  );
}

// ---------------------------------------------------------------------------------------------
// First day (until the first booking exists)
// ---------------------------------------------------------------------------------------------

const tradeName = (t: string) => cap(t.replace(/[_-]+/g, ' '));

interface Step { key: string; name: string; sub: string; subTone?: 'amber'; done: boolean; act?: string; href?: string }

function FirstDay({ data }: { data: TodayData }) {
  const { user, business } = useAuth();
  const toast = useToast();
  const services = useApi<Service[]>('/services');
  const sd = { ...(business?.setupDone ?? {}), ...(data.setupDone ?? {}) };
  const handle = data.handle ?? business?.handle ?? null;
  const url = handle ? bookingPageUrl(handle) : '';
  const shown = handle ? `${displayHost()}/b/${handle}` : '';
  const active = (services.data ?? []).filter((s) => s.active);
  const unpriced = active.filter((s) => s.price == null).length;
  const trades = business?.trades ?? [];

  const steps: Step[] = [
    {
      key: 'trades', name: 'Pick what you do', done: !!sd.trades || trades.length > 0,
      sub: trades.length ? andList(trades.map(tradeName)) : 'Photo booth, decor, mehndi and more', act: 'Pick', href: '/setup/trade',
    },
    {
      key: 'services', name: 'Set your services and rules', done: !!sd.services && unpriced === 0 && active.length > 0,
      sub: unpriced ? `${unpriced} ${unpriced === 1 ? 'service still needs' : 'services still need'} a price` : active.length ? `${active.length} ${active.length === 1 ? 'service' : 'services'} priced` : 'Prices, advance and reschedule rules',
      subTone: unpriced ? 'amber' : undefined, act: unpriced ? 'Add prices' : 'Set up', href: '/setup/services',
    },
    {
      key: 'page', name: 'Share your booking page', done: !!handle,
      sub: handle ? 'Put the link in your Instagram bio' : 'Claim your link for clients', act: handle ? undefined : 'Claim link', href: '/setup/page',
    },
    { key: 'booking', name: 'Add your first booking', done: false, sub: 'Or bring in the ones you already have', act: 'Add booking', href: '/bookings/new' },
    { key: 'team', name: 'Invite your team', done: !!sd.team, sub: 'Helpers get their own login, without the money', act: 'Invite', href: '/settings' },
  ];
  const doneCount = steps.filter((s) => s.done).length;
  const current = steps.find((s) => !s.done)?.key;
  const before = steps.slice(0, 3).filter((s) => !s.done).length;
  const lead = before === 0 ? "You're ready for your first booking." : `${cap(numWord(before))} small ${before === 1 ? 'step' : 'steps'} and you're ready for your first booking.`;
  const name = firstName(user?.name);

  return (
    <div className="page">
      <section className="stack" style={{ gap: 10 }}>
        <h1 className="h-display">Welcome to Vendly{name ? `, ${name}` : ''}</h1>
        <p style={{ fontSize: 17, color: 'var(--ink-2)', maxWidth: '60ch' }}>{business?.name ?? 'Your business'} is set up. {lead}</p>
      </section>

      <section style={{ display: 'flex', flexWrap: 'wrap', gap: 20, alignItems: 'stretch' }}>
        <article className="card card-tight" aria-labelledby="gs-h" style={{ flex: '7 1 520px', display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, padding: '16px 16px 10px', flexWrap: 'wrap' }}>
            <h2 id="gs-h" className="h-section">Get ready</h2>
            <span className="num" style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, color: 'var(--ink-2)' }}>
              {doneCount} of {steps.length} done
              <span style={{ width: 120, display: 'flex', height: 6, borderRadius: 999, overflow: 'hidden', background: 'var(--line-soft)' }} role="progressbar" aria-valuemin={0} aria-valuemax={steps.length} aria-valuenow={doneCount}>
                <span style={{ width: `${(doneCount / steps.length) * 100}%`, background: 'var(--accent)' }} />
              </span>
            </span>
          </div>
          <ol style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column' }}>
            {steps.map((s) => {
              const ring = s.done ? { background: 'var(--accent)' } : { border: `2px solid ${s.subTone === 'amber' ? 'var(--amber)' : 'var(--field-line)'}` };
              return (
                <li key={s.key} className="list-row" style={{ gridTemplateColumns: '28px minmax(0, 1fr) auto', background: s.key === current ? 'var(--ground)' : undefined }}>
                  <span style={{ width: 26, height: 26, borderRadius: '50%', display: 'grid', placeItems: 'center', color: 'var(--on-accent)', ...ring }}>
                    {s.done && <IconCheck size={13} />}
                    <span className="sr-only">{s.done ? 'Done' : 'Not done yet'}</span>
                  </span>
                  <span style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
                    <span style={{ fontSize: 15, fontWeight: 500, color: s.done ? 'var(--ink-2)' : 'var(--ink)' }}>{s.name}</span>
                    <span style={{ fontSize: 13, color: s.subTone === 'amber' ? 'var(--amber)' : 'var(--ink-3)' }}>{s.sub}</span>
                  </span>
                  {s.act && s.href && !s.done ? <Link to={s.href} className="btn btn-ghost btn-sm">{s.act}</Link> : <span />}
                </li>
              );
            })}
          </ol>
        </article>

        <article className="card-hero" aria-labelledby="bp-h" style={{ flex: '5 1 360px', display: 'flex', flexDirection: 'column', gap: 18 }}>
          {handle ? (
            <>
              <h2 id="bp-h" className="h-section">Your booking page is live</h2>
              <p style={{ fontSize: 15, lineHeight: 1.5, color: 'var(--hero-ink-3)' }}>Share it where clients find you. Every inquiry from it shows up here.</p>
              <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '12px 14px', borderRadius: 14, background: 'rgba(255,255,255,.08)', fontSize: 15, fontWeight: 500, minWidth: 0 }}>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>{shown}</span>
                <button type="button" className="btn btn-sm" style={{ height: 32, minHeight: 32, background: 'var(--hero-ink)', color: 'var(--hero)' }}
                  onClick={async () => toast({ text: (await copyText(url)) ? 'Link copied' : 'Could not copy', tone: 'ok' })}>Copy</button>
              </span>
              <div className="row" style={{ gap: 8, marginTop: 'auto' }}>
                <WhatsAppButton phone={null} text={`Check my free dates and book with ${business?.name ?? 'us'}: ${url}`} label="Put on WhatsApp status" className="btn btn-on-dark" />
                <a href={url} target="_blank" rel="noreferrer" className="btn btn-on-dark">Open it</a>
              </div>
            </>
          ) : (
            <>
              <h2 id="bp-h" className="h-section">Get your booking page</h2>
              <p style={{ fontSize: 15, lineHeight: 1.5, color: 'var(--hero-ink-3)' }}>Pick a link like {displayHost()}/b/yourstudio. Clients see your free dates and ask for one; every inquiry shows up here.</p>
              <div className="row" style={{ gap: 8, marginTop: 'auto' }}>
                <Link to="/setup/page" className="btn" style={{ background: 'var(--hero-ink)', color: 'var(--hero)' }}>Claim your link</Link>
              </div>
            </>
          )}
        </article>
      </section>

      <section className="card" aria-labelledby="yd-h" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        <div className="stack" style={{ gap: 6 }}>
          <h2 id="yd-h" className="h-section">Your dates</h2>
          <p style={{ fontSize: 15, color: 'var(--ink-2)' }}>All of your next {data.dates.length} dates are free. Tap one to add a booking you already have.</p>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <ol style={{ listStyle: 'none', margin: 0, padding: 4, display: 'grid', gridTemplateColumns: `repeat(${data.dates.length}, minmax(64px, 1fr))`, gap: 8 }}>
            {data.dates.map((c, i) => {
              const h = dayHead(c, i, data.dates);
              return (
                <li key={c.date} className="num" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                    <span style={{ fontSize: 12, fontWeight: 500, color: h.isToday ? 'var(--accent)' : 'var(--ink-3)' }}>{h.isToday ? 'Today' : h.dow}</span>
                    <span style={{ fontSize: 20, fontWeight: 600, color: h.isToday ? 'var(--accent)' : 'var(--ink)', whiteSpace: 'nowrap' }}>{h.d}</span>
                  </span>
                  <Link to={`/bookings/new?date=${c.date}`} className="tile tile-free" style={{ height: 96 }} aria-label={`Add a booking on ${fmtShort(c.date)}`}>
                    <IconPlus size={16} />
                  </Link>
                </li>
              );
            })}
          </ol>
        </div>
      </section>

      <section style={{ display: 'flex', flexWrap: 'wrap', gap: 20 }}>
        <article className="card" aria-labelledby="ny-h" style={{ flex: '1 1 420px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <h2 id="ny-h" className="h-section">Needs you</h2>
          <p style={{ fontSize: 15, lineHeight: 1.5, color: 'var(--ink-3)' }}>Nothing yet. Missing advances, unfinished prep and new inquiries will show up here.</p>
        </article>
        <article className="card" aria-labelledby="imp-h" style={{ flex: '1 1 420px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="stack" style={{ gap: 6 }}>
            <h2 id="imp-h" className="h-section">Already have bookings?</h2>
            <p style={{ fontSize: 15, lineHeight: 1.5, color: 'var(--ink-2)' }}>Bring them in from your diary or Excel, so Vendly can warn you about clashes and money due.</p>
          </div>
          <div className="row" style={{ gap: 8 }}>
            <Link to="/setup/page" className="btn btn-ghost" style={{ height: 44, borderColor: 'var(--field-line)' }}>Import from Excel</Link>
            <Link to="/bookings/new" className="btn btn-ghost" style={{ height: 44, borderColor: 'var(--field-line)' }}>Add one by one</Link>
          </div>
        </article>
      </section>

      <p className="hide-phone num" style={{ display: 'flex', gap: 20, flexWrap: 'wrap', justifyContent: 'center', fontSize: 12, color: 'var(--ink-3)' }}>
        <span>N&nbsp;&nbsp;new booking</span><span>T&nbsp;&nbsp;today</span><span>⌘K&nbsp;&nbsp;search</span>
      </p>
    </div>
  );
}
