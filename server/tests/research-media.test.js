const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const { PGlite } = require('@electric-sql/pglite');
const { Readable } = require('node:stream');
const { createHash } = require('node:crypto');
const { downloadBounded, sniffMime, BUCKET, runMediaTranscriptionJob } = require('../modules/research/media');

const owner = '00000000-0000-4000-8000-000000000301';
const outsider = '00000000-0000-4000-8000-000000000302';
let db, workspace, study, interview;
const sha = 'a'.repeat(64);
async function rpc(name, args = []) {
    const placeholders = args.map((_, index) => `$${index + 1}`).join(',');
    return (await db.query(`SELECT public.${name}(${placeholders}) AS value`, args)).rows[0].value;
}
const one = async (sql, args = []) => (await db.query(sql, args)).rows[0];
before(async () => {
    db = new PGlite();
    const root = path.join(__dirname, '..');
    for (const name of ['tests/fixtures/research-schema.sql', 'migrations/20260924_research_core.sql', 'migrations/20260924_research_jobs.sql',
        'migrations/20260924_research_versions.sql', 'migrations/20260925_research_media.sql'])
        await db.exec(readFileSync(path.join(root, name), 'utf8'));
    await db.query('INSERT INTO auth.users(id) VALUES ($1),($2)', [owner, outsider]);
    await db.query("INSERT INTO research_access_grants(user_id,expires_at,max_storage_bytes,max_transcription_seconds) VALUES ($1,now()+interval '1 day',2000,100)", [owner]);
    workspace = await rpc('research_bootstrap', [owner, 'Research']);
    study = await rpc('research_create_study', [owner, workspace.id, 'Study', 'Test checkout', null]);
    interview = await rpc('research_create_interview', [owner, study.id, 'Session']);
});
after(async () => db?.close());

test('upload reserves bytes atomically and uses isolated incoming/sealed keys', async () => {
    await assert.rejects(rpc('research_begin_upload', [outsider, interview.id, 100, false]), /RESEARCH_NOT_FOUND/);
    const asset = await rpc('research_begin_upload', [owner, interview.id, 700, false]);
    assert.notEqual(asset.upload_key, asset.object_key);
    assert.match(asset.upload_key, /incoming/);
    assert.match(asset.object_key, /sealed/);
    await assert.rejects(rpc('research_begin_upload', [owner, interview.id, 301, false]), /RESEARCH_LIMIT_REACHED/);
    await assert.rejects(db.query('UPDATE research_source_assets SET object_key=$1 WHERE id=$2', ['changed', asset.id]), /RESEARCH_IMMUTABLE_ASSET/);
    await rpc('research_cancel_upload', [owner, asset.id]);
    await assert.rejects(rpc('research_begin_upload', [owner, interview.id, 301, false]), /RESEARCH_LIMIT_REACHED/);
    await db.query("UPDATE research_source_assets SET created_at=now()-interval '26 hours' WHERE id=$1", [asset.id]);
    assert.equal(await rpc('research_mark_media_deleting', [asset.id]), true);
    assert.equal(await rpc('research_confirm_media_deleted', [asset.id]), true);
    assert.equal((await rpc('research_begin_upload', [owner, interview.id, 301, false])).reserved_bytes, 602);
});

test('verified finalize reserves duration once and creates a pinned media job', async () => {
    const asset = await rpc('research_begin_upload', [owner, interview.id, 100, true]);
    const first = await rpc('research_finalize_upload', [owner, asset.id, 90, sha, 'audio/mpeg', 40, true]);
    const repeated = await rpc('research_finalize_upload', [owner, asset.id, 90, sha, 'audio/mpeg', 40, true]);
    assert.equal(first.job.id, repeated.job.id);
    assert.equal(first.job.kind, 'media_transcription');
    assert.equal(first.job.settings.asset_id, asset.id);
    assert.ok(first.job.study_version_id && first.job.transcript_version_id);
    assert.equal((await one('SELECT transcription_seconds_reserved FROM research_source_assets WHERE id=$1', [asset.id])).transcription_seconds_reserved, 40);
    assert.equal(await rpc('research_claim_analysis'), null);
    const claimed = await rpc('research_claim_supported_analysis', [['media_transcription']]);
    assert.equal(claimed.id, first.job.id);
    const done = await rpc('research_finish_media_analysis', [claimed.id, claimed.claim_token,
        JSON.stringify([{ speaker: 'User', timestamp: '00:00', text: 'Payment failed' }]), JSON.stringify({ provider: 'mock' })]);
    assert.equal(done.status, 'completed');
    const saved = await one('SELECT transcript_revision,current_transcript_version_id,status FROM interviews WHERE id=$1', [interview.id]);
    assert.equal(saved.transcript_revision, 1);
    assert.equal(saved.status, 'completed');
    assert.equal(done.output.transcript_version_id, saved.current_transcript_version_id);
    await assert.rejects(rpc('research_finish_media_analysis', [claimed.id, claimed.claim_token, '[]', '{}']), /RESEARCH_JOB_FENCED/);
});

