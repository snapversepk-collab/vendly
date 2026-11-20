import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { config } from './config.js';
import { one } from './db/index.js';
import { HttpError, forbidden } from './lib/util.js';

export type Role = 'owner' | 'manager' | 'staff';
export interface Ctx {
  userId: string;
  businessId: string;
  role: Role;
  plan: 'free' | 'pro' | 'team';
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      ctx: Ctx;
      userId?: string;
    }
  }
}

export const signToken = (userId: string) => jwt.sign({ sub: userId }, config.jwtSecret, { expiresIn: '60d' });

function readUserId(req: Request): string | null {
  const h = req.headers.authorization;
  if (!h?.startsWith('Bearer ')) return null;
  try {
    const p = jwt.verify(h.slice(7), config.jwtSecret) as { sub: string };
    return p.sub;
  } catch {
    return null;
  }
}

/** Signed in, no business required (e.g. reading /auth/me) */
export function requireUser(req: Request, _res: Response, next: NextFunction) {
  const id = readUserId(req);
  if (!id) return next(new HttpError(401, 'Please sign in'));
  req.userId = id;
  next();
}

/** Signed in and member of a business. Every business query uses req.ctx.businessId. */
export async function requireMember(req: Request, _res: Response, next: NextFunction) {
  try {
    const id = readUserId(req);
    if (!id) throw new HttpError(401, 'Please sign in');
    const m = await one(
      `SELECT m.business_id, m.role, b.plan FROM memberships m JOIN businesses b ON b.id = m.business_id
       WHERE m.user_id = $1 ORDER BY m.created_at LIMIT 1`,
      [id],
    );
    if (!m) throw new HttpError(401, 'Your account is not part of a business');
    req.userId = id;
    req.ctx = { userId: id, businessId: m.business_id, role: m.role, plan: m.plan };
    next();
  } catch (e) {
    next(e);
  }
}

export const allow =
  (...roles: Role[]) =>
  (req: Request, _res: Response, next: NextFunction) =>
    roles.includes(req.ctx.role) ? next() : next(forbidden());

export const canSeeMoney = (ctx: Ctx) => ctx.role !== 'staff';
