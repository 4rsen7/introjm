import { test, expect } from '@playwright/test';

const ids = { user: '00000000-0000-4000-8000-000000000001', workspace: '00000000-0000-4000-8000-000000000002', study: '00000000-0000-4000-8000-000000000003', interview: '00000000-0000-4000-8000-000000000004' };
async function mockResearch(page, { signedIn = true, disabled = false, conflict = false } = {}) {
    const study = { id: ids.study, workspace_id: ids.workspace, title: 'Checkout prototype', goal: 'Can users find the delivery time?', brief: 'Evaluate the new delivery screen.', revision: 0 };
    let interview = {
        id: ids.interview, workspace_id: ids.workspace, study_id: ids.study, title: 'Session 01', status: 'completed', research_revision: 2, transcript_revision: 1, summary_revision: 1,
        transcript_data: [{ id: 'line-1', timestamp: '00:10', speaker: 'Participant', text: 'I found the delivery time.' }],
        summary_data: { summary: { generalInsight: 'The delivery time is easy to find.' }, quotes: ['I found the delivery time.'] },
    };
    const patches = [];
    let summaryJob = null, synthesisJob = null, summaryPolls = 0, synthesisPolls = 0;
    let synthesis = null;
    await page.addInitScript(({ signedIn, userId }) => {
        localStorage.setItem('research.locale', 'en');
        if (signedIn) localStorage.setItem('sb-127-auth-token', JSON.stringify({
            access_token: 'local-test-token', refresh_token: 'local-test-refresh', token_type: 'bearer', expires_at: Math.floor(Date.now() / 1000) + 3600,
            user: { id: userId, email: 'research@example.test', aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {} },
        }));
    }, { signedIn, userId: ids.user });
    await page.route('**/*', async (route) => {
        const url = new URL(route.request().url());
        if (url.hostname !== '127.0.0.1') return route.abort();
        if (url.port === '5399') return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
        if (!url.pathname.startsWith('/api/research')) return route.continue();
        const send = (data, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify({ status: 'success', data }) });
        if (disabled) return route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ status: 'error', code: 'RESEARCH_DISABLED' }) });
        const path = url.pathname.replace('/api/research', '');
        if (path === `/interviews/${ids.interview}/summary-jobs`) {
            summaryJob = { id: 'summary-job', status: 'queued' }; summaryPolls = 0;
            return send(summaryJob, 202);
        }
        if (path === `/interviews/${ids.interview}/summary-job`) {
            if (summaryJob && ++summaryPolls >= 2) {
                summaryJob.status = 'completed';
                interview = { ...interview, status: 'completed', summary_stale: false, summary_revision: 2, research_revision: 3,
                    summary_data: { summary: { generalInsight: 'The prototype needs clearer delivery information.' } } };
            }
            return send(summaryJob);
        }
        if (path === `/studies/${ids.study}/synthesis-jobs`) {
            synthesisJob = { id: 'synthesis-job', status: 'queued' }; synthesisPolls = 0;
            return send(synthesisJob, 202);
        }
        if (path === `/studies/${ids.study}/synthesis-job`) {
            if (synthesisJob && ++synthesisPolls >= 2) {
                synthesisJob.status = 'completed';
                synthesis = { source_manifest: [{ id: ids.interview }], output: { findings: [{ text: 'Delivery information needs a clearer place in the flow.', source_ids: [ids.interview] }] } };
            }
            return send(synthesisJob);
        }
        if (path === `/studies/${ids.study}/synthesis`) return send(synthesis);
        if (path === '/workspaces') return send([{ id: ids.workspace, name: 'Product team', product_key: 'research', role: 'owner' }]);
        if (path === '/studies') return send([study]);
        if (path === `/studies/${ids.study}`) return send(study);
        if (path === `/studies/${ids.study}/interviews`) return send([interview]);
        if (path === `/interviews/${ids.interview}`) {
            if (route.request().method() === 'PATCH') {
                const body = route.request().postDataJSON(); patches.push(body);
                if (conflict || body.research_revision !== interview.research_revision) return route.fulfill({ status: 409, contentType: 'application/json', body: JSON.stringify({ status: 'error', code: 'RESEARCH_CONFLICT' }) });
                interview = { ...interview, ...body, research_revision: 3, transcript_revision: 2, summary_stale: true };
            }
            return send(interview);
        }
        return route.fulfill({ status: 404, contentType: 'application/json', body: '{}' });
    });
    return { patches };
}

test('sign-in is available without contacting production services', async ({ page }) => {
    await mockResearch(page, { signedIn: false });
    await page.goto('/');
    await expect(page.getByTestId('research-auth-form')).toBeVisible();
    await expect(page.getByText('Sign in with your IteroJM account.')).toBeVisible();
});