test('duration budget persists after cancel; source edits fence old media output', async () => {
    const asset = await rpc('research_begin_upload', [owner, interview.id, 90, false]);
    const queued = await rpc('research_finalize_upload', [owner, asset.id, 80, sha, 'audio/mpeg', 50, false]);
    const claimed = await rpc('research_claim_supported_analysis', [['media_transcription']]);
    assert.equal(claimed.id, queued.job.id);
    await db.query("UPDATE interviews SET transcript_data='[{\"speaker\":\"User\",\"timestamp\":\"00:00\",\"text\":\"New edit\"}]' WHERE id=$1", [interview.id]);
    const stale = await rpc('research_finish_media_analysis', [claimed.id, claimed.claim_token,
        JSON.stringify([{ speaker: 'User', timestamp: '00:00', text: 'Old audio' }]), '{}']);
    assert.equal(stale.status, 'stale');
    const canceled = await rpc('research_cancel_upload', [owner, asset.id]);
    assert.equal(canceled.status, 'canceled');
    const next = await rpc('research_begin_upload', [owner, interview.id, 70, false]);
    await assert.rejects(rpc('research_finalize_upload', [owner, next.id, 60, sha, 'audio/mpeg', 11, false]), /RESEARCH_LIMIT_REACHED/);
});

test('expired pending assets release storage and cannot be finalized', async () => {
    const asset = await rpc('research_begin_upload', [owner, interview.id, 200, false]);
    await db.query("UPDATE research_source_assets SET expires_at=now()-interval '1 second' WHERE id=$1", [asset.id]);
    assert.equal(await rpc('research_expire_uploads'), 1);
    assert.equal((await one('SELECT status,reserved_bytes FROM research_source_assets WHERE id=$1', [asset.id])).reserved_bytes, 400);
    await assert.rejects(rpc('research_finalize_upload', [owner, asset.id, 100, sha, 'audio/mpeg', 10, false]), /RESEARCH_CONFLICT/);
    await db.query("UPDATE research_source_assets SET created_at=now()-interval '26 hours' WHERE id=$1", [asset.id]);
    assert.equal(await rpc('research_mark_media_deleting', [asset.id]), true);
    assert.equal(await rpc('research_confirm_media_deleted', [asset.id]), true);
    assert.equal((await one('SELECT reserved_bytes FROM research_source_assets WHERE id=$1', [asset.id])).reserved_bytes, 0);
});

test('media handler verifies sealed bytes and finishes through fenced SQL with a mocked provider', async () => {
    const bytes = Buffer.from('ID3recording');
    const digest = createHash('sha256').update(bytes).digest('hex');
    const asset = await rpc('research_begin_upload', [owner, interview.id, bytes.length, false]);
    const queued = await rpc('research_finalize_upload', [owner, asset.id, bytes.length, digest, 'audio/mpeg', 5, false]);
    const claimed = await rpc('research_claim_supported_analysis', [['media_transcription']]);
    assert.equal(claimed.id, queued.job.id);
    const mockDb = {
        from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: await one('SELECT * FROM research_source_assets WHERE id=$1', [asset.id]), error: null }) }) }) }),
        rpc: async (name, args) => name === 'research_provider_call' ? ({data:true}) : ({ data: await rpc(name, name === 'research_finish_media_analysis'
            ? [args.p_job_id, args.p_claim_token, JSON.stringify(args.p_transcript), JSON.stringify(args.p_provider)]
            : [args.p_job_id, args.p_claim_token, args.p_error_code]), error: null }),
    };
    const storage = { downloadStream: async (bucket, key) => {
        assert.equal(bucket, BUCKET);
        assert.equal(key, asset.object_key);
        return Readable.from([bytes]);
    } };
    const transcriptionService = {
        prepareInterviewUploadForTranscription: async file => file,
        transcribeAudioWithProviderFallback: async () => ({ transcript: [{ speaker: 'User', timestamp: '00:00', text: 'It worked' }], systemState: { provider: 'mock', model: 'fixture' } }),
    };
    const done = await runMediaTranscriptionJob({ db: mockDb, storage, job: claimed, transcriptionService, logger: { warn() {} } });
    assert.equal(done.status, 'completed');
    assert.equal(done.output.provider.provider, 'mock');
});

test('browser cannot read asset rows or execute media writers', async () => {
    await db.exec('SET ROLE authenticated');
    try {
        await assert.rejects(db.query('SELECT * FROM research_source_assets'), /permission denied/i);
        await assert.rejects(rpc('research_begin_upload', [owner, interview.id, 10, false]), /permission denied/i);
    } finally { await db.exec('RESET ROLE'); }
});

test('bounded stream read rejects oversized objects before buffering them', async () => {
    const storage = { downloadStream: async (bucket, key) => {
        assert.equal(bucket, BUCKET);
        return Readable.from([Buffer.from('ID3'), Buffer.alloc(30)]);
    } };
    const temp = path.join('/tmp', `research-media-test-${process.pid}`);
    await assert.rejects(downloadBounded(storage, 'object', temp, 20), /upload limit/);
    const { rm } = require('node:fs/promises');
    await rm(temp, { force: true });
    assert.equal(sniffMime(Buffer.from('ID3abc')), 'audio/mpeg');
});
