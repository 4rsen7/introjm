require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { processNext, DEFAULT_SUMMARY_MODEL } = require('../modules/research/jobs/worker');

async function main() {
    if (process.env.RESEARCH_JOBS_ENABLED !== 'true') throw new Error('Research jobs worker is disabled');
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY || !process.env.GEMINI_API_KEY)
        throw new Error('Research worker credentials are missing');
    const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
    const model = new GoogleGenerativeAI(process.env.GEMINI_API_KEY).getGenerativeModel({ model: DEFAULT_SUMMARY_MODEL });
    const generateText = async (prompt, { signal } = {}) => (await model.generateContent(prompt, { signal, timeout: 90000 })).response.text();
    let stopping = false;
    process.once('SIGTERM', () => { stopping = true; });
    process.once('SIGINT', () => { stopping = true; });
    while (!stopping) {
        let result;
        try { result = await processNext({ db, generateText }); }
        catch (error) { console.error('Research worker iteration failed:', error?.code || 'ITERATION_FAILED'); }
        if (!result) await new Promise(resolve => setTimeout(resolve, 5000));
    }
}

if (require.main === module) main().catch(error => { console.error(error); process.exitCode = 1; });
module.exports = { main };
