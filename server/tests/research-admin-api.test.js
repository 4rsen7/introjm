const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { createResearchAdminRouter } = require('../modules/research/admin/router');
const { createResearchTeamRouter, digest } = require('../modules/research/team/router');
const admin = '00000000-0000-4000-8000-000000000801';
const workspace = '00000000-0000-4000-8000-000000000802';
const member = '00000000-0000-4000-8000-000000000803';
async function apiTest(run) {
    const calls = [];
    const db = {
        from(table) {
            let filters = {}; let columns = '*';
            const query = { select(value) { columns = value; return this; }, eq(key, value) { filters[key] = value; return this; }, order() { return this; }, limit() { return this; },
                maybeSingle: async () => ({ data: table === 'profiles' ? { id: filters.id, role: filters.id === admin ? 'admin' : 'user' }
                    : table === 'workspaces' ? { id: workspace, owner_id: admin, product_key: 'research' }
                    : table === 'research_admin_grant_usage' && filters.user_id === admin ? { studies_used: 2, max_studies: 5, interviews_used: 4, max_interviews: 20 } : null }),
                then(resolve, reject) { const row = { id: workspace, kind: 'interview_summary', status: 'running', output: { transcript: 'PRIVATE' }, claim_token: 'SECRET', settings: { token: 'SECRET' } };
                    return Promise.resolve({ data: table === 'research_analysis_jobs' ? [Object.fromEntries(columns.split(',').map(key => [key, row[key]]))] : [] }).then(resolve, reject); } };
            return query;
        },
        async rpc(name, args) { calls.push([name, args]); return { data: { id: workspace, token_hash: undefined, workspace_id: workspace } }; },
    };
    const authenticate = async token => ({ user: token === 'admin' ? { id: admin } : token === 'member' ? { id: member } : null });
    const app = express(); app.use(express.json());
    app.use('/admin', createResearchAdminRouter({ supabaseAdmin: db, authenticate, enabled: true }));
    app.use('/research', createResearchTeamRouter({ supabaseAdmin: db, authenticate, enabled: true }));
    const server = app.listen(0, '127.0.0.1');
    await new Promise(resolve => server.once('listening', resolve));
    const request = async (path, token = 'admin', body) => {
        const response = await fetch(`http://127.0.0.1:${server.address().port}${path}`, { method: body ? 'POST' : 'GET', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
        return { status: response.status, body: await response.json() };
    };
    try { await run(request, calls); } finally { await new Promise(resolve => server.close(resolve)); }
}
test('admin API independently rejects unauthenticated and ordinary accounts and exposes safe job metadata', async () => {
    await apiTest(async (request, calls) => {
        assert.equal((await request('/admin/jobs', 'bad')).status, 401);
        assert.equal((await request('/admin/jobs', 'member')).status, 403);
        const response = await request('/admin/jobs');
        assert.equal(response.status, 200);
        assert.ok(!JSON.stringify(response.body).includes('PRIVATE'));
        assert.ok(!JSON.stringify(response.body).includes('SECRET'));
        assert.equal(calls.length, 0);
    });
});
test('owner invitation returns one raw token while only its hash reaches SQL', async () => {
    await apiTest(async (request, calls) => {
        const response = await request(`/research/workspaces/${workspace}/invites`, 'admin', { email: 'Person@example.test', expires_at: new Date(Date.now() + 86400000).toISOString() });
        assert.equal(response.status, 201);
        const token = response.body.data.token;
        assert.match(token, /^[0-9a-f]{64}$/);
        assert.equal(calls[0][1].p_token_hash, digest(token));
        assert.ok(!JSON.stringify(calls).includes(token));
    });
});
test('workspace usage endpoint returns quota counters for workspace members and rejects non-members', async () => {
    await apiTest(async (request) => {
        assert.equal((await request(`/research/workspaces/${workspace}/usage`, 'member')).status, 404);
        const response = await request(`/research/workspaces/${workspace}/usage`, 'admin');
        assert.equal(response.status, 200);
        assert.equal(response.body.data.studies_used, 2);
        assert.equal(response.body.data.max_studies, 5);
    });
});

