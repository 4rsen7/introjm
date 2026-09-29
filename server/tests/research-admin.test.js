const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const { PGlite } = require('@electric-sql/pglite');
const { digest } = require('../modules/research/team/router');
const { safeJob } = require('../modules/research/admin/router');

const admin = '00000000-0000-4000-8000-000000000401';
const owner = '00000000-0000-4000-8000-000000000402';
const member = '00000000-0000-4000-8000-000000000403';
const outsider = '00000000-0000-4000-8000-000000000404';
let db, workspace, study, interview;
const limits = { max_studies: 3, max_interviews: 5, max_analyses: 5, max_storage_bytes: 1000000, max_transcription_seconds: 500, max_members: 2 };
const one = async (sql, args = []) => (await db.query(sql, args)).rows[0];
async function rpc(name, args = []) {
    const placeholders = args.map((_, index) => `$${index + 1}`).join(',');
    return (await one(`SELECT public.${name}(${placeholders}) AS value`, args)).value;
}
before(async () => {
    db = new PGlite();
    const root = path.join(__dirname, '..');
    await db.exec(readFileSync(path.join(root, 'tests/fixtures/research-schema.sql'), 'utf8'));
    await db.exec('ALTER TABLE auth.users ADD COLUMN email_confirmed_at timestamptz');
    for (const name of ['20260924_research_core.sql', '20260924_research_jobs.sql', '20260924_research_versions.sql',
        '20260925_research_media.sql', '20260926_research_intelligence.sql', '20260927_research_capacity.sql', '20260928_research_admin.sql'])
        await db.exec(readFileSync(path.join(root, 'migrations', name), 'utf8'));
    await db.query("INSERT INTO auth.users(id,email,email_confirmed_at) VALUES ($1,'admin@test.local',now()),($2,'owner@test.local',now()),($3,'member@test.local',now()),($4,'other@test.local',now())",
        [admin, owner, member, outsider]);
    await db.query("INSERT INTO profiles(id,role) VALUES ($1,'admin')", [admin]);
    await rpc('research_admin_set_grant', [admin, owner, new Date(Date.now() + 86400000).toISOString(), JSON.stringify(limits)]);
    workspace = await rpc('research_bootstrap', [owner, 'Research']);
    study = await rpc('research_create_study', [owner, workspace.id, 'Study', 'Goal', null]);
    interview = await rpc('research_create_interview', [owner, study.id, 'Session']);
    await db.query('UPDATE interviews SET transcript_data=$1 WHERE id=$2', [JSON.stringify([{ speaker: 'User', timestamp: '00:00', text: 'Yes' }]), interview.id]);
});
after(async () => db?.close());

test('admin SQL gate, grant limits, and audit are atomic', async () => {
    await assert.rejects(rpc('research_admin_set_grant', [outsider, member, new Date(Date.now() + 86400000).toISOString(), JSON.stringify(limits)]), /RESEARCH_ADMIN_REQUIRED/);
    await assert.rejects(rpc('research_admin_set_grant', [admin, member, new Date(Date.now() + 86400000).toISOString(), JSON.stringify({ ...limits, max_members: 0 })]), /RESEARCH_INVALID_INPUT/);
    const usage = await one('SELECT studies_used,interviews_used,analyses_used FROM research_admin_grant_usage WHERE user_id=$1', [owner]);
    assert.equal(usage.studies_used, 1);
    assert.equal(usage.interviews_used, 1);
    assert.equal((await one("SELECT count(*)::int n FROM research_admin_audit WHERE action='grant_set' AND target_id=$1", [owner])).n, 1);
    const changed = await rpc('research_admin_set_grant', [admin, owner, new Date(Date.now() + 2 * 86400000).toISOString(), JSON.stringify({ ...limits, max_members: 3 })]);
    assert.equal(changed.max_members, 3);
});

