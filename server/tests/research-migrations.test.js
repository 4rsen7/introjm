const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const { PGlite } = require('@electric-sql/pglite');

let db;
const owner = '00000000-0000-4000-8000-000000000001';
const member = '00000000-0000-4000-8000-000000000002';
const outsider = '00000000-0000-4000-8000-000000000003';
const legacyWorkspace = '00000000-0000-4000-8000-000000000004';
let workspace, study, interview;
async function rpc(name, args) {
    const params = args.map((_, index) => `$${index + 1}`).join(',');
    return (await db.query(`SELECT public.${name}(${params}) AS result`, args)).rows[0].result;
}
async function asRole(role, callback, userId = owner) {
    await db.exec(`SET ROLE ${role}`);
    await db.query("SELECT set_config('request.jwt.claim.sub', $1, false)", [userId]);
    try { return await callback(); } finally { await db.exec('RESET ROLE'); }
}
before(async () => {
    db = new PGlite();
    await db.exec(readFileSync(path.join(__dirname, 'fixtures/research-schema.sql'), 'utf8'));
    await db.query('INSERT INTO auth.users(id) VALUES ($1),($2),($3)', [owner, member, outsider]);
    await db.query("INSERT INTO public.workspaces(id,owner_id,name) VALUES ($1,$2,'Existing workspace')", [legacyWorkspace, owner]);
    for (const filename of ['20260924_research_core.sql', '20260924_research_legacy_views.sql']) {
        await db.exec(readFileSync(path.join(__dirname, '../migrations', filename), 'utf8'));
    }
    await db.query("INSERT INTO public.research_access_grants(user_id,expires_at) VALUES ($1,now()+interval '1 day')", [owner]);
});
after(async () => { await db?.close(); });

test('actual migrations preserve existing workspace and bootstrap is idempotent', async () => {
    assert.equal((await db.query('SELECT product_key FROM workspaces WHERE id=$1', [legacyWorkspace])).rows[0].product_key, 'iterojm');
    await assert.rejects(asRole('service_role', () => rpc('research_bootstrap', [outsider, 'No grant'])), /RESEARCH_ACCESS_REQUIRED/);
    workspace = await asRole('service_role', () => rpc('research_bootstrap', [owner, 'Research workspace']));
    assert.equal(workspace.product_key, 'research');
    assert.equal((await rpc('research_bootstrap', [owner, 'Repeated'])).id, workspace.id);
    assert.equal((await db.query('SELECT count(*)::int AS n FROM workspaces WHERE owner_id=$1', [owner])).rows[0].n, 2);
});

test('SQL RPC enforces product membership and owner grant', async () => {
    await db.query("INSERT INTO workspace_members(workspace_id,user_id,role) VALUES ($1,$2,'member')", [workspace.id, member]);
    await assert.rejects(rpc('research_create_study', [outsider, workspace.id, 'Hidden', 'Goal', null]), /RESEARCH_NOT_FOUND/);
    await assert.rejects(rpc('research_create_study', [owner, legacyWorkspace, 'Wrong', 'Goal', null]), /RESEARCH_NOT_FOUND/);
    study = await asRole('service_role', () => rpc('research_create_study', [member, workspace.id, 'Checkout', 'Can users complete checkout?', 'Test the new flow']));
    interview = await rpc('research_create_interview', [owner, study.id, 'Session 1']);
    assert.equal(interview.workspace_id, workspace.id);
    assert.equal(interview.study_id, study.id);
});

test('legacy SQL views isolate reads and broad subscription cancellation', async () => {
    const plans = await db.query("INSERT INTO plans(name,product_key) VALUES ('Legacy','iterojm'),('Research','research') RETURNING id,product_key");
    for (const plan of plans.rows) {
        await db.query('INSERT INTO subscriptions(user_id,plan_id,product_key) VALUES ($1,$2,$3)', [owner, plan.id, plan.product_key]);
    }
    await asRole('service_role', async () => {
        assert.equal((await db.query('SELECT count(*)::int n FROM iterojm_workspaces')).rows[0].n, 1);
        assert.equal((await db.query('SELECT count(*)::int n FROM iterojm_interviews')).rows[0].n, 0);
        await db.query("UPDATE iterojm_subscriptions SET status='canceled' WHERE user_id=$1", [owner]);
    });
    const rows = (await db.query('SELECT product_key,status FROM subscriptions ORDER BY product_key')).rows;
    assert.deepEqual(rows, [{ product_key: 'iterojm', status: 'canceled' }, { product_key: 'research', status: 'active' }]);
    await assert.rejects(db.query("INSERT INTO iterojm_workspaces(owner_id,name,product_key) VALUES ($1,'Escape','research')", [owner]), /check option/i);
});

