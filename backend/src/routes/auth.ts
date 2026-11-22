import bcrypt from 'bcryptjs';
import { Router } from 'express';
import { OAuth2Client } from 'google-auth-library';
import { z } from 'zod';
import { requireUser, signToken } from '../auth.js';
import { config } from '../config.js';
import { one, q, tx, type Queryable } from '../db/index.js';
import { emails } from '../lib/email.js';
import { MESSAGE_TEMPLATES } from '../lib/templates.js';
import { isPlatformAdmin } from './admin.js';
import { HttpError, ah, bad, token } from '../lib/util.js';

export const authRouter = Router();

const email = z.string().trim().toLowerCase().email('Enter a valid email');
const password = z
  .string()
  .min(8, 'Use at least 8 characters')
  .refine((p) => /[A-Za-z]/.test(p) && /\d/.test(p), 'Mix letters and numbers');

/** Normalise to 03XX XXXXXXX style storage: digits only, local form */
export function normPhone(p?: string | null) {
  if (!p) return null;
  let d = p.replace(/\D/g, '');
  if (d.startsWith('0092')) d = d.slice(4);
  else if (d.startsWith('92') && d.length === 12) d = d.slice(2);
  if (d.length === 10 && d.startsWith('3')) d = '0' + d;
  return d;
}

export async function createBusiness(db: Queryable, userId: string, name: string, whatsapp: string | null, bizEmail: string) {
  const b = (
    await db.query(`INSERT INTO businesses (name, whatsapp, email, receipt_prefix) VALUES ($1,$2,$3,$4) RETURNING id`, [
      name, whatsapp, bizEmail,
      (name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('') || 'RC').toUpperCase().replace(/[^A-Z]/g, '') || 'RC',
    ])
  ).rows[0];
  await db.query(`INSERT INTO memberships (user_id, business_id, role) VALUES ($1,$2,'owner')`, [userId, b.id]);
  for (const t of MESSAGE_TEMPLATES) {
    await db.query(`INSERT INTO message_templates (business_id, kind, channel, name, text, enabled, timing) VALUES ($1,$2,$3,$4,$5,$6,$7)`, [
      b.id, t.kind, t.channel, t.name, t.text, t.enabled, t.timing,
    ]);
  }
  return b.id as string;
}

authRouter.post(
  '/signup',
  ah(async (req, res) => {
    const body = z
      .object({ name: z.string().trim().min(1, 'Enter your name'), businessName: z.string().trim().min(1, 'Enter your business name'), whatsapp: z.string().trim().min(10, 'Enter your WhatsApp number'), email, password })
      .parse(req.body);
    const exists = await one(`SELECT id FROM users WHERE email=$1`, [body.email]);
    if (exists) throw new HttpError(409, 'An account with this email already exists. Sign in instead?', 'email_taken');
    const hash = await bcrypt.hash(body.password, 10);
    const userId = await tx(async (db) => {
      const u = (await db.query(`INSERT INTO users (name, email, phone, password_hash) VALUES ($1,$2,$3,$4) RETURNING id`, [body.name, body.email, normPhone(body.whatsapp), hash])).rows[0];
      await createBusiness(db, u.id, body.businessName, normPhone(body.whatsapp), body.email);
      return u.id as string;
    });
    res.status(201).json({ token: signToken(userId) });
  }),
);

authRouter.post(
  '/signin',
  ah(async (req, res) => {
    const body = z.object({ email, password: z.string().min(1) }).parse(req.body);
    const u = await one(`SELECT id, password_hash FROM users WHERE email=$1`, [body.email]);
    if (!u?.password_hash || !(await bcrypt.compare(body.password, u.password_hash))) {
      throw new HttpError(401, 'That email and password don\'t match', 'wrong_password');
    }
    res.json({ token: signToken(u.id) });
  }),
);

const google = config.googleClientId ? new OAuth2Client(config.googleClientId) : null;

/** Google sign-in: frontend sends the ID token (credential) from Google Identity Services */
authRouter.post(
  '/google',
  ah(async (req, res) => {
    if (!google) throw bad('Google sign-in is not set up on this server');
    const body = z.object({ credential: z.string(), businessName: z.string().trim().optional(), whatsapp: z.string().optional() }).parse(req.body);
    const ticket = await google.verifyIdToken({ idToken: body.credential, audience: config.googleClientId }).catch(() => null);
    const p = ticket?.getPayload();
    if (!p?.email || !p.email_verified) throw new HttpError(401, 'Google could not confirm your email');
    const mail = p.email.toLowerCase();
    let u = await one(`SELECT id FROM users WHERE google_sub=$1 OR email=$2`, [p.sub, mail]);
    let created = false;
    if (u) {
      await q(`UPDATE users SET google_sub=$2 WHERE id=$1 AND google_sub IS NULL`, [u.id, p.sub]);
    } else {
      created = true;
      u = await tx(async (db) => {
        const nu = (await db.query(`INSERT INTO users (name, email, google_sub) VALUES ($1,$2,$3) RETURNING id`, [p.name ?? mail.split('@')[0], mail, p.sub])).rows[0];
        await createBusiness(db, nu.id, body.businessName || `${p.given_name ?? p.name ?? 'My'}'s studio`, normPhone(body.whatsapp), mail);
        return nu;
      });
    }
    res.json({ token: signToken(u!.id), created });
  }),
);

