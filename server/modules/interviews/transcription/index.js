// Extracted from the existing server pipeline without changing provider policy,
// prompts, normalization or fallback. Persistence belongs to each caller.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawn: systemSpawn } = require('child_process');
const ffmpegStaticPath = require('ffmpeg-static');
const { GoogleGenerativeAI: GeminiSDK } = require('@google/generative-ai');
const { GoogleAIFileManager: GeminiFilesSDK } = require('@google/generative-ai/server');
const { cleanModelJson } = require('../summary');

function createTranscriptionService({ env = globalThis.process.env, logSystemEvent = async () => {}, logger = globalThis.console, fetchImpl = globalThis.fetch, spawn = systemSpawn, GoogleGenerativeAI = GeminiSDK, GoogleAIFileManager = GeminiFilesSDK } = {}) {
const process = { env, platform: globalThis.process.platform };
const console = logger;
const fetch = fetchImpl;
const FFMPEG_EXECUTABLE_CANDIDATES = [
    process.env.FFMPEG_PATH,
    ffmpegStaticPath,
    'ffmpeg',
].filter(Boolean);

const DEFAULT_OPENAI_TRANSCRIPTION_MODEL = 'gpt-4o-transcribe-diarize';

const DEFAULT_OPENAI_TRANSCRIPTION_TIMEOUT_MS = 3 * 60 * 1000;

const DEFAULT_OPENAI_TRANSCRIPTION_MAX_ATTEMPTS = 1;

const DEFAULT_GEMINI_TRANSCRIPTION_MAX_ATTEMPTS = 2;

const DEFAULT_GEMINI_TRANSCRIPTION_TIMEOUT_MS = 6 * 60 * 1000;

const DEFAULT_GEMINI_PRIMARY_MIN_DURATION_SECONDS = 5 * 60;

const DEFAULT_GEMINI_PRIMARY_MIN_FILE_SIZE_BYTES = 8 * 1024 * 1024;

const TRANSCRIPTION_EXTRACTED_AUDIO_BITRATE = '48k';

const TRANSCRIPTION_EXTRACTED_AUDIO_SAMPLE_RATE = 16000;

const TRANSCRIPTION_NORMALIZED_AUDIO_MIME_TYPE = 'audio/mpeg';

const OPENAI_TRANSCRIPTION_TIMEOUT_MS = (() => {
    const configuredTimeout = Number(process.env.OPENAI_TRANSCRIPTION_TIMEOUT_MS);
    return Number.isFinite(configuredTimeout) && configuredTimeout > 0
        ? configuredTimeout
        : DEFAULT_OPENAI_TRANSCRIPTION_TIMEOUT_MS;
})();

const OPENAI_TRANSCRIPTION_MAX_ATTEMPTS = (() => {
    const configuredAttempts = Number(process.env.OPENAI_TRANSCRIPTION_MAX_ATTEMPTS);
    return Number.isInteger(configuredAttempts) && configuredAttempts > 0
        ? configuredAttempts
        : DEFAULT_OPENAI_TRANSCRIPTION_MAX_ATTEMPTS;
})();

const GEMINI_TRANSCRIPTION_MAX_ATTEMPTS = (() => {
    const configuredAttempts = Number(process.env.GEMINI_TRANSCRIPTION_MAX_ATTEMPTS);
    return Number.isInteger(configuredAttempts) && configuredAttempts > 0
        ? configuredAttempts
        : DEFAULT_GEMINI_TRANSCRIPTION_MAX_ATTEMPTS;
})();

const GEMINI_TRANSCRIPTION_TIMEOUT_MS = (() => {
    const configuredTimeout = Number(process.env.GEMINI_TRANSCRIPTION_TIMEOUT_MS);
    return Number.isFinite(configuredTimeout) && configuredTimeout > 0
        ? configuredTimeout
        : DEFAULT_GEMINI_TRANSCRIPTION_TIMEOUT_MS;
})();

const GEMINI_PRIMARY_MIN_DURATION_SECONDS = (() => {
    const configuredDuration = Number(process.env.GEMINI_PRIMARY_MIN_DURATION_SECONDS);
    return Number.isFinite(configuredDuration) && configuredDuration > 0
        ? configuredDuration
        : DEFAULT_GEMINI_PRIMARY_MIN_DURATION_SECONDS;
})();

const GEMINI_PRIMARY_MIN_FILE_SIZE_BYTES = (() => {
    const configuredSize = Number(process.env.GEMINI_PRIMARY_MIN_FILE_SIZE_BYTES);
    return Number.isFinite(configuredSize) && configuredSize > 0
        ? configuredSize
        : DEFAULT_GEMINI_PRIMARY_MIN_FILE_SIZE_BYTES;
})();

function createTimeoutError(message) {
    const error = new Error(message);
    error.code = 'REQUEST_TIMEOUT';
    return error;
}

function serializeErrorForLog(error) {
    if (!error) return null;
    return {
        name: error.name || null,
        message: error.message || 'Unknown error',
        code: error.code || null,
        status: Number.isInteger(error.status) ? error.status : null,
        causeName: error.cause?.name || null,
        causeMessage: error.cause?.message || null,
        causeCode: error.cause?.code || null,
        stack: error.stack || null,
    };
}

async function fetchWithTimeout(url, options = {}, timeoutMs, timeoutMessage) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
        controller.abort();
    }, timeoutMs);

    try {
        return await fetch(url, {
            ...options,
            signal: controller.signal,
        });
    } catch (error) {
        if (error?.name === 'AbortError') {
            throw createTimeoutError(timeoutMessage || 'Request timed out.');
        }
        throw error;
    } finally {
        clearTimeout(timeoutId);
    }
}

async function runWithTimeout(operation, timeoutMs, timeoutMessage) {
    let timeoutId = null;
    const timeout = new Promise((_, reject) => {
        timeoutId = setTimeout(() => {
            reject(createTimeoutError(timeoutMessage || 'Operation timed out.'));
        }, timeoutMs);
    });

    try {
        return await Promise.race([operation, timeout]);
    } finally {
        clearTimeout(timeoutId);
    }
}

