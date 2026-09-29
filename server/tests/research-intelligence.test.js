const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const { PGlite } = require('@electric-sql/pglite');
const { parseEvidence, deterministicImpact, parseImpact } = require('../modules/research/intelligence');
const { studyResults } = require('../modules/research/analytics');
const { partition } = require('../modules/research/synthesis');
const owner = '00000000-0000-4000-8000-000000000601';
const other = '00000000-0000-4000-8000-000000000602';
const taskId = '00000000-0000-4000-8000-000000000603';
let db, study, workspace, interview;
const one = async (query, params = []) => (await db.query(query, params)).rows[0];
const rpc = async (name, values = []) => (await one(`SELECT public.${name}(${values.map((_, i) => `$${i + 1}`).join(',')}) AS data`, values)).data;
const latestInterview = async () => one('SELECT * FROM interviews WHERE id=$1', [interview.id]);
const finish = async (job, output) => rpc('research_finish_analysis', [job.id, job.claim_token, JSON.stringify(output), null]);
before(async () => {
    db = new PGlite();
    for (const name of ['tests/fixtures/research-schema.sql', ...['20260924_research_core', '20260924_research_jobs', '20260924_research_versions', '20260925_research_media', '20260926_research_intelligence', '20260927_research_capacity'].map(name => `migrations/${name}.sql`)])
        await db.exec(readFileSync(path.join(__dirname, '..', name), 'utf8'));
    await db.query('INSERT INTO auth.users(id) VALUES ($1),($2)', [owner, other]);
    await db.query("INSERT INTO research_access_grants(user_id,expires_at,max_analyses) VALUES ($1,now()+interval '1 day',100)", [owner]);
    workspace = await rpc('research_bootstrap', [owner, 'Research']);
    study = await rpc('research_create_study', [owner, workspace.id, 'Checkout', 'Can users pay?', null]);
    study = await rpc('research_save_study_version', [owner, study.id, study.revision, JSON.stringify({ ...study.plan, tasks: [{ id: taskId, title: 'Pay', instruction: 'Complete checkout', success_criteria: 'Confirmation appears' }] })]);
    interview = await rpc('research_create_interview', [owner, study.id, 'Session']);
    await db.query('UPDATE interviews SET transcript_data=$1 WHERE id=$2', [JSON.stringify([{ id: 'segment-1', speaker: 'User', timestamp: '00:01', text: 'It failed.' }]), interview.id]);
});
after(async () => db?.close());

test('draft generation is scoped, deduplicated and accepted explicitly with conflict checking', async () => {
    await assert.rejects(rpc('research_enqueue_intelligence', [other, 'brief_preparation', study.id, null, '{}']), /RESEARCH_NOT_FOUND/);
    const job = await rpc('research_enqueue_intelligence', [owner, 'brief_preparation', study.id, null, '{"description":"Test payment"}']);
    assert.equal((await rpc('research_enqueue_intelligence', [owner, 'brief_preparation', study.id, null, '{"description":"Test payment"}'])).id, job.id);
    const claimed = await rpc('research_claim_supported_analysis', [['brief_preparation']]);
    const output = { goal: 'Observe checkout completion', brief: 'A draft', plan: study.plan, questions: [], assumptions: [] };
    assert.equal((await finish(claimed, output)).status, 'completed');
    assert.equal((await one('SELECT goal FROM research_studies WHERE id=$1', [study.id])).goal, study.goal);
    await assert.rejects(rpc('research_accept_preparation', [owner, study.id, job.id, 999, output.goal, output.brief, JSON.stringify(output.plan)]), /RESEARCH_CONFLICT/);
    study = await rpc('research_accept_preparation', [owner, study.id, job.id, study.revision, output.goal, output.brief, JSON.stringify(output.plan)]);
    assert.equal(study.goal, output.goal);
});