authRouter.get(
  '/me',
  requireUser,
  ah(async (req, res) => {
    const u = await one(`SELECT id, name, email, phone, appearance FROM users WHERE id=$1`, [req.userId]);
    if (!u) throw new HttpError(401, 'Please sign in');
    const m = await one(
      `SELECT m.role, b.* FROM memberships m JOIN businesses b ON b.id=m.business_id WHERE m.user_id=$1 ORDER BY m.created_at LIMIT 1`,
      [req.userId],
    );
    const hasBookings = m ? !!(await one(`SELECT 1 FROM bookings WHERE business_id=$1 LIMIT 1`, [m.id])) : false;
    res.json({
      user: u,
      isPlatformAdmin: await isPlatformAdmin(u.id),
      role: m?.role ?? null,
      business: m
        ? {
            id: m.id, name: m.name, handle: m.handle, whatsapp: m.whatsapp, email: m.email, cities: m.cities, trades: m.trades,
            capacityPerDate: m.capacity_per_date, advancePct: m.advance_pct, balanceDue: m.balance_due,
            rescheduleNoticeDays: m.reschedule_notice_days, paymentMethods: m.payment_methods, plan: m.plan, logo: m.logo,
            setupDone: m.setup_done, hasBookings,
          }
        : null,
    });
  }),
);

authRouter.patch(
  '/me',
  requireUser,
  ah(async (req, res) => {
    const body = z.object({ name: z.string().trim().min(1).optional(), phone: z.string().optional(), appearance: z.enum(['light', 'dark', 'system']).optional() }).parse(req.body);
    await q(`UPDATE users SET name=COALESCE($2,name), phone=COALESCE($3,phone), appearance=COALESCE($4,appearance) WHERE id=$1`, [
      req.userId, body.name ?? null, body.phone ? normPhone(body.phone) : null, body.appearance ?? null,
    ]);
    res.json({ ok: true });
  }),
);

authRouter.post(
  '/forgot',
  ah(async (req, res) => {
    const body = z.object({ email }).parse(req.body);
    const u = await one(`SELECT id, name FROM users WHERE email=$1`, [body.email]);
    if (u) {
      const t = token();
      await q(`UPDATE users SET reset_token=$2, reset_expires=now() + interval '1 hour' WHERE id=$1`, [u.id, t]);
      await emails.passwordReset(body.email, u.name, `${config.publicUrl}/reset-password?token=${t}`).catch((e) => console.error(e));
    }
    // Same answer whether or not the account exists
    res.json({ ok: true });
  }),
);

authRouter.post(
  '/reset',
  ah(async (req, res) => {
    const body = z.object({ token: z.string().min(20), password }).parse(req.body);
    const u = await one(`SELECT id FROM users WHERE reset_token=$1 AND reset_expires > now()`, [body.token]);
    if (!u) throw bad('This link has expired. Ask for a new one.', 'expired');
    await q(`UPDATE users SET password_hash=$2, reset_token=NULL, reset_expires=NULL WHERE id=$1`, [u.id, await bcrypt.hash(body.password, 10)]);
    res.json({ token: signToken(u.id) });
  }),
);

/** Team invite acceptance: set a password on the invited account */
authRouter.get(
  '/invite/:token',
  ah(async (req, res) => {
    const u = await one(
      `SELECT u.name, u.email, b.name AS business_name, m.role FROM users u JOIN memberships m ON m.user_id=u.id JOIN businesses b ON b.id=m.business_id WHERE u.invite_token=$1`,
      [req.params.token],
    );
    if (!u) throw new HttpError(404, 'This invite has already been used or does not exist');
    res.json(u);
  }),
);
authRouter.post(
  '/invite/:token',
  ah(async (req, res) => {
    const body = z.object({ name: z.string().trim().min(1).optional(), password }).parse(req.body);
    const u = await one(`SELECT id FROM users WHERE invite_token=$1`, [req.params.token]);
    if (!u) throw new HttpError(404, 'This invite has already been used or does not exist');
    await q(`UPDATE users SET password_hash=$2, invite_token=NULL, name=COALESCE($3,name) WHERE id=$1`, [u.id, await bcrypt.hash(body.password, 10), body.name ?? null]);
    res.json({ token: signToken(u.id) });
  }),
);
