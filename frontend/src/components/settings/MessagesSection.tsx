// Settings: automatic email switches (+ preview) and WhatsApp message texts
import { useState, type CSSProperties } from 'react';
import { patch } from '../../lib/api';
import { addDays, fmtLong, fmtPhone, fmtShort, fmtDayMon, initials, rs, today, weekday } from '../../lib/format';
import type { Business, MessageTemplate } from '../../lib/types';
import type { useApi } from '../../lib/hooks';
import { Modal, Skeleton, useToast } from '../ui';
import { Section, rowStyle, useSaver } from './common';

type Tpl = ReturnType<typeof useApi<MessageTemplate[]>>;

/** Emails that go to the vendor; everything else goes to clients */
const TO_YOU = new Set(['new_inquiry', 'tomorrow_glance', 'advance_missing']);
const EMAIL_INFO: Record<string, { when: string; timing: string }> = {
  inquiry_received: { when: 'When someone asks about a date on your booking page', timing: 'Right away' },
  booking_confirmed: { when: 'When you mark a booking confirmed, with the receipt link', timing: 'Right away' },
  payment_received: { when: 'Each time you record a payment', timing: 'Right away' },
  event_reminder: { when: 'Date, time, venue and the balance still due', timing: '2 days before' },
  thank_you: { when: 'With a link to leave you a review', timing: 'Day after' },
  new_inquiry: { when: 'Someone asked about a date on your booking page', timing: 'Right away' },
  tomorrow_glance: { when: 'Events, prep left and money to collect', timing: '8:00 pm' },
  advance_missing: { when: 'An inquiry is close to its date with no advance', timing: '3 days before' },
};

export function EmailsSection({ tpl, b }: { tpl: Tpl; b: Business | null }) {
  const saver = useSaver();
  const [preview, setPreview] = useState(false);
  const emails = (tpl.data ?? []).filter((t) => t.channel === 'email');
  const groups = [
    { name: 'To your clients', items: emails.filter((t) => !TO_YOU.has(t.kind)) },
    { name: 'To you', items: emails.filter((t) => TO_YOU.has(t.kind)) },
  ].filter((g) => g.items.length);

  const toggle = async (t: MessageTemplate, enabled: boolean) => {
    tpl.setData((x) => x?.map((y) => (y.id === t.id ? { ...y, enabled } : y)) ?? x);
    const ok = await saver.run(() => patch(`/message-templates/${t.id}`, { enabled }));
    if (!ok) tpl.setData((x) => x?.map((y) => (y.id === t.id ? { ...y, enabled: !enabled } : y)) ?? x);
  };

  const name = b?.name ?? 'your business';
  return (
    <Section id="emails" title="Automatic emails"
      sub={<>Sent for you, even when you forget. Clients see them from {name}{b?.email ? <>, and their replies come to {b.email}</> : ''}.</>}
      action={<span className="row" style={{ gap: 12 }}>
        {saver.state !== 'idle' && <span className="small" style={{ color: saver.state === 'error' ? 'var(--danger)' : 'var(--ink-3)' }}>{saver.state === 'saving' ? 'Saving…' : saver.state === 'saved' ? 'Saved' : saver.error}</span>}
        <button type="button" className="btn-link" style={{ fontSize: 14, cursor: 'pointer' }} onClick={() => setPreview(true)}>Preview an email</button>
      </span>}>
      {tpl.loading && !tpl.data ? <div style={rowStyle}><Skeleton h={200} /></div>
        : tpl.error && !tpl.data ? <div style={rowStyle} className="row"><span className="error-text">{tpl.error.message}</span><button className="btn btn-ghost btn-sm" onClick={tpl.reload}>Try again</button></div>
        : groups.map((g) => (
          <div key={g.name} style={{ display: 'flex', flexDirection: 'column' }}>
            <h3 style={{ padding: '14px 18px 6px', fontSize: 13, fontWeight: 600, color: 'var(--ink-3)', borderTop: '1px solid var(--line-soft)' }}>{g.name}</h3>
            {g.items.map((t) => {
              const info = EMAIL_INFO[t.kind] ?? { when: t.timing ?? '', timing: '' };
              return (
                <label key={t.id} htmlFor={`em-${t.id}`} className="hov" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto auto', gap: 16, alignItems: 'center', padding: '12px 18px', borderRadius: 14, cursor: 'pointer' }}>
                  <span style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
                    <span style={{ fontSize: 15, fontWeight: 500 }}>{t.name}</span>
                    <span style={{ fontSize: 13, color: 'var(--ink-3)' }}>{info.when}</span>
                  </span>
                  <span className="num" style={{ fontSize: 12, color: 'var(--ink-3)', whiteSpace: 'nowrap' }}>{info.timing}</span>
                  <input id={`em-${t.id}`} type="checkbox" role="switch" aria-checked={t.enabled} checked={t.enabled} onChange={(e) => toggle(t, e.target.checked)}
                    style={{ width: 22, height: 22, margin: 0, accentColor: 'var(--accent)' }} />
                </label>
              );
            })}
          </div>
        ))}
      <p style={{ margin: '6px 18px 14px', padding: '12px 14px', borderRadius: 12, background: 'var(--ground)', fontSize: 13, lineHeight: 1.5, color: 'var(--ink-2)' }}>
        Emails go only to clients who give an email address. WhatsApp stays your main way to reach them.
      </p>
      <Modal open={preview} onClose={() => setPreview(false)} title="Booking confirmed email" width={760}>
        <EmailPreview b={b} />
      </Modal>
    </Section>
  );
}

