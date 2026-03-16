const { test, expect } = require('@playwright/test');
const { login } = require('./helpers/auth');
const { hasWorkspaceSwitchConfig, requiredEnv } = require('./helpers/env');
const { switchWorkspace } = require('./helpers/workspace');

test.describe('workspace isolation', () => {
  test.skip(!hasWorkspaceSwitchConfig(), 'Workspace-switch fixture env vars are not configured.');

  test('member does not keep foreign interviews after switching workspace', async ({ page }) => {
    await login(page, {
      email: requiredEnv('E2E_MEMBER_EMAIL'),
      password: requiredEnv('E2E_MEMBER_PASSWORD'),
    });

    await page.goto('/interviews');
    await switchWorkspace(page, requiredEnv('E2E_MEMBER_SHARED_WORKSPACE'));
    await expect(
      page.locator('[data-testid="interview-row"]').filter({
        hasText: requiredEnv('E2E_SHARED_INTERVIEW_TITLE'),
      })
    ).toHaveCount(1);

    await switchWorkspace(page, requiredEnv('E2E_MEMBER_PERSONAL_WORKSPACE'));
    await expect(
      page.locator('[data-testid="interview-row"]').filter({
        hasText: requiredEnv('E2E_SHARED_INTERVIEW_TITLE'),
      })
    ).toHaveCount(0);
  });
});
