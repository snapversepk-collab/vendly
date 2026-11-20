import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { get, patch, post, put } from '../lib/api';
import { useAuth } from '../lib/auth';
import { addDays, bookingPageUrl, displayHost, initials, plural, rs, today } from '../lib/format';
import { copyText, useApi, useDebounced, useDocumentTitle } from '../lib/hooks';
import type { Service, Trade } from '../lib/types';
import { Modal, Skeleton, useToast } from '../components/ui';
import { IconCheck, IconCopy, IconExternal, IconWhatsApp } from '../components/icons';
import { SetupHeader, fieldError } from '../components/onboarding/Onboarding';
import { COLUMNS, SAMPLE_CSV, rowsFromCsv, type ParsedRow } from '../components/onboarding/csvImport';

type HandleState =
  | { s: 'saved' } | { s: 'checking' } | { s: 'available' } | { s: 'taken'; reason: string } | { s: 'invalid'; reason: string } | { s: 'error'; reason: string };

const slugify = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[^\w\s-]/g, '').trim().replace(/[\s_]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
function localProblem(h: string): string | null {
  if (!h) return 'Choose a name for your link';
  if (/[^a-z0-9-]/.test(h)) return 'Use only letters, numbers and dashes (no spaces)';
  if (h.length < 3) return 'Use at least 3 characters';
  if (h.length > 40) return 'Use 40 characters or fewer';
  if (h.startsWith('-') || h.endsWith('-')) return "Don't start or end with a dash";
  return null;
}

export default function SetupPage() {
  useDocumentTitle('Your booking page');
  const navigate = useNavigate();
  const toast = useToast();
  const { business, refresh } = useAuth();
  const saved = business?.handle ?? null;
  const [handle, setHandle] = useState(() => saved ?? slugify(business?.name ?? ''));
  const [state, setState] = useState<HandleState>(saved ? { s: 'saved' } : { s: 'checking' });
  const [claiming, setClaiming] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const debounced = useDebounced(handle, 350);

  // Live availability
  useEffect(() => {
    if (handle === saved) return setState({ s: 'saved' });
    const p = localProblem(handle);
    if (p) return setState({ s: 'invalid', reason: p });
    setState({ s: 'checking' });
  }, [handle, saved]);
  useEffect(() => {
    if (debounced !== handle || debounced === saved || localProblem(debounced)) return;
    let live = true;
    get<{ available: boolean; reason: string | null }>('/handle-available', { handle: debounced })
      .then((r) => {
        if (!live) return;
        if (r.available) setState({ s: 'available' });
        else if (r.reason?.startsWith('Use')) setState({ s: 'invalid', reason: r.reason });
        else setState({ s: 'taken', reason: r.reason ?? 'That link is taken' });
      })
      .catch((e) => live && setState({ s: 'error', reason: e.message }));
    return () => { live = false; };
  }, [debounced, handle, saved]);

  const usable = state.s === 'saved' || state.s === 'available';
  const url = bookingPageUrl(handle);

  /** Claim the handle if it isn't saved yet. Returns false when it couldn't be claimed. */
  const ensureClaimed = async (): Promise<boolean> => {
    if (handle === saved) return true;
    if (state.s !== 'available') return false;
    setClaiming(true);
    try {
      await put('/business/handle', { handle });
      await refresh();
      return true;
    } catch (e: any) {
      if (e?.code === 'handle_taken') setState({ s: 'taken', reason: e.message });
      else if (e?.code === 'invalid_handle') setState({ s: 'invalid', reason: e.message });
      else toast({ text: e?.message ?? "Couldn't save your link", tone: 'error' });
      return false;
    } finally {
      setClaiming(false);
    }
  };

  const onCopy = async () => {
    if (!(await ensureClaimed())) return;
    if (await copyText(url)) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
      toast({ text: 'Link copied' });
    }
  };
  /** Open the window synchronously so popup blockers allow it, then point it at the target */
  const openAfterClaim = async (target: string) => {
    const w = handle === saved ? null : window.open('about:blank', '_blank');
    if (handle === saved) return void window.open(target, '_blank', 'noopener');
    const ok = await ensureClaimed();
    if (!ok) return void w?.close();
    if (w) w.location.href = target; else window.location.href = target;
  };
  const statusText = `Book ${business?.name ?? 'us'} for your next event. See my free dates and send an inquiry here: ${url}`;

  const goDashboard = async () => {
    setLeaving(true);
    const hasHandle = handle === saved ? !!saved : state.s === 'available' ? await ensureClaimed() : !!saved;
    try {
      if (hasHandle) await patch('/business', { setupDone: { page: true } });
      await refresh();
    } catch {
      /* setup can be finished later from the First day checklist */
    }
    navigate('/today');
  };

  return (
    <div className="ob-setup">
      <SetupHeader step={3} />
      <main className="ob-setup-main" style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 48, alignItems: 'flex-start' }}>
        <div style={{ flex: '1 1 460px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 28 }}>
          <div className="stack" style={{ gap: 10 }}>
            <h1 className="ob-setup-title">Your booking page is ready</h1>
            <p className="ob-setup-lede">Clients see your services and free dates, then send an inquiry to your WhatsApp. It updates by itself as you take bookings.</p>
          </div>

          <div className="stack" style={{ gap: 8 }}>
            <label htmlFor="sl-handle" style={{ fontSize: 14, fontWeight: 500 }}>Your link</label>
            <div className="ob-handle" data-bad={state.s === 'invalid' || state.s === 'taken'}>
              <span>{displayHost()}/b/</span>
              <input id="sl-handle" type="text" value={handle} autoCapitalize="none" autoCorrect="off" spellCheck={false} maxLength={60}
                aria-invalid={state.s === 'invalid' || state.s === 'taken' || undefined} aria-describedby="sl-state"
                onChange={(e) => setHandle(e.target.value.toLowerCase())}
                onKeyDown={(e) => { if (e.key === 'Enter' && state.s === 'available') { e.preventDefault(); ensureClaimed(); } }} />
              <HandleBadge state={state} />
            </div>
            <div id="sl-state" aria-live="polite" className="row" style={{ gap: 8, minHeight: 20 }}>
              {(state.s === 'invalid' || state.s === 'taken' || state.s === 'error') && <span className="error-text">{state.reason}</span>}
              {state.s === 'taken' && saved && <button type="button" className="btn-link small" onClick={() => setHandle(saved)}>Keep {saved}</button>}
              {state.s === 'available' && (
                <>
                  <span className="hint">Not saved yet.</span>
                  <button type="button" className="btn btn-dark btn-sm" disabled={claiming} onClick={ensureClaimed}>{claiming ? 'Saving…' : 'Use this link'}</button>
                </>
              )}
            </div>
          </div>

          <div className="row" style={{ gap: 10 }}>
            <button type="button" className="ob-share" disabled={!usable || claiming} onClick={onCopy}>
              {copied ? <IconCheck size={16} /> : <IconCopy />}{copied ? 'Copied' : 'Copy link'}
            </button>
            <button type="button" className="ob-share" disabled={!usable || claiming} onClick={() => openAfterClaim(`https://wa.me/?text=${encodeURIComponent(statusText)}`)}>
              <IconWhatsApp />Put on WhatsApp status
            </button>
            <button type="button" className="ob-share" disabled={!usable || claiming} onClick={() => openAfterClaim(`/b/${handle}`)}>
              <IconExternal />Open my page
            </button>
          </div>

          <div style={{ display: 'flex', gap: 14, padding: '16px 18px', borderRadius: 18, background: 'var(--surface)', border: '1px solid var(--line)' }}>
            <span style={{ width: 36, height: 36, borderRadius: 12, background: 'var(--accent-soft)', color: 'var(--accent)', display: 'grid', placeItems: 'center', flex: 'none' }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="4" y="4" width="16" height="16" rx="5" stroke="currentColor" strokeWidth="1.6" /><circle cx="12" cy="12" r="3.5" stroke="currentColor" strokeWidth="1.6" /></svg>
            </span>
            <span style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              <span style={{ fontSize: 15, fontWeight: 600 }}>Add it to your Instagram bio</span>
              <span style={{ fontSize: 14, lineHeight: 1.45, color: 'var(--ink-2)' }}>Most event clients find vendors on Instagram. Paste the link under Edit profile, then Links.</span>
            </span>
          </div>

          <ImportSection />

          <div className="ob-setup-foot ob-setup-foot-plain">
            <Link to="/setup/services" className="ob-back">Back</Link>
            <button type="button" className="btn btn-primary btn-lg" style={{ borderRadius: 14, padding: '0 28px' }} disabled={leaving} onClick={goDashboard}>
              {leaving ? 'Opening…' : 'Go to my dashboard'}
            </button>
          </div>
        </div>

        <PagePreview />
      </main>
    </div>
  );
}

function HandleBadge({ state }: { state: HandleState }) {
  const ok = state.s === 'saved' || state.s === 'available';
  const text = { saved: 'Yours', available: 'Available', checking: 'Checking…', taken: 'Taken', invalid: 'Not allowed', error: "Couldn't check" }[state.s];
  return (
    <span className="ob-handle-state" style={{ color: ok ? 'var(--accent)' : state.s === 'checking' ? 'var(--ink-3)' : 'var(--danger)' }}>
      {ok && <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M3.5 8.5l3 3 6-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>}
      {text}
    </span>
  );
}

/** Phone mock of the client booking page, built from the real business and services */
function PagePreview() {
  const { business } = useAuth();
  const services = useApi<Service[]>('/services');
  const trades = useApi<Trade[]>('/trades');
  const start = today();
  const free = useApi<string[]>('/bookings/free-dates', { from: start, days: 14 });
  const days = useMemo(() => Array.from({ length: 14 }, (_, i) => addDays(start, i)), [start]);
  const active = (services.data ?? []).filter((s) => s.active).slice(0, 3);
  const tradeNames = (business?.trades ?? []).map((k) => trades.data?.find((t) => t.key === k)?.name).filter(Boolean) as string[];
  const what = tradeNames.length > 1 ? `${tradeNames.slice(0, -1).join(', ')} and ${tradeNames[tradeNames.length - 1]}` : tradeNames[0];
  const sub = [what, business?.cities?.slice(0, 2).join(', ')].filter(Boolean).join(' · ');

  return (
    <div aria-hidden="true" style={{ flex: '0 1 320px', minWidth: 0, margin: '0 auto' }}>
      <div className="ob-phone">
        <div className="ob-phone-screen">
          <span style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ width: 46, height: 46, borderRadius: 14, background: 'var(--ink)', color: 'var(--ground)', display: 'grid', placeItems: 'center', fontSize: 15, fontWeight: 600, flex: 'none' }}>
              {initials(business?.name)}
            </span>
            <span style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
              <span style={{ fontSize: 17, fontWeight: 600 }}>{business?.name}</span>
              {sub && <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>{sub}</span>}
            </span>
          </span>
          <span style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: 14, borderRadius: 18, background: 'var(--surface)' }}>
            <span style={{ fontSize: 13, fontWeight: 600 }}>Free dates in the next two weeks</span>
            <span className="num" style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gap: 4 }}>
              {days.map((d) => {
                const isFree = !free.data || free.data.includes(d);
                return (
                  <span key={d} style={{
                    height: 26, borderRadius: 7, display: 'grid', placeItems: 'center', fontSize: 11, fontWeight: 600,
                    background: free.loading && !free.data ? 'var(--line-soft)' : isFree ? 'var(--accent-soft)' : 'var(--line-soft)',
                    color: isFree ? 'var(--accent)' : 'var(--ink-3)', textDecoration: isFree ? undefined : 'line-through',
                  }}>{Number(d.slice(8))}</span>
                );
              })}
            </span>
          </span>
          <span style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {services.loading && !services.data
              ? [0, 1, 2].map((i) => <Skeleton key={i} h={42} r={14} />)
              : active.length === 0
                ? <span style={{ padding: '12px 14px', borderRadius: 14, background: 'var(--surface)', fontSize: 13, color: 'var(--ink-3)' }}>Your services will show here.</span>
                : active.map((s) => (
                    <span key={s.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, padding: '12px 14px', borderRadius: 14, background: 'var(--surface)', fontSize: 13 }}>
                      <span style={{ fontWeight: 600, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.name}{s.hours ? ` · ${s.hours} h` : ''}</span>
                      <span className="num" style={{ color: 'var(--ink-2)', flex: 'none' }}>{s.price !== null ? rs(s.price) : 'Ask'}</span>
                    </span>
                  ))}
          </span>
          <span style={{ height: 44, borderRadius: 12, background: 'var(--accent)', color: 'var(--on-accent)', display: 'grid', placeItems: 'center', fontSize: 14, fontWeight: 600 }}>Ask about a date</span>
        </div>
      </div>
    </div>
  );
}

