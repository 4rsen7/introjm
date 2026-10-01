const express = require('express');
const { isDeepStrictEqual } = require('node:util');
const { ResearchError, assertDatabaseResult, requireProductWorkspace } = require('../../access/productScope');
const validate = require('../validation');
const { publicError } = require('../router');
const { studyResults } = require('../analytics');
const { wakeResearchWorker } = require('./worker');

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
        const study = assertDatabaseResult(await db.from('research_studies').select('id,workspace_id,revision,context_revision,auto_context_revision,current_version_id,brief_status,refresh_context_revision,flow_pending,flow_error_code,archived_at').eq('id', validate.uuid(id)).maybeSingle());
        if (!study || study.archived_at) throw new ResearchError(404, 'NOT_FOUND', 'Study not found');
        await requireProductWorkspace(db, req.researchUser.id, study.workspace_id);
        return study;
    }
    async function interviewAccess(req) {
        const interview = assertDatabaseResult(await db.from('interviews').select('*').eq('id', validate.uuid(req.params.id)).maybeSingle());
        if (!interview || !interview.study_id || interview.research_archived_at) throw new ResearchError(404, 'NOT_FOUND', 'Interview not found');
        const study = await studyAccess(req, interview.study_id);
        if (study.workspace_id !== interview.workspace_id) throw new ResearchError(404, 'NOT_FOUND', 'Interview not found');
        return { interview, study };
    }
    for (const [path, kind] of [['brief', 'brief_preparation'], ['guide', 'guide_preparation']]) {
        router.post(`/studies/:id/${path}-jobs`, authenticateRoute, route(async (req, res) => {
            const study = await studyAccess(req, req.params.id);
            const job = await rpc('research_enqueue_intelligence', { p_user_id: req.researchUser.id, p_kind: kind,
                p_study_id: study.id, p_interview_id: null, p_settings: {
                    description: validate.text(req.body?.description, 'description', 8000, true) || '',
                    answers: validate.text(req.body?.answers, 'answers', 8000, true) || '',
                } });
            wakeResearchWorker();
            send(res, publicJob(job), 202);
        }));
    }
    for (const [path, kind] of [['impact', 'transcript_impact'], ['evidence', 'interview_evidence']]) {
        router.post(`/interviews/:id/${path}-jobs`, authenticateRoute, route(async (req, res) => {
            const { study, interview } = await interviewAccess(req);
            const job = await rpc('research_enqueue_intelligence', { p_user_id: req.researchUser.id, p_kind: kind,
                p_study_id: study.id, p_interview_id: interview.id, p_settings: {} });
            wakeResearchWorker();
            send(res, publicJob(job), 202);
        }));
    }
    router.get('/studies/:id/preparation-job', authenticateRoute, route(async (req, res) => {
        const study = await studyAccess(req, req.params.id);
        const job = assertDatabaseResult(await db.from('research_analysis_jobs').select(`${JOB_COLUMNS},output,study_version_id,study_revision,source_manifest`)
            .eq('study_id', study.id).in('kind', ['brief_preparation', 'guide_preparation']).order('created_at', { ascending: false }).limit(1).maybeSingle());
        const sources = job ? await rpc('research_brief_sources', { p_study_id: study.id }) : [];
        send(res, job ? { ...job, is_current: job.study_version_id === study.current_version_id && isDeepStrictEqual(job.source_manifest, sources) } : null);
    }));
    router.get('/interviews/:id/impact', authenticateRoute, route(async (req, res) => {
        const { interview } = await interviewAccess(req);
        const job = assertDatabaseResult(await db.from('research_analysis_jobs').select(`${JOB_COLUMNS},output,transcript_version_id,study_version_id,summary_revision`)
            .eq('interview_id', interview.id).eq('kind', 'transcript_impact').order('created_at', { ascending: false }).limit(1).maybeSingle());
        const validation = job ? assertDatabaseResult(await db.from('research_summary_validations').select('id,decision,accepted_at')
            .eq('job_id', job.id).maybeSingle()) : null;
        send(res, job ? { ...job, validation } : null);
    }));
    router.get('/interviews/:id/evidence-job', authenticateRoute, route(async (req, res) => {
        const { interview } = await interviewAccess(req);
        send(res, assertDatabaseResult(await db.from('research_analysis_jobs').select(JOB_COLUMNS).eq('interview_id', interview.id)
            .eq('kind', 'interview_evidence').order('created_at', { ascending: false }).limit(1).maybeSingle()));
    }));
    router.post('/interviews/:id/summary-validations/:validationId/accept', authenticateRoute, route(async (req, res) => {
        const { interview } = await interviewAccess(req);
        send(res, await rpc('research_accept_summary_validation', { p_user_id: req.researchUser.id, p_interview_id: interview.id,
            p_validation_id: validate.uuid(req.params.validationId), p_revision: validate.revision(req.body?.research_revision) }));
    }));
    router.get('/studies/:id/results', authenticateRoute, route(async (req, res) => {
        const study = await studyAccess(req, req.params.id);
        send(res, studyResults(await rpc('research_results_snapshot', { p_user_id: req.researchUser.id, p_study_id: study.id })));
    }));
    router.patch('/outcomes/:id', authenticateRoute, route(async (req, res) => {
        const outcome = req.body?.outcome;
        if (!outcome || typeof outcome !== 'object') validate.invalid('Missing outcome');
        send(res, await rpc('research_correct_outcome', { p_user_id: req.researchUser.id, p_outcome_id: validate.uuid(req.params.id),
            p_revision: validate.revision(req.body?.evidence_revision), p_outcome: outcome }));
    }));
    router.post('/interviews/:id/summary-jobs', authenticateRoute, route(async (req, res) => {
        const interview = assertDatabaseResult(await db.from('interviews').select('id,study_id,workspace_id,research_archived_at').eq('id', validate.uuid(req.params.id)).maybeSingle());
        if (!interview || !interview.study_id || interview.research_archived_at) throw new ResearchError(404, 'NOT_FOUND', 'Interview not found');
        const study = await studyAccess(req, interview.study_id);
        if (study.workspace_id !== interview.workspace_id) throw new ResearchError(404, 'NOT_FOUND', 'Interview not found');
        const job = await rpc('research_enqueue_analysis', { p_user_id: req.researchUser.id, p_kind: 'interview_summary', p_study_id: study.id, p_interview_id: interview.id });
        wakeResearchWorker();
        send(res, publicJob(job), 202);
    }));
    router.post('/studies/:id/synthesis-jobs', authenticateRoute, route(async (req, res) => {
        const study = await studyAccess(req, req.params.id);
        const job = await rpc('research_enqueue_analysis', { p_user_id: req.researchUser.id, p_kind: 'study_synthesis', p_study_id: study.id, p_interview_id: null });
        wakeResearchWorker();
        send(res, publicJob(job), 202);
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
        const job = assertDatabaseResult(await db.from('research_analysis_jobs').select(`${JOB_COLUMNS},output,source_manifest,study_version_id,transcript_version_id,context_revision,pipeline_version`).eq('id', validate.uuid(req.params.id)).maybeSingle());
        if (!job) throw new ResearchError(404, 'NOT_FOUND', 'Job not found');
        await requireProductWorkspace(db, req.researchUser.id, job.workspace_id);
        send(res, job);
    }));
    router.post('/jobs/:id/cancel', authenticateRoute, route(async (req, res) => {
        const job = assertDatabaseResult(await db.from('research_analysis_jobs').select(JOB_COLUMNS).eq('id', validate.uuid(req.params.id)).maybeSingle());
        if (!job) throw new ResearchError(404, 'NOT_FOUND', 'Job not found');
        await requireProductWorkspace(db, req.researchUser.id, job.workspace_id);
        if (job.status === 'canceled') return send(res, publicJob(job));
        if (!['queued', 'running'].includes(job.status)) throw new ResearchError(409, 'RESEARCH_CONFLICT', 'Job is no longer active');
        const now = new Date().toISOString();
        const updated = assertDatabaseResult(await db.from('research_analysis_jobs')
            .update({ status: 'canceled', claim_token: null, lease_until: null, updated_at: now })
            .eq('id', job.id).in('status', ['queued', 'running']).select(JOB_COLUMNS).maybeSingle());
        send(res, publicJob(updated || { ...job, status: 'canceled', updated_at: now }));
    }));
    router.get('/studies/:id/synthesis', authenticateRoute, route(async (req, res) => {
        const study = await studyAccess(req, req.params.id);
        const latest = assertDatabaseResult(await db.from('research_analysis_jobs').select(`${JOB_COLUMNS},output,source_manifest,context_revision,study_version_id`)
            .eq('study_id', study.id).eq('kind', 'study_synthesis').eq('status', 'completed').order('created_at', { ascending: false }).limit(1).maybeSingle());
        const manifest = await rpc('research_synthesis_sources', { p_study_id: study.id });
        const interviews = assertDatabaseResult(await db.from('interviews').select('id,transcript_revision,status,summary_stale,summary_source_job_id,summary_source_study_revision')
            .eq('study_id', study.id).is('research_archived_at', null).limit(501));
        const hasTranscript = interviews.some(item => item.transcript_revision > 0 && item.status !== 'processing');
        const outstanding = interviews.some(item => item.status === 'processing' || (item.transcript_revision > 0
            && (item.summary_stale || !item.summary_source_job_id || item.summary_source_study_revision !== study.context_revision)));
        const briefChanged = study.auto_context_revision != null && study.auto_context_revision !== study.context_revision
            || Boolean(latest && (latest.context_revision !== study.context_revision || latest.study_version_id !== study.current_version_id));
        const isCurrent = Boolean(latest && !briefChanged && !outstanding && isDeepStrictEqual(manifest, latest.source_manifest));
        const staleReason = briefChanged ? 'brief_changed' : latest && !isCurrent ? 'sources_changed' : null;
        send(res, { id: latest?.id || null, output: latest?.output || null,
            source_manifest: latest?.source_manifest || [], context_revision: latest?.context_revision ?? null,
            study_version_id: latest?.study_version_id || null, is_current: isCurrent,
            refresh_available: study.brief_status === 'confirmed' && hasTranscript && (!isCurrent || Boolean(study.flow_error_code))
                && (!study.flow_pending || Boolean(study.flow_error_code)), stale_reason: staleReason });
    }));
    router.use((error, req, res, next) => {
        const message = String(error?.message || '');
        const safe = message.includes('RESEARCH_NO_SOURCES')
            ? new ResearchError(409, 'RESEARCH_NO_SOURCES', 'Complete a current interview summary first')
            : publicError(error);
        if (safe.status >= 500) { try { Promise.resolve(onError(error)).catch(() => {}); } catch (_) { /* safe response */ } }
        if (safe.status === 429) res.set('Retry-After', '30');
        res.status(safe.status).json({ status: 'error', code: safe.code, message: safe.message });
    });
    return router;
}
module.exports = { createResearchJobsRouter, publicJob };
