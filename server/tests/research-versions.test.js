const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const { PGlite } = require('@electric-sql/pglite');

const owner = '00000000-0000-4000-8000-000000000201';
const member = '00000000-0000-4000-8000-000000000202';
const outsider = '00000000-0000-4000-8000-000000000203';
let db, workspace, study, interview, preMigrationJob;
const taskId = '00000000-0000-4000-8000-000000000204';
const plan = { questions: ['Can users pay?'], hypotheses: ['Payment errors confuse users'],
    prototype: { name: 'Checkout', url: 'https://example.test', version: 'v2' },
    tasks: [{ id: taskId, title: 'Pay', instruction: 'Try to pay', success_criteria: 'Payment completes' }], guide: ['Ask neutrally'] };
async function rpc(name, args = []) {
    const placeholders = args.map((_, index) => `$${index + 1}`).join(',');
    return (await db.query(`SELECT public.${name}(${placeholders}) AS value`, args)).rows[0].value;
}
const one = async (sql, args = []) => (await db.query(sql, args)).rows[0];
before(async () => {
    db = new PGlite();
    const root = path.join(__dirname, '..');
    for (const name of ['tests/fixtures/research-schema.sql', 'migrations/20260924_research_core.sql', 'migrations/20260924_research_jobs.sql'])
        await db.exec(readFileSync(path.join(root, name), 'utf8'));
    await db.query('INSERT INTO auth.users(id) VALUES ($1),($2),($3)', [owner, member, outsider]);
    await db.query("INSERT INTO research_access_grants(user_id,expires_at) VALUES ($1,now()+interval '1 day')", [owner]);
    workspace = await rpc('research_bootstrap', [owner, 'Research']);
    await db.query("INSERT INTO workspace_members(workspace_id,user_id) VALUES ($1,$2)", [workspace.id, member]);
    study = await rpc('research_create_study', [owner, workspace.id, 'Study', 'Find payment friction', null]);
    interview = await rpc('research_create_interview', [owner, study.id, 'Legacy session']);
    await db.query('UPDATE interviews SET transcript_data=$1 WHERE id=$2', [JSON.stringify([{ id: 'old-id', speaker: 'User', timestamp: '00:00', text: 'Payment failed' },
        { speaker: 'User', timestamp: '00:05', text: 'I tried again' }]), interview.id]);
    preMigrationJob = await rpc('research_enqueue_analysis', [owner, 'interview_summary', study.id, interview.id]);
    await db.exec(readFileSync(path.join(root, 'migrations/20260924_research_versions.sql'), 'utf8'));
});
after(async () => db?.close());

test('backfill captures actual state once and assigns stable missing segment IDs', async () => {
    const s = await one('SELECT revision,context_revision,current_version_id,plan FROM research_studies WHERE id=$1', [study.id]);
    assert.equal(s.context_revision, s.revision);
    assert.ok(s.current_version_id);
    assert.deepEqual(s.plan.tasks, []);
    const versions = (await db.query('SELECT * FROM research_study_versions WHERE study_id=$1', [study.id])).rows;
    assert.equal(versions.length, 1);
    assert.equal(versions[0].goal, 'Find payment friction');
    const i = await one('SELECT transcript_data,current_transcript_version_id FROM interviews WHERE id=$1', [interview.id]);
    assert.equal(i.transcript_data[0].id, 'old-id');
    assert.match(i.transcript_data[1].id, /^[0-9a-f-]{36}$/);
    const tv = await one('SELECT * FROM research_transcript_versions WHERE id=$1', [i.current_transcript_version_id]);
    assert.equal(tv.origin, 'backfill');
    assert.deepEqual(tv.transcript_data, i.transcript_data);
    const historicalJob = await one('SELECT study_version_id,transcript_version_id,context_revision,status,pipeline_version FROM research_analysis_jobs WHERE id=$1', [preMigrationJob.id]);
    assert.equal(historicalJob.study_version_id, null);
    assert.equal(historicalJob.transcript_version_id, null);
    assert.equal(historicalJob.context_revision, null);
    assert.equal(historicalJob.status, 'stale');
    assert.equal(historicalJob.pipeline_version, 'research-v0-unpinned');
});

