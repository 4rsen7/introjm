const { test, expect } = require('@playwright/test');
const { getAccessToken, login } = require('./helpers/auth');
const { requiredEnv } = require('./helpers/env');

const ownerJourneyTitle = process.env.E2E_OWNER_JOURNEY_TITLE || 'E2E Owner Journey';

test.describe('journey export smoke', () => {
  test('owner can export a seeded journey as pdf @smoke', async ({ page }) => {
    test.setTimeout(90_000);

    await login(page, {
      email: requiredEnv('E2E_OWNER_EMAIL'),
      password: requiredEnv('E2E_OWNER_PASSWORD'),
    });

    const token = await getAccessToken(page);
    expect(token).toBeTruthy();

    const journeyId = await page.evaluate(async ({ authToken, expectedTitle }) => {
      const response = await fetch('/api/journeys', {
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.error || payload.message || 'Failed to load journeys.');
      }

      const journeys = Array.isArray(payload.data) ? payload.data : [];
      const match = journeys.find((journey) => journey.title === expectedTitle) || journeys[0];
      if (!match?.id) {
        throw new Error('No exportable journey found for smoke test.');
      }

      return match.id;
    }, { authToken: token, expectedTitle: ownerJourneyTitle });

    const exportResult = await page.evaluate(async ({ authToken, id }) => {
      const response = await fetch(`/api/export/journeys/${id}/pdf`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
      });

      const contentType = response.headers.get('content-type') || '';
      const buffer = await response.arrayBuffer();

      return {
        ok: response.ok,
        status: response.status,
        contentType,
        size: buffer.byteLength,
      };
    }, { authToken: token, id: journeyId });

    expect(exportResult.ok).toBe(true);
    expect(exportResult.status).toBe(200);
    expect(exportResult.contentType).toContain('application/pdf');
    expect(exportResult.size).toBeGreaterThan(1_000);
  });
});
