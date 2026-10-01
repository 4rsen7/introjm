const express = require('express');
const { ResearchError, assertDatabaseResult, listProductWorkspaces, requireProductWorkspace } = require('../access/productScope');
const validate = require('./validation');
const { wakeResearchWorker } = require('./jobs/worker');

const INTERVIEW_LIST_COLUMNS = 'id,workspace_id,study_id,user_id,title,type,status,created_at,updated_at,research_revision,transcript_revision,summary_revision,summary_stale,summary_source_study_revision,summary_source_job_id,research_participant_id,research_archived_at';
const RPC_ERRORS = {
    RESEARCH_ACCESS_REQUIRED: [403, 'Research beta access is required'],
    RESEARCH_LIMIT_REACHED: [403, 'Research beta limit reached'],
    RESEARCH_NOT_FOUND: [404, 'Resource not found'],
    RESEARCH_CONFLICT: [409, 'This record changed. Reload before saving'],
    RESEARCH_QUEUE_FULL: [429, 'Research processing queue is full; retry later'],
    RESEARCH_INVALID_INPUT: [400, 'Invalid research data'],
    RESEARCH_NO_TASKS: [409, 'Define shared tasks before analyzing task outcomes'],
    RESEARCH_CONTEXT_CHANGED: [409, 'Regenerate the summary for the current study context first'],
    RESEARCH_REPORT_TOO_LARGE: [422, 'This study exceeds the current report limit'],
    RESEARCH_BRIEF_REQUIRED: [409, 'Confirm the shared brief before analyzing interviews'],
    RESEARCH_SOURCES_PENDING: [409, 'Wait for all interviews to finish uploading'],
    RESEARCH_NO_SOURCES: [409, 'Add a completed interview first'],
    RESEARCH_INPUT_TOO_LARGE: [422, 'The uploaded interviews exceed the current analysis limit'],
};

function publicError(error) {
    if (error instanceof ResearchError) return error;
    for (const [code, [status, message]] of Object.entries(RPC_ERRORS)) {
        if (String(error?.message || '').includes(code)) return new ResearchError(status, code, message);
    }
    if (['42P01', '42703', '42883', 'PGRST202', 'PGRST204'].includes(error?.code)) {
        return new ResearchError(503, 'RESEARCH_NOT_READY', 'Research setup is not complete');
    }
    return new ResearchError(500, 'RESEARCH_ERROR', 'Research request failed');
}