const getInterviewUploadExtension = (fileName = '') => {
    const match = String(fileName || '').toLowerCase().match(/(\.[a-z0-9]+)$/);
    return match?.[1] || '';
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const replaceFileExtension = (fileName = '', nextExtension = '') => {
    const parsed = path.parse(String(fileName || '').trim() || 'interview-audio');
    return `${parsed.name || 'interview-audio'}${nextExtension}`;
};

const ensureFfmpegExecutable = async (candidatePath) => {
    if (!candidatePath || candidatePath === 'ffmpeg') return candidatePath;

    try {
        await fs.promises.access(candidatePath, fs.constants.X_OK);
        return candidatePath;
    } catch (error) {
        if (error?.code !== 'EACCES') {
            throw error;
        }
    }

    try {
        await fs.promises.chmod(candidatePath, 0o755);
        await fs.promises.access(candidatePath, fs.constants.X_OK);
        return candidatePath;
    } catch (chmodError) {
        throw new Error(`ffmpeg binary is not executable at ${candidatePath}: ${chmodError.message}`);
    }
};

const runFfmpegCommand = async (args) => {
    let lastError = null;

    for (const candidate of FFMPEG_EXECUTABLE_CANDIDATES) {
        try {
            const executablePath = await ensureFfmpegExecutable(candidate);
            await new Promise((resolve, reject) => {
                const child = spawn(executablePath, args, {
                    stdio: ['ignore', 'pipe', 'pipe'],
                });

                let stderr = '';
                child.stderr.on('data', (chunk) => {
                    stderr += chunk.toString();
                });

                child.on('error', (error) => {
                    reject(error);
                });

                child.on('close', (code) => {
                    if (code === 0) {
                        resolve();
                        return;
                    }

                    reject(new Error(stderr.trim() || `ffmpeg exited with code ${code}`));
                });
            });
            return;
        } catch (error) {
            lastError = error;
            console.warn('[interview-upload] ffmpeg candidate failed', {
                candidate,
                error: error.message,
            });
        }
    }

    throw lastError || new Error('ffmpeg is not available on the server.');
};

const parseFfmpegDurationSeconds = (stderr = '') => {
    const match = String(stderr).match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/i);
    if (!match) return null;

    const hours = Number(match[1]);
    const minutes = Number(match[2]);
    const seconds = Number(match[3]);

    if (![hours, minutes, seconds].every(Number.isFinite)) return null;
    return (hours * 3600) + (minutes * 60) + seconds;
};

const getMediaDurationSeconds = async (filePath) => {
    let lastError = null;

    for (const candidate of FFMPEG_EXECUTABLE_CANDIDATES) {
        try {
            const executablePath = await ensureFfmpegExecutable(candidate);
            const stderr = await new Promise((resolve, reject) => {
                const child = spawn(executablePath, ['-i', filePath, '-f', 'null', '-'], {
                    stdio: ['ignore', 'ignore', 'pipe'],
                });

                let stderrOutput = '';
                child.stderr.on('data', (chunk) => {
                    stderrOutput += chunk.toString();
                });

                child.on('error', (error) => {
                    reject(error);
                });

                child.on('close', (code) => {
                    if (code === 0) {
                        resolve(stderrOutput);
                        return;
                    }

                    reject(new Error(stderrOutput.trim() || `ffmpeg exited with code ${code}`));
                });
            });

            const durationSeconds = parseFfmpegDurationSeconds(stderr);
            if (!Number.isFinite(durationSeconds)) {
                throw new Error('ffmpeg did not return a parseable duration.');
            }

            return durationSeconds;
        } catch (error) {
            lastError = error;
            console.warn('[interview-upload] duration probe failed', {
                candidate,
                error: error.message,
            });
        }
    }

    throw lastError || new Error('Could not determine media duration.');
};

const normalizeInterviewUploadToMp3 = async (file) => {
    if (FFMPEG_EXECUTABLE_CANDIDATES.length === 0) {
        throw new Error('ffmpeg is not available on the server.');
    }

    const outputPath = path.join(
        path.dirname(file.path),
        `${path.basename(file.path)}-normalized.mp3`
    );

    await runFfmpegCommand([
        '-y',
        '-i',
        file.path,
        '-vn',
        '-ac',
        '1',
        '-ar',
        String(TRANSCRIPTION_EXTRACTED_AUDIO_SAMPLE_RATE),
        '-c:a',
        'libmp3lame',
        '-b:a',
        TRANSCRIPTION_EXTRACTED_AUDIO_BITRATE,
        outputPath,
    ]);

    const stats = await fs.promises.stat(outputPath);
    let measuredDurationSeconds = null;

    try {
        measuredDurationSeconds = await getMediaDurationSeconds(outputPath);
    } catch (error) {
        console.warn('[interview-upload] continuing without measured duration', {
            fileName: file.originalname,
            error: error.message,
        });
    }

    console.info('[interview-upload] normalized upload to mp3', {
        originalFileName: file.originalname,
        originalSizeBytes: file.size,
        normalizedSizeBytes: stats.size,
        measuredDurationSeconds,
    });

    return {
        ...file,
        path: outputPath,
        mimetype: TRANSCRIPTION_NORMALIZED_AUDIO_MIME_TYPE,
        originalname: replaceFileExtension(file.originalname, '.mp3'),
        size: stats.size,
        normalizedAudioPath: outputPath,
        sourceUploadName: file.originalname || '',
        sourceUploadSizeBytes: Number.isFinite(file.size) ? file.size : null,
        measuredDurationSeconds: Number.isFinite(measuredDurationSeconds) ? measuredDurationSeconds : null,
    };
};

const SOURCE_TRANSCRIPTION_EXTENSIONS = new Set(['.mp3', '.mp4', '.m4a']);

