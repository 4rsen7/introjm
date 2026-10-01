const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const { PGlite } = require('@electric-sql/pglite');

// Named empty disposable database, in memory only. This suite requires separate owner authorization to run.
const DATABASE_NAME = 'iterojm-study-archive-test';
const migration = '20261001_research_archive_drafts.sql';
const plan = { questions: [], hypotheses: [], prototype: { name: '', url: '', version: '' }, tasks: [], guide: [] };
let db;
let preserved;
const one = async (sql, args = []) => (await db.query(sql, args)).rows[0];
const rpc = async (name, args = []) => (await one(`SELECT public.${name}(${args.map((_, index) => `$${index + 1}`).join(',')}) AS value`, args)).value;
const studyRow = id => one('SELECT * FROM research_studies WHERE id=$1', [id]);
const count = (table, studyId) => one(`SELECT count(*)::integer AS value FROM ${table} WHERE study_id=$1`, [studyId]).then(row => row.value);
const archive = (owner, s, revision = s.revision, title = null, goal = null, brief = null) =>
  rpc('research_update_study', [owner, s.id, revision, title, goal, brief, true]);

async function createStudy(status = 'draft') {
  const owner = randomUUID();
  await db.query('INSERT INTO auth.users(id) VALUES($1)', [owner]);
  await db.query("INSERT INTO research_access_grants(user_id,expires_at,max_analyses,max_studies,max_interviews) VALUES($1,now()+interval '1 day',100,100,100)", [owner]);
  const workspace = await rpc('research_bootstrap', [owner, DATABASE_NAME]);
  const study = await rpc('research_create_study_flow', [owner, workspace.id, '  Search study  ', status === 'draft' ? '' : 'Evaluate search', 'Saved brief', status, JSON.stringify(plan)]);
  return { owner, workspace, study };
}

before(async () => {
  db = new PGlite();
  await db.exec(readFileSync(path.join(__dirname, 'fixtures/research-schema.sql'), 'utf8'));
  await db.exec('ALTER TABLE auth.users ADD COLUMN email_confirmed_at timestamptz');
  for (const name of ['20260924_research_core', '20260924_research_jobs', '20260924_research_versions',
    '20260925_research_media', '20260926_research_intelligence', '20260927_research_capacity',
    '20260928_research_admin', '20260929_research_media_followthrough', '20260930_research_operations',
    '20260930_research_shared_brief_flow']) {
    await db.exec(readFileSync(path.join(__dirname, '../migrations', `${name}.sql`), 'utf8'));
  }
  const created = await createStudy('confirmed');
  const s = created.study;
  const interview = await rpc('research_create_interview', [created.owner, s.id, 'Preserved session']);
  const edited = await rpc('research_update_interview', [created.owner, interview.id, interview.research_revision,
    interview.transcript_revision, interview.summary_revision, interview.title,
    JSON.stringify([{ speaker: 'Participant', text: 'Found it', timestamp: '00:01' }]), false]);
  await rpc('research_enqueue_analysis', [created.owner, 'interview_summary', s.id, edited.id]);
  const summary = await rpc('research_claim_supported_analysis', [['interview_summary']]);
  await rpc('research_finish_analysis', [summary.id, summary.claim_token, JSON.stringify({ summary: { generalInsight: 'Found it' } }), null]);
  await rpc('research_enqueue_analysis', [created.owner, 'study_synthesis', s.id, null]);
  const synthesis = await rpc('research_claim_supported_analysis', [['study_synthesis']]);
  await rpc('research_finish_analysis', [synthesis.id, synthesis.claim_token, JSON.stringify({ findings: [{ text: 'Found it', source_ids: [edited.id] }] }), null]);
  preserved = {
    study: await studyRow(s.id),
    interview: await one('SELECT * FROM interviews WHERE id=$1', [edited.id]),
    summary: await one('SELECT * FROM research_analysis_jobs WHERE id=$1', [summary.id]),
    synthesis: await one('SELECT * FROM research_analysis_jobs WHERE id=$1', [synthesis.id]),
    versions: await count('research_study_versions', s.id),
  };
  await db.exec(readFileSync(path.join(__dirname, '../migrations', migration), 'utf8'));
});
after(async () => db?.close());

test('migration preserves existing study, plan, versions, transcript, completed summary and synthesis', async () => {
  assert.deepEqual(await studyRow(preserved.study.id), preserved.study);
  assert.deepEqual(await one('SELECT * FROM interviews WHERE id=$1', [preserved.interview.id]), preserved.interview);
  assert.deepEqual(await one('SELECT * FROM research_analysis_jobs WHERE id=$1', [preserved.summary.id]), preserved.summary);
  assert.deepEqual(await one('SELECT * FROM research_analysis_jobs WHERE id=$1', [preserved.synthesis.id]), preserved.synthesis);
  assert.equal(await count('research_study_versions', preserved.study.id), preserved.versions);
});

