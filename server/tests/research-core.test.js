const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { createResearchRouter } = require('../modules/research/router');
const { createResearchJobsRouter } = require('../modules/research/jobs/router');
const { listProductWorkspaces } = require('../modules/access/productScope');

const ids = {
    user: '00000000-0000-4000-8000-000000000001',
    other: '00000000-0000-4000-8000-000000000002',
    legacy: '00000000-0000-4000-8000-000000000003',
    research: '00000000-0000-4000-8000-000000000004',
    foreign: '00000000-0000-4000-8000-000000000005',
    study: '00000000-0000-4000-8000-000000000006',
    interview: '00000000-0000-4000-8000-000000000007',
};

function fakeDatabase() {
    const tables = {
        workspaces: [
            { id: ids.legacy, owner_id: ids.user, name: 'Legacy', product_key: 'iterojm' },
            { id: ids.research, owner_id: ids.user, name: 'Research', product_key: 'research' },
            { id: ids.foreign, owner_id: ids.other, name: 'Private research', product_key: 'research' },
        ],
        workspace_members: [],
        research_studies: [{ id: ids.study, workspace_id: ids.research, title: 'Study', goal: 'Shared goal', brief: null, revision: 0, archived_at: null }],
        interviews: [{ id: ids.interview, workspace_id: ids.research, study_id: ids.study, title: 'Session', transcript_data: [{ text: 'Private source' }], summary_data: { overview: 'Saved' }, research_revision: 0, transcript_revision: 0, summary_revision: 0, research_archived_at: null }],
    };
    const calls = [];
    const db = {
        tables, calls,
        from(table) {
            calls.push(['from', table]);
            let rows = [...(tables[table] || [])];
            let columns = '*';
            const query = {
                select(value) { columns = value; return query; },
                update(patch) { rows.forEach((row) => Object.assign(row, patch)); return query; },
                eq(key, value) { rows = rows.filter((row) => row[key] === value); return query; },
                is(key, value) { rows = rows.filter((row) => row[key] === value); return query; },
                in(key, values) { rows = rows.filter((row) => values.includes(row[key])); return query; },
                lt(key, value) { rows = rows.filter((row) => row[key] < value); return query; },
                order() { return query; },
                limit(value) { rows = rows.slice(0, value); return query; },
                maybeSingle() { return Promise.resolve({ data: !rows[0] ? null : columns === '*' ? rows[0] : Object.fromEntries(columns.split(',').map(key => [key, rows[0][key]])), error: null }); },
                then(resolve, reject) {
                    const data = columns === '*' ? rows : rows.map((row) => Object.fromEntries(columns.split(',').map((key) => [key, row[key]])));
                    return Promise.resolve({ data, error: null }).then(resolve, reject);
                },
            };
            return query;
        },
        async rpc(name, args) { calls.push(['rpc', name, args]); return { data: { id: ids.study, ...args }, error: null }; },
    };
    return db;
}

async function withApi(fn, options = {}) {
    const db = options.db || fakeDatabase();
    const app = express();
    app.use(express.json());
    app.use('/api/research', createResearchJobsRouter({
        supabaseAdmin: db,
        authenticate: async (token) => ({ user: token === 'valid' ? { id: ids.user } : null }),
        enabled: options.enabled !== false && options.jobsEnabled !== false,
    }));
    app.use('/api/research', createResearchRouter({
        supabaseAdmin: db,
        authenticate: async (token) => ({ user: token === 'valid' ? { id: ids.user } : null }),
        enabled: true, ...options,
    }));
    const server = app.listen(0, '127.0.0.1');
    await new Promise((resolve) => server.once('listening', resolve));
    const request = async (path, init = {}) => {
        const result = await fetch(`http://127.0.0.1:${server.address().port}/api/research${path}`, {
            ...init, headers: { Authorization: 'Bearer valid', 'Content-Type': 'application/json', ...init.headers },
        });
        return { status: result.status, body: await result.json() };
    };
    try { await fn(request, db); }
    finally { await new Promise((resolve) => server.close(resolve)); }
}

test('disabled Research performs no authentication or database calls', async () => {
    await withApi(async (request, db) => {
        const result = await request('/workspaces');
        assert.equal(result.status, 404);
        assert.equal(result.body.code, 'RESEARCH_DISABLED');
        assert.deepEqual(db.calls, []);
    }, { enabled: false, authenticate: () => { throw new Error('Should not authenticate'); } });
});