const SOURCE_TRANSCRIPTION_MIME_TYPES = new Set([
    'audio/mpeg',
    'audio/mp3',
    'audio/mp4',
    'audio/m4a',
    'audio/x-m4a',
    'video/mp4',
]);

const canUseSourceUploadForTranscription = (file = {}) => {
    const extension = getInterviewUploadExtension(file.originalname);
    const mimeType = String(file.mimetype || '').toLowerCase();
    return SOURCE_TRANSCRIPTION_EXTENSIONS.has(extension) || SOURCE_TRANSCRIPTION_MIME_TYPES.has(mimeType);
};

const useSourceUploadForTranscription = async (file) => {
    let measuredDurationSeconds = null;

    try {
        measuredDurationSeconds = await getMediaDurationSeconds(file.path);
    } catch (error) {
        console.warn('[interview-upload] continuing without measured duration for source upload', {
            fileName: file.originalname,
            error: error.message,
        });
    }

    console.info('[interview-upload] using source upload for transcription', {
        originalFileName: file.originalname,
        originalMimeType: file.mimetype,
        originalSizeBytes: file.size,
        measuredDurationSeconds,
    });

    return {
        ...file,
        sourceUploadName: file.originalname || '',
        sourceUploadSizeBytes: Number.isFinite(file.size) ? file.size : null,
        measuredDurationSeconds: Number.isFinite(measuredDurationSeconds) ? measuredDurationSeconds : null,
        skippedNormalization: true,
    };
};

const prepareInterviewUploadForTranscription = async (file) => {
    if (canUseSourceUploadForTranscription(file)) {
        return useSourceUploadForTranscription(file);
    }

    return normalizeInterviewUploadToMp3(file);
};

const buildInterviewTranscriptionSystemState = ({
    provider,
    model,
    durationSeconds,
    file,
    responseFormat = null,
    usedFallbackSegmentation = false,
}) => {
    const metadata = {
        provider,
        model,
        responseFormat,
        generatedAt: new Date().toISOString(),
        fileName: file?.originalname || '',
        mimeType: file?.mimetype || '',
        fileSizeBytes: Number.isFinite(file?.size) ? file.size : null,
        durationSeconds: Number.isFinite(durationSeconds) ? durationSeconds : null,
        usedFallbackSegmentation: !!usedFallbackSegmentation,
    };

    if (file?.sourceUploadName) {
        metadata.sourceUploadFileName = file.sourceUploadName;
    }

    if (Number.isFinite(file?.sourceUploadSizeBytes)) {
        metadata.sourceUploadFileSizeBytes = file.sourceUploadSizeBytes;
    }

    if (file?.skippedNormalization) {
        metadata.skippedNormalization = true;
    }

    const configuredRate = Number(process.env.OPENAI_TRANSCRIPTION_RATE_USD_PER_MINUTE);
    const defaultRateMap = {
        'gpt-4o-mini-transcribe': 0.003,
        'gpt-4o-transcribe': 0.006,
        'gpt-4o-transcribe-diarize': 0.006,
        'whisper-1': 0.006,
    };
    const ratePerMinute = Number.isFinite(configuredRate) && configuredRate > 0
        ? configuredRate
        : defaultRateMap[model];

    if (Number.isFinite(ratePerMinute) && Number.isFinite(durationSeconds)) {
        metadata.estimatedCostUsd = Number((((durationSeconds / 60) * ratePerMinute)).toFixed(6));
    }

    return metadata;
};

const normalizeTimestamp = (seconds) => {
    const safe = Number.isFinite(seconds) ? Math.max(0, seconds) : 0;
    const hours = Math.floor(safe / 3600);
    const minutes = Math.floor((safe % 3600) / 60);
    const remainder = Math.floor(safe % 60);
    const mmss = `${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`;
    return hours > 0 ? `${String(hours).padStart(2, '0')}:${mmss}` : mmss;
};

const parseTimestampToSeconds = (value) => {
    if (Number.isFinite(value)) return Math.max(0, Number(value));
    if (typeof value !== 'string') return null;

    const cleaned = value.trim().replace(',', '.');
    if (!cleaned) return null;

    if (/^\d+(?:\.\d+)?$/.test(cleaned)) {
        return Math.max(0, Number(cleaned));
    }

    const parts = cleaned.split(':').map((part) => part.trim()).filter(Boolean);
    if (parts.length < 2 || parts.length > 3) return null;

    const numericParts = parts.map((part) => Number(part));
    if (numericParts.some((part) => !Number.isFinite(part))) return null;

    if (numericParts.length === 2) {
        const [minutes, seconds] = numericParts;
        return Math.max(0, (minutes * 60) + seconds);
    }

    const [hours, minutes, seconds] = numericParts;
    return Math.max(0, (hours * 3600) + (minutes * 60) + seconds);
};

const normalizeStructuredTranscriptEntries = (entries) => (
    Array.isArray(entries)
        ? entries.map((entry, index) => {
            if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return null;
            const text = typeof entry.text === 'string' ? entry.text.trim() : '';
            if (!text) return null;

            const parsedSeconds = parseTimestampToSeconds(entry.timestamp);
            return {
                id: typeof entry.id === 'string' && entry.id.trim() ? entry.id.trim() : crypto.randomUUID(),
                speaker: typeof entry.speaker === 'string' && entry.speaker.trim() ? entry.speaker.trim() : 'Respondent',
                text,
                timestamp: normalizeTimestamp(Number.isFinite(parsedSeconds) ? parsedSeconds : index * 10),
            };
        }).filter(Boolean)
        : []
);

const getInterviewSpeakerRole = (speaker) => {
    const normalized = String(speaker || '').trim().toLowerCase();
    if (!normalized) return null;

    if (['interviewer', 'moderator', 'host', 'researcher', 'facilitator', 'agent'].includes(normalized)) {
        return 'Interviewer';
    }

    if (['respondent', 'participant', 'customer', 'interviewee', 'guest', 'user'].includes(normalized)) {
        return 'Respondent';
    }

    return null;
};