test('single-use invitation checks verified email, product, membership, and owner scope', async () => {
    const token = 'secret-one';
    await assert.rejects(rpc('research_create_team_invite', [outsider, workspace.id, 'member@test.local', digest(token), new Date(Date.now() + 86400000).toISOString()]), /RESEARCH_NOT_FOUND/);
    const invite = await rpc('research_create_team_invite', [owner, workspace.id, 'member@test.local', digest(token), new Date(Date.now() + 86400000).toISOString()]);
    assert.equal(invite.token_hash, undefined);
    assert.equal((await one('SELECT token_hash FROM research_team_invites WHERE id=$1', [invite.id])).token_hash, digest(token));
    await assert.rejects(rpc('research_accept_team_invite', [outsider, digest(token)]), /RESEARCH_ACCESS_REQUIRED/);
    await db.query('UPDATE auth.users SET email_confirmed_at=NULL WHERE id=$1', [member]);
    await assert.rejects(rpc('research_accept_team_invite', [member, digest(token)]), /RESEARCH_ACCESS_REQUIRED/);
    await db.query('UPDATE auth.users SET email_confirmed_at=now() WHERE id=$1', [member]);
    const accepted = await rpc('research_accept_team_invite', [member, digest(token)]);
    assert.equal(accepted.workspace_id, workspace.id);
    await assert.rejects(rpc('research_accept_team_invite', [member, digest(token)]), /RESEARCH_NOT_FOUND/);
    assert.equal((await one('SELECT count(*)::int n FROM workspace_members WHERE workspace_id=$1 AND user_id=$2', [workspace.id, member])).n, 1);
    const pending = await rpc('research_create_team_invite', [owner, workspace.id, 'other@test.local', digest('secret-two'), new Date(Date.now() + 86400000).toISOString()]);
    await assert.rejects(rpc('research_revoke_team_invite', [outsider, pending.id]), /RESEARCH_NOT_FOUND/);
    const secondPending = await rpc('research_create_team_invite', [owner, workspace.id, 'other@test.local', digest('secret-three'), new Date(Date.now() + 86400000).toISOString()]);
    await assert.rejects(rpc('research_create_team_invite', [owner, workspace.id, 'other@test.local', digest('secret-four'), new Date(Date.now() + 86400000).toISOString()]), /RESEARCH_LIMIT_REACHED/);
    assert.equal(await rpc('research_revoke_team_invite', [owner, pending.id]), true);
    assert.equal(await rpc('research_revoke_team_invite', [owner, secondPending.id]), true);
    await assert.rejects(rpc('research_accept_team_invite', [outsider, digest('secret-two')]), /RESEARCH_NOT_FOUND/);
});

test('retry requires current source and remaining attempts; cancel fences and audits', async () => {
    const queued = await rpc('research_enqueue_analysis', [owner, 'interview_summary', study.id, interview.id]);
    await db.query("UPDATE research_analysis_jobs SET status='failed',attempts=1 WHERE id=$1", [queued.id]);
    await assert.rejects(rpc('research_admin_job_action', [outsider, queued.id, 'retry']), /RESEARCH_ADMIN_REQUIRED/);
    const retried = await rpc('research_admin_job_action', [admin, queued.id, 'retry']);
    assert.equal(retried.status, 'queued');
    const claimed = await rpc('research_claim_analysis');
    assert.equal(claimed.id, queued.id);
    const canceled = await rpc('research_admin_job_action', [admin, queued.id, 'cancel']);
    assert.equal(canceled.status, 'canceled');
    await assert.rejects(rpc('research_finish_analysis', [claimed.id, claimed.claim_token, '{}', null]), /RESEARCH_JOB_FENCED/);
    assert.equal((await one("SELECT count(*)::int n FROM research_admin_audit WHERE target_id=$1 AND action LIKE 'job_%'", [queued.id])).n, 2);
    await db.query("UPDATE research_analysis_jobs SET status='failed',attempts=3 WHERE id=$1", [queued.id]);
    await assert.rejects(rpc('research_admin_job_action', [admin, queued.id, 'retry']), /RESEARCH_CONFLICT/);
    assert.equal(safeJob({ id: queued.id, status: 'failed', output: { secret: true } }).output, undefined);
});

test('member removal fences their pending jobs and preserves owner', async () => {
    const queued = await rpc('research_enqueue_analysis', [member, 'interview_summary', study.id, interview.id]);
    assert.equal(await rpc('research_remove_team_member', [owner, workspace.id, member]), true);
    assert.equal((await one('SELECT status FROM research_analysis_jobs WHERE id=$1', [queued.id])).status, 'canceled');
    await assert.rejects(rpc('research_remove_team_member', [owner, workspace.id, owner]), /RESEARCH_NOT_FOUND/);
});

test('revocation stops queued work and browser role has no access to admin functions', async () => {
    const grant = await rpc('research_admin_revoke_grant', [admin, owner]);
    assert.ok(new Date(grant.expires_at) <= new Date());
    await assert.rejects(rpc('research_create_study', [owner, workspace.id, 'After', 'Goal', null]), /RESEARCH_ACCESS_REQUIRED/);
    await db.exec('SET ROLE authenticated');
    try {
        await assert.rejects(db.query('SELECT * FROM research_admin_audit'), /permission denied/i);
        await assert.rejects(rpc('research_admin_set_grant', [admin, owner, new Date(Date.now() + 86400000).toISOString(), JSON.stringify(limits)]), /permission denied/i);
    } finally { await db.exec('RESET ROLE'); }
});
