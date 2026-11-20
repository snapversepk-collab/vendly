import { Router } from 'express';
import { z } from 'zod';
import { allow } from '../auth.js';
import { config } from '../config.js';
import { one, q, tx } from '../db/index.js';
import { emails } from '../lib/email.js';
import { TRADES, tradeByKey } from '../lib/templates.js';
import { HttpError, RESERVED_HANDLES, ah, bad, forbidden, handleOk, notFound, token } from '../lib/util.js';
import { bookingsThisMonth } from '../lib/bookings.js';
import { normPhone } from './auth.js';

export const businessRouter = Router();

businessRouter.get('/trades', (_req, res) => {
  res.json(TRADES.map((t) => ({ key: t.key, name: t.name, blurb: t.blurb, services: t.services, checklist: t.checklist })));
});

businessRouter.get(
  '/business',
  ah(async (req, res) => {
    const b = await one(`SELECT * FROM businesses WHERE id=$1`, [req.ctx.businessId]);
    const used = await bookingsThisMonth(req.ctx.businessId);
    res.json({
      id: b!.id, name: b!.name, handle: b!.handle, whatsapp: b!.whatsapp, email: b!.email, cities: b!.cities, trades: b!.trades,
      capacityPerDate: b!.capacity_per_date, advancePct: b!.advance_pct, balanceDue: b!.balance_due,
      rescheduleNoticeDays: b!.reschedule_notice_days, paymentMethods: b!.payment_methods, plan: b!.plan, logo: b!.logo,
      setupDone: b!.setup_done,
      usage: { bookingsThisMonth: used, freeLimit: config.freeBookingsPerMonth },
      plans: config.plans,
    });
  }),
);

const bizPatch = z.object({
  name: z.string().trim().min(1).optional(),
  whatsapp: z.string().optional(),
  email: z.string().email().optional(),
  cities: z.array(z.string().trim().min(1)).optional(),
  trades: z.array(z.string()).optional(),
  capacityPerDate: z.number().int().min(1).max(50).optional(),
  advancePct: z.number().int().min(0).max(100).optional(),
  balanceDue: z.enum(['event_day', 'before_event']).optional(),
  rescheduleNoticeDays: z.number().int().min(0).max(365).optional(),
  paymentMethods: z.array(z.string()).optional(),
  logo: z.string().max(200_000).nullable().optional(),
  setupDone: z.record(z.string(), z.boolean()).optional(),
});

businessRouter.patch(
  '/business',
  ah(async (req, res) => {
    const b = bizPatch.parse(req.body);
    // Manager may change capacity only; everything else is owner-only (plan, billing, team, policy)
    const keys = Object.keys(b);
    if (req.ctx.role === 'staff') throw forbidden();
    if (req.ctx.role === 'manager' && keys.some((k) => k !== 'capacityPerDate')) throw forbidden('Only the owner can change business settings');
    const map: Record<string, [string, unknown]> = {
      name: ['name', b.name], whatsapp: ['whatsapp', b.whatsapp !== undefined ? normPhone(b.whatsapp) : undefined], email: ['email', b.email],
      cities: ['cities', b.cities], trades: ['trades', b.trades], capacityPerDate: ['capacity_per_date', b.capacityPerDate],
      advancePct: ['advance_pct', b.advancePct], balanceDue: ['balance_due', b.balanceDue], rescheduleNoticeDays: ['reschedule_notice_days', b.rescheduleNoticeDays],
      paymentMethods: ['payment_methods', b.paymentMethods], logo: ['logo', b.logo],
    };
    const sets: string[] = [];
    const vals: unknown[] = [req.ctx.businessId];
    for (const k of keys) {
      if (k === 'setupDone' || !map[k]) continue;
      vals.push(map[k][1]);
      sets.push(`${map[k][0]}=$${vals.length}`);
    }
    if (b.setupDone) {
      vals.push(JSON.stringify(b.setupDone));
      sets.push(`setup_done = setup_done || $${vals.length}::jsonb`);
    }
    if (sets.length) await q(`UPDATE businesses SET ${sets.join(', ')} WHERE id=$1`, vals);
    res.json({ ok: true });
  }),
);

