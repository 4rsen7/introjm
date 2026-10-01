import { readFile } from 'node:fs/promises';
import { test, expect } from '@playwright/test';

const ids = {
  user: '00000000-0000-4000-8000-000000000801',
  workspace: '00000000-0000-4000-8000-000000000802',
  study: '00000000-0000-4000-8000-000000000803',
  interview: '00000000-0000-4000-8000-000000000804',
};

async function savedStudy(page) {
  const apiWrites = [];
  const study = {
    id: ids.study, workspace_id: ids.workspace, title: 'Delivery study',
    goal: 'Find the delivery date', brief: 'Observe the checkout flow', brief_status: 'confirmed',
    revision: 1, plan: { prototype: { name: 'Checkout', version: 'v1' }, tasks: [], questions: [], hypotheses: [], guide: [] },
  };
  const interview = { id: ids.interview, study_id: ids.study, workspace_id: ids.workspace, title: 'Session 01', status: 'completed' };
  const synthesis = {
    id: 'saved-synthesis', is_current: true, refresh_available: false,
    source_manifest: [{ id: ids.interview }],
    output: { findings: [{
      category: 'insights', text: 'Participants found the delivery date.', source_ids: [ids.interview],
      evidence: [{ interview_id: ids.interview, segment_id: 'line-1', quote: 'I found the delivery date.' }],
    }] },
  };
  await page.addInitScript(userId => {
    localStorage.setItem('research.locale', 'en');
    localStorage.setItem('sb-127-auth-token', JSON.stringify({
      access_token: 'local-test-token', refresh_token: 'local-test-refresh', token_type: 'bearer',
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      user: { id: userId, email: 'research@example.test', aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {} },
    }));
  }, ids.user);
  await page.route('**/*', route => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.hostname !== '127.0.0.1') return route.abort();
    if (url.port === '5399') return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
    if (!url.pathname.startsWith('/api/research')) return route.fallback();
    if (request.method() !== 'GET') apiWrites.push(`${request.method()} ${url.pathname}`);
    const path = url.pathname.slice('/api/research'.length);
    const send = data => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'success', data }) });
    if (path === '/workspaces') return send([{ id: ids.workspace, name: 'Research team', role: 'owner' }]);
    if (path === '/studies') return send([study]);
    if (path === `/studies/${ids.study}`) return send(study);
    if (path === `/studies/${ids.study}/interviews`) return send([interview]);
    if (path === `/studies/${ids.study}/synthesis`) return send(synthesis);
    return route.fulfill({ status: 404, contentType: 'application/json', body: '{}' });
  });
  await page.goto(`/studies/${ids.study}`);
  await expect(page.getByText('Participants found the delivery date.')).toBeVisible();
  await page.getByTestId('research-synthesis-tab').getByText('Copy or download').click();
  return apiWrites;
}

test('saved synthesis downloads PDF bytes directly without API writes', async ({ page }, testInfo) => {
  const apiWrites = await savedStudy(page);
  const button = page.getByTestId('research-export-synthesis-pdf');
  const downloadPromise = page.waitForEvent('download');
  await button.click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('delivery-study-report.pdf');
  const path = testInfo.outputPath('study-download.pdf');
  await download.saveAs(path);
  const bytes = await readFile(path);
  expect(bytes.subarray(0, 5).toString()).toBe('%PDF-');
  expect(bytes.length).toBeGreaterThan(10000);
  await expect(button).toBeEnabled();
  expect(apiWrites).toEqual([]);
});

test('font failure shows a safe error and retry produces a PDF download', async ({ page }, testInfo) => {
  let releaseFont;
  const fontGate = new Promise(resolve => { releaseFont = resolve; });
  let fontRequests = 0;
  let firstFontRequest;
  const firstFontSeen = new Promise(resolve => { firstFontRequest = resolve; });
  await page.route(/NotoSans-.*\.ttf$/, async route => {
    fontRequests += 1;
    if (fontRequests === 1) {
      firstFontRequest();
      await fontGate;
      return route.fulfill({ status: 503, contentType: 'text/plain', body: 'temporary failure' });
    }
    return route.continue();
  });
  const apiWrites = await savedStudy(page);
  const button = page.getByTestId('research-export-synthesis-pdf');
  await button.click();
  await firstFontSeen;
  await expect(button).toBeDisabled();
  await expect(button).toHaveAttribute('aria-busy', 'true');
  await expect(button).toContainText('Preparing PDF');
  releaseFont();
  await expect(page.getByRole('alert')).toContainText('Could not prepare the PDF. Try again.');
  await expect(button).toBeEnabled();
  await expect(button).toHaveAttribute('aria-busy', 'false');
  const downloadPromise = page.waitForEvent('download');
  await button.click();
  const download = await downloadPromise;
  const path = testInfo.outputPath('study-retry.pdf');
  await download.saveAs(path);
  expect((await readFile(path)).subarray(0, 5).toString()).toBe('%PDF-');
  await expect(page.getByText('Could not prepare the PDF. Try again.')).toHaveCount(0);
  expect(fontRequests).toBeGreaterThanOrEqual(3);
  expect(apiWrites).toEqual([]);
});