test('empty-goal draft archives without rewriting content or its interview and version history', async () => {
  const { owner, study: s } = await createStudy();
  const interview = await rpc('research_create_interview', [owner, s.id, 'Draft session']);
  const beforeStudy = await studyRow(s.id);
  const beforeVersion = await one('SELECT * FROM research_study_versions WHERE id=$1', [beforeStudy.current_version_id]);
  const beforeInterview = await one('SELECT * FROM interviews WHERE id=$1', [interview.id]);
  const versions = await count('research_study_versions', s.id);
  const archived = await archive(owner, s, s.revision, null, null, null);
  const afterStudy = await studyRow(s.id);
  assert.ok(archived.archived_at);
  assert.ok(afterStudy.archived_at);
  assert.equal(afterStudy.revision, beforeStudy.revision + 1);
  for (const key of ['title', 'goal', 'brief', 'brief_status', 'plan', 'context_revision', 'auto_context_revision', 'current_version_id'])
    assert.deepEqual(afterStudy[key], beforeStudy[key], `preserve ${key}`);
  assert.deepEqual(await one('SELECT * FROM research_study_versions WHERE id=$1', [beforeStudy.current_version_id]), beforeVersion);
  assert.equal(await count('research_study_versions', s.id), versions);
  assert.deepEqual(await one('SELECT * FROM interviews WHERE id=$1', [interview.id]), beforeInterview);
  await assert.rejects(rpc('research_create_interview', [owner, s.id, 'After archive']), /RESEARCH_NOT_FOUND/);
});

test('archiving a completed study preserves its summary and aggregate data', async () => {
  const owner = await one('SELECT user_id FROM research_studies WHERE id=$1', [preserved.study.id]);
  const beforeStudy = await studyRow(preserved.study.id);
  await archive(owner.user_id, beforeStudy);
  assert.deepEqual(await one('SELECT * FROM interviews WHERE id=$1', [preserved.interview.id]), preserved.interview);
  assert.deepEqual(await one('SELECT * FROM research_analysis_jobs WHERE id=$1', [preserved.summary.id]), preserved.summary);
  assert.deepEqual(await one('SELECT * FROM research_analysis_jobs WHERE id=$1', [preserved.synthesis.id]), preserved.synthesis);
  assert.equal(await count('research_study_versions', preserved.study.id), preserved.versions);
});

test('stale or null revision and outsider writes fail without archiving', async () => {
  const { owner, study: s } = await createStudy();
  const outsider = randomUUID();
  await db.query('INSERT INTO auth.users(id) VALUES($1)', [outsider]);
  await assert.rejects(archive(owner, s, null), /RESEARCH_CONFLICT/);
  await assert.rejects(archive(owner, s, s.revision - 1), /RESEARCH_CONFLICT/);
  await assert.rejects(archive(outsider, s), /RESEARCH_/);
  assert.equal((await studyRow(s.id)).archived_at, null);
  assert.equal((await studyRow(s.id)).revision, s.revision);
});

test('non-archive edits still validate and update a confirmed study', async () => {
  const { owner, study: s } = await createStudy('confirmed');
  await assert.rejects(rpc('research_update_study', [owner, s.id, s.revision, ' ', 'Valid goal', null, false]), /RESEARCH_INVALID_INPUT/);
  await assert.rejects(rpc('research_update_study', [owner, s.id, s.revision, s.title, '', null, false]), /RESEARCH_INVALID_INPUT/);
  const changed = await rpc('research_update_study', [owner, s.id, s.revision, '  Renamed  ', 'Revised goal', 'New brief', false]);
  assert.equal(changed.title, 'Renamed');
  assert.equal(changed.goal, 'Revised goal');
  assert.equal(changed.brief, 'New brief');
  assert.equal(changed.revision, s.revision + 1);
  assert.equal(changed.archived_at, null);
});

test('browser roles remain unable to execute the archive writer', async () => {
  for (const role of ['anon', 'authenticated']) {
    const privilege = await one("SELECT has_function_privilege($1,'public.research_update_study(uuid,uuid,integer,text,text,text,boolean)','EXECUTE') AS allowed", [role]);
    assert.equal(privilege.allowed, false);
  }
  const service = await one("SELECT has_function_privilege('service_role','public.research_update_study(uuid,uuid,integer,text,text,text,boolean)','EXECUTE') AS allowed");
  assert.equal(service.allowed, true);
});
