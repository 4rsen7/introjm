const express = require('express');
const { createHash } = require('node:crypto');
const { mkdtemp, rm, open } = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { Readable } = require('node:stream');
const { ResearchError, assertDatabaseResult, requireProductWorkspace } = require('../../access/productScope');
const { publicError } = require('../router');
const { publicJob } = require('../jobs/router');
const validate = require('../validation');
const { createTranscriptionService } = require('../../interviews/transcription');

const BUCKET = 'research-recordings';
const MAX_BYTES = 100 * 1024 * 1024;
const MAX_DURATION = 7200;
const ASSET_FIELDS = ['id', 'interview_id', 'study_id', 'status', 'declared_size_bytes', 'verified_size_bytes',
    'verified_mime', 'duration_seconds', 'auto_summary', 'expires_at', 'retention_until', 'created_at', 'updated_at'];
const publicAsset = asset => Object.fromEntries(ASSET_FIELDS.map(key => [key, asset[key]]));
const rpc = async (db, name, args) => assertDatabaseResult(await db.rpc(name, args));

function sniffMime(head) {
    if (head.subarray(0, 3).toString() === 'ID3' || (head[0] === 0xff && (head[1] & 0xe0) === 0xe0)) return 'audio/mpeg';
    if (head.subarray(0, 4).toString() === 'RIFF' && head.subarray(8, 12).toString() === 'WAVE') return 'audio/wav';
    if (head.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]))) return 'audio/webm';
    if (head.subarray(4, 8).toString() === 'ftyp') return 'audio/mp4';
    throw new ResearchError(400, 'RESEARCH_INVALID_MEDIA', 'Unsupported recording format');
}

async function downloadBounded(storage, key, filePath, maxBytes = MAX_BYTES, { signal } = {}) {
    const controller = new AbortController();
    const abort = () => { controller.abort(); stream?.destroy?.(new Error('Recording download aborted')); };
    let timeout, stream;
    signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) controller.abort();
    const deadline = new Promise((_, reject) => { timeout = setTimeout(() => {
        controller.abort();
        stream?.destroy?.(new Error('Recording download timed out'));
        reject(new Error('Recording download timed out'));
    }, 120000); });
    try { return await Promise.race([read(), deadline]); } finally { clearTimeout(timeout); signal?.removeEventListener('abort', abort); }
    async function read() {
    const input = await storage.downloadStream(BUCKET, key, { signal: controller.signal });
    stream = typeof input?.getReader === 'function' ? Readable.fromWeb(input) : input;
    if (!stream || typeof stream[Symbol.asyncIterator] !== 'function') throw new Error('Storage adapter must return a readable stream');
    const target = await open(filePath, 'w', 0o600);
    const hash = createHash('sha256');
    let bytes = 0;
    let head = Buffer.alloc(0);
    try {
        for await (const part of stream) {
            const chunk = Buffer.from(part);
            bytes += chunk.length;
            if (bytes > maxBytes) {
                stream.destroy?.();
                throw new ResearchError(413, 'RESEARCH_MEDIA_TOO_LARGE', 'Recording exceeds the upload limit');
            }
            if (head.length < 16) head = Buffer.concat([head, chunk.subarray(0, 16 - head.length)]);
            hash.update(chunk);
            await target.write(chunk);
        }
    } finally { await target.close(); }
    return { sizeBytes: bytes, sha256: hash.digest('hex'), mime: sniffMime(head) };
    }
}

function createResearchTranscriptionService({ env = process.env, logger = console, spawnImpl = spawn } = {}) {
    const safeLogger = { info() {}, warn() { logger.warn?.('Research transcription warning'); }, error() { logger.error?.('Research transcription error'); } };
    const boundedSpawn = (binary, args, options) => {
        const child = spawnImpl(binary, ['-threads', '1', '-filter_threads', '1', '-max_alloc', '67108864', ...args], options);
        const timeout = setTimeout(() => child.kill('SIGKILL'), 120000);
        child.once('close', () => clearTimeout(timeout));
        child.once('error', () => clearTimeout(timeout));
        return child;
    };
    return createTranscriptionService({ env, logger: safeLogger, spawn: boundedSpawn, logSystemEvent: async () => {} });
}

