const test = require('node:test');
const assert = require('node:assert/strict');
const { parseSynthesis } = require('../modules/research/jobs/worker');

const sourceIds = new Set(['interview-1']);
const proof = new Map([['interview-1:segment-1', 'I understood the first search, but not the second.']]);
const finding = { text: 'The second search was confusing', category: 'pain_points', source_ids: ['interview-1'],
    evidence: [{ interview_id: 'interview-1', segment_id: 'segment-1', quote: 'not the second' }] };

test('synthesis retains categories and verifies quote against its immutable source segment', () => {
    const parsed = parseSynthesis(JSON.stringify({ findings: [finding] }), sourceIds, proof);
    assert.deepEqual(parsed.findings[0], finding);
});

test('synthesis rejects invented quotes, wrong segment IDs and unsupported categories', () => {
    for (const invalid of [
        { ...finding, evidence: [{ ...finding.evidence[0], quote: 'The second search was excellent' }] },
        { ...finding, evidence: [{ ...finding.evidence[0], segment_id: 'invented' }] },
        { ...finding, category: 'unverified' },
    ]) assert.throws(() => parseSynthesis(JSON.stringify({ findings: [invalid] }), sourceIds, proof));
});

test('source links remain when a genuine quote is unavailable', () => {
    const parsed = parseSynthesis(JSON.stringify({ findings: [{ ...finding, evidence: [] }] }), sourceIds, proof);
    assert.deepEqual(parsed.findings[0].source_ids, ['interview-1']);
    assert.deepEqual(parsed.findings[0].evidence, []);
});

test('new synthesis pipeline requires a real result category', () => {
    assert.throws(() => parseSynthesis(JSON.stringify({ findings: [{ text: finding.text,
        source_ids: finding.source_ids, evidence: [] }] }), sourceIds, proof, true));
});
