// Client quote page (/q/:token). Same look as the client receipt.
import { useEffect, useState, type CSSProperties } from 'react';
import { useParams } from 'react-router-dom';
import { ApiError, post } from '../lib/api';
import { fmtLong, fmtPhone, fmtTimeRange, firstName, rs, waLink } from '../lib/format';
import { useApi, useDocumentTitle } from '../lib/hooks';
import { followDevice } from '../lib/theme';
import type { PublicBusiness, QuoteLine } from '../lib/types';
import { CopyField, FnDot, Skeleton } from '../components/ui';
import { IconAlert, IconCheck, IconWhatsApp } from '../components/icons';
import { ClientFooter, ClientMessage, ClientShell, DetailRow, VendorMark, fmtDayMonth } from '../components/client/ClientParts';

interface PublicQuote {
  business: PublicBusiness; clientName: string; functionType: string; date: string; startTime: string | null; hours: number | null; venue: string | null;
  lines: QuoteLine[]; note: string | null; holdUntil: string | null; status: 'draft' | 'sent' | 'accepted' | 'expired'; bookingStatus: string;
  total: number; advancePct: number; advanceDue: number; balanceAfterAdvance: number; paid: number;
}

export default function ClientQuote() {
  const { token = '' } = useParams();
  const q = useApi<PublicQuote>(`/public/q/${encodeURIComponent(token)}`);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<{ code?: string; message: string } | null>(null);
  useEffect(() => { followDevice(); }, []);
  useDocumentTitle(q.data ? `Quote from ${q.data.business.name}` : 'Quote');

  if (q.loading && !q.data) return <QuoteSkeleton />;
  if (q.error && !q.data) {
    if (q.error.status === 404) return <ClientMessage what="Quote" title="This quote link isn't valid">Ask the vendor to send you the link again.</ClientMessage>;
    return <ClientMessage what="Quote" title="That didn't load"><p>{q.error.message}</p><button className="btn btn-ghost" style={{ marginTop: 12 }} onClick={q.reload}>Try again</button></ClientMessage>;
  }
  const d = q.data!;
  const b = d.business;
  const cancelled = d.bookingStatus === 'cancelled';
  const status = d.status;
  const first = firstName(d.clientName);
  const time = fmtTimeRange(d.startTime, d.hours);
  const dueWhen = b.balanceDue === 'before_event' ? 'due before the event' : 'due on the event day';
  const waText = `Assalam o Alaikum ${b.name}, this is ${d.clientName}. I've accepted your quote for my ${d.functionType} on ${fmtDayMonth(d.date)}. How should I send the advance of ${rs(d.advanceDue)}?`;
  const waAsk = `Assalam o Alaikum ${b.name}, this is ${d.clientName}, about the quote for my ${d.functionType} on ${fmtDayMonth(d.date)}.`;

  const accept = async () => {
    setBusy(true);
    setErr(null);
    try {
      await post(`/public/q/${encodeURIComponent(token)}/accept`);
      q.setData((x) => (x ? { ...x, status: 'accepted' } : x));
    } catch (e) {
      const a = e as ApiError;
      setErr({ code: a.code, message: a.message });
      if (a.code === 'expired') q.setData((x) => (x ? { ...x, status: 'expired' } : x));
    } finally {
      setBusy(false);
    }
  };

  const row: CSSProperties = { display: 'flex', justifyContent: 'space-between', gap: 12 };
  return (
    <ClientShell gap={14}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, paddingTop: 12 }}>
        <VendorMark name={b.name} logo={b.logo} size={36} />
        <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          <span style={{ fontSize: 15, fontWeight: 600 }}>{b.name}</span>
          <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>Quote for {d.clientName}</span>
        </span>
      </div>

      <main style={{ background: 'var(--surface)', borderRadius: 24, padding: '22px 20px', display: 'flex', flexDirection: 'column', gap: 18 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <span style={{ fontSize: 14, color: 'var(--ink-2)', display: 'inline-flex', alignItems: 'center', gap: 7 }}><FnDot fn={d.functionType} />Quote for your {d.functionType}</span>
          <h1 className="num" style={{ fontSize: 40, lineHeight: 1, fontWeight: 600, letterSpacing: '-0.04em' }}>{rs(d.total)}</h1>
          <span style={{ fontSize: 14, color: 'var(--ink-2)' }}>{fmtLong(d.date)}{time ? `, ${time}` : ''}</span>
        </div>

        <dl style={{ margin: 0, display: 'flex', flexDirection: 'column', fontSize: 14 }}>
          <DetailRow term="Function">{d.functionType}</DetailRow>
          <DetailRow term="Venue">{d.venue || <span style={{ color: 'var(--ink-3)' }}>To be confirmed</span>}</DetailRow>
        </dl>

        <div>
          <h2 style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink-3)', marginBottom: 4 }}>What's included</h2>
          <ul className="num" style={{ listStyle: 'none', margin: 0, padding: 0, fontSize: 14 }}>
            {d.lines.map((l, i) => (
              <li key={i} style={{ ...row, padding: '10px 0', borderTop: i ? '1px solid var(--line-soft)' : 0 }}>
                <span style={{ minWidth: 0 }}>{l.name}</span>
                <span style={{ whiteSpace: 'nowrap', color: l.amount < 0 ? 'var(--accent)' : 'var(--ink)' }}>{l.amount < 0 ? `− ${rs(-l.amount)}` : rs(l.amount)}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="num" style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: 14, borderRadius: 16, background: 'var(--ground)', fontSize: 14 }}>
          <div style={row}><span style={{ color: 'var(--ink-2)' }}>Total</span><span style={{ fontWeight: 600 }}>{rs(d.total)}</span></div>
          <div style={row}><span style={{ color: 'var(--ink-2)' }}>Advance to confirm ({d.advancePct}%)</span><span style={{ color: 'var(--accent)', fontWeight: 600 }}>{rs(d.advanceDue)}</span></div>
          {d.paid > 0 && <div style={row}><span style={{ color: 'var(--ink-2)' }}>Paid so far</span><span>{rs(d.paid)}</span></div>}
          <div style={{ ...row, alignItems: 'baseline', paddingTop: 10, borderTop: '1px solid var(--line)' }}>
            <span style={{ color: 'var(--ink-2)' }}>Balance, {dueWhen}</span>
            <span style={{ fontSize: 18, fontWeight: 600 }}>{rs(d.balanceAfterAdvance)}</span>
          </div>
        </div>

        {d.note && <p style={{ fontSize: 14, lineHeight: 1.55, color: 'var(--ink-2)', whiteSpace: 'pre-wrap', padding: '12px 14px', borderLeft: '3px solid var(--line)' }}>{d.note}</p>}

        {cancelled ? (
          <div className="banner banner-neutral">This booking has been cancelled. Message {b.name} if you have questions.</div>
        ) : status === 'accepted' ? (
          <div className="banner banner-ok" role="status" style={{ flexDirection: 'column', gap: 4 }}>
            <strong style={{ fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 6 }}><IconCheck size={16} />You've accepted this quote</strong>
            <span>Send the advance of <span className="num">{rs(d.advanceDue)}</span> and message {b.name} on WhatsApp. Your date is confirmed once they receive it.</span>
          </div>
        ) : status === 'expired' ? (
          <div className="banner banner-amber" role="status" style={{ flexDirection: 'column', gap: 4 }}>
            <strong style={{ fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 6 }}><IconAlert size={16} />This quote has expired</strong>
            <span>{d.holdUntil ? `${b.name} kept ${fmtDayMonth(d.date)} for you until ${fmtDayMonth(d.holdUntil)}. ` : ''}Message them to check if the date is still free.</span>
          </div>
        ) : (
          d.holdUntil && <p style={{ fontSize: 14, lineHeight: 1.5, color: 'var(--ink-2)' }}>We'll keep {fmtDayMonth(d.date)} for you until {fmtDayMonth(d.holdUntil)}. Accept and send the advance before then to confirm it.</p>
        )}

        {err && (
          <div className="banner banner-danger" role="alert">{err.code === 'date_full' ? `Sorry, ${fmtDayMonth(d.date)} has just been booked. Please message ${b.name}.` : err.message}</div>
        )}
      </main>

      {!cancelled && status !== 'accepted' && status !== 'expired' && (
        <button type="button" className="btn btn-primary btn-block" onClick={accept} disabled={busy} style={{ height: 50, borderRadius: 14, fontSize: 15 }}>
          {busy ? 'Accepting…' : `Accept quote${first ? `, ${first}` : ''}`}
        </button>
      )}

      {b.whatsapp && (
        <>
          <a href={waLink(b.whatsapp, status === 'accepted' ? waText : waAsk)} target="_blank" rel="noreferrer" className="btn btn-dark btn-block" style={{ height: 50, borderRadius: 14, fontSize: 15 }}>
            <IconWhatsApp />{status === 'accepted' ? `Send the advance and message ${b.name}` : `Message ${b.name}`}
          </a>
          <div style={{ fontSize: 13, color: 'var(--ink-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span>WhatsApp</span><CopyField value={b.whatsapp} display={fmtPhone(b.whatsapp)} />
          </div>
        </>
      )}
      <ClientFooter what="Quote" />
    </ClientShell>
  );
}

function QuoteSkeleton() {
  return (
    <ClientShell gap={14}>
      <div aria-busy="true" className="stack" style={{ gap: 14, paddingTop: 12 }}>
        <div className="row" style={{ flexWrap: 'nowrap' }}><Skeleton h={36} w={36} r={11} /><Skeleton h={30} w={160} /></div>
        <Skeleton h={460} r={24} />
        <Skeleton h={50} r={14} />
      </div>
    </ClientShell>
  );
}