const formatFallbackSpeakerLabel = (speaker) => {
    const cleaned = String(speaker || '').trim();
    if (!cleaned) return null;
    if (/^[a-zа-яіїєґ]$/i.test(cleaned)) return null;
    if (/^(speaker|spk|voice|track|channel)[\s_-]*[a-z0-9]+$/i.test(cleaned)) return null;
    return cleaned
        .replace(/[_-]+/g, ' ')
        .replace(/\s+/g, ' ')
        .replace(/\b\w/g, (char) => char.toUpperCase());
};

const normalizeTranscriptSegments = (segments) => {
    const prepared = segments.map((segment) => {
        const rawSpeaker = typeof segment?.speaker === 'string' ? segment.speaker.trim() : '';
        return {
            segment,
            rawSpeaker,
            directRole: getInterviewSpeakerRole(rawSpeaker),
        };
    });

    const speakersWithoutRoles = [];
    prepared.forEach(({ rawSpeaker, directRole }) => {
        if (!rawSpeaker || directRole || speakersWithoutRoles.includes(rawSpeaker)) return;
        speakersWithoutRoles.push(rawSpeaker);
    });

    const rolesAlreadyPresent = new Set(
        prepared
            .map(({ directRole }) => directRole)
            .filter(Boolean)
    );
    const missingRoles = ['Interviewer', 'Respondent'].filter((role) => !rolesAlreadyPresent.has(role));
    const speakerRoleOverrides = new Map();

    if (missingRoles.length === 1 || speakersWithoutRoles.length >= 2) {
        missingRoles.forEach((role, index) => {
            const speaker = speakersWithoutRoles[index];
            if (speaker) {
                speakerRoleOverrides.set(speaker, role);
            }
        });
    }

    return prepared.map(({ segment, rawSpeaker, directRole }, index) => {
        const text = typeof segment?.text === 'string' ? segment.text.trim() : '';
        if (!text) return null;

        const start = Number(segment?.start);
        const speaker = directRole
            || speakerRoleOverrides.get(rawSpeaker)
            || formatFallbackSpeakerLabel(rawSpeaker)
            || 'Respondent';

        return {
            id: crypto.randomUUID(),
            speaker,
            text,
            timestamp: normalizeTimestamp(Number.isFinite(start) ? start : index * 10),
        };
    }).filter(Boolean);
};

const getOpenAiTranscriptionResponseFormats = (model) => {
    if (model === 'gpt-4o-transcribe-diarize') {
        return ['diarized_json', 'json'];
    }

    if (model === 'whisper-1') {
        return ['verbose_json', 'json'];
    }

    return ['json'];
};

const splitTranscriptIntoEntries = (text, durationSeconds = 0) => {
    const cleaned = String(text || '').trim();
    if (!cleaned) return [];

    const chunks = cleaned
        .split(/\n+/)
        .flatMap((part) => part.split(/(?<=[.!?])\s+/))
        .map((part) => part.trim())
        .filter(Boolean);

    const source = chunks.length > 0 ? chunks : [cleaned];
    const totalDuration = Number.isFinite(durationSeconds) ? Math.max(0, durationSeconds) : 0;

    let awaitingResponse = false;
    let previousSpeaker = null;

    return source.map((segment, index) => {
        const trimmed = String(segment || '').trim();
        const isQuestion = /[?؟]\s*$/.test(trimmed);

        let speaker = 'Respondent';
        if (isQuestion) {
            speaker = 'Interviewer';
            awaitingResponse = true;
        } else if (awaitingResponse) {
            speaker = 'Respondent';
            awaitingResponse = false;
        } else if (previousSpeaker) {
            speaker = previousSpeaker;
        } else if (index === 0) {
            speaker = isQuestion ? 'Interviewer' : 'Respondent';
        }

        previousSpeaker = speaker;

        return {
            id: crypto.randomUUID(),
            speaker,
            text: trimmed,
            timestamp: normalizeTimestamp(
                totalDuration > 0 && source.length > 1
                    ? (totalDuration * index) / source.length
                    : index * 10
            ),
        };
    });
};

const normalizeOpenAiTranscript = (payload) => {
    const transcriptText = typeof payload?.text === 'string' ? payload.text.trim() : '';
    const durationSeconds = Number(payload?.duration);

    if (Array.isArray(payload?.segments) && payload.segments.length > 0) {
        const transcript = normalizeTranscriptSegments(payload.segments);

        if (transcript.length > 0) {
            return {
                transcript,
                durationSeconds: Number.isFinite(durationSeconds) ? durationSeconds : null,
                usedFallbackSegmentation: false,
            };
        }
    }

    return {
        transcript: splitTranscriptIntoEntries(transcriptText, durationSeconds),
        durationSeconds: Number.isFinite(durationSeconds) ? durationSeconds : null,
        usedFallbackSegmentation: true,
    };
};

const isOpenAiFileTooLargeError = (error) => {
    const message = String(error?.message || '').toLowerCase();
    return (
        [400, 413, 422].includes(error?.status)
        && (
            message.includes('25 mb')
            || message.includes('25mb')
            || message.includes('less than 25 mb')
            || message.includes('file too large')
            || message.includes('maximum')
        )
    );
};

const isRetryableTranscriptionTransportError = (error) => {
    if (!error) return false;
    if (error.code === 'REQUEST_TIMEOUT' || error.code === 'EMPTY_TRANSCRIPT') return true;
    if (Number.isInteger(error.status)) {
        return error.status === 408 || error.status === 429 || error.status >= 500;
    }

    const message = String(error.message || '').toLowerCase();
    const causeMessage = String(error.cause?.message || '').toLowerCase();
    const causeCode = String(error.cause?.code || '').toLowerCase();
    return (
        error.name === 'TypeError'
        || message.includes('fetch failed')
        || message.includes('socket')
        || message.includes('network')
        || message.includes('timeout')
        || message.includes('timed out')
        || causeMessage.includes('socket')
        || causeMessage.includes('network')
        || causeMessage.includes('timeout')
        || causeCode === 'econnreset'
        || causeCode === 'etimedout'
        || causeCode === 'eai_again'
    );
};

