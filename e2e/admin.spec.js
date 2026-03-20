const { test, expect } = require('@playwright/test');
const { loginAdmin, getAdminUrl } = require('./helpers/admin');
const { getAccessToken, login } = require('./helpers/auth');
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

  test('admin can reply to support feedback @smoke', async ({ browser, page }) => {
    const ownerPage = await browser.newPage();
    const subject = `Smoke feedback ${Date.now()}`;
    const replyText = `Support reply ${Date.now()}`;

    await login(ownerPage, {
      email: requiredEnv('E2E_OWNER_EMAIL'),
      password: requiredEnv('E2E_OWNER_PASSWORD'),
    });

    const ownerToken = await getAccessToken(ownerPage);
    expect(ownerToken).toBeTruthy();

    const feedbackId = await ownerPage.evaluate(async ({ authToken, nextSubject }) => {
      const response = await fetch('/api/feedback', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          type: 'issue',
          subject: nextSubject,
          body: 'Smoke-created support ticket for admin reply verification.',
          steps_to_reproduce: '1. Open support. 2. Send reply. 3. Confirm thread updates.',
        }),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.error || payload.message || 'Failed to create feedback fixture.');
      }

      return payload.data.id;
    }, { authToken: ownerToken, nextSubject: subject });

    await loginAdmin(page, {
      email: requiredEnv('E2E_ADMIN_EMAIL'),
      password: requiredEnv('E2E_ADMIN_PASSWORD'),
    });

    await page.goto(`${getAdminUrl()}/support`);
    await expect(page.getByText(/support & feedback/i)).toBeVisible();
    await page.getByRole('row', { name: new RegExp(subject, 'i') }).getByRole('button', { name: /view/i }).click();
    await expect(page.getByText(subject)).toBeVisible();
    await page.getByPlaceholder(/type your reply to the user/i).fill(replyText);
    await page.getByRole('button', { name: /send reply/i }).click();
    await expect(page.getByText(/reply sent/i)).toBeVisible();
    await expect(page.getByText(replyText)).toBeVisible();

    const ownerThread = await ownerPage.evaluate(async ({ authToken, id }) => {
      const response = await fetch(`/api/feedback/${id}`, {
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.error || payload.message || 'Failed to read feedback thread.');
      }

      return payload.data;
    }, { authToken: ownerToken, id: feedbackId });

    expect(ownerThread.replies).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          author_type: 'admin',
          body: replyText,
        }),
      ])
    );

    await ownerPage.close();
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
