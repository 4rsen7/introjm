const express = require('express');
const { isDeepStrictEqual } = require('node:util');
const { ResearchError, assertDatabaseResult, requireProductWorkspace } = require('../../access/productScope');
const validate = require('../validation');
const { publicError } = require('../router');

const JOB_COLUMNS = 'id,workspace_id,study_id,interview_id,kind,status,attempts,error_code,created_at,updated_at';
const publicJob = job => Object.fromEntries(JOB_COLUMNS.split(',').map(key => [key, job[key]]));
function createResearchJobsRouter({ supabaseAdmin: db, authenticate, enabled = false, onError = () => {} }) {
    if (!db || typeof authenticate !== 'function') throw new Error('Research jobs require database and authenticate dependencies');
    const router = express.Router();
    const route = fn => async (req, res, next) => { try { await fn(req, res); } catch (error) { next(error); } };
    const send = (res, data, status = 200) => res.status(status).json({ status: 'success', data });
    const rpc = async (name, args) => assertDatabaseResult(await db.rpc(name, args));
    const authenticateRoute = async (req, res, next) => {
        try {
            if (!(typeof enabled === 'function' ? enabled() : enabled === true)) throw new ResearchError(404, 'RESEARCH_DISABLED', 'Research is not enabled');
            const token = /^Bearer\s+(.+)$/i.exec(req.headers.authorization || '')?.[1];
            if (!token) throw new ResearchError(401, 'UNAUTHORIZED', 'Sign in to continue');
            const { user, error } = await authenticate(token);
            if (error || !user) throw new ResearchError(401, 'UNAUTHORIZED', 'Sign in to continue');
            req.researchUser = user;
            next();
        } catch (error) { next(error); }
    };
    async function studyAccess(req, id) {
        const study = assertDatabaseResult(await db.from('research_studies').select('id,workspace_id,revision,archived_at').eq('id', validate.uuid(id)).maybeSingle());
        if (!study || study.archived_at) throw new ResearchError(404, 'NOT_FOUND', 'Study not found');
        await requireProductWorkspace(db, req.researchUser.id, study.workspace_id);
        return study;
    }
    router.post('/interviews/:id/summary-jobs', authenticateRoute, route(async (req, res) => {
        const interview = assertDatabaseResult(await db.from('interviews').select('id,study_id,workspace_id,research_archived_at').eq('id', validate.uuid(req.params.id)).maybeSingle());
        if (!interview || !interview.study_id || interview.research_archived_at) throw new ResearchError(404, 'NOT_FOUND', 'Interview not found');
        const study = await studyAccess(req, interview.study_id);
        if (study.workspace_id !== interview.workspace_id) throw new ResearchError(404, 'NOT_FOUND', 'Interview not found');
        send(res, publicJob(await rpc('research_enqueue_analysis', { p_user_id: req.researchUser.id, p_kind: 'interview_summary', p_study_id: study.id, p_interview_id: interview.id })), 202);
    }));
    router.post('/studies/:id/synthesis-jobs', authenticateRoute, route(async (req, res) => {
        const study = await studyAccess(req, req.params.id);
        send(res, publicJob(await rpc('research_enqueue_analysis', { p_user_id: req.researchUser.id, p_kind: 'study_synthesis', p_study_id: study.id, p_interview_id: null })), 202);
    }));
    router.get('/interviews/:id/summary-job', authenticateRoute, route(async (req, res) => {
        const interview = assertDatabaseResult(await db.from('interviews').select('id,study_id,workspace_id,research_archived_at').eq('id', validate.uuid(req.params.id)).maybeSingle());
        if (!interview || !interview.study_id || interview.research_archived_at) throw new ResearchError(404, 'NOT_FOUND', 'Interview not found');
        const study = await studyAccess(req, interview.study_id);
        if (study.workspace_id !== interview.workspace_id) throw new ResearchError(404, 'NOT_FOUND', 'Interview not found');
        const latest = assertDatabaseResult(await db.from('research_analysis_jobs').select(JOB_COLUMNS).eq('interview_id', interview.id)
            .eq('kind', 'interview_summary').order('created_at', { ascending: false }).limit(1).maybeSingle());
        send(res, latest || null);
    }));
    router.get('/studies/:id/synthesis-job', authenticateRoute, route(async (req, res) => {
        const study = await studyAccess(req, req.params.id);
        const latest = assertDatabaseResult(await db.from('research_analysis_jobs').select(JOB_COLUMNS).eq('study_id', study.id)
            .eq('kind', 'study_synthesis').order('created_at', { ascending: false }).limit(1).maybeSingle());
        send(res, latest || null);
    }));
    router.get('/jobs/:id', authenticateRoute, route(async (req, res) => {
        const job = assertDatabaseResult(await db.from('research_analysis_jobs').select(`${JOB_COLUMNS},output,source_manifest`).eq('id', validate.uuid(req.params.id)).maybeSingle());
        if (!job) throw new ResearchError(404, 'NOT_FOUND', 'Job not found');
        await requireProductWorkspace(db, req.researchUser.id, job.workspace_id);
        send(res, job);
    }));
    router.get('/studies/:id/synthesis', authenticateRoute, route(async (req, res) => {
        const study = await studyAccess(req, req.params.id);
        const latest = assertDatabaseResult(await db.from('research_analysis_jobs').select(`${JOB_COLUMNS},output,source_manifest,study_revision`)
            .eq('study_id', study.id).eq('kind', 'study_synthesis').eq('status', 'completed').order('created_at', { ascending: false }).limit(1).maybeSingle());
        if (!latest || latest.study_revision !== study.revision) return send(res, null);
        const manifest = await rpc('research_synthesis_sources', { p_study_id: study.id });
        send(res, isDeepStrictEqual(manifest, latest.source_manifest) ? latest : null);
    }));
    router.use((error, req, res, next) => {
        const message = String(error?.message || '');
        const safe = message.includes('RESEARCH_NO_SOURCES')
            ? new ResearchError(409, 'RESEARCH_NO_SOURCES', 'Complete a current interview summary first')
            : publicError(error);
        if (safe.status >= 500) { try { Promise.resolve(onError(error)).catch(() => {}); } catch (_) { /* safe response */ } }
        res.status(safe.status).json({ status: 'error', code: safe.code, message: safe.message });
    });
    return router;
}
module.exports = { createResearchJobsRouter, publicJob };
