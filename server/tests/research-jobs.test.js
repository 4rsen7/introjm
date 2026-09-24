const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const { PGlite } = require('@electric-sql/pglite');
const { parseSynthesis } = require('../modules/research/jobs/worker');
const { publicJob } = require('../modules/research/jobs/router');

const owner = '00000000-0000-4000-8000-000000000101';
const outsider = '00000000-0000-4000-8000-000000000102';
let db, workspace, study, interview;
async function rpc(name, args = []) {
    const placeholders = args.map((_, index) => `$${index + 1}`).join(',');
    return (await db.query(`SELECT public.${name}(${placeholders}) AS value`, args)).rows[0].value;
}
before(async () => {
    db = new PGlite();
    const root = path.join(__dirname, '..');
    for (const name of ['tests/fixtures/research-schema.sql', 'migrations/20260924_research_core.sql', 'migrations/20260924_research_jobs.sql'])
        await db.exec(readFileSync(path.join(root, name), 'utf8'));
    await db.query('INSERT INTO auth.users(id) VALUES ($1),($2)', [owner, outsider]);
    await db.query("INSERT INTO research_access_grants(user_id,expires_at,max_analyses) VALUES ($1,now()+interval '1 day',3)", [owner]);
    workspace = await rpc('research_bootstrap', [owner, 'Research']);
    study = await rpc('research_create_study', [owner, workspace.id, 'Checkout', 'Why did checkout fail?', 'Observe actual behavior']);
    interview = await rpc('research_create_interview', [owner, study.id, 'Session']);
    await db.query('UPDATE interviews SET transcript_data=$1 WHERE id=$2', [JSON.stringify([{ speaker: 'User', timestamp: '00:00', text: 'I could not pay' }]), interview.id]);
});
after(async () => db?.close());

test('enqueue is authorized, bounded and idempotent for a source revision', async () => {
    await assert.rejects(rpc('research_enqueue_analysis', [outsider, 'interview_summary', study.id, interview.id]), /RESEARCH_NOT_FOUND/);
    const first = await rpc('research_enqueue_analysis', [owner, 'interview_summary', study.id, interview.id]);
    const duplicate = await rpc('research_enqueue_analysis', [owner, 'interview_summary', study.id, interview.id]);
    assert.equal(first.id, duplicate.id);
    assert.equal((await db.query('SELECT count(*)::int n FROM research_analysis_jobs')).rows[0].n, 1);
    await db.query('UPDATE research_access_grants SET max_analyses=1 WHERE user_id=$1', [owner]);
    await db.query('UPDATE interviews SET transcript_revision=transcript_revision+1 WHERE id=$1', [interview.id]);
    await assert.rejects(rpc('research_enqueue_analysis', [owner, 'interview_summary', study.id, interview.id]), /RESEARCH_LIMIT_REACHED/);
    await db.query('UPDATE research_access_grants SET max_analyses=3 WHERE user_id=$1', [owner]);
});

test('lease fencing and revision guard retain stale output without overwriting summary', async () => {
    const claimed = await rpc('research_claim_analysis');
    assert.equal(claimed.status, 'running');
    assert.equal(await rpc('research_heartbeat_analysis', [claimed.id, claimed.claim_token]), true);
    await db.query("UPDATE research_analysis_jobs SET lease_until=now()-interval '1 second' WHERE id=$1", [claimed.id]);
    const reclaimed = await rpc('research_claim_analysis');
    assert.equal(reclaimed.id, claimed.id);
    assert.equal(reclaimed.attempts, 2);
    await assert.rejects(rpc('research_finish_analysis', [claimed.id, claimed.claim_token, '{}', null]), /RESEARCH_JOB_FENCED/);
    await db.query("UPDATE interviews SET transcript_data='[]',transcript_revision=transcript_revision+1 WHERE id=$1", [interview.id]);
    const finished = await rpc('research_finish_analysis', [reclaimed.id, reclaimed.claim_token, JSON.stringify({ summary: { generalInsight: 'Old input' } }), null]);
    assert.equal(finished.status, 'stale');
    assert.equal(finished.output.summary.generalInsight, 'Old input');
    assert.deepEqual((await db.query('SELECT summary_data FROM interviews WHERE id=$1', [interview.id])).rows[0].summary_data, {});
    await assert.rejects(rpc('research_finish_analysis', [claimed.id, claimed.claim_token, '{}', null]), /RESEARCH_JOB_FENCED/);
});

