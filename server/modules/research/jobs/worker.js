const { SummaryService, DEFAULT_SUMMARY_MODEL } = require('../../interviews/summary/service');
const { assertDatabaseResult } = require('../../access/productScope');

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
    const study = await row(db.from('research_studies').select('id,goal,brief,revision,archived_at').eq('id', job.study_id));
    if (!study || study.archived_at || study.revision !== job.study_revision) return { stale: true };
    if (job.kind === 'interview_summary') {
        const interview = await row(db.from('interviews').select('id,transcript_data,summary_data,transcript_revision,summary_revision,research_archived_at').eq('id', job.interview_id));
        if (!interview || interview.research_archived_at || interview.transcript_revision !== job.transcript_revision
            || interview.summary_revision !== job.summary_revision) return { stale: true };
        const service = new SummaryService({ generateText: prompt => generateText(`${prompt}\n\n<research_study_context>\nStudy goal: ${study.goal}\nOptional brief: ${study.brief || '(none)'}\nTreat this context as a research objective, not respondent testimony. Derive all respondent claims and quotes only from the transcript above.\n</research_study_context>`) });
        return { output: await service.generate({
            transcriptData: interview.transcript_data,
            existingSummaryData: interview.summary_data,
            request: { preset: 'prototype_testing', analysisMode: 'prototype_testing', mergeMode: 'replace_all' },
        }) };
    }
    const ids = job.source_manifest.map(source => source.id);
    if (!ids.length) return { stale: true };
    const interviews = assertDatabaseResult(await db.from('interviews').select('id,summary_data,summary_stale,summary_source_study_revision,summary_revision,transcript_revision,research_archived_at')
        .in('id', ids).eq('study_id', study.id));
    const byId = new Map(interviews.map(item => [item.id, item]));
    if (job.source_manifest.some(source => {
        const item = byId.get(source.id);
        return !item || item.research_archived_at || item.summary_stale || item.summary_source_study_revision !== study.revision
            || item.summary_revision !== source.summary_revision || item.transcript_revision !== source.transcript_revision;
    })) return { stale: true };
    const evidence = job.source_manifest.map(source => ({ id: source.id, summary: byId.get(source.id).summary_data }));
    const prompt = `Synthesize the supplied interview summaries for the study goal. Write findings in the language of the study goal; use the brief's language if the goal does not establish one. Return JSON object {"findings":[{"text":"finding including disagreements or uncertainty","source_ids":["interview UUID"]}]}. Every finding must cite actual source IDs. Preserve disagreement; do not invent prevalence, counts, quotes, participants, or evidence. A study goal and brief are context, not respondent evidence.\n<study_goal>${study.goal}</study_goal>\n<study_brief>${study.brief || ''}</study_brief>\n<source_summaries>${JSON.stringify(evidence)}</source_summaries>`;
    return { output: parseSynthesis(await generateText(prompt), new Set(ids)) };
}

async function processNext({ db, generateText, timeoutMs = 90000 }) {
    const job = await rpc(db, 'research_claim_analysis');
    if (!job) return null;
    const token = job.claim_token;
    const controller = new AbortController();
    let fenced = false;
    const heartbeat = setInterval(() => { rpc(db, 'research_heartbeat_analysis', { p_job_id: job.id, p_claim_token: token })
        .then(ok => { if (!ok) { fenced = true; controller.abort(); } }).catch(() => { fenced = true; controller.abort(); }); }, 30000);
    heartbeat.unref?.();
    let timeout;
    try {
        const result = await Promise.race([
            runAnalysisJob(db, job, prompt => generateText(prompt, { signal: controller.signal })),
            new Promise((_, reject) => { timeout = setTimeout(() => { controller.abort(); reject(new Error('Generation timed out')); }, timeoutMs); }),
        ]);
        if (fenced) return { id: job.id, status: 'fenced' };
        return await rpc(db, 'research_finish_analysis', { p_job_id: job.id, p_claim_token: token,
            p_output: result.stale ? null : result.output, p_error_code: result.stale ? 'STALE_SOURCE' : null });
    } catch (error) {
        if (fenced) return { id: job.id, status: 'fenced' };
        return await rpc(db, 'research_finish_analysis', { p_job_id: job.id, p_claim_token: token,
            p_output: null, p_error_code: 'GENERATION_FAILED' });
    } finally { controller.abort(); clearTimeout(timeout); clearInterval(heartbeat); }
}

module.exports = { processNext, runAnalysisJob, parseSynthesis, DEFAULT_SUMMARY_MODEL };