test('old CRUD records context versions; title-only change preserves pending analysis', async () => {
    const queued = await rpc('research_enqueue_analysis', [owner, 'interview_summary', study.id, interview.id]);
    const claimed = await rpc('research_claim_analysis');
    assert.equal(claimed.id, queued.id);
    const updated = await rpc('research_update_study', [owner, study.id, 0, 'New title', study.goal, null, false]);
    assert.equal(updated.context_revision, 0);
    assert.equal(updated.current_version_id, queued.study_version_id);
    const done = await rpc('research_finish_analysis', [claimed.id, claimed.claim_token, JSON.stringify({ summary: { generalInsight: 'Payment failed' } }), null]);
    assert.equal(done.status, 'completed');
    const contextChanged = await rpc('research_update_study', [owner, study.id, 1, 'New title', 'Find revised friction', 'New brief', false]);
    assert.equal(contextChanged.context_revision, 1);
    assert.notEqual(contextChanged.current_version_id, queued.study_version_id);
    assert.equal((await one('SELECT summary_stale FROM interviews WHERE id=$1', [interview.id])).summary_stale, true);
    assert.equal((await one('SELECT count(*)::int n FROM research_study_versions WHERE study_id=$1', [study.id])).n, 2);
});

test('structured plan validates tasks, preserves task IDs, and rejects stale edits', async () => {
    const current = await one('SELECT revision FROM research_studies WHERE id=$1', [study.id]);
    await assert.rejects(rpc('research_save_study_version', [outsider, study.id, current.revision, JSON.stringify(plan)]), /RESEARCH_NOT_FOUND/);
    const saved = await rpc('research_save_study_version', [member, study.id, current.revision, JSON.stringify(plan)]);
    assert.equal(saved.context_revision, 2);
    assert.equal(saved.plan.tasks[0].id, taskId);
    const task = await one('SELECT task_id,success_criteria FROM research_study_tasks WHERE version_id=$1', [saved.current_version_id]);
    assert.equal(task.task_id, taskId);
    assert.equal(task.success_criteria, 'Payment completes');
    await assert.rejects(rpc('research_save_study_version', [owner, study.id, current.revision, JSON.stringify(plan)]), /RESEARCH_CONFLICT/);
    const tooMany = { ...plan, tasks: Array.from({ length: 31 }, (_, n) => ({ ...plan.tasks[0], id: `00000000-0000-4000-8000-${String(n).padStart(12, '0')}` })) };
    await assert.rejects(rpc('research_save_study_version', [owner, study.id, saved.revision, JSON.stringify(tooMany)]), /RESEARCH_INVALID_INPUT/);
    await assert.rejects(rpc('research_save_study_version', [owner, study.id, saved.revision, JSON.stringify({ ...plan, questions: undefined })]), /RESEARCH_INVALID_INPUT/);
    await assert.rejects(rpc('research_save_study_version', [owner, study.id, saved.revision, JSON.stringify({ ...plan, prototype: { ...plan.prototype, url: 'file:///private' } })]), /RESEARCH_INVALID_INPUT/);
    await assert.rejects(db.query('UPDATE research_study_versions SET goal=$1 WHERE id=$2', ['Tamper', saved.current_version_id]), /RESEARCH_IMMUTABLE_VERSION/);
    await assert.rejects(db.query('DELETE FROM research_study_tasks WHERE version_id=$1', [saved.current_version_id]), /RESEARCH_IMMUTABLE_VERSION/);
});