/** Setup step 1: trades, cities, capacity. Seeds services + checklist templates for new trades. */
businessRouter.post(
  '/setup/trades',
  allow('owner'),
  ah(async (req, res) => {
    const body = z.object({ trades: z.array(z.string()).min(1, 'Pick at least one trade'), cities: z.array(z.string()).default([]), capacityPerDate: z.number().int().min(1).max(50).default(1) }).parse(req.body);
    const id = req.ctx.businessId;
    await tx(async (db) => {
      await db.query(`UPDATE businesses SET trades=$2, cities=$3, capacity_per_date=$4, setup_done = setup_done || '{"trades":true}'::jsonb WHERE id=$1`, [id, body.trades, body.cities, body.capacityPerDate]);
      for (const key of body.trades) {
        const t = tradeByKey(key);
        if (!t) continue;
        const has = (await db.query(`SELECT 1 FROM services WHERE business_id=$1 AND trade=$2 LIMIT 1`, [id, key])).rows[0];
        if (!has) {
          let i = (await db.query(`SELECT COALESCE(MAX(sort),0)::int AS m FROM services WHERE business_id=$1`, [id])).rows[0].m;
          for (const s of t.services) {
            await db.query(`INSERT INTO services (business_id, name, trade, hours, price, includes, sort) VALUES ($1,$2,$3,$4,$5,$6,$7)`, [id, s.name, key, s.hours, s.price, s.includes, ++i]);
          }
        }
        await db.query(`INSERT INTO checklist_templates (business_id, trade, items) VALUES ($1,$2,$3) ON CONFLICT (business_id, trade) DO NOTHING`, [id, key, JSON.stringify(t.checklist)]);
      }
    });
    res.json({ ok: true });
  }),
);

businessRouter.get(
  '/handle-available',
  ah(async (req, res) => {
    const h = String(req.query.handle ?? '').toLowerCase();
    if (!handleOk(h)) return res.json({ available: false, reason: 'Use 3 to 40 letters, numbers or dashes' });
    if (RESERVED_HANDLES.has(h)) return res.json({ available: false, reason: 'That name is reserved' });
    const taken = await one(`SELECT id FROM businesses WHERE handle=$1 AND id <> $2`, [h, req.ctx.businessId]);
    res.json({ available: !taken, reason: taken ? 'That link is taken' : null });
  }),
);

businessRouter.put(
  '/business/handle',
  allow('owner'),
  ah(async (req, res) => {
    const h = z.object({ handle: z.string().trim().toLowerCase() }).parse(req.body).handle;
    if (!handleOk(h)) throw bad('Use 3 to 40 letters, numbers or dashes', 'invalid_handle');
    if (RESERVED_HANDLES.has(h)) throw bad('That name is reserved', 'handle_taken');
    const taken = await one(`SELECT id FROM businesses WHERE handle=$1 AND id <> $2`, [h, req.ctx.businessId]);
    if (taken) throw new HttpError(409, 'That link is taken', 'handle_taken');
    await q(`UPDATE businesses SET handle=$2, setup_done = setup_done || '{"page":true}'::jsonb WHERE id=$1`, [req.ctx.businessId, h]);
    res.json({ handle: h });
  }),
);

// ---- Services ----
const svc = z.object({
  name: z.string().trim().min(1),
  trade: z.string().nullable().optional(),
  hours: z.number().min(0).max(48).nullable().optional(),
  price: z.number().int().min(0).nullable().optional(),
  includes: z.string().nullable().optional(),
  active: z.boolean().optional(),
  sort: z.number().int().optional(),
});
const svcOut = (s: any) => ({ id: s.id, name: s.name, trade: s.trade, hours: s.hours, price: s.price, includes: s.includes, active: s.active, sort: s.sort });