test('every route requires a validated bearer token', async () => {
    await withApi(async (request, db) => {
        assert.equal((await request('/workspaces', { headers: { Authorization: 'Bearer bad' } })).status, 401);
        assert.deepEqual(db.calls, []);
    });
});

test('workspace list includes owned/member Research workspaces and excludes legacy', async () => {
    const db = fakeDatabase();
    db.tables.workspace_members.push({ workspace_id: ids.foreign, user_id: ids.user, role: 'member' });
    const rows = await listProductWorkspaces(db, ids.user);
    assert.deepEqual(rows.map((row) => [row.id, row.role]), [[ids.research, 'owner'], [ids.foreign, 'member']]);
});

test('study read and creation cannot cross into legacy or non-member workspaces', async () => {
    await withApi(async (request, db) => {
        assert.equal((await request(`/studies?workspace_id=${ids.legacy}`)).status, 404);
        assert.equal((await request(`/studies?workspace_id=${ids.foreign}`)).status, 404);
        assert.equal((await request('/studies', { method: 'POST', body: JSON.stringify({ workspace_id: ids.foreign, title: 'x', goal: 'x' }) })).status, 404);
        assert.equal(db.calls.filter(([kind]) => kind === 'rpc').length, 0);
    });
});

test('interview access verifies study/workspace relation, not just owner ID', async () => {
    const db = fakeDatabase();
    db.tables.interviews[0].workspace_id = ids.legacy;
    await withApi(async (request) => {
        const result = await request(`/interviews/${ids.interview}`);
        assert.equal(result.status, 404);
        assert.equal(JSON.stringify(result.body).includes('Private source'), false);
    }, { db });
});

test('interview list never returns full source or summary and validates pagination', async () => {
    await withApi(async (request) => {
        const result = await request(`/studies/${ids.study}/interviews`);
        assert.equal(result.status, 200);
        assert.equal(result.body.data.length, 1);
        assert.equal('transcript_data' in result.body.data[0], false);
        assert.equal('summary_data' in result.body.data[0], false);
        assert.equal((await request(`/studies/${ids.study}/interviews?limit=1000`)).status, 400);
    });
});

test('study mutation derives scope from stored study and rejects missing revision', async () => {
    await withApi(async (request, db) => {
        assert.equal((await request(`/studies/${ids.study}`, { method: 'PATCH', body: JSON.stringify({ title: 'Updated' }) })).status, 400);
        const result = await request(`/studies/${ids.study}`, { method: 'PATCH', body: JSON.stringify({ title: 'Updated', revision: 0, workspace_id: ids.foreign, user_id: ids.other }) });
        assert.equal(result.status, 200);
        const call = db.calls.find(([kind]) => kind === 'rpc');
        assert.equal(call[2].p_user_id, ids.user);
        assert.equal(call[2].p_study_id, ids.study);
        assert.equal(call[2].p_goal, 'Shared goal');
        assert.equal('p_workspace_id' in call[2], false);
    });
});

test('source edits require all revisions and cannot directly overwrite summary', async () => {
    await withApi(async (request, db) => {
        const payload = { transcript_data: [{ text: 'Corrected' }], transcript_revision: 0, summary_revision: 0 };
        assert.equal((await request(`/interviews/${ids.interview}`, { method: 'PATCH', body: JSON.stringify(payload) })).status, 400);
        const result = await request(`/interviews/${ids.interview}`, { method: 'PATCH', body: JSON.stringify({ ...payload, research_revision: 0, summary_data: { forged: true } }) });
        assert.equal(result.status, 200);
        const call = db.calls.find(([kind]) => kind === 'rpc');
        assert.equal(call[1], 'research_update_interview');
        assert.deepEqual(call[2].p_transcript, [{ text: 'Corrected' }]);
        assert.equal('p_summary_data' in call[2], false);
    });
});

test('RPC conflict and missing migrations return safe actionable errors', async () => {
    const db = fakeDatabase();
    db.rpc = async () => ({ error: { message: 'RESEARCH_CONFLICT internal detail' } });
    await withApi(async (request) => {
        const result = await request('/bootstrap', { method: 'POST', body: '{}' });
        assert.equal(result.status, 409);
        assert.equal(JSON.stringify(result.body).includes('internal detail'), false);
    }, { db });
    db.rpc = async () => ({ error: { code: 'PGRST202', message: 'RPC missing; internal schema detail' } });
    await withApi(async (request) => {
        const result = await request('/bootstrap', { method: 'POST', body: '{}' });
        assert.equal(result.status, 503);
        assert.equal(result.body.code, 'RESEARCH_NOT_READY');
        assert.equal(JSON.stringify(result.body).includes('internal schema'), false);
    }, { db });
});