/** Static preview of the "Booking confirmed" email (canvas: Email_Booking_confirmed) with sample client data */
function EmailPreview({ b }: { b: Business | null }) {
  const name = b?.name ?? 'Your Studio';
  // Sample event: a Saturday about two weeks out
  let date = addDays(today(), 14);
  while (weekday(date) !== 5) date = addDays(date, 1);
  const total = 120000;
  const pct = b?.advancePct ?? 40;
  const adv = Math.round((total * pct) / 100);
  const notice = b?.rescheduleNoticeDays ?? 7;
  const due = b?.balanceDue === 'before_event' ? 'due before the event' : 'due on the event day';
  const paidOn = fmtDayMon(today());
  const row: CSSProperties = { display: 'flex', justifyContent: 'space-between', gap: 16, padding: '12px 0', borderBottom: '1px solid var(--line-soft)' };
  return (
    <div style={{ background: 'var(--track)', borderRadius: 16, padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
      <p className="small faint">Sample client and amounts. Real emails use the booking's details.</p>
      <dl style={{ margin: 0, background: 'var(--surface)', borderRadius: 14, padding: '14px 18px', display: 'grid', gridTemplateColumns: '72px minmax(0, 1fr)', rowGap: 6, fontSize: 13 }}>
        <dt style={{ color: 'var(--ink-3)' }}>From</dt><dd style={{ margin: 0, overflowWrap: 'anywhere' }}><b style={{ fontWeight: 600 }}>{name} via Vendly</b></dd>
        <dt style={{ color: 'var(--ink-3)' }}>Reply-to</dt><dd style={{ margin: 0, overflowWrap: 'anywhere' }}>{b?.email ?? 'your email'}</dd>
        <dt style={{ color: 'var(--ink-3)' }}>Subject</dt><dd style={{ margin: 0, fontWeight: 600 }}>Your Barat on {fmtShort(date)} is confirmed</dd>
      </dl>
      <div style={{ background: 'var(--surface)', borderRadius: 14, padding: 'clamp(20px, 5vw, 40px) clamp(16px, 5vw, 48px)', display: 'flex', flexDirection: 'column', gap: 24 }}>
        <div className="row" style={{ gap: 12 }}>
          <span style={{ width: 40, height: 40, borderRadius: 12, background: 'var(--ink)', color: 'var(--ground)', display: 'grid', placeItems: 'center', fontSize: 14, fontWeight: 600 }}>{initials(name)}</span>
          <span style={{ fontSize: 16, fontWeight: 600 }}>{name}</span>
        </div>
        <div className="stack" style={{ gap: 10 }}>
          <h3 className="h-page" style={{ fontSize: 'clamp(26px, 4vw, 34px)' }}>Your date is confirmed</h3>
          <p style={{ fontSize: 16, lineHeight: 1.6, color: 'var(--ink-2)' }}>Hi Laiba, thank you for booking {name} for your Barat. We've received your advance and your date is now reserved for you.</p>
        </div>
        <dl style={{ margin: 0, borderTop: '1px solid var(--line-soft)', fontSize: 15 }}>
          <div style={row}><dt style={{ color: 'var(--ink-3)' }}>Date and time</dt><dd className="num" style={{ margin: 0, textAlign: 'right' }}>{fmtLong(date)}, 8:00 pm – 12:00 am</dd></div>
          <div style={row}><dt style={{ color: 'var(--ink-3)' }}>Service</dt><dd style={{ margin: 0, textAlign: 'right' }}>Grand booth, 4 hours</dd></div>
          <div style={row}><dt style={{ color: 'var(--ink-3)' }}>Venue</dt><dd style={{ margin: 0, textAlign: 'right' }}>Grand Marquee, DHA Phase 2{b?.cities[0] ? `, ${b.cities[0]}` : ''}</dd></div>
        </dl>
        <div className="num" style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '18px 20px', borderRadius: 14, background: 'var(--ground)', fontSize: 15 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}><span style={{ color: 'var(--ink-2)' }}>Agreed total</span><span>{rs(total)}</span></div>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}><span style={{ color: 'var(--ink-2)' }}>Advance paid, {paidOn}</span><span style={{ color: 'var(--accent)', fontWeight: 600 }}>{rs(adv)}</span></div>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, paddingTop: 10, borderTop: '1px solid var(--line)' }}><span style={{ color: 'var(--ink-2)' }}>Balance, {due}</span><span style={{ fontWeight: 600 }}>{rs(total - adv)}</span></div>
        </div>
        <span className="btn btn-primary" style={{ alignSelf: 'flex-start', height: 48, padding: '0 24px', cursor: 'default' }} aria-hidden="true">View your receipt</span>
        <p style={{ fontSize: 14, lineHeight: 1.6, color: 'var(--ink-2)' }}>
          Need to change the date? Please tell us at least {notice} days before the event. Questions? Just reply to this email{b?.whatsapp ? <>, or message us on WhatsApp at <span className="num">{fmtPhone(b.whatsapp)}</span></> : ''}.
        </p>
        <p style={{ paddingTop: 20, borderTop: '1px solid var(--line-soft)', fontSize: 12, lineHeight: 1.5, color: 'var(--ink-3)' }}>
          Sent by Vendly on behalf of {name}. You're getting this because you booked an event with them.
        </p>
      </div>
    </div>
  );
}

