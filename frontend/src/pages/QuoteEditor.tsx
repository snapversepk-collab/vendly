import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { hoursLabel } from '../components/booking/shared';
import { IconChevronLeft, IconWhatsApp, IconX } from '../components/icons';
import { EmptyState, ErrorState, PageSkeleton, useToast } from '../components/ui';
import { post, put, type ApiError } from '../lib/api';
import { useAuth } from '../lib/auth';
import { addDays, appUrl, firstName, fmtLong, fmtShort, fmtTime, groupPk, rs, today } from '../lib/format';
import { copyText, useApi, useDocumentTitle } from '../lib/hooks';
import type { BookingDetail, MessageTemplate, Quote, Service } from '../lib/types';

interface Line { key: number; name: string; amount: number | null; neg: boolean }
let seq = 0;
const mkLine = (name: string, amount: number | null, neg = false): Line => ({ key: ++seq, name, amount, neg });
const lineValue = (l: Line) => (l.neg ? -1 : 1) * (l.amount ?? 0);
const FALLBACK = 'Assalam o Alaikum [client], thank you for asking about [date]. Your quote is [amount] for the [function]. A [advance] advance confirms the date. View it here: [quote link]';

export default function QuoteEditor() {
  const { id } = useParams();
  const booking = useApi<BookingDetail>(`/bookings/${id}`);
  useDocumentTitle(booking.data ? `Quote for ${booking.data.client.name}` : 'Quote');
  if (booking.loading && !booking.data) return <PageSkeleton />;
  if (booking.error || !booking.data) {
    if (booking.error?.status === 404) {
      return <div className="page page-narrow"><div className="card"><EmptyState title="This booking isn't here" action={<Link className="btn btn-ghost" to="/inquiries">Back to Inquiries</Link>}>It may have been deleted.</EmptyState></div></div>;
    }
    return <ErrorState error={booking.error} onRetry={booking.reload} />;
  }
  return <Editor b={booking.data} />;
}

