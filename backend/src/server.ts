// Long-running server: local development and Render. (Vercel uses api/index.js instead.)
import app, { ensureDb } from './app.js';
import { config } from './config.js';
import { startScheduler } from './lib/scheduler.js';

await ensureDb();
app.listen(config.port, () => console.log(`[api] listening on :${config.port}`));
if (config.inProcessCron) startScheduler();
