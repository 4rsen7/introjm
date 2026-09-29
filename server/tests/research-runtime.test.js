const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const { PGlite } = require('@electric-sql/pglite');
const { transcribeIsolated } = require('../modules/research/media/isolated-transcription');
const { createResearchStorage } = require('../modules/research/media/storage');
let db;
const id = '00000000-0000-4000-8000-000000000901';
const rpc = async (name, values = []) => (await db.query(`SELECT public.${name}(${values.map((_, i) => `$${i + 1}`).join(',')}) value`, values)).rows[0].value;
before(async () => {
    db = new PGlite();
    const files = ['20260924_research_core', '20260924_research_jobs', '20260924_research_versions', '20260925_research_media', '20260926_research_intelligence', '20260927_research_capacity', '20260928_research_admin', '20260929_research_media_followthrough', '20260930_research_operations'];
    await db.exec(readFileSync(path.join(__dirname, 'fixtures/research-schema.sql'), 'utf8'));
    await db.exec('ALTER TABLE auth.users ADD COLUMN email_confirmed_at timestamptz');
    for (const file of files) await db.exec(readFileSync(path.join(__dirname, '../migrations', `${file}.sql`), 'utf8'));
});
after(async () => db?.close());

test('the complete migration chain records recording provenance and atomically schedules its optional summary', async () => {
    await db.query('INSERT INTO auth.users(id) VALUES($1)', [id]);
    await db.query("INSERT INTO research_access_grants(user_id,expires_at) VALUES($1,now()+interval '1 day')", [id]);
    const workspace = await rpc('research_bootstrap', [id, 'Team']);
    const study = await rpc('research_create_study', [id, workspace.id, 'Study', 'Can people pay?', null]);
    const interview = await rpc('research_create_interview', [id, study.id, 'Interview']);
    const asset = await rpc('research_begin_upload', [id, interview.id, 100, true]);
    await rpc('research_finalize_upload', [id, asset.id, 90, 'a'.repeat(64), 'audio/mpeg', 10, true]);
    const claimed = await rpc('research_claim_supported_analysis', [['media_transcription']]);
    await rpc('research_finish_media_analysis', [claimed.id, claimed.claim_token, '[{"text":"It worked","speaker":"User","timestamp":"00:01"}]', '{"provider":"fixture"}']);
    const job = (await db.query('SELECT * FROM research_analysis_jobs WHERE id=$1', [claimed.id])).rows[0];
    assert.ok(job.output.summary_job_id);
    const version = (await db.query('SELECT * FROM research_transcript_versions WHERE id=$1', [job.output.transcript_version_id])).rows[0];
    assert.equal(version.origin, 'recording');
    assert.equal(version.recording_ref, asset.id);
    assert.equal(await rpc('research_mark_media_deleting', [asset.id]), false);
    assert.equal((await rpc('research_claim_supported_analysis', [['interview_summary']])).id, job.output.summary_job_id);
});

test('cancellation kills the isolated transcription process before releasing the caller', async () => {
    const controller = new AbortController();
    const child = new EventEmitter(); let killed = false;
    child.send = () => {}; child.kill = () => { killed = true; };
    const running = transcribeIsolated({ path: '/tmp/synthetic-recording' }, { signal: controller.signal, forkImpl: () => child });
    controller.abort();
    await assert.rejects(running, /aborted/);
    assert.equal(killed, true);
});

test('existing immutable copies are checked by the caller, unrelated copy failures propagate', async () => {
    let error = { statusCode: 400, code: 'Duplicate' };
    const storage = createResearchStorage({ storage: { from: () => ({ copy: async () => ({ error }) }) } });
    await storage.copy('bucket', 'incoming', 'sealed');
    error = { code: 'AccessDenied' };
    await assert.rejects(storage.copy('bucket', 'incoming', 'sealed'));
});

test('resumable uploads use server offsets and never send a recording to a redirected origin', async () => {
    const { uploadRecording, CHUNK_BYTES } = await import('../../research/src/services/recordingUpload.js');
    const calls = [];
    let offset = CHUNK_BYTES;
    const file = new Blob([new Uint8Array(CHUNK_BYTES + 5)], { type: 'audio/mpeg' });
    const session = { uploadUrl: 'https://storage.example.test/storage/v1/upload/resumable/one', signed_upload: { endpoint: 'https://storage.example.test/storage/v1/upload/resumable', token: 'fixture' } };
    await uploadRecording(file, session, { fetchImpl: async (url, options) => {
        calls.push(options);
        if (options.method === 'PATCH') { assert.equal(Number(options.headers['Upload-Offset']), offset); assert.equal(options.body.size, 5); offset += 5; }
        return new Response(null, { status: 204, headers: { 'Upload-Offset': String(offset) } });
    } });
    assert.deepEqual(calls.map(call => call.method), ['HEAD', 'PATCH']);
    await assert.rejects(uploadRecording(file, { ...session, uploadUrl: 'https://other.example.test/stolen' }, { fetchImpl: () => { throw Error('Must not transmit'); } }), /failed/);
});