const isRetryableOpenAiTranscriptionError = (error) => {
    if (!error) return false;
    if (isOpenAiFileTooLargeError(error)) return false;
    return isRetryableTranscriptionTransportError(error);
};

const isRetryableGeminiTranscriptionError = (error) => {
    if (!error) return false;
    const message = String(error.message || '').toLowerCase();
    if (message.includes('invalid transcript format')) return false;
    if (message.includes('audio processing failed on gemini servers')) return false;
    return isRetryableTranscriptionTransportError(error);
};

const getTranscriptionFileSizeBytes = (file) => {
    if (Number.isFinite(file?.sourceUploadSizeBytes)) return file.sourceUploadSizeBytes;
    if (Number.isFinite(file?.size)) return file.size;
    return null;
};

const getGeminiPrimarySelection = (file) => {
    if (!process.env.GEMINI_API_KEY) {
        return { shouldUse: false, reason: 'gemini_api_key_missing' };
    }

    if (!process.env.OPENAI_API_KEY) {
        return { shouldUse: true, reason: 'openai_api_key_missing' };
    }

    const durationSeconds = Number(file?.measuredDurationSeconds);
    if (Number.isFinite(durationSeconds) && durationSeconds >= GEMINI_PRIMARY_MIN_DURATION_SECONDS) {
        return {
            shouldUse: true,
            reason: 'duration_threshold',
            durationSeconds,
            durationThresholdSeconds: GEMINI_PRIMARY_MIN_DURATION_SECONDS,
        };
    }

    const fileSizeBytes = getTranscriptionFileSizeBytes(file);
    if (!Number.isFinite(durationSeconds) && Number.isFinite(fileSizeBytes) && fileSizeBytes >= GEMINI_PRIMARY_MIN_FILE_SIZE_BYTES) {
        return {
            shouldUse: true,
            reason: 'file_size_threshold',
            fileSizeBytes,
            fileSizeThresholdBytes: GEMINI_PRIMARY_MIN_FILE_SIZE_BYTES,
        };
    }

    return {
        shouldUse: false,
        reason: 'below_threshold',
        durationSeconds: Number.isFinite(durationSeconds) ? durationSeconds : null,
        fileSizeBytes: Number.isFinite(fileSizeBytes) ? fileSizeBytes : null,
        durationThresholdSeconds: GEMINI_PRIMARY_MIN_DURATION_SECONDS,
        fileSizeThresholdBytes: GEMINI_PRIMARY_MIN_FILE_SIZE_BYTES,
    };
};

const createEmptyTranscriptError = (provider) => {
    const error = new Error(`${provider} transcription returned an empty transcript.`);
    error.code = 'EMPTY_TRANSCRIPT';
    return error;
};

const transcribeAudioWithOpenAI = async (file) => {
    if (!process.env.OPENAI_API_KEY) {
        throw new Error('OPENAI_API_KEY is not configured.');
    }

    const model = process.env.OPENAI_TRANSCRIPTION_MODEL || DEFAULT_OPENAI_TRANSCRIPTION_MODEL;
    const fileBuffer = await fs.promises.readFile(file.path);
    const audioBlob = new Blob([fileBuffer], {
        type: file.mimetype || 'application/octet-stream',
    });

    const createForm = (responseFormat) => {
        const form = new FormData();
        form.append('file', audioBlob, file.originalname || 'interview-audio');
        form.append('model', model);
        form.append('response_format', responseFormat);
        if (model === 'gpt-4o-transcribe-diarize') {
            form.append('chunking_strategy', 'auto');
        }
        return form;
    };

    const requestTranscription = async (responseFormat) => {
        const response = await fetchWithTimeout(
            'https://api.openai.com/v1/audio/transcriptions',
            {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
                },
                body: createForm(responseFormat),
            },
            OPENAI_TRANSCRIPTION_TIMEOUT_MS,
            `OpenAI transcription timed out after ${Math.round(OPENAI_TRANSCRIPTION_TIMEOUT_MS / 1000)} seconds.`
        );

        const rawText = await response.text();
        let payload = null;
        try {
            payload = rawText ? JSON.parse(rawText) : null;
        } catch {
            payload = null;
        }

        if (!response.ok) {
            const error = new Error(payload?.error?.message || rawText || `OpenAI transcription failed with status ${response.status}.`);
            error.status = response.status;
            throw error;
        }

        return {
            payload: payload || {},
            responseFormat,
        };
    };

    const responseFormats = getOpenAiTranscriptionResponseFormats(model);
    let transcriptionResponse = null;
    let lastFormatError = null;

    for (const responseFormat of responseFormats) {
        try {
            transcriptionResponse = await requestTranscription(responseFormat);
            break;
        } catch (error) {
            if (![400, 422].includes(error.status) || responseFormat === responseFormats[responseFormats.length - 1]) {
                throw error;
            }
            lastFormatError = error;
        }
    }

    if (!transcriptionResponse) {
        throw lastFormatError || new Error('OpenAI transcription failed before a valid response was returned.');
    }

    const normalized = normalizeOpenAiTranscript(transcriptionResponse.payload);
    console.info('[transcription:openai]', {
        model,
        responseFormat: transcriptionResponse.responseFormat,
        usedFallbackSegmentation: normalized.usedFallbackSegmentation,
        transcriptTurns: Array.isArray(normalized.transcript) ? normalized.transcript.length : 0,
        durationSeconds: normalized.durationSeconds,
    });
    return {
        transcript: normalized.transcript,
        systemState: buildInterviewTranscriptionSystemState({
            provider: 'openai',
            model,
            durationSeconds: normalized.durationSeconds,
            file,
            responseFormat: transcriptionResponse.responseFormat,
            usedFallbackSegmentation: normalized.usedFallbackSegmentation,
        }),
    };
};

