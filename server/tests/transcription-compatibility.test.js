const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { createTranscriptionService } = require('../modules/interviews/transcription');
const hashes = require('./fixtures/transcription-baseline-hashes.json');
const silent = { info() {}, warn() {}, error() {}, log() {} };

test('extracted transcription functions exactly preserve the original pipeline source', () => {
    const service = createTranscriptionService({ env: {}, logger: silent });
    for (const [name, expected] of Object.entries(hashes)) {
        assert.equal(createHash('sha256').update(service[name].toString()).digest('hex'), expected, name);
    }
});

test('provider selection preserves configured duration/file thresholds and missing-key fallback', () => {
    const service = createTranscriptionService({ env: { OPENAI_API_KEY: 'fake', GEMINI_API_KEY: 'fake' }, logger: silent });
    assert.equal(service.getGeminiPrimarySelection({ measuredDurationSeconds: 301, size: 1 }).reason, 'duration_threshold');
    assert.equal(service.getGeminiPrimarySelection({ measuredDurationSeconds: 60, size: 1 }).shouldUse, false);
    assert.equal(service.getGeminiPrimarySelection({ size: 9 * 1024 * 1024 }).reason, 'file_size_threshold');
    assert.equal(createTranscriptionService({ env: { GEMINI_API_KEY: 'fake' } }).getGeminiPrimarySelection({}).reason, 'openai_api_key_missing');
    assert.equal(createTranscriptionService({ env: {} }).getGeminiPrimarySelection({}).shouldUse, false);
});

test('diarized segments retain speaker mapping, timestamps and text normalization', () => {
    const service = createTranscriptionService({ env: {} });
    const rows = service.normalizeTranscriptSegments([
        { speaker: 'speaker_0', start: 0, text: ' Спробуйте оформити замовлення. ' },
        { speaker: 'speaker_1', start: 63.1, text: 'Я не знаходжу доставку.' },
        { speaker: 'speaker_1', start: 65, text: ' ' },
    ]);
    assert.deepEqual(rows.map(({ id, ...row }) => row), [
        { speaker: 'Interviewer', text: 'Спробуйте оформити замовлення.', timestamp: '00:00' },
        { speaker: 'Respondent', text: 'Я не знаходжу доставку.', timestamp: '01:03' },
    ]);
    assert.notEqual(rows[0].id, rows[1].id);
});

test('Gemini adapter retains the transcription prompt and deletes provider files after success or invalid JSON', async () => {
    for (const valid of [true, false]) {
        const removed = []; let prompt;
        class Files {
            async uploadFile() { return { file: { name: 'file-1', mimeType: 'audio/mpeg', uri: 'mock://file' } }; }
            async getFile() { return { state: 'ACTIVE' }; }
            async deleteFile(id) { removed.push(id); }
        }
        class Gemini {
            getGenerativeModel({ model }) {
                assert.equal(model, 'gemini-2.5-pro');
                return { generateContent: async (parts) => { prompt = parts[1].text; return { response: { text: () => valid ? JSON.stringify([{ id: 'line', speaker: 'Respondent', text: 'Delivery is hard to find.', timestamp: '00:04' }]) : 'bad json' } }; } };
            }
        }
        const service = createTranscriptionService({ env: { GEMINI_API_KEY: 'fake' }, logger: silent, GoogleGenerativeAI: Gemini, GoogleAIFileManager: Files });
        const work = service.transcribeAudioWithGemini({ path: '/unused', originalname: 'sample.mp3', mimetype: 'audio/mpeg', size: 10, measuredDurationSeconds: 30 });
        if (valid) assert.equal((await work).transcript[0].text, 'Delivery is hard to find.');
        else await assert.rejects(work, /invalid transcript format/);
        assert.match(prompt, /verbatim transcript separated by speaker turns/);
        assert.deepEqual(removed, ['file-1']);
    }
});