test('summary provenance remains original after accumulated transcript edits and accepted validation', async () => {
    await rpc('research_enqueue_analysis', [owner, 'interview_summary', study.id, interview.id]);
    const summaryJob = await rpc('research_claim_supported_analysis', [['interview_summary']]);
    await finish(summaryJob, { summary: { generalInsight: 'Payment failed' } });
    const source = await latestInterview();
    assert.equal(source.summary_source_job_id, summaryJob.id);
    for (const text of ['It failed twice.', 'Payment failed twice.']) await db.query('UPDATE interviews SET transcript_data=$1 WHERE id=$2', [JSON.stringify([{ ...source.transcript_data[0], text }]), interview.id]);
    const impact = await rpc('research_enqueue_intelligence', [owner, 'transcript_impact', study.id, interview.id, '{}']);
    assert.equal(impact.settings.original_transcript_version_id, summaryJob.transcript_version_id);
    const claimed = await rpc('research_claim_supported_analysis', [['transcript_impact']]);
    await finish(claimed, { decision: 'unaffected', reasons: ['Same observation'], sections: [], segment_ids: [] });
    const validation = await one('SELECT * FROM research_summary_validations WHERE job_id=$1', [impact.id]);
    const current = await latestInterview();
    assert.equal(current.summary_stale, true);
    const accepted = await rpc('research_accept_summary_validation', [owner, interview.id, validation.id, current.research_revision]);
    assert.equal(accepted.summary_stale, false);
    assert.equal(accepted.summary_source_job_id, summaryJob.id);
    assert.equal((await rpc('research_synthesis_sources', [study.id]))[0].validation_id, validation.id);
    await db.query('UPDATE interviews SET transcript_data=$1 WHERE id=$2', [JSON.stringify([{ ...source.transcript_data[0], text: 'Actually payment succeeded.' }]), interview.id]);
    await assert.rejects(rpc('research_accept_summary_validation', [owner, interview.id, validation.id, (await latestInterview()).research_revision]), /RESEARCH_CONFLICT/);
});

test('late impact cannot approve a newer transcript and context edits require a fresh summary', async () => {
    await rpc('research_enqueue_intelligence', [owner, 'transcript_impact', study.id, interview.id, '{}']);
    const claimed = await rpc('research_claim_supported_analysis', [['transcript_impact']]);
    await db.query('UPDATE interviews SET transcript_data=$1 WHERE id=$2', [JSON.stringify([{ ...(await latestInterview()).transcript_data[0], text: 'It did not succeed.' }]), interview.id]);
    assert.equal((await finish(claimed, { decision: 'unaffected', reasons: [], sections: [], segment_ids: [] })).status, 'stale');
    assert.equal(await one('SELECT id FROM research_summary_validations WHERE job_id=$1', [claimed.id]), undefined);
    study = await rpc('research_update_study', [owner, study.id, study.revision, study.title, 'Can users understand checkout?', study.brief, false]);
    await assert.rejects(rpc('research_enqueue_intelligence', [owner, 'transcript_impact', study.id, interview.id, '{}']), /RESEARCH_CONTEXT_CHANGED/);
});

test('evidence covers each task, validates segments, retains corrections and rejects concurrent edits', async () => {
    const i = await latestInterview();
    await rpc('research_enqueue_intelligence', [owner, 'interview_evidence', study.id, interview.id, '{}']);
    const job = await rpc('research_claim_supported_analysis', [['interview_evidence']]);
    const outcome = { task_id: taskId, status: 'failure', reason: 'Checkout failed', segment_ids: [i.transcript_data[0].id] };
    await assert.rejects(finish(job, { outcomes: [{ ...outcome, segment_ids: ['invented'] }] }), /RESEARCH_INVALID_INPUT/);
    await finish(job, { outcomes: [outcome] });
    const snapshot = await rpc('research_results_snapshot', [owner, study.id]);
    assert.equal(studyResults(snapshot).tasks[0].counts.failure, 1);
    const record = snapshot.outcomes[0];
    const rev = snapshot.interviews[0].evidence_revision;
    const corrected = await rpc('research_correct_outcome', [owner, record.id, rev, JSON.stringify({ ...outcome, status: 'partial', reason: 'The user reached the final step' })]);
    assert.equal(corrected.author_id, owner);
    assert.equal(corrected.supersedes_id, record.id);
    await assert.rejects(rpc('research_correct_outcome', [owner, record.id, rev, JSON.stringify(outcome)]), /RESEARCH_CONFLICT/);
    assert.equal(studyResults(await rpc('research_results_snapshot', [owner, study.id])).tasks[0].counts.partial, 1);
    assert.equal((await one('SELECT count(*)::int n FROM research_task_outcomes')).n, 2);
    await assert.rejects(rpc('research_results_snapshot', [other, study.id]), /RESEARCH_NOT_FOUND/);
});

