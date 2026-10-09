import { defineConfig, devices } from '@playwright/test';

const PORT = Number(process.env.E2E_PORT ?? 3200);

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 120_000,
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: { baseURL: `http://localhost:${PORT}`, trace: 'retain-on-failure' },
  projects: [
    { name: 'mobile', use: { ...devices['Pixel 7'], browserName: 'chromium' } },
  ],
  webServer: {
    // Requires `npm run build` first. Uses a throwaway embedded database.
    command: `rm -rf .data/e2e && next start -p ${PORT}`,
    url: `http://localhost:${PORT}/offline`,
    reuseExistingServer: false,
    timeout: 60_000,
    env: {
      PGLITE_DIR: '.data/e2e',
      SESSION_SECRET: 'e2e-secret-0123456789abcdefghijklmnopqrstuvwxyz',
      ALLOW_DEV_AUTH: 'true',
      INSECURE_COOKIES: 'true',
      ADMIN_BOOTSTRAP_EMAILS: 'admin@fastora.test',
      FEATURE_FLAGS: 'multiplayer,ghostOpponents,friendChallenges,askAudience',
      CRON_SECRET: 'e2e-cron',
      DEMO_ACCOUNT_PASSWORD: 'e2e-demo-password',
    },
  },
});
