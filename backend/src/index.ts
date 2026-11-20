import compression from 'compression';
import cors from 'cors';
import express, { Router } from 'express';
import helmet from 'helmet';
import { z } from 'zod';
import { requireMember } from './auth.js';
import { config } from './config.js';
import { initDb, q } from './db/index.js';
import { runScheduledJobs, startScheduler } from './lib/scheduler.js';
import { HttpError, ah, errorHandler } from './lib/util.js';
import { authRouter } from './routes/auth.js';
import { bookingsRouter } from './routes/bookings.js';
import { businessRouter } from './routes/business.js';
import { dashboardRouter } from './routes/dashboard.js';
import { inquiriesRouter } from './routes/inquiries.js';
import { messagesRouter } from './routes/messages.js';
import { publicRouter } from './routes/public.js';

const app = express();
app.set('trust proxy', 1);
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(compression());
app.use(
  cors({
    origin(origin, cb) {
      // Allow configured frontends, plus Vercel preview deployments of the same project
      if (!origin) return cb(null, true);
      const o = origin.replace(/\/$/, '');
      const ok =
        config.frontendUrls.includes(o) ||
        config.frontendUrls.some((u) => {
          const m = u.match(/^https:\/\/([a-z0-9-]+)\.vercel\.app$/);
          return m && new RegExp(`^https://${m[1]}-[a-z0-9-]+\\.vercel\\.app$`).test(o);
        });
      cb(null, ok);
    },
    exposedHeaders: ['Content-Disposition'],
  }),
);
app.use(express.json({ limit: '1mb' }));

const api = Router();
api.get('/health', ah(async (_req, res) => {
  await q('SELECT 1');
  res.json({ ok: true });
}));
api.get('/config', (_req, res) =>
  res.json({ appName: config.appName, googleClientId: config.googleClientId || null, plans: config.plans, freeBookingsPerMonth: config.freeBookingsPerMonth }),
);

api.use('/auth', authRouter);
api.use('/public', publicRouter);

/** External scheduler hook (Render Cron Job / cron-job.org) */
api.post('/cron/run', ah(async (req, res) => {
  if (!config.cronSecret || req.get('x-cron-secret') !== config.cronSecret) throw new HttpError(401, 'Bad cron secret');
  res.json(await runScheduledJobs());
}));

/** Manual plan change until subscription payments exist (spec build step 12) */
api.post('/admin/plan', ah(async (req, res) => {
  if (!config.adminSecret || req.get('x-admin-secret') !== config.adminSecret) throw new HttpError(401, 'Bad admin secret');
  const b = z.object({ handle: z.string().optional(), email: z.string().optional(), plan: z.enum(['free', 'pro', 'team']) }).parse(req.body);
  const r = await q(
    `UPDATE businesses SET plan=$3 WHERE ($1::text IS NOT NULL AND handle=$1) OR ($2::text IS NOT NULL AND email=$2) RETURNING id, name, plan`,
    [b.handle ?? null, b.email?.toLowerCase() ?? null, b.plan],
  );
  res.json(r.rows);
}));

// Everything below needs a signed-in member; every query is filtered by req.ctx.businessId
const member = Router();
member.use(requireMember);
member.use(businessRouter);
member.use(bookingsRouter);
member.use(dashboardRouter);
member.use(inquiriesRouter);
member.use(messagesRouter);
api.use(member);

app.use('/api', api);
app.get('/', (_req, res) => res.json({ name: `${config.appName} API`, health: '/api/health' }));
app.use((_req, res) => res.status(404).json({ error: 'Not found' }));
app.use(errorHandler);

await initDb();
app.listen(config.port, () => console.log(`[api] listening on :${config.port}`));
if (config.inProcessCron) startScheduler();
