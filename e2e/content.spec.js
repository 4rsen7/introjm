const { test, expect } = require('@playwright/test');
const { login } = require('./helpers/auth');
const { requiredEnv } = require('./helpers/env');

const ownerJourneyTitle = process.env.E2E_OWNER_JOURNEY_TITLE || 'E2E Owner Journey';
const ownerPersonaName = process.env.E2E_OWNER_PERSONA_NAME || 'E2E Owner Persona';
const ownerMetricName = process.env.E2E_OWNER_METRIC_NAME || 'E2E Owner Metric';

test.describe('workspace content smoke', () => {
  test('owner sees seeded journey, persona, and metric', async ({ page }) => {
    await login(page, {
      email: requiredEnv('E2E_OWNER_EMAIL'),
      password: requiredEnv('E2E_OWNER_PASSWORD'),
    });

    await page.goto('/journeys');
    await expect(page.getByTestId('journeys-page')).toBeVisible();
    await expect(page.getByTestId('new-journey-button')).toBeVisible();
    await expect(
      page.locator('[data-testid="journey-row"]').filter({ hasText: ownerJourneyTitle })
    ).toHaveCount(1);

    await page.goto('/personas');
    await expect(page.getByTestId('personas-page')).toBeVisible();
    await expect(page.getByTestId('new-persona-button')).toBeVisible();
    await expect(
      page.locator('[data-testid="persona-row"]').filter({ hasText: ownerPersonaName })
    ).toHaveCount(1);

    await page.goto('/metrics');
    await expect(page.getByTestId('metrics-page')).toBeVisible();
    await expect(page.getByTestId('new-metric-button')).toBeVisible();
    await expect(
      page.locator('[data-testid="metric-row"]').filter({ hasText: ownerMetricName })
    ).toHaveCount(1);
  });
});
