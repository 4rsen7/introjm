const { test, expect } = require('@playwright/test');
const { login } = require('./helpers/auth');
const { requiredEnv } = require('./helpers/env');

test.describe('settings smoke', () => {
  test('owner sees current plan on settings page @smoke', async ({ page }) => {
    await login(page, {
      email: requiredEnv('E2E_OWNER_EMAIL'),
      password: requiredEnv('E2E_OWNER_PASSWORD'),
    });

    await page.goto('/settings');
    await expect(page.getByTestId('settings-page')).toBeVisible();
    await expect(page.getByTestId('current-plan-card')).toBeVisible();
    await expect(page.getByTestId('current-plan-card')).toContainText(/current plan/i);
  });
});
