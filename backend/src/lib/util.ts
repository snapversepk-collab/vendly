import { randomBytes } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { ZodError, type ZodTypeAny, type z } from 'zod';

/** URL-safe random token. 24 bytes -> 32 chars (spec: at least 22). */
export const token = (bytes = 24) => randomBytes(bytes).toString('base64url');

export class HttpError extends Error {
  constructor(public status: number, message: string, public code?: string, public extra?: Record<string, unknown>) {
    super(message);
  }
}
export const bad = (msg: string, code?: string, extra?: Record<string, unknown>) => new HttpError(400, msg, code, extra);
export const notFound = (what = 'Not found') => new HttpError(404, what);
export const forbidden = (msg = 'You do not have access to this') => new HttpError(403, msg);

/** Wrap async route handlers so thrown errors reach the error middleware */
export const ah =
  (fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) =>
    fn(req, res, next).catch(next);

export function parse<S extends ZodTypeAny>(schema: S, data: unknown): z.infer<S> {
  return schema.parse(data);
}

export function errorHandler(err: any, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof ZodError) {
    const first = err.issues[0];
    return res.status(400).json({ error: `${first.path.join('.') || 'input'}: ${first.message}`, issues: err.issues });
  }
  if (err instanceof HttpError) return res.status(err.status).json({ error: err.message, code: err.code, ...err.extra });
  if (err?.code === '23505') return res.status(409).json({ error: 'That already exists', code: 'duplicate' });
  // malformed uuid / date in a URL or body: treat as not found instead of a server error
  if (err?.code === '22P02' || err?.code === '22007' || err?.code === '22008') return res.status(404).json({ error: 'Not found' });
  console.error(err);
  res.status(500).json({ error: 'Something went wrong on our side' });
}

/** Local Pakistani number -> wa.me format: 0300 1234567 -> 923001234567 */
export function waNumber(phone?: string | null): string {
  let d = (phone ?? '').replace(/\D/g, '');
  if (d.startsWith('00')) d = d.slice(2);
  if (d.startsWith('0')) d = '92' + d.slice(1);
  else if (d.length === 10 && d.startsWith('3')) d = '92' + d;
  return d;
}
export const waLink = (phone: string | null | undefined, text: string) =>
  `https://wa.me/${waNumber(phone)}?text=${encodeURIComponent(text)}`;

export function fillTemplate(text: string, vars: Record<string, string | undefined>): string {
  return text.replace(/\[([a-z ]+)\]/gi, (m, k) => vars[k.toLowerCase()] ?? m);
}

export const handleOk = (h: string) => /^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$/.test(h);
export const RESERVED_HANDLES = new Set(['api', 'admin', 'app', 'q', 'r', 'b', 'signin', 'signup', 'settings', 'today', 'calendar', 'www', 'help', 'login']);
