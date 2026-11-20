// Client-side CSV parsing for "Import from Excel" (Excel → Save as → CSV).
import { parseRs } from '../../lib/format';
import { FUNCTION_TYPES, type FunctionType } from '../../lib/types';

export interface ImportRow { date: string; clientName: string; whatsapp?: string; functionType: FunctionType; venue?: string; total: number; paid: number; startTime?: string }
export interface ParsedRow { line: number; row: ImportRow | null; problems: string[]; raw: Record<string, string> }

/** RFC-4180-ish CSV parser. Detects comma / semicolon / tab from the first line. */
export function parseCsv(text: string): string[][] {
  const src = text.replace(/^﻿/, '');
  const first = src.split(/\r?\n/, 1)[0] ?? '';
  const delim = [',', ';', '\t'].map((d) => [d, first.split(d).length] as const).sort((a, b) => b[1] - a[1])[0][0];
  const out: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let q = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (q) {
      if (c === '"' && src[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') q = false;
      else cell += c;
    } else if (c === '"') q = true;
    else if (c === delim) { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++;
      row.push(cell); out.push(row); row = []; cell = '';
    } else cell += c;
  }
  if (cell !== '' || row.length) { row.push(cell); out.push(row); }
  return out.filter((r) => r.some((c) => c.trim() !== ''));
}

const MON = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const iso = (y: number, m: number, d: number) => {
  if (y < 100) y += 2000;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return dt.toISOString().slice(0, 10);
};
/** Accepts 2026-12-05, 05/12/2026 (day first), 5-Dec-26, 5 December 2026, Dec 5 2026 and Excel serial numbers */
export function parseDate(s: string): string | null {
  const t = s.trim();
  if (!t) return null;
  let m = t.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (m) return iso(+m[1], +m[2], +m[3]);
  m = t.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})$/);
  if (m) return iso(+m[3], +m[2], +m[1]);
  m = t.match(/^(\d{1,2})[\s-]+([a-z]{3,})[\s,-]+(\d{2,4})$/i);
  if (m && MON.includes(m[2].slice(0, 3).toLowerCase())) return iso(+m[3], MON.indexOf(m[2].slice(0, 3).toLowerCase()) + 1, +m[1]);
  m = t.match(/^([a-z]{3,})\s+(\d{1,2}),?\s+(\d{2,4})$/i);
  if (m && MON.includes(m[1].slice(0, 3).toLowerCase())) return iso(+m[3], MON.indexOf(m[1].slice(0, 3).toLowerCase()) + 1, +m[2]);
  if (/^\d{5}$/.test(t)) {
    const d = new Date(Date.UTC(1899, 11, 30) + Number(t) * 86400000);
    return d.toISOString().slice(0, 10);
  }
  return null;
}

const FN_ALIASES: Record<string, FunctionType> = { baraat: 'Barat', barat: 'Barat', mehendi: 'Mehndi', mehndi: 'Mehndi', mayun: 'Mehndi', valima: 'Walima', walima: 'Walima', nikkah: 'Nikah', nikah: 'Nikah', engagement: 'Engagement', mangni: 'Engagement', birthday: 'Birthday', corporate: 'Corporate' };
export function parseFunction(s: string): FunctionType {
  const k = s.trim().toLowerCase();
  return FUNCTION_TYPES.find((f) => f.toLowerCase() === k) ?? FN_ALIASES[k] ?? 'Other';
}

function parseTime(s: string): string | undefined {
  const m = s.trim().toLowerCase().match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/);
  if (!m) return undefined;
  let h = +m[1];
  const min = m[2] ? +m[2] : 0;
  if (m[3] === 'pm' && h < 12) h += 12;
  if (m[3] === 'am' && h === 12) h = 0;
  if (h > 23 || min > 59) return undefined;
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
}

type Col = 'date' | 'client' | 'phone' | 'function' | 'venue' | 'total' | 'paid' | 'time';
const MATCHERS: [Col, RegExp][] = [
  ['date', /date|tareekh|day/i],
  ['time', /time|start/i],
  ['phone', /phone|whats|mobile|number|contact|cell/i],
  ['client', /client|name|customer|family/i],
  ['function', /function|event|type|occasion/i],
  ['venue', /venue|place|location|hall|marquee|address/i],
  ['paid', /paid|advance|received/i],
  ['total', /total|amount|price|package|fee/i],
];
export const COLUMNS: Col[] = ['date', 'client', 'phone', 'function', 'venue', 'total', 'paid'];

export function rowsFromCsv(text: string): { rows: ParsedRow[]; mappedHeader: boolean } {
  const grid = parseCsv(text);
  if (!grid.length) return { rows: [], mappedHeader: false };
  const head = grid[0].map((h) => h.trim());
  const map: Partial<Record<Col, number>> = {};
  for (const [col, re] of MATCHERS) {
    const i = head.findIndex((h, idx) => re.test(h) && !Object.values(map).includes(idx));
    if (i >= 0) map[col] = i;
  }
  const mappedHeader = map.date !== undefined && map.client !== undefined;
  const body = mappedHeader ? grid.slice(1) : grid;
  if (!mappedHeader) COLUMNS.forEach((c, i) => (map[c] = i));
  const cell = (r: string[], c: Col) => (map[c] !== undefined ? (r[map[c]!] ?? '').trim() : '');

  return {
    mappedHeader,
    rows: body.map((r, i) => {
      const raw = Object.fromEntries(COLUMNS.map((c) => [c, cell(r, c)]));
      const problems: string[] = [];
      const date = parseDate(cell(r, 'date'));
      if (!date) problems.push(cell(r, 'date') ? `Can't read the date "${cell(r, 'date')}"` : 'Date is missing');
      const clientName = cell(r, 'client');
      if (!clientName) problems.push('Client name is missing');
      const total = parseRs(cell(r, 'total'));
      const paid = parseRs(cell(r, 'paid'));
      if (cell(r, 'total') && Number.isNaN(total)) problems.push("Can't read the total");
      if (cell(r, 'paid') && Number.isNaN(paid)) problems.push("Can't read the amount paid");
      const row: ImportRow | null = problems.length
        ? null
        : {
            date: date!, clientName, functionType: parseFunction(cell(r, 'function')),
            total: Number.isNaN(total) ? 0 : Math.max(0, total), paid: Number.isNaN(paid) ? 0 : Math.max(0, paid),
            ...(cell(r, 'phone') ? { whatsapp: cell(r, 'phone') } : {}),
            ...(cell(r, 'venue') ? { venue: cell(r, 'venue') } : {}),
            ...(parseTime(cell(r, 'time')) ? { startTime: parseTime(cell(r, 'time')) } : {}),
          };
      return { line: i + (mappedHeader ? 2 : 1), row, problems, raw };
    }),
  };
}

export const SAMPLE_CSV = 'date,client,phone,function,venue,total,paid\n2026-12-05,Ayesha Khan,0300 1234567,Mehndi,Shalimar Marquee,120000,48000\n06/12/2026,Ayesha Khan,0300 1234567,Barat,Pearl Continental,150000,0\n';
