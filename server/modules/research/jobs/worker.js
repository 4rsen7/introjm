const { SummaryService, DEFAULT_SUMMARY_MODEL } = require('../../interviews/summary/service');
const { assertDatabaseResult } = require('../../access/productScope');
const { runIntelligenceJob } = require('../intelligence');
const { synthesize } = require('../synthesis');

const rpc = async (db, name, args = {}) => assertDatabaseResult(await db.rpc(name, args));
const row = async (query) => assertDatabaseResult(await query.maybeSingle());

const CATEGORIES = new Set(['insights', 'pain_points', 'what_worked', 'what_did_not_work']);
const normalizeQuote = value => String(value || '').replace(/[“”«»]/g, '"').replace(/\s+/g, ' ').trim();
function parseSynthesis(text, sourceIds, proofMap = new Map(), requireCategory = false) {
    let value;
    try { value = JSON.parse(String(text).replace(/^```(?:json)?\s*|\s*```$/g, '')); } catch (_) { throw new Error('Invalid synthesis JSON'); }
    if (!value || typeof value !== 'object' || !Array.isArray(value.findings)) throw new Error('Invalid synthesis structure');
    if (value.findings.length > 30) throw new Error('Too many synthesis findings');
    for (const finding of value.findings) {
        if (!finding || typeof finding.text !== 'string' || !Array.isArray(finding.source_ids) || !finding.source_ids.length
            || finding.text.length > 4000 || finding.source_ids.some(id => !sourceIds.has(id))) throw new Error('Synthesis finding lacks valid source IDs');
    }
    return { findings: value.findings.map(finding => {
        if ((requireCategory || finding.category != null) && !CATEGORIES.has(finding.category)) throw new Error('Invalid finding category');
        if (finding.evidence != null && (!Array.isArray(finding.evidence) || finding.evidence.length > 20)) throw new Error('Invalid finding evidence');
        const citations = (finding.evidence || []).map(citation => {
            const segment = proofMap.get(`${citation.interview_id}:${citation.segment_id}`);
            if (!finding.source_ids.includes(citation.interview_id) || !segment || typeof citation.quote !== 'string'
                || !normalizeQuote(citation.quote) || !normalizeQuote(segment).includes(normalizeQuote(citation.quote)))
                throw new Error('Finding quote does not match its source transcript');
            return { interview_id: citation.interview_id, segment_id: citation.segment_id, quote: citation.quote };
        });
        return { text: finding.text.trim(), ...(finding.category ? { category: finding.category } : {}),
            source_ids: [...new Set(finding.source_ids)], evidence: citations };
    }), source_ids: [...sourceIds] };
}

async function runAnalysisJob(db, job, generateText) {
    const study = await row(db.from('research_studies').select('id,context_revision,current_version_id,brief_status,archived_at').eq('id', job.study_id));
    if (!study || study.archived_at || study.brief_status === 'draft' || !job.study_version_id || study.context_revision !== job.context_revision
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
    const originals = assertDatabaseResult(await db.from('research_analysis_jobs').select('id,transcript_version_id,interview_id')
        .in('id', job.source_manifest.map(source => source.summary_source_job_id)));
    const byOriginal = new Map(originals.map(item => [item.id, item]));
    if (job.source_manifest.some(source => byOriginal.get(source.summary_source_job_id)?.interview_id !== source.id)) return { stale: true };
    const versions = assertDatabaseResult(await db.from('research_transcript_versions').select('id,interview_id,transcript_data')
        .in('id', originals.map(item => item.transcript_version_id)));
    const byVersion = new Map(versions.map(item => [item.id, item]));
    const proofMap = new Map();
    const evidence = job.source_manifest.map(source => {
        const original = byOriginal.get(source.summary_source_job_id);
        const version = byVersion.get(original.transcript_version_id);
        if (!version || version.interview_id !== source.id || !Array.isArray(version.transcript_data)) return null;
        for (const segment of version.transcript_data) proofMap.set(`${source.id}:${segment.id}`, segment.text);
        const { _system, ...summary } = byId.get(source.id).summary_data || {};
        // Prefer the original segments supporting summary quotes, including later
        // interview answers, then supplement with a small introductory sample.
        const quotedText = JSON.stringify(summary.quotes || []);
        const supported = version.transcript_data.filter(segment => {
            const normalized = normalizeQuote(segment.text);
            return normalized.length > 12 && normalizeQuote(quotedText).includes(normalized);
        });
        const sampled = [...supported, ...version.transcript_data].filter((segment, index, all) => all.findIndex(item => item.id === segment.id) === index);
        const transcriptSamples = sampled.slice(0, 20).map(segment => ({ id: segment.id,
            text: String(segment.text || '').slice(0, 500) }));
        return { id: source.id, summary, transcriptSamples };
    });
    if (evidence.some(source => !source)) return { stale: true };
    return { output: await synthesize({ db, job, context, evidence, generateText,
        parseSynthesis: (text, ids) => parseSynthesis(text, ids, proofMap, true) }) };
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

let wakeCallback = null;
function registerWorkerWake(fn) {
    wakeCallback = typeof fn === 'function' ? fn : null;
}
function wakeResearchWorker() {
    if (typeof wakeCallback === 'function') {
        try { wakeCallback(); } catch (_) { /* ignore wake error */ }
    }
}

module.exports = { processNext, runAnalysisJob, parseSynthesis, DEFAULT_SUMMARY_MODEL, registerWorkerWake, wakeResearchWorker };
