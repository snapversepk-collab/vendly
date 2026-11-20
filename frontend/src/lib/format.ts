// Formatting + Asia/Karachi date helpers (dates are 'YYYY-MM-DD' strings everywhere).
import type { BookingStatus, FunctionType } from './types';

export function groupPk(n: number): string {
  const neg = n < 0;
  const s = String(Math.abs(Math.round(n)));
  if (s.length <= 3) return (neg ? '-' : '') + s;
  const rest = s.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ',');
  return (neg ? '-' : '') + rest + ',' + s.slice(-3);
}
/** Rs 1,20,000 */
export const rs = (n: number) => `Rs ${groupPk(n)}`;
/** Rs 14.6 lakh for big totals, Rs 51,000 below a lakh */
export function rsShort(n: number): string {
  const a = Math.abs(n);
  const sign = n < 0 ? '-' : '';
  const trim = (x: number) => String(Number(x.toFixed(x >= 10 ? 1 : 2)));
  if (a >= 1e7) return `Rs ${sign}${trim(a / 1e7)} crore`;
  if (a >= 1e5) return `Rs ${sign}${trim(a / 1e5)} lakh`;
  return rs(n);
}
/** "14.6 lakh" without the Rs */
export const lakh = (n: number) => rsShort(n).replace(/^Rs /, '');
/** Parse "1,20,000" / "120000" -> 120000 */
export const parseRs = (s: string) => {
  const d = s.replace(/[^\d-]/g, '');
  return d ? parseInt(d, 10) : NaN;
};

const PKT = 5 * 60 * 60 * 1000;
export function pkNow(at: Date = new Date()) {
  const d = new Date(at.getTime() + PKT);
  return { date: d.toISOString().slice(0, 10), time: d.toISOString().slice(11, 16), hour: d.getUTCHours(), minute: d.getUTCMinutes() };
}
export const today = () => pkNow().date;

export function addDays(date: string, n: number) {
  const d = new Date(date + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
export const daysBetween = (a: string, b: string) => Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 86400000);
/** 0 = Monday ... 6 = Sunday */
export const weekday = (date: string) => (new Date(date + 'T00:00:00Z').getUTCDay() + 6) % 7;
export const startOfWeek = (date: string) => addDays(date, -weekday(date));
export function monthRange(ym: string) {
  const [y, m] = ym.split('-').map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { from: `${ym}-01`, to: `${ym}-${String(last).padStart(2, '0')}` };
}
export function addMonths(ym: string, n: number) {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return d.toISOString().slice(0, 7);
}

export const DOW = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
export const WEEKDAY = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
export const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const MONTH = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

const parts = (date: string) => date.split('-').map(Number) as [number, number, number];
/** "Sat 5 Dec" */
export const fmtShort = (date: string) => { const [, m, d] = parts(date); return `${DOW[weekday(date)]} ${d} ${MON[m - 1]}`; };
/** "Saturday 5 December 2026" */
export const fmtLong = (date: string) => { const [y, m, d] = parts(date); return `${WEEKDAY[weekday(date)]} ${d} ${MONTH[m - 1]} ${y}`; };
/** "Wednesday, 18 November 2026" */
export const fmtGreetingDate = (date: string) => { const [y, m, d] = parts(date); return `${WEEKDAY[weekday(date)]}, ${d} ${MONTH[m - 1]} ${y}`; };
/** "5 Dec" */
export const fmtDayMon = (date: string) => { const [, m, d] = parts(date); return `${d} ${MON[m - 1]}`; };
export const monthName = (ym: string) => MONTH[Number(ym.split('-')[1]) - 1];
export const monthYear = (ym: string) => `${monthName(ym)} ${ym.split('-')[0]}`;

/** "19:00" -> "7:00 pm" */
export function fmtTime(t?: string | null) {
  if (!t) return '';
  let [h, m] = t.split(':').map(Number);
  const ap = h >= 12 ? 'pm' : 'am';
  h = h % 12 || 12;
  return `${h}:${String(m).padStart(2, '0')} ${ap}`;
}
export function endTime(start: string, hours: number) {
  const [h, m] = start.split(':').map(Number);
  const mins = (h * 60 + m + Math.round(hours * 60)) % 1440;
  return `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`;
}
/** "7:00 – 10:00 pm" */
export function fmtTimeRange(start?: string | null, hours?: number | null) {
  if (!start) return '';
  if (!hours) return fmtTime(start);
  const a = fmtTime(start), b = fmtTime(endTime(start, hours));
  return a.slice(-2) === b.slice(-2) ? `${a.slice(0, -3)} – ${b}` : `${a} – ${b}`;
}
/** "Tonight", "Tomorrow", "In 3 days", "Sat 5 Dec" */
export function relDay(date: string, ref = today()) {
  const n = daysBetween(ref, date);
  if (n === 0) return 'Today';
  if (n === 1) return 'Tomorrow';
  if (n === -1) return 'Yesterday';
  if (n > 1 && n < 7) return `In ${n} days`;
  return fmtShort(date);
}
export function greeting(hour = pkNow().hour) {
  return hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
}

export const FN_COLOR: Record<string, string> = {
  Mehndi: 'var(--fn-mehndi)', Barat: 'var(--fn-barat)', Walima: 'var(--fn-walima)', Nikah: 'var(--fn-nikah)',
  Engagement: 'var(--fn-engagement)', Birthday: 'var(--fn-birthday)', Corporate: 'var(--fn-corporate)', Other: 'var(--fn-other)',
};
export const fnColor = (f?: FunctionType | string | null) => FN_COLOR[f ?? 'Other'] ?? FN_COLOR.Other;

export const STATUS_LABEL: Record<BookingStatus, string> = { inquiry: 'Inquiry', confirmed: 'Confirmed', completed: 'Completed', cancelled: 'Cancelled' };

export const METHOD_LABEL: Record<string, string> = { cash: 'Cash', bank: 'Bank transfer', jazzcash: 'JazzCash', easypaisa: 'Easypaisa', other: 'Other' };

export const initials = (name?: string | null) =>
  (name ?? '').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join('') || '?';
export const firstName = (name?: string | null) => (name ?? '').split(/\s+/)[0] ?? '';

/** "0300 1234567" display for a stored "03001234567" */
export function fmtPhone(p?: string | null) {
  if (!p) return '';
  const d = p.replace(/\D/g, '');
  return d.length === 11 && d.startsWith('0') ? `${d.slice(0, 4)} ${d.slice(4)}` : p;
}
/** wa.me number: drop leading 0, add 92 */
export function waNumber(p?: string | null) {
  let d = (p ?? '').replace(/\D/g, '');
  if (d.startsWith('00')) d = d.slice(2);
  if (d.startsWith('0')) d = '92' + d.slice(1);
  else if (d.length === 10 && d.startsWith('3')) d = '92' + d;
  return d;
}
export const waLink = (p: string | null | undefined, text = '') => `https://wa.me/${waNumber(p)}${text ? `?text=${encodeURIComponent(text)}` : ''}`;

/** Public URL of this frontend, used for booking page / quote / receipt links */
export const appUrl = () => window.location.origin;
export const bookingPageUrl = (handle: string) => `${appUrl()}/b/${handle}`;
export const displayHost = () => window.location.host;

export const plural = (n: number, one: string, many = one + 's') => `${n} ${n === 1 ? one : many}`;
