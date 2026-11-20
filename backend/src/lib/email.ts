import { config } from '../config.js';
import { one, q } from '../db/index.js';
import { fmtDate, fmtTime } from './dates.js';
import { moneySummary, rs } from './money.js';

const esc = (s: unknown) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

const initials = (name: string) =>
  name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join('');

interface Business { id: string; name: string; email?: string | null; whatsapp?: string | null; reschedule_notice_days: number; balance_due: string }

/** Light-only email layout (spec: emails are always light). Inline styles for mail clients. */
function layout(biz: Business, heading: string, intro: string, body: string, cta?: { href: string; label: string }) {
  const btn = cta
    ? `<a href="${esc(cta.href)}" style="display:inline-block;height:48px;line-height:48px;padding:0 24px;border-radius:12px;background:#0A6B4D;color:#FFFFFF;font-size:15px;font-weight:600;text-decoration:none">${esc(cta.label)}</a>`
    : '';
  const contact = biz.whatsapp ? ` or message us on WhatsApp at ${esc(biz.whatsapp)}` : '';
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><meta name="color-scheme" content="light only"></head>
<body style="margin:0;background:#E9EBE6;font-family:Geist,-apple-system,'Segoe UI',Roboto,sans-serif;color:#0E1311">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#E9EBE6;padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#FFFFFF;border-radius:16px"><tr><td style="padding:36px 36px 28px">
<table role="presentation" cellpadding="0" cellspacing="0"><tr>
<td style="width:40px;height:40px;border-radius:12px;background:#0E1311;color:#FFFFFF;text-align:center;font-size:14px;font-weight:600">${esc(initials(biz.name))}</td>
<td style="padding-left:12px;font-size:16px;font-weight:600">${esc(biz.name)}</td></tr></table>
<h1 style="margin:24px 0 10px;font-size:30px;line-height:1.1;font-weight:600;letter-spacing:-0.03em">${esc(heading)}</h1>
<p style="margin:0 0 24px;font-size:16px;line-height:1.6;color:#4A524E">${intro}</p>
${body}
${btn ? `<div style="margin:24px 0">${btn}</div>` : ''}
<p style="margin:0;font-size:14px;line-height:1.6;color:#4A524E">Need to change the date? Please tell us at least ${biz.reschedule_notice_days} days before the event. Questions? Just reply to this email${contact}.</p>
<p style="margin:28px 0 0;padding-top:20px;border-top:1px solid #ECEEEA;font-size:12px;line-height:1.5;color:#69716D">Sent by ${esc(config.appName)} on behalf of ${esc(biz.name)}.</p>
</td></tr></table></td></tr></table></body></html>`;
}

const rows = (pairs: [string, string][]) =>
  `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid #ECEEEA;font-size:15px;margin-bottom:20px">${pairs
    .map(([k, v]) => `<tr><td style="padding:12px 0;border-bottom:1px solid #ECEEEA;color:#69716D">${esc(k)}</td><td style="padding:12px 0;border-bottom:1px solid #ECEEEA;text-align:right">${esc(v)}</td></tr>`)
    .join('')}</table>`;

const moneyBox = (pairs: [string, string, boolean?][]) =>
  `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F4F5F2;border-radius:14px;font-size:15px"><tr><td style="padding:16px 20px">${pairs
    .map(([k, v, strong], i) => `<table role="presentation" width="100%"><tr><td style="padding:5px 0;color:#4A524E;${i === pairs.length - 1 ? 'border-top:1px solid #E4E6E1;padding-top:10px' : ''}">${esc(k)}</td><td style="padding:5px 0;text-align:right;font-weight:${strong ? 600 : 400};${i === pairs.length - 1 ? 'border-top:1px solid #E4E6E1;padding-top:10px' : ''}">${esc(v)}</td></tr></table>`)
    .join('')}</td></tr></table>`;

export async function sendEmail(opts: { to: string; subject: string; html: string; replyTo?: string | null; fromName: string }) {
  const from = `${opts.fromName} via ${config.appName} <${config.emailFrom}>`;
  if (!config.resendKey) {
    console.log(`[email:dry-run] to=${opts.to} subject="${opts.subject}"`);
    return { id: 'dry-run', ok: true };
  }
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${config.resendKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to: [opts.to], subject: opts.subject, html: opts.html, reply_to: opts.replyTo || undefined }),
  });
  const j: any = await r.json().catch(() => ({}));
  if (!r.ok) console.error('[email] send failed', r.status, j);
  return { id: j.id ?? null, ok: r.ok };
}

async function enabled(businessId: string, kind: string) {
  const t = await one(`SELECT enabled FROM message_templates WHERE business_id=$1 AND kind=$2 AND channel='email'`, [businessId, kind]);
  return t ? t.enabled : true;
}

/**
 * Send once per (kind, booking, ref). Claims the email_log row first so concurrent
 * runs never double-send, then records the provider result.
 */
async function sendOnce(args: { biz: Business; kind: string; bookingId?: string | null; refId?: string | null; to?: string | null; subject: string; html: string; replyTo?: string | null }) {
  if (!args.to) return false;
  if (!(await enabled(args.biz.id, args.kind))) return false;
  const claim = await q(
    `INSERT INTO email_log (business_id, booking_id, ref_id, kind, "to", status) VALUES ($1,$2,$3,$4,$5,'sending')
     ON CONFLICT DO NOTHING RETURNING id`,
    [args.biz.id, args.bookingId ?? null, args.refId ?? null, args.kind, args.to],
  );
  if (!claim.rows[0]) return false;
  try {
    const r = await sendEmail({ to: args.to, subject: args.subject, html: args.html, replyTo: args.replyTo, fromName: args.biz.name });
    await q(`UPDATE email_log SET status=$2, provider_id=$3, sent_at=now() WHERE id=$1`, [claim.rows[0].id, r.ok ? 'sent' : 'failed', r.id]);
    return r.ok;
  } catch (e) {
    console.error('[email]', e);
    await q(`UPDATE email_log SET status='failed' WHERE id=$1`, [claim.rows[0].id]);
    return false;
  }
}

async function loadBooking(bookingId: string) {
  return one(
    `SELECT bk.*, c.name AS client_name, c.email AS client_email, c.whatsapp AS client_whatsapp,
            s.name AS service_name, COALESCE((SELECT SUM(amount) FROM payments p WHERE p.booking_id = bk.id),0)::int AS paid,
            row_to_json(b.*) AS biz
       FROM bookings bk JOIN clients c ON c.id = bk.client_id JOIN businesses b ON b.id = bk.business_id
       LEFT JOIN services s ON s.id = bk.service_id WHERE bk.id = $1`,
    [bookingId],
  );
}

const when = (bk: any) => {
  const t = fmtTime(bk.start_time);
  if (!t) return fmtDate(bk.date, 'long');
  const end = bk.hours ? endTime(bk.start_time, Number(bk.hours)) : '';
  return `${fmtDate(bk.date, 'long')}, ${t}${end ? ' – ' + end : ''}`;
};
function endTime(start: string, hours: number) {
  const [h, m] = start.split(':').map(Number);
  const mins = (h * 60 + m + Math.round(hours * 60)) % (24 * 60);
  return fmtTime(`${Math.floor(mins / 60)}:${mins % 60}`);
}
const first = (name: string) => name.split(/\s+/)[0];

export const emails = {
  async bookingConfirmed(bookingId: string) {
    const bk = await loadBooking(bookingId);
    if (!bk) return;
    const biz = bk.biz as Business;
    const m = moneySummary(bk.total, bk.advance_pct, bk.paid);
    const lastPay = await one(`SELECT receipt_token, received_on FROM payments WHERE booking_id=$1 ORDER BY created_at DESC LIMIT 1`, [bookingId]);
    const html = layout(
      biz,
      'Your date is confirmed',
      `Hi ${esc(first(bk.client_name))}, thank you for booking ${esc(biz.name)} for your ${esc(bk.function_type)}. We've received your advance and your date is now reserved for you.`,
      rows([
        ['Date and time', when(bk)],
        ...(bk.service_name ? [['Service', `${bk.service_name}${bk.hours ? `, ${bk.hours} hours` : ''}`] as [string, string]] : []),
        ...(bk.venue ? [['Venue', [bk.venue, bk.city].filter(Boolean).join(', ')] as [string, string]] : []),
      ]) +
        moneyBox([
          ['Agreed total', rs(m.total)],
          ['Paid so far', rs(m.paid), true],
          [biz.balance_due === 'event_day' ? 'Balance, due on the event day' : 'Balance, due before the event', rs(m.balance), true],
        ]),
      lastPay ? { href: `${config.publicUrl}/r/${lastPay.receipt_token}`, label: 'View your receipt' } : undefined,
    );
    await sendOnce({ biz, kind: 'booking_confirmed', bookingId, to: bk.client_email, replyTo: biz.email, subject: `Your ${bk.function_type} on ${fmtDate(bk.date)} is confirmed`, html });
  },

  async paymentReceived(paymentId: string) {
    const p = await one(`SELECT * FROM payments WHERE id=$1`, [paymentId]);
    if (!p || p.amount <= 0) return;
    const bk = await loadBooking(p.booking_id);
    if (!bk) return;
    const biz = bk.biz as Business;
    const m = moneySummary(bk.total, bk.advance_pct, bk.paid);
    const html = layout(
      biz,
      `We received ${rs(p.amount)}`,
      `Hi ${esc(first(bk.client_name))}, thank you. This is your receipt for your ${esc(bk.function_type)} on ${esc(fmtDate(bk.date, 'long'))}.`,
      moneyBox([
        ['Receipt', p.receipt_no],
        ['Agreed total', rs(m.total)],
        ['Paid so far', rs(m.paid), true],
        ['Balance', m.balance === 0 ? 'Paid in full' : rs(m.balance), true],
      ]),
      { href: `${config.publicUrl}/r/${p.receipt_token}`, label: 'View your receipt' },
    );
    await sendOnce({ biz, kind: 'payment_received', bookingId: bk.id, refId: p.id, to: bk.client_email, replyTo: biz.email, subject: `Receipt ${p.receipt_no} from ${biz.name}`, html });
  },

  async inquiryReceived(inquiryId: string) {
    const i = await one(`SELECT i.*, row_to_json(b.*) AS biz FROM inquiries i JOIN businesses b ON b.id=i.business_id WHERE i.id=$1`, [inquiryId]);
    if (!i) return;
    const biz = i.biz as Business;
    // to the client
    const html = layout(
      biz,
      'We have your request',
      `Hi ${esc(first(i.client_name))}, thank you for asking ${esc(biz.name)} about your ${esc(i.function_type)} on ${esc(fmtDate(i.date, 'long'))}. We'll reply on WhatsApp soon.`,
      '',
    );
    await sendOnce({ biz, kind: 'inquiry_received', refId: i.id, to: i.email, replyTo: biz.email, subject: `${biz.name} has your request for ${fmtDate(i.date)}`, html });
    // to the vendor
    const vhtml = layout(
      biz,
      `${i.client_name} wants ${fmtDate(i.date, 'long')}`,
      `A new ${esc(i.function_type)} inquiry came in from your booking page.`,
      rows([
        ['WhatsApp', i.whatsapp],
        ...(i.venue ? [['Venue', i.venue] as [string, string]] : []),
        ...(i.message ? [['Message', i.message] as [string, string]] : []),
      ]),
      { href: `${config.publicUrl}/inquiries/${i.id}`, label: 'Reply to the inquiry' },
    );
    await sendOnce({ biz, kind: 'new_inquiry', refId: i.id, to: biz.email, subject: `New inquiry: ${i.client_name}, ${fmtDate(i.date)}`, html: vhtml });
  },

  async eventReminder(bookingId: string) {
    const bk = await loadBooking(bookingId);
    if (!bk) return;
    const biz = bk.biz as Business;
    const m = moneySummary(bk.total, bk.advance_pct, bk.paid);
    const html = layout(
      biz,
      `See you on ${fmtDate(bk.date)}`,
      `Hi ${esc(first(bk.client_name))}, a reminder that ${esc(biz.name)} will be at your ${esc(bk.function_type)}.`,
      rows([['Date and time', when(bk)], ...(bk.venue ? [['Venue', bk.venue] as [string, string]] : [])]) +
        moneyBox([['Agreed total', rs(m.total)], ['Paid so far', rs(m.paid)], ['Balance due', m.balance ? rs(m.balance) : 'Paid in full', true]]),
    );
    await sendOnce({ biz, kind: 'event_reminder', bookingId, to: bk.client_email, replyTo: biz.email, subject: `Reminder: your ${bk.function_type} on ${fmtDate(bk.date)}`, html });
  },

  async thankYou(bookingId: string) {
    const bk = await loadBooking(bookingId);
    if (!bk) return;
    const biz = bk.biz as Business;
    const html = layout(biz, 'Thank you', `Hi ${esc(first(bk.client_name))}, thank you for having ${esc(biz.name)} at your ${esc(bk.function_type)}. We'd love to hear how it went, just reply to this email.`, '');
    await sendOnce({ biz, kind: 'thank_you', bookingId, to: bk.client_email, replyTo: biz.email, subject: `Thank you from ${biz.name}`, html });
  },

  async advanceMissing(bookingId: string) {
    const bk = await loadBooking(bookingId);
    if (!bk) return;
    const biz = bk.biz as Business;
    const m = moneySummary(bk.total, bk.advance_pct, bk.paid);
    const html = layout(
      biz,
      'Advance still missing',
      `${esc(bk.client_name)}'s ${esc(bk.function_type)} on ${esc(fmtDate(bk.date, 'long'))} is still an inquiry with no advance.`,
      moneyBox([['Advance to confirm', rs(m.advanceDue), true]]),
      { href: `${config.publicUrl}/bookings/${bk.id}`, label: 'Open booking' },
    );
    await sendOnce({ biz, kind: 'advance_missing', bookingId, to: biz.email, subject: `No advance yet: ${bk.client_name}, ${fmtDate(bk.date)}`, html });
  },

  async tomorrowGlance(businessId: string, date: string) {
    const biz = (await one(`SELECT * FROM businesses WHERE id=$1`, [businessId])) as Business | undefined;
    if (!biz) return;
    const list = (
      await q(
        `SELECT bk.*, c.name AS client_name, s.name AS service_name, COALESCE((SELECT SUM(amount) FROM payments p WHERE p.booking_id = bk.id),0)::int AS paid
         FROM bookings bk JOIN clients c ON c.id=bk.client_id LEFT JOIN services s ON s.id=bk.service_id
         WHERE bk.business_id=$1 AND bk.date=$2 AND bk.status <> 'cancelled' ORDER BY bk.start_time NULLS LAST`,
        [businessId, date],
      )
    ).rows;
    if (!list.length) return;
    const body = rows(
      list.map((b) => [
        `${fmtTime(b.start_time) || 'Time not set'} · ${b.function_type}`,
        `${b.client_name}${b.venue ? ', ' + b.venue : ''} · ${moneySummary(b.total, b.advance_pct, b.paid).balance ? rs(moneySummary(b.total, b.advance_pct, b.paid).balance) + ' due' : 'paid'}`,
      ]),
    );
    const html = layout(biz, `Tomorrow: ${list.length} event${list.length > 1 ? 's' : ''}`, `Here's ${esc(fmtDate(date, 'long'))} at a glance.`, body, { href: `${config.publicUrl}/today`, label: 'Open Today' });
    // ref_id ties the daily summary to the first booking so it is sent once per date
    await sendOnce({ biz, kind: 'tomorrow_glance', bookingId: list[0].id, to: biz.email, subject: `Tomorrow at a glance: ${list.length} event${list.length > 1 ? 's' : ''}`, html });
  },

  async passwordReset(to: string, name: string, link: string) {
    const biz = { id: '', name: config.appName, reschedule_notice_days: 7, balance_due: 'event_day' } as Business;
    const html = layout(biz, 'Reset your password', `Hi ${esc(first(name))}, use the button below to choose a new password. The link works for one hour.`, '', { href: link, label: 'Choose a new password' }).replace(/<p style="margin:0;font-size:14px;line-height:1.6;color:#4A524E">Need to change[\s\S]*?<\/p>/, '');
    await sendEmail({ to, subject: `Reset your ${config.appName} password`, html, fromName: config.appName });
  },

  async invite(to: string, name: string, bizName: string, link: string) {
    const biz = { id: '', name: bizName, reschedule_notice_days: 7, balance_due: 'event_day' } as Business;
    const html = layout(biz, `Join ${bizName}`, `Hi ${esc(first(name))}, you've been added to ${esc(bizName)} on ${esc(config.appName)}. Set a password to see the events you're on.`, '', { href: link, label: 'Accept the invite' }).replace(/<p style="margin:0;font-size:14px;line-height:1.6;color:#4A524E">Need to change[\s\S]*?<\/p>/, '');
    await sendEmail({ to, subject: `You've been added to ${bizName}`, html, fromName: bizName });
  },
};

/** Fire-and-forget wrapper so a failed email never fails the API request */
export const later = (p: Promise<unknown>) => void p.catch((e) => console.error('[email]', e));
