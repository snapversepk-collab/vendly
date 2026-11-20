import { useEffect, useRef, useState, type CSSProperties, type FormEvent } from 'react';
import { del, post, type ApiError } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { METHOD_LABEL, daysBetween, fmtShort, rs, today } from '../../lib/format';
import type { BookingDetail, Money, Payment } from '../../lib/types';
import { IconX } from '../icons';
import { RupeeInput, WhatsAppButton, useToast } from '../ui';
import { dayWord, methodOptions, withYear } from './shared';

/** "due tonight" / "due on the event day" / "due before the event" */
export function dueWording(b: BookingDetail) {
  if (b.balanceDue === 'before_event') return daysBetween(today(), b.date) <= 0 ? 'due now' : `due before ${fmtShort(b.date)}`;
  const n = daysBetween(today(), b.date);
  if (n === 0) return `due ${dayWord(b.date, b.startTime).toLowerCase()}`;
  if (n === 1) return 'due tomorrow';
  if (n < 0) return 'overdue';
  return `due on ${fmtShort(b.date)}`;
}

/** Money with payments that are waiting on Undo taken out */
export function adjustMoney(m: Money, payments: Payment[], hidden: Set<string>): Money {
  const off = payments.filter((p) => hidden.has(p.id)).reduce((s, p) => s + p.amount, 0);
  const paid = m.paid - off;
  return { ...m, paid, balance: Math.max(0, m.total - paid), advancePaid: paid >= m.advanceDue && (m.total > 0 || paid > 0), fullyPaid: m.total > 0 && paid >= m.total };
}

