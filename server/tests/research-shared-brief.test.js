const test = require('node:test');
const assert = require('node:assert/strict');
const { runIntelligenceJob, briefChunks } = require('../modules/research/intelligence');

const study = { id: 'study', current_version_id: 'v1', goal: 'Compare search designs' };
const context = { id: 'v1', study_id: 'study', goal: study.goal, brief: null,
    plan: { questions: [], hypotheses: [], prototype: { name: '', url: '', version: '' }, tasks: [], guide: [] } };
const ids = ['interview-a', 'interview-b', 'interview-c'];

function database() {
    const sources = ids.map((id, index) => ({ id, title: `Session ${index + 1}`, current_transcript_version_id: `version-${index}` }));
    const versions = ids.map((id, index) => ({ id: `version-${index}`, interview_id: id,
        transcript_data: [{ id: `segment-${index}`, speaker: 'Doctor', text: `Distinct observation ${index + 1}` }] }));
    const data = { research_studies: [study], research_study_versions: [context], interviews: sources, research_transcript_versions: versions };
    return { from(table) {
        const query = { select() { return this; }, eq() { return this; }, in() { return this; },
            maybeSingle: async () => ({ data: data[table][0] }),
            then(resolve) { return Promise.resolve({ data: data[table] }).then(resolve); } };
        return query;
    } };
}

test('shared brief uses every pinned transcript and reports complete source coverage', async () => {
    const job = { kind: 'brief_preparation', study_id: study.id, study_version_id: context.id,
        settings: {}, source_manifest: ids.map((id, index) => ({ id, transcript_version_id: `version-${index}` })) };
    let prompt;
    const response = JSON.stringify({ goal: 'Understand which search is clearer', brief: 'Compare both search screens',
        plan: context.plan, questions: [], assumptions: [], sections: [] });
    const result = await runIntelligenceJob(database(), job, async input => { prompt = input; return response; });
    assert.equal(result.output.source_count, 3);
    assert.deepEqual(result.output.source_ids, ids);
    for (let index = 0; index < ids.length; index++) {
        assert.ok(prompt.includes(ids[index]));
        assert.ok(prompt.includes(`Distinct observation ${index + 1}`));
    }
});

test('oversized brief sources fail explicitly instead of dropping later interviews', () => {
    const many = Array.from({ length: 6 }, (_, index) => ({ id: `interview-${index}`,
        title: 'Session', transcript: [{ id: `segment-${index}`, speaker: 'Doctor', text: 'x'.repeat(140000) }] }));
    assert.throws(() => briefChunks(many), error => error.code === 'RESEARCH_INPUT_TOO_LARGE');
});
