// Explicit disposable PostgreSQL only. Never reads .env or the application's Supabase URL.
const { spawn } = require('node:child_process');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const root = path.resolve(__dirname, '..');
async function main() {
    const url = new URL(process.env.RESEARCH_TEST_DATABASE_URL || 'invalid:');
    const database = url.pathname.slice(1);
    if (!['127.0.0.1', 'localhost'].includes(url.hostname) || !/^research_[a-z0-9_]+_test$/.test(database))
        throw Error('RESEARCH_TEST_DATABASE_URL must identify a local disposable research_*_test database');
    const env = { ...process.env, PGHOST: url.hostname, PGPORT: url.port || '5432', PGUSER: decodeURIComponent(url.username), PGPASSWORD: decodeURIComponent(url.password), PGDATABASE: database, PGOPTIONS: '-c statement_timeout=15000 -c lock_timeout=10000' };
    const sql = source => new Promise((resolve, reject) => {
        const child = spawn('psql', ['-X', '-q', '-A', '-t', '-v', 'ON_ERROR_STOP=1'], { env, stdio: ['pipe', 'pipe', 'pipe'] });
        let output = '', errors = '';
        child.stdout.on('data', chunk => { output += chunk; });
        child.stderr.on('data', chunk => { errors += chunk; });
        child.on('error', reject);
        child.on('close', code => code ? reject(Error(errors)) : resolve(output.trim()));
        child.stdin.end(source);
    });
    if (await sql("SELECT count(*) FROM pg_tables WHERE schemaname IN ('public','auth')") !== '0') throw Error('Disposable database must be empty; this script never deletes existing data');
    await sql(readFileSync(path.join(root, 'server/tests/fixtures/research-schema.sql'), 'utf8'));
    await sql('ALTER TABLE auth.users ADD COLUMN email_confirmed_at timestamptz');
    for (const name of ['20260924_research_core', '20260924_research_jobs', '20260924_research_versions', '20260925_research_media', '20260926_research_intelligence', '20260927_research_capacity', '20260928_research_admin', '20260929_research_media_followthrough', '20260930_research_operations'])
        await sql(readFileSync(path.join(root, 'server/migrations', `${name}.sql`), 'utf8'));
    const teams = [];
    for (let n = 0; n < 5; n++) {
        const owner = randomUUID();
        await sql(`INSERT INTO auth.users(id) VALUES('${owner}'); INSERT INTO research_access_grants(user_id,expires_at,max_analyses) VALUES('${owner}',now()+interval '1 day',1000)`);
        const workspace = JSON.parse(await sql(`SELECT research_bootstrap('${owner}','Synthetic team')`));
        const study = JSON.parse(await sql(`SELECT research_create_study('${owner}','${workspace.id}','Study','Can users pay?',NULL)`));
        teams.push({ owner, workspace, study });
    }
    const enqueue = (team, description) => sql(`SELECT research_enqueue_intelligence('${team.owner}','brief_preparation','${team.study.id}',NULL,'{"description":"${description}"}')`).then(JSON.parse);
    const duplicate = await Promise.all(Array.from({ length: 12 }, () => enqueue(teams[0], 'same')));
    assert.equal(new Set(duplicate.map(job => job.id)).size, 1, 'Concurrent enqueue must reserve once');
    await Promise.all(teams.flatMap(team => Array.from({ length: 3 }, (_, n) => enqueue(team, `sample-${n}`))));
    const claim = () => sql("SELECT research_claim_supported_analysis(ARRAY['brief_preparation'])").then(output => output ? JSON.parse(output) : null);
    const claimed = (await Promise.all(Array.from({ length: 15 }, claim))).filter(Boolean);
    assert.equal(claimed.length, 2, 'Global limit holds across independent connections/processes');
    assert.equal(new Set(claimed.map(job => job.workspace_id)).size, 2, 'Workspace cap prevents monopolizing both slots');
    assert.equal(new Set(claimed.map(job => job.id)).size, 2, 'No job is claimed twice');
    const old = claimed[0];
    await sql(`UPDATE research_analysis_jobs SET lease_until=now()-interval '1 second' WHERE id='${old.id}'`);
    // Disable fresh work temporarily so recovery selects the expired lease deterministically.
    await sql("UPDATE research_analysis_jobs SET available_at=now()+interval '1 day' WHERE status='queued'");
    const recovered = await claim();
    assert.equal(recovered.id, old.id);
    assert.notEqual(recovered.claim_token, old.claim_token);
    await assert.rejects(sql(`SELECT research_finish_analysis('${old.id}','${old.claim_token}',NULL,'GENERATION_FAILED')`), /RESEARCH_JOB_FENCED/);
    await sql(`SELECT research_finish_analysis('${recovered.id}','${recovered.claim_token}',NULL,'GENERATION_FAILED')`);
    assert.equal(await claim(), null, 'Retry backoff prevents a new immediate call');
    // Concurrent storage reservations use the same grant lock; exactly one 120-byte reservation fits.
    const t = teams[4];
    await sql(`UPDATE research_access_grants SET max_storage_bytes=200 WHERE user_id='${t.owner}'`);
    const interview = JSON.parse(await sql(`SELECT research_create_interview('${t.owner}','${t.study.id}','Session')`));
    const uploads = await Promise.allSettled(Array.from({ length: 5 }, () => sql(`SELECT research_begin_upload('${t.owner}','${interview.id}',60,false)`)));
    assert.equal(uploads.filter(result => result.status === 'fulfilled').length, 1);
    console.log('Research PostgreSQL concurrency: duplicate reservations, five teams, 15 simultaneous claims, lease recovery, fencing, backoff and storage caps passed.');
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
