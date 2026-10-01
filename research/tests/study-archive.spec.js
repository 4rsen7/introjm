import { test, expect } from '@playwright/test';

const ids = {
  user: '00000000-0000-4000-8000-000000000901',
  workspace: '00000000-0000-4000-8000-000000000902',
  otherWorkspace: '00000000-0000-4000-8000-000000000903',
  study: '00000000-0000-4000-8000-000000000904',
  interview: '00000000-0000-4000-8000-000000000905',
};
const study = (id = ids.study, title = 'Delivery study', revision = 3, workspaceId = ids.workspace) => ({
  id, workspace_id: workspaceId, title, goal: 'Find delivery date', brief: 'Watch checkout',
  brief_status: 'confirmed', revision,
  plan: { prototype: { name: 'Checkout', version: 'v1' }, tasks: [], questions: [], hypotheses: [], guide: [] },
});
const success = data => ({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'success', data }) });
const failure = (status, message) => ({ status, contentType: 'application/json', body: JSON.stringify({ status: 'error', message }) });

async function fixture(page, options = {}) {
  const writes = [];
  const requests = [];
  const rows = options.rows || [study()];
  const archived = new Set();
  let listFailure = false;
  let latest = options.latest || study();
  let deleteHandler = options.onDelete || (() => success({ ...latest, archived_at: new Date().toISOString() }));
  await page.addInitScript(userId => {
    localStorage.setItem('research.locale', 'en');
    localStorage.setItem('sb-127-auth-token', JSON.stringify({
      access_token: 'local-test-token', refresh_token: 'local-test-refresh', token_type: 'bearer',
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      user: { id: userId, email: 'research@example.test', aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {} },
    }));
  }, ids.user);
  await page.route('**/*', async route => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.hostname !== '127.0.0.1') return route.abort();
    if (url.port === '5399') return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
    if (!url.pathname.startsWith('/api/research')) return route.fallback();
    const path = url.pathname.slice('/api/research'.length);
    requests.push(`${request.method()} ${path}${url.search}`);
    if (request.method() !== 'GET') writes.push({ method: request.method(), path, headers: request.headers(), body: request.postDataJSON() });
    if (path === '/workspaces') return route.fulfill(success([
      { id: ids.workspace, name: 'Research team', role: 'owner' },
      ...(options.twoWorkspaces ? [{ id: ids.otherWorkspace, name: 'Other team', role: 'owner' }] : []),
    ]));
    if (path === '/studies' && request.method() === 'GET') {
      if (listFailure) return route.fulfill(failure(503, 'List unavailable'));
      const workspace = url.searchParams.get('workspace_id');
      const before = url.searchParams.get('before');
      const pageRows = workspace === ids.otherWorkspace ? [study('00000000-0000-4000-8000-000000000999', 'Other study', 1, ids.otherWorkspace)]
        : before ? [study('00000000-0000-4000-8000-000000000998', 'Next page', 1)] : rows.filter(row => !archived.has(row.id));
      return route.fulfill(success(pageRows));
    }
    if (path === `/studies/${ids.study}` && request.method() === 'GET') return route.fulfill(success(latest));
    if (path === `/studies/${ids.study}` && request.method() === 'DELETE') {
      const response = await deleteHandler(request);
      if (response.status === 200) archived.add(ids.study);
      return route.fulfill(response);
    }
    if (path === `/studies/${ids.study}/interviews`) return route.fulfill(success([{ id: ids.interview, study_id: ids.study, workspace_id: ids.workspace, title: 'Session one', status: 'completed' }]));
    if (path === `/studies/${ids.study}/synthesis`) return route.fulfill(success({ id: 'synthesis', is_current: true, output: { findings: [] } }));
    return route.fulfill(failure(404, 'Not found'));
  });
  return { writes, requests, setListFailure: value => { listFailure = value; }, setLatest: value => { latest = value; }, setDelete: value => { deleteHandler = value; } };
}

test('list archive is separate from the card link, cancel is safe, and success hides the last row', async ({ page }, testInfo) => {
  const api = await fixture(page);
  await page.goto('/');
  const card = page.getByTestId('research-study-card');
  await expect(card).toHaveAttribute('href', `/studies/${ids.study}`);
  await expect(page.getByTestId('research-archive-study-card')).toHaveCount(1);
  await page.screenshot({ path: testInfo.outputPath('archive-list-desktop.png'), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByTestId('research-archive-study-card').scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath('archive-list-mobile.png') });
  await page.getByTestId('research-archive-study-card').click();
  await expect(page).toHaveURL('/');
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText('Archive “Delivery study”?');
  await expect(dialog).toContainText('interviews and results will be retained');
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(dialog).toHaveCount(0);
  expect(api.writes).toEqual([]);
  await page.getByTestId('research-archive-study-card').click();
  await page.getByTestId('research-confirm-archive-study').click();
  await expect(page.getByTestId('research-study-card')).toHaveCount(0);
  await expect(page.getByTestId('research-new-study')).toBeVisible();
  expect(api.writes).toHaveLength(1);
  expect(api.writes[0]).toMatchObject({ method: 'DELETE', path: `/studies/${ids.study}`, body: { revision: 3 } });
  expect(api.writes[0].headers.authorization).toBe('Bearer local-test-token');
  expect(api.writes[0].headers['content-type']).toContain('application/json');
});

