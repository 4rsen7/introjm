const {
    resolveInterviewSummaryRequest,
    buildInterviewSummaryPrompt,
    mergeInterviewSummarySections,
    getInterviewSystemState,
    withInterviewSystemState,
    buildInterviewSummarySystemState,
} = require('./policy');
const { cleanModelJson, normalizeInterviewSummaryData } = require('./normalization');

const DEFAULT_SUMMARY_PROVIDER = 'gemini';
const DEFAULT_SUMMARY_MODEL = 'gemini-2.5-pro';

function formatInterviewSummaryTranscript(transcriptData) {
    return transcriptData.map(
        line => `[${line.timestamp}] ${line.speaker}: ${line.text}`
    ).join('\n');
}

/**
 * Shared summary pipeline. The caller owns authorization, quota checks, provider
 * credentials and persistence; generateText receives the unchanged prompt and
 * returns the provider's response text. No application state is read here.
 */
class SummaryService {
    constructor({
        generateText,
        provider = DEFAULT_SUMMARY_PROVIDER,
        model = DEFAULT_SUMMARY_MODEL,
        onInvalidResponse,
    }) {
        if (typeof generateText !== 'function') {
            throw new TypeError('SummaryService requires a generateText function.');
        }
        this.generateText = generateText;
        this.provider = provider;
        this.model = model;
        this.onInvalidResponse = onInvalidResponse;
    }

    async generate({ transcriptData, existingSummaryData, request = {} }) {
        const { preset, analysisMode, selectedSections, mergeMode } = resolveInterviewSummaryRequest(request);
        const conversationText = formatInterviewSummaryTranscript(transcriptData);
        const prompt = buildInterviewSummaryPrompt({ conversationText, selectedSections, analysisMode });
        const responseText = await this.generateText(prompt);

        let summaryData;
        try {
            const cleanJsonString = cleanModelJson(responseText);
            summaryData = normalizeInterviewSummaryData(JSON.parse(cleanJsonString));
        } catch (parseError) {
            if (this.onInvalidResponse) this.onInvalidResponse(responseText, parseError);
            throw new Error('AI returned an invalid response format.');
        }

        if (!summaryData) {
            throw new Error('AI returned an empty or unsupported summary format.');
        }

        if (mergeMode === 'merge_selected') {
            summaryData = mergeInterviewSummarySections(existingSummaryData, summaryData, selectedSections);
        }

        return withInterviewSystemState(
            summaryData,
            buildInterviewSummarySystemState(
                getInterviewSystemState(existingSummaryData),
                {
                    provider: this.provider,
                    model: this.model,
                    preset,
                    analysisMode,
                    selectedSections,
                    mergeMode,
                }
            )
        );
    }
}

module.exports = {
    DEFAULT_SUMMARY_PROVIDER,
    DEFAULT_SUMMARY_MODEL,
    formatInterviewSummaryTranscript,
    SummaryService,
};