test('completed summary permits synthesis and source change stales synthesis', async () => {
    await db.query('UPDATE interviews SET transcript_data=$1 WHERE id=$2', [JSON.stringify([{ speaker: 'User', timestamp: '00:00', text: 'Payment failed' }]), interview.id]);
    const queued = await rpc('research_enqueue_analysis', [owner, 'interview_summary', study.id, interview.id]);
    const claimed = await rpc('research_claim_analysis');
    assert.equal(claimed.id, queued.id);
    const summary = { summary: { generalInsight: 'Payment failed' } };
    assert.equal((await rpc('research_finish_analysis', [claimed.id, claimed.claim_token, JSON.stringify(summary), null])).status, 'completed');
    assert.equal((await db.query('SELECT status FROM interviews WHERE id=$1', [interview.id])).rows[0].status, 'completed');
    const synthesis = await rpc('research_enqueue_analysis', [owner, 'study_synthesis', study.id, null]);
    assert.deepEqual(synthesis.source_manifest.map(source => source.id), [interview.id]);
    const synthesisClaim = await rpc('research_claim_analysis');
    assert.equal(synthesisClaim.id, synthesis.id);
    await db.query('UPDATE interviews SET summary_stale=true WHERE id=$1', [interview.id]);
    const final = await rpc('research_finish_analysis', [synthesis.id, synthesisClaim.claim_token, JSON.stringify({ findings: [{ text: 'Payment issue', source_ids: [interview.id] }] }), null]);
    assert.equal(final.status, 'stale');
});

test('browser role cannot read jobs or execute queue functions', async () => {
    await db.exec('SET ROLE authenticated');
    try {
        await assert.rejects(db.query('SELECT * FROM research_analysis_jobs'), /permission denied/i);
        await assert.rejects(rpc('research_claim_analysis'), /permission denied/i);
    } finally { await db.exec('RESET ROLE'); }
});

test('synthesis requires cited, known session IDs', () => {
    const sources = new Set([interview.id]);
    assert.deepEqual(parseSynthesis(JSON.stringify({ findings: [{ text: 'Payment issue', source_ids: [interview.id] }] }), sources).source_ids, [interview.id]);
    assert.throws(() => parseSynthesis(JSON.stringify({ findings: [{ text: 'Uncited', source_ids: [] }] }), sources), /source IDs/);
    assert.throws(() => parseSynthesis(JSON.stringify({ findings: [{ text: 'Invented', source_ids: [outsider] }] }), sources), /source IDs/);
});

test('enqueue response hides worker lease and output fields', () => {
    const safe = publicJob({ id: interview.id, status: 'running', claim_token: outsider, lease_until: new Date().toISOString(), output: { private: true } });
    assert.equal(safe.id, interview.id);
    assert.equal(safe.claim_token, undefined);
    assert.equal(safe.lease_until, undefined);
    assert.equal(safe.output, undefined);
});

test('failed provider calls back off and stop after three attempts', async () => {
    await db.query('UPDATE research_access_grants SET max_analyses=5 WHERE user_id=$1', [owner]);
    const queued = await rpc('research_enqueue_analysis', [owner, 'interview_summary', study.id, interview.id]);
    for (let attempt = 1; attempt <= 3; attempt++) {
        const claimed = await rpc('research_claim_analysis');
        assert.equal(claimed.id, queued.id);
        assert.equal(claimed.attempts, attempt);
        const failed = await rpc('research_finish_analysis', [claimed.id, claimed.claim_token, null, 'GENERATION_FAILED']);
        assert.equal(failed.status, attempt < 3 ? 'queued' : 'failed');
        if (attempt < 3) {
            assert.equal(await rpc('research_claim_analysis'), null);
            await db.query("UPDATE research_analysis_jobs SET available_at=now()-interval '1 second' WHERE id=$1", [queued.id]);
        }
    }
    assert.equal(await rpc('research_claim_analysis'), null);
});

test('expired access prevents an already queued paid call', async () => {
    const queued = await rpc('research_enqueue_analysis', [owner, 'interview_summary', study.id, interview.id]);
    await db.query("UPDATE research_access_grants SET expires_at=now()-interval '1 second' WHERE user_id=$1", [owner]);
    assert.equal(await rpc('research_claim_analysis'), null);
    const state = (await db.query('SELECT status,error_code FROM research_analysis_jobs WHERE id=$1', [queued.id])).rows[0];
    assert.deepEqual(state, { status: 'failed', error_code: 'ACCESS_REVOKED' });
});