const transcribeAudioWithGemini = async (file) => {
    if (!process.env.GEMINI_API_KEY) {
        throw new Error('GEMINI_API_KEY is not configured.');
    }

    const fileManager = new GoogleAIFileManager(process.env.GEMINI_API_KEY);
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-pro' });

    const uploadResponse = await fileManager.uploadFile(file.path, {
        mimeType: file.mimetype,
        displayName: file.originalname,
    });
    const geminiFileId = uploadResponse.file.name;

    try {
        let fileStatus = await fileManager.getFile(geminiFileId);
        while (fileStatus.state === 'PROCESSING') {
            await sleep(5000);
            fileStatus = await fileManager.getFile(geminiFileId);
        }

        if (fileStatus.state === 'FAILED') {
            throw new Error('Audio processing failed on Gemini servers.');
        }

        const prompt = `Transcribe this audio file. This is a user interview. Provide a verbatim transcript separated by speaker turns.
            Estimate the general speaker roles (e.g. "Interviewer" vs "Respondent"). 
            Estimate the local timestamp of each message starting from "00:00" relative to the start of the audio.
            
            You MUST return your response as a valid JSON array of objects, where each object has the keys: 
            "id" (generate a unique string id), "speaker" (string), "text" (string), "timestamp" (string).
            
            Do not include any markdown format blocks around the JSON array, just output the raw JSON array.`;

        const result = await model.generateContent([
            {
                fileData: {
                    mimeType: uploadResponse.file.mimeType,
                    fileUri: uploadResponse.file.uri,
                },
            },
            { text: prompt },
        ]);

        const responseText = result.response.text();

        let transcript;
        try {
            const cleanJsonString = responseText.replace(/^```json\s*/, '').replace(/\s*```$/, '').trim();
            transcript = normalizeStructuredTranscriptEntries(JSON.parse(cleanJsonString));

            if (!Array.isArray(transcript)) {
                throw new Error('Parsed data is not an array');
            }
        } catch (error) {
            console.error('Transcription parse error:', error);
            console.error('Raw response:', responseText);
            throw new Error('AI returned an invalid transcript format.');
        }

        return {
            transcript,
            systemState: {
                ...buildInterviewTranscriptionSystemState({
                    provider: 'gemini',
                    model: 'gemini-2.5-pro',
                    durationSeconds: Number.isFinite(file?.measuredDurationSeconds) ? file.measuredDurationSeconds : null,
                    file,
                    responseFormat: 'custom_json_array',
                    usedFallbackSegmentation: false,
                }),
                uploadStatus: 'completed',
            },
        };
    } finally {
        try {
            await fileManager.deleteFile(geminiFileId);
        } catch (cleanupErr) {
            console.warn('Could not delete file from Google AI Studio:', cleanupErr.message);
        }
    }
};

const transcribeAudioWithOpenAIRetry = async (file) => {
    let lastError = null;

    for (let attempt = 1; attempt <= OPENAI_TRANSCRIPTION_MAX_ATTEMPTS; attempt += 1) {
        try {
            const result = await transcribeAudioWithOpenAI(file);
            if (!Array.isArray(result.transcript) || result.transcript.length === 0) {
                throw createEmptyTranscriptError('OpenAI');
            }
            return result;
        } catch (error) {
            lastError = error;
            const shouldRetry = isRetryableOpenAiTranscriptionError(error)
                && attempt < OPENAI_TRANSCRIPTION_MAX_ATTEMPTS;

            if (!shouldRetry) {
                throw error;
            }

            console.warn('[transcription:openai] retrying failed transcription request', {
                attempt,
                maxAttempts: OPENAI_TRANSCRIPTION_MAX_ATTEMPTS,
                error: error.message,
            });
            await sleep(Math.min(1000 * attempt, 5000));
        }
    }

    throw lastError || new Error('OpenAI transcription failed before a valid response was returned.');
};

const transcribeAudioWithGeminiRetry = async (file, { interviewId, openAiError } = {}) => {
    let lastError = null;

    for (let attempt = 1; attempt <= GEMINI_TRANSCRIPTION_MAX_ATTEMPTS; attempt += 1) {
        try {
            const result = await runWithTimeout(
                transcribeAudioWithGemini(file),
                GEMINI_TRANSCRIPTION_TIMEOUT_MS,
                `Gemini transcription timed out after ${Math.round(GEMINI_TRANSCRIPTION_TIMEOUT_MS / 1000)} seconds.`
            );
            if (!Array.isArray(result.transcript) || result.transcript.length === 0) {
                throw createEmptyTranscriptError('Gemini');
            }
            return {
                ...result,
                attemptCount: attempt,
            };
        } catch (error) {
            lastError = error;
            const shouldRetry = isRetryableGeminiTranscriptionError(error)
                && attempt < GEMINI_TRANSCRIPTION_MAX_ATTEMPTS;

            if (!shouldRetry) {
                throw error;
            }

            console.warn('[transcription:gemini] retrying failed transcription fallback', {
                interviewId,
                attempt,
                maxAttempts: GEMINI_TRANSCRIPTION_MAX_ATTEMPTS,
                error: error.message,
            });
            await logSystemEvent('warning', 'Gemini transcription fallback retrying', {
                context: `ASYNC interview upload ${interviewId}`,
                interviewId,
                attempt,
                maxAttempts: GEMINI_TRANSCRIPTION_MAX_ATTEMPTS,
                openAiError: openAiError?.message || null,
                openAiErrorDetails: serializeErrorForLog(openAiError),
                geminiError: error.message,
                geminiErrorDetails: serializeErrorForLog(error),
            });
            await sleep(Math.min(1000 * attempt, 5000));
        }
    }

    throw lastError || new Error('Gemini transcription failed before a valid response was returned.');
};

const createCombinedTranscriptionError = (openAiError, fallbackError) => {
    const error = new Error(
        `OpenAI transcription failed (${openAiError?.message || 'unknown error'}); `
        + `Gemini fallback failed (${fallbackError?.message || 'unknown error'}).`
    );
    error.cause = fallbackError;
    return error;
};