/** "Already have bookings?" — CSV import with a preview, or add one by one */
function ImportSection() {
  const toast = useToast();
  const file = useRef<HTMLInputElement>(null);
  const [parsed, setParsed] = useState<{ name: string; rows: ParsedRow[]; mappedHeader: boolean } | null>(null);
  const [readError, setReadError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [imported, setImported] = useState<number | null>(null);

  const onFile = async (f: File | undefined) => {
    setReadError(null);
    setImportError(null);
    if (!f) return;
    if (/\.xlsx?$/i.test(f.name)) {
      setReadError('That is an Excel file. In Excel, choose File → Save as → CSV, then pick the .csv file here.');
      return;
    }
    try {
      const text = await f.text();
      const r = rowsFromCsv(text);
      if (!r.rows.length) return setReadError('That file has no rows.');
      if (r.rows.length > 1000) return setReadError('That file has more than 1,000 rows. Split it into smaller files.');
      setParsed({ name: f.name, ...r });
    } catch {
      setReadError("Couldn't read that file.");
    } finally {
      if (file.current) file.current.value = '';
    }
  };

  const good = parsed?.rows.filter((r) => r.row) ?? [];
  const bad = parsed?.rows.filter((r) => !r.row) ?? [];

  const doImport = async () => {
    if (!good.length) return;
    setBusy(true);
    setImportError(null);
    try {
      const r = await post<{ imported: number }>('/bookings/import', { rows: good.map((g) => g.row) });
      setImported((n) => (n ?? 0) + r.imported);
      setParsed(null);
      toast({ text: `Imported ${plural(r.imported, 'booking')}` });
    } catch (e) {
      setImportError(fieldError(e).message);
    } finally {
      setBusy(false);
    }
  };

  const downloadSample = () => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([SAMPLE_CSV], { type: 'text/csv' }));
    a.download = 'vendly-bookings-sample.csv';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };

  return (
    <div className="stack" style={{ gap: 12, paddingTop: 24, borderTop: '1px solid var(--line)' }}>
      <span style={{ fontSize: 15, fontWeight: 600 }}>Already have bookings in a diary or Excel?</span>
      <div className="row" style={{ gap: 10 }}>
        <button type="button" className="ob-dashed" onClick={() => file.current?.click()}>Import from Excel</button>
        <Link to="/bookings/new" className="ob-dashed">Add them one by one</Link>
        <input ref={file} type="file" accept=".csv,text/csv" className="sr-only" tabIndex={-1} aria-hidden="true" onChange={(e) => onFile(e.target.files?.[0])} />
      </div>
      <p className="hint" style={{ fontSize: 13 }}>
        Save your sheet as CSV with the columns {COLUMNS.join(', ')}.{' '}
        <button type="button" className="btn-link" style={{ fontSize: 13 }} onClick={downloadSample}>Download a sample</button>
      </p>
      {readError && <div className="banner banner-danger" role="alert">{readError}</div>}
      {imported !== null && <div className="banner banner-ok" role="status">{plural(imported, 'booking')} imported. They're on your calendar now.</div>}

      <Modal open={!!parsed} onClose={() => !busy && setParsed(null)} title="Check your bookings" width={760}
        footer={
          <>
            <button type="button" className="btn btn-ghost" onClick={() => setParsed(null)} disabled={busy}>Cancel</button>
            <button type="button" className="btn btn-primary" onClick={doImport} disabled={busy || !good.length}>
              {busy ? 'Importing…' : `Import ${plural(good.length, 'booking')}`}
            </button>
          </>
        }>
        {parsed && (
          <>
            <p className="small muted">
              {parsed.name}: {plural(parsed.rows.length, 'row')}. {good.length} ready to import{bad.length ? `, ${bad.length} with problems will be skipped` : ''}.
              {!parsed.mappedHeader && ' No header row found, so columns were read in this order: ' + COLUMNS.join(', ') + '.'}
              {' '}Past dates are saved as completed; future dates with money paid as confirmed.
            </p>
            {importError && <div className="banner banner-danger" role="alert">{importError}</div>}
            <div style={{ overflowX: 'auto', border: '1px solid var(--line)', borderRadius: 14, maxHeight: '50vh' }}>
              <table className="ob-import-table">
                <thead>
                  <tr><th>Row</th><th>Date</th><th>Client</th><th>Phone</th><th>Function</th><th>Venue</th><th style={{ textAlign: 'right' }}>Total</th><th style={{ textAlign: 'right' }}>Paid</th></tr>
                </thead>
                <tbody>
                  {parsed.rows.slice(0, 200).map((r) => (
                    <tr key={r.line} data-bad={!r.row} title={r.problems.join('. ')}>
                      <td className="num faint">{r.line}</td>
                      <td className="num">{r.row?.date ?? <span style={{ color: 'var(--danger)' }}>{r.raw.date || '—'}</span>}</td>
                      <td>{r.row?.clientName ?? (r.raw.client || <span style={{ color: 'var(--danger)' }}>—</span>)}</td>
                      <td className="num">{r.raw.phone}</td>
                      <td>{r.row?.functionType ?? r.raw.function}</td>
                      <td>{r.raw.venue}</td>
                      <td className="num" style={{ textAlign: 'right' }}>{r.row ? rs(r.row.total) : r.raw.total}</td>
                      <td className="num" style={{ textAlign: 'right' }}>{r.row ? rs(r.row.paid) : r.raw.paid}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {parsed.rows.length > 200 && <p className="tiny faint">Showing the first 200 rows. All {good.length} good rows will be imported.</p>}
            {bad.length > 0 && (
              <div className="stack" style={{ gap: 4 }}>
                <span className="small" style={{ fontWeight: 600, color: 'var(--danger)' }}>Rows that will be skipped</span>
                <ul className="small muted" style={{ margin: 0, paddingLeft: 18 }}>
                  {bad.slice(0, 8).map((r) => <li key={r.line}>Row {r.line}: {r.problems.join('. ')}</li>)}
                  {bad.length > 8 && <li>and {bad.length - 8} more</li>}
                </ul>
              </div>
            )}
          </>
        )}
      </Modal>
    </div>
  );
}