test('capacity blocks a busy workspace while another workspace progresses; provider budget is fenced', async () => {
    await rpc('research_enqueue_intelligence', [owner, 'guide_preparation', study.id, null, '{}']);
    const first = await rpc('research_claim_supported_analysis', [['guide_preparation']]);
    await rpc('research_enqueue_intelligence', [owner, 'brief_preparation', study.id, null, '{}']);
    assert.equal(await rpc('research_claim_supported_analysis', [['brief_preparation']]), null);
    assert.equal(await rpc('research_provider_call', [first.id, first.claim_token, 400]), true);
    await assert.rejects(rpc('research_provider_call', [first.id, other, 1]), /RESEARCH_JOB_FENCED/);
    await assert.rejects(rpc('research_provider_call', [first.id, first.claim_token, 300001]), /RESEARCH_AI_BUDGET/);
    await db.query('UPDATE research_worker_limits SET max_workspace_pending=2');
    await assert.rejects(rpc('research_enqueue_intelligence', [owner, 'brief_preparation', study.id, null, '{"description":"new"}']), /RESEARCH_QUEUE_FULL/);
    await db.query("UPDATE research_analysis_jobs SET status='canceled',claim_token=NULL,lease_until=NULL WHERE status IN ('queued','running')");
});

test('critical edits cannot receive an unaffected decision; whitespace uses no model', () => {
    const before = [{ id: 'a', text: 'I did not pay 20.', speaker: 'User', timestamp: '00:01' }];
    assert.equal(deterministicImpact(before, [{ ...before[0], text: ' I  did not pay 20. ' }]).decision, 'unaffected');
    for (const after of [[{ ...before[0], text: 'I did pay 20.' }], [{ ...before[0], text: 'I did not pay 200.' }], [{ ...before[0], speaker: 'Interviewer' }], []]) {
        assert.equal(parseImpact(JSON.stringify({ decision: 'unaffected', reasons: ['No impact'], sections: [], segment_ids: [] }), before, after).decision, 'uncertain');
    }
    const tasks = [{ id: taskId }];
    assert.throws(() => parseEvidence('{"outcomes":[]}', tasks, before));
    assert.throws(() => parseEvidence(JSON.stringify({ outcomes: [{ task_id: taskId, status: 'failure', reason: 'No observation', segment_ids: [] }] }), tasks, before));
});

test('analytics distinguishes missing observations, repeated people and stale criteria', () => {
    const s = { current_version_id: 'v2', plan: { tasks: [{ id: 'task' }] } };
    const sessions = ['a', 'b', 'c'].map(id => ({ id, evidence_job_id: id, current_transcript_version_id: 't', research_participant_id: id === 'c' ? null : 'same-person' }));
    const outcomes = ['a', 'b', 'c'].map((id, n) => ({ interview_id: id, job_id: id, task_id: 'task', transcript_version_id: 't', study_version_id: n === 2 ? 'old' : 'v2', status: n === 1 ? 'partial' : 'success', revision: 0 }));
    const results = studyResults({ study: s, interviews: sessions, outcomes });
    assert.equal(results.tasks[0].success_rate, 0.5);
    assert.equal(results.tasks[0].attempts, 2);
    assert.equal(results.tasks[0].counts.unknown, 1);
    assert.equal(results.coverage.linked_participants, 1);
    assert.equal(studyResults({ study: s, interviews: sessions, outcomes: [] }).tasks[0].success_rate, null);
    assert.throws(() => partition([{ text: 'x'.repeat(50000) }]), /budget/);
});