function probeDuration(filePath, { spawnImpl = spawn, timeoutMs = 20000 } = {}) {
    return new Promise((resolve, reject) => {
        const child = spawnImpl('ffprobe', ['-v', 'error', '-threads', '1', '-show_entries', 'format=duration:stream=codec_type', '-of', 'json', filePath],
            { stdio: ['ignore', 'pipe', 'pipe'] });
        let output = '';
        const timeout = setTimeout(() => { child.kill('SIGKILL'); reject(new Error('Media probe timed out')); }, timeoutMs);
        child.stdout.on('data', chunk => { output += chunk.toString(); if (output.length > 8192) child.kill('SIGKILL'); });
        child.on('error', error => { clearTimeout(timeout); reject(error); });
        child.on('close', code => {
            clearTimeout(timeout);
            let details;
            try { details = JSON.parse(output); } catch (_) { details = null; }
            const seconds = Number(details?.format?.duration);
            if (code !== 0 || !Number.isFinite(seconds) || seconds < 1 || seconds > MAX_DURATION
                || !details?.streams?.some(stream => stream.codec_type === 'audio'))
                reject(new ResearchError(400, 'RESEARCH_INVALID_MEDIA', 'Recording duration or audio track is invalid'));
            else resolve({ durationSeconds: Math.ceil(seconds), hasVideo: details.streams.some(stream => stream.codec_type === 'video') });
        });
    });
}

async function withTempFile(operation) {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'research-media-'));
    const filePath = path.join(directory, 'recording');
    try { return await operation(filePath, directory); } finally { await rm(directory, { recursive: true, force: true }); }
}

async function bounded(operation, timeoutMs) {
    let timeout;
    try { return await Promise.race([operation, new Promise((_, reject) => { timeout = setTimeout(() => reject(new Error('Research transcription timed out')), timeoutMs); })]); }
    finally { clearTimeout(timeout); }
}

