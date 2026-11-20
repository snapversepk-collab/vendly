const env = process.env;

if (!env.JWT_SECRET && env.NODE_ENV === 'production') {
  throw new Error('JWT_SECRET must be set in production');
}

export const config = {
  port: Number(env.PORT ?? 4000),
  appName: env.APP_NAME ?? 'Vendly',
  jwtSecret: env.JWT_SECRET ?? 'dev-only-secret',
  frontendUrls: (env.FRONTEND_URL ?? 'http://localhost:5173').split(',').map((s) => s.trim().replace(/\/$/, '')),
  /** First frontend URL: used to build links in emails and WhatsApp messages */
  get publicUrl() {
    return (env.PUBLIC_APP_URL ?? this.frontendUrls[0]).replace(/\/$/, '');
  },
  googleClientId: env.GOOGLE_CLIENT_ID || '',
  resendKey: env.RESEND_API_KEY || '',
  emailFrom: env.EMAIL_FROM_ADDRESS || 'bookings@example.com',
  cronSecret: env.CRON_SECRET || '',
  adminSecret: env.ADMIN_SECRET || '',
  freeBookingsPerMonth: Number(env.FREE_BOOKINGS_PER_MONTH ?? 10),
  /** In-process scheduler. Render free instances sleep, so also hit POST /api/cron/run from an external cron. */
  inProcessCron: env.IN_PROCESS_CRON !== 'off',
  plans: {
    free: { name: 'Free', price: 0 },
    pro: { name: 'Pro', price: Number(env.PRO_PRICE ?? 2500) },
    team: { name: 'Team', price: Number(env.TEAM_PRICE ?? 5000) },
  },
};