const createPrimaryFallbackTranscriptionError = (primaryProvider, primaryError, fallbackProvider, fallbackError) => {
    const error = new Error(
        `${primaryProvider} transcription failed (${primaryError?.message || 'unknown error'}); `
        + `${fallbackProvider} fallback failed (${fallbackError?.message || 'unknown error'}).`
    );
    error.cause = fallbackError;
    return error;
};

const transcribeAudioWithGeminiPrimary = async (file, { interviewId, selection } = {}) => {
    await logSystemEvent('info', 'Gemini selected as primary transcription provider', {
        context: `ASYNC interview upload ${interviewId}`,
        interviewId,
        selection,
        sourceUploadFileName: file?.sourceUploadName || file?.originalname || '',
        sourceUploadFileSizeBytes: Number.isFinite(file?.sourceUploadSizeBytes) ? file.sourceUploadSizeBytes : null,
        fileSizeBytes: Number.isFinite(file?.size) ? file.size : null,
        mimeType: file?.mimetype || '',
        durationSeconds: Number.isFinite(file?.measuredDurationSeconds) ? file.measuredDurationSeconds : null,
        geminiMaxAttempts: GEMINI_TRANSCRIPTION_MAX_ATTEMPTS,
        geminiTimeoutMs: GEMINI_TRANSCRIPTION_TIMEOUT_MS,
    });

    try {
        const geminiResult = await transcribeAudioWithGeminiRetry(file, { interviewId });
        await logSystemEvent('info', 'Gemini primary transcription succeeded', {
            context: `ASYNC interview upload ${interviewId}`,
            interviewId,
            selection,
            provider: geminiResult.systemState?.provider || 'gemini',
            model: geminiResult.systemState?.model || 'gemini-2.5-pro',
            transcriptTurns: geminiResult.transcript.length,
            geminiAttempts: geminiResult.attemptCount || null,
            geminiMaxAttempts: GEMINI_TRANSCRIPTION_MAX_ATTEMPTS,
            sourceUploadFileName: file?.sourceUploadName || file?.originalname || '',
            sourceUploadFileSizeBytes: Number.isFinite(file?.sourceUploadSizeBytes) ? file.sourceUploadSizeBytes : null,
            fileSizeBytes: Number.isFinite(file?.size) ? file.size : null,
            durationSeconds: Number.isFinite(file?.measuredDurationSeconds) ? file.measuredDurationSeconds : null,
        });

        return {
            ...geminiResult,
            systemState: {
                ...geminiResult.systemState,
                primaryProvider: 'gemini',
                primarySelectionReason: selection?.reason || 'unknown',
                primarySelectedAt: new Date().toISOString(),
                geminiAttempts: geminiResult.attemptCount || null,
                geminiMaxAttempts: GEMINI_TRANSCRIPTION_MAX_ATTEMPTS,
            },
        };
    } catch (geminiError) {
        if (!process.env.OPENAI_API_KEY) {
            throw geminiError;
        }

        await logSystemEvent('warning', 'Gemini primary transcription failed, falling back to OpenAI', {
            context: `ASYNC interview upload ${interviewId}`,
            interviewId,
            selection,
            geminiError: geminiError.message,
            geminiErrorDetails: serializeErrorForLog(geminiError),
            openAiMaxAttempts: OPENAI_TRANSCRIPTION_MAX_ATTEMPTS,
        });

        try {
            const openAiResult = await transcribeAudioWithOpenAIRetry(file);
            await logSystemEvent('warning', 'OpenAI transcription fallback succeeded after Gemini primary failed', {
                context: `ASYNC interview upload ${interviewId}`,
                interviewId,
                selection,
                fallbackFromProvider: 'gemini',
                fallbackReason: geminiError.message,
                geminiError: serializeErrorForLog(geminiError),
                provider: openAiResult.systemState?.provider || 'openai',
                model: openAiResult.systemState?.model || DEFAULT_OPENAI_TRANSCRIPTION_MODEL,
                transcriptTurns: openAiResult.transcript.length,
            });

            return {
                ...openAiResult,
                systemState: {
                    ...openAiResult.systemState,
                    primaryProvider: 'gemini',
                    fallbackFromProvider: 'gemini',
                    fallbackReason: geminiError.message,
                    fallbackAt: new Date().toISOString(),
                    fallbackOpenAiAttempts: OPENAI_TRANSCRIPTION_MAX_ATTEMPTS,
                },
            };
        } catch (openAiError) {
            await logSystemEvent('error', 'OpenAI transcription fallback failed after Gemini primary failed', {
                context: `ASYNC interview upload ${interviewId}`,
                interviewId,
                selection,
                geminiError: geminiError.message,
                geminiErrorDetails: serializeErrorForLog(geminiError),
                openAiError: openAiError.message,
                openAiErrorDetails: serializeErrorForLog(openAiError),
            });
            throw createPrimaryFallbackTranscriptionError('Gemini', geminiError, 'OpenAI', openAiError);
        }
    }
};

