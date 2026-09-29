require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { processNext, DEFAULT_SUMMARY_MODEL } = require('../modules/research/jobs/worker');
const { randomUUID } = require('node:crypto');
const { createResearchStorage } = require('../modules/research/media/storage');
const { runMediaTranscriptionJob, cleanupExpiredMedia } = require('../modules/research/media');

async function main() {
    if (process.env.RESEARCH_JOBS_ENABLED !== 'true') throw new Error('Research jobs worker is disabled');
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY || !process.env.GEMINI_API_KEY)
        throw new Error('Research worker credentials are missing');
    const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
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
    const stop = () => { stopping = true; active.abort(); };
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
            if (mediaEnabled && Date.now() - cleanedAt > 60000) { await cleanupExpiredMedia({ db, storage }); cleanedAt = Date.now(); }
        }
        catch (error) { console.error('Research worker iteration failed:', error?.code || 'ITERATION_FAILED'); }
        if (!result) await new Promise(resolve => setTimeout(resolve, 5000));
    }
    } finally { clearInterval(heartbeat); await db.from('research_worker_heartbeats').delete().eq('id', workerId); }
}

if (require.main === module) main().catch(error => { console.error(error); process.exitCode = 1; });
module.exports = { main };
