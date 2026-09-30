const express = require('express');
const { randomBytes, createHash } = require('node:crypto');
const { ResearchError, assertDatabaseResult, requireProductWorkspace } = require('../../access/productScope');
const { publicError } = require('../router');
const validate = require('../validation');

const digest = token => createHash('sha256').update(token).digest('hex');
const INVITE_FIELDS = 'id,workspace_id,email,expires_at,created_by,accepted_at,accepted_by,revoked_at,created_at';
function createResearchTeamRouter({ supabaseAdmin: db, authenticate, enabled = false, onError = () => {} }) {
    if (!db || typeof authenticate !== 'function') throw new Error('Research team needs database and authentication');
    const router = express.Router();
    const route = handler => async (req, res, next) => { try { await handler(req, res); } catch (error) { next(error); } };
    const send = (res, data, code = 200) => res.status(code).json({ status: 'success', data });
    const rpc = async (name, args) => assertDatabaseResult(await db.rpc(name, args));
    const auth = async (req, res, next) => {
        try {
            if (!(typeof enabled === 'function' ? enabled() : enabled === true)) throw new ResearchError(404, 'RESEARCH_DISABLED', 'Research team is not enabled');
            const token = /^Bearer\s+(.+)$/i.exec(req.headers.authorization || '')?.[1];
            if (!token) throw new ResearchError(401, 'UNAUTHORIZED', 'Sign in to continue');
            const { user, error } = await authenticate(token);
            if (error || !user) throw new ResearchError(401, 'UNAUTHORIZED', 'Sign in to continue');
            req.researchUser = user;
            next();
        } catch (error) { next(error); }
    };
    async function owner(req, id) {
        const workspace = await requireProductWorkspace(db, req.researchUser.id, validate.uuid(id));
        if (workspace.role !== 'owner') throw new ResearchError(404, 'NOT_FOUND', 'Workspace not found');
        return workspace;
    }
    router.put('/workspaces/:id', auth, route(async (req, res) => {
        const { id } = req.params;
        const { name } = req.body;
        if (!name || typeof name !== 'string') throw new ResearchError(400, 'VALIDATION_FAILED', 'Invalid workspace name');
        const { data: member } = await db.from('workspace_members').select('role').eq('workspace_id', id).eq('user_id', req.researchUser.id).maybeSingle();
        if (member?.role !== 'owner') throw new ResearchError(403, 'RESEARCH_ACCESS_DENIED', 'Only workspace owners can rename workspaces');
        
        const { error } = await db.from('workspaces').update({ name: name.trim() }).eq('id', id);
        if (error) throw error;
        
        return send(res, { status: 'success' }, 200);
    }));
    router.get('/workspaces/:id/invites', auth, route(async (req, res) => {
        const workspace = await owner(req, req.params.id);
        send(res, assertDatabaseResult(await db.from('research_team_invites').select(INVITE_FIELDS).eq('workspace_id', workspace.id)
            .order('created_at', { ascending: false }).limit(validate.pageLimit(req.query.limit))) || []);
    }));
    router.post('/workspaces/:id/invites', auth, route(async (req, res) => {
        const workspace = await owner(req, req.params.id);
        const email = String(req.body?.email || '').trim().toLowerCase();
        const expiry = new Date(req.body?.expires_at);
        if (!Number.isFinite(expiry.getTime()) || email.length > 320) throw new ResearchError(400, 'RESEARCH_INVALID_INPUT', 'Invalid invitation');
        const token = randomBytes(32).toString('hex');
        const invite = await rpc('research_create_team_invite', { p_user_id: req.researchUser.id, p_workspace_id: workspace.id,
            p_email: email, p_token_hash: digest(token), p_expires_at: expiry.toISOString() });
        send(res, { ...invite, token, invite_path: `/research/invite/${token}` }, 201);
    }));
    router.delete('/invites/:id', auth, route(async (req, res) => send(res, await rpc('research_revoke_team_invite', {
        p_user_id: req.researchUser.id, p_invite_id: validate.uuid(req.params.id),
    }))));
    router.post('/invites/:token/accept', auth, route(async (req, res) => {
        const token = String(req.params.token || '');
        if (!/^[0-9a-f]{64}$/.test(token)) throw new ResearchError(404, 'NOT_FOUND', 'Invitation not found');
        send(res, await rpc('research_accept_team_invite', { p_user_id: req.researchUser.id, p_token_hash: digest(token) }));
    }));
    router.get('/workspaces/:id/members', auth, route(async (req, res) => {
        const workspace = await requireProductWorkspace(db, req.researchUser.id, validate.uuid(req.params.id));
        send(res, assertDatabaseResult(await db.from('workspace_members').select('user_id,role').eq('workspace_id', workspace.id)
            .order('user_id', { ascending: false }).limit(validate.pageLimit(req.query.limit))) || []);
    }));
    router.delete('/workspaces/:id/members/:userId', auth, route(async (req, res) => {
        const workspace = await owner(req, req.params.id);
        send(res, await rpc('research_remove_team_member', { p_user_id: req.researchUser.id,
            p_workspace_id: workspace.id, p_member_id: validate.uuid(req.params.userId) }));
    }));
    router.get('/workspaces/:id/usage', auth, route(async (req, res) => {
        const workspace = await requireProductWorkspace(db, req.researchUser.id, validate.uuid(req.params.id));
        const row = assertDatabaseResult(await db.from('workspaces').select('owner_id').eq('id', workspace.id).maybeSingle());
        if (!row?.owner_id) return send(res, null);
        const usage = assertDatabaseResult(await db.from('research_admin_grant_usage')
            .select('expires_at,max_studies,max_interviews,max_analyses,max_storage_bytes,max_transcription_seconds,max_members,studies_used,interviews_used,analyses_used,storage_bytes_used,transcription_seconds_used,members_used')
            .eq('user_id', row.owner_id).maybeSingle());
        send(res, usage || null);
    }));
    router.use((error, req, res, next) => {
        const safe = publicError(error);
        if (safe.status >= 500) { try { Promise.resolve(onError(error)).catch(() => {}); } catch (_) { /* safe response */ } }
        res.status(safe.status).json({ status: 'error', code: safe.code, message: safe.message });
    });
    return router;
}
module.exports = { createResearchTeamRouter, digest };