test('direct browser policies and RPC grants cannot bypass Research API', async () => {
    await asRole('authenticated', async () => {
        assert.equal((await db.query('SELECT count(*)::int n FROM workspaces')).rows[0].n, 1);
        assert.equal((await db.query('SELECT count(*)::int n FROM interviews')).rows[0].n, 0);
        assert.equal((await db.query("UPDATE interviews SET title='Tampered' WHERE id=$1 RETURNING id", [interview.id])).rows.length, 0);
        await assert.rejects(rpc('research_bootstrap', [owner, 'Forged']), /permission denied/i);
        await assert.rejects(db.query('SELECT * FROM research_studies'), /permission denied/i);
        await assert.rejects(db.query('SELECT * FROM iterojm_interviews'), /permission denied/i);
    });
});

test('database prevents cross-product, cross-workspace and subscription-plan mixing', async () => {
    await assert.rejects(db.query('UPDATE interviews SET workspace_id=$1 WHERE id=$2', [legacyWorkspace, interview.id]), /Research interviews|foreign key/);
    await assert.rejects(db.query("UPDATE workspaces SET product_key='iterojm' WHERE id=$1", [workspace.id]), /cannot be changed/);
    const legacyPlan = (await db.query("SELECT id FROM plans WHERE product_key='iterojm'")).rows[0].id;
    await assert.rejects(db.query("INSERT INTO subscriptions(user_id,plan_id,product_key) VALUES ($1,$2,'research')", [owner, legacyPlan]), /products must match/);
});

test('source revisions retain summary, ignore whitespace-only changes and reject stale saves', async () => {
    const source = [{ id: 'line-1', speaker: 'User', timestamp: '00:00', text: 'I completed checkout' }];
    await db.query('UPDATE interviews SET transcript_data=$1, summary_data=$2 WHERE id=$3', [JSON.stringify(source), JSON.stringify({ summary: { generalInsight: 'Completed' } }), interview.id]);
    let updated = await rpc('research_update_interview', [owner, interview.id, 0, 0, 0, 'Session 1', JSON.stringify([{ ...source[0], text: ' I  completed checkout ' }]), false]);
    assert.equal(updated.transcript_revision, 1);
    assert.equal(updated.summary_stale, false);
    assert.equal(updated.summary_data.summary.generalInsight, 'Completed');
    await assert.rejects(rpc('research_update_interview', [owner, interview.id, 0, 0, 0, 'Conflict', '[]', false]), /RESEARCH_CONFLICT/);
    updated = await rpc('research_update_interview', [owner, interview.id, 1, 1, 0, 'Session 1', JSON.stringify([{ ...source[0], text: 'I could not complete checkout' }]), false]);
    assert.equal(updated.summary_stale, true);
    assert.equal(updated.transcript_revision, 2);
    assert.equal(updated.summary_data.summary.generalInsight, 'Completed');
});

test('brief edits flag saved analyses, and archived studies cannot accept new sessions', async () => {
    await db.query('UPDATE interviews SET summary_stale=false WHERE id=$1', [interview.id]);
    let updated = await rpc('research_update_study', [owner, study.id, 0, study.title, 'New goal', study.brief, false]);
    assert.equal(updated.revision, 1);
    assert.equal((await db.query('SELECT summary_stale FROM interviews WHERE id=$1', [interview.id])).rows[0].summary_stale, true);
    await assert.rejects(rpc('research_update_study', [owner, study.id, 0, study.title, 'Stale goal', null, false]), /RESEARCH_CONFLICT/);
    updated = await rpc('research_update_study', [owner, study.id, 1, study.title, 'New goal', study.brief, true]);
    assert.ok(updated.archived_at);
    await assert.rejects(rpc('research_create_interview', [owner, study.id, 'After archive']), /RESEARCH_NOT_FOUND/);
    await db.query('UPDATE research_access_grants SET max_studies=1 WHERE user_id=$1', [owner]);
    await assert.rejects(rpc('research_create_study', [owner, workspace.id, 'Quota reset?', 'Goal', null]), /RESEARCH_LIMIT_REACHED/);
});

test('legacy interviews without a workspace remain editable through the scoped view', async () => {
    const saved = (await db.query("INSERT INTO iterojm_interviews(user_id,title) VALUES ($1,'Legacy unscoped') RETURNING id", [owner])).rows[0];
    const updated = await asRole('service_role', () => db.query("UPDATE iterojm_interviews SET title='Preserved' WHERE id=$1 RETURNING title,workspace_id", [saved.id]));
    assert.deepEqual(updated.rows[0], { title: 'Preserved', workspace_id: null });
    await assert.rejects(db.query('UPDATE interviews SET study_id=$1 WHERE id=$2', [study.id, saved.id]), /Research interviews require a study/);
});