const transcribeAudioWithProviderFallback = async (file, { interviewId } = {}) => {
    const geminiPrimarySelection = getGeminiPrimarySelection(file);
    if (geminiPrimarySelection.shouldUse) {
        return transcribeAudioWithGeminiPrimary(file, {
            interviewId,
            selection: geminiPrimarySelection,
        });
    }

    try {
        return await transcribeAudioWithOpenAIRetry(file);
    } catch (openAiError) {
        if (!isRetryableOpenAiTranscriptionError(openAiError)) {
            throw openAiError;
        }

        if (!process.env.GEMINI_API_KEY) {
            throw openAiError;
        }

        console.warn('[transcription] OpenAI failed, falling back to Gemini', {
            interviewId,
            error: openAiError.message,
        });
        await logSystemEvent('warning', 'OpenAI transcription fallback to Gemini', {
            context: `ASYNC interview upload ${interviewId}`,
            interviewId,
            reason: openAiError.message,
            openAiError: serializeErrorForLog(openAiError),
            openAiAttempts: OPENAI_TRANSCRIPTION_MAX_ATTEMPTS,
            sourceUploadFileName: file?.sourceUploadName || file?.originalname || '',
            sourceUploadFileSizeBytes: Number.isFinite(file?.sourceUploadSizeBytes) ? file.sourceUploadSizeBytes : null,
            normalizedFileSizeBytes: Number.isFinite(file?.size) ? file.size : null,
            normalizedMimeType: file?.mimetype || '',
        });

        try {
            const geminiResult = await transcribeAudioWithGeminiRetry(file, { interviewId, openAiError });
            await logSystemEvent('warning', 'Gemini transcription fallback succeeded', {
                context: `ASYNC interview upload ${interviewId}`,
                interviewId,
                fallbackFromProvider: 'openai',
                fallbackReason: openAiError.message,
                openAiError: serializeErrorForLog(openAiError),
                geminiAttempts: geminiResult.attemptCount || null,
                geminiMaxAttempts: GEMINI_TRANSCRIPTION_MAX_ATTEMPTS,
                provider: geminiResult.systemState?.provider || 'gemini',
                model: geminiResult.systemState?.model || 'gemini-2.5-pro',
                transcriptTurns: geminiResult.transcript.length,
                sourceUploadFileName: file?.sourceUploadName || file?.originalname || '',
                sourceUploadFileSizeBytes: Number.isFinite(file?.sourceUploadSizeBytes) ? file.sourceUploadSizeBytes : null,
                normalizedFileSizeBytes: Number.isFinite(file?.size) ? file.size : null,
                durationSeconds: Number.isFinite(file?.measuredDurationSeconds) ? file.measuredDurationSeconds : null,
            });

            return {
                ...geminiResult,
                systemState: {
                    ...geminiResult.systemState,
                    fallbackFromProvider: 'openai',
                    fallbackReason: openAiError.message,
                    fallbackAt: new Date().toISOString(),
                    fallbackOpenAiAttempts: OPENAI_TRANSCRIPTION_MAX_ATTEMPTS,
                    fallbackGeminiAttempts: geminiResult.attemptCount || null,
                    fallbackGeminiMaxAttempts: GEMINI_TRANSCRIPTION_MAX_ATTEMPTS,
                },
            };
        } catch (fallbackError) {
            await logSystemEvent('error', 'Gemini transcription fallback failed', {
                context: `ASYNC interview upload ${interviewId}`,
                interviewId,
                openAiError: openAiError.message,
                openAiErrorDetails: serializeErrorForLog(openAiError),
                geminiError: fallbackError.message,
                geminiErrorDetails: serializeErrorForLog(fallbackError),
                geminiMaxAttempts: GEMINI_TRANSCRIPTION_MAX_ATTEMPTS,
            });
            throw createCombinedTranscriptionError(openAiError, fallbackError);
        }
    }
};

return { prepareInterviewUploadForTranscription, canUseSourceUploadForTranscription, getInterviewUploadExtension, SOURCE_TRANSCRIPTION_EXTENSIONS, SOURCE_TRANSCRIPTION_MIME_TYPES, useSourceUploadForTranscription, getMediaDurationSeconds, FFMPEG_EXECUTABLE_CANDIDATES, ensureFfmpegExecutable, parseFfmpegDurationSeconds, normalizeInterviewUploadToMp3, runFfmpegCommand, TRANSCRIPTION_EXTRACTED_AUDIO_SAMPLE_RATE, TRANSCRIPTION_EXTRACTED_AUDIO_BITRATE, TRANSCRIPTION_NORMALIZED_AUDIO_MIME_TYPE, replaceFileExtension, transcribeAudioWithProviderFallback, getGeminiPrimarySelection, GEMINI_PRIMARY_MIN_DURATION_SECONDS, DEFAULT_GEMINI_PRIMARY_MIN_DURATION_SECONDS, getTranscriptionFileSizeBytes, GEMINI_PRIMARY_MIN_FILE_SIZE_BYTES, DEFAULT_GEMINI_PRIMARY_MIN_FILE_SIZE_BYTES, transcribeAudioWithGeminiPrimary, GEMINI_TRANSCRIPTION_MAX_ATTEMPTS, DEFAULT_GEMINI_TRANSCRIPTION_MAX_ATTEMPTS, GEMINI_TRANSCRIPTION_TIMEOUT_MS, DEFAULT_GEMINI_TRANSCRIPTION_TIMEOUT_MS, transcribeAudioWithGeminiRetry, runWithTimeout, createTimeoutError, transcribeAudioWithGemini, sleep, normalizeStructuredTranscriptEntries, parseTimestampToSeconds, normalizeTimestamp, buildInterviewTranscriptionSystemState, createEmptyTranscriptError, isRetryableGeminiTranscriptionError, isRetryableTranscriptionTransportError, serializeErrorForLog, OPENAI_TRANSCRIPTION_MAX_ATTEMPTS, DEFAULT_OPENAI_TRANSCRIPTION_MAX_ATTEMPTS, transcribeAudioWithOpenAIRetry, transcribeAudioWithOpenAI, DEFAULT_OPENAI_TRANSCRIPTION_MODEL, fetchWithTimeout, OPENAI_TRANSCRIPTION_TIMEOUT_MS, DEFAULT_OPENAI_TRANSCRIPTION_TIMEOUT_MS, getOpenAiTranscriptionResponseFormats, normalizeOpenAiTranscript, normalizeTranscriptSegments, getInterviewSpeakerRole, formatFallbackSpeakerLabel, splitTranscriptIntoEntries, isRetryableOpenAiTranscriptionError, isOpenAiFileTooLargeError, createPrimaryFallbackTranscriptionError, createCombinedTranscriptionError };
}
module.exports = { createTranscriptionService };
