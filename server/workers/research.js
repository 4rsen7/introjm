require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { processNext, DEFAULT_SUMMARY_MODEL, registerWorkerWake, wakeResearchWorker } = require('../modules/research/jobs/worker');
const { randomUUID } = require('node:crypto');
const { createResearchStorage } = require('../modules/research/media/storage');
const { runMediaTranscriptionJob, cleanupExpiredMedia } = require('../modules/research/media');

let wakeSleep = null;
registerWorkerWake(() => {
    if (typeof wakeSleep === 'function') {
        const wake = wakeSleep;
        wakeSleep = null;
        wake();
    }
});

async function main() {
    if (process.env.RESEARCH_JOBS_ENABLED === 'false') throw new Error('Research jobs worker is disabled');
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
    if (!process.env.SUPABASE_URL || !serviceKey || !process.env.GEMINI_API_KEY)
        throw new Error('Research worker credentials are missing');
    const db = createClient(process.env.SUPABASE_URL, serviceKey, { auth: { persistSession: false } });
    const model = new GoogleGenerativeAI(process.env.GEMINI_API_KEY).getGenerativeModel({ model: DEFAULT_SUMMARY_MODEL });
    const generateText = async (prompt, { signal } = {}) => (await model.generateContent(prompt, { signal, timeout: 90000 })).response.text();
    const storage = createResearchStorage(db);
    const mediaEnabled = process.env.RESEARCH_MEDIA_ENABLED === 'true';
    const workerId = randomUUID();
    const capabilities = ['interview_summary', 'study_synthesis', 'brief_preparation', 'guide_preparation', 'transcript_impact', 'interview_evidence', ...(mediaEnabled ? ['media_transcription'] : [])];
    const active = new AbortController();
    const report = async () => {
        const { error } = await db.from('research_worker_heartbeats').upsert({ id: workerId, last_seen: new Date().toISOString(), capabilities });
        if (error) console.error('[Research worker]', { workerId, code: 'HEARTBEAT_FAILED' });
    };
    await report();
    const heartbeat = setInterval(() => report().catch(() => {}), 30000);
    heartbeat.unref();
    let stopping = false;
    const stop = () => { stopping = true; active.abort(); wakeResearchWorker(); };
    process.once('SIGTERM', stop);
    process.once('SIGINT', stop);
    let cleanedAt = 0;
    try {
    while (!stopping) {
        let result;
        try {
            result = await processNext({ db, generateText, signal: active.signal,
                runMedia: mediaEnabled ? (job, options) => runMediaTranscriptionJob({ db, storage, job, ...options }) : undefined,
                onEvent: event => console.info('[Research worker]', event) });
            if (result?.kind === 'interview_summary' && result?.status === 'completed' && result?.study_id && result?.requested_by) {
                try {
                    const { data: studyRow } = await db.from('research_studies').select('id,plan,archived_at').eq('id', result.study_id).maybeSingle();
                    if (studyRow && !studyRow.archived_at && (!Array.isArray(studyRow.plan?.tasks) || studyRow.plan.tasks.length === 0)) {
                        await db.rpc('research_enqueue_intelligence', {
                            p_user_id: result.requested_by,
                            p_kind: 'brief_preparation',
                            p_study_id: result.study_id,
                            p_interview_id: null,
                            p_settings: { description: 'Auto-draft plan from first analyzed interview', answers: '' },
                        });
                    }
                } catch (_) { /* non-fatal auto-draft enqueue */ }
            }
            if (mediaEnabled && Date.now() - cleanedAt > 60000) { await cleanupExpiredMedia({ db, storage }); cleanedAt = Date.now(); }
        }
        catch (error) { console.error('Research worker iteration failed:', error?.code || error?.message || 'ITERATION_FAILED'); }
        if (!result && !stopping) {
            await new Promise((resolve) => {
                wakeSleep = resolve;
                const timer = setTimeout(() => {
                    if (wakeSleep === resolve) wakeSleep = null;
                    resolve();
                }, 1500);
                timer.unref?.();
            });
        }
    }
    } finally { clearInterval(heartbeat); await db.from('research_worker_heartbeats').delete().eq('id', workerId); }
}

if (require.main === module) main().catch(error => { console.error(error); process.exitCode = 1; });
module.exports = { main, wakeResearchWorker };