test('account and recovery forms have matching headings and an accessible password reveal', async ({ page }) => {
    await mockResearch(page, { signedIn: false });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    await page.getByRole('button', { name: 'Create a new account', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Create your account' })).toBeVisible();
    await page.getByTestId('research-password').fill('synthetic-password');
    await page.getByRole('button', { name: 'Show password', exact: true }).click();
    await expect(page.getByTestId('research-password')).toHaveAttribute('type', 'text');
    await page.getByRole('button', { name: 'Back to sign in' }).click();
    await expect(page.getByTestId('research-password')).toHaveAttribute('type', 'password');
    await page.getByRole('button', { name: 'Forgot password?', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Forgot password?', exact: true })).toBeVisible();
    await expect(page.getByTestId('research-password')).toHaveCount(0);
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: 'test-results/research-auth-mobile.png', fullPage: true });
});

test('disabled Research shows an availability state instead of an empty database', async ({ page }) => {
    await mockResearch(page, { disabled: true });
    await page.goto('/');
    await expect(page.getByText('Research is not enabled here yet')).toBeVisible();
    await expect(page.getByTestId('research-new-study')).toHaveCount(0);
});

test('study context leads to the existing summary renderer and revision-checked transcript edits', async ({ page }) => {
    const { patches } = await mockResearch(page);
    const errors = []; page.on('pageerror', (error) => errors.push(error.message));
    await page.goto('/');
    await page.getByTestId('research-study-card').click();
    await expect(page.getByText('Can users find the delivery time?', { exact: true })).toBeVisible();
    await page.getByRole('tab', { name: 'Interviews' }).click();
    await page.getByRole('link', { name: /Session 01/ }).click();
    await expect(page.getByText('The delivery time is easy to find.', { exact: true })).toBeVisible();
    await page.getByRole('tab', { name: 'Transcript' }).click();
    await page.getByLabel('What was said').fill('I could not find the delivery time.');
    await page.getByTestId('research-save-transcript').click();
    await expect(page.getByText('Transcript saved.', { exact: true })).toBeVisible();
    expect(patches[0]).toMatchObject({ research_revision: 2, transcript_revision: 1, summary_revision: 1 });
    expect(patches[0].transcript_data[0].id).toBe('line-1');
    await expect(page.getByText('The source has changed', { exact: true }).first()).toBeVisible();
    expect(errors).toEqual([]);
    await page.getByRole('tab', { name: 'Summary', exact: true }).click();
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: 'test-results/research-summary-desktop.png', fullPage: true, animations: 'disabled' });
    await page.setViewportSize({ width: 390, height: 844 });
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: 'test-results/research-summary-mobile.png', fullPage: true, animations: 'disabled' });
});

test('conflicting saves preserve the user edit and explain how to reload', async ({ page }) => {
    await mockResearch(page, { conflict: true });
    await page.goto(`/studies/${ids.study}/interviews/${ids.interview}`);
    await page.getByRole('tab', { name: 'Transcript' }).click();
    await page.getByLabel('What was said').fill('My unsaved correction');
    await page.getByTestId('research-save-transcript').click();
    await expect(page.getByText('A newer version was saved')).toBeVisible();
    await expect(page.getByLabel('What was said')).toHaveValue('My unsaved correction');
    await expect(page.getByText('Transcript saved.', { exact: true })).toHaveCount(0);
});


test('background summary resumes polling after reload and refreshes saved output', async ({ page }) => {
    await mockResearch(page);
    await page.goto(`/studies/${ids.study}/interviews/${ids.interview}`);
    await page.getByRole('button', { name: 'Generate summary', exact: true }).click();
    await expect(page.getByText('Queued. You can leave this page; the result will be saved here.')).toBeVisible();
    await page.reload();
    await expect(page.getByText('The prototype needs clearer delivery information.', { exact: true })).toBeVisible({ timeout: 10000 });
    await expect(page.getByRole('button', { name: 'Generate summary', exact: true })).toBeEnabled();
});

test('study synthesis displays only returned findings with links to source interviews', async ({ page }) => {
    await mockResearch(page);
    await page.goto(`/studies/${ids.study}`);
  await page.getByRole('tab', { name: 'Synthesis', exact: true }).click();
    await page.getByRole('button', { name: 'Compile overall findings' }).click();
    await expect(page.getByText('Delivery information needs a clearer place in the flow.')).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('Based on 1 interview summaries')).toBeVisible();
  await page.getByRole('tab', { name: 'Interviews', exact: true }).click();
    await expect(page.getByRole('link', { name: 'Session 01', exact: true })).toHaveAttribute('href', `/studies/${ids.study}/interviews/${ids.interview}`);
});


test('background completion cannot advance the revision attached to unsaved transcript edits', async ({ page }) => {
    const { patches } = await mockResearch(page);
    await page.goto(`/studies/${ids.study}/interviews/${ids.interview}`);
    await page.getByRole('button', { name: 'Generate summary', exact: true }).click();
    await page.getByRole('tab', { name: 'Transcript' }).click();
    await page.getByLabel('What was said').fill('A correction made while analysis is running');
    await expect(page.getByRole('button', { name: 'Generate summary', exact: true })).toBeVisible({ timeout: 10000 });
    await page.getByTestId('research-save-transcript').click();
    await expect(page.getByText('A newer version was saved')).toBeVisible();
    expect(patches[0]).toMatchObject({ research_revision: 2, transcript_revision: 1, summary_revision: 1 });
    await expect(page.getByLabel('What was said')).toHaveValue('A correction made while analysis is running');
});
