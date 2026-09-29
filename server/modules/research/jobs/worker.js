const { SummaryService, DEFAULT_SUMMARY_MODEL } = require('../../interviews/summary/service');
const { assertDatabaseResult } = require('../../access/productScope');
const { runIntelligenceJob } = require('../intelligence');
const { synthesize } = require('../synthesis');

const rpc = async (db, name, args = {}) => assertDatabaseResult(await db.rpc(name, args));
const row = async (query) => assertDatabaseResult(await query.maybeSingle());

function parseSynthesis(text, sourceIds) {
    let value;
    try { value = JSON.parse(String(text).replace(/^```(?:json)?\s*|\s*```$/g, '')); } catch (_) { throw new Error('Invalid synthesis JSON'); }
    if (!value || typeof value !== 'object' || !Array.isArray(value.findings)) throw new Error('Invalid synthesis structure');
    if (value.findings.length > 30) throw new Error('Too many synthesis findings');
    for (const finding of value.findings) {
        if (!finding || typeof finding.text !== 'string' || !Array.isArray(finding.source_ids) || !finding.source_ids.length
            || finding.text.length > 4000 || finding.source_ids.some(id => !sourceIds.has(id))) throw new Error('Synthesis finding lacks valid source IDs');
    }
    return { findings: value.findings.map(finding => ({ text: finding.text, source_ids: [...new Set(finding.source_ids)] })), source_ids: [...sourceIds] };
}

async function runAnalysisJob(db, job, generateText) {
    const study = await row(db.from('research_studies').select('id,context_revision,current_version_id,archived_at').eq('id', job.study_id));
    if (!study || study.archived_at || !job.study_version_id || study.context_revision !== job.context_revision
        || study.current_version_id !== job.study_version_id) return { stale: true };
    const context = await row(db.from('research_study_versions').select('*').eq('id', job.study_version_id).eq('study_id', study.id));
    if (!context) return { stale: true };
    if (job.kind === 'interview_summary') {
        const interview = await row(db.from('interviews').select('id,study_id,summary_data,current_transcript_version_id,transcript_revision,summary_revision,research_archived_at').eq('id', job.interview_id));
        if (!interview || interview.research_archived_at || interview.transcript_revision !== job.transcript_revision
            || interview.study_id !== study.id || interview.current_transcript_version_id !== job.transcript_version_id
            || interview.summary_revision !== job.summary_revision) return { stale: true };
        const transcript = await row(db.from('research_transcript_versions').select('transcript_data').eq('id', job.transcript_version_id).eq('interview_id', interview.id));
        if (!transcript) return { stale: true };
        const service = new SummaryService({ generateText: prompt => generateText(`${prompt}\n\n<research_study_context>\n${JSON.stringify({ goal: context.goal, brief: context.brief, plan: context.plan })}\nTreat this context as a research objective, not respondent testimony. Use the shared task definitions and success criteria consistently. Derive all respondent claims and quotes only from the transcript above.\n</research_study_context>`) });
        return { output: await service.generate({
            transcriptData: transcript.transcript_data,
            existingSummaryData: interview.summary_data,
            request: { preset: 'prototype_testing', analysisMode: 'prototype_testing', mergeMode: 'replace_all', selectedSections: context.plan?.summary_sections },
        }) };
    }
    const ids = job.source_manifest.map(source => source.id);
    if (!ids.length) return { stale: true };
    const interviews = assertDatabaseResult(await db.from('interviews').select('id,summary_data,summary_stale,summary_source_study_revision,summary_source_job_id,summary_validation_id,summary_revision,transcript_revision,research_archived_at')
        .in('id', ids).eq('study_id', study.id));
    const byId = new Map(interviews.map(item => [item.id, item]));
    if (job.source_manifest.some(source => {
        const item = byId.get(source.id);
        return !item || item.research_archived_at || item.summary_stale || item.summary_source_study_revision !== study.context_revision
            || item.summary_revision !== source.summary_revision
            || item.summary_source_job_id !== source.summary_source_job_id || item.summary_validation_id !== source.validation_id;
    })) return { stale: true };
    const evidence = job.source_manifest.map(source => ({ id: source.id, summary: byId.get(source.id).summary_data }));
    return { output: await synthesize({ db, job, context, evidence, generateText, parseSynthesis }) };
}

