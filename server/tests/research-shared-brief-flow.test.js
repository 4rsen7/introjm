const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const { PGlite } = require('@electric-sql/pglite');

// Named disposable database: it exists only in memory and has no production connection.
const DATABASE_NAME = 'iterojm-research-shared-brief-test';
let db;
let legacy;
const plan = { questions: [], hypotheses: [], prototype: { name: '', url: '', version: '' }, tasks: [], guide: [] };
const one = async (sql, args = []) => (await db.query(sql, args)).rows[0];
const rpc = async (name, args = []) => (await one(`SELECT public.${name}(${args.map((_, index) => `$${index + 1}`).join(',')}) AS value`, args)).value;
const currentStudy = async id => one('SELECT * FROM research_studies WHERE id=$1', [id]);
const jobs = async (study, kind) => (await db.query('SELECT * FROM research_analysis_jobs WHERE study_id=$1 AND kind=$2 ORDER BY created_at,id', [study, kind])).rows;
const finish = async (job, output) => rpc('research_finish_analysis', [job.id, job.claim_token, JSON.stringify(output), null]);
async function study(status = 'confirmed') {
    const owner = randomUUID();
    await db.query('INSERT INTO auth.users(id) VALUES($1)', [owner]);
    await db.query("INSERT INTO research_access_grants(user_id,expires_at,max_analyses,max_studies,max_interviews) VALUES($1,now()+interval '1 day',100,100,100)", [owner]);
    const workspace = await rpc('research_bootstrap', [owner, DATABASE_NAME]);
    return { owner, study: await rpc('research_create_study_flow', [owner, workspace.id, 'Search', status === 'draft' ? '' : 'Evaluate search', null, status, JSON.stringify(plan)]) };
}
async function transcript(owner, studyId, title = 'Session') {
    const interview = await rpc('research_create_interview', [owner, studyId, title]);
    return rpc('research_update_interview', [owner, interview.id, interview.research_revision, interview.transcript_revision, interview.summary_revision,
        title, JSON.stringify([{ speaker: 'Doctor', text: `I understood ${title}.`, timestamp: '00:01' }]), false]);
}
async function drainSummaries() {
    const completed = [];
    let job;
    while ((job = await rpc('research_claim_supported_analysis', [['interview_summary']]))) {
        completed.push(await finish(job, { summary: { generalInsight: 'Search was clear' } }));
    }
    return completed;
}
before(async () => {
    db = new PGlite();
    await db.exec(readFileSync(path.join(__dirname, 'fixtures/research-schema.sql'), 'utf8'));
    await db.exec('ALTER TABLE auth.users ADD COLUMN email_confirmed_at timestamptz');
    for (const name of ['20260924_research_core', '20260924_research_jobs', '20260924_research_versions',
        '20260925_research_media', '20260926_research_intelligence', '20260927_research_capacity',
        '20260928_research_admin', '20260929_research_media_followthrough', '20260930_research_operations']) await db.exec(readFileSync(path.join(__dirname, '../migrations', `${name}.sql`), 'utf8'));
    const owner = randomUUID();
    await db.query('INSERT INTO auth.users(id) VALUES($1)', [owner]);
    await db.query("INSERT INTO research_access_grants(user_id,expires_at,max_analyses,max_studies,max_interviews) VALUES($1,now()+interval '1 day',100,100,100)", [owner]);
    const workspace = await rpc('research_bootstrap', [owner, DATABASE_NAME]);
    const existing = await rpc('research_create_study', [owner, workspace.id, 'Existing research', 'Evaluate search', 'Saved brief']);
    const interview = await transcript(owner, existing.id, 'Existing session');
    await rpc('research_enqueue_analysis', [owner, 'interview_summary', existing.id, interview.id]);
    await drainSummaries();
    await rpc('research_enqueue_analysis', [owner, 'study_synthesis', existing.id, null]);
    const aggregate = await rpc('research_claim_supported_analysis', [['study_synthesis']]);
    await finish(aggregate, { findings: [{ text: 'Existing finding', source_ids: [interview.id] }] });
    legacy = {
        study: await currentStudy(existing.id),
        interview: await one('SELECT * FROM interviews WHERE id=$1', [interview.id]),
        aggregate: await one('SELECT * FROM research_analysis_jobs WHERE id=$1', [aggregate.id]),
        versions: await one('SELECT count(*)::integer AS count FROM research_study_versions WHERE study_id=$1', [existing.id]),
    };
    await db.exec(readFileSync(path.join(__dirname, '../migrations/20260930_research_shared_brief_flow.sql'), 'utf8'));
});
after(async () => db?.close());

