import { test, expect } from '@playwright/test';
const ids = { user: '00000000-0000-4000-8000-000000000701', workspace: '00000000-0000-4000-8000-000000000702', study: '00000000-0000-4000-8000-000000000703', interview: '00000000-0000-4000-8000-000000000704', task: '00000000-0000-4000-8000-000000000705' };
async function fixture(page, {
  invite = false,
  workspaceName = 'Research team',
  taskTitle = 'Choose delivery',
  interviewsError = false,
  slowInitialWorkspaces = false,
  extraStudies = [],
  extraInterviews = [],
  studyVersions = [],
  transcriptVersions = [],
  synthesis = null,
  summaryJob = null,
  usage = {
    studies_used: 2,
    max_studies: 5,
    interviews_used: 4,
    max_interviews: 20,
    analyses_used: 3,
    max_analyses: 20,
    members_used: 1,
    max_members: 3,
    storage_bytes_used: 1048576,
    max_storage_bytes: 52428800,
    transcription_seconds_used: 120,
    max_transcription_seconds: 1800,
  },
} = {}) {
  const writes = [];
  let joined = !invite;
  let markInitialWorkspaceRead;
  const initialWorkspaceRead = new Promise(resolve => { markInitialWorkspaceRead = resolve; });
  let proposal = null, impact = null, activeSummaryJob = summaryJob;
  const task = { id: ids.task, title: taskTitle, instruction: 'Choose a delivery option', success_criteria: 'Delivery date is visible' };
  let study = { id: ids.study, workspace_id: ids.workspace, title: 'Delivery test', goal: 'Can people choose delivery?', revision: 1, context_revision: 1, current_version_id: 'context-v1',
    plan: { prototype: { name: 'Checkout', version: 'v1', url: '' }, questions: [], hypotheses: [], tasks: [task], guide: [] } };
  let studiesList = [study, ...extraStudies];
  let record = { id: ids.interview, study_id: ids.study, workspace_id: ids.workspace, title: 'Interview 1', status: 'completed', research_revision: 3, transcript_revision: 2, summary_revision: 1,
    current_transcript_version_id: 'transcript-v2', summary_source_job_id: 'summary-1', summary_stale: true,
    summary_data: { summary: { generalInsight: 'Delivery was found.' } }, transcript_data: [{ id: 'segment-1', speaker: 'Participant', timestamp: '00:02', text: 'I found the delivery date.' }] };
  let interviewsList = [record, ...extraInterviews];
  await page.addInitScript(user => {
    localStorage.setItem('research.locale', 'en');
    localStorage.setItem('sb-127-auth-token', JSON.stringify({ access_token: 'test', refresh_token: 'test', token_type: 'bearer', expires_at: Math.floor(Date.now() / 1000) + 3600, user: { id: user, email: 'research@example.test', aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {} } }));
  }, ids.user);
  await page.route('**/*', async route => {
    const request = route.request(); const url = new URL(request.url());
    if (url.hostname !== '127.0.0.1') return route.abort();
    if (url.port === '5399') return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
    if (!url.pathname.startsWith('/api/research')) return route.continue();
    const path = url.pathname.slice('/api/research'.length);
    const send = (data, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify({ status: 'success', data }) });
    if (request.method() !== 'GET') writes.push({ path, method: request.method(), body: request.postData() ? request.postDataJSON() : null });
    if (path.startsWith('/invites/') && path.endsWith('/accept')) { if (slowInitialWorkspaces) await initialWorkspaceRead; joined = true; return send({ workspace_id: ids.workspace }); }
    if (path === '/workspaces') {
      const data = joined ? [{ id: ids.workspace, name: workspaceName, role: 'owner' }] : [];
      if (slowInitialWorkspaces && !joined) {
        markInitialWorkspaceRead();
        await new Promise(resolve => setTimeout(resolve, 400));
      }
      return send(data);
    }
    if (path === '/studies') {
      if (request.method() === 'POST') {
        const body = request.postDataJSON();
        const created = { id: '00000000-0000-4000-8000-000000000799', workspace_id: ids.workspace, title: body.title, goal: body.goal, brief: body.brief || null, revision: 0, context_revision: 0, plan: { prototype: { name: '', version: '', url: '' }, questions: [], hypotheses: [], tasks: [], guide: [] } };
        studiesList = [created, ...studiesList];
        return send(created, 201);
      }
      return send(studiesList);
    }
    if (path === `/studies/${ids.study}`) {
      if (request.method() === 'DELETE') { studiesList = studiesList.filter(item => item.id !== ids.study); return send({ id: ids.study }); }
      return send(study);
    }
    if (/^\/studies\/[^/]+$/.test(path) && request.method() === 'GET') {
      const targetId = path.split('/').at(-1);
      return send(studiesList.find(item => item.id === targetId) || study);
    }
    if (path === `/studies/${ids.study}/interviews`) return interviewsError ? route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ status: 'error', code: 'TEMPORARY_FAILURE' }) }) : send(interviewsList);
    if (/^\/studies\/[^/]+\/interviews$/.test(path) && request.method() === 'GET') return send([]);
    if (path === `/studies/${ids.study}/versions` && request.method() === 'POST') {
      const body = request.postDataJSON(); study = { ...study, ...body, revision: 2, context_revision: 2, current_version_id: 'context-v2' }; return send(study);
    }
    if (/^\/studies\/[^/]+\/versions$/.test(path) && request.method() === 'POST') {
      const targetId = path.split('/')[2];
      const body = request.postDataJSON();
      studiesList = studiesList.map(item => item.id === targetId ? { ...item, ...body, revision: 1, context_revision: 1, current_version_id: 'context-copy-v1' } : item);
      return send(studiesList.find(item => item.id === targetId));
    }
    if (path === `/studies/${ids.study}/versions` && request.method() === 'GET') return send(studyVersions);
    if (path.startsWith(`/studies/${ids.study}/versions/`) && request.method() === 'GET') {
      const versionId = path.split('/').at(-1);
      return send(studyVersions.find(v => v.id === versionId) || studyVersions[0] || null);
    }
    if (path === `/studies/${ids.study}/brief-jobs`) {
      proposal = { id: 'proposal', status: 'completed', study_version_id: study.current_version_id, study_revision: study.revision, output: { goal: 'Observe delivery selection', brief: 'Proposed brief', plan: study.plan, assumptions: ['Prototype matches the planned flow'], questions: ['Which delivery options are in scope?'] } }; return send(proposal, 202);
    }
    if (path.endsWith('/preparation-job')) return send(proposal);
    if (path === `/interviews/${ids.interview}`) {
      if (request.method() === 'DELETE') { interviewsList = interviewsList.filter(item => item.id !== ids.interview); return send({ id: ids.interview }); }
      return send(record);
    }
    if (path === `/interviews/${ids.interview}/transcript-versions` && request.method() === 'GET') return send(transcriptVersions);
    if (path.startsWith(`/interviews/${ids.interview}/transcript-versions/`) && request.method() === 'GET') {
      const versionId = path.split('/').at(-1);
      return send(transcriptVersions.find(v => v.id === versionId) || { transcript_data: record.transcript_data });
    }
    if (path === `/interviews/${ids.interview}/summary-job`) return send(activeSummaryJob);
    if (path.startsWith('/jobs/') && path.endsWith('/cancel') && request.method() === 'POST') {
      activeSummaryJob = activeSummaryJob ? { ...activeSummaryJob, status: 'canceled' } : { id: 'job-1', status: 'canceled' };
      return send(activeSummaryJob);
    }
    if (path.startsWith('/jobs/') && request.method() === 'GET') return send(activeSummaryJob);
    if (path.endsWith('/impact-jobs')) { impact = { id: 'impact', status: 'completed', study_version_id: study.current_version_id, transcript_version_id: record.current_transcript_version_id, summary_revision: record.summary_revision, output: { decision: 'unaffected', reasons: ['The correction keeps the same observation'], sections: [], segment_ids: [] }, validation: { id: 'validation' } }; return send(impact, 202); }
    if (path.endsWith('/impact')) return send(impact);
    if (path.includes('/summary-validations/')) { record = { ...record, summary_stale: false, research_revision: 4 }; return send(record); }
    if (path.endsWith('/results')) return send({ tasks: [{ ...task, counts: { success: 1, partial: 0, failure: 0, not_attempted: 0, unknown: 1 }, attempts: 1, success_rate: 1, analyzed: 1, sessions: 2 }],
      coverage: { sessions: 2, linked_participants: 1, unlinked_sessions: 1, current_summaries: 1 },
      sessions: [{ id: ids.interview, title: record.title, evidence_revision: 1, tasks: [{ task_id: task.id, status: 'success', outcome: { id: 'outcome-1', task_id: task.id, transcript_version_id: record.current_transcript_version_id, segment_ids: ['segment-1'], reason: 'Participant found the date' } }] }] });
    if (path.includes('/transcript-versions/')) return send({ transcript_data: record.transcript_data });
    if (path.startsWith('/outcomes/')) return send({ id: 'outcome-2' });
    if (path.endsWith('/uploads') || path.endsWith('/participants') || path.endsWith('/transcript-versions') || path.endsWith('/versions')) return send([]);
    if (path.endsWith('/usage')) return send(usage);
    if (path.endsWith('/members')) return send([{ user_id: ids.user, role: 'owner' }]);
    if (path.endsWith('/invites')) return send(request.method() === 'GET' ? [] : { token: 'a'.repeat(64) });
    if (path.endsWith('/synthesis')) return send(synthesis);
    if (path.endsWith('-job')) return send(null);
    return route.fulfill({ status: 404, contentType: 'application/json', body: '{}' });
  });
  return writes;
}