test('disabled job routes leave the core API available and skip all database work', async () => {
    await withApi(async (request, db) => {
        const unavailable = await request(`/interviews/${ids.interview}/summary-jobs`, { method: 'POST' });
        assert.equal(unavailable.status, 404);
        assert.equal(unavailable.body.code, 'RESEARCH_DISABLED');
        assert.deepEqual(db.calls, []);
        assert.equal((await request('/workspaces')).status, 200);
    }, { jobsEnabled: false });
});

test('all job endpoints require authenticated scope, and enqueue never exposes a lease', async () => {
    await withApi(async (request, db) => {
        const paths = [`/interviews/${ids.interview}/summary-job`, `/studies/${ids.study}/synthesis-job`, `/studies/${ids.study}/synthesis`, `/jobs/${ids.interview}`];
        for (const path of paths) assert.equal((await request(path, { headers: { Authorization: 'Bearer invalid' } })).status, 401);
        assert.deepEqual(db.calls, []);
        db.rpc = async () => ({ data: { id: ids.interview, status: 'running', claim_token: 'secret-lease', output: { content: 'internal' } } });
        const queued = await request(`/interviews/${ids.interview}/summary-jobs`, { method: 'POST' });
        assert.equal(queued.status, 202);
        assert.equal(queued.body.data.claim_token, undefined);
        assert.equal(queued.body.data.output, undefined);
        db.tables.research_analysis_jobs = [{ id: ids.interview, workspace_id: ids.foreign, output: { content: 'private' } }];
        assert.equal((await request(`/jobs/${ids.interview}`)).status, 404);
    });
});

test('synthesis reads compare manifest structure and hide findings after source changes', async () => {
    await withApi(async (request, db) => {
        db.tables.research_studies[0].context_revision = 0; db.tables.research_studies[0].current_version_id = ids.study;
        db.tables.research_analysis_jobs = [{ id: ids.interview, workspace_id: ids.research, study_id: ids.study, kind: 'study_synthesis', status: 'completed', study_revision: 0, context_revision: 0, study_version_id: ids.study,
            source_manifest: [{ id: ids.interview, transcript_revision: 1, summary_revision: 1 }], output: { findings: [{ text: 'Finding', source_ids: [ids.interview] }] } }];
        db.rpc = async () => ({ data: [{ summary_revision: 1, transcript_revision: 1, id: ids.interview }] });
        assert.equal((await request(`/studies/${ids.study}/synthesis`)).body.data.output.findings.length, 1);
        db.rpc = async () => ({ data: [{ id: ids.interview, transcript_revision: 2, summary_revision: 1 }] });
        assert.equal((await request(`/studies/${ids.study}/synthesis`)).body.data, null);
    });
});

test('job cancellation cancels queued or running workspace jobs and rejects completed or foreign jobs', async () => {
    await withApi(async (request, db) => {
        const runningId = '00000000-0000-4000-8000-000000000011';
        const doneId = '00000000-0000-4000-8000-000000000012';
        const foreignId = '00000000-0000-4000-8000-000000000013';
        db.tables.research_analysis_jobs = [
            { id: runningId, workspace_id: ids.research, study_id: ids.study, interview_id: ids.interview, kind: 'interview_summary', status: 'running', claim_token: 'lease-1' },
            { id: doneId, workspace_id: ids.research, study_id: ids.study, interview_id: ids.interview, kind: 'interview_summary', status: 'completed', output: { summary: {} } },
            { id: foreignId, workspace_id: ids.foreign, study_id: ids.study, interview_id: ids.interview, kind: 'interview_summary', status: 'queued' },
        ];
        assert.equal((await request(`/jobs/${foreignId}/cancel`, { method: 'POST' })).status, 404);
        assert.equal((await request(`/jobs/${doneId}/cancel`, { method: 'POST' })).status, 409);
        const canceled = await request(`/jobs/${runningId}/cancel`, { method: 'POST' });
        assert.equal(canceled.status, 200);
        assert.equal(canceled.body.data.status, 'canceled');
        assert.equal(canceled.body.data.claim_token, undefined);
    });
});

