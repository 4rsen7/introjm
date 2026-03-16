const { test, expect } = require('@playwright/test');
const { login, logout } = require('./helpers/auth');
const { requiredEnv } = require('./helpers/env');

test.describe('authentication smoke', () => {
  test('owner can sign in and sign out @smoke', async ({ page }) => {
    await login(page, {
      email: process.env.E2E_AUTH_EMAIL || requiredEnv('E2E_OWNER_EMAIL'),
      password: process.env.E2E_AUTH_PASSWORD || requiredEnv('E2E_OWNER_PASSWORD'),
    });

    await expect(page.getByRole('heading', { name: /dashboard/i })).toBeVisible();
    await logout(page);
  });
});
