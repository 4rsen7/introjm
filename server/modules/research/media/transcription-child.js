// One isolated transcription process per recording; never loads the application's .env.
const { createResearchTranscriptionService } = require('./index');
process.once('message', async file => {
    try {
        const service = createResearchTranscriptionService({ env: { ...process.env, OPENAI_TRANSCRIPTION_MAX_ATTEMPTS: '1', GEMINI_TRANSCRIPTION_MAX_ATTEMPTS: '1' }, logger: { warn() {}, error() {} } });
        const prepared = await service.prepareInterviewUploadForTranscription(file);
        prepared.measuredDurationSeconds = file.verifiedDurationSeconds;
        const result = await service.transcribeAudioWithProviderFallback(prepared);
        process.send({ transcript: result.transcript, provider: { provider: result.systemState?.provider || null, model: result.systemState?.model || null } }, () => process.exit(0));
    } catch (_) { process.send({ error: 'TRANSCRIPTION_FAILED' }, () => process.exit(1)); }
});