test('shared criteria keep task IDs and save the exact version opened for editing', async ({ page }) => {
  const writes = await fixture(page);
  await page.goto(`/studies/${ids.study}`);
  await page.getByRole('button', { name: 'Edit plan', exact: true }).click();
  await page.getByRole('textbox', { name: 'Success criterion', exact: true }).fill('A delivery date and price are visible');
  await page.getByRole('textbox', { name: 'Success criterion', exact: true }).pressSequentially('.');
  await expect(page.getByRole('textbox', { name: 'Success criterion', exact: true })).toBeFocused();
  await page.getByRole('button', { name: 'Save plan version' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(writes[0].body.revision).toBe(1);
  expect(writes[0].body.plan.tasks[0]).toMatchObject({ id: ids.task, success_criteria: 'A delivery date and price are visible.' });
});

test('AI preparation remains a reviewable proposal until explicitly accepted', async ({ page }) => {
  const writes = await fixture(page);
  await page.goto(`/studies/${ids.study}`);
  await expect(page.getByTestId('research-inline-preparation')).toBeVisible();
  await expect(page.getByText('AI uses the current saved goal, brief and plan')).toHaveCount(0);
  await page.getByRole('button', { name: 'Prepare a study with AI' }).click();
  await expect(page.getByText('AI uses the current saved goal, brief and plan', { exact: false })).toBeVisible();
  await expect(page.getByLabel('What are you testing and what do you want to learn?')).toHaveCount(0);
  await page.getByRole('textbox', { name: 'Optional clarification answers' }).fill('Compare delivery options');
  await page.getByRole('button', { name: 'Propose a brief' }).click();
  await expect(page.getByText('Which delivery options are in scope?')).toBeVisible();
  expect(writes.find(write => write.path.endsWith('/brief-jobs')).body).toEqual({ answers: 'Compare delivery options' });
  expect(writes.filter(write => write.path.endsWith('/versions'))).toHaveLength(0);
  await page.getByRole('button', { name: 'Review and accept draft' }).click();
  await page.getByRole('textbox', { name: 'Study goal', exact: true }).fill('Observe shipping choices');
  await page.getByRole('button', { name: 'Save plan version' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(writes.at(-1).body).toMatchObject({ preparation_job_id: 'proposal', revision: 1, goal: 'Observe shipping choices' });
});

test('long labels and compact context stay readable without horizontal overflow', async ({ page }) => {
  const workspaceName = 'Research and customer experience team';
  const taskTitle = 'Choose a delivery option with an unusually long title that wraps across several lines on a narrow screen';
  await fixture(page, { workspaceName, taskTitle });
  await page.goto(`/studies/${ids.study}`);
  const workspace = page.getByTestId('research-workspace');
  await expect(workspace).toHaveAttribute('title', workspaceName);
  await expect.poll(() => workspace.evaluate(element => element.getBoundingClientRect().width)).toBeGreaterThan(255);
  await expect(page.getByTestId('research-study-counts')).toContainText('Interviews1');
  await expect(page.getByTestId('research-study-counts')).toContainText('Test tasks1');
  await expect(page.getByText('Study overview')).toHaveCount(0);
  await expect(page.getByText('Your next steps')).toHaveCount(0);
  const alignment = await page.evaluate(() => ({
    navigation: document.querySelector('.research-section-nav').getBoundingClientRect().left,
    context: document.querySelector('main .research-card').getBoundingClientRect().left,
  }));
  expect(Math.abs(alignment.navigation - alignment.context)).toBeLessThan(1);
  const heading = page.getByTestId('research-task-heading');
  await expect(heading).toBeVisible();
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const geometry = await page.evaluate(() => {
      const box = selector => document.querySelector(selector).getBoundingClientRect();
      const workspaceBox = box('[data-testid="research-workspace"]');
      const languageBox = box('[data-testid="research-language"]');
      const dot = box('[data-testid="research-preview-indicator"]');
      const label = box('[data-testid="research-preview-notice"] strong');
      const number = box('[data-testid="research-task-number"]');
      const title = box('[data-testid="research-task-heading"] span:last-child');
      return { workspace: workspaceBox.toJSON(), language: languageBox.toJSON(), dot: dot.toJSON(), label: label.toJSON(), number: number.toJSON(), title: title.toJSON() };
    });
    expect(geometry.workspace.right).toBeGreaterThan(geometry.language.right);
    expect(geometry.workspace.bottom).toBeLessThanOrEqual(geometry.language.top);
    expect(geometry.workspace.height).toBeGreaterThanOrEqual(44);
    expect(geometry.language.height).toBeGreaterThanOrEqual(44);
    expect(Math.abs(geometry.dot.y + geometry.dot.height / 2 - (geometry.label.y + geometry.label.height / 2))).toBeLessThanOrEqual(3);
    expect(Math.abs(geometry.number.y - geometry.title.y)).toBeLessThanOrEqual(2);
    expect(geometry.title.height).toBeGreaterThan(24);
    await page.locator('.research-section-nav a[href="#plan"]').click();
    await expect.poll(() => page.evaluate(() =>
      document.querySelector('#plan').getBoundingClientRect().top - document.querySelector('header').getBoundingClientRect().bottom
    )).toBeGreaterThanOrEqual(8);
  }
  await page.locator('.research-section-nav a[href="#results"]').click();
  await expect(page.locator('#results dl dd')).toHaveCount(4);
  const numberTops = await page.locator('#results dl dd').evaluateAll(items => items.map(element => element.getBoundingClientRect().top));
  expect(Math.abs(numberTops[0] - numberTops[1])).toBeLessThan(1);
  expect(Math.abs(numberTops[2] - numberTops[3])).toBeLessThan(1);
});

test('failed interview loading leaves the compact count unknown', async ({ page }) => {
  await fixture(page, { interviewsError: true });
  await page.goto(`/studies/${ids.study}`);
  await expect(page.getByTestId('research-error').first()).toBeVisible();
  await expect(page.getByTestId('research-study-counts')).toContainText('Interviews—');
});

test('impact confirmation is explicit and never regenerates a summary', async ({ page }) => {
  const writes = await fixture(page);
  await page.goto(`/studies/${ids.study}/interviews/${ids.interview}`);
  await page.getByRole('button', { name: 'Check impact' }).click();
  await expect(page.getByText('No material impact found')).toBeVisible();
  await expect(page.getByText('The source has changed', { exact: true }).first()).toBeVisible();
  await page.getByRole('button', { name: 'Confirm summary is current' }).click();
  await expect(page.getByRole('button', { name: 'Check impact' })).toHaveCount(0);
  expect(writes.map(write => write.path).some(path => path.endsWith('/summary-jobs'))).toBe(false);
  expect(writes.at(-1).body.research_revision).toBe(3);
});

test('results expose denominators and evidence; corrections preserve source and revision', async ({ page }) => {
  const writes = await fixture(page);
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto(`/studies/${ids.study}`);
  await page.getByRole('button', { name: 'Show results' }).click();
  await expect(page.getByText('Full success: 1 / 1 attempts (100%)')).toBeVisible();
  await expect(page.getByText('Unknown: 1 · Not attempted: 0 · Analyzed: 1 / 2 sessions')).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: 'test-results/research-results-desktop.png', fullPage: true, animations: 'disabled' });
  await page.getByRole('button', { name: 'Success', exact: true }).click();
  await expect(page.getByText('I found the delivery date.', { exact: true })).toBeVisible();
  await page.getByRole('combobox', { name: 'Outcome', exact: true }).selectOption('partial');
  await page.getByRole('textbox', { name: 'Reason', exact: true }).fill('Found the date after prompting');
  await page.getByRole('button', { name: 'Save correction' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(writes.at(-1).body).toMatchObject({ evidence_revision: 1, outcome: { status: 'partial', segment_ids: ['segment-1'] } });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(errors).toEqual([]);
});

test('invitation acceptance precedes workspace onboarding and token disappears from the URL', async ({ page }) => {
  const writes = await fixture(page, { invite: true, slowInitialWorkspaces: true });
  await page.goto(`/?invite=${'a'.repeat(64)}`);
  await expect(page.getByTestId('research-study-card')).toBeVisible();
  await expect(page).toHaveURL(/^http:\/\/127\.0\.0\.1:\d+\/$/);
  expect(writes.filter(write => write.path === '/bootstrap')).toHaveLength(0);
  expect(writes.filter(write => write.path.endsWith('/accept'))).toHaveLength(1);
});

test('long plan modal stays usable on mobile and protects unsaved edits on close', async ({ page }) => {
  const writes = await fixture(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/studies/${ids.study}`);
  await page.getByRole('button', { name: 'Edit plan', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('textbox', { name: 'Success criterion', exact: true }).fill('Updated but not saved');
  page.once('dialog', prompt => prompt.dismiss());
  await dialog.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('textbox', { name: 'Success criterion', exact: true })).toHaveValue('Updated but not saved');
  const box = await dialog.boundingBox();
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.y + box.height).toBeLessThanOrEqual(845);
  await dialog.getByRole('button', { name: 'Save plan version' }).scrollIntoViewIfNeeded();
  const actionHeights = await dialog.locator('.research-form-actions > button').evaluateAll(items => items.map(element => element.getBoundingClientRect().height));
  expect(Math.abs(actionHeights[0] - actionHeights[1])).toBeLessThan(1);
  await page.screenshot({ path: 'test-results/research-plan-modal-mobile.png' });
  page.once('dialog', prompt => prompt.accept());
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  expect(writes).toHaveLength(0);
});

test('result links open the comparison directly and a canceled correction does not write', async ({ page }) => {
  const writes = await fixture(page);
  await page.goto(`/studies/${ids.study}#results`);
  await expect(page.getByText('Full success: 1 / 1 attempts (100%)')).toBeVisible();
  await page.getByRole('button', { name: 'Success', exact: true }).click();
  await page.getByRole('textbox', { name: 'Reason', exact: true }).fill('An unsaved correction');
  page.once('dialog', prompt => prompt.accept());
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(writes).toHaveLength(0);
});

test('summary tabs support keyboard navigation and narrow layouts keep tools reachable', async ({ page }) => {
  await fixture(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/studies/${ids.study}/interviews/${ids.interview}`);
  await expect(page.getByRole('button', { name: 'Copy summary' })).toBeVisible();
  await page.getByRole('tab', { name: 'Summary', exact: true }).focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('tab', { name: 'Transcript', exact: true })).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('Home');
  await expect(page.getByText('Delivery was found.', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Sources and participant' }).click();
  await expect(page.getByRole('combobox', { name: 'Participant', exact: true })).toBeVisible();
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/research-interview-tools-mobile.png', fullPage: true });
});

test('new study dialog keeps keyboard focus and warns before browser navigation discards it', async ({ page }) => {
  await fixture(page);
  await page.goto(`/studies/${ids.study}`);
  await page.getByRole('link', { name: 'Research home', exact: true }).click();
  await page.getByTestId('research-new-study').click();
  await page.getByTestId('research-study-title').fill('Draft study');
  page.once('dialog', prompt => prompt.dismiss());
  await page.goBack();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByTestId('research-study-title')).toHaveValue('Draft study');
  await page.getByRole('button', { name: 'Close', exact: true }).focus();
  await page.keyboard.press('Shift+Tab');
  await expect(page.getByRole('dialog').getByRole('button', { name: 'Cancel', exact: true })).toBeFocused();
});

test('study search filters by title or goal and clears empty search state', async ({ page }) => {
  await fixture(page, {
    extraStudies: [{ id: '00000000-0000-4000-8000-000000000709', workspace_id: ids.workspace, title: 'Onboarding wizard', goal: 'Complete profile setup', revision: 2 }],
  });
  await page.goto('/');
  await expect(page.getByTestId('research-study-card')).toHaveCount(2);
  const search = page.getByTestId('research-study-search');
  await search.fill('profile setup');
  await expect(page.getByTestId('research-study-card')).toHaveCount(1);
  await expect(page.getByRole('heading', { name: 'Onboarding wizard' })).toBeVisible();
  await search.fill('nonexistent study query');
  await expect(page.getByTestId('research-study-card')).toHaveCount(0);
  await expect(page.getByText('No matching studies')).toBeVisible();
  await page.getByRole('button', { name: 'Clear search' }).click();
  await expect(search).toHaveValue('');
  await expect(page.getByTestId('research-study-card')).toHaveCount(2);
});

test('results and synthesis findings can be copied, and interviews or studies archive with revision checks', async ({ page }) => {
  await page.addInitScript(() => {
    window.__copiedTexts = [];
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: async (text) => { window.__copiedTexts.push(text); } },
    });
  });
  const writes = await fixture(page, {
    synthesis: {
      source_manifest: [{ id: ids.interview }],
      output: { findings: [{ text: 'Participants want clearer shipping dates.', source_ids: [ids.interview] }] },
    },
  });
  await page.goto(`/studies/${ids.study}#results`);
  await expect(page.getByTestId('research-copy-results')).toBeVisible();
  await page.getByTestId('research-copy-results').click();
  await expect(page.getByTestId('research-copy-results')).toContainText('Copied');
  await expect(page.getByTestId('research-copy-synthesis')).toBeVisible();
  await page.getByTestId('research-copy-synthesis').click();
  await expect(page.getByTestId('research-copy-synthesis')).toContainText('Copied');
  const copied = await page.evaluate(() => window.__copiedTexts);
  expect(copied[0]).toContain('Delivery test — Task comparison');
  expect(copied[0]).toContain('1. Choose delivery: Full success: 1 / 1 attempts (100%)');
  expect(copied[1]).toContain('Finding 1\nParticipants want clearer shipping dates.\n(Interview 1)');

  await page.goto(`/studies/${ids.study}/interviews/${ids.interview}`);
  await page.getByTestId('research-archive-interview').click();
  await expect(page.getByTestId('research-archive-interview-confirm')).toBeVisible();
  await page.getByTestId('research-confirm-archive-interview').click();
  await expect(page).toHaveURL(new RegExp(`/studies/${ids.study}$`));
  expect(writes.find(write => write.path === `/interviews/${ids.interview}` && write.method === 'DELETE')?.body).toEqual({
    research_revision: 3,
    transcript_revision: 2,
    summary_revision: 1,
  });

  await page.getByTestId('research-archive-study').click();
  await expect(page.getByTestId('research-archive-study-confirm')).toBeVisible();
  await page.getByTestId('research-confirm-archive-study').click();
  await expect(page).toHaveURL(/^http:\/\/127\.0\.0\.1:\d+\/$/);
  expect(writes.find(write => write.path === `/studies/${ids.study}` && write.method === 'DELETE')?.body).toEqual({
    revision: 1,
  });
});

test('interview search and status filtering narrow the session list and clear empty filters', async ({ page }) => {
  await fixture(page, {
    extraInterviews: [
      { id: '00000000-0000-4000-8000-000000000710', study_id: ids.study, workspace_id: ids.workspace, title: 'Onboarding interview', status: 'draft', summary_stale: false },
      { id: '00000000-0000-4000-8000-000000000711', study_id: ids.study, workspace_id: ids.workspace, title: 'Checkout session B', status: 'completed', summary_stale: false },
    ],
  });
  await page.goto(`/studies/${ids.study}`);
  await expect(page.getByTestId('research-interview-card')).toHaveCount(3);

  const filter = page.getByTestId('research-interview-filter');
  const search = page.getByTestId('research-interview-search');

  await filter.selectOption('stale');
  await expect(page.getByTestId('research-interview-card')).toHaveCount(1);
  await expect(page.getByRole('link', { name: 'Interview 1' })).toBeVisible();

  await filter.selectOption('draft');
  await expect(page.getByTestId('research-interview-card')).toHaveCount(1);
  await expect(page.getByRole('link', { name: 'Onboarding interview' })).toBeVisible();

  await filter.selectOption('all');
  await search.fill('Checkout');
  await expect(page.getByTestId('research-interview-card')).toHaveCount(1);
  await expect(page.getByRole('link', { name: 'Checkout session B' })).toBeVisible();

  await search.fill('nonexistent interview');
  await expect(page.getByTestId('research-interview-card')).toHaveCount(0);
  await expect(page.getByText('No matching studies')).toBeVisible();
  await page.getByRole('button', { name: 'Clear search' }).click();
  await expect(search).toHaveValue('');
  await expect(page.getByTestId('research-interview-card')).toHaveCount(3);
});

test('bulk transcript paste imports structured segments and version history restores to draft', async ({ page }) => {
  await fixture(page, {
    transcriptVersions: [
      {
        id: 'transcript-v1',
        transcript_revision: 1,
        created_at: '2026-09-20T10:00:00.000Z',
        transcript_data: [{ id: 'old-1', speaker: 'Moderator', timestamp: '00:01', text: 'Welcome to version 1' }],
      },
    ],
  });
  await page.goto(`/studies/${ids.study}/interviews/${ids.interview}`);
  await page.getByRole('button', { name: 'Sources and participant' }).click();
  await page.getByRole('button', { name: /Transcript · version 1/ }).click();
  await page.getByTestId('research-restore-transcript-version').click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('textarea').first()).toHaveValue('Welcome to version 1');

  await page.getByTestId('research-paste-transcript').click();
  await page.getByTestId('research-paste-transcript-input').fill('[00:10] Moderator: How was delivery?\n00:14 Participant — Very clear and fast.');
  await page.getByTestId('research-import-segments').click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('textarea').nth(1)).toHaveValue('How was delivery?');
  await expect(page.locator('textarea').nth(2)).toHaveValue('Very clear and fast.');
  await expect(page.getByTestId('research-save-transcript')).toBeEnabled();
});

test('study plan history restores an earlier version into the plan editor, workspace usage renders, and active AI jobs can be canceled', async ({ page }) => {
  const writes = await fixture(page, {
    studyVersions: [
      {
        id: 'context-v0',
        context_revision: 1,
        created_at: '2026-09-20T09:00:00.000Z',
        goal: 'Earlier study goal',
        brief: 'Earlier brief',
        plan: { prototype: { name: 'Old proto', version: 'v0', url: '' }, questions: ['Old question'], hypotheses: [], tasks: [], guide: [] },
      },
    ],
    summaryJob: { id: 'job-running-1', kind: 'interview_summary', status: 'running' },
  });
  await page.goto(`/studies/${ids.study}`);
  await page.getByRole('button', { name: 'Version history', exact: true }).click();
  await page.getByRole('button', { name: /Context · version 1/ }).click();
  await page.getByTestId('research-restore-plan-version').click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Prototype name', exact: true })).toHaveValue('Old proto');
  await expect(page.getByRole('textbox', { name: /What do we want to learn\?/ })).toHaveValue('Old question');
  await page.getByRole('dialog').getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);

  await page.getByRole('button', { name: 'Members', exact: true }).click();
  const usageBox = page.getByTestId('research-workspace-usage');
  await expect(usageBox).toBeVisible();
  await expect(usageBox).toContainText('2 / 5');
  await expect(usageBox).toContainText('4 / 20');
  await page.getByRole('dialog').getByRole('button', { name: 'Close', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);

  await page.goto(`/studies/${ids.study}/interviews/${ids.interview}`);
  await expect(page.getByTestId('research-cancel-job')).toBeVisible();
  await page.getByTestId('research-cancel-job').click();
  await expect(page.getByText('Analysis was canceled. You can run it again anytime.')).toBeVisible();
  expect(writes.some(write => write.path === '/jobs/job-running-1/cancel' && write.method === 'POST')).toBe(true);
});

test('results CSV, study synthesis Markdown, interview Markdown, and transcript CSV export cleanly with formula-injection protection', async ({ page }) => {
  await page.addInitScript(() => {
    window.__researchDownloads = [];
  });
  await fixture(page, {
    synthesis: {
      source_manifest: [{ id: ids.interview }],
      output: { findings: [{ text: 'Participants want clearer shipping dates.', source_ids: [ids.interview] }] },
    },
  });
  await page.goto(`/studies/${ids.study}#results`);
  await expect(page.getByTestId('research-export-results-csv')).toBeVisible();
  await page.getByTestId('research-export-results-csv').click();
  await expect(page.getByTestId('research-export-synthesis-md')).toBeVisible();
  await page.getByTestId('research-export-synthesis-md').click();

  const studyDownloads = await page.evaluate(() => window.__researchDownloads);
  expect(studyDownloads).toHaveLength(2);
  expect(studyDownloads[0].filename).toBe('delivery-test-task-results.csv');
  expect(studyDownloads[0].content).toContain('1. Choose delivery,1,0,0,0,1,1,100%,1,2');
  expect(studyDownloads[0].content).toContain('Interview 1,Success,Participant found the date');
  expect(studyDownloads[1].filename).toBe('delivery-test-report.md');
  expect(studyDownloads[1].content).toContain('# Delivery test');
  expect(studyDownloads[1].content).toContain('### Finding 1\n\nParticipants want clearer shipping dates.');

  await page.goto(`/studies/${ids.study}/interviews/${ids.interview}`);
  await expect(page.getByTestId('research-export-interview-md')).toBeVisible();
  await page.getByTestId('research-export-interview-md').click();

  await page.getByRole('tab', { name: 'Transcript', exact: true }).click();
  await page.locator('textarea').first().fill('=cmd|\'/C calc\'!A0');
  await expect(page.getByTestId('research-export-transcript-csv')).toBeVisible();
  await page.getByTestId('research-export-transcript-csv').click();

  const interviewDownloads = await page.evaluate(() => window.__researchDownloads);
  expect(interviewDownloads).toHaveLength(2);
  expect(interviewDownloads[0].filename).toBe('interview-1-summary.md');
  expect(interviewDownloads[0].content).toContain('# Interview 1');
  expect(interviewDownloads[0].content).toContain('Delivery was found.');
  expect(interviewDownloads[0].content).toContain('- [00:02] **Participant:** I found the delivery date.');
  expect(interviewDownloads[1].filename).toBe('interview-1-transcript.csv');
  expect(interviewDownloads[1].content).toContain("1,00:02,Participant,'=cmd|'/C calc'!A0");
});

test('duplicating a study plan creates a new study with cloned tasks and no previous interviews', async ({ page }) => {
  const writes = await fixture(page);
  await page.goto(`/studies/${ids.study}`);
  await page.getByTestId('research-duplicate-plan').click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByTestId('research-study-title')).toHaveValue('Delivery test (copy)');
  await page.getByTestId('research-study-title').fill('Delivery test v2');
  await page.getByTestId('research-study-save').click();
  await expect(page).toHaveURL(/\/studies\/00000000-0000-4000-8000-000000000799$/);
  await expect(page.getByRole('heading', { name: 'Delivery test v2' })).toBeVisible();
  await expect(page.getByTestId('research-study-counts')).toContainText('Interviews0');
  await expect(page.getByTestId('research-study-counts')).toContainText('Test tasks1');
  const planWrite = writes.find(write => write.path === '/studies/00000000-0000-4000-8000-000000000799/versions' && write.method === 'POST');
  expect(planWrite.body.plan.tasks).toHaveLength(1);
  expect(planWrite.body.plan.tasks[0].title).toBe('Choose delivery');
  expect(planWrite.body.plan.tasks[0].id).not.toBe(ids.task);
});