businessRouter.get(
  '/services',
  ah(async (req, res) => {
    const rows = (await q(`SELECT * FROM services WHERE business_id=$1 ORDER BY sort, name`, [req.ctx.businessId])).rows;
    res.json(rows.map(svcOut));
  }),
);
businessRouter.post(
  '/services',
  allow('owner', 'manager'),
  ah(async (req, res) => {
    const s = svc.parse(req.body);
    const r = await one(
      `INSERT INTO services (business_id, name, trade, hours, price, includes, active, sort)
       VALUES ($1,$2,$3,$4,$5,$6,COALESCE($7,true),COALESCE($8,(SELECT COALESCE(MAX(sort),0)+1 FROM services WHERE business_id=$1))) RETURNING *`,
      [req.ctx.businessId, s.name, s.trade ?? null, s.hours ?? null, s.price ?? null, s.includes ?? null, s.active ?? null, s.sort ?? null],
    );
    res.status(201).json(svcOut(r));
  }),
);
businessRouter.patch(
  '/services/:id',
  allow('owner', 'manager'),
  ah(async (req, res) => {
    const s = svc.partial().parse(req.body);
    const cur = await one(`SELECT * FROM services WHERE id=$1 AND business_id=$2`, [req.params.id, req.ctx.businessId]);
    if (!cur) throw notFound();
    const n = { ...cur, ...Object.fromEntries(Object.entries(s).filter(([, v]) => v !== undefined)) };
    const r = await one(`UPDATE services SET name=$3, trade=$4, hours=$5, price=$6, includes=$7, active=$8, sort=$9 WHERE id=$1 AND business_id=$2 RETURNING *`, [
      req.params.id, req.ctx.businessId, n.name, n.trade, n.hours, n.price, n.includes, n.active, n.sort,
    ]);
    if (n.price !== null && n.price !== undefined) await q(`UPDATE businesses SET setup_done = setup_done || '{"services":true}'::jsonb WHERE id=$1`, [req.ctx.businessId]);
    res.json(svcOut(r));
  }),
);
businessRouter.delete(
  '/services/:id',
  allow('owner', 'manager'),
  ah(async (req, res) => {
    await q(`DELETE FROM services WHERE id=$1 AND business_id=$2`, [req.params.id, req.ctx.businessId]);
    res.json({ ok: true });
  }),
);

// ---- Checklist templates ----
businessRouter.get(
  '/checklist-templates',
  ah(async (req, res) => {
    const rows = (await q(`SELECT trade, items FROM checklist_templates WHERE business_id=$1 ORDER BY trade`, [req.ctx.businessId])).rows;
    res.json(rows);
  }),
);
businessRouter.put(
  '/checklist-templates/:trade',
  allow('owner', 'manager'),
  ah(async (req, res) => {
    const items = z.array(z.object({ label: z.string().min(1), phase: z.string().default('Before'), auto: z.enum(['advance', 'balance']).nullable().optional() })).parse(req.body.items);
    await q(`INSERT INTO checklist_templates (business_id, trade, items) VALUES ($1,$2,$3) ON CONFLICT (business_id, trade) DO UPDATE SET items=EXCLUDED.items`, [
      req.ctx.businessId, req.params.trade, JSON.stringify(items),
    ]);
    res.json({ ok: true });
  }),
);

// ---- Message templates (WhatsApp texts + automatic email switches) ----
businessRouter.get(
  '/message-templates',
  allow('owner', 'manager'),
  ah(async (req, res) => {
    const rows = (await q(`SELECT id, kind, channel, name, text, enabled, timing FROM message_templates WHERE business_id=$1 ORDER BY channel DESC, name`, [req.ctx.businessId])).rows;
    res.json(rows);
  }),
);
businessRouter.patch(
  '/message-templates/:id',
  allow('owner', 'manager'),
  ah(async (req, res) => {
    const b = z.object({ text: z.string().min(1).max(2000).optional(), enabled: z.boolean().optional() }).parse(req.body);
    const r = await one(`UPDATE message_templates SET text=COALESCE($3,text), enabled=COALESCE($4,enabled) WHERE id=$1 AND business_id=$2 RETURNING id, kind, channel, name, text, enabled, timing`, [
      req.params.id, req.ctx.businessId, b.text ?? null, b.enabled ?? null,
    ]);
    if (!r) throw notFound();
    res.json(r);
  }),
);

