import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

export type Row = Record<string, any>;
export interface Queryable {
  query<T extends Row = Row>(text: string, params?: unknown[]): Promise<{ rows: T[] }>;
}
interface Db extends Queryable {
  tx<T>(fn: (q: Queryable) => Promise<T>): Promise<T>;
  exec(sql: string): Promise<unknown>;
  close(): Promise<void>;
}

// Return DATE columns as 'YYYY-MM-DD' strings (never shift through JS Date / UTC)
pg.types.setTypeParser(1082, (v) => v);
// numeric -> number
pg.types.setTypeParser(1700, (v) => (v === null ? null : Number(v)));
// int8 (count(*)) -> number
pg.types.setTypeParser(20, (v) => Number(v));

let db: Db;

async function makePg(url: string): Promise<Db> {
  // Render's *internal* database URL uses a bare hostname (dpg-xxxx-a) and plain TCP inside
  // the private network; the *external* URL (….render.com) needs SSL. PGSSL=on|off overrides.
  const host = new URL(url).hostname;
  const internal = host === 'localhost' || host === '127.0.0.1' || !host.includes('.');
  const useSsl = process.env.PGSSL ? process.env.PGSSL === 'on' : !internal;
  const pool = new pg.Pool({
    connectionString: url,
    ssl: useSsl ? { rejectUnauthorized: false } : undefined,
    max: 10,
  });
  pool.on('connect', (c) => c.query("SET TIME ZONE 'Asia/Karachi'"));
  return {
    query: (t, p) => pool.query(t, p as any[]) as any,
    async tx(fn) {
      const c = await pool.connect();
      try {
        await c.query('BEGIN');
        const r = await fn({ query: (t, p) => c.query(t, p as any[]) as any });
        await c.query('COMMIT');
        return r;
      } catch (e) {
        await c.query('ROLLBACK');
        throw e;
      } finally {
        c.release();
      }
    },
    exec: (sql) => pool.query(sql),
    close: () => pool.end(),
  };
}

/** Local development only: Postgres compiled to WASM, no install needed. */
async function makePglite(): Promise<Db> {
  const mod = await import('@electric-sql/pglite').catch(() => {
    throw new Error('DATABASE_URL is not set and @electric-sql/pglite is not installed. Set DATABASE_URL.');
  });
  const dir = process.env.PGLITE_DIR ?? './.pglite';
  const p = new mod.PGlite({
    dataDir: dir === 'memory' ? undefined : dir,
    parsers: {
      1082: (v: string) => v,
      1700: (v: string) => Number(v),
      20: (v: string) => Number(v),
    },
  });
  await p.query("SET TIME ZONE 'Asia/Karachi'");
  const wrap = (x: any): Queryable => ({ query: (t, params) => x.query(t, params) });
  let chain: Promise<unknown> = Promise.resolve();
  return {
    ...wrap(p),
    tx(fn) {
      // PGlite is single-connection: serialise transactions
      const run = chain.then(() => p.transaction((t: any) => fn(wrap(t))));
      chain = run.catch(() => undefined);
      return run as any;
    },
    exec: (sql) => p.exec(sql),
    close: () => p.close(),
  };
}

export async function initDb() {
  const url = process.env.DATABASE_URL;
  db = url ? await makePg(url) : await makePglite();
  if (!url) console.log('[db] DATABASE_URL not set, using local PGlite database');
  await migrate();
  return db;
}

async function migrate() {
  await db.query(`CREATE TABLE IF NOT EXISTS _migrations (name text PRIMARY KEY, run_at timestamptz DEFAULT now())`);
  const dir = join(dirname(fileURLToPath(import.meta.url)), 'migrations');
  const done = new Set((await db.query('SELECT name FROM _migrations')).rows.map((r) => r.name));
  for (const f of readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()) {
    if (done.has(f)) continue;
    const sql = readFileSync(join(dir, f), 'utf8');
    // statements are idempotent (IF NOT EXISTS), so a partial run can be retried
    await db.exec(sql);
    await db.query('INSERT INTO _migrations(name) VALUES ($1)', [f]);
    console.log('[db] migrated', f);
  }
}

export const q = <T extends Row = Row>(text: string, params?: unknown[]) => db.query<T>(text, params);
export const one = async <T extends Row = Row>(text: string, params?: unknown[]) =>
  (await db.query<T>(text, params)).rows[0] as T | undefined;
export const tx = <T>(fn: (q: Queryable) => Promise<T>) => db.tx(fn);
