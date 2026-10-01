import { test, expect } from '@playwright/test';

const ids = {
  user: '00000000-0000-4000-8000-000000000001',
  workspace: '00000000-0000-4000-8000-000000000002',
  otherWorkspace: '00000000-0000-4000-8000-000000000005',
  study: '00000000-0000-4000-8000-000000000003',
  interview: '00000000-0000-4000-8000-000000000004',
};

async function mockResearch(page) {
  await page.addInitScript(({ userId }) => {
    localStorage.setItem('research.locale', 'en');
    localStorage.setItem('sb-127-auth-token', JSON.stringify({
      access_token: 'local-test-token', refresh_token: 'local-test-refresh', token_type: 'bearer',
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      user: { id: userId, email: 'research@example.test', aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {} },
    }));
  }, { userId: ids.user });
  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.hostname !== '127.0.0.1') return route.abort();
    if (url.port === '5399') return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
    if (!url.pathname.startsWith('/api/research')) return route.continue();
    const send = (data) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'success', data }) });
    const path = url.pathname.replace('/api/research', '');
    if (path === '/workspaces') return send([{ id: ids.workspace, name: 'Product team' }, { id: ids.otherWorkspace, name: 'Another team' }]);
    if (path === '/studies') {
      if (url.searchParams.get('workspace_id') === ids.otherWorkspace) return send([]);
      const before = url.searchParams.get('before');
      const count = before ? 1 : 50;
      return send(Array.from({ length: count }, (_, index) => ({
        id: before ? ids.study : `00000000-0000-4000-8000-${String(100 - index).padStart(12, '0')}`,
        workspace_id: ids.workspace, title: before ? 'Last study' : `Study ${index + 1}`,
        goal: 'Find the delivery time', revision: 0,
      })));
    }
    if (path === `/studies/${ids.study}`) return send({ id: ids.study, workspace_id: ids.workspace, title: 'Last study', goal: 'Find the delivery time', brief_status: 'confirmed', revision: 0, plan: { tasks: [] } });
    if (path.startsWith('/studies/') && path.endsWith('/interviews')) return send([{ id: ids.interview, study_id: ids.study, workspace_id: ids.workspace, title: 'Session 01', status: 'draft' }]);
    if (path === `/interviews/${ids.interview}`) return send({
      id: ids.interview, study_id: ids.study, workspace_id: ids.workspace, title: 'Session 01', status: 'draft',
      research_revision: 0, transcript_revision: 0, summary_revision: 0, transcript_data: [{ text: 'Initial words', speaker: 'Participant' }],
    });
    return route.fulfill({ status: 404, contentType: 'application/json', body: '{}' });
  });
}

test('study pagination reaches the end and preserves version zero', async ({ page }) => {
  await mockResearch(page);
  await page.goto('/');
  await expect(page.getByTestId('research-study-card')).toHaveCount(50);
  await expect(page.getByText('Version 0').first()).toBeVisible();
  await page.getByTestId('research-load-more').click();
  await expect(page.getByTestId('research-study-card')).toHaveCount(51);
  await expect(page.getByTestId('research-load-more')).toHaveCount(0);
});

test('study navigation has three primary tabs and places return opposite add interview', async ({ page }) => {
  await mockResearch(page);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(`/studies/${ids.study}`);
  await expect(page.getByTestId('research-study-tabs').getByRole('tab')).toHaveCount(3);
  const back = await page.getByRole('link', { name: 'Return to studies' }).boundingBox();
  const add = await page.getByTestId('research-new-interview').boundingBox();
  expect(back.x).toBeLessThan(add.x);
  expect(Math.abs((back.y + back.height / 2) - (add.y + add.height / 2))).toBeLessThan(8);
});

test('unsaved transcript blocks home, workspace switch, logout, and browser back', async ({ page }) => {
  await mockResearch(page);
  await page.goto('/');
  await page.getByTestId('research-load-more').click();
  await page.getByRole('link', { name: /Last study/ }).click();
  await page.getByRole('tab', { name: 'Interviews' }).click();
  await page.getByRole('link', { name: /Session 01/ }).click();
  await page.getByRole('tab', { name: 'Transcript' }).click();
  await page.getByLabel('What was said').fill('Unsaved words');
  let prompts = 0;
  page.on('dialog', async (dialog) => { prompts += 1; await dialog.dismiss(); });
  await page.getByRole('link', { name: 'Research home' }).click();
  await expect(page).toHaveURL(new RegExp(`/interviews/${ids.interview}$`));
  await page.getByTestId('research-workspace').click();
  await page.getByTestId('research-workspace-option').filter({ hasText: 'Another team' }).click();
  await expect(page.getByTestId('research-workspace')).toHaveAttribute('title', 'Product team');
  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page.getByLabel('What was said')).toHaveValue('Unsaved words');
  await page.evaluate(() => window.history.back());
  await expect(page).toHaveURL(new RegExp(`/interviews/${ids.interview}$`));
  expect(prompts).toBe(4);
});

test('new pages start at the top while study result links still reach their section', async ({ page }) => {
  await mockResearch(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.getByTestId('research-load-more').click();
  await page.getByRole('link', { name: /Last study/ }).scrollIntoViewIfNeeded();
  expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(500);
  await page.getByRole('link', { name: /Last study/ }).click();
  await expect(page.getByRole('heading', { name: 'Last study', exact: true })).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
  
  await page.getByRole('tab', { name: 'Interviews' }).click();
  
  await page.getByRole('link', { name: /Session 01/ }).scrollIntoViewIfNeeded();
  expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
  await page.getByRole('link', { name: /Session 01/ }).click();
  await expect(page.getByRole('heading', { name: 'Session 01', exact: true })).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
  
  await page.goBack();
  await expect(page).toHaveURL(new RegExp(`/studies/${ids.study}#interviews$`));
  await page.goto(`/studies/${ids.study}#results`);
  
  await expect(page).toHaveURL(new RegExp(`/studies/${ids.study}#results$`));
  await expect(page.getByRole('tab', { name: 'Summary' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByTestId('research-comparison-tools')).toHaveAttribute('open', '');
});