test('legacy transcript writer captures edit, reuses IDs, and ignores ID-only changes', async () => {
    let i = await one('SELECT * FROM interviews WHERE id=$1', [interview.id]);
    const originalIds = i.transcript_data.map(line => line.id);
    const edited = i.transcript_data.map(({ id, ...line }, n) => ({ ...line, text: n ? 'I tried once more' : line.text }));
    let next = await rpc('research_update_interview', [member, interview.id, i.research_revision, i.transcript_revision, i.summary_revision, i.title, JSON.stringify(edited), false]);
    assert.deepEqual(next.transcript_data.map(line => line.id), originalIds);
    assert.equal(next.transcript_revision, i.transcript_revision + 1);
    const version = await one('SELECT origin,author_id,transcript_data FROM research_transcript_versions WHERE id=$1', [next.current_transcript_version_id]);
    assert.equal(version.origin, 'manual_edit');
    assert.equal(version.author_id, member);
    assert.deepEqual(version.transcript_data, next.transcript_data);
    const count = (await one('SELECT count(*)::int n FROM research_transcript_versions WHERE interview_id=$1', [interview.id])).n;
    const onlyIds = next.transcript_data.map((line, n) => ({ ...line, id: n ? 'invented-id' : line.id }));
    i = next;
    next = await rpc('research_update_interview', [owner, interview.id, i.research_revision, i.transcript_revision, i.summary_revision, i.title, JSON.stringify(onlyIds), false]);
    assert.equal(next.transcript_revision, i.transcript_revision);
    assert.equal((await one('SELECT count(*)::int n FROM research_transcript_versions WHERE interview_id=$1', [interview.id])).n, count);
    const withInsert = [{ speaker: 'User', timestamp: '00:00', text: 'New introduction' }, ...next.transcript_data];
    i = next;
    next = await rpc('research_update_interview', [owner, interview.id, i.research_revision, i.transcript_revision, i.summary_revision, i.title, JSON.stringify(withInsert), false]);
    assert.notEqual(next.transcript_data[0].id, originalIds[0]);
    assert.deepEqual(next.transcript_data.slice(1).map(line => line.id), originalIds);
});

test('participant assignment is scoped, optional, pseudonymous, and revision checked', async () => {
    const participant = await rpc('research_create_participant', [owner, study.id, 'Participant A']);
    assert.equal(participant.pseudonym, 'Participant A');
    const i = await one('SELECT research_revision FROM interviews WHERE id=$1', [interview.id]);
    await assert.rejects(rpc('research_assign_participant', [outsider, interview.id, participant.id, i.research_revision]), /RESEARCH_NOT_FOUND/);
    const assigned = await rpc('research_assign_participant', [member, interview.id, participant.id, i.research_revision]);
    assert.equal(assigned.research_participant_id, participant.id);
    await assert.rejects(rpc('research_assign_participant', [owner, interview.id, null, i.research_revision]), /RESEARCH_CONFLICT/);
    assert.equal((await rpc('research_assign_participant', [owner, interview.id, null, assigned.research_revision])).research_participant_id, null);
});

test('new version tables and functions are inaccessible to browser role', async () => {
    await db.exec('SET ROLE authenticated');
    try {
        await assert.rejects(db.query('SELECT * FROM research_study_versions'), /permission denied/i);
        await assert.rejects(db.query('SELECT * FROM research_transcript_versions'), /permission denied/i);
        await assert.rejects(rpc('research_save_study_version', [owner, study.id, 0, JSON.stringify(plan)]), /permission denied/i);
    } finally { await db.exec('RESET ROLE'); }
});

test('queued summary pins both context and transcript snapshots', async () => {
    const i = await one('SELECT transcript_data FROM interviews WHERE id=$1', [interview.id]);
    const queued = await rpc('research_enqueue_analysis', [owner, 'interview_summary', study.id, interview.id]);
    const claimed = await rpc('research_claim_analysis');
    assert.equal(claimed.id, queued.id);
    const s = await one('SELECT revision,goal,brief FROM research_studies WHERE id=$1', [study.id]);
    await rpc('research_update_study', [owner, study.id, s.revision, 'Study', `${s.goal} further`, s.brief, false]);
    const finished = await rpc('research_finish_analysis', [claimed.id, claimed.claim_token, JSON.stringify({ summary: { generalInsight: 'Old context' } }), null]);
    assert.equal(finished.status, 'stale');
    assert.deepEqual((await one('SELECT transcript_data FROM research_transcript_versions WHERE id=$1', [queued.transcript_version_id])).transcript_data, i.transcript_data);
});

test('worker claim accepts only implemented job kinds', async () => {
    await assert.rejects(rpc('research_claim_supported_analysis', [['transcription']]), /RESEARCH_INVALID_INPUT/);
    assert.equal(await rpc('research_claim_supported_analysis', [['interview_summary']]), null);
});