// ---- Team ----
businessRouter.get(
  '/team',
  ah(async (req, res) => {
    const rows = (
      await q(
        `SELECT m.id, m.role, u.id AS user_id, u.name, u.email, u.phone, (u.invite_token IS NOT NULL) AS pending
           FROM memberships m JOIN users u ON u.id=m.user_id WHERE m.business_id=$1 ORDER BY m.created_at`,
        [req.ctx.businessId],
      )
    ).rows;
    res.json(rows.map((r) => ({ id: r.id, userId: r.user_id, role: r.role, name: r.name, email: r.email, phone: r.phone, pending: r.pending })));
  }),
);

businessRouter.post(
  '/team/invite',
  allow('owner'),
  ah(async (req, res) => {
    const b = z.object({ name: z.string().trim().min(1), email: z.string().trim().toLowerCase().email(), phone: z.string().optional(), role: z.enum(['manager', 'staff']) }).parse(req.body);
    const biz = await one(`SELECT name, plan FROM businesses WHERE id=$1`, [req.ctx.businessId]);
    if (biz!.plan !== 'team') {
      const n = await one(`SELECT COUNT(*)::int AS n FROM memberships WHERE business_id=$1`, [req.ctx.businessId]);
      if (n!.n >= 2) throw new HttpError(402, 'Your plan includes one teammate. Upgrade to Team for more.', 'plan_limit');
    }
    const existing = await one(`SELECT u.id, (SELECT business_id FROM memberships WHERE user_id=u.id LIMIT 1) AS biz FROM users u WHERE email=$1`, [b.email]);
    if (existing?.biz) throw new HttpError(409, 'This person already belongs to a business', 'duplicate');
    const t = token();
    const userId = await tx(async (db) => {
      const u = existing
        ? existing
        : (await db.query(`INSERT INTO users (name, email, phone, invite_token) VALUES ($1,$2,$3,$4) RETURNING id`, [b.name, b.email, normPhone(b.phone), t])).rows[0];
      if (existing) await db.query(`UPDATE users SET invite_token=$2 WHERE id=$1 AND password_hash IS NULL`, [u.id, t]);
      await db.query(`INSERT INTO memberships (user_id, business_id, role) VALUES ($1,$2,$3)`, [u.id, req.ctx.businessId, b.role]);
      await db.query(`UPDATE businesses SET setup_done = setup_done || '{"team":true}'::jsonb WHERE id=$1`, [req.ctx.businessId]);
      return u.id;
    });
    const link = `${config.publicUrl}/invite/${t}`;
    emails.invite(b.email, b.name, biz!.name, link).catch((e) => console.error(e));
    res.status(201).json({ userId, inviteLink: link });
  }),
);

businessRouter.patch(
  '/team/:id',
  allow('owner'),
  ah(async (req, res) => {
    const { role } = z.object({ role: z.enum(['owner', 'manager', 'staff']) }).parse(req.body);
    const m = await one(`SELECT user_id, role FROM memberships WHERE id=$1 AND business_id=$2`, [req.params.id, req.ctx.businessId]);
    if (!m) throw notFound();
    if (m.user_id === req.ctx.userId && role !== 'owner') throw bad('You cannot change your own role');
    await q(`UPDATE memberships SET role=$3 WHERE id=$1 AND business_id=$2`, [req.params.id, req.ctx.businessId, role]);
    res.json({ ok: true });
  }),
);

businessRouter.delete(
  '/team/:id',
  allow('owner'),
  ah(async (req, res) => {
    const m = await one(`SELECT user_id FROM memberships WHERE id=$1 AND business_id=$2`, [req.params.id, req.ctx.businessId]);
    if (!m) throw notFound();
    if (m.user_id === req.ctx.userId) throw bad('You cannot remove yourself');
    await q(`DELETE FROM memberships WHERE id=$1 AND business_id=$2`, [req.params.id, req.ctx.businessId]);
    res.json({ ok: true });
  }),
);