function createResearchMediaRouter({ supabaseAdmin: db, authenticate, enabled = false, storage, probeMedia = probeDuration, onError = () => {} }) {
    if (!db || typeof authenticate !== 'function' || !storage?.createSignedUploadUrl || !storage?.downloadStream || !storage?.copy || !storage?.remove)
        throw new Error('Research media requires database, auth and private storage adapters');
    const router = express.Router();
    const route = fn => async (req, res, next) => { try { await fn(req, res); } catch (error) { next(error); } };
    const send = (res, data, code = 200) => res.status(code).json({ status: 'success', data });
    const auth = async (req, res, next) => {
        try {
            if (!(typeof enabled === 'function' ? enabled() : enabled === true)) throw new ResearchError(404, 'RESEARCH_DISABLED', 'Research media is not enabled');
            const token = /^Bearer\s+(.+)$/i.exec(req.headers.authorization || '')?.[1];
            if (!token) throw new ResearchError(401, 'UNAUTHORIZED', 'Sign in to continue');
            const { user, error } = await authenticate(token);
            if (error || !user) throw new ResearchError(401, 'UNAUTHORIZED', 'Sign in to continue');
            req.researchUser = user;
            next();
        } catch (error) { next(error); }
    };
    async function assetAccess(req, id) {
        const asset = assertDatabaseResult(await db.from('research_source_assets').select('*').eq('id', validate.uuid(id)).maybeSingle());
        if (!asset) throw new ResearchError(404, 'NOT_FOUND', 'Upload not found');
        await requireProductWorkspace(db, req.researchUser.id, asset.workspace_id);
        return asset;
    }
    router.post('/interviews/:id/uploads', auth, route(async (req, res) => {
        const size = Number(req.body?.size_bytes);
        if (!Number.isInteger(size) || size < 1 || size > MAX_BYTES) throw new ResearchError(400, 'RESEARCH_INVALID_INPUT', 'Invalid recording size');
        const asset = await rpc(db, 'research_begin_upload', { p_user_id: req.researchUser.id, p_interview_id: validate.uuid(req.params.id),
            p_size_bytes: size, p_auto_summary: req.body?.auto_summary === true });
        try {
            const signed = await storage.createSignedUploadUrl(BUCKET, asset.upload_key);
            send(res, { asset: publicAsset(asset), signed_upload: signed }, 201);
        } catch (error) {
            await rpc(db, 'research_cancel_upload', { p_user_id: req.researchUser.id, p_asset_id: asset.id });
            throw error;
        }
    }));
    router.get('/interviews/:id/uploads', auth, route(async (req, res) => {
        const interview = assertDatabaseResult(await db.from('interviews').select('id,workspace_id,study_id').eq('id', validate.uuid(req.params.id)).maybeSingle());
        if (!interview?.study_id) throw new ResearchError(404, 'NOT_FOUND', 'Interview not found');
        await requireProductWorkspace(db, req.researchUser.id, interview.workspace_id);
        const assets = assertDatabaseResult(await db.from('research_source_assets').select(ASSET_FIELDS.join(',')).eq('interview_id', interview.id)
            .order('created_at', { ascending: false }).limit(20));
        send(res, assets || []);
    }));
    router.post('/uploads/:id/complete', auth, route(async (req, res) => {
        const asset = await assetAccess(req, req.params.id);
        if (['ready', 'processing', 'completed', 'failed'].includes(asset.status)) {
            const result = await rpc(db, 'research_finalize_upload', { p_user_id: req.researchUser.id, p_asset_id: asset.id,
                p_size_bytes: asset.verified_size_bytes, p_sha256: asset.sha256, p_mime: asset.verified_mime,
                p_duration_seconds: asset.duration_seconds, p_auto_summary: asset.auto_summary });
            return send(res, { asset: publicAsset(result.asset), job: publicJob(result.job) }, 202);
        }
        if (asset.status !== 'awaiting_upload') throw new ResearchError(409, 'RESEARCH_CONFLICT', 'Upload is no longer active');
        const result = await withTempFile(async filePath => {
            const incoming = await downloadBounded(storage, asset.upload_key, filePath, asset.declared_size_bytes);
            const probe = await probeMedia(filePath);
            const seconds = typeof probe === 'number' ? probe : probe.durationSeconds;
            const verifiedMime = incoming.mime === 'audio/mp4' && probe.hasVideo ? 'video/mp4' : incoming.mime;
            await storage.copy(BUCKET, asset.upload_key, asset.object_key);
            try {
                const checked = await withTempFile(p => downloadBounded(storage, asset.object_key, p, asset.declared_size_bytes));
                if (checked.sizeBytes !== incoming.sizeBytes || checked.sha256 !== incoming.sha256 || checked.mime !== incoming.mime)
                    throw new ResearchError(409, 'RESEARCH_MEDIA_CHANGED', 'Recording changed during verification');
                const finalized = await rpc(db, 'research_finalize_upload', { p_user_id: req.researchUser.id, p_asset_id: asset.id,
                    p_size_bytes: incoming.sizeBytes, p_sha256: incoming.sha256, p_mime: verifiedMime,
                    p_duration_seconds: seconds, p_auto_summary: req.body?.auto_summary === true || asset.auto_summary });
                return finalized;
            } finally { /* Keep the sealed object until janitor cleanup; a committed finalize response can be lost. */ }
        });
        // Keep incoming immutable until its signed token expires. Janitor owns deletion.
        send(res, { asset: publicAsset(result.asset), job: publicJob(result.job) }, 202);
    }));
    router.get('/uploads/:id', auth, route(async (req, res) => {
        const asset = await assetAccess(req, req.params.id);
        send(res, publicAsset(asset));
    }));
    router.post('/uploads/:id/cancel', auth, route(async (req, res) => {
        const asset = await assetAccess(req, req.params.id);
        const canceled = await rpc(db, 'research_cancel_upload', { p_user_id: req.researchUser.id, p_asset_id: asset.id });
        let result = canceled;
        if (await rpc(db, 'research_mark_media_deleting', { p_asset_id: asset.id })) {
            try {
                await storage.remove(BUCKET, [asset.upload_key, asset.object_key]);
                await rpc(db, 'research_confirm_media_deleted', { p_asset_id: asset.id });
                result = { ...canceled, status: 'deleted', reserved_bytes: 0 };
            } catch (_) { /* janitor retries deletion */ }
        }
        send(res, publicAsset(result));
    }));
    router.use((error, req, res, next) => {
        const safe = publicError(error);
        if (safe.status >= 500) { try { Promise.resolve(onError(error)).catch(() => {}); } catch (_) { /* safe response */ } }
        if (safe.status === 429) res.set('Retry-After', '30');
        res.status(safe.status).json({ status: 'error', code: safe.code, message: safe.message });
    });
    return router;
}