function Editor({ b }: { b: BookingDetail }) {
  const { business } = useAuth();
  const nav = useNavigate();
  const toast = useToast();
  const services = useApi<Service[]>('/services');
  const templates = useApi<MessageTemplate[]>('/message-templates');
  const existing = (b.quote ?? null) as Quote | null;
  const editable = !existing || existing.status === 'draft' || existing.status === 'sent';

  const [lines, setLines] = useState<Line[]>(() => {
    if (existing && editable) return existing.lines.map((l) => mkLine(l.name, Math.abs(l.amount), l.amount < 0));
    const total = b.money?.total ?? 0;
    if (b.serviceName) return [mkLine(`${b.serviceName}${b.hours ? `, ${hoursLabel(b.hours)}` : ''}`, total || null)];
    return [mkLine(b.functionType, total || null)];
  });
  const [advPct, setAdvPct] = useState<string>(String(existing?.advancePct ?? b.money?.advancePct ?? business?.advancePct ?? 40));
  const [holdUntil, setHoldUntil] = useState(existing?.holdUntil ?? addDays(today(), 7));
  const [note, setNote] = useState(existing?.note ?? '');
  const [quoteId, setQuoteId] = useState<string | null>(editable ? existing?.id ?? null : null);
  const [link, setLink] = useState<string | null>(editable && existing ? `${appUrl()}/q/${existing.token}` : null);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [lineErr, setLineErr] = useState<number | null>(null);
  const [menu, setMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menu) return;
    const close = (e: MouseEvent) => !menuRef.current?.contains(e.target as Node) && setMenu(false);
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setMenu(false);
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', esc); };
  }, [menu]);

  const client = b.client.name;
  const first = firstName(client) || client;
  const total = lines.reduce((s, l) => s + lineValue(l), 0);
  const pct = Math.max(0, Math.min(100, Number(advPct) || 0));
  const advance = Math.round((Math.max(0, total) * pct) / 100);
  const balance = Math.max(0, total - advance);

  const tpl = templates.data?.find((t) => t.kind === 'quote' && t.channel === 'whatsapp')?.text ?? FALLBACK;
  const vars: Record<string, string> = {
    client: first, function: b.functionType, date: fmtShort(b.date), amount: rs(Math.max(0, total)), advance: rs(advance),
    'quote link': link ?? `${appUrl()}/q/…`,
  };
  const message = tpl.replace(/\[([a-z ]+)\]/gi, (m, k: string) => vars[k.toLowerCase()] ?? m);

  const update = (key: number, patch: Partial<Line>) => { setLines((xs) => xs.map((l) => (l.key === key ? { ...l, ...patch } : l))); setErr(null); setLineErr(null); };

  /** Save the quote (PUT). Returns the quote id and link, or null when invalid. */
  async function save(): Promise<{ id: string; link: string } | null> {
    setErr(null); setLineErr(null);
    const clean = lines.filter((l) => l.name.trim() || l.amount);
    const bad = clean.find((l) => !l.name.trim());
    if (!clean.length) { setErr('Add at least one item'); return null; }
    if (bad) { setLineErr(bad.key); setErr('Give every item a name'); return null; }
    if (total < 0) { setErr('The discounts are more than the items. The total cannot be below zero.'); return null; }
    try {
      const r = await put<{ id: string; token: string; status: string; total: number; link: string }>(`/bookings/${b.id}/quote`, {
        lines: clean.map((l) => ({ name: l.name.trim(), amount: lineValue(l) })), advancePct: pct, holdUntil: holdUntil || null, note: note.trim() || null,
      });
      setQuoteId(r.id); setLink(r.link);
      return { id: r.id, link: r.link };
    } catch (e) {
      setErr((e as ApiError).message);
      return null;
    }
  }

  async function sendWhatsApp() {
    const w = window.open('about:blank', '_blank'); // opened now so popup blockers allow it
    setBusy('wa');
    try {
      const q = await save();
      if (!q) { w?.close(); return; }
      await post(`/quotes/${q.id}/send`, { channel: 'whatsapp' });
      const r = await post<{ url: string }>(`/bookings/${b.id}/whatsapp`, { kind: 'quote' });
      if (w) w.location.href = r.url; else window.location.href = r.url;
      toast({ text: `Quote ready in WhatsApp for ${first}` });
    } catch (e) {
      w?.close();
      setErr((e as ApiError).message);
    } finally {
      setBusy(null);
    }
  }

  async function copyLink() {
    setBusy('link');
    try {
      const q = await save();
      if (!q) return;
      await post(`/quotes/${q.id}/send`, { channel: 'link' });
      if (await copyText(q.link)) toast({ text: 'Link copied. Paste it anywhere.' });
      else toast({ text: q.link });
    } catch (e) {
      setErr((e as ApiError).message);
    } finally {
      setBusy(null);
    }
  }

  async function sendEmail() {
    setBusy('email');
    try {
      const q = await save();
      if (!q) return;
      await post(`/quotes/${q.id}/send`, { channel: 'email' });
      toast({ text: `Quote emailed to ${b.client.email}` });
    } catch (e) {
      setErr((e as ApiError).message);
    } finally {
      setBusy(null);
    }
  }

  async function saveDraft() {
    setBusy('draft');
    const q = await save();
    setBusy(null);
    if (q) toast({ text: 'Quote saved' });
  }

  const activeServices = (services.data ?? []).filter((s) => s.active);
  const bookingUrl = `/bookings/${b.id}`;

  return (
    <div className="page" style={{ paddingTop: 32, gap: 24 }}>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <Link to={bookingUrl} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 14, color: 'var(--ink-2)' }}><IconChevronLeft />Booking</Link>
        <span className="row" style={{ gap: 8 }}>
          <button type="button" className="btn btn-ghost btn-sm" onClick={saveDraft} disabled={!!busy}>{busy === 'draft' ? 'Saving…' : 'Save draft'}</button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => nav(bookingUrl)}>Cancel</button>
        </span>
      </div>
      <div className="stack" style={{ gap: 8 }}>
        <h1 className="h-page" style={{ fontSize: 'clamp(28px, 5vw, 40px)', lineHeight: 1.05, overflowWrap: 'anywhere' }}>Quote for {client}</h1>
        <p className="num" style={{ fontSize: 16, color: 'var(--ink-2)' }}>{b.functionType} · {fmtLong(b.date)}{b.startTime ? ` · ${fmtTime(b.startTime)}` : ''}</p>
      </div>
      {existing && !editable && (
        <div className="banner banner-neutral">The last quote was {existing.status}. Saving here starts a new quote.</div>
      )}
      {b.status !== 'inquiry' && (
        <div className="banner banner-neutral">This booking is already {b.status}. Changing the quote doesn't change its agreed total of {rs(b.money?.total ?? 0)}.</div>
      )}

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 24, alignItems: 'flex-start' }}>
        <div style={{ flex: '999 1 560px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 20 }}>
          <section aria-labelledby="li-h" className="card" style={{ padding: 8 }}>
            <h2 id="li-h" style={{ padding: '16px 18px 10px', fontSize: 18, fontWeight: 600 }}>What's included</h2>
            <div style={{ ...lineGrid, padding: '6px 18px', fontSize: 12, color: 'var(--ink-3)' }} aria-hidden="true"><span>Item</span><span>Amount (Rs)</span><span /></div>
            {lines.map((l, i) => (
              <div key={l.key} style={{ ...lineGrid, alignItems: 'center', padding: '10px 18px', borderTop: '1px solid var(--line-soft)' }}>
                <input className="input" aria-label={`Item ${i + 1}`} placeholder={l.neg ? 'Discount' : 'Item'} value={l.name}
                  aria-invalid={lineErr === l.key || undefined} onChange={(e) => update(l.key, { name: e.target.value })} />
                <input className="input num" inputMode="numeric" aria-label={`Amount for ${l.name || `item ${i + 1}`}`} placeholder="0"
                  style={{ textAlign: 'right', color: l.neg ? 'var(--accent)' : 'var(--ink)' }}
                  value={l.amount == null ? (l.neg ? '-' : '') : `${l.neg ? '-' : ''}${groupPk(l.amount)}`}
                  onChange={(e) => {
                    const raw = e.target.value;
                    const d = raw.replace(/[^\d]/g, '');
                    update(l.key, { amount: d ? parseInt(d, 10) : null, neg: raw.trim().startsWith('-') || (l.neg && raw.includes('-')) });
                  }} />
                <button type="button" aria-label={`Remove ${l.name || `item ${i + 1}`}`} className="btn btn-ghost btn-sm" style={{ width: 36, padding: 0, border: 0, background: 'transparent', color: 'var(--ink-3)' }}
                  onClick={() => setLines((xs) => xs.filter((x) => x.key !== l.key))}>
                  <IconX size={14} />
                </button>
              </div>
            ))}
            {lines.length === 0 && <p className="small faint" style={{ padding: '10px 18px' }}>No items yet. Add one from your services.</p>}
            <div className="row" style={{ gap: 8, padding: '10px 14px 14px' }}>
              <div ref={menuRef} style={{ position: 'relative' }}>
                <button type="button" className="btn btn-ghost btn-sm" style={linkBtn} aria-expanded={menu} aria-haspopup="menu" onClick={() => setMenu((x) => !x)}>+ Add from your services</button>
                {menu && (
                  <div role="menu" className="search-pop" style={{ right: 'auto', width: 300, maxWidth: 'calc(100vw - 48px)' }}>
                    {activeServices.length === 0 && <p className="small faint" style={{ padding: 12 }}>{services.loading ? 'Loading…' : 'No services yet. Add them in Settings.'}</p>}
                    {activeServices.map((s) => (
                      <button key={s.id} type="button" role="menuitem" className="hov"
                        style={{ width: '100%', display: 'flex', justifyContent: 'space-between', gap: 10, padding: '10px 12px', borderRadius: 12, border: 0, background: 'transparent', cursor: 'pointer', textAlign: 'left', color: 'var(--ink)' }}
                        onClick={() => { setLines((xs) => [...xs, mkLine(`${s.name}${s.hours ? `, ${hoursLabel(s.hours)}` : ''}`, s.price)]); setMenu(false); }}>
                        <span className="stack" style={{ gap: 2, minWidth: 0 }}>
                          <span style={{ fontWeight: 500, fontSize: 14 }}>{s.name}</span>
                          {s.includes && <span className="tiny faint">{s.includes}</span>}
                        </span>
                        <span className="num small" style={{ whiteSpace: 'nowrap' }}>{s.price != null ? rs(s.price) : 'No price'}</span>
                      </button>
                    ))}
                    <button type="button" role="menuitem" className="hov" style={{ width: '100%', padding: '10px 12px', borderRadius: 12, border: 0, background: 'transparent', cursor: 'pointer', textAlign: 'left', fontSize: 14, color: 'var(--ink-2)' }}
                      onClick={() => { setLines((xs) => [...xs, mkLine('', null)]); setMenu(false); }}>
                      Blank item
                    </button>
                  </div>
                )}
              </div>
              <button type="button" className="btn btn-ghost btn-sm" style={linkBtn} onClick={() => setLines((xs) => [...xs, mkLine('Discount', null, true)])}>+ Add a discount</button>
            </div>
          </section>

          <section aria-labelledby="terms-h" className="card" style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 18 }}>
            <h2 id="terms-h" style={{ fontSize: 18, fontWeight: 600 }}>Terms</h2>
            <div className="row" style={{ gap: 16, alignItems: 'flex-start' }}>
              <div className="field" style={{ flex: '1 1 180px' }}>
                <label className="label" htmlFor="q-adv">Advance to confirm</label>
                <span className="row" style={{ gap: 8, flexWrap: 'nowrap' }}>
                  <input id="q-adv" className="input num" inputMode="numeric" style={{ width: 72 }} value={advPct}
                    onChange={(e) => setAdvPct(e.target.value.replace(/[^\d]/g, '').slice(0, 3))} />
                  <span className="num" style={{ fontSize: 14 }}>% = {rs(advance)}</span>
                </span>
              </div>
              <div className="field" style={{ flex: '1 1 220px' }}>
                <label className="label" htmlFor="q-hold">Keep the date pencilled in until</label>
                <input id="q-hold" type="date" className="input num" value={holdUntil ?? ''} min={today()} onChange={(e) => setHoldUntil(e.target.value)} />
                <span className="hint">{holdUntil ? `${fmtLong(holdUntil)}. After that the date frees up.` : 'No hold: the date stays pencilled in.'}</span>
              </div>
            </div>
            <div className="field">
              <label className="label" htmlFor="q-note">Note for {first} (optional)</label>
              <textarea id="q-note" className="textarea" style={{ minHeight: 88 }} value={note} onChange={(e) => setNote(e.target.value)} />
            </div>
          </section>
        </div>

        <aside aria-labelledby="send-h" style={{ flex: '1 1 340px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="card-hero" style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
            <span className="small" style={{ color: 'var(--hero-ink-3)' }}>What {first} sees</span>
            <div className="num" style={{ display: 'flex', flexDirection: 'column', gap: 10, fontSize: 14 }}>
              {lines.filter((l) => l.name.trim() || l.amount).map((l) => (
                <div key={l.key} className="row" style={{ justifyContent: 'space-between', gap: 12, flexWrap: 'nowrap' }}>
                  <span style={{ color: 'var(--hero-ink-2)', minWidth: 0 }}>{l.name || 'Item'}</span>
                  <span style={{ whiteSpace: 'nowrap' }}>{l.neg ? `– ${rs(l.amount ?? 0)}` : rs(l.amount ?? 0)}</span>
                </div>
              ))}
              <div className="row" style={{ justifyContent: 'space-between', alignItems: 'baseline', paddingTop: 12, borderTop: '1px solid rgba(255,255,255,.12)', flexWrap: 'nowrap' }}>
                <span style={{ color: 'var(--hero-ink-3)' }}>Total</span>
                <span style={{ fontSize: 30, fontWeight: 600, letterSpacing: '-0.03em' }}>{rs(total)}</span>
              </div>
              <div className="row" style={{ justifyContent: 'space-between' }}><span style={{ color: 'var(--hero-ink-3)' }}>Advance to confirm</span><span style={{ fontWeight: 600 }}>{rs(advance)}</span></div>
              <div className="row" style={{ justifyContent: 'space-between' }}><span style={{ color: 'var(--hero-ink-3)' }}>{business?.balanceDue === 'before_event' ? 'Balance before the event day' : 'Balance on the event day'}</span><span>{rs(balance)}</span></div>
            </div>
          </div>

          <div className="card" style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
            <h2 id="send-h" style={{ fontSize: 17, fontWeight: 600 }}>Send it</h2>
            <p style={{ padding: '12px 14px', borderRadius: '14px 14px 4px 14px', background: 'var(--accent-soft)', fontSize: 14, lineHeight: 1.5, overflowWrap: 'anywhere' }}>{message}</p>
            {err && <span className="error-text" role="alert">{err}</span>}
            <button type="button" className="btn btn-primary" style={{ height: 50, fontSize: 15, borderRadius: 14 }} disabled={!!busy || !b.client.whatsapp} onClick={sendWhatsApp}>
              <IconWhatsApp />{busy === 'wa' ? 'Opening WhatsApp…' : 'Send on WhatsApp'}
            </button>
            {!b.client.whatsapp && <span className="tiny faint">Add {first}'s WhatsApp number on the booking to send it there.</span>}
            <div className="row" style={{ gap: 8, flexWrap: 'nowrap' }}>
              <button type="button" className="btn btn-ghost" style={{ flex: 1, height: 44 }} disabled={!!busy} onClick={copyLink}>{busy === 'link' ? 'Copying…' : 'Copy link'}</button>
              <button type="button" className="btn btn-ghost" style={{ flex: 1, height: 44 }} disabled={!!busy || !b.client.email} onClick={sendEmail}>{busy === 'email' ? 'Sending…' : 'Send by email'}</button>
            </div>
            {!b.client.email ? (
              <span className="tiny faint">To send by email, add {first}'s email address first.</span>
            ) : (
              <span className="tiny faint">Emails go to {b.client.email}.</span>
            )}
            {quoteId && link && <span className="tiny faint" style={{ overflowWrap: 'anywhere' }}>Quote link: {link}</span>}
          </div>
        </aside>
      </div>
    </div>
  );
}

const lineGrid: CSSProperties = { display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(96px, 160px) 36px', gap: 12 };
const linkBtn: CSSProperties = { border: 0, background: 'transparent', color: 'var(--accent)', fontSize: 14 };
