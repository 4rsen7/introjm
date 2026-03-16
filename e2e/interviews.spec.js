const { test, expect } = require('@playwright/test');
const { login } = require('./helpers/auth');
const { requiredEnv } = require('./helpers/env');

test.describe('interviews smoke', () => {
  test('owner can open interview creation modal @smoke', async ({ page }) => {
    await login(page, {
      email: requiredEnv('E2E_OWNER_EMAIL'),
      password: requiredEnv('E2E_OWNER_PASSWORD'),
    });

    await page.goto('/interviews');
    await expect(page.getByTestId('interviews-page')).toBeVisible();
    await page.getByTestId('new-interview-button').click();
    await expect(page.getByRole('heading', { name: /select interview type/i })).toBeVisible();
  });
});
