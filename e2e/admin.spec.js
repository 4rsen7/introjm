const { test, expect } = require('@playwright/test');
const { loginAdmin, getAdminUrl } = require('./helpers/admin');
const { requiredEnv } = require('./helpers/env');

test.describe('admin access', () => {
  test.skip(!process.env.E2E_ADMIN_EMAIL || !process.env.E2E_ADMIN_PASSWORD, 'Admin fixture env vars are not configured.');

  test('admin can sign in to admin panel @smoke', async ({ page }) => {
    await loginAdmin(page, {
      email: requiredEnv('E2E_ADMIN_EMAIL'),
      password: requiredEnv('E2E_ADMIN_PASSWORD'),
    });

    await expect(page.getByText(/users 360/i)).toBeVisible();
  });

  test('non-admin is rejected by admin login', async ({ page }) => {
    await page.goto(`${getAdminUrl()}/login`);
    await page.getByLabel(/email/i).fill(requiredEnv('E2E_OWNER_EMAIL'));
    await page.getByLabel(/password/i).fill(requiredEnv('E2E_OWNER_PASSWORD'));
    await page.getByRole('button', { name: /sign in/i }).click();

    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByText(/only admin users can access the admin panel/i)).toBeVisible();
  });
});
