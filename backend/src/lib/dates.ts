// All business dates live in Asia/Karachi (UTC+5, no DST). Dates are 'YYYY-MM-DD' strings.
export const TZ = 'Asia/Karachi';
const PKT_OFFSET_MS = 5 * 60 * 60 * 1000;

/** Wall-clock parts in Karachi for an instant */
export function pkParts(at: Date = new Date()) {
  const d = new Date(at.getTime() + PKT_OFFSET_MS);
  return {
    date: d.toISOString().slice(0, 10),
    hour: d.getUTCHours(),
    minute: d.getUTCMinutes(),
    time: d.toISOString().slice(11, 16),
  };
}

export const todayPk = (at?: Date) => pkParts(at).date;

export function addDays(date: string, n: number): string {
  const d = new Date(date + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(to + 'T00:00:00Z') - Date.parse(from + 'T00:00:00Z')) / 86400000);
}

/** 0 = Monday ... 6 = Sunday */
export const weekdayMon0 = (date: string) => (new Date(date + 'T00:00:00Z').getUTCDay() + 6) % 7;

export const startOfWeek = (date: string) => addDays(date, -weekdayMon0(date));

export function monthRange(ym: string): { from: string; to: string } {
  const [y, m] = ym.split('-').map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { from: `${ym}-01`, to: `${ym}-${String(last).padStart(2, '0')}` };
}

/** Instant (Date) for a Karachi wall-clock date + 'HH:MM' */
export function pkInstant(date: string, time = '00:00'): Date {
  return new Date(Date.parse(`${date}T${time.slice(0, 5)}:00Z`) - PKT_OFFSET_MS);
}

/** Inside reschedule window: event within `days` days from today (and not past) */
export function insideRescheduleWindow(eventDate: string, days: number, today = todayPk()): boolean {
  const d = daysBetween(today, eventDate);
  return d >= 0 && d < days;
}

/** Season = July to December of the current year (or of the previous year in Jan-Jun) */
export function periodRange(period: string, today = todayPk(), from?: string, to?: string): { from: string; to: string } {
  const [y, m] = today.split('-').map(Number);
  switch (period) {
    case 'month':
      return monthRange(today.slice(0, 7));
    case 'last12': {
      const start = new Date(Date.UTC(y, m - 12, 1)).toISOString().slice(0, 10);
      return { from: start, to: monthRange(today.slice(0, 7)).to };
    }
    case 'custom':
      if (from && to) return { from, to };
    // fallthrough
    case 'season':
    default: {
      const sy = m >= 7 ? y : y - 1;
      return { from: `${sy}-07-01`, to: `${sy}-12-31` };
    }
  }
}

const DOW = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTH = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const WEEKDAY = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

export function fmtDate(date: string, style: 'short' | 'long' = 'short'): string {
  const [y, m, d] = date.split('-').map(Number);
  const w = weekdayMon0(date);
  return style === 'long' ? `${WEEKDAY[w]} ${d} ${MONTH[m - 1]} ${y}` : `${DOW[w]} ${d} ${MON[m - 1]}`;
}

export function fmtTime(t?: string | null): string {
  if (!t) return '';
  let [h, m] = t.split(':').map(Number);
  const ap = h >= 12 ? 'pm' : 'am';
  h = h % 12 || 12;
  return `${h}:${String(m).padStart(2, '0')} ${ap}`;
}

export const monthName = (m: number) => MONTH[m - 1];