test('migration preserves an existing study, transcript, completed summary and aggregate', async () => {
    const migrated = await currentStudy(legacy.study.id);
    for (const key of Object.keys(legacy.study)) assert.deepEqual(migrated[key], legacy.study[key], `preserve study.${key}`);
    assert.equal(migrated.brief_status, 'confirmed');
    assert.equal(migrated.auto_context_revision, legacy.study.context_revision);
    assert.equal(migrated.flow_pending, false);
    assert.deepEqual(await one('SELECT * FROM interviews WHERE id=$1', [legacy.interview.id]), legacy.interview);
    assert.deepEqual(await one('SELECT * FROM research_analysis_jobs WHERE id=$1', [legacy.aggregate.id]), legacy.aggregate);
    assert.deepEqual(await one('SELECT count(*)::integer AS count FROM research_study_versions WHERE study_id=$1', [legacy.study.id]), legacy.versions);
});

test('draft batch pins every transcript and does not reserve summary before confirmation', async () => {
    const { owner, study: s } = await study('draft');
    const batch = await rpc('research_upload_batch', [owner, s.id, null]);
    const a = await transcript(owner, s.id, 'A');
    const b = await transcript(owner, s.id, 'B');
    assert.equal((await jobs(s.id, 'brief_preparation')).length, 0);
    await assert.rejects(rpc('research_enqueue_analysis', [owner, 'interview_summary', s.id, a.id]), /RESEARCH_BRIEF_REQUIRED/);
    await rpc('research_upload_batch', [owner, s.id, batch.batch_id]);
    const preparations = await jobs(s.id, 'brief_preparation');
    assert.equal(preparations.length, 1);
    assert.deepEqual(preparations[0].source_manifest.map(item => item.id).sort(), [a.id, b.id].sort());
    assert.equal((await jobs(s.id, 'interview_summary')).length, 0);
    const claimed = await rpc('research_claim_supported_analysis', [['brief_preparation']]);
    await finish(claimed, { goal: 'Evaluate search clarity', brief: 'Compare both screens', plan });
    const latest = await currentStudy(s.id);
    await rpc('research_save_brief', [owner, s.id, latest.revision, s.title, 'Evaluate search clarity', 'Compare both screens', JSON.stringify(plan), true, claimed.id]);
    assert.equal((await jobs(s.id, 'interview_summary')).length, 2);
    await drainSummaries();
    const aggregates = await jobs(s.id, 'study_synthesis');
    assert.equal(aggregates.length, 1);
    assert.equal(aggregates[0].source_manifest.length, 2);
});

test('current summaries and aggregate are reused without another paid job', async () => {
    const { owner, study: s } = await study();
    const i = await transcript(owner, s.id);
    await rpc('research_enqueue_analysis', [owner, 'interview_summary', s.id, i.id]);
    const [summary] = await drainSummaries();
    const aggregate = await rpc('research_claim_supported_analysis', [['study_synthesis']]);
    // A prior test may have left a different study's queued synthesis.
    if (aggregate.study_id !== s.id) {
        await finish(aggregate, { findings: [] });
    } else await finish(aggregate, { findings: [] });
    let pending;
    while ((pending = await rpc('research_claim_supported_analysis', [['study_synthesis']]))) await finish(pending, { findings: [] });
    assert.equal((await rpc('research_enqueue_analysis', [owner, 'interview_summary', s.id, i.id])).id, summary.id);
    const current = await currentStudy(s.id);
    assert.deepEqual((await rpc('research_refresh_results', [owner, s.id, current.revision])).jobs, []);
    assert.equal((await jobs(s.id, 'interview_summary')).length, 1);
    assert.equal((await jobs(s.id, 'study_synthesis')).length, 1);
});

test('brief edit blocks automatic results even without an earlier aggregate; explicit refresh enables it', async () => {
    const { owner, study: s } = await study();
    const changed = await rpc('research_save_brief', [owner, s.id, s.revision, s.title, 'Observe comprehension', null, JSON.stringify(plan), false, null]);
    assert.notEqual(changed.context_revision, changed.auto_context_revision);
    const batch = await rpc('research_upload_batch', [owner, s.id, null]);
    const i = await transcript(owner, s.id);
    await rpc('research_enqueue_analysis', [owner, 'interview_summary', s.id, i.id]);
    await rpc('research_upload_batch', [owner, s.id, batch.batch_id]);
    await drainSummaries();
    assert.equal((await jobs(s.id, 'study_synthesis')).length, 0);
    assert.equal((await currentStudy(s.id)).flow_pending, false);
    await rpc('research_refresh_results', [owner, s.id, changed.revision]);
    assert.equal((await jobs(s.id, 'study_synthesis')).length, 1);
    assert.equal((await jobs(s.id, 'interview_summary')).length, 1);
});

test('preparation cannot be accepted when an additional transcript changed its source set', async () => {
    const { owner, study: s } = await study('draft');
    await transcript(owner, s.id, 'First');
    await rpc('research_enqueue_intelligence', [owner, 'brief_preparation', s.id, null, '{}']);
    const claimed = await rpc('research_claim_supported_analysis', [['brief_preparation']]);
    await transcript(owner, s.id, 'Second');
    assert.equal((await finish(claimed, { goal: 'Proposal', brief: null, plan })).status, 'stale');
    await assert.rejects(rpc('research_save_brief', [owner, s.id, s.revision, s.title, 'Proposal', null, JSON.stringify(plan), true, claimed.id]), /RESEARCH_CONFLICT/);
});