export function PaymentsCard({ b, reload, fillTick, hidden, setHidden }: {
  b: BookingDetail; reload: () => void; fillTick: number; hidden: Set<string>; setHidden: (fn: (s: Set<string>) => Set<string>) => void;
}) {
  const { business } = useAuth();
  const toast = useToast();
  const methods = methodOptions(business);
  const payments = b.payments ?? [];
  const m = adjustMoney(b.money!, payments, hidden);
  const pct = m.total > 0 ? Math.min(100, Math.round((m.paid / m.total) * 100)) : 0;
  const advPct = b.money?.advancePct ?? business?.advancePct ?? 40;
  const shown = payments.filter((p) => !hidden.has(p.id));
  const cancelled = b.status === 'cancelled';

  const [amount, setAmount] = useState<number | null>(null);
  const [refund, setRefund] = useState(false);
  const [refundOpen, setRefundOpen] = useState(false);
  const [receivedOn, setReceivedOn] = useState(today());
  const [method, setMethod] = useState(methods[0]?.value ?? 'cash');
  const [note, setNote] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [offer, setOffer] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const amtId = `p-amt-${b.id}`;

  useEffect(() => {
    if (!fillTick) return;
    setRefund(false);
    setAmount(m.balance || null);
    formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setTimeout(() => document.getElementById(amtId)?.focus(), 300);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fillTick]);

  const isRefund = refund || (m.balance === 0 && refundOpen);
  const showForm = m.balance > 0 || refundOpen;

  async function record(e: FormEvent) {
    e.preventDefault();
    setErr(null);
    if (!amount) return setErr('Enter an amount');
    if (!isRefund && amount > m.balance) return setErr(`That is more than the balance left (${rs(m.balance)})`);
    if (isRefund && amount > m.paid) return setErr(`A refund cannot be more than what was paid (${rs(m.paid)})`);
    setBusy(true);
    try {
      const r = await post<{ payment: Payment; money: Money; offerConfirm: boolean }>(`/bookings/${b.id}/payments`, {
        amount: isRefund ? -amount : amount, receivedOn, method, note: note.trim() || null,
      });
      setAmount(null); setNote(''); setRefund(false); setRefundOpen(false); setReceivedOn(today());
      toast({ text: `${isRefund ? 'Refund' : 'Payment'} of ${rs(amount)} recorded · Receipt ${r.payment.receiptNo}`, tone: 'ok' });
      if (r.offerConfirm) setOffer(true);
      reload();
    } catch (e) {
      setErr((e as ApiError).message); // amount stays in the field
    } finally {
      setBusy(false);
    }
  }

  async function confirmNow() {
    try {
      await post(`/bookings/${b.id}/status`, { status: 'confirmed' });
      setOffer(false);
      toast({ text: 'Marked as Confirmed' });
      reload();
    } catch (e) {
      toast({ text: (e as ApiError).message, tone: 'error' });
    }
  }

  function remove(p: Payment) {
    let undone = false;
    setHidden((s) => new Set(s).add(p.id));
    toast({
      text: `${p.amount < 0 ? 'Refund' : 'Payment'} of ${rs(Math.abs(p.amount))} removed`, ms: 6000,
      action: { label: 'Undo', onClick: () => { undone = true; setHidden((s) => { const n = new Set(s); n.delete(p.id); return n; }); } },
    });
    setTimeout(async () => {
      if (undone) return;
      try {
        await del(`/payments/${p.id}`);
        reload();
      } catch (e) {
        setHidden((s) => { const n = new Set(s); n.delete(p.id); return n; });
        toast({ text: (e as ApiError).message, tone: 'error' });
      }
    }, 6000);
  }

  const balanceLabel = m.fullyPaid ? 'Balance' : `Balance, ${dueWording(b)}`;

  return (
    <article aria-labelledby="pay-h" className="card" style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'baseline' }}>
        <h2 id="pay-h" style={{ fontSize: 20, fontWeight: 600, letterSpacing: '-0.01em' }}>Payments</h2>
        {m.fullyPaid ? <span className="pill pill-confirmed">Paid in full</span> : <span className="small faint num">{pct}% received</span>}
      </div>
      <dl className="num" style={{ margin: 0, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 16 }}>
        <div><dt className="small faint">Agreed total</dt><dd style={bigNum}>{rs(m.total)}</dd></div>
        <div><dt className="small faint">Received</dt><dd style={{ ...bigNum, color: 'var(--accent)' }}>{rs(m.paid)}</dd></div>
        <div>
          <dt className="small faint">{balanceLabel}</dt>
          <dd style={{ ...bigNum, color: m.balance > 0 && !cancelled ? 'var(--amber)' : 'var(--ink)' }}>{m.fullyPaid ? 'Paid in full' : rs(m.balance)}</dd>
        </div>
      </dl>
      <div className="stack" style={{ gap: 8 }}>
        <div className="progress" role="progressbar" aria-label="Received" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
          <span style={{ width: `${pct}%`, background: 'var(--accent)' }} />
        </div>
        <div className="num row tiny faint" style={{ justifyContent: 'space-between', gap: 8 }}>
          <span>Advance {advPct}% · {rs(m.advanceDue)} · {m.advancePaid ? 'locked the date' : 'not received yet'}</span>
          <span>{b.balanceDue === 'before_event' ? 'Balance before the event day' : 'Balance on the event day'}</span>
        </div>
      </div>

      {offer && (
        <div className="banner banner-ok" role="status" style={{ justifyContent: 'space-between', flexWrap: 'wrap', alignItems: 'center' }}>
          <span>The advance is in. Mark this booking Confirmed?</span>
          <span className="row" style={{ gap: 8 }}>
            <button type="button" className="btn btn-sm btn-ghost" onClick={() => setOffer(false)}>Not now</button>
            <button type="button" className="btn btn-sm btn-primary" onClick={confirmNow}>Mark confirmed</button>
          </span>
        </div>
      )}

      {shown.length > 0 ? (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, borderTop: '1px solid var(--line-soft)' }}>
          {shown.map((p, i) => (
            <li key={p.id} className="num" style={{ display: 'flex', flexWrap: 'wrap', gap: '8px 16px', alignItems: 'center', padding: '14px 0', borderBottom: '1px solid var(--line-soft)' }}>
              <span style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0, flex: '1 1 200px' }}>
                <span style={{ fontSize: 15, fontWeight: 500 }}>{p.note || (p.amount < 0 ? 'Refund' : i === 0 ? 'Advance' : 'Payment')}</span>
                <span className="small faint">{withYear(p.receivedOn)} · {METHOD_LABEL[p.method] ?? p.method} · {p.receiptNo}</span>
              </span>
              <span className="row" style={{ gap: 8, flexWrap: 'nowrap', justifyContent: 'flex-end', marginLeft: 'auto' }}>
                <span style={{ fontSize: 16, fontWeight: 600, whiteSpace: 'nowrap', color: p.amount < 0 ? 'var(--danger)' : undefined }}>
                  {p.amount < 0 ? `– ${rs(-p.amount)}` : rs(p.amount)}
                </span>
                <WhatsAppButton bookingId={b.id} kind="receipt" paymentId={p.id} label="Send receipt" className="btn btn-ghost btn-sm" />
                <button type="button" aria-label={`Remove this payment of ${rs(Math.abs(p.amount))}`} className="btn btn-ghost btn-sm" style={{ width: 36, padding: 0, border: 0, background: 'transparent' }} onClick={() => remove(p)}>
                  <IconX size={14} />
                </button>
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="small faint" style={{ borderTop: '1px solid var(--line-soft)', paddingTop: 14 }}>No payments yet. Record the advance when it comes in.</p>
      )}

      {showForm ? (
        <form ref={formRef} onSubmit={record} noValidate style={{ display: 'flex', flexDirection: 'column', gap: 14, padding: 18, borderRadius: 18, background: 'var(--ground)', border: '1px solid var(--line-soft)' }}>
          <div className="row" style={{ justifyContent: 'space-between', gap: 10 }}>
            <span style={{ fontSize: 15, fontWeight: 600 }}>{isRefund ? 'Record a refund' : 'Record a payment'}</span>
            {m.balance > 0 && !isRefund && (
              <button type="button" className="num" style={fillBtn} onClick={() => { setAmount(m.balance); setErr(null); }}>Fill full balance · {rs(m.balance)}</button>
            )}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
            <div className="field">
              <label className="label" htmlFor={amtId}>Amount</label>
              <RupeeInput id={amtId} value={amount} onChange={(v) => { setAmount(v); setErr(null); }} invalid={!!err} />
            </div>
            <div className="field">
              <label className="label" htmlFor={`p-date-${b.id}`}>Received on</label>
              <input id={`p-date-${b.id}`} type="date" className="input num" value={receivedOn} max={today()} onChange={(e) => setReceivedOn(e.target.value)} />
            </div>
            <div className="field">
              <label className="label" htmlFor={`p-method-${b.id}`}>Method</label>
              <select id={`p-method-${b.id}`} className="select" value={method} onChange={(e) => setMethod(e.target.value)}>
                {methods.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
          </div>
          {err && <span className="error-text" role="alert">{err}</span>}
          <div className="row" style={{ gap: 10, flexWrap: 'wrap' }}>
            <input className="input" style={{ flex: '1 1 220px' }} placeholder="Note (optional)" aria-label="Payment note" value={note} onChange={(e) => setNote(e.target.value)} />
            <button type="submit" className="btn btn-primary" style={{ height: 44 }} disabled={busy}>{busy ? 'Saving…' : isRefund ? 'Record refund' : 'Record payment'}</button>
          </div>
          {m.paid > 0 && m.balance > 0 && (
            <label className="check small muted">
              <input type="checkbox" checked={refund} onChange={(e) => { setRefund(e.target.checked); setErr(null); }} />
              This is a refund to the client
            </label>
          )}
          {m.balance === 0 && (
            <button type="button" className="btn-link small" style={{ alignSelf: 'flex-start' }} onClick={() => { setRefundOpen(false); setErr(null); }}>Close</button>
          )}
        </form>
      ) : (
        m.paid > 0 && (
          <button type="button" className="btn-link small" style={{ alignSelf: 'flex-start' }} onClick={() => setRefundOpen(true)}>Record a refund</button>
        )
      )}
    </article>
  );
}

const bigNum: CSSProperties = { margin: '4px 0 0', fontSize: 26, fontWeight: 600, letterSpacing: '-0.03em' };
const fillBtn: CSSProperties = { height: 32, padding: '0 12px', borderRadius: 999, border: '1px solid var(--accent)', background: 'var(--surface)', color: 'var(--accent)', fontSize: 13, fontWeight: 600, cursor: 'pointer' };