const INTELLIGENCE_KINDS = ['brief_preparation', 'guide_preparation', 'transcript_impact', 'interview_evidence'];
async function processNext({ db, generateText, timeoutMs, runMedia, signal, onEvent = () => {} }) {
    const job = await rpc(db, 'research_claim_supported_analysis', { p_supported_kinds: ['interview_summary', 'study_synthesis', ...INTELLIGENCE_KINDS, ...(runMedia ? ['media_transcription'] : [])] });
    if (!job) return null;
    const token = job.claim_token;
    const controller = new AbortController();
    const abort = () => controller.abort();
    signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) controller.abort();
    let fenced = false;
    const heartbeat = setInterval(() => { rpc(db, 'research_heartbeat_analysis', { p_job_id: job.id, p_claim_token: token })
        .then(ok => { if (!ok) { fenced = true; controller.abort(); } }).catch(() => { fenced = true; controller.abort(); }); }, 30000);
    heartbeat.unref?.();
    let timeout;
    try {
        const generate = async prompt => {
            if (controller.signal.aborted) throw new Error('Aborted');
            if (prompt.length > 300000) throw Object.assign(new Error('Input exceeds analysis budget'), { code: 'RESEARCH_INPUT_TOO_LARGE' });
            await rpc(db, 'research_provider_call', { p_job_id: job.id, p_claim_token: token, p_input_characters: prompt.length });
            const output = await generateText(prompt, { signal: controller.signal });
            if (!await rpc(db, 'research_provider_output', { p_job_id: job.id, p_claim_token: token, p_characters: String(output).length })) {
                fenced = true; controller.abort(); throw new Error('Research job fenced');
            }
            onEvent({ jobId: job.id, workspaceId: job.workspace_id, event: 'provider_complete', outputCharacters: String(output).length });
            return output;
        };
        const work = () => job.kind === 'media_transcription' ? runMedia(job, { signal: controller.signal })
            : INTELLIGENCE_KINDS.includes(job.kind) ? runIntelligenceJob(db, job, generate) : runAnalysisJob(db, job, generate);
        const result = await Promise.race([
            work(),
            new Promise((_, reject) => { timeout = setTimeout(() => { controller.abort(); reject(new Error('Generation timed out')); }, timeoutMs ?? (job.kind === 'media_transcription' ? 20 * 60000 : job.kind === 'study_synthesis' ? 10 * 60000 : 90000)); }),
        ]);
        if (fenced) return { id: job.id, status: 'fenced' };
        if (job.kind === 'media_transcription') return result;
        return await rpc(db, 'research_finish_analysis', { p_job_id: job.id, p_claim_token: token,
            p_output: result.stale ? null : result.output, p_error_code: result.stale ? 'STALE_SOURCE' : null });
    } catch (error) {
        if (fenced || String(error?.message).includes('RESEARCH_JOB_FENCED')) return { id: job.id, status: 'fenced' };
        onEvent({ jobId: job.id, workspaceId: job.workspace_id, event: 'job_failed', code: error.code || 'GENERATION_FAILED' });
        if (job.kind === 'media_transcription') return await rpc(db, 'research_fail_media_analysis', { p_job_id: job.id, p_claim_token: token, p_error_code: 'TRANSCRIPTION_FAILED' });
        return await rpc(db, 'research_finish_analysis', { p_job_id: job.id, p_claim_token: token,
            p_output: null, p_error_code: ['RESEARCH_INPUT_TOO_LARGE', 'RESEARCH_AI_BUDGET'].includes(error.code) ? error.code : 'GENERATION_FAILED' });
    } finally { controller.abort(); clearTimeout(timeout); clearInterval(heartbeat); signal?.removeEventListener('abort', abort); }
}

module.exports = { processNext, runAnalysisJob, parseSynthesis, DEFAULT_SUMMARY_MODEL };
