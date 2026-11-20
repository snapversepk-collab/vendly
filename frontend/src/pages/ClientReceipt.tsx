// Client receipt (canvas: Client_Receipt). Payment confirmation, payments so far, balance. Print-friendly.
import { useEffect, type CSSProperties } from 'react';
import { useParams } from 'react-router-dom';
import { METHOD_LABEL, fmtPhone, fmtShort, fmtTime, rs, waLink } from '../lib/format';
import { useApi, useDocumentTitle } from '../lib/hooks';
import { followDevice } from '../lib/theme';
import type { PublicBusiness } from '../lib/types';
import { CopyField, Skeleton } from '../components/ui';
import { IconCheck, IconWhatsApp } from '../components/icons';
import { ClientFooter, ClientMessage, ClientShell, DetailRow, VendorMark, fmtDMY } from '../components/client/ClientParts';

interface PublicReceipt {
  business: PublicBusiness; receiptNo: string; amount: number; receivedOn: string; method: string; note: string | null;
  clientName: string; functionType: string; date: string; startTime: string | null; venue: string | null; serviceName: string | null; bookingStatus: string;
  payments: { amount: number; receivedOn: string; method: string; receiptNo: string }[];
  total: number; paid: number; balance: number; fullyPaid: boolean;
}

const methodLabel = (m: string) => METHOD_LABEL[m] ?? m;