function createResearchRouter({ supabaseAdmin: db, authenticate, enabled = false, onError = () => {} }) {
    if (!db || typeof authenticate !== 'function') throw new Error('Research requires database and authenticate dependencies');
    const router = express.Router();
    const route = (handler) => async (req, res, next) => {
        try { await handler(req, res); } catch (error) { next(error); }
    };
    const send = (res, data, status = 200) => res.status(status).json({ status: 'success', data });
    const rpc = async (name, args) => assertDatabaseResult(await db.rpc(name, args));
    router.use(async (req, res, next) => {
        try {
            if (!(typeof enabled === 'function' ? enabled() : enabled === true)) {
                throw new ResearchError(404, 'RESEARCH_DISABLED', 'Research is not enabled');
            }
            const token = /^Bearer\s+(.+)$/i.exec(req.headers.authorization || '')?.[1];
            if (!token) throw new ResearchError(401, 'UNAUTHORIZED', 'Sign in to continue');
            const { user, error } = await authenticate(token);
            if (error || !user) throw new ResearchError(401, 'UNAUTHORIZED', 'Sign in to continue');
            req.researchUser = user;
            next();
        } catch (error) { next(error); }
    });

    async function studyAccess(userId, studyId) {
        const study = assertDatabaseResult(await db.from('research_studies').select('*').eq('id', validate.uuid(studyId)).is('archived_at', null).maybeSingle());
        if (!study) throw new ResearchError(404, 'NOT_FOUND', 'Study not found');
        await requireProductWorkspace(db, userId, study.workspace_id);
        return study;
    }
    async function interviewAccess(userId, interviewId) {
        const interview = assertDatabaseResult(await db.from('interviews').select('*').eq('id', validate.uuid(interviewId)).is('research_archived_at', null).maybeSingle());
        if (!interview || !interview.study_id) throw new ResearchError(404, 'NOT_FOUND', 'Interview not found');
        const study = await studyAccess(userId, interview.study_id);
        if (study.workspace_id !== interview.workspace_id) throw new ResearchError(404, 'NOT_FOUND', 'Interview not found');
        return interview;
    }

    router.get('/workspaces', route(async (req, res) => send(res, await listProductWorkspaces(db, req.researchUser.id))));
    router.post('/bootstrap', route(async (req, res) => {
        const result = await rpc('research_bootstrap', {
            p_user_id: req.researchUser.id,
            p_name: req.body?.name == null ? 'Research workspace' : validate.text(req.body.name, 'name'),
        });
        const workspace = Array.isArray(result) ? result[0] : result;
        if (!workspace) throw new ResearchError(503, 'RESEARCH_NOT_READY', 'Research setup is not complete');
        send(res, await requireProductWorkspace(db, req.researchUser.id, workspace.id));
    }));
    router.get('/studies', route(async (req, res) => {
        const workspaceId = validate.uuid(req.query.workspace_id, 'workspace_id');
        await requireProductWorkspace(db, req.researchUser.id, workspaceId);
        let query = db.from('research_studies').select('*').eq('workspace_id', workspaceId).is('archived_at', null)
            .order('id', { ascending: false }).limit(validate.pageLimit(req.query.limit));
        if (req.query.before) query = query.lt('id', validate.uuid(req.query.before, 'before'));
        send(res, assertDatabaseResult(await query) || []);
    }));
    router.post('/studies', route(async (req, res) => {
        const body = req.body || {};
        const workspaceId = validate.uuid(body.workspace_id, 'workspace_id');
        await requireProductWorkspace(db, req.researchUser.id, workspaceId);
        const args = { p_user_id: req.researchUser.id, p_workspace_id: workspaceId,
            p_title: validate.text(body.title, 'title'),
            p_goal: body.brief_status === 'draft' ? validate.text(body.goal || '', 'goal', 12000, true) || '' : validate.text(body.goal, 'goal', 12000),
            p_brief: validate.text(body.brief, 'brief', 30000, true) };
        if (body.brief_status != null && !['draft', 'confirmed'].includes(body.brief_status)) throw new ResearchError(400, 'RESEARCH_INVALID_INPUT', 'Invalid brief status');
        send(res, await rpc(body.brief_status == null && body.plan == null ? 'research_create_study' : 'research_create_study_flow',
            body.brief_status == null && body.plan == null ? args : { ...args, p_brief_status: body.brief_status || 'confirmed',
                p_plan: validate.studyPlan(body.plan || {}) }), 201);
    }));
    router.get('/studies/:id', route(async (req, res) => send(res, await studyAccess(req.researchUser.id, req.params.id))));
    async function saveSharedBrief(req, res, confirm) {
        const study = await studyAccess(req.researchUser.id, req.params.id);
        const body = req.body || {};
        const saved = await rpc('research_save_brief', {
            p_user_id: req.researchUser.id, p_study_id: study.id, p_revision: validate.revision(body.revision),
            p_title: validate.text(body.title, 'title'), p_goal: validate.text(body.goal, 'goal', 12000),
            p_brief: validate.text(body.brief, 'brief', 30000, true), p_plan: validate.studyPlan(body.plan),
            p_confirm: confirm, p_preparation_job_id: body.preparation_job_id ? validate.uuid(body.preparation_job_id) : null,
        });
        if (confirm) wakeResearchWorker();
        send(res, saved);
    }
    router.post('/studies/:id/brief-confirm', route((req, res) => saveSharedBrief(req, res, true)));
    router.patch('/studies/:id/brief', route((req, res) => saveSharedBrief(req, res, false)));
    router.post('/studies/:id/refresh-results', route(async (req, res) => {
        const study = await studyAccess(req.researchUser.id, req.params.id);
        const result = await rpc('research_refresh_results', { p_user_id: req.researchUser.id, p_study_id: study.id,
            p_revision: validate.revision(req.body?.revision) });
        wakeResearchWorker();
        send(res, result);
    }));
    router.post('/studies/:id/upload-batches', route(async (req, res) => {
        const study = await studyAccess(req.researchUser.id, req.params.id);
        send(res, await rpc('research_upload_batch', { p_user_id: req.researchUser.id, p_study_id: study.id, p_batch_id: null }));
    }));
    router.post('/studies/:id/upload-batches/complete', route(async (req, res) => {
        const study = await studyAccess(req.researchUser.id, req.params.id);
        const result = await rpc('research_upload_batch', { p_user_id: req.researchUser.id, p_study_id: study.id,
            p_batch_id: validate.uuid(req.body?.batch_id, 'batch_id') });
        wakeResearchWorker();
        send(res, result);
    }));
    router.post('/studies/:id/versions', route(async (req, res) => {
        const study = await studyAccess(req.researchUser.id, req.params.id);
        if (req.body?.preparation_job_id) {
            return send(res, await rpc('research_accept_preparation', { p_user_id: req.researchUser.id, p_study_id: study.id,
                p_job_id: validate.uuid(req.body.preparation_job_id), p_revision: validate.revision(req.body.revision),
                p_goal: validate.text(req.body.goal, 'goal', 12000), p_brief: validate.text(req.body.brief, 'brief', 30000, true),
                p_plan: validate.studyPlan(req.body.plan) }));
        }
        send(res, await rpc('research_save_study_version', {
            p_user_id: req.researchUser.id, p_study_id: study.id,
            p_revision: validate.revision(req.body?.revision), p_plan: validate.studyPlan(req.body?.plan),
        }));
    }));
    router.get('/studies/:id/versions', route(async (req, res) => {
        const study = await studyAccess(req.researchUser.id, req.params.id);
        let query = db.from('research_study_versions').select('id,study_id,context_revision,goal,created_at').eq('study_id', study.id)
            .order('context_revision', { ascending: false }).limit(validate.pageLimit(req.query.limit));
        if (req.query.before != null) query = query.lt('context_revision', validate.revision(Number(req.query.before)));
        send(res, assertDatabaseResult(await query) || []);
    }));
    router.get('/studies/:id/versions/:versionId', route(async (req, res) => {
        const study = await studyAccess(req.researchUser.id, req.params.id);
        const version = assertDatabaseResult(await db.from('research_study_versions').select('*')
            .eq('study_id', study.id).eq('id', validate.uuid(req.params.versionId)).maybeSingle());
        if (!version) throw new ResearchError(404, 'NOT_FOUND', 'Version not found');
        send(res, version);
    }));
    router.get('/studies/:id/participants', route(async (req, res) => {
        const study = await studyAccess(req.researchUser.id, req.params.id);
        let query = db.from('research_study_participants').select('id,study_id,pseudonym')
            .eq('study_id', study.id).order('id', { ascending: false }).limit(validate.pageLimit(req.query.limit));
        if (req.query.before) query = query.lt('id', validate.uuid(req.query.before, 'before'));
        send(res, assertDatabaseResult(await query) || []);
    }));
    router.post('/studies/:id/participants', route(async (req, res) => {
        const study = await studyAccess(req.researchUser.id, req.params.id);
        send(res, await rpc('research_create_participant', { p_user_id: req.researchUser.id, p_study_id: study.id,
            p_pseudonym: validate.text(req.body?.pseudonym, 'pseudonym', 120) }), 201);
    }));
    router.patch('/studies/:id', route(async (req, res) => {
        const study = await studyAccess(req.researchUser.id, req.params.id);
        const body = req.body || {};
        send(res, await rpc('research_update_study', {
            p_user_id: req.researchUser.id, p_study_id: study.id,
            p_revision: validate.revision(body.revision),
            p_title: body.title === undefined ? study.title : validate.text(body.title, 'title'),
            p_goal: body.goal === undefined ? study.goal : validate.text(body.goal, 'goal', 12000),
            p_brief: body.brief === undefined ? study.brief : validate.text(body.brief, 'brief', 30000, true),
            p_archive: false,
        }));
    }));
    router.delete('/studies/:id', route(async (req, res) => {
        const study = await studyAccess(req.researchUser.id, req.params.id);
        send(res, await rpc('research_update_study', {
            p_user_id: req.researchUser.id, p_study_id: study.id, p_revision: validate.revision(req.body?.revision),
            p_title: study.title, p_goal: study.goal, p_brief: study.brief, p_archive: true,
        }));
    }));
    router.get('/studies/:id/interviews', route(async (req, res) => {
        const study = await studyAccess(req.researchUser.id, req.params.id);
        let query = db.from('interviews').select(INTERVIEW_LIST_COLUMNS).eq('study_id', study.id).eq('workspace_id', study.workspace_id)
            .is('research_archived_at', null).order('id', { ascending: false }).limit(validate.pageLimit(req.query.limit));
        if (req.query.before) query = query.lt('id', validate.uuid(req.query.before, 'before'));
        send(res, assertDatabaseResult(await query) || []);
    }));
    router.post('/studies/:id/interviews', route(async (req, res) => {
        const study = await studyAccess(req.researchUser.id, req.params.id);
        send(res, await rpc('research_create_interview', {
            p_user_id: req.researchUser.id, p_study_id: study.id,
            p_title: validate.text(req.body?.title, 'title'),
        }), 201);
    }));
    router.get('/interviews/:id', route(async (req, res) => send(res, await interviewAccess(req.researchUser.id, req.params.id))));
    router.patch('/interviews/:id/participant', route(async (req, res) => {
        const interview = await interviewAccess(req.researchUser.id, req.params.id);
        send(res, await rpc('research_assign_participant', { p_user_id: req.researchUser.id, p_interview_id: interview.id,
            p_participant_id: req.body?.participant_id === null ? null : validate.uuid(req.body?.participant_id, 'participant_id'),
            p_revision: validate.revision(req.body?.research_revision, 'research_revision') }));
    }));
    router.get('/interviews/:id/transcript-versions', route(async (req, res) => {
        const interview = await interviewAccess(req.researchUser.id, req.params.id);
        let query = db.from('research_transcript_versions').select('id,interview_id,transcript_revision,origin,author_id,created_at')
            .eq('interview_id', interview.id).order('transcript_revision', { ascending: false }).limit(validate.pageLimit(req.query.limit));
        if (req.query.before != null) query = query.lt('transcript_revision', validate.revision(Number(req.query.before)));
        send(res, assertDatabaseResult(await query) || []);
    }));
    router.get('/interviews/:id/transcript-versions/:versionId', route(async (req, res) => {
        const interview = await interviewAccess(req.researchUser.id, req.params.id);
        const version = assertDatabaseResult(await db.from('research_transcript_versions').select('*')
            .eq('interview_id', interview.id).eq('id', validate.uuid(req.params.versionId)).maybeSingle());
        if (!version) throw new ResearchError(404, 'NOT_FOUND', 'Version not found');
        send(res, version);
    }));
    async function updateInterview(req, res, archive) {
        const interview = await interviewAccess(req.researchUser.id, req.params.id);
        const body = req.body || {};
        send(res, await rpc('research_update_interview', {
            p_user_id: req.researchUser.id, p_interview_id: interview.id,
            p_revision: validate.revision(body.research_revision, 'research_revision'),
            p_transcript_revision: validate.revision(body.transcript_revision, 'transcript_revision'),
            p_summary_revision: validate.revision(body.summary_revision, 'summary_revision'),
            p_title: body.title === undefined ? interview.title : validate.text(body.title, 'title'),
            p_transcript: body.transcript_data === undefined ? interview.transcript_data : validate.transcript(body.transcript_data),
            p_archive: archive,
        }));
    }
    router.patch('/interviews/:id', route((req, res) => updateInterview(req, res, false)));
    router.delete('/interviews/:id', route((req, res) => updateInterview(req, res, true)));
    router.use((req, res) => res.status(404).json({ status: 'error', code: 'NOT_FOUND', message: 'Research route not found' }));
    router.use((error, req, res, next) => {
        const safe = publicError(error);
        if (safe.status >= 500) {
            try { Promise.resolve(onError(error)).catch(() => {}); } catch (_) { /* logging cannot expose a raw error */ }
        }
        if (safe.status === 429) res.set('Retry-After', '30');
        res.status(safe.status).json({ status: 'error', code: safe.code, message: safe.message });
    });
    return router;
}

module.exports = { createResearchRouter, publicError, INTERVIEW_LIST_COLUMNS };
