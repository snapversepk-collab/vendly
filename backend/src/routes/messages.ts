import { Router } from 'express';
import { z } from 'zod';
import { allow } from '../auth.js';
import { config } from '../config.js';
import { one } from '../db/index.js';
import { quoteTotal } from '../lib/bookings.js';
import { fmtDate } from '../lib/dates.js';
import { moneySummary, rs } from '../lib/money.js';
import { ah, fillTemplate, notFound, waLink, waNumber } from '../lib/util.js';

export const messagesRouter = Router();

/**
 * Build a WhatsApp click-to-chat link for a booking. Nothing is sent: the vendor's
 * own WhatsApp opens with the text filled in.
 */
messagesRouter.post(
  '/bookings/:id/whatsapp',
  allow('owner', 'manager'),
  ah(async (req, res) => {
    const { kind, paymentId } = z.object({ kind: z.enum(['advance_reminder', 'quote', 'receipt', 'thanks', 'plain']), paymentId: z.string().uuid().optional() }).parse(req.body);
    const bk = await one(
      `SELECT bk.*, c.name AS client_name, c.whatsapp, b.handle,
              COALESCE((SELECT SUM(amount) FROM payments p WHERE p.booking_id=bk.id),0)::int AS paid
         FROM bookings bk JOIN clients c ON c.id=bk.client_id JOIN businesses b ON b.id=bk.business_id
        WHERE bk.id=$1 AND bk.business_id=$2`,
      [req.params.id, req.ctx.businessId],
    );
    if (!bk) throw notFound();
    const m = moneySummary(bk.total, bk.advance_pct, bk.paid);
    const qt = await one(`SELECT token, lines, advance_pct FROM quotes WHERE booking_id=$1 ORDER BY created_at DESC LIMIT 1`, [bk.id]);
    const pay = paymentId
      ? await one(`SELECT amount, receipt_token FROM payments WHERE id=$1 AND booking_id=$2`, [paymentId, bk.id])
      : await one(`SELECT amount, receipt_token FROM payments WHERE booking_id=$1 ORDER BY created_at DESC LIMIT 1`, [bk.id]);
    const qTotal = qt ? quoteTotal(qt.lines) : bk.total;
    const vars: Record<string, string> = {
      client: bk.client_name.split(' ')[0],
      function: bk.function_type,
      date: fmtDate(bk.date),
      amount: kind === 'receipt' && pay ? rs(pay.amount) : kind === 'quote' ? rs(qTotal) : rs(m.balance),
      advance: rs(kind === 'quote' && qt ? Math.round((qTotal * qt.advance_pct) / 100) : m.advanceDue),
      'quote link': qt ? `${config.publicUrl}/q/${qt.token}` : '',
      'receipt link': pay ? `${config.publicUrl}/r/${pay.receipt_token}` : '',
      'review link': bk.handle ? `${config.publicUrl}/b/${bk.handle}` : '',
    };
    let text = '';
    if (kind !== 'plain') {
      const t = await one(`SELECT text FROM message_templates WHERE business_id=$1 AND kind=$2 AND channel='whatsapp'`, [req.ctx.businessId, kind]);
      text = fillTemplate(t?.text ?? '', vars);
    }
    res.json({ text, url: waLink(bk.whatsapp, text), number: bk.whatsapp, waNumber: waNumber(bk.whatsapp) });
  }),
);