export default function ClientReceipt() {
  const { token = '' } = useParams();
  const r = useApi<PublicReceipt>(`/public/r/${encodeURIComponent(token)}`);
  useEffect(() => {
    followDevice();
    // Print on light paper even when the phone is in dark mode
    const before = () => { document.documentElement.dataset.theme = 'light'; };
    const after = () => followDevice();
    window.addEventListener('beforeprint', before);
    window.addEventListener('afterprint', after);
    return () => { window.removeEventListener('beforeprint', before); window.removeEventListener('afterprint', after); };
  }, []);
  useDocumentTitle(r.data ? `Receipt ${r.data.receiptNo}` : 'Receipt');

  if (r.loading && !r.data) return <ReceiptSkeleton />;
  if (r.error && !r.data) {
    if (r.error.status === 404) return <ClientMessage what="Receipt" title="This receipt link isn't valid">Ask the vendor to send you the link again.</ClientMessage>;
    return <ClientMessage what="Receipt" title="That didn't load"><p>{r.error.message}</p><button className="btn btn-ghost" style={{ marginTop: 12 }} onClick={r.reload}>Try again</button></ClientMessage>;
  }
  const d = r.data!;
  const b = d.business;
  const idx = d.payments.findIndex((p) => p.receiptNo === d.receiptNo);
  const isLast = idx === d.payments.length - 1;
  const what = d.amount < 0 ? 'Refund for' : d.payments.length === 1 ? (d.fullyPaid ? 'Full payment for' : 'Advance for') : idx === 0 ? 'Advance for' : d.fullyPaid && isLast ? 'Final payment for' : 'Payment for';
  const pct = d.total > 0 ? Math.min(100, Math.round((d.paid / d.total) * 100)) : 100;
  const dueWhen = b.balanceDue === 'before_event' ? 'due before the event' : 'due on the event day';
  const row: CSSProperties = { display: 'flex', justifyContent: 'space-between', gap: 12 };
  const waText = `Assalam o Alaikum ${b.name}, this is ${d.clientName} about receipt ${d.receiptNo}.`;

  return (
    <ClientShell gap={14}>
      <style>{`@media print { .no-print { display: none !important; } .receipt-card { border: 1px solid var(--line); } }`}</style>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, paddingTop: 12 }}>
        <VendorMark name={b.name} logo={b.logo} size={36} />
        <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0, flex: 1 }}>
          <span style={{ fontSize: 15, fontWeight: 600 }}>{b.name}</span>
          <span className="num" style={{ fontSize: 12, color: 'var(--ink-3)' }}>Receipt {d.receiptNo}</span>
        </span>
        <button type="button" className="btn btn-ghost btn-sm no-print" onClick={() => window.print()}>Print</button>
      </div>

      <main className="receipt-card" style={{ background: 'var(--surface)', borderRadius: 24, padding: '22px 20px', display: 'flex', flexDirection: 'column', gap: 18 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <span style={{ width: 44, height: 44, borderRadius: '50%', background: 'var(--accent-soft)', color: 'var(--accent)', display: 'grid', placeItems: 'center' }}><IconCheck size={22} /></span>
          <span style={{ fontSize: 14, color: 'var(--ink-2)' }}>{d.amount < 0 ? 'Refund recorded' : 'Payment received'}</span>
          <h1 className="num" style={{ fontSize: 40, lineHeight: 1, fontWeight: 600, letterSpacing: '-0.04em' }}>{rs(Math.abs(d.amount))}</h1>
          <span style={{ fontSize: 14, color: 'var(--ink-2)' }}>{what} {d.clientName}'s {d.functionType}</span>
        </div>

        <dl style={{ margin: 0, display: 'flex', flexDirection: 'column', fontSize: 14 }}>
          <DetailRow term="Event">{fmtShort(d.date)}{d.startTime ? `, ${fmtTime(d.startTime)}` : ''}</DetailRow>
          {d.serviceName && <DetailRow term="Service">{d.serviceName}</DetailRow>}
          {d.venue && <DetailRow term="Venue">{d.venue}</DetailRow>}
          <DetailRow term="Paid by">{methodLabel(d.method)}, {fmtDMY(d.receivedOn)}</DetailRow>
          <DetailRow term="Receipt">{d.receiptNo}</DetailRow>
          {d.note && <DetailRow term="Note">{d.note}</DetailRow>}
        </dl>

        <div className="num" style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: 14, borderRadius: 16, background: 'var(--ground)', fontSize: 14 }}>
          <div style={row}><span style={{ color: 'var(--ink-2)' }}>Agreed total</span><span>{rs(d.total)}</span></div>
          <div style={row}><span style={{ color: 'var(--ink-2)' }}>Paid so far</span><span style={{ color: 'var(--accent)', fontWeight: 600 }}>{rs(d.paid)}</span></div>
          <div role="progressbar" aria-label="Paid so far" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} style={{ display: 'flex', height: 6, borderRadius: 999, overflow: 'hidden', background: 'var(--line)' }}>
            <span style={{ width: `${pct}%`, background: 'var(--accent)' }} />
          </div>
          {d.fullyPaid ? (
            <div style={{ ...row, alignItems: 'center' }}>
              <span style={{ color: 'var(--ink-2)' }}>Balance</span>
              <span style={{ fontSize: 18, fontWeight: 600, color: 'var(--accent)', display: 'inline-flex', alignItems: 'center', gap: 6 }}><IconCheck size={18} />Paid in full</span>
            </div>
          ) : (
            <div style={{ ...row, alignItems: 'baseline' }}>
              <span style={{ color: 'var(--ink-2)' }}>Balance, {dueWhen}</span>
              <span style={{ fontSize: 18, fontWeight: 600 }}>{rs(d.balance)}</span>
            </div>
          )}
        </div>

        {d.payments.length > 1 && (
          <div>
            <h2 style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink-3)', marginBottom: 4 }}>All payments</h2>
            <ul className="num" style={{ listStyle: 'none', margin: 0, padding: 0, fontSize: 14 }}>
              {d.payments.map((p, i) => {
                const current = p.receiptNo === d.receiptNo;
                return (
                  <li key={p.receiptNo} aria-current={current ? 'true' : undefined} style={{ ...row, padding: '10px 0', borderTop: i ? '1px solid var(--line-soft)' : 0, fontWeight: current ? 600 : 400 }}>
                    <span style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
                      <span>{fmtDMY(p.receivedOn)} · {methodLabel(p.method)}</span>
                      <span style={{ fontSize: 12, color: 'var(--ink-3)', fontWeight: 400 }}>{p.receiptNo}{current ? ' · this receipt' : ''}</span>
                    </span>
                    <span style={{ whiteSpace: 'nowrap' }}>{p.amount < 0 ? `− ${rs(-p.amount)}` : rs(p.amount)}</span>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </main>

      <p style={{ padding: '0 6px', fontSize: 12, lineHeight: 1.5, color: 'var(--ink-3)' }}>
        {d.bookingStatus === 'cancelled'
          ? 'This booking was cancelled. Payments stay on record.'
          : d.fullyPaid
            ? `Thank you. Everything is paid for your ${d.functionType}.`
            : d.bookingStatus === 'confirmed' || d.bookingStatus === 'completed'
              ? `Your date is confirmed.${b.rescheduleNoticeDays > 0 ? ` Changing it needs at least ${b.rescheduleNoticeDays} days' notice.` : ''}`
              : `${b.name} will confirm your date once the advance is in.`}
      </p>

      {b.whatsapp && (
        <div className="no-print stack" style={{ gap: 10 }}>
          <a href={waLink(b.whatsapp, waText)} target="_blank" rel="noreferrer" className="btn btn-dark btn-block" style={{ height: 50, borderRadius: 14, fontSize: 15 }}>
            <IconWhatsApp />Message {b.name}
          </a>
          <div style={{ fontSize: 13, color: 'var(--ink-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span>WhatsApp</span><CopyField value={b.whatsapp} display={fmtPhone(b.whatsapp)} />
          </div>
        </div>
      )}
      <ClientFooter what="Receipt" />
    </ClientShell>
  );
}

function ReceiptSkeleton() {
  return (
    <ClientShell gap={14}>
      <div aria-busy="true" className="stack" style={{ gap: 14, paddingTop: 12 }}>
        <div className="row" style={{ flexWrap: 'nowrap' }}><Skeleton h={36} w={36} r={11} /><Skeleton h={30} w={160} /></div>
        <Skeleton h={480} r={24} />
        <Skeleton h={50} r={14} />
      </div>
    </ClientShell>
  );
}