async function runMediaTranscriptionJob({ db, storage, job, transcriptionService, signal, logger = console }) {
    if (job.kind !== 'media_transcription' || !job.claim_token) throw new Error('Unsupported media job');
    const assetId = job.settings?.asset_id;
    const asset = assertDatabaseResult(await db.from('research_source_assets').select('*').eq('id', assetId).maybeSingle());
    if (!asset || asset.status !== 'processing' || asset.interview_id !== job.interview_id) throw new Error('Media asset unavailable');
    try {
        return await withTempFile(async (filePath, directory) => {
            const checked = await downloadBounded(storage, asset.object_key, filePath, asset.verified_size_bytes, { signal });
            if (checked.sha256 !== asset.sha256 || checked.sizeBytes !== asset.verified_size_bytes
                || !(checked.mime === asset.verified_mime || checked.mime === 'audio/mp4' && asset.verified_mime === 'video/mp4'))
                throw new Error('Sealed recording checksum mismatch');
            const file = { path: filePath, size: checked.sizeBytes, mimetype: asset.verified_mime, verifiedDurationSeconds: asset.duration_seconds,
                originalname: `recording${{ 'audio/mpeg': '.mp3', 'audio/mp4': '.m4a', 'audio/wav': '.wav', 'audio/webm': '.webm', 'video/mp4': '.mp4' }[asset.verified_mime]}` };
            await rpc(db, 'research_provider_call', { p_job_id: job.id, p_claim_token: job.claim_token, p_input_characters: 0 });
            const result = transcriptionService
                ? await bounded(transcriptionService.prepareInterviewUploadForTranscription(file).then(prepared => transcriptionService.transcribeAudioWithProviderFallback(prepared, { interviewId: asset.interview_id })), 17 * 60000)
                : await require('./isolated-transcription').transcribeIsolated(file, { signal });
            if (!Array.isArray(result.transcript) || !result.transcript.length) throw new Error('Empty transcript');
            const provider = result.provider || { provider: result.systemState?.provider || null, model: result.systemState?.model || null };
            validate.transcript(result.transcript);
            return await rpc(db, 'research_finish_media_analysis', { p_job_id: job.id, p_claim_token: job.claim_token,
                p_transcript: result.transcript, p_provider: provider });
        });
    } catch (error) {
        logger.warn?.('Research media transcription failed', { jobId: job.id, code: 'TRANSCRIPTION_FAILED' });
        return rpc(db, 'research_fail_media_analysis', { p_job_id: job.id, p_claim_token: job.claim_token,
            p_error_code: error.code || 'TRANSCRIPTION_FAILED' });
    }
}

async function cleanupExpiredMedia({ db, storage, limit = 50 }) {
    await rpc(db, 'research_expire_uploads', {});
    const assets = await rpc(db, 'research_media_cleanup_candidates', { p_limit: Math.min(Math.max(limit, 1), 100) });
    let removed = 0;
    for (const asset of assets) {
        if (!['expired', 'canceled', 'deleting'].includes(asset.status) && (!asset.retention_until || new Date(asset.retention_until) > new Date())) continue;
        if (!await rpc(db, 'research_mark_media_deleting', { p_asset_id: asset.id })) continue;
        await storage.remove(BUCKET, [asset.upload_key, asset.object_key]);
        if (await rpc(db, 'research_confirm_media_deleted', { p_asset_id: asset.id })) removed++;
    }
    return removed;
}

module.exports = { BUCKET, MAX_BYTES, publicAsset, sniffMime, downloadBounded, probeDuration, createResearchTranscriptionService, createResearchMediaRouter, runMediaTranscriptionJob, cleanupExpiredMedia };