export function WhatsAppSection({ tpl }: { tpl: Tpl }) {
  const list = (tpl.data ?? []).filter((t) => t.channel === 'whatsapp');
  return (
    <Section id="whatsapp" title="WhatsApp messages" sub="Ready-made messages you send in one tap. Words in brackets fill in by themselves.">
      {tpl.loading && !tpl.data ? <div style={rowStyle}><Skeleton h={160} /></div>
        : tpl.error && !tpl.data ? <div style={rowStyle} className="row"><span className="error-text">{tpl.error.message}</span><button className="btn btn-ghost btn-sm" onClick={tpl.reload}>Try again</button></div>
        : list.map((t) => <WaTemplate key={t.id} t={t} onSaved={(n) => tpl.setData((x) => x?.map((y) => (y.id === n.id ? n : y)) ?? x)} />)}
    </Section>
  );
}

function WaTemplate({ t, onSaved }: { t: MessageTemplate; onSaved: (t: MessageTemplate) => void }) {
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(t.text);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const save = async () => {
    if (!text.trim()) { setErr('Write a message'); return; }
    setBusy(true);
    setErr(null);
    try {
      const n = await patch<MessageTemplate>(`/message-templates/${t.id}`, { text: text.trim() });
      onSaved(n);
      setEditing(false);
      toast({ text: `${t.name} message saved` });
    } catch (e: any) {
      setErr(e.message ?? "Couldn't save");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, padding: '16px 18px', borderTop: '1px solid var(--line-soft)' }}>
      <span style={{ flex: '1 1 200px', display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
        <span style={{ fontSize: 15, fontWeight: 600 }}>{t.name}</span>
        {t.timing && <span style={{ fontSize: 13, color: 'var(--ink-3)' }}>{t.timing}</span>}
      </span>
      {editing ? (
        <div style={{ flex: '2 1 340px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <textarea className="textarea" aria-label={`${t.name} message`} value={text} onChange={(e) => setText(e.target.value)} rows={4} autoFocus maxLength={2000} />
          <span className="hint">Brackets that fill in: [client], [function], [date], [amount], [advance], [receipt link], [review link]</span>
          <div className="row" style={{ gap: 8 }}>
            <button type="button" className="btn btn-dark btn-sm" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setEditing(false); setText(t.text); setErr(null); }}>Cancel</button>
            {err && <span className="error-text" role="alert">{err}</span>}
          </div>
        </div>
      ) : (
        <>
          <span style={{ flex: '2 1 340px', minWidth: 0, padding: '12px 14px', borderRadius: '14px 14px 14px 4px', background: 'var(--hover)', fontSize: 14, lineHeight: 1.5, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{t.text}</span>
          <button type="button" className="btn btn-ghost btn-sm" style={{ alignSelf: 'flex-start' }} onClick={() => setEditing(true)} aria-label={`Edit ${t.name} message`}>Edit</button>
        </>
      )}
    </div>
  );
}