test('busy confirmation blocks duplicate writes and Escape; failure retains the card and allows retry', async ({ page }) => {
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  let attempts = 0;
  const api = await fixture(page, { onDelete: async () => { attempts += 1; if (attempts === 1) { await gate; return failure(500, 'Temporary failure'); } return success({ ...study(), archived_at: new Date().toISOString() }); } });
  await page.goto('/');
  await page.getByTestId('research-archive-study-card').click();
  await page.getByTestId('research-confirm-archive-study').click();
  const dialog = page.getByRole('dialog');
  await expect(page.getByTestId('research-confirm-archive-study')).toBeDisabled();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeVisible();
  await expect.poll(() => api.writes.length).toBe(1);
  release();
  await expect(dialog.getByTestId('research-error')).toContainText('We could not load this content. Please try again.');
  await expect(page.getByTestId('research-study-card')).toHaveCount(1);
  await page.getByTestId('research-confirm-archive-study').click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByTestId('research-study-card')).toHaveCount(0);
  expect(api.writes).toHaveLength(2);
});

test('409 requires an explicit latest revision reload before a second confirmation', async ({ page }) => {
  const api = await fixture(page, { latest: study(ids.study, 'Delivery study updated', 4), onDelete: request => request.postDataJSON().revision === 3 ? failure(409, 'Study changed') : success({ ...study(ids.study, 'Delivery study updated', 5), archived_at: new Date().toISOString() }) });
  await page.goto('/');
  await page.getByTestId('research-archive-study-card').click();
  await page.getByTestId('research-confirm-archive-study').click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText('A newer version was saved');
  await expect(page.getByTestId('research-confirm-archive-study')).toBeDisabled();
  expect(api.writes).toHaveLength(1);
  await dialog.getByRole('button', { name: 'Reload latest' }).click();
  await expect(dialog).toContainText('Delivery study updated');
  await expect(page.getByTestId('research-confirm-archive-study')).toBeEnabled();
  expect(api.requests).toContain(`GET /studies/${ids.study}`);
  await page.getByTestId('research-confirm-archive-study').click();
  await expect(dialog).toHaveCount(0);
  expect(api.writes.map(item => item.body.revision)).toEqual([3, 4]);
});

test('successful archive survives failed list refetch and preserves pagination cursor', async ({ page }) => {
  const rows = Array.from({ length: 50 }, (_, index) => study(index === 0 ? ids.study : `00000000-0000-4000-8000-${String(1000 + index).padStart(12, '0')}`, index === 0 ? 'Delivery study' : `Study ${index}`, 3));
  const api = await fixture(page, { rows });
  await page.goto('/');
  await expect(page.getByTestId('research-study-card')).toHaveCount(50);
  await page.getByTestId('research-archive-study-card').first().click();
  api.setListFailure(true);
  const failedRefetch = page.waitForResponse(response => new URL(response.url()).pathname === '/api/research/studies' && response.status() === 503);
  await page.getByTestId('research-confirm-archive-study').click();
  await failedRefetch;
  await expect(page.getByTestId('research-study-card')).toHaveCount(49);
  await expect(page.getByTestId('research-load-more')).toBeVisible();
  api.setListFailure(false);
  await page.getByTestId('research-load-more').click();
  await expect(page.getByText('Next page')).toBeVisible();
  expect(api.requests.some(item => item.includes(`before=${rows.at(-1).id}`))).toBe(true);
});

test('modal blocks workspace switch during DELETE and later switch uses the new scope', async ({ page }) => {
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  let first = true;
  const api = await fixture(page, { twoWorkspaces: true, onDelete: async () => {
    if (first) { first = false; await gate; }
    return success({ ...study(), archived_at: new Date().toISOString() });
  } });
  await page.goto('/');
  await page.getByTestId('research-archive-study-card').click();
  await page.getByRole('dialog').getByRole('button', { name: 'Cancel' }).click();
  await page.getByTestId('research-workspace').click();
  await page.getByTestId('research-workspace-option').filter({ hasText: 'Other team' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByText('Other study')).toBeVisible();
  expect(api.writes).toEqual([]);
  await page.getByTestId('research-workspace').click();
  await page.getByTestId('research-workspace-option').filter({ hasText: 'Research team' }).click();
  for (const tab of ['summary', 'interviews', 'brief']) {
    await page.goto(`/studies/${ids.study}#${tab}`);
    await expect(page.getByTestId('research-archive-study')).toBeVisible();
  }
  await page.getByTestId('research-archive-study').click();
  await page.getByTestId('research-confirm-archive-study').click();
  await expect(page.getByTestId('research-confirm-archive-study')).toBeDisabled();
  await expect.poll(() => api.writes.length).toBe(1);
  const selectorReceivesPointer = await page.getByTestId('research-workspace').evaluate(element => {
    const rect = element.getBoundingClientRect();
    return element.contains(document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2));
  });
  expect(selectorReceivesPointer).toBe(false);
  await expect(page.getByTestId('research-workspace')).toHaveAttribute('aria-expanded', 'false');
  await expect(page.getByRole('dialog')).toBeVisible();
  release();
  await expect(page).toHaveURL('/');
  await expect(page.getByTestId('research-study-card')).toHaveCount(0);
  expect(api.writes).toHaveLength(1);
  await page.getByTestId('research-workspace').click();
  await page.getByTestId('research-workspace-option').filter({ hasText: 'Other team' }).click();
  await expect(page.getByText('Other study')).toBeVisible();
  expect(api.writes).toHaveLength(1);
});

test('study detail archive is available on summary, interviews, and brief, then returns home', async ({ page }) => {
  const api = await fixture(page);
  for (const tab of ['summary', 'interviews', 'brief']) {
    await page.goto(`/studies/${ids.study}#${tab}`);
    await expect(page.getByTestId('research-archive-study')).toBeVisible();
  }
  await page.getByTestId('research-archive-study').click();
  await page.getByTestId('research-confirm-archive-study').click();
  await expect(page).toHaveURL('/');
  expect(api.writes).toHaveLength(1);
});
