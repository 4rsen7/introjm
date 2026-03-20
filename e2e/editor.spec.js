const { test, expect } = require('@playwright/test');
const { getAccessToken, login } = require('./helpers/auth');
const { requiredEnv } = require('./helpers/env');

const ownerJourneyTitle = process.env.E2E_OWNER_JOURNEY_TITLE || 'E2E Owner Journey';

test.describe('editor smoke', () => {
  test('owner can edit a journey and keep changes after reload @smoke', async ({ page }) => {
    test.setTimeout(90_000);

    await login(page, {
      email: requiredEnv('E2E_OWNER_EMAIL'),
      password: requiredEnv('E2E_OWNER_PASSWORD'),
    });

    await expect(page.getByTestId('dashboard-page')).toBeVisible();
    await page.waitForLoadState('networkidle');

    const token = await getAccessToken(page);
    expect(token).toBeTruthy();

    const seedJourney = await page.evaluate(async ({ authToken, expectedTitle }) => {
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
      if (!match?.id || !match?.workspace_id) {
        throw new Error('No seeded journey found for editor smoke test.');
      }

      return {
        id: match.id,
        workspaceId: match.workspace_id,
      };
    }, { authToken: token, expectedTitle: ownerJourneyTitle });

    const uniqueSuffix = Date.now();
    const draftTitle = `E2E Editor Smoke ${uniqueSuffix}`;
    const updatedTitle = `${draftTitle} Updated`;
    const updatedDescription = `Autosave verification ${uniqueSuffix}`;

    let tempJourneyId = null;

    try {
      tempJourneyId = await page.evaluate(async ({ authToken, workspaceId, title }) => {
        const response = await fetch('/api/journeys', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${authToken}`,
          },
          body: JSON.stringify({
            title,
            description: '',
            workspace_id: workspaceId,
          }),
        });

        const payload = await response.json().catch(() => ({}));
        if (!response.ok || payload.status !== 'success' || !payload.data?.id) {
          throw new Error(payload.error || payload.message || 'Failed to create temporary journey.');
        }

        return payload.data.id;
      }, { authToken: token, workspaceId: seedJourney.workspaceId, title: draftTitle });

      await page.goto(`/journey/${tempJourneyId}`);

      const titleInput = page.getByTestId('editor-title-input');
      const detailsToggle = page.getByTestId('editor-details-toggle');
      const descriptionInput = page.getByTestId('editor-description-input');
      const saveStatus = page.getByTestId('editor-save-status');

      await expect(page.locator('#journey-editor-container')).toBeVisible();
      await expect(titleInput).toHaveValue(draftTitle);

      await titleInput.fill(updatedTitle);
      await detailsToggle.click();
      await expect(descriptionInput).toBeVisible();
      await descriptionInput.fill(updatedDescription);

      await expect(saveStatus).toContainText(/saved/i, { timeout: 15_000 });

      await page.reload();

      await expect(page.locator('#journey-editor-container')).toBeVisible();
      await expect(titleInput).toHaveValue(updatedTitle);
      await detailsToggle.click();
      await expect(descriptionInput).toHaveValue(updatedDescription);
      await expect(saveStatus).toContainText(/saved/i, { timeout: 15_000 });
    } finally {
      if (tempJourneyId) {
        await page.evaluate(async ({ authToken, id }) => {
          await fetch(`/api/journeys/${id}`, {
            method: 'DELETE',
            headers: {
              Authorization: `Bearer ${authToken}`,
            },
          });
        }, { authToken: token, id: tempJourneyId });
      }
    }
  });
});
