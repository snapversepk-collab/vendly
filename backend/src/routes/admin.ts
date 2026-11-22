import { Router, type NextFunction, type Request, type Response } from 'express';
import { z } from 'zod';
import { requireUser } from '../auth.js';
import { config } from '../config.js';
import { one, q } from '../db/index.js';
import { todayPk } from '../lib/dates.js';
import { HttpError, ah, notFound } from '../lib/util.js';

/**
 * Platform admin: the people running Vendly (not vendors). Access is by email,
 * listed in PLATFORM_ADMIN_EMAILS. Admins see every business and can change plans.
 */
export const adminRouter = Router();

export async function isPlatformAdmin(userId: string) {
  if (!config.platformAdminEmails.length) return false;
  const u = await one(`SELECT email FROM users WHERE id=$1`, [userId]);
  return !!u && config.platformAdminEmails.includes(String(u.email).toLowerCase());
}

async function requireAdmin(req: Request, _res: Response, next: NextFunction) {
  try {
    if (!(await isPlatformAdmin(req.userId!))) throw new HttpError(403, 'Admins only');
    next();
  } catch (e) {
    next(e);
  }
}

adminRouter.use(requireUser, requireAdmin);

adminRouter.get(
  '/overview',
  ah(async (_req, res) => {
    const ym = todayPk().slice(0, 7);
    const r = await one(
      `SELECT
         (SELECT COUNT(*) FROM businesses)::int AS businesses,
         (SELECT COUNT(*) FROM users WHERE invite_token IS NULL)::int AS users,
         (SELECT COUNT(*) FROM bookings)::int AS bookings,
         (SELECT COUNT(*) FROM bookings WHERE to_char(created_at AT TIME ZONE 'Asia/Karachi','YYYY-MM') = $1)::int AS bookings_this_month,
         (SELECT COUNT(*) FROM inquiries)::int AS inquiries,
         (SELECT COUNT(*) FROM businesses WHERE created_at > now() - interval '7 days')::int AS signups_7d,
         (SELECT COUNT(*) FROM businesses WHERE created_at > now() - interval '30 days')::int AS signups_30d,
         (SELECT COALESCE(SUM(amount),0) FROM payments)::bigint AS payments_recorded`,
      [ym],
    );
    const plans = (await q(`SELECT plan, COUNT(*)::int AS n FROM businesses GROUP BY plan`)).rows;
    res.json({
      businesses: r!.businesses,
      users: r!.users,
      bookings: r!.bookings,
      bookingsThisMonth: r!.bookings_this_month,
      inquiries: r!.inquiries,
      signups7d: r!.signups_7d,
      signups30d: r!.signups_30d,
      paymentsRecorded: Number(r!.payments_recorded),
      plans: Object.fromEntries(plans.map((p) => [p.plan, p.n])),
      freeLimit: config.freeBookingsPerMonth,
    });
  }),
);

adminRouter.get(
  '/businesses',
  ah(async (req, res) => {
    const f = z.object({ q: z.string().optional(), plan: z.enum(['free', 'pro', 'team']).optional() }).parse(req.query);
    const ym = todayPk().slice(0, 7);
    const vals: unknown[] = [ym];
    let where = 'WHERE 1=1';
    if (f.plan) { vals.push(f.plan); where += ` AND b.plan = $${vals.length}`; }
    if (f.q?.trim()) {
      vals.push(`%${f.q.trim().toLowerCase()}%`);
      const n = vals.length;
      where += ` AND (lower(b.name) LIKE $${n} OR lower(COALESCE(b.handle,'')) LIKE $${n} OR lower(COALESCE(o.email,'')) LIKE $${n} OR lower(COALESCE(o.name,'')) LIKE $${n} OR COALESCE(b.whatsapp,'') LIKE $${n})`;
    }
    const rows = (
      await q(
        `SELECT b.id, b.name, b.handle, b.plan, b.whatsapp, b.cities, b.trades, b.created_at,
                o.name AS owner_name, o.email AS owner_email,
                (SELECT COUNT(*) FROM memberships m WHERE m.business_id = b.id)::int AS members,
                (SELECT COUNT(*) FROM bookings bk WHERE bk.business_id = b.id)::int AS bookings,
                (SELECT COUNT(*) FROM bookings bk WHERE bk.business_id = b.id AND to_char(bk.created_at AT TIME ZONE 'Asia/Karachi','YYYY-MM') = $1)::int AS bookings_this_month,
                (SELECT COUNT(*) FROM inquiries i WHERE i.business_id = b.id)::int AS inquiries,
                GREATEST(b.created_at,
                         (SELECT MAX(updated_at) FROM bookings bk WHERE bk.business_id = b.id),
                         (SELECT MAX(created_at) FROM payments p WHERE p.business_id = b.id)) AS last_active
           FROM businesses b
           LEFT JOIN LATERAL (
             SELECT u.name, u.email FROM memberships m JOIN users u ON u.id = m.user_id
              WHERE m.business_id = b.id AND m.role = 'owner' ORDER BY m.created_at LIMIT 1
           ) o ON true
           ${where}
          ORDER BY b.created_at DESC
          LIMIT 500`,
        vals,
      )
    ).rows;
    res.json(
      rows.map((r) => ({
        id: r.id, name: r.name, handle: r.handle, plan: r.plan, whatsapp: r.whatsapp, cities: r.cities, trades: r.trades,
        createdAt: r.created_at, ownerName: r.owner_name, ownerEmail: r.owner_email, members: r.members,
        bookings: r.bookings, bookingsThisMonth: r.bookings_this_month, inquiries: r.inquiries, lastActive: r.last_active,
      })),
    );
  }),
);

adminRouter.patch(
  '/businesses/:id',
  ah(async (req, res) => {
    const { plan } = z.object({ plan: z.enum(['free', 'pro', 'team']) }).parse(req.body);
    const r = await one(`UPDATE businesses SET plan=$2 WHERE id=$1 RETURNING id, name, plan`, [String(req.params.id), plan]);
    if (!r) throw notFound('Business not found');
    console.log(`[admin] ${req.userId} set plan of ${r.id} (${r.name}) to ${plan}`);
    res.json(r);
  }),
);