test('terminal synthesis failure does not silently reserve another job', async () => {
    const { owner, study: s } = await study();
    const i = await transcript(owner, s.id);
    await rpc('research_enqueue_analysis', [owner, 'interview_summary', s.id, i.id]);
    await drainSummaries();
    await db.query("UPDATE research_analysis_jobs SET status='failed',error_code='ATTEMPTS_EXHAUSTED' WHERE study_id=$1 AND kind='study_synthesis'", [s.id]);
    await rpc('research_continue_flows');
    assert.equal((await jobs(s.id, 'study_synthesis')).length, 1);
    assert.equal((await currentStudy(s.id)).flow_error_code, 'ATTEMPTS_EXHAUSTED');
});

test('browser roles cannot invoke the durable coordinator or shared brief writers', async () => {
    for (const role of ['anon', 'authenticated']) {
        const privilege = await one("SELECT has_function_privilege($1,'public.research_continue_flows()','EXECUTE') AS allowed", [role]);
        assert.equal(privilege.allowed, false);
        assert.equal((await one("SELECT has_function_privilege($1,'public.research_refresh_results(uuid,uuid,integer)','EXECUTE') AS allowed", [role])).allowed, false);
    }
});

test('failed summary blocks a partial aggregate; explicit refresh retries only the failed source', async () => {
    const { owner, study: s } = await study();
    const a = await transcript(owner, s.id, 'Working');
    const b = await transcript(owner, s.id, 'Failed');
    await rpc('research_refresh_results', [owner, s.id, s.revision]);
    await db.query("UPDATE research_analysis_jobs SET status='failed',error_code='GENERATION_FAILED' WHERE interview_id=$1 AND kind='interview_summary'", [b.id]);
    await drainSummaries();
    await rpc('research_continue_flows');
    assert.equal((await jobs(s.id, 'study_synthesis')).length, 0);
    assert.equal((await currentStudy(s.id)).flow_error_code, 'GENERATION_FAILED');
    const goodCount = (await jobs(s.id, 'interview_summary')).filter(job => job.interview_id === a.id).length;
    const latest = await currentStudy(s.id);
    await rpc('research_refresh_results', [owner, s.id, latest.revision]);
    assert.equal((await jobs(s.id, 'interview_summary')).filter(job => job.interview_id === a.id).length, goodCount);
    assert.equal((await jobs(s.id, 'interview_summary')).filter(job => job.interview_id === b.id).length, 2);
});

for (const fails of [false, true]) test(`old aggregate ${fails ? 'failure' : 'completion'} cannot stop a newer upload batch`, async () => {
    await drainSummaries();
    let old;
    while ((old = await rpc('research_claim_supported_analysis', [['study_synthesis']]))) await finish(old, { findings: [] });
    const { owner, study: s } = await study();
    const a = await transcript(owner, s.id, 'First');
    await rpc('research_enqueue_analysis', [owner, 'interview_summary', s.id, a.id]);
    await drainSummaries();
    const aggregate = await rpc('research_claim_supported_analysis', [['study_synthesis']]);
    assert.equal(aggregate.study_id, s.id);
    const batch = await rpc('research_upload_batch', [owner, s.id, null]);
    const b = await transcript(owner, s.id, 'New');
    await rpc('research_enqueue_analysis', [owner, 'interview_summary', s.id, b.id]);
    await rpc('research_upload_batch', [owner, s.id, batch.batch_id]);
    if (fails) {
        await db.query('UPDATE research_analysis_jobs SET attempts=3 WHERE id=$1', [aggregate.id]);
        assert.equal((await rpc('research_finish_analysis', [aggregate.id, aggregate.claim_token, null, 'GENERATION_FAILED'])).status, 'failed');
    } else assert.equal((await finish(aggregate, { findings: [] })).status, 'completed');
    assert.equal((await currentStudy(s.id)).flow_pending, true);
    await drainSummaries();
    const aggregates = await jobs(s.id, 'study_synthesis');
    assert.equal(aggregates.length, 2);
    assert.ok(aggregates.some(job => job.source_manifest.length === 2));
});

test('draft recording requests a shared brief without charging an interview summary', async () => {
    const { owner, study: s } = await study('draft');
    const i = await rpc('research_create_interview', [owner, s.id, 'Recording']);
    const asset = await rpc('research_begin_upload', [owner, i.id, 100, true]);
    await rpc('research_finalize_upload', [owner, asset.id, 90, 'a'.repeat(64), 'audio/mpeg', 10, true]);
    const job = await rpc('research_claim_supported_analysis', [['media_transcription']]);
    await rpc('research_finish_media_analysis', [job.id, job.claim_token, JSON.stringify([{ text: 'I understand search', speaker: 'Doctor', timestamp: '00:01' }]), '{}']);
    assert.equal((await jobs(s.id, 'interview_summary')).length, 0);
    assert.equal((await currentStudy(s.id)).flow_pending, true);
    await rpc('research_continue_flows');
    assert.equal((await jobs(s.id, 'brief_preparation')).length, 1);
});
