const express = require('express');
const { ResearchError, assertDatabaseResult } = require('../../access/productScope');
const { publicError } = require('../router');
const validate = require('../validation');

const JOB_FIELDS = 'id,workspace_id,study_id,interview_id,kind,status,attempts,error_code,created_at,updated_at,started_at,finished_at';
const safeJob = job => Object.fromEntries(JOB_FIELDS.split(',').map(field => [field, job[field]]));
function createResearchAdminRouter({ supabaseAdmin: db, authenticate, enabled = false, onError = () => {} }) {
    if (!db || typeof authenticate !== 'function') throw new Error('Research admin needs database and authentication');
    const router = express.Router();
    const route = handler => async (req, res, next) => { try { await handler(req, res); } catch (error) { next(error); } };
    const send = (res, data) => res.json({ status: 'success', data });
    const rpc = async (name, args) => assertDatabaseResult(await db.rpc(name, args));
    router.use(async (req, res, next) => {
        try {
            if (!(typeof enabled === 'function' ? enabled() : enabled === true)) throw new ResearchError(404, 'RESEARCH_DISABLED', 'Research admin is not enabled');
            const token = /^Bearer\s+(.+)$/i.exec(req.headers.authorization || '')?.[1];
            if (!token) throw new ResearchError(401, 'UNAUTHORIZED', 'Sign in to continue');
            const { user, error } = await authenticate(token);
            if (error || !user) throw new ResearchError(401, 'UNAUTHORIZED', 'Sign in to continue');
            const profile = assertDatabaseResult(await db.from('profiles').select('role').eq('id', user.id).maybeSingle());
            if (profile?.role !== 'admin') throw new ResearchError(403, 'RESEARCH_ADMIN_REQUIRED', 'Admin access required');
            req.researchAdmin = user;
            next();
        } catch (error) { next(error); }
    });
    router.get('/grants', route(async (req, res) => {
        const limit = validate.pageLimit(req.query.limit);
        let query = db.from('research_admin_grant_usage').select('*').order('user_id', { ascending: false }).limit(limit);
        if (req.query.before) query = query.lt('user_id', validate.uuid(req.query.before));
        send(res, assertDatabaseResult(await query) || []);
    }));
    router.put('/grants/:userId', route(async (req, res) => {
        const body = req.body || {};
        const limitKeys = ['max_studies', 'max_interviews', 'max_analyses', 'max_storage_bytes', 'max_transcription_seconds', 'max_members'];
        const limits = Object.fromEntries(limitKeys.map(key => [key, body[key]]));
        if (limitKeys.some(key => !Number.isSafeInteger(limits[key]) || limits[key] < 1)) throw new ResearchError(400, 'RESEARCH_INVALID_INPUT', 'Invalid grant limits');
        const expiry = new Date(body.expires_at);
        if (!Number.isFinite(expiry.getTime())) throw new ResearchError(400, 'RESEARCH_INVALID_INPUT', 'Invalid expiry');
        send(res, await rpc('research_admin_set_grant', { p_admin_id: req.researchAdmin.id, p_user_id: validate.uuid(req.params.userId),
            p_expires_at: expiry.toISOString(), p_limits: limits }));
    }));
    router.delete('/grants/:userId', route(async (req, res) => send(res, await rpc('research_admin_revoke_grant', {
        p_admin_id: req.researchAdmin.id, p_user_id: validate.uuid(req.params.userId),
    }))));
    router.get('/jobs', route(async (req, res) => {
        let query = db.from('research_analysis_jobs').select(JOB_FIELDS).order('created_at', { ascending: false }).limit(validate.pageLimit(req.query.limit));
        if (req.query.status) {
            if (!['queued', 'running', 'completed', 'stale', 'failed', 'canceled'].includes(req.query.status)) throw new ResearchError(400, 'RESEARCH_INVALID_INPUT', 'Invalid job status');
            query = query.eq('status', req.query.status);
        }
        if (req.query.before) {
            const before = new Date(req.query.before);
            if (!Number.isFinite(before.getTime())) throw new ResearchError(400, 'RESEARCH_INVALID_INPUT', 'Invalid cursor');
            query = query.lt('created_at', before.toISOString());
        }
        send(res, assertDatabaseResult(await query) || []);
    }));
    for (const action of ['retry', 'cancel']) router.post(`/jobs/:id/${action}`, route(async (req, res) => {
        const job = await rpc('research_admin_job_action', { p_admin_id: req.researchAdmin.id, p_job_id: validate.uuid(req.params.id), p_action: action });
        send(res, safeJob(job));
    }));
    router.get('/audit', route(async (req, res) => {
        send(res, assertDatabaseResult(await db.from('research_admin_audit').select('id,actor_id,action,target_type,target_id,details,created_at')
            .order('created_at', { ascending: false }).limit(validate.pageLimit(req.query.limit))) || []);
    }));
    router.get('/health', route(async (req, res) => {
        const [limits, heartbeats, queue] = await Promise.all([
            db.from('research_worker_limits').select('global_slots,workspace_slots,media_slots,max_pending,max_workspace_pending').limit(1).maybeSingle(),
            db.from('research_worker_heartbeats').select('id,last_seen,capabilities').order('last_seen', { ascending: false }).limit(20),
            db.from('research_admin_queue_health').select('*'),
        ]);
        send(res, { limits: assertDatabaseResult(limits), workers: assertDatabaseResult(heartbeats) || [], queue: assertDatabaseResult(queue) || [] });
    }));
    router.use((error, req, res, next) => {
        const safe = String(error?.message || '').includes('RESEARCH_ADMIN_REQUIRED')
            ? new ResearchError(403, 'RESEARCH_ADMIN_REQUIRED', 'Admin access required') : publicError(error);
        if (safe.status >= 500) { try { Promise.resolve(onError(error)).catch(() => {}); } catch (_) { /* safe response */ } }
        if (safe.status === 429) res.set('Retry-After', '30');
        res.status(safe.status).json({ status: 'error', code: safe.code, message: safe.message });
    });
    return router;
}
module.exports = { createResearchAdminRouter, safeJob };
