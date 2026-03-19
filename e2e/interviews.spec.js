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

  test('owner can configure and persist AI insight setup @smoke', async ({ page }) => {
    await login(page, {
      email: requiredEnv('E2E_OWNER_EMAIL'),
      password: requiredEnv('E2E_OWNER_PASSWORD'),
    });

    await page.goto('/interviews');
    await expect(page.getByTestId('interviews-page')).toBeVisible();
    await page.getByTestId('new-interview-button').click();
    await expect(page.getByRole('heading', { name: /select interview type/i })).toBeVisible();
    await page.getByText('Live Interview', { exact: true }).click();
    await page.getByRole('button', { name: /create room/i }).click();
    await expect(page).toHaveURL(/\/interviews\/[^/?]+$/);

    const interviewId = page.url().split('/interviews/')[1];
    const token = await page.evaluate(() => window.localStorage.getItem('token'));

    await page.evaluate(async ({ interviewId: id, authToken }) => {
      const response = await fetch(`/api/interviews/${id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          transcript_data: [
            {
              id: 'seed-transcript-1',
              speaker: 'Respondent',
              text: 'The onboarding was simple and the support team helped me quickly.',
              timestamp: '00:01',
            },
          ],
        }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error || payload.message || 'Failed to seed transcript for the interview.');
      }
    }, { interviewId, authToken: token });

    await page.reload();
    await expect(page.getByRole('button', { name: /configure/i })).toBeEnabled();

    const currentInterview = await page.evaluate(async ({ interviewId: id, authToken }) => {
      const response = await fetch(`/api/interviews/${id}`, {
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || payload.message || 'Failed to fetch current interview data.');
      }
      return payload.data;
    }, { interviewId, authToken: token });

    const selectedSections = ['summary', 'painPoints', 'strengths', 'quotes'];
    const summaryData = {
      summary: {
        jobToBeDone: 'Finish setup quickly and feel supported.',
        generalInsight: 'The experience feels easier when onboarding is clear and support answers fast.',
        overallSentiment: 'positive',
      },
      strengths: [
        {
          title: 'Friendly onboarding flow',
          description: 'The user could get started without extra clarification.',
          whyItWorks: 'Clear steps and timely support reduce uncertainty.',
          evidenceQuote: 'The onboarding was simple and the support team helped me quickly.',
        },
      ],
      quotes: ['The onboarding was simple and the support team helped me quickly.'],
      _system: {
        summaryGeneration: {
          provider: 'gemini',
          model: 'gemini-2.5-pro',
          preset: 'quick_summary',
          selectedSections,
          mergeMode: 'merge_selected',
          generatedAt: new Date().toISOString(),
        },
      },
    };

    let capturedRequestBody = null;
    await page.route(`**/api/interviews/${interviewId}/generate-summary`, async (route) => {
      capturedRequestBody = route.request().postDataJSON();
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          status: 'success',
          data: {
            ...currentInterview,
            summary_data: summaryData,
          },
        }),
      });
    });

    await page.getByRole('button', { name: /configure/i }).click();
    await expect(page.getByRole('heading', { name: /choose what to extract/i })).toBeVisible();
    await page.getByRole('button', { name: /quick summary/i }).click();
    await expect(page.getByText('4 selected').first()).toBeVisible();
    await page.getByRole('button', { name: /^generate insights$/i }).last().click();

    await expect.poll(() => capturedRequestBody).not.toBeNull();
    expect(capturedRequestBody).toMatchObject({
      preset: 'quick_summary',
      selectedSections,
      mergeMode: 'merge_selected',
    });

    await expect(page.getByText('What Works Well')).toBeVisible();
    await expect(page.getByText('Friendly onboarding flow')).toBeVisible();

    await page.getByRole('button', { name: /^update$/i }).click();
    await expect(page.getByRole('heading', { name: /choose what to extract/i })).toBeVisible();
    await expect(page.getByText('4 selected').first()).toBeVisible();
    await expect(page.getByRole('button', { name: /quick summary/i })).toContainText('Active');
    await expect(page.getByRole('button', { name: /update selected only/i })).toHaveClass(/border-blue-300/);
  });
});
