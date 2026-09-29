const test = require('node:test');
const assert = require('node:assert/strict');
const { runAnalysisJob, processNext } = require('../modules/research/jobs/worker');

function fixture() {
    const job = { id: 'job', claim_token: 'lease', kind: 'interview_summary', study_id: 'study', interview_id: 'session', study_revision: 2, context_revision: 2, study_version_id: 'study-v2', transcript_version_id: 'transcript-v1', transcript_revision: 1, summary_revision: 0 };
    const study = { id: 'study', goal: 'Чи знаходять користувачі доставку?', brief: 'Тестуємо прототип оформлення замовлення', revision: 2, context_revision: 2, current_version_id: 'study-v2', plan: { tasks: [] } };
    const interview = { id: 'session', study_id: 'study', current_transcript_version_id: 'transcript-v1', transcript_revision: 1, summary_revision: 0, transcript_data: [{ timestamp: '00:10', speaker: 'User', text: 'I could not find delivery.' }], summary_data: { painPoints: ['An unrelated old section'] } };
    const calls = [];
    const db = {
        from(table) { return { select() { return this; }, eq() { return this; }, maybeSingle: async () => ({ data: ['research_studies', 'research_study_versions'].includes(table) ? study : interview }) }; },
        async rpc(name, args) {
            calls.push({ name, args });
            return { data: name === 'research_claim_supported_analysis' ? job : args };
        },
    };
    return { job, study, interview, db, calls };
}

test('Research selects existing prototype sections and adds study context without merging old sections', async () => {
    const { db, job, study } = fixture();
    const { output } = await runAnalysisJob(db, job, async (prompt) => {
        assert.match(prompt, /PROTOTYPE TESTING RULES/);
        assert.match(prompt, /"taskSuccess"/);
        assert.match(prompt, /I could not find delivery/);
        assert.ok(prompt.includes(study.goal));
        assert.match(prompt, /not respondent testimony/);
        return JSON.stringify({ summary: { generalInsight: 'Delivery was not found.' } });
    });
    assert.equal(output.summary.generalInsight, 'Delivery was not found.');
    assert.ok(!output.painPoints?.length);
    assert.equal(output._system.summaryGeneration.analysisMode, 'prototype_testing');
});

test('source changed before processing skips the model entirely', async () => {
    const { db, job, study } = fixture();
    study.context_revision++;
    assert.deepEqual(await runAnalysisJob(db, job, () => { throw new Error('Must not run'); }), { stale: true });
});

test('worker finalizes successful output with the lease token', async () => {
    const { db, calls } = fixture();
    await processNext({ db, generateText: async () => JSON.stringify({ summary: { generalInsight: 'Saved evidence' } }) });
    const finish = calls.find(c => c.name === 'research_finish_analysis');
    assert.equal(finish.args.p_claim_token, 'lease');
    assert.equal(finish.args.p_output.summary.generalInsight, 'Saved evidence');
    assert.equal(finish.args.p_error_code, null);
});

test('provider timeout aborts the request and records a safe retryable failure', async () => {
    const { db, calls } = fixture();
    let aborted = false;
    await processNext({ db, timeoutMs: 20, generateText: async (_, { signal }) => new Promise((resolve, reject) => {
        signal.addEventListener('abort', () => { aborted = true; reject(new Error('secret provider detail')); });
    }) });
    assert.equal(aborted, true);
    const finish = calls.find(c => c.name === 'research_finish_analysis');
    assert.equal(finish.args.p_error_code, 'GENERATION_FAILED');
    assert.equal(finish.args.p_output, null);
    assert.ok(!JSON.stringify(calls).includes('secret'));
});

test('title-only revision change preserves pinned context; unpinned jobs never call provider', async () => {
 const {db,job,study}=fixture(); study.revision++; let calls=0;
 await runAnalysisJob(db,job,async()=>{calls++;return JSON.stringify({summary:{generalInsight:'Same context'}});});
 assert.equal(calls,1); job.study_version_id=null;
 assert.deepEqual(await runAnalysisJob(db,job,()=>{throw Error('unreachable');}),{stale:true});
});
