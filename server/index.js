const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { GoogleAIFileManager } = require('@google/generative-ai/server');
const multer = require('multer');
const fs = require('fs');
const { encrypt, decrypt } = require('./integrations/encrypt');
const googleSheets = require('./integrations/googleSheets');
const microsoftExcel = require('./integrations/microsoftExcel');
const { mapRowsToMetric } = require('./integrations/mapRowsToMetric');
const { normalizeRangeA1 } = require('./integrations/normalizeRangeA1');
const { createExportToken, verifyExportToken } = require('./exportToken');
const supabase = require('./supabaseClient');
const supabaseAdmin = supabase.supabaseAdmin || supabase;
const rateLimit = require('express-rate-limit');

const app = express();
const PORT = process.env.PORT || 5005;
const CANONICAL_ORIGIN = (process.env.CANONICAL_ORIGIN || 'https://iterojm.com').replace(/\/$/, '');
const CANONICAL_HOST = (() => {
  try {
    return new URL(CANONICAL_ORIGIN).host;
  } catch {
    return 'iterojm.com';
  }
})();
const API_PUBLIC_ORIGIN = (process.env.API_URL || CANONICAL_ORIGIN).replace(/\/$/, '');
const APP_ORIGIN = (process.env.APP_ORIGIN || 'https://app.iterojm.com').replace(/\/$/, '');
const APP_HOST = (() => {
  try {
    return new URL(APP_ORIGIN).host;
  } catch {
    return 'app.iterojm.com';
  }
})();
const CLIENT_ORIGIN = (process.env.CLIENT_ORIGIN || APP_ORIGIN).replace(/\/$/, '');
const ADMIN_ORIGIN = (process.env.ADMIN_ORIGIN || 'https://admin.iterojm.com').replace(/\/$/, '');
const ADMIN_HOST = (() => {
  try {
    return new URL(ADMIN_ORIGIN).host;
  } catch {
    return 'admin.iterojm.com';
  }
})();

const APP_ROUTE_PREFIXES = ['/auth', '/dashboard', '/journeys', '/journey', '/personas', '/metrics', '/interviews', '/settings', '/archive', '/export'];
const isAppRoutePath = (path = '/') => APP_ROUTE_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}/`));

const hostRedirects = {
  'www.iterojm.com': { origin: CANONICAL_ORIGIN, buildPath: (path) => path },
  'iterojm.vercel.app': { origin: CANONICAL_ORIGIN, buildPath: (path) => path },
  'iterojm-app.vercel.app': { origin: APP_ORIGIN, buildPath: (path) => (path === '/landing' ? '/' : path) },
  'iterojm-admin.vercel.app': {
    origin: ADMIN_ORIGIN,
    buildPath: (path) => (path.startsWith('/admin') ? path.replace(/^\/admin/, '') || '/' : path),
  },
};

// Required when running behind a proxy (e.g. Render, Vercel) so rate-limit and IP detection work
app.set('trust proxy', 1);

// GLOBAL LOGGER: Log every single request hitting the server
app.use((req, res, next) => {
    console.log(`📡 [INCOMING] ${req.method} ${req.url}`);
    next();
});

// Canonical host redirect for browser traffic after moving to Hostinger.
app.use((req, res, next) => {
    if (process.env.NODE_ENV !== 'production') return next();

    const hostname = String(req.hostname || '').toLowerCase();
    const redirectTarget = hostRedirects[hostname];
    if (!redirectTarget) return next();
    if (!['GET', 'HEAD'].includes(req.method)) return next();

    const redirectPath = redirectTarget.buildPath(req.path || '/');
    const queryIndex = req.originalUrl.indexOf('?');
    const query = queryIndex >= 0 ? req.originalUrl.slice(queryIndex) : '';
    return res.redirect(301, `${redirectTarget.origin}${redirectPath}${query}`);
});

app.use((req, res, next) => {
    if (process.env.NODE_ENV !== 'production') return next();
    if (!['GET', 'HEAD'].includes(req.method)) return next();
    if (String(req.hostname || '').toLowerCase() !== CANONICAL_HOST) return next();
    if (!(req.path === '/admin' || req.path.startsWith('/admin/'))) return next();

    const targetPath = req.path === '/admin' ? '/' : req.path.replace(/^\/admin/, '') || '/';
    const queryIndex = req.originalUrl.indexOf('?');
    const query = queryIndex >= 0 ? req.originalUrl.slice(queryIndex) : '';
    return res.redirect(301, `${ADMIN_ORIGIN}${targetPath}${query}`);
});

app.use((req, res, next) => {
    if (process.env.NODE_ENV !== 'production') return next();
    if (!['GET', 'HEAD'].includes(req.method)) return next();

    const hostname = String(req.hostname || '').toLowerCase();
    const path = req.path || '/';
    const queryIndex = req.originalUrl.indexOf('?');
    const query = queryIndex >= 0 ? req.originalUrl.slice(queryIndex) : '';

    if (hostname === CANONICAL_HOST) {
        if (path === '/') {
            return res.redirect(301, `${CANONICAL_ORIGIN}/en${query}`);
        }

        if (path === '/terms') {
            return res.redirect(301, `${CANONICAL_ORIGIN}/en/terms${query}`);
        }

        if (path === '/privacy') {
            return res.redirect(301, `${CANONICAL_ORIGIN}/en/privacy${query}`);
        }

        if (path === '/landing') {
            return res.redirect(301, `${CANONICAL_ORIGIN}/en${query}`);
        }

        if (path === '/landing/en') {
            return res.redirect(301, `${CANONICAL_ORIGIN}/en${query}`);
        }

        if (path === '/landing/uk') {
            return res.redirect(301, `${CANONICAL_ORIGIN}/uk${query}`);
        }

        if (path === '/landing/terms' || path === '/landing/en/terms') {
            return res.redirect(301, `${CANONICAL_ORIGIN}/en/terms${query}`);
        }

        if (path === '/landing/privacy' || path === '/landing/en/privacy') {
            return res.redirect(301, `${CANONICAL_ORIGIN}/en/privacy${query}`);
        }

        if (path === '/landing/uk/terms') {
            return res.redirect(301, `${CANONICAL_ORIGIN}/uk/terms${query}`);
        }

        if (path === '/landing/uk/privacy') {
            return res.redirect(301, `${CANONICAL_ORIGIN}/uk/privacy${query}`);
        }

        if (isAppRoutePath(path)) {
            return res.redirect(301, `${APP_ORIGIN}${path}${query}`);
        }
    }

    if (hostname === APP_HOST && path === '/landing') {
        return res.redirect(301, `${CANONICAL_ORIGIN}/en${query}`);
    }

    if (hostname === ADMIN_HOST && path === '/landing') {
        return res.redirect(301, `${CANONICAL_ORIGIN}/${query}`);
    }

    return next();
});

// Initialize Storage Bucket
(async () => {
    try {
        const { data: buckets, error } = await supabaseAdmin.storage.listBuckets();
        if (error) console.error('Error listing buckets:', error);
        
        if (buckets && !buckets.find(b => b.name === 'journey_images')) {
            console.log('Creating "journey_images" bucket...');
            await supabaseAdmin.storage.createBucket('journey_images', {
                public: true,
                fileSizeLimit: 2097152, // 2MB limit enforced by Supabase
                allowedMimeTypes: ['image/png', 'image/jpeg', 'image/gif', 'image/webp']
            });
        }
    } catch (e) {
        console.error('Storage init error:', e);
    }
})();

// Middleware: CORS налаштування (Local + Production)
const allowedOrigins = [
  // Локальна розробка
  'http://localhost:3000',
  'http://localhost:5173',
  'http://localhost:5174',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:5173',
  'http://127.0.0.1:5174',

  // Канонічний домен + тимчасово legacy-домени для м'якого переходу
  CANONICAL_ORIGIN,
  APP_ORIGIN,
  ADMIN_ORIGIN,
  'https://www.iterojm.com',
  'https://iterojm.vercel.app',
  'https://iterojm-app.vercel.app',
  'https://iterojm-admin.vercel.app',
];

const INTERVIEW_SYSTEM_KEY = '_system';
const INTERVIEW_UPLOAD_ERROR_FALLBACK = 'Transcription failed. Please try uploading again.';
const DEFAULT_OPENAI_TRANSCRIPTION_MODEL = 'gpt-4o-transcribe-diarize';
const INTERVIEW_SUMMARY_SECTION_ORDER = [
    'summary',
    'journeyDraft',
    'jtbdProfile',
    'forcesOfProgress',
    'painPoints',
    'momentsOfFriction',
    'unmetNeeds',
    'workarounds',
    'opportunityAreas',
    'strengths',
    'quotes',
];
const INTERVIEW_SUMMARY_PRESET_SECTIONS = {
    full_analysis: INTERVIEW_SUMMARY_SECTION_ORDER,
    quick_summary: ['summary', 'painPoints', 'strengths', 'quotes'],
    research_insights: ['summary', 'painPoints', 'strengths', 'momentsOfFriction', 'unmetNeeds', 'workarounds', 'opportunityAreas', 'quotes'],
    journey_mapping: ['summary', 'journeyDraft', 'painPoints', 'strengths', 'momentsOfFriction', 'quotes'],
    jtbd_analysis: ['summary', 'jtbdProfile', 'forcesOfProgress', 'strengths', 'quotes'],
};
const INTERVIEW_SUMMARY_SECTION_PROMPT_DEFS = {
    summary: {
        focus: [
            'what the respondent is trying to achieve',
            'the sharpest evidence-backed summary of the interview',
            'the overall emotional tone of the experience',
        ],
        schema: `"summary": {
    "jobToBeDone": "string",
    "generalInsight": "string",
    "overallSentiment": "positive|mixed|negative"
  }`,
        limits: [
            'summary.generalInsight: 1 concise paragraph',
        ],
    },
    journeyDraft: {
        focus: [
            'the customer journey they are moving through',
            'stages, customer actions, touchpoints, and pain points at each stage',
        ],
        schema: `"journeyDraft": {
    "jobContext": "string",
    "stages": [
      {
        "stage": "string",
        "customerActions": ["string"],
        "touchpoints": [
          {
            "touchpoint": "string",
            "interactsWith": "string",
            "channel": "string"
          }
        ],
        "painPoints": [
          {
            "title": "string",
            "description": "string",
            "severity": "low|medium|high"
          }
        ]
      }
    ]
  }`,
        limits: [
            'journeyDraft.stages: up to 8',
            'journeyDraft.customerActions: up to 6 per stage',
            'journeyDraft.touchpoints: up to 6 per stage',
            'journeyDraft.painPoints: up to 5 per stage',
        ],
    },
    jtbdProfile: {
        focus: [
            'the customer\'s JTBD profile',
        ],
        schema: `"jtbdProfile": {
    "mainJob": "string",
    "functionalJob": "string",
    "emotionalJob": "string",
    "socialJob": "string",
    "jobContext": "string",
    "desiredOutcome": "string",
    "successCriteria": ["string"]
  }`,
        limits: [
            'jtbdProfile.successCriteria: up to 5',
        ],
    },
    forcesOfProgress: {
        focus: [
            'the 4 forces of progress (push, pull, anxiety, habit)',
        ],
        schema: `"forcesOfProgress": {
    "pushes": ["string"],
    "pulls": ["string"],
    "anxieties": ["string"],
    "habits": ["string"]
  }`,
        limits: [
            'forcesOfProgress.pushes/pulls/anxieties/habits: up to 5 each',
        ],
    },
    painPoints: {
        focus: [
            'broken expectations',
            'the likely root causes behind complaints',
            'the most important pain points and their impact',
        ],
        schema: `"painPoints": [
    {
      "title": "string",
      "description": "string",
      "rootCause": "string",
      "impact": "string",
      "severity": "low|medium|high",
      "evidenceQuote": "string"
    }
  ]`,
        limits: [
            'painPoints: up to 5',
        ],
    },
    momentsOfFriction: {
        focus: [
            'friction and service gaps across touchpoints',
            'moments where the experience breaks down and how the customer reacts',
        ],
        schema: `"momentsOfFriction": [
    {
      "stage": "string",
      "situation": "string",
      "breakdown": "string",
      "customerReaction": "string"
    }
  ]`,
        limits: [
            'momentsOfFriction: up to 5',
        ],
    },
    unmetNeeds: {
        focus: [
            'unmet needs',
        ],
        schema: `"unmetNeeds": [
    {
      "need": "string",
      "whyItMatters": "string"
    }
  ]`,
        limits: [
            'unmetNeeds: up to 5',
        ],
    },
    workarounds: {
        focus: [
            'workarounds',
        ],
        schema: `"workarounds": [
    {
      "workaround": "string",
      "whatItSignals": "string"
    }
  ]`,
        limits: [
            'workarounds: up to 3',
        ],
    },
    opportunityAreas: {
        focus: [
            'evidence-backed opportunity areas for improving the experience',
        ],
        schema: `"opportunityAreas": [
    {
      "area": "string",
      "rationale": "string"
    }
  ]`,
        limits: [
            'opportunityAreas: up to 5',
        ],
    },
    strengths: {
        focus: [
            'what already works well in the experience',
            'service elements, solutions, or touchpoints that genuinely help the customer',
            'positive moments worth preserving or scaling',
        ],
        schema: `"strengths": [
    {
      "title": "string",
      "description": "string",
      "whyItWorks": "string",
      "evidenceQuote": "string"
    }
  ]`,
        limits: [
            'strengths: up to 5',
        ],
    },
    quotes: {
        focus: [
            'the strongest verbatim quotes that represent the customer\'s voice',
        ],
        schema: `"quotes": ["string"]`,
        limits: [
            'quotes: up to 3',
        ],
    },
};

function isPlainObject(value) {
    return !!value && typeof value === 'object' && !Array.isArray(value);
}

function getInterviewSystemState(summaryData) {
    if (!isPlainObject(summaryData)) return {};
    const systemState = summaryData[INTERVIEW_SYSTEM_KEY];
    return isPlainObject(systemState) ? systemState : {};
}

function withInterviewSystemState(summaryData, nextSystemState) {
    const baseSummary = isPlainObject(summaryData) ? { ...summaryData } : {};
    if (!nextSystemState || Object.keys(nextSystemState).length === 0) {
        delete baseSummary[INTERVIEW_SYSTEM_KEY];
        return baseSummary;
    }
    baseSummary[INTERVIEW_SYSTEM_KEY] = nextSystemState;
    return baseSummary;
}

function normalizeInterviewSummarySections(value) {
    if (!Array.isArray(value)) return [];
    const seen = new Set();
    return value.reduce((sections, item) => {
        const sectionKey = typeof item === 'string' ? item.trim() : '';
        if (!INTERVIEW_SUMMARY_SECTION_ORDER.includes(sectionKey) || seen.has(sectionKey)) return sections;
        seen.add(sectionKey);
        sections.push(sectionKey);
        return sections;
    }, []);
}

function resolveInterviewSummaryRequest(body = {}) {
    const requestedSections = normalizeInterviewSummarySections(body?.selectedSections);
    const presetCandidate = typeof body?.preset === 'string' ? body.preset.trim() : '';
    const preset = Object.prototype.hasOwnProperty.call(INTERVIEW_SUMMARY_PRESET_SECTIONS, presetCandidate)
        ? presetCandidate
        : (requestedSections.length > 0 ? 'custom' : 'full_analysis');

    return {
        preset,
        selectedSections: requestedSections.length > 0
            ? requestedSections
            : [...(INTERVIEW_SUMMARY_PRESET_SECTIONS[preset] || INTERVIEW_SUMMARY_PRESET_SECTIONS.full_analysis)],
        mergeMode: body?.mergeMode === 'replace_all' ? 'replace_all' : 'merge_selected',
    };
}

function buildInterviewSummaryPrompt({ conversationText, selectedSections }) {
    const sectionDefs = selectedSections
        .map((sectionKey) => INTERVIEW_SUMMARY_SECTION_PROMPT_DEFS[sectionKey])
        .filter(Boolean);
    const focusBullets = [...new Set(sectionDefs.flatMap((section) => section.focus || []))];
    const schema = sectionDefs.map((section) => section.schema).join(',\n');
    const limits = [...new Set(sectionDefs.flatMap((section) => section.limits || []))];

    return `You are a senior CX Researcher and Service Designer.
Your task is to analyze this interview as evidence about the customer's lived experience across a service, not just to summarize the conversation.

Only generate the requested analysis sections.

Focus on:
${focusBullets.map((item) => `- ${item}`).join('\n')}

CRITICAL RULES:
- Detect the dominant language of the transcript and write the entire output in that exact same language.
- Base every conclusion only on evidence from the transcript.
- Do not invent facts, motivations, stages, or context that are not supported by the transcript.
- Prioritize the respondent's statements over the interviewer's framing.
- Merge duplicate observations.
- Be specific, concise, and insight-rich.
- Highlight not only problems, but also what already works well when that section is requested.
- If something is unclear, prefer an empty string or empty array instead of guessing.
- Return only the requested top-level keys and omit everything else.

Return EXACTLY one valid JSON object with this schema:
{
  ${schema}
}

LIMITS:
${limits.map((item) => `- ${item}`).join('\n')}

Do not include markdown fences.
Return only JSON.

Transcript:
"""
${conversationText}
"""`;
}

function mergeInterviewSummarySections(existingSummaryData, generatedSummaryData, selectedSections) {
    const existingSummary = normalizeInterviewSummaryData(existingSummaryData) || {};
    const mergedSummary = {};

    INTERVIEW_SUMMARY_SECTION_ORDER.forEach((sectionKey) => {
        if (selectedSections.includes(sectionKey)) {
            mergedSummary[sectionKey] = generatedSummaryData[sectionKey];
            return;
        }

        if (Object.prototype.hasOwnProperty.call(existingSummary, sectionKey)) {
            mergedSummary[sectionKey] = existingSummary[sectionKey];
            return;
        }

        mergedSummary[sectionKey] = generatedSummaryData[sectionKey];
    });

    return normalizeInterviewSummaryData(mergedSummary) || generatedSummaryData;
}

function buildInterviewSummarySystemState(currentSystemState, { provider, model, preset, selectedSections, mergeMode }) {
    return {
        ...currentSystemState,
        summaryGeneration: {
            provider,
            model,
            preset,
            selectedSections,
            mergeMode,
            generatedAt: new Date().toISOString(),
        },
    };
}

function formatTranscriptTimestamp(totalSeconds) {
    const safeSeconds = Number.isFinite(totalSeconds) ? Math.max(0, totalSeconds) : 0;
    const hours = Math.floor(safeSeconds / 3600);
    const minutes = Math.floor((safeSeconds % 3600) / 60);
    const seconds = Math.floor(safeSeconds % 60);
    const base = [minutes, seconds].map((value) => String(value).padStart(2, '0')).join(':');
    return hours > 0 ? `${String(hours).padStart(2, '0')}:${base}` : base;
}

function splitTranscriptTextIntoEntries(text, durationSeconds) {
    const cleaned = String(text || '').trim();
    if (!cleaned) return [];

    const chunks = cleaned
        .split(/\n+/)
        .flatMap((paragraph) => paragraph.split(/(?<=[.!?])\s+/))
        .map((chunk) => chunk.trim())
        .filter(Boolean);

    const sourceChunks = chunks.length > 0 ? chunks : [cleaned];
    const totalDuration = Number.isFinite(durationSeconds) ? Math.max(0, durationSeconds) : 0;

    return sourceChunks.map((chunk, index) => {
        const timestampSeconds = sourceChunks.length > 1
            ? (totalDuration * index) / sourceChunks.length
            : 0;

        return {
            id: crypto.randomUUID(),
            speaker: 'Respondent',
            text: chunk,
            timestamp: formatTranscriptTimestamp(timestampSeconds),
        };
    });
}

function normalizeOpenAiTranscriptJson(payload, fallbackText = '') {
    if (!payload || typeof payload !== 'object') {
        return splitTranscriptTextIntoEntries(fallbackText, 0);
    }

    if (Array.isArray(payload.segments) && payload.segments.length > 0) {
        const normalizedSegments = payload.segments
            .map((segment, index) => {
                const text = typeof segment?.text === 'string' ? segment.text.trim() : '';
                if (!text) return null;
                const start = Number(segment?.start);
                const speaker = typeof segment?.speaker === 'string' && segment.speaker.trim()
                    ? segment.speaker.trim()
                    : 'Respondent';

                return {
                    id: crypto.randomUUID(),
                    speaker,
                    text,
                    timestamp: formatTranscriptTimestamp(Number.isFinite(start) ? start : index * 10),
                };
            })
            .filter(Boolean);

        if (normalizedSegments.length > 0) return normalizedSegments;
    }

    const transcriptText = typeof payload.text === 'string' && payload.text.trim()
        ? payload.text
        : fallbackText;
    const durationSeconds = Number(payload.duration);
    return splitTranscriptTextIntoEntries(transcriptText, durationSeconds);
}

function getOpenAiTranscriptionRatePerMinute(model) {
    const explicitRate = Number(process.env.OPENAI_TRANSCRIPTION_RATE_USD_PER_MINUTE);
    if (Number.isFinite(explicitRate) && explicitRate > 0) return explicitRate;

    switch (model) {
        case 'gpt-4o-mini-transcribe':
            return 0.003;
        case 'gpt-4o-transcribe':
        case 'gpt-4o-transcribe-diarize':
        case 'whisper-1':
            return 0.006;
        default:
            return null;
    }
}

function createInterviewTranscriptionSystemState({
    provider,
    model,
    durationSeconds,
    file,
    mode = 'transcription',
    responseFormat = null,
    usedFallbackSegmentation = false,
    estimatedCostUsd = null,
}) {
    const metadata = {
        provider,
        model,
        mode,
        responseFormat,
        generatedAt: new Date().toISOString(),
        fileName: file?.originalname || '',
        mimeType: file?.mimetype || '',
        fileSizeBytes: Number.isFinite(file?.size) ? file.size : null,
        durationSeconds: Number.isFinite(durationSeconds) ? durationSeconds : null,
        usedFallbackSegmentation: !!usedFallbackSegmentation,
    };

    if (Number.isFinite(estimatedCostUsd)) {
        metadata.estimatedCostUsd = Number(estimatedCostUsd.toFixed(6));
    }

    return metadata;
}

function getEffectiveInterviewStatus(interview) {
    const persistedStatus = typeof interview?.status === 'string' ? interview.status : 'draft';
    if (persistedStatus === 'processing' || persistedStatus === 'failed' || persistedStatus === 'completed') {
        return persistedStatus;
    }

    const systemState = getInterviewSystemState(interview?.summary_data);
    if (systemState.uploadStatus === 'processing' || systemState.uploadStatus === 'failed') {
        return systemState.uploadStatus;
    }

    return persistedStatus || 'draft';
}

function sanitizeInterviewForClient(interview) {
    if (!interview) return interview;
    const effectiveStatus = getEffectiveInterviewStatus(interview);
    return {
        ...interview,
        status: effectiveStatus,
    };
}

function isMissingDatabaseObjectError(error, objectName = '') {
    if (!error) return false;
    const message = String(error.message || '').toLowerCase();
    const details = String(error.details || '').toLowerCase();
    const hint = String(error.hint || '').toLowerCase();
    const needle = String(objectName || '').toLowerCase();
    return (
        error.code === '42P01' ||
        error.code === '42883' ||
        message.includes('does not exist') ||
        details.includes('does not exist') ||
        hint.includes('does not exist') ||
        (needle && (message.includes(needle) || details.includes(needle) || hint.includes(needle)))
    );
}

async function getWorkspaceCreatedInterviewUsage(workspaceId, currentInterviewCount = 0) {
    const { data, error } = await supabaseAdmin
        .from('workspace_usage_counters')
        .select('interviews_created')
        .eq('workspace_id', workspaceId)
        .maybeSingle();

    if (error) {
        if (isMissingDatabaseObjectError(error, 'workspace_usage_counters')) {
            return currentInterviewCount;
        }
        throw error;
    }

    const persistedCount = Number.isFinite(Number(data?.interviews_created)) ? Number(data.interviews_created) : 0;
    return Math.max(currentInterviewCount, persistedCount);
}

async function incrementWorkspaceInterviewUsage(workspaceId) {
    const rpcResult = await supabaseAdmin.rpc('increment_workspace_interview_usage', {
        p_workspace_id: workspaceId,
    });

    if (!rpcResult.error) {
        const nextCount = Number.isFinite(Number(rpcResult.data)) ? Number(rpcResult.data) : null;
        return { persisted: true, count: nextCount };
    }

    if (!isMissingDatabaseObjectError(rpcResult.error, 'increment_workspace_interview_usage')) {
        throw rpcResult.error;
    }

    const currentRow = await supabaseAdmin
        .from('workspace_usage_counters')
        .select('workspace_id, interviews_created')
        .eq('workspace_id', workspaceId)
        .maybeSingle();

    if (currentRow.error) {
        if (isMissingDatabaseObjectError(currentRow.error, 'workspace_usage_counters')) {
            return { persisted: false, count: null };
        }
        throw currentRow.error;
    }

    if (currentRow.data) {
        const nextCount = (Number(currentRow.data.interviews_created) || 0) + 1;
        const updateResult = await supabaseAdmin
            .from('workspace_usage_counters')
            .update({
                interviews_created: nextCount,
                updated_at: new Date().toISOString(),
            })
            .eq('workspace_id', workspaceId)
            .select('interviews_created')
            .single();

        if (updateResult.error) throw updateResult.error;
        return { persisted: true, count: Number(updateResult.data?.interviews_created) || nextCount };
    }

    const insertResult = await supabaseAdmin
        .from('workspace_usage_counters')
        .insert([{
            workspace_id: workspaceId,
            interviews_created: 1,
        }])
        .select('interviews_created')
        .single();

    if (insertResult.error) throw insertResult.error;
    return { persisted: true, count: Number(insertResult.data?.interviews_created) || 1 };
}

function isInterviewStatusConstraintError(error) {
    if (!error) return false;
    return error.constraint === 'interviews_status_check' || String(error.message || '').includes('interviews_status_check');
}

async function updateInterviewStatusCompat(interviewId, nextStatus, extraUpdates = {}, existingSummaryData = null) {
    const basePayload = {
        ...extraUpdates,
        updated_at: new Date().toISOString(),
    };
    delete basePayload.upload_error_message;

    const directStatusPayload = {
        ...basePayload,
        status: nextStatus,
    };

    const { data, error } = await supabaseAdmin
        .from('interviews')
        .update(directStatusPayload)
        .eq('id', interviewId)
        .select()
        .single();

    if (!error) {
        return { data: sanitizeInterviewForClient(data), persistedViaFallback: false };
    }

    if (!isInterviewStatusConstraintError(error) || (nextStatus !== 'processing' && nextStatus !== 'failed')) {
        throw error;
    }

    const currentSummaryData = existingSummaryData !== null ? existingSummaryData : null;
    const currentSystemState = getInterviewSystemState(currentSummaryData);
    const fallbackSystemState = {
        ...currentSystemState,
        uploadStatus: nextStatus,
    };

    if (nextStatus === 'failed') {
        fallbackSystemState.uploadError = extraUpdates.upload_error_message || INTERVIEW_UPLOAD_ERROR_FALLBACK;
        fallbackSystemState.failedAt = new Date().toISOString();
    } else {
        delete fallbackSystemState.uploadError;
        delete fallbackSystemState.failedAt;
        fallbackSystemState.startedAt = new Date().toISOString();
    }

    const fallbackSummaryData = withInterviewSystemState(currentSummaryData, fallbackSystemState);
    const fallbackPayload = {
        ...basePayload,
        status: 'draft',
        summary_data: fallbackSummaryData,
    };

    const fallbackResult = await supabaseAdmin
        .from('interviews')
        .update(fallbackPayload)
        .eq('id', interviewId)
        .select()
        .single();

    if (fallbackResult.error) throw fallbackResult.error;

    return { data: sanitizeInterviewForClient(fallbackResult.data), persistedViaFallback: true };
}

app.use(cors({
  origin: (origin, callback) => {
      // 1. Дозволяємо запити без origin (Postman, серверні скрипти)
      if (!origin) return callback(null, true);

      // 2. Перевіряємо, чи є origin у білому списку
      if (allowedOrigins.indexOf(origin) !== -1) {
          return callback(null, true);
      }

      // 3. Додаткова перевірка для будь-якого Localhost (на випадок інших портів)
      // Це дозволить тобі працювати локально, навіть якщо порт зміниться
      if (origin.includes('localhost') || origin.includes('127.0.0.1')) {
          return callback(null, true);
      }

      // 4. Якщо нічого не підійшло — блокуємо
      console.log('Blocked by CORS:', origin);
      return callback(null, false);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));

// Вмикає pre-flight для всіх маршрутів
app.options('*', cors());

// Lemon Squeezy webhook: must receive raw body for signature verification (register before express.json)
app.post('/api/webhooks/lemonsqueezy', express.raw({ type: 'application/json' }), async (req, res) => {
    const secret = process.env.LEMONSQUEEZY_WEBHOOK_SECRET;
    if (!secret) {
        console.error('LEMONSQUEEZY_WEBHOOK_SECRET is not set');
        return res.status(500).json({ error: 'Webhook not configured' });
    }
    const rawBody = req.body;
    if (!rawBody || !Buffer.isBuffer(rawBody)) {
        return res.status(400).json({ error: 'Invalid body' });
    }
    const signature = req.get('X-Signature');
    if (!signature) {
        return res.status(401).json({ error: 'Missing X-Signature' });
    }
    try {
        const hmac = crypto.createHmac('sha256', secret);
        const digest = hmac.update(rawBody).digest('hex');
        const sigBuf = Buffer.from(signature, 'utf8');
        const digestBuf = Buffer.from(digest, 'utf8');
        if (sigBuf.length !== digestBuf.length || !crypto.timingSafeEqual(digestBuf, sigBuf)) {
            return res.status(401).json({ error: 'Invalid signature' });
        }
    } catch (e) {
        return res.status(401).json({ error: 'Invalid signature' });
    }
    let payload;
    try {
        payload = JSON.parse(rawBody.toString('utf8'));
    } catch (e) {
        return res.status(400).json({ error: 'Invalid JSON' });
    }
    const eventName = payload?.meta?.event_name;
    const customData = payload?.meta?.custom_data || {};
    const data = payload?.data;
    const attrs = data?.attributes || {};
    let variantId = null;
    let userEmail = null;
    if (eventName === 'order_created') {
        variantId = attrs?.first_order_item?.variant_id;
        userEmail = attrs?.user_email;
    } else if (eventName === 'subscription_created') {
        variantId = attrs?.variant_id;
        userEmail = attrs?.user_email;
    }
    // subscription_payment_success sends subscription-invoices (no variant_id); fetch subscription from API to get variant_id
    if (eventName === 'subscription_payment_success') {
        const subscriptionId = attrs?.subscription_id;
        const apiKey = process.env.LEMONSQUEEZY_API_KEY;
        userEmail = attrs?.user_email || userEmail;
        if (apiKey && subscriptionId) {
            try {
                const subRes = await fetch(`https://api.lemonsqueezy.com/v1/subscriptions/${subscriptionId}`, {
                    headers: { 'Accept': 'application/vnd.api+json', 'Content-Type': 'application/vnd.api+json', 'Authorization': `Bearer ${apiKey}` }
                });
                const subJson = await subRes.json();
                const subAttrs = subJson?.data?.attributes;
                variantId = subAttrs?.variant_id;
            } catch (e) {
            }
        }
        if (!variantId) {
            return res.status(200).json({ ok: true, message: 'Payment acknowledged; set LEMONSQUEEZY_API_KEY and subscription_id to update plan' });
        }
        // fall through to plan lookup and subscription update below
    }
    if (!variantId && eventName !== 'subscription_cancelled') {
        return res.status(200).json({ ok: true, message: 'Event ignored' });
    }
    if (eventName === 'subscription_cancelled') {
        return res.status(200).json({ ok: true, message: 'Cancellation acknowledged' });
    }
    const variantIdStr = String(variantId);
    const { data: planRow, error: planError } = await supabaseAdmin
        .from('plans')
        .select('id, lemonsqueezy_variant_id_monthly, lemonsqueezy_variant_id_yearly')
        .or(`lemonsqueezy_variant_id_monthly.eq.${variantIdStr},lemonsqueezy_variant_id_yearly.eq.${variantIdStr}`)
        .limit(1)
        .maybeSingle();
    if (!planRow) {
        console.warn('Lemon Squeezy webhook: no plan found for variant_id', variantIdStr);
        return res.status(200).json({ ok: true, message: 'Plan not mapped' });
    }
    const interval = planRow.lemonsqueezy_variant_id_monthly === variantIdStr ? 'monthly' : 'yearly';
    let userId = customData.user_id || null;
    if (!userId && userEmail) {
        const { data: listData, error: listErr } = await supabaseAdmin.auth.admin.listUsers({ perPage: 1000 });
        const users = listData?.users;
        if (!listErr && Array.isArray(users)) {
            const match = users.find((u) => (u.email || '').toLowerCase() === String(userEmail).toLowerCase());
            if (match) userId = match.id;
        }
    }
    if (!userId) {
        console.warn('Lemon Squeezy webhook: could not resolve user for email', userEmail);
        return res.status(200).json({ ok: true, message: 'User not found' });
    }
    const periodStart = new Date();
    const periodEnd = new Date();
    if (interval === 'yearly') {
        periodEnd.setFullYear(periodEnd.getFullYear() + 1);
    } else {
        periodEnd.setMonth(periodEnd.getMonth() + 1);
    }
    const { error: updateErr } = await supabaseAdmin
        .from('subscriptions')
        .update({ status: 'canceled' })
        .eq('user_id', userId)
        .eq('status', 'active');
    const { error: insertErr } = await supabaseAdmin.from('subscriptions').insert([{
        user_id: userId,
        plan_id: planRow.id,
        status: 'active',
        current_period_start: periodStart,
        current_period_end: periodEnd,
    }]);
    if (insertErr) {
        console.error('Lemon Squeezy webhook: subscription insert failed', insertErr);
        return res.status(500).json({ error: 'Failed to create subscription' });
    }
    return res.status(200).json({ ok: true });
});

app.use(express.json());

// Rate limit for auth: 10 requests per minute per IP
const authLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 10,
    message: { status: 'error', error: 'Too many requests, try again later.' },
    standardHeaders: true,
    legacyHeaders: false,
});
app.use('/api/login', authLimiter);
app.use('/api/register', authLimiter);

// --- SYSTEM LOGGING HELPER ---
async function logSystemError(error, context = '') {
    try {
        const { error: insertError } = await supabaseAdmin.from('system_logs').insert([{
            level: 'error',
            message: error.message || 'Unknown error',
            details: { stack: error.stack, context }
        }]);
        if (insertError) throw insertError;
    } catch (e) {
        console.error('Failed to log system error to DB:', e);
    }
}

// --- WORKSPACE ACCESS HELPERS (owner + member) ---
// Use supabaseAdmin so RLS never blocks reads (server has validated user via token).
// Prevents false "no workspace" when anon key + RLS would return empty on local.
async function getAccessibleWorkspaceIds(userId) {
    const { data: owned } = await supabaseAdmin.from('workspaces').select('id').eq('owner_id', userId);
    const { data: member } = await supabaseAdmin.from('workspace_members').select('workspace_id').eq('user_id', userId);
    return [
        ...(owned || []).map(w => w.id),
        ...(member || []).map(w => w.workspace_id)
    ];
}

async function getCurrentWorkspaceForUser(userId) {
    const { data: owned } = await supabaseAdmin.from('workspaces').select('id').eq('owner_id', userId).limit(1).maybeSingle();
    if (owned) return { id: owned.id, role: 'owner' };
    const { data: member } = await supabaseAdmin.from('workspace_members').select('workspace_id, role').eq('user_id', userId).limit(1).maybeSingle();
    if (member) return { id: member.workspace_id, role: member.role || 'member' };
    return null;
}

/**
 * Get plan and limits for a workspace (plan = owner's active subscription).
 * Returns { planName, planId, maxMembers, maxJourneys, ... usage: { members, journeys, ... } } or null if no plan.
 */
async function getWorkspacePlanAndLimits(workspaceId) {
    const { data: ws } = await supabaseAdmin.from('workspaces').select('owner_id').eq('id', workspaceId).maybeSingle();
    if (!ws) return null;
    // Use admin so members can see owner's subscription (RLS on subscriptions typically allows only own rows).
    const { data: sub } = await supabaseAdmin
        .from('subscriptions')
        .select('plan_id, current_period_end')
        .eq('user_id', ws.owner_id)
        .eq('status', 'active')
        .order('current_period_end', { ascending: false })
        .limit(1)
        .maybeSingle();
    if (!sub) return null;
    const { data: plan } = await supabaseAdmin.from('plans').select('id, name, max_members, max_journeys, max_personas, max_metrics, max_interviews').eq('id', sub.plan_id).maybeSingle();
    if (!plan) return null;
    const [membersRes, journeysRes, personasRes, metricsRes, interviewsRes] = await Promise.all([
        supabaseAdmin.from('workspace_members').select('*', { count: 'exact', head: true }).eq('workspace_id', workspaceId),
        supabaseAdmin.from('journeys').select('*', { count: 'exact', head: true }).eq('workspace_id', workspaceId),
        supabaseAdmin.from('personas').select('*', { count: 'exact', head: true }).eq('workspace_id', workspaceId),
        supabaseAdmin.from('metrics').select('*', { count: 'exact', head: true }).eq('workspace_id', workspaceId),
        supabaseAdmin.from('interviews').select('*', { count: 'exact', head: true }).eq('workspace_id', workspaceId),
    ]);
    const interviewUsageCount = await getWorkspaceCreatedInterviewUsage(workspaceId, interviewsRes.count ?? 0);
    return {
        planName: plan.name,
        planId: plan.id,
        currentPeriodEnd: sub.current_period_end ?? null,
        maxMembers: plan.max_members ?? null,
        maxJourneys: plan.max_journeys ?? null,
        maxPersonas: plan.max_personas ?? null,
        maxMetrics: plan.max_metrics ?? null,
        maxInterviews: plan.max_interviews ?? null,
        usage: {
            members: membersRes.count ?? 0,
            journeys: journeysRes.count ?? 0,
            personas: personasRes.count ?? 0,
            metrics: metricsRes.count ?? 0,
            interviews: interviewUsageCount,
        },
    };
}

/** Supabase client with user JWT for RLS-sensitive inserts (e.g. workspaces). Uses anon key + token; falls back to global supabase if no anon key. */
function createSupabaseClientWithUserToken(token) {
    const anonKey = process.env.SUPABASE_ANON_KEY;
    if (anonKey && token) {
        return createClient(process.env.SUPABASE_URL, anonKey, { global: { headers: { Authorization: `Bearer ${token}` } } });
    }
    return supabase;
}

async function getAuthenticatedUserFromToken(token) {
    if (!token) {
        return { user: null, error: new Error('Unauthorized') };
    }

    const anonKey = process.env.SUPABASE_ANON_KEY;
    if (anonKey) {
        const authClient = createSupabaseClientWithUserToken(token);
        const { data, error } = await authClient.auth.getUser();
        return { user: data?.user ?? null, error };
    }

    const { data, error } = await supabase.auth.getUser(token);
    return { user: data?.user ?? null, error };
}

async function getAdminUserFromToken(token) {
    const { user, error } = await getAuthenticatedUserFromToken(token);
    if (error || !user) return { user: null, profile: null, error: error || new Error('Invalid token') };

    const { data: profile, error: profileError } = await supabaseAdmin
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single();

    if (profileError) return { user: null, profile: null, error: profileError };
    if (profile?.role !== 'admin') return { user, profile, error: new Error('Access denied') };

    return { user, profile, error: null };
}

async function getJourneyExportBundle(journeyId) {
    const { data: journey, error: journeyError } = await supabaseAdmin
        .from('journeys')
        .select('id, title, map_data, workspace_id')
        .eq('id', journeyId)
        .single();

    if (journeyError || !journey) {
        return { journey: null, journeys: [], metrics: [], error: journeyError || new Error('Journey not found') };
    }

    const [journeysResult, metricsResult] = await Promise.all([
        supabaseAdmin
            .from('journeys')
            .select('id, title')
            .eq('workspace_id', journey.workspace_id),
        supabaseAdmin
            .from('metrics')
            .select('*')
            .eq('workspace_id', journey.workspace_id),
    ]);

    return {
        journey,
        journeys: journeysResult.data || [],
        metrics: metricsResult.data || [],
        error: journeysResult.error || metricsResult.error || null,
    };
}

/** Ensure user has an active Starter subscription (idempotent). Uses admin client so RLS does not block. Call after creating default workspace for new users. */
async function ensureStarterSubscriptionForUser(userId) {
    const { data: existing } = await supabaseAdmin.from('subscriptions').select('id').eq('user_id', userId).eq('status', 'active').limit(1).maybeSingle();
    if (existing) return;
    const { data: starterPlan } = await supabaseAdmin.from('plans').select('id').ilike('name', 'Starter').eq('is_active', true).limit(1).maybeSingle();
    if (!starterPlan) return;
    const periodEnd = new Date();
    periodEnd.setMonth(periodEnd.getMonth() + 1);
    await supabaseAdmin.from('subscriptions').insert([{ user_id: userId, plan_id: starterPlan.id, status: 'active', current_period_start: new Date(), current_period_end: periodEnd }]);
}

/** True if user was created recently (e.g. last 48h). Used to auto-create workspace only for new users, not for removed members. */
function isNewUser(user) {
    const createdAt = user?.created_at;
    if (!createdAt) return true;
    const created = new Date(createdAt).getTime();
    const cutoff = Date.now() - 48 * 60 * 60 * 1000;
    return created >= cutoff;
}

/** Apply pending workspace invites for this user (by email). Inserts into workspace_members and marks invites accepted only on success. Returns number applied. */
async function applyPendingInvitesForUser(userId, email) {
    if (!email || !userId) return 0;
    const normalizedEmail = String(email).trim().toLowerCase();
    // Use admin so invited user can "see" their invites (RLS typically allows only workspace owners to read invites)
    const { data } = await supabaseAdmin
        .from('workspace_invites')
        .select('id, workspace_id, role')
        .eq('status', 'pending')
        .ilike('email', normalizedEmail);
    const invites = Array.isArray(data) ? data : [];
    let applied = 0;
    for (const invite of invites) {
        const limits = await getWorkspacePlanAndLimits(invite.workspace_id);
        if (limits && limits.maxMembers != null && limits.usage.members >= limits.maxMembers) {
            continue; // workspace at member limit, skip accepting this invite
        }
        const { error: insertErr } = await supabaseAdmin
            .from('workspace_members')
            .insert({ workspace_id: invite.workspace_id, user_id: userId, role: invite.role || 'member' });
        const ok = !insertErr || insertErr.code === '23505'; // 23505 = unique violation (already member)
        if (ok) {
            await supabaseAdmin.from('workspace_invites').update({ status: 'accepted' }).eq('id', invite.id);
            applied++;
        } else {
            console.error('[applyPendingInvites] workspace_members insert:', insertErr.message);
        }
    }
    return applied;
}

/** Validate auth body (email + password). Returns { ok: true } or { ok: false, error: string }. */
function validateAuthBody(body, isRegister = false) {
    const email = body.email != null ? String(body.email).trim() : '';
    const password = body.password != null ? String(body.password) : '';
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email) return { ok: false, error: 'Email is required' };
    if (!emailRegex.test(email)) return { ok: false, error: 'Invalid email' };
    if (!password) return { ok: false, error: 'Password is required' };
    if (password.length < 8) return { ok: false, error: 'Password must be at least 8 characters' };
    return { ok: true };
}

// Auth Routes

// Register Route
app.post('/api/register', async (req, res) => {
    const { email, password, firstName, lastName } = req.body;
    const validation = validateAuthBody(req.body, true);
    if (!validation.ok) return res.status(400).json({ status: 'error', error: validation.error });
    console.log('Registering user:', email);

    try {
        // 1. Sign up user via Supabase Auth
        const { data: authData, error: authError } = await supabase.auth.signUp({
            email,
            password,
        });

        if (authError) throw authError;

        // 2. Create profile in 'profiles' table
        if (authData.user) {
            const fullName = `${firstName || ''} ${lastName || ''}`.trim();
            
            const { error: profileError } = await supabaseAdmin
                .from('profiles')
                .insert([
                    { id: authData.user.id, full_name: fullName }
                ]);

            if (profileError) throw profileError;
        }

        // 3. Apply pending invites (only mark accepted when insert succeeds)
        await applyPendingInvitesForUser(authData.user.id, email);

        // 4. Assign Starter plan to new user (subscription per user)
        const { data: starterPlan } = await supabaseAdmin
            .from('plans')
            .select('id')
            .ilike('name', 'Starter')
            .eq('is_active', true)
            .limit(1)
            .maybeSingle();
        if (starterPlan) {
            const periodEnd = new Date();
            periodEnd.setMonth(periodEnd.getMonth() + 1);
            await supabaseAdmin.from('subscriptions').insert([{
                user_id: authData.user.id,
                plan_id: starterPlan.id,
                status: 'active',
                current_period_start: new Date(),
                current_period_end: periodEnd,
            }]);
        }

        res.status(201).json({ status: 'success', message: 'User registered successfully', user: authData.user });
    } catch (error) {
        console.error('Registration error:', error);
        logSystemError(error, 'POST /api/register'); // Log to DB
        res.status(400).json({ status: 'error', error: error.message });
    }
});

// Login Route
app.post('/api/login', async (req, res) => {
    const { email, password } = req.body;
    const validation = validateAuthBody(req.body);
    if (!validation.ok) return res.status(400).json({ status: 'error', error: validation.error });
    console.log('Logging in user:', email);

    try {
        const { data, error } = await supabase.auth.signInWithPassword({
            email,
            password,
        });

        if (error) throw error;

        // Apply pending workspace invites (only mark accepted when insert succeeds; duplicate = already member)
        await applyPendingInvitesForUser(data.user.id, email);

        res.json({ status: 'success', message: 'Logged in successfully', session: data.session, user: data.user });
    } catch (error) {
        console.error('Login error:', error);
        logSystemError(error, 'POST /api/login'); // Log to DB
        res.status(401).json({ status: 'error', error: error.message });
    }
});

// Journeys Routes

// GET /api/journeys
app.get('/api/journeys', async (req, res) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ status: 'error', message: 'Unauthorized' });

    try {
        const { data: { user }, error: authError } = await supabase.auth.getUser(token);
        if (authError || !user) {
            return res.status(401).json({ status: 'error', message: 'Invalid token' });
        }

        await applyPendingInvitesForUser(user.id, user.email);

        // 1. Get user's workspaces (Owned + Member) — use admin for reliable reads (avoids RLS blocking on local)
        let workspaceIds = await getAccessibleWorkspaceIds(user.id);

        // If no workspace yet, try applying pending invites (e.g. invited user first request after login)
        if (workspaceIds.length === 0 && user.email) {
            await applyPendingInvitesForUser(user.id, user.email);
            workspaceIds = await getAccessibleWorkspaceIds(user.id);
        }

        // If still no workspace, create default one only for new users (not for removed members).
        if (workspaceIds.length === 0 && isNewUser(user)) {
            // Re-check with admin before create (avoids race when multiple requests run in parallel)
            workspaceIds = await getAccessibleWorkspaceIds(user.id);
            if (workspaceIds.length > 0) { /* another request created it */ } else {
            console.log(`[Auto-Fix] Creating default workspace for user ${user.id}`);
            const { data: newWorkspace, error: createWsError } = await supabaseAdmin
                .from('workspaces')
                .insert([{ owner_id: user.id, name: 'My Workspace' }])
                .select()
                .single();
            if (!createWsError && newWorkspace) {
                workspaceIds = [newWorkspace.id];
                await ensureStarterSubscriptionForUser(user.id);
            } else if (createWsError?.code === '23505') {
                const { data: ownedAgain } = await supabaseAdmin.from('workspaces').select('id').eq('owner_id', user.id);
                workspaceIds = (ownedAgain || []).map(w => w.id);
                await ensureStarterSubscriptionForUser(user.id);
            } else {
                if (createWsError) console.error('Error creating default workspace:', createWsError);
                if (createWsError?.code === '42501') console.error('Tip: set SUPABASE_SERVICE_ROLE_KEY in .env to your project’s service_role key (Supabase Dashboard → Settings → API).');
                return res.json({ status: 'success', data: [] });
            }
            }
        }

        // 2. Get journeys from ALL accessible workspaces — admin for reliable read (RLS)
        const { data: journeys, error: journeyError } = await supabaseAdmin
            .from('journeys')
            .select('*')
            .in('workspace_id', workspaceIds)
            .order('created_at', { ascending: false });

        if (journeyError) throw journeyError;

        // Fetch profiles to map owner names (admin so members can see workspace owner's name)
        const userIds = [...new Set(journeys.map(j => j.user_id).filter(Boolean))];
        let profilesMap = {};
        
        if (userIds.length > 0) {
            const { data: profiles } = await supabaseAdmin
                .from('profiles')
                .select('id, full_name, email')
                .in('id', userIds);
                
            if (profiles) {
                profiles.forEach(p => {
                    profilesMap[p.id] = p.full_name || p.email;
                });
            }
        }

        const journeysWithOwners = journeys.map(j => ({
            ...j,
            updated_at: j.updated_at || j.created_at, // Fallback to created_at if updated_at is missing
            owner: profilesMap[j.user_id] || 'Unknown'
        }));

        res.json({ status: 'success', data: journeysWithOwners });
    } catch (error) {
        console.error('Error fetching journeys:', error);
        logSystemError(error, 'GET /api/journeys'); // Log to DB
        res.status(500).json({ status: 'error', error: error.message });
    }
});

// GET /api/journeys/:id
app.get('/api/journeys/:id', async (req, res) => {
    const token = req.headers.authorization?.split(' ')[1];
    const { id } = req.params;

    if (!token) return res.status(401).json({ status: 'error', message: 'Unauthorized' });

    try {
        const { data: { user }, error: authError } = await supabase.auth.getUser(token);
        if (authError || !user) {
            return res.status(401).json({ status: 'error', message: 'Invalid token' });
        }

        const { data: journey, error } = await supabase
            .from('journeys')
            .select('*')
            .eq('id', id)
            .single();

        if (error) throw error;

        const workspaceIds = await getAccessibleWorkspaceIds(user.id);
        if (!journey.workspace_id || !workspaceIds.includes(journey.workspace_id)) {
            return res.status(404).json({ status: 'error', message: 'Journey not found' });
        }

        // Fetch owner name (admin so member can see creator name)
        let ownerName = '';
        if (journey.user_id) {
             const { data: profile } = await supabaseAdmin
                .from('profiles')
                .select('full_name, email')
                .eq('id', journey.user_id)
                .maybeSingle();
             ownerName = profile ? (profile.full_name || profile.email) : '';
        }

        res.json({ status: 'success', data: { ...journey, owner: ownerName } });
    } catch (error) {
        console.error('Error fetching journey:', error);
        logSystemError(error, `GET /api/journeys/${id}`);
        res.status(500).json({ status: 'error', error: error.message });
    }
});

app.get('/api/export/journeys/:id/document', async (req, res) => {
    const { id } = req.params;
    const token = req.query.token;

    try {
        const payload = verifyExportToken(token);
        if (String(payload?.journeyId) !== String(id)) {
            return res.status(403).json({ status: 'error', message: 'Export token does not match journey' });
        }

        const { journey, journeys, metrics, error } = await getJourneyExportBundle(id);
        if (error || !journey) {
            return res.status(404).json({ status: 'error', message: 'Journey not found' });
        }

        const workspaceIds = await getAccessibleWorkspaceIds(payload.userId);
        if (!journey.workspace_id || !workspaceIds.includes(journey.workspace_id)) {
            return res.status(403).json({ status: 'error', message: 'Access denied' });
        }

        res.json({
            status: 'success',
            data: {
                journey,
                journeys,
                metrics,
            },
        });
    } catch (error) {
        res.status(401).json({ status: 'error', message: error.message || 'Invalid export token' });
    }
});

app.post('/api/export/journeys/:id/pdf', async (req, res) => {
    const token = req.headers.authorization?.split(' ')[1];
    const { id } = req.params;

    if (!token) {
        return res.status(401).json({ status: 'error', message: 'Unauthorized' });
    }

    let browser;

    try {
        const { user, error: authError } = await getAuthenticatedUserFromToken(token);
        if (authError || !user) {
            return res.status(401).json({ status: 'error', message: 'Invalid token' });
        }

        const { journey, error: bundleError } = await getJourneyExportBundle(id);
        if (bundleError || !journey) {
            return res.status(404).json({ status: 'error', message: 'Journey not found' });
        }

        const workspaceIds = await getAccessibleWorkspaceIds(user.id);
        if (!journey.workspace_id || !workspaceIds.includes(journey.workspace_id)) {
            return res.status(403).json({ status: 'error', message: 'Access denied' });
        }

        const exportToken = createExportToken({ userId: user.id, journeyId: id });
        const renderOrigin = (process.env.EXPORT_RENDER_ORIGIN || req.headers.origin || (process.env.NODE_ENV === 'production' ? CLIENT_ORIGIN : 'http://localhost:5173')).replace(/\/$/, '');
        const exportUrl = `${renderOrigin}/export/journey/${id}?token=${encodeURIComponent(exportToken)}`;

        if (process.env.NODE_ENV === 'production') {
            const path = require('path');
            const playwrightCoreDir = path.dirname(require.resolve('playwright-core/package.json'));
            const localBrowsersDir = path.join(playwrightCoreDir, '.local-browsers');
            const hasProjectLocalBrowsers = fs.existsSync(localBrowsersDir) && fs.readdirSync(localBrowsersDir).length > 0;

            if (hasProjectLocalBrowsers) {
                process.env.PLAYWRIGHT_BROWSERS_PATH = process.env.PLAYWRIGHT_BROWSERS_PATH || '0';
            }
        }
        const { chromium } = require('playwright');
        browser = await chromium.launch({
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox'],
        });

        const page = await browser.newPage({
            viewport: { width: 1440, height: 900 },
            deviceScaleFactor: 2,
        });

        await page.emulateMedia({ media: 'screen' });
        await page.goto(exportUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
        await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
        await page.waitForFunction(
            () => document.body?.dataset?.exportReady === 'true' || Boolean(document.body?.dataset?.exportError),
            { timeout: 60000 }
        );
        await page.waitForTimeout(200);

        const exportError = await page.evaluate(() => document.body?.dataset?.exportError || '');
        if (exportError) {
            throw new Error(exportError);
        }

        const dimensions = await page.evaluate(() => {
            const root = document.querySelector('[data-export-document-root]');
            if (!root) return null;
            return {
                width: Math.ceil(Math.max(root.scrollWidth, root.getBoundingClientRect().width)),
                height: Math.ceil(Math.max(root.scrollHeight, root.getBoundingClientRect().height)),
            };
        });

        if (!dimensions?.width || !dimensions?.height) {
            throw new Error('Export content did not render');
        }

        const width = Math.min(dimensions.width, 14400);
        const height = Math.min(dimensions.height, 14400);
        const filenameBase = String(journey.title || 'journey-map')
            .replace(/[<>:"/\\|?*\u0000-\u001F]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim() || 'journey-map';

        await page.addStyleTag({
            content: `
                @page { size: ${width}px ${height}px; margin: 0; }
                html, body {
                    margin: 0 !important;
                    padding: 0 !important;
                    width: ${width}px !important;
                    height: ${height}px !important;
                    overflow: hidden !important;
                    background: #ffffff !important;
                }
            `,
        });

        const pdfBuffer = await page.pdf({
            printBackground: true,
            preferCSSPageSize: true,
            margin: { top: '0', right: '0', bottom: '0', left: '0' },
        });

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="${filenameBase}.pdf"`);
        return res.send(Buffer.from(pdfBuffer));
    } catch (error) {
        console.error('Error generating journey PDF:', error);
        logSystemError(error, `POST /api/export/journeys/${id}/pdf`);
        return res.status(500).json({ status: 'error', message: error.message || 'Failed to generate PDF' });
    } finally {
        if (browser) {
            await browser.close().catch(() => {});
        }
    }
});

// PUT /api/journeys/:id
app.put('/api/journeys/:id', async (req, res) => {
    const token = req.headers.authorization?.split(' ')[1];
    const { id } = req.params;
    const { title, description, status, map_data, user_id: newOwnerId } = req.body;

    if (!token) return res.status(401).json({ status: 'error', message: 'Unauthorized' });

    try {
        const { data: { user }, error: authError } = await supabase.auth.getUser(token);
        if (authError || !user) {
            return res.status(401).json({ status: 'error', message: 'Invalid token' });
        }

        const { data: existing, error: fetchErr } = await supabaseAdmin.from('journeys').select('id, workspace_id, user_id').eq('id', id).single();
        if (fetchErr || !existing) return res.status(404).json({ status: 'error', message: 'Journey not found' });
        const workspaceIds = await getAccessibleWorkspaceIds(user.id);
        if (!workspaceIds.includes(existing.workspace_id)) return res.status(403).json({ status: 'error', message: 'Access denied' });

        const updates = {
            updated_at: new Date().toISOString()
        };
        if (title !== undefined) updates.title = title;
        if (description !== undefined) updates.description = description;
        if (status !== undefined) updates.status = status;
        if (map_data !== undefined) {
            updates.map_data = typeof map_data === 'string' ? map_data : JSON.stringify(map_data);
        }

        // Only validate and apply owner change when the owner is actually being changed
        const ownerActuallyChanging = newOwnerId !== undefined && newOwnerId !== null && newOwnerId !== '' && String(newOwnerId) !== String(existing.user_id);
        if (ownerActuallyChanging) {
            const { data: ws } = await supabaseAdmin.from('workspaces').select('owner_id').eq('id', existing.workspace_id).maybeSingle();
            const isWorkspaceOwner = ws && ws.owner_id === user.id;
            const isCurrentJourneyOwner = existing.user_id === user.id;
            if (!isWorkspaceOwner && !isCurrentJourneyOwner) {
                return res.status(403).json({ status: 'error', message: 'Only workspace owner or journey owner can change owner' });
            }
            const isNewOwnerInWorkspace = ws && ws.owner_id === newOwnerId ||
                await (async () => {
                    const { data: m } = await supabaseAdmin.from('workspace_members').select('user_id').eq('workspace_id', existing.workspace_id).eq('user_id', newOwnerId).limit(1).maybeSingle();
                    return !!m;
                })();
            if (!isNewOwnerInWorkspace) {
                return res.status(400).json({ status: 'error', message: 'New owner must be a member of the workspace' });
            }
            updates.user_id = newOwnerId;
        }

        const { error: updateError } = await supabaseAdmin
            .from('journeys')
            .update(updates)
            .eq('id', existing.id);

        if (updateError) throw updateError;

        const { data: journey, error: selectError } = await supabaseAdmin
            .from('journeys')
            .select('*')
            .eq('id', existing.id)
            .single();

        if (selectError || !journey) {
            console.error('Journey update succeeded but select failed:', selectError);
            return res.status(500).json({ status: 'error', error: 'Failed to return updated journey' });
        }

        res.json({ status: 'success', data: journey });
    } catch (error) {
        console.error('Error updating journey:', error);
        logSystemError(error, `PUT /api/journeys/${id}`);
        res.status(500).json({ status: 'error', error: error.message });
    }
});

// DELETE /api/journeys/:id — creator або власник воркспейсу може видалити
app.delete('/api/journeys/:id', async (req, res) => {
    const token = req.headers.authorization?.split(' ')[1];
    const { id } = req.params;

    if (!token) return res.status(401).json({ status: 'error', message: 'Unauthorized' });

    try {
        const { data: { user }, error: authError } = await supabase.auth.getUser(token);
        if (authError || !user) throw new Error('Invalid token');

        const { data: journey } = await supabaseAdmin.from('journeys').select('id, user_id, workspace_id').eq('id', id).single();
        if (!journey) return res.status(404).json({ status: 'error', message: 'Journey not found' });
        const workspaceIds = await getAccessibleWorkspaceIds(user.id);
        if (!workspaceIds.includes(journey.workspace_id)) return res.status(403).json({ status: 'error', message: 'Access denied' });
        const isCreator = journey.user_id === user.id;
        const { data: ws } = await supabaseAdmin.from('workspaces').select('owner_id').eq('id', journey.workspace_id).maybeSingle();
        const isOwner = ws && ws.owner_id === user.id;
        if (!isCreator && !isOwner) return res.status(403).json({ status: 'error', message: 'Only the creator or workspace owner can delete this journey' });

        const { error } = await supabaseAdmin
            .from('journeys')
            .delete()
            .eq('id', id);

        if (error) throw error;

        res.json({ status: 'success', message: 'Journey deleted successfully' });
    } catch (error) {
        console.error('Error deleting journey:', error);
        logSystemError(error, `DELETE /api/journeys/${id}`);
        res.status(500).json({ status: 'error', error: error.message });
    }
});

// POST /api/journeys/:id/duplicate
app.post('/api/journeys/:id/duplicate', async (req, res) => {
    const token = req.headers.authorization?.split(' ')[1];
    const { id } = req.params;

    if (!token) return res.status(401).json({ status: 'error', message: 'Unauthorized' });

    try {
        const { data: { user }, error: authError } = await supabase.auth.getUser(token);
        if (authError || !user) throw new Error('Invalid token');

        const { data: original, error: fetchError } = await supabase
            .from('journeys')
            .select('*')
            .eq('id', id)
            .single();

        if (fetchError) throw fetchError;

        const workspaceIds = await getAccessibleWorkspaceIds(user.id);
        if (!workspaceIds.includes(original.workspace_id)) return res.status(403).json({ status: 'error', message: 'Access denied' });

        const { id: oldId, created_at, updated_at, ...journeyData } = original;
        const newJourney = {
            ...journeyData,
            title: `Copy of ${original.title}`,
            status: 'draft',
            updated_at: new Date(),
            user_id: user.id
        };

        const { data: duplicated, error: insertError } = await supabaseAdmin
            .from('journeys')
            .insert([newJourney])
            .select()
            .single();

        if (insertError) throw insertError;

        res.status(201).json({ status: 'success', data: duplicated });
    } catch (error) {
        console.error('Error duplicating journey:', error);
        logSystemError(error, `POST /api/journeys/${id}/duplicate`);
        res.status(500).json({ status: 'error', error: error.message });
    }
});

// PUT /api/journeys/:id/archive
app.put('/api/journeys/:id/archive', async (req, res) => {
    const token = req.headers.authorization?.split(' ')[1];
    const { id } = req.params;

    if (!token) return res.status(401).json({ status: 'error', message: 'Unauthorized' });

    try {
        const { data: { user }, error: authError } = await supabase.auth.getUser(token);
        if (authError || !user) throw new Error('Invalid token');

        const { data: existing } = await supabaseAdmin.from('journeys').select('id, workspace_id').eq('id', id).single();
        if (!existing) return res.status(404).json({ status: 'error', message: 'Journey not found' });
        const workspaceIds = await getAccessibleWorkspaceIds(user.id);
        if (!workspaceIds.includes(existing.workspace_id)) return res.status(403).json({ status: 'error', message: 'Access denied' });

        const { data: journey, error } = await supabaseAdmin
            .from('journeys')
            .update({ status: 'archived', updated_at: new Date() })
            .eq('id', id)
            .select()
            .single();

        if (error) throw error;

        res.json({ status: 'success', data: journey });
    } catch (error) {
        console.error('Error archiving journey:', error);
        logSystemError(error, `PUT /api/journeys/${id}/archive`);
        res.status(500).json({ status: 'error', error: error.message });
    }
});

// PUT /api/journeys/:id/restore
app.put('/api/journeys/:id/restore', async (req, res) => {
    const token = req.headers.authorization?.split(' ')[1];
    const { id } = req.params;

    if (!token) return res.status(401).json({ status: 'error', message: 'Unauthorized' });

    try {
        const { data: { user }, error: authError } = await supabase.auth.getUser(token);
        if (authError || !user) {
            console.error('❌ [RESTORE] Auth error:', authError);
            throw new Error('Invalid token');
        }

        const { data: existingJourney, error: findError } = await supabase
            .from('journeys')
            .select('id, user_id, workspace_id')
            .eq('id', id)
            .single();

        if (findError || !existingJourney) throw new Error('Journey not found');

        const workspaceIds = await getAccessibleWorkspaceIds(user.id);
        if (!workspaceIds.includes(existingJourney.workspace_id)) {
            throw new Error('Unauthorized: You do not have permission to restore this journey');
        }

        // Perform Update (Restore to 'draft')
        console.log(`[RESTORE] Executing UPDATE for ID: ${id}`);
        
        const { data, error: updateError } = await supabaseAdmin
            .from('journeys')
            .update({ status: 'draft', updated_at: new Date().toISOString() })
            .eq('id', id)
            .select();

        if (updateError) {
            console.error('❌ [RESTORE] Database Update failed:', updateError);
            throw updateError;
        }

        if (!data || data.length === 0) {
            console.error('❌ [RESTORE] Update returned 0 rows! This usually means RLS blocked the update or ID is wrong.');
            // Check if row exists at all
            const { data: check } = await supabaseAdmin.from('journeys').select('id, status').eq('id', id);
            console.log('[RESTORE] Debug - Does row exist?', check);
            
            throw new Error('Update failed - no rows affected (RLS or missing ID)');
        }

        console.log('✅ [RESTORE] Success! New status:', data[0].status);
        res.json({ status: 'success', data: data[0] });
    } catch (error) {
        console.error('❌ [RESTORE] Final Error:', error.message);
        logSystemError(error, `PUT /api/journeys/${id}/restore`);
        res.status(500).json({ status: 'error', error: error.message });
    }
});

// POST /api/journeys
app.post('/api/journeys', async (req, res) => {
    const token = req.headers.authorization?.split(' ')[1];
    const { title, description, workspace_id: bodyWorkspaceId } = req.body;

    if (!token) return res.status(401).json({ status: 'error', message: 'Unauthorized' });

    try {
        const { data: { user }, error: authError } = await supabase.auth.getUser(token);
        if (authError || !user) throw new Error('Invalid token');

        const allowed = await getAccessibleWorkspaceIds(user.id);
        const allowedSet = new Set((allowed || []).map(id => String(id)));
        let workspace = null;
        if (bodyWorkspaceId && allowedSet.has(String(bodyWorkspaceId))) {
            workspace = { id: bodyWorkspaceId, role: 'member' };
        }
        if (!workspace) workspace = await getCurrentWorkspaceForUser(user.id);
        if (!workspace && isNewUser(user)) {
            const { data: newWorkspace, error: createWsError } = await supabaseAdmin
                .from('workspaces')
                .insert([{ owner_id: user.id, name: 'My Workspace' }])
                .select()
                .single();
            if (!createWsError && newWorkspace) {
                workspace = { id: newWorkspace.id, role: 'owner' };
                await ensureStarterSubscriptionForUser(user.id);
            } else if (createWsError?.code === '23505') {
                const { data: owned } = await supabaseAdmin.from('workspaces').select('id').eq('owner_id', user.id).limit(1).maybeSingle();
                if (owned) workspace = { id: owned.id, role: 'owner' };
            }
            if (!workspace) {
                if (createWsError?.code === '42501') throw new Error('RLS: set SUPABASE_SERVICE_ROLE_KEY in .env to your service_role key.');
                throw createWsError || new Error('Could not create workspace');
            }
        }
        if (!workspace) return res.status(403).json({ status: 'error', code: 'NO_WORKSPACE', message: 'Create or join a workspace first' });

        const planLimits = await getWorkspacePlanAndLimits(workspace.id);
        if (planLimits && planLimits.maxJourneys != null && (planLimits.usage.journeys >= planLimits.maxJourneys)) {
            return res.status(403).json({ status: 'error', code: 'LIMIT_REACHED', limit: 'journeys' });
        }

        const { data: journey, error: insertError } = await supabaseAdmin
            .from('journeys')
            .insert([{
                title,
                description,
                workspace_id: workspace.id,
                status: 'draft',
                updated_at: new Date(),
                user_id: user.id
            }])
            .select()
            .single();

        if (insertError) {
            console.error('Error inserting journey:', insertError);
            throw insertError;
        }

        console.log('Journey created successfully:', journey.id);
        
        // Get owner name for response
        const { data: profile } = await supabaseAdmin
            .from('profiles')
            .select('full_name, email')
            .eq('id', user.id)
            .single();
            
        const ownerName = profile ? (profile.full_name || profile.email) : 'You';

        res.status(201).json({ status: 'success', data: { ...journey, owner: ownerName } });
    } catch (error) {
        console.error('Error in POST /api/journeys:', error);
        logSystemError(error, 'POST /api/journeys');
        res.status(500).json({ status: 'error', error: error.message });
    }
});

// --- РОУТИ ДЛЯ ПЕРСОН (PERSONAS) ---

// 1. Отримати всі персони
app.get('/api/personas', async (req, res) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ status: 'error', message: 'Unauthorized' });

  try {
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) return res.status(401).json({ status: 'error', message: 'Invalid token' });

    await applyPendingInvitesForUser(user.id, user.email);

    // 1. Get accessible workspaces — use admin for reliable reads
    const workspaceIds = await getAccessibleWorkspaceIds(user.id);

    let query = supabaseAdmin.from('personas').select('*');

    // Filter by workspace IDs
    if (workspaceIds.length > 0) {
        query = query.in('workspace_id', workspaceIds);
    } else {
        query = query.eq('user_id', user.id);
    }

    const { data, error } = await query.order('created_at', { ascending: false });

    if (error) throw error;

    // Fetch profiles to map owner names (admin so members can see workspace owner's name)
    const userIds = [...new Set(data.map(p => p.user_id).filter(Boolean))];
    let profilesMap = {};
    
    if (userIds.length > 0) {
        const { data: profiles } = await supabaseAdmin.from('profiles').select('id, full_name, email').in('id', userIds);
        if (profiles) profiles.forEach(p => { profilesMap[p.id] = p.full_name || p.email; });
    }

    const personasWithOwners = data.map(p => ({ 
        ...p, 
        updated_at: p.updated_at || p.created_at, // Fallback to created_at if updated_at is missing
        owner: profilesMap[p.user_id] || 'Unknown' 
    }));
    res.json({ status: 'success', data: personasWithOwners });
  } catch (err) {
    logSystemError(err, 'GET /api/personas');
    console.error('Error fetching personas:', err);
    res.status(500).json({ error: err.message });
  }
});

// 2. Створити нову персону
app.post('/api/personas', async (req, res) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ status: 'error', message: 'Unauthorized' });

  const { name, role, description, image, goals, frustrations, motivations, painPoints, bio, age, location, workspace_id: bodyWorkspaceId } = req.body;

  try {
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) return res.status(401).json({ status: 'error', message: 'Invalid token' });

    let workspace = null;
    if (bodyWorkspaceId) {
      const allowed = await getAccessibleWorkspaceIds(user.id);
      if (allowed.includes(bodyWorkspaceId)) workspace = { id: bodyWorkspaceId, role: 'member' };
    }
    if (!workspace) workspace = await getCurrentWorkspaceForUser(user.id);
    if (!workspace && isNewUser(user)) {
      const { data: newWorkspace, error: createWsError } = await supabaseAdmin
          .from('workspaces')
          .insert([{ owner_id: user.id, name: 'My Workspace' }])
          .select()
          .single();
      if (!createWsError && newWorkspace) {
        workspace = { id: newWorkspace.id, role: 'owner' };
        await ensureStarterSubscriptionForUser(user.id);
      } else if (createWsError?.code === '23505') {
        const { data: owned } = await supabaseAdmin.from('workspaces').select('id').eq('owner_id', user.id).limit(1).maybeSingle();
        if (owned) workspace = { id: owned.id, role: 'owner' };
      }
      if (!workspace) throw createWsError || new Error('Could not create workspace');
    }
    if (!workspace) return res.status(403).json({ status: 'error', code: 'NO_WORKSPACE', message: 'Create or join a workspace first' });

    const planLimits = await getWorkspacePlanAndLimits(workspace.id);
    if (planLimits && planLimits.maxPersonas != null && (planLimits.usage.personas >= planLimits.maxPersonas)) {
      return res.status(403).json({ status: 'error', code: 'LIMIT_REACHED', limit: 'personas' });
    }

    const { data, error } = await supabaseAdmin
      .from('personas')
      .insert([{ 
        name, 
        role, 
        description, 
        image,
        goals,
        frustrations,
        motivations,
        pain_points: painPoints,
        bio,
        age,
        location,
        user_id: user.id,
        workspace_id: workspace.id,
        status: 'active',
        updated_at: new Date()
      }])
      .select()
      .single();

    if (error) throw error;

    // Get owner name for response
    const { data: profile } = await supabaseAdmin
        .from('profiles')
        .select('full_name, email')
        .eq('id', user.id)
        .single();
        
    const ownerName = profile ? (profile.full_name || profile.email) : 'You';
    res.json({ status: 'success', data: { ...data, owner: ownerName } });
  } catch (err) {
    logSystemError(err, 'POST /api/personas');
    console.error('Error creating persona:', err);
    res.status(500).json({ error: err.message });
  }
});

// 3. Видалити персону — creator або власник воркспейсу може видалити
app.delete('/api/personas/:id', async (req, res) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ status: 'error', message: 'Unauthorized' });

  const { id } = req.params;
  try {
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) return res.status(401).json({ status: 'error', message: 'Invalid token' });

    const { data: persona } = await supabaseAdmin.from('personas').select('id, user_id, workspace_id').eq('id', id).single();
    if (!persona) return res.status(404).json({ status: 'error', message: 'Persona not found' });

    const workspaceIds = await getAccessibleWorkspaceIds(user.id);
    if (!workspaceIds.includes(persona.workspace_id)) return res.status(403).json({ status: 'error', message: 'Access denied' });

    const isCreator = persona.user_id === user.id;
    const { data: ws } = await supabaseAdmin.from('workspaces').select('owner_id').eq('id', persona.workspace_id).maybeSingle();
    const isOwner = ws && ws.owner_id === user.id;
    if (!isCreator && !isOwner) return res.status(403).json({ status: 'error', message: 'Only the creator or workspace owner can delete this persona' });

    const { error } = await supabaseAdmin.from('personas').delete().eq('id', id);
    if (error) throw error;
    res.json({ status: 'success', message: 'Persona deleted successfully' });
  } catch (err) {
    logSystemError(err, 'DELETE /api/personas/:id');
    console.error('Error deleting persona:', err);
    res.status(500).json({ error: err.message });
  }
});

// 4. Архівувати персону — будь-хто з доступом до воркспейсу
app.put('/api/personas/:id/archive', async (req, res) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ status: 'error', message: 'Unauthorized' });

  const { id } = req.params;
  try {
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) return res.status(401).json({ status: 'error', message: 'Invalid token' });

    const { data: persona } = await supabaseAdmin.from('personas').select('id, workspace_id').eq('id', id).single();
    if (!persona) return res.status(404).json({ error: 'Persona not found' });
    const workspaceIds = await getAccessibleWorkspaceIds(user.id);
    if (!workspaceIds.includes(persona.workspace_id)) return res.status(403).json({ error: 'Access denied' });

    const { data, error } = await supabaseAdmin
      .from('personas')
      .update({ status: 'archived', updated_at: new Date() })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    res.json({ status: 'success', data });
  } catch (err) {
    logSystemError(err, 'PATCH /api/personas/:id/archive');
    console.error('Error archiving persona:', err);
    res.status(500).json({ error: err.message });
  }
});

// 5. Відновити персону — будь-хто з доступом до воркспейсу
app.put('/api/personas/:id/restore', async (req, res) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ status: 'error', message: 'Unauthorized' });

  const { id } = req.params;
  try {
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) return res.status(401).json({ status: 'error', message: 'Invalid token' });

    const { data: persona } = await supabaseAdmin.from('personas').select('id, workspace_id').eq('id', id).single();
    if (!persona) return res.status(404).json({ error: 'Persona not found' });
    const workspaceIds = await getAccessibleWorkspaceIds(user.id);
    if (!workspaceIds.includes(persona.workspace_id)) return res.status(403).json({ error: 'Access denied' });

    const { data, error } = await supabaseAdmin
      .from('personas')
      .update({ status: 'active', updated_at: new Date() })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    res.json({ status: 'success', data });
  } catch (err) {
    logSystemError(err, 'PATCH /api/personas/:id/restore');
    console.error('Error restoring persona:', err);
    res.status(500).json({ error: err.message });
  }
});

// 6. Оновити персону (Edit) — будь-хто з доступом до воркспейсу
app.put('/api/personas/:id', async (req, res) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ status: 'error', message: 'Unauthorized' });

  const { id } = req.params;
  const { name, role, description, image, goals, frustrations, motivations, painPoints, bio, age, location } = req.body;

  try {
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) return res.status(401).json({ status: 'error', message: 'Invalid token' });

    const { data: persona } = await supabaseAdmin.from('personas').select('id, workspace_id').eq('id', id).single();
    if (!persona) return res.status(404).json({ error: 'Persona not found' });
    const workspaceIds = await getAccessibleWorkspaceIds(user.id);
    if (!workspaceIds.includes(persona.workspace_id)) return res.status(403).json({ error: 'Access denied' });

    const updates = { updated_at: new Date() };
    if (name !== undefined) updates.name = name;
    if (role !== undefined) updates.role = role;
    if (description !== undefined) updates.description = description;
    if (image !== undefined) updates.image = image;
    if (goals !== undefined) updates.goals = goals;
    if (frustrations !== undefined) updates.frustrations = frustrations;
    if (motivations !== undefined) updates.motivations = motivations;
    if (painPoints !== undefined) updates.pain_points = painPoints;
    if (bio !== undefined) updates.bio = bio;
    if (age !== undefined) updates.age = age;
    if (location !== undefined) updates.location = location;

    const { data, error } = await supabaseAdmin
      .from('personas')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    res.json({ status: 'success', data });
  } catch (err) {
    logSystemError(err, 'PUT /api/personas/:id');
    console.error('Error updating persona:', err);
    res.status(500).json({ error: err.message });
  }
});

// --- РОУТИ ДЛЯ МЕТРИК (METRICS) ---

const SERIES_CHART_TYPES = ['bar', 'line', 'area', 'pie', 'donut'];

const INTEGRATION_DATA_SOURCES = ['google_sheets', 'microsoft_excel'];

function validateMetricPayload(body, isPut = false) {
  const type = body.type;
  if (!type) return isPut ? { ok: true } : { ok: false, message: 'Metric type is required' };

  const isIntegration = INTEGRATION_DATA_SOURCES.includes(body.data_source);

  if (type === 'Number' || type === 'Comparison') {
    if (!isIntegration) {
      const valueNum = parseFloat(body.value);
      if (body.value === '' || body.value === undefined || body.value === null || Number.isNaN(valueNum)) {
        return { ok: false, message: 'Value must be a valid number' };
      }
      if (type === 'Comparison') {
        const prevNum = parseFloat(body.previous_value);
        if (body.previous_value === '' || body.previous_value === undefined || body.previous_value === null || Number.isNaN(prevNum)) {
          return { ok: false, message: 'Previous value must be a valid number for Comparison type' };
        }
      }
    }
    return { ok: true };
  }

  if (type === 'Series') {
    const seriesData = body.series_data;
    if (!Array.isArray(seriesData)) {
      if (!isIntegration) return { ok: false, message: 'Series data is required and must be a non-empty array' };
      return { ok: true };
    }
    if (seriesData.length === 0 && !isIntegration) return { ok: false, message: 'Series data is required and must be a non-empty array' };
    for (let i = 0; i < seriesData.length; i++) {
      const row = seriesData[i];
      if (!row || typeof row !== 'object') {
        return { ok: false, message: `Series data item at index ${i} must be an object with value` };
      }
      const num = Number(row.value);
      if (Number.isNaN(num)) {
        return { ok: false, message: `Series data item at index ${i}: value must be a number` };
      }
    }
    const chartType = body.chart_type;
    if (chartType != null && !SERIES_CHART_TYPES.includes(chartType)) {
      return { ok: false, message: `chart_type must be one of: ${SERIES_CHART_TYPES.join(', ')}` };
    }
    return { ok: true };
  }

  return { ok: true };
}

// 1. Отримати всі метрики — по доступних воркспейсах (owner + member)
app.get('/api/metrics', async (req, res) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ status: 'error', message: 'Unauthorized' });

  try {
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) return res.status(401).json({ status: 'error', message: 'Invalid token' });

    await applyPendingInvitesForUser(user.id, user.email);

    const workspaceIds = await getAccessibleWorkspaceIds(user.id);
    if (workspaceIds.length === 0) return res.json({ status: 'success', data: [] });

    const { data: rawData, error } = await supabase
      .from('metrics')
      .select('*')
      .in('workspace_id', workspaceIds)
      .order('created_at', { ascending: false });

    if (error) throw error;
    const data = rawData || [];

    const isIntegrationMetric = (m) => (m.data_source === 'google_sheets' || m.data_source === 'microsoft_excel') && m.integration_config && typeof m.integration_config === 'object';
    const getConnectedUserId = (m) => {
      const fromConfig = m.integration_config?.connected_user_id;
      if (fromConfig) return fromConfig;
      if (isIntegrationMetric(m) && m.user_id) return m.user_id;
      return null;
    };

    const connectedUserIds = [...new Set(data.map(getConnectedUserId).filter(Boolean))];
    let profilesMap = {};
    if (connectedUserIds.length > 0) {
      const { data: profiles } = await supabaseAdmin.from('profiles').select('id, full_name, email').in('id', connectedUserIds);
      if (profiles) profiles.forEach((p) => { profilesMap[p.id] = p.full_name || p.email || null; });
    }

    const enriched = data.map((m) => {
      const out = { ...m };
      const uid = getConnectedUserId(m);
      if (uid && profilesMap[uid]) {
        out.integration_connected_by = { id: uid, full_name: profilesMap[uid] };
      }
      return out;
    });

    res.json({ status: 'success', data: enriched });
  } catch (err) {
    logSystemError(err, 'GET /api/metrics');
    console.error('Error fetching metrics:', err);
    res.status(500).json({ error: err.message });
  }
});

// 2. Створити метрику
app.post('/api/metrics', async (req, res) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ status: 'error', message: 'Unauthorized' });

  const { name, type, value, previous_value, suffix, data_source, chart_type, series_data, reverse_colors, series_label_format, integration_config, workspace_id: bodyWorkspaceId } = req.body;

  const validation = validateMetricPayload(req.body);
  if (!validation.ok) {
    return res.status(400).json({ status: 'error', code: 'VALIDATION_ERROR', error: validation.message });
  }

  try {
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) return res.status(401).json({ status: 'error', message: 'Invalid token' });

    let workspace = null;
    if (bodyWorkspaceId) {
      const allowed = await getAccessibleWorkspaceIds(user.id);
      if (allowed.includes(bodyWorkspaceId)) workspace = { id: bodyWorkspaceId, role: 'member' };
    }
    if (!workspace) workspace = await getCurrentWorkspaceForUser(user.id);
    if (!workspace && isNewUser(user)) {
      const { data: newWorkspace, error: createWsError } = await supabaseAdmin
          .from('workspaces')
          .insert([{ owner_id: user.id, name: 'My Workspace' }])
          .select()
          .single();
      if (!createWsError && newWorkspace) {
        workspace = { id: newWorkspace.id, role: 'owner' };
        await ensureStarterSubscriptionForUser(user.id);
      } else if (createWsError?.code === '23505') {
        const { data: owned } = await supabaseAdmin.from('workspaces').select('id').eq('owner_id', user.id).limit(1).maybeSingle();
        if (owned) workspace = { id: owned.id, role: 'owner' };
      }
      if (!workspace) throw createWsError || new Error('Could not create workspace');
    }
    if (!workspace) return res.status(403).json({ status: 'error', code: 'NO_WORKSPACE', message: 'Create or join a workspace first' });

    const planLimits = await getWorkspacePlanAndLimits(workspace.id);
    if (planLimits && planLimits.maxMetrics != null && (planLimits.usage.metrics >= planLimits.maxMetrics)) {
      return res.status(403).json({ status: 'error', code: 'LIMIT_REACHED', limit: 'metrics' });
    }

    let finalIntegrationConfig = integration_config;
    if (integration_config != null && typeof integration_config === 'object' && (data_source === 'google_sheets' || data_source === 'microsoft_excel')) {
      const hasConnection = await userHasIntegrationConnected(user.id, data_source);
      if (hasConnection) {
        finalIntegrationConfig = { ...integration_config, connected_user_id: user.id };
      }
    }

    const insertPayload = {
      name, type, value, previous_value, suffix, data_source, chart_type, series_data, reverse_colors,
      user_id: user.id,
      workspace_id: workspace.id,
      updated_at: new Date()
    };
    if (series_label_format !== undefined) insertPayload.series_label_format = series_label_format;
    if (finalIntegrationConfig !== undefined) insertPayload.integration_config = finalIntegrationConfig;

    const { data, error } = await supabaseAdmin
      .from('metrics')
      .insert([insertPayload])
      .select()
      .single();

    if (error) throw error;
    res.json({ status: 'success', data });
  } catch (err) {
    logSystemError(err, 'POST /api/metrics');
    console.error('Error creating metric:', err);
    res.status(500).json({ error: err.message });
  }
});

// 3. Оновити метрику — будь-хто з доступом до воркспейсу
app.put('/api/metrics/:id', async (req, res) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ status: 'error', message: 'Unauthorized' });

  const { id } = req.params;
  const updates = { ...req.body };
  delete updates.id;
  delete updates.user_id;
  delete updates.created_at;
  updates.updated_at = new Date();

  try {
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) return res.status(401).json({ status: 'error', message: 'Invalid token' });

    const { data: metric } = await supabaseAdmin.from('metrics').select('id, workspace_id, data_source').eq('id', id).single();
    if (!metric) return res.status(404).json({ error: 'Metric not found' });
    const workspaceIds = await getAccessibleWorkspaceIds(user.id);
    if (!workspaceIds.includes(metric.workspace_id)) return res.status(403).json({ error: 'Access denied' });

    const validation = validateMetricPayload(updates, true);
    if (!validation.ok) {
      return res.status(400).json({ status: 'error', code: 'VALIDATION_ERROR', error: validation.message });
    }

    if (updates.integration_config != null && typeof updates.integration_config === 'object') {
      const provider = updates.data_source ?? metric.data_source;
      if (provider === 'google_sheets' || provider === 'microsoft_excel') {
        const hasConnection = await userHasIntegrationConnected(user.id, provider);
        if (hasConnection) {
          updates.integration_config = { ...updates.integration_config, connected_user_id: user.id };
        }
      }
    }

    const { data, error } = await supabaseAdmin
      .from('metrics')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    res.json({ status: 'success', data });
  } catch (err) {
    logSystemError(err, 'PUT /api/metrics/:id');
    console.error('Error updating metric:', err);
    res.status(500).json({ error: err.message });
  }
});

// 4. Видалити метрику — creator або власник воркспейсу може видалити
app.delete('/api/metrics/:id', async (req, res) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ status: 'error', message: 'Unauthorized' });

  const { id } = req.params;
  try {
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) return res.status(401).json({ status: 'error', message: 'Invalid token' });

    const { data: metric } = await supabaseAdmin.from('metrics').select('id, user_id, workspace_id').eq('id', id).single();
    if (!metric) return res.status(404).json({ error: 'Metric not found' });
    const workspaceIds = await getAccessibleWorkspaceIds(user.id);
    if (!workspaceIds.includes(metric.workspace_id)) return res.status(403).json({ error: 'Access denied' });

    const isCreator = metric.user_id === user.id;
    const { data: ws } = await supabaseAdmin.from('workspaces').select('owner_id').eq('id', metric.workspace_id).maybeSingle();
    const isOwner = ws && ws.owner_id === user.id;
    if (!isCreator && !isOwner) return res.status(403).json({ error: 'Only the creator or workspace owner can delete this metric' });

    const { error } = await supabaseAdmin
      .from('metrics')
      .delete()
      .eq('id', id);

    if (error) throw error;
    res.json({ status: 'success', message: 'Metric deleted successfully' });
  } catch (err) {
    logSystemError(err, 'DELETE /api/metrics/:id');
    console.error('Error deleting metric:', err);
    res.status(500).json({ error: err.message });
  }
});

// --- ІНТЕГРАЦІЇ (GOOGLE SHEETS / MICROSOFT EXCEL) ---
const INTEGRATION_PROVIDERS = ['google_sheets', 'microsoft_excel'];
const STATE_SECRET = process.env.ENCRYPTION_KEY || process.env.SUPABASE_JWT_SECRET || 'integration-state-secret';

async function userHasIntegrationConnected(userId, provider) {
  if (!INTEGRATION_PROVIDERS.includes(provider)) return false;
  const { data: row } = await supabaseAdmin.from('user_integrations').select('id').eq('user_id', userId).eq('provider', provider).maybeSingle();
  return !!row;
}

function createIntegrationState(userId, returnPath) {
  const nonce = crypto.randomBytes(16).toString('hex');
  const path = returnPath ? String(returnPath).replace(/^\//, '') : '';
  const payload = path ? nonce + '.' + userId + '.' + path : nonce + '.' + userId;
  const sig = crypto.createHmac('sha256', STATE_SECRET).update(payload).digest('hex');
  return payload + '.' + sig;
}

function verifyIntegrationState(state) {
  if (!state || typeof state !== 'string') return null;
  const parts = state.split('.');
  if (parts.length !== 3 && parts.length !== 4) return null;
  const sig = parts[parts.length - 1];
  const payload = parts.slice(0, -1).join('.');
  const expected = crypto.createHmac('sha256', STATE_SECRET).update(payload).digest('hex');
  if (sig !== expected) return null;
  const userId = parts[1];
  const returnPath = parts.length === 4 ? parts[2] : null;
  return { userId, returnPath };
}

async function getOrRefreshIntegrationTokens(userId, provider) {
  const { data: row } = await supabaseAdmin.from('user_integrations').select('*').eq('user_id', userId).eq('provider', provider).maybeSingle();
  if (!row || !row.access_token) return null;
  let accessToken = decrypt(row.access_token);
  const refreshToken = row.refresh_token ? decrypt(row.refresh_token) : null;
  const expiresAt = row.expires_at ? new Date(row.expires_at) : null;
  if (expiresAt && expiresAt.getTime() < Date.now() + 60000 && refreshToken) {
    try {
      const refreshed = provider === 'google_sheets' ? await googleSheets.refreshAccessToken(refreshToken) : await microsoftExcel.refreshAccessToken(refreshToken);
      accessToken = refreshed.access_token;
      const update = { access_token: encrypt(accessToken), updated_at: new Date() };
      if (refreshed.expires_at) update.expires_at = refreshed.expires_at;
      await supabaseAdmin.from('user_integrations').update(update).eq('user_id', userId).eq('provider', provider);
    } catch (e) {
      console.error('Integration token refresh failed:', e);
      return null;
    }
  }
  return accessToken;
}

function cleanModelJson(text) {
  if (!text) return '';
  const trimmed = String(text).trim();
  const withoutFence = trimmed.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/i, '').trim();
  if (withoutFence.startsWith('{') && withoutFence.endsWith('}')) return withoutFence;
  const start = withoutFence.indexOf('{');
  const end = withoutFence.lastIndexOf('}');
  if (start >= 0 && end > start) return withoutFence.slice(start, end + 1);
  return withoutFence;
}

function cleanString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeEnum(value, allowed) {
  const normalized = cleanString(value).toLowerCase();
  return allowed.includes(normalized) ? normalized : '';
}

function normalizeStringArray(value, maxItems) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => cleanString(item))
    .filter(Boolean)
    .slice(0, maxItems);
}

function normalizeObjectArray(value, mapper, maxItems) {
  if (!Array.isArray(value)) return [];
  return value
    .map(mapper)
    .filter(Boolean)
    .slice(0, maxItems);
}

function normalizeTouchpoints(value, maxItems) {
  return normalizeObjectArray(
    value,
    (item) => {
      if (typeof item === 'string') {
        const touchpoint = cleanString(item);
        return touchpoint ? { touchpoint, interactsWith: '', channel: '' } : null;
      }
      if (!item || typeof item !== 'object' || Array.isArray(item)) return null;
      const touchpoint = cleanString(item.touchpoint);
      const interactsWith = cleanString(item.interactsWith || item.actor || item.stakeholder);
      const channel = cleanString(item.channel);
      if (!touchpoint && !interactsWith && !channel) return null;
      return { touchpoint, interactsWith, channel };
    },
    maxItems
  );
}

function normalizeStagePainPoints(value, maxItems) {
  return normalizeObjectArray(
    value,
    (item) => {
      if (typeof item === 'string') {
        const description = cleanString(item);
        return description ? { title: '', description, severity: '' } : null;
      }
      if (!item || typeof item !== 'object' || Array.isArray(item)) return null;
      const title = cleanString(item.title);
      const description = cleanString(item.description || item.problem || item.painPoint);
      const severity = normalizeEnum(item.severity, ['low', 'medium', 'high']);
      if (!title && !description && !severity) return null;
      return { title, description, severity };
    },
    maxItems
  );
}

function normalizeInterviewSummaryData(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;

  const summary = raw.summary && typeof raw.summary === 'object' && !Array.isArray(raw.summary) ? raw.summary : {};
  const journeyDraft = raw.journeyDraft && typeof raw.journeyDraft === 'object' && !Array.isArray(raw.journeyDraft) ? raw.journeyDraft : {};
  const jtbdProfile = raw.jtbdProfile && typeof raw.jtbdProfile === 'object' && !Array.isArray(raw.jtbdProfile) ? raw.jtbdProfile : {};
  const forcesOfProgress = raw.forcesOfProgress && typeof raw.forcesOfProgress === 'object' && !Array.isArray(raw.forcesOfProgress) ? raw.forcesOfProgress : {};
  const normalized = {
    summary: {
      jobToBeDone: cleanString(summary.jobToBeDone || raw.jobToBeDone),
      generalInsight: cleanString(summary.generalInsight || raw.generalInsight || raw.generalInsights),
      overallSentiment: normalizeEnum(summary.overallSentiment || raw.overallSentiment, ['positive', 'mixed', 'negative']),
    },
    journeyDraft: {
      jobContext: cleanString(journeyDraft.jobContext),
      stages: normalizeObjectArray(
        journeyDraft.stages,
        (item) => {
          if (!item || typeof item !== 'object' || Array.isArray(item)) return null;
          const stage = cleanString(item.stage);
          const customerActions = normalizeStringArray(item.customerActions, 6);
          const touchpoints = normalizeTouchpoints(item.touchpoints, 6);
          const painPoints = normalizeStagePainPoints(item.painPoints, 5);
          if (!stage && customerActions.length === 0 && touchpoints.length === 0 && painPoints.length === 0) return null;
          return { stage, customerActions, touchpoints, painPoints };
        },
        8
      ),
    },
    jtbdProfile: {
      mainJob: cleanString(jtbdProfile.mainJob),
      functionalJob: cleanString(jtbdProfile.functionalJob),
      emotionalJob: cleanString(jtbdProfile.emotionalJob),
      socialJob: cleanString(jtbdProfile.socialJob),
      jobContext: cleanString(jtbdProfile.jobContext),
      desiredOutcome: cleanString(jtbdProfile.desiredOutcome),
      successCriteria: normalizeStringArray(jtbdProfile.successCriteria, 5),
    },
    forcesOfProgress: {
      pushes: normalizeStringArray(forcesOfProgress.pushes, 5),
      pulls: normalizeStringArray(forcesOfProgress.pulls, 5),
      anxieties: normalizeStringArray(forcesOfProgress.anxieties, 5),
      habits: normalizeStringArray(forcesOfProgress.habits, 5),
    },
    painPoints: normalizeObjectArray(
      raw.painPoints,
      (item) => {
        if (typeof item === 'string') {
          const description = cleanString(item);
          if (!description) return null;
          return {
            title: '',
            description,
            rootCause: '',
            impact: '',
            severity: '',
            evidenceQuote: '',
          };
        }
        if (!item || typeof item !== 'object' || Array.isArray(item)) return null;
        const description = cleanString(item.description || item.problem || item.painPoint);
        const title = cleanString(item.title);
        if (!title && !description) return null;
        return {
          title,
          description,
          rootCause: cleanString(item.rootCause),
          impact: cleanString(item.impact),
          severity: normalizeEnum(item.severity, ['low', 'medium', 'high']),
          evidenceQuote: cleanString(item.evidenceQuote || item.quote),
        };
      },
      5
    ),
    momentsOfFriction: normalizeObjectArray(
      raw.momentsOfFriction,
      (item) => {
        if (!item || typeof item !== 'object' || Array.isArray(item)) return null;
        const stage = cleanString(item.stage);
        const situation = cleanString(item.situation);
        const breakdown = cleanString(item.breakdown);
        const customerReaction = cleanString(item.customerReaction);
        if (!stage && !situation && !breakdown && !customerReaction) return null;
        return { stage, situation, breakdown, customerReaction };
      },
      5
    ),
    unmetNeeds: normalizeObjectArray(
      raw.unmetNeeds,
      (item) => {
        if (typeof item === 'string') {
          const need = cleanString(item);
          return need ? { need, whyItMatters: '' } : null;
        }
        if (!item || typeof item !== 'object' || Array.isArray(item)) return null;
        const need = cleanString(item.need);
        const whyItMatters = cleanString(item.whyItMatters);
        if (!need && !whyItMatters) return null;
        return { need, whyItMatters };
      },
      5
    ),
    workarounds: normalizeObjectArray(
      raw.workarounds,
      (item) => {
        if (typeof item === 'string') {
          const workaround = cleanString(item);
          return workaround ? { workaround, whatItSignals: '' } : null;
        }
        if (!item || typeof item !== 'object' || Array.isArray(item)) return null;
        const workaround = cleanString(item.workaround);
        const whatItSignals = cleanString(item.whatItSignals);
        if (!workaround && !whatItSignals) return null;
        return { workaround, whatItSignals };
      },
      3
    ),
    opportunityAreas: normalizeObjectArray(
      raw.opportunityAreas,
      (item) => {
        if (typeof item === 'string') {
          const area = cleanString(item);
          return area ? { area, rationale: '' } : null;
        }
        if (!item || typeof item !== 'object' || Array.isArray(item)) return null;
        const area = cleanString(item.area);
        const rationale = cleanString(item.rationale);
        if (!area && !rationale) return null;
        return { area, rationale };
      },
      5
    ),
    strengths: normalizeObjectArray(
      raw.strengths,
      (item) => {
        if (typeof item === 'string') {
          const title = cleanString(item);
          return title ? { title, description: '', whyItWorks: '', evidenceQuote: '' } : null;
        }
        if (!item || typeof item !== 'object' || Array.isArray(item)) return null;
        const title = cleanString(item.title);
        const description = cleanString(item.description);
        const whyItWorks = cleanString(item.whyItWorks);
        const evidenceQuote = cleanString(item.evidenceQuote || item.quote);
        if (!title && !description && !whyItWorks && !evidenceQuote) return null;
        return { title, description, whyItWorks, evidenceQuote };
      },
      5
    ),
    quotes: normalizeStringArray(raw.quotes, 3),
  };

  const hasContent =
    normalized.summary.jobToBeDone ||
    normalized.summary.generalInsight ||
    normalized.summary.overallSentiment ||
    normalized.journeyDraft.jobContext ||
    normalized.journeyDraft.stages.length > 0 ||
    normalized.jtbdProfile.mainJob ||
    normalized.jtbdProfile.functionalJob ||
    normalized.jtbdProfile.emotionalJob ||
    normalized.jtbdProfile.socialJob ||
    normalized.jtbdProfile.jobContext ||
    normalized.jtbdProfile.desiredOutcome ||
    normalized.jtbdProfile.successCriteria.length > 0 ||
    normalized.forcesOfProgress.pushes.length > 0 ||
    normalized.forcesOfProgress.pulls.length > 0 ||
    normalized.forcesOfProgress.anxieties.length > 0 ||
    normalized.forcesOfProgress.habits.length > 0 ||
    normalized.painPoints.length > 0 ||
    normalized.momentsOfFriction.length > 0 ||
    normalized.unmetNeeds.length > 0 ||
    normalized.workarounds.length > 0 ||
    normalized.opportunityAreas.length > 0 ||
    normalized.strengths.length > 0 ||
    normalized.quotes.length > 0;

  return hasContent ? normalized : null;
}

const clientOrigin = CLIENT_ORIGIN;

app.get('/api/integrations/:provider/authorize', async (req, res) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ status: 'error', message: 'Unauthorized' });
  const provider = req.params.provider;
  if (!INTEGRATION_PROVIDERS.includes(provider)) return res.status(400).json({ status: 'error', message: 'Invalid provider' });
  const returnPath = req.query.returnPath || null;
  try {
    const { data: { user }, error } = await supabase.auth.getUser(token);
    if (error || !user) return res.status(401).json({ status: 'error', message: 'Invalid token' });
    const state = createIntegrationState(user.id, returnPath);
    const redirectUri = process.env[provider === 'google_sheets' ? 'GOOGLE_REDIRECT_URI' : 'MS_REDIRECT_URI'] || `${API_PUBLIC_ORIGIN}/api/integrations/${provider}/callback`;
    const url = provider === 'google_sheets'
      ? googleSheets.getAuthorizeUrl(redirectUri, state)
      : microsoftExcel.getAuthorizeUrl(redirectUri, state);
    return res.json({ status: 'success', redirectUrl: url });
  } catch (err) {
    logSystemError(err, 'GET /api/integrations/:provider/authorize');
    return res.status(500).json({ error: err.message });
  }
});

app.get('/api/integrations/:provider/callback', async (req, res) => {
  const provider = req.params.provider;
  const { code, state } = req.query;
  const verified = verifyIntegrationState(state);
  const basePath = verified?.returnPath || 'metrics';
  const redirectBase = clientOrigin + '/' + basePath;
  if (!INTEGRATION_PROVIDERS.includes(provider)) return res.redirect(redirectBase + '?integration=error&message=Invalid+provider');
  if (!verified || !verified.userId || !code) return res.redirect(redirectBase + '?integration=error&message=Invalid+state');
  const userId = verified.userId;
  const redirectUri = process.env[provider === 'google_sheets' ? 'GOOGLE_REDIRECT_URI' : 'MS_REDIRECT_URI'] || `${API_PUBLIC_ORIGIN}/api/integrations/${provider}/callback`;
  try {
    const tokens = provider === 'google_sheets'
      ? await googleSheets.exchangeCodeForTokens(code, redirectUri)
      : await microsoftExcel.exchangeCodeForTokens(code, redirectUri);
    const row = {
      user_id: userId,
      provider,
      access_token: encrypt(tokens.access_token),
      refresh_token: tokens.refresh_token ? encrypt(tokens.refresh_token) : null,
      expires_at: tokens.expires_at,
      updated_at: new Date()
    };
    const { error } = await supabaseAdmin.from('user_integrations').upsert(row, { onConflict: 'user_id,provider' });
    if (error) throw error;
    return res.redirect(redirectBase + '?integration=connected');
  } catch (err) {
    logSystemError(err, 'GET /api/integrations/:provider/callback');
    return res.redirect(redirectBase + '?integration=error&message=' + encodeURIComponent(err.message || 'Connection failed'));
  }
});

app.get('/api/integrations/status', async (req, res) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ status: 'error', message: 'Unauthorized' });
  try {
    const { data: { user }, error } = await supabase.auth.getUser(token);
    if (error || !user) return res.status(401).json({ status: 'error', message: 'Invalid token' });
    const { data: rows } = await supabaseAdmin.from('user_integrations').select('provider').eq('user_id', user.id).in('provider', INTEGRATION_PROVIDERS);
    const connected = (rows || []).map(r => r.provider);
    return res.json({ status: 'success', data: { google_sheets: connected.includes('google_sheets'), microsoft_excel: connected.includes('microsoft_excel') } });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

app.delete('/api/integrations/:provider', async (req, res) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ status: 'error', message: 'Unauthorized' });
  const provider = req.params.provider;
  if (!INTEGRATION_PROVIDERS.includes(provider)) return res.status(400).json({ status: 'error', message: 'Invalid provider' });
  try {
    const { data: { user }, error } = await supabase.auth.getUser(token);
    if (error || !user) return res.status(401).json({ status: 'error', message: 'Invalid token' });
    const { error: deleteError } = await supabaseAdmin.from('user_integrations').delete().eq('user_id', user.id).eq('provider', provider);
    if (deleteError) throw deleteError;
    return res.json({ status: 'success' });
  } catch (err) {
    logSystemError(err, 'DELETE /api/integrations/:provider');
    return res.status(500).json({ status: 'error', message: err.message || 'Failed to disconnect' });
  }
});

function columnIndexToLetter(n) {
  if (!n || n < 1) return 'A';
  let s = '';
  while (n > 0) {
    n--;
    s = String.fromCharCode(65 + (n % 26)) + s;
    n = Math.floor(n / 26);
  }
  return s;
}

const spreadsheetInfoRateLimit = rateLimit({ windowMs: 2 * 60 * 1000, max: 20, message: { status: 'error', message: 'Too many requests' } });

app.get('/api/integrations/google_sheets/spreadsheet-info', spreadsheetInfoRateLimit, async (req, res) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ status: 'error', message: 'Unauthorized' });
  const spreadsheetId = req.query.spreadsheetId;
  if (!spreadsheetId) return res.status(400).json({ status: 'error', message: 'Missing spreadsheetId' });
  try {
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) return res.status(401).json({ status: 'error', message: 'Invalid token' });
    const accessToken = await getOrRefreshIntegrationTokens(user.id, 'google_sheets');
    if (!accessToken) return res.status(401).json({ status: 'error', code: 'INTEGRATION_DISCONNECTED', message: 'Please reconnect your account' });
    const sheets = await googleSheets.getSpreadsheetInfo(accessToken, spreadsheetId);
    const withSuggested = sheets.map((s) => {
      const rowCount = Math.max(1, s.rowCount || 1000);
      const colCount = Math.max(1, s.columnCount || 26);
      const suggestedRange = (s.title ? s.title + '!' : '') + 'A1:' + columnIndexToLetter(colCount) + rowCount;
      return { sheetId: s.sheetId, title: s.title, rowCount: s.rowCount, columnCount: s.columnCount, suggestedRange };
    });
    return res.json({ status: 'success', data: { sheets: withSuggested } });
  } catch (err) {
    logSystemError(err, 'GET /api/integrations/google_sheets/spreadsheet-info');
    return res.status(400).json({ status: 'error', error: err.message });
  }
});

const syncMetricRateLimit = rateLimit({ windowMs: 2 * 60 * 1000, max: 30, message: { status: 'error', message: 'Too many sync requests' } });

app.post('/api/metrics/:id/sync', syncMetricRateLimit, async (req, res) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ status: 'error', message: 'Unauthorized' });
  const { id } = req.params;
  try {
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) return res.status(401).json({ status: 'error', message: 'Invalid token' });
    const { data: metric } = await supabaseAdmin.from('metrics').select('*').eq('id', id).single();
    if (!metric) return res.status(404).json({ error: 'Metric not found' });
    const workspaceIds = await getAccessibleWorkspaceIds(user.id);
    if (!workspaceIds.includes(metric.workspace_id)) return res.status(403).json({ error: 'Access denied' });
    const cfg = metric.integration_config;
    const provider = metric.data_source;
    if (!cfg || !INTEGRATION_PROVIDERS.includes(provider)) return res.status(400).json({ status: 'error', code: 'NOT_INTEGRATION', message: 'Metric is not linked to an integration' });
    const accessToken = await getOrRefreshIntegrationTokens(user.id, provider);
    if (!accessToken) return res.status(401).json({ status: 'error', code: 'INTEGRATION_DISCONNECTED', message: 'Please reconnect your account' });
    let rows;
    if (provider === 'google_sheets') {
      const spreadsheetId = cfg.spreadsheetId;
      const range = normalizeRangeA1(cfg.range || 'Sheet1!A1:Z1000');
      if (!spreadsheetId) return res.status(400).json({ status: 'error', message: 'Missing spreadsheetId' });
      rows = await googleSheets.fetchRange(accessToken, spreadsheetId, range);
    } else {
      const fileId = cfg.fileId;
      const range = normalizeRangeA1(cfg.range || 'A1:Z1000');
      const sheetName = cfg.sheetName || 'Sheet1';
      if (!fileId) return res.status(400).json({ status: 'error', message: 'Missing fileId' });
      rows = await microsoftExcel.fetchRange(accessToken, fileId, range, sheetName);
    }
    const updates = mapRowsToMetric(metric.type, rows);
    const updatePayload = { updated_at: new Date(), ...updates };
    const { data: updated, error } = await supabaseAdmin.from('metrics').update(updatePayload).eq('id', id).select().single();
    if (error) throw error;
    return res.json({ status: 'success', data: updated });
  } catch (err) {
    logSystemError(err, 'POST /api/metrics/:id/sync');
    const code = err.message && err.message.includes('reconnect') ? 'INTEGRATION_DISCONNECTED' : 'SYNC_ERROR';
    return res.status(400).json({ status: 'error', code, error: err.message });
  }
});

// Fetch integration data without saving (preview for new metrics)
app.post('/api/integrations/fetch-data', syncMetricRateLimit, async (req, res) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ status: 'error', message: 'Unauthorized' });
  const { provider, integration_config: cfg, type } = req.body || {};
  if (!provider || !INTEGRATION_PROVIDERS.includes(provider)) return res.status(400).json({ status: 'error', message: 'Invalid provider' });
  if (!cfg || typeof cfg !== 'object') return res.status(400).json({ status: 'error', message: 'Missing integration_config' });
  const validTypes = ['Number', 'Comparison', 'Series'];
  if (!type || !validTypes.includes(type)) return res.status(400).json({ status: 'error', message: 'Invalid type' });
  try {
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) return res.status(401).json({ status: 'error', message: 'Invalid token' });
    const accessToken = await getOrRefreshIntegrationTokens(user.id, provider);
    if (!accessToken) return res.status(401).json({ status: 'error', code: 'INTEGRATION_DISCONNECTED', message: 'Please reconnect your account' });
    let rows;
    if (provider === 'google_sheets') {
      const spreadsheetId = cfg.spreadsheetId;
      const range = normalizeRangeA1(cfg.range || 'Sheet1!A1:Z1000');
      if (!spreadsheetId) return res.status(400).json({ status: 'error', message: 'Missing spreadsheetId' });
      rows = await googleSheets.fetchRange(accessToken, spreadsheetId, range);
    } else {
      const fileId = cfg.fileId;
      const range = normalizeRangeA1(cfg.range || 'A1:Z1000');
      const sheetName = cfg.sheetName || 'Sheet1';
      if (!fileId) return res.status(400).json({ status: 'error', message: 'Missing fileId' });
      rows = await microsoftExcel.fetchRange(accessToken, fileId, range, sheetName);
    }
    const updates = mapRowsToMetric(type, rows);
    return res.json({ status: 'success', data: updates });
  } catch (err) {
    logSystemError(err, 'POST /api/integrations/fetch-data');
    const code = err.message && err.message.includes('reconnect') ? 'INTEGRATION_DISCONNECTED' : 'SYNC_ERROR';
    return res.status(400).json({ status: 'error', code, error: err.message });
  }
});

// --- РОУТИ ДЛЯ ВОРКСПЕЙСУ (WORKSPACE) ---

// Список усіх воркспейсів користувача (owned + member) для перемикача
app.get('/api/workspace/list', async (req, res) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ status: 'error', message: 'Unauthorized' });

  try {
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) return res.status(401).json({ status: 'error', message: 'Invalid token' });

    await applyPendingInvitesForUser(user.id, user.email);

    // Use admin for reliable reads (avoids RLS blocking on local, prevents duplicate workspace creation)
    const { data: ownedList } = await supabaseAdmin
      .from('workspaces')
      .select('id, name')
      .eq('owner_id', user.id);
    const owned = (ownedList || []).map(w => ({ id: w.id, name: w.name || 'Workspace', role: 'owner' }));

    const { data: memberRows } = await supabaseAdmin
      .from('workspace_members')
      .select('workspace_id, role')
      .eq('user_id', user.id);
    const ownedIds = new Set((ownedList || []).map(w => w.id));
    const memberIds = (memberRows || []).map(m => m.workspace_id).filter(id => id && !ownedIds.has(id));
    let member = [];
    if (memberIds.length > 0) {
      const { data: wsList } = await supabaseAdmin.from('workspaces').select('id, name').in('id', memberIds);
      const roleByWs = Object.fromEntries((memberRows || []).map(m => [m.workspace_id, m.role || 'member']));
      member = (wsList || []).map(w => ({ id: w.id, name: w.name || 'Workspace', role: roleByWs[w.id] || 'member' }));
    }

    let list = [...owned, ...member];

    // If no workspace yet, create default only for new users (not for removed members).
    if (list.length === 0 && isNewUser(user)) {
      // Re-check before create (avoids race when multiple requests run in parallel)
      const recheck = await getAccessibleWorkspaceIds(user.id);
      if (recheck.length > 0) {
        const { data: ow } = await supabaseAdmin.from('workspaces').select('id, name').eq('owner_id', user.id);
        list = (ow || []).map(w => ({ id: w.id, name: w.name || 'Workspace', role: 'owner' }));
        const { data: mb } = await supabaseAdmin.from('workspace_members').select('workspace_id, role').eq('user_id', user.id);
        const ownedIds = new Set(list.map(w => w.id));
        const memberIds = (mb || []).map(m => m.workspace_id).filter(id => id && !ownedIds.has(id));
        if (memberIds.length > 0) {
          const { data: wl } = await supabaseAdmin.from('workspaces').select('id, name').in('id', memberIds);
          const roleByWs = Object.fromEntries((mb || []).map(m => [m.workspace_id, m.role || 'member']));
          list = [...list, ...(wl || []).map(w => ({ id: w.id, name: w.name || 'Workspace', role: roleByWs[w.id] || 'member' }))];
        }
      } else {
      const { data: newWorkspace, error: createErr } = await supabaseAdmin
        .from('workspaces')
        .insert([{ owner_id: user.id, name: 'My Workspace' }])
        .select('id, name')
        .single();
      if (!createErr && newWorkspace) {
        list = [{ id: newWorkspace.id, name: newWorkspace.name || 'My Workspace', role: 'owner' }];
        await ensureStarterSubscriptionForUser(user.id);
      } else if (createErr?.code === '23505') {
        const { data: ownedAgain } = await supabaseAdmin.from('workspaces').select('id, name').eq('owner_id', user.id);
        list = (ownedAgain || []).map(w => ({ id: w.id, name: w.name || 'Workspace', role: 'owner' }));
        await ensureStarterSubscriptionForUser(user.id);
      } else if (createErr?.code === '42501') {
        console.error('Tip: set SUPABASE_SERVICE_ROLE_KEY in .env to your project’s service_role key (Supabase Dashboard → Settings → API).');
      }
      }
    }

    res.json({ status: 'success', data: list });
  } catch (err) {
    logSystemError(err, 'GET /api/workspace/list');
    console.error('Error fetching workspace list:', err);
    res.status(500).json({ error: err.message });
  }
});

// Отримати воркспейс користувача
app.get('/api/workspace', async (req, res) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ status: 'error', message: 'Unauthorized' });

  try {
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) return res.status(401).json({ status: 'error', message: 'Invalid token' });

    // 1. Try to find owned workspace — use admin for reliable reads
    let { data: workspace, error } = await supabaseAdmin
      .from('workspaces')
      .select('*')
      .eq('owner_id', user.id)
      .limit(1)
      .maybeSingle();

    let role = 'owner';

    // 2. If not owner, try to apply any pending invites then check membership
    if (!workspace) {
        await applyPendingInvitesForUser(user.id, user.email);
        const { data: memberRecord } = await supabaseAdmin
            .from('workspace_members')
            .select('workspace_id, role')
            .eq('user_id', user.id)
            .limit(1)
            .maybeSingle();

        if (memberRecord) {
            const { data: ws } = await supabaseAdmin
                .from('workspaces')
                .select('*')
                .eq('id', memberRecord.workspace_id)
                .single();
            if (ws) {
                workspace = ws;
                role = memberRecord.role || 'member';
            }
        }
    }

    res.json({ status: 'success', data: workspace ? { ...workspace, role } : null });
  } catch (err) {
    logSystemError(err, 'GET /api/workspace');
    console.error('Error fetching workspace:', err);
    res.status(500).json({ error: err.message });
  }
});

// Plan limits and usage for current or selected workspace (for Settings subscription block and sidebar)
app.get('/api/workspace/limits', async (req, res) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ status: 'error', message: 'Unauthorized' });

  const workspaceIdParam = req.query.workspaceId || req.query.workspace_id;

  try {
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) return res.status(401).json({ status: 'error', message: 'Invalid token' });

    let workspace = null;
    if (workspaceIdParam) {
      const allowed = await getAccessibleWorkspaceIds(user.id);
      const allowedSet = new Set((allowed || []).map(id => String(id)));
      if (allowedSet.has(String(workspaceIdParam))) {
        const { data: ws } = await supabaseAdmin.from('workspaces').select('id, owner_id').eq('id', workspaceIdParam).maybeSingle();
        if (ws) workspace = { id: ws.id, role: ws.owner_id === user.id ? 'owner' : 'member' };
      }
    }
    if (!workspace) workspace = await getCurrentWorkspaceForUser(user.id);
    if (!workspace) {
      return res.json({ status: 'success', data: { workspaceId: null, role: null, limits: null } });
    }

    const limits = await getWorkspacePlanAndLimits(workspace.id);
    res.json({
      status: 'success',
      data: {
        workspaceId: workspace.id,
        role: workspace.role,
        limits: limits || { planName: null, planId: null, currentPeriodEnd: null, maxMembers: null, maxJourneys: null, maxPersonas: null, maxMetrics: null, maxInterviews: null, usage: { members: 0, journeys: 0, personas: 0, metrics: 0, interviews: 0 } },
      },
    });
  } catch (err) {
    logSystemError(err, 'GET /api/workspace/limits');
    console.error('Error fetching workspace limits:', err);
    res.status(500).json({ error: err.message });
  }
});

// Оновити назву воркспейсу (тільки один за id, щоб не оновлювати всі воркспейси овнера)
app.put('/api/workspace', async (req, res) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ status: 'error', message: 'Unauthorized' });

  const { name, workspace_id: bodyWorkspaceId } = req.body;

  try {
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) return res.status(401).json({ status: 'error', message: 'Invalid token' });

    if (!bodyWorkspaceId) return res.status(400).json({ status: 'error', message: 'workspace_id is required' });
    const { data: wsRow } = await supabaseAdmin.from('workspaces').select('id').eq('id', bodyWorkspaceId).eq('owner_id', user.id).maybeSingle();
    if (!wsRow) return res.status(403).json({ status: 'error', message: 'Only workspace owner can update name' });

    const { data, error } = await supabaseAdmin
      .from('workspaces')
      .update({ name })
      .eq('id', bodyWorkspaceId)
      .eq('owner_id', user.id)
      .select();

    if (error) throw error;
    res.json({ status: 'success', data: data?.[0] });
  } catch (err) {
    logSystemError(err, 'PUT /api/workspace');
    console.error('Error updating workspace:', err);
    res.status(500).json({ error: err.message });
  }
});

// Видалити воркспейс (тільки овнер; каскадно видаляє пов’язані дані)
app.delete('/api/workspace', async (req, res) => {
  const token = req.headers.authorization?.split(' ')[1];
  const workspaceId = req.body?.workspace_id || req.body?.workspaceId || req.query.workspace_id || req.query.workspaceId;
  if (!token) return res.status(401).json({ status: 'error', message: 'Unauthorized' });
  if (!workspaceId) return res.status(400).json({ status: 'error', message: 'workspace_id is required' });

  try {
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) return res.status(401).json({ status: 'error', message: 'Invalid token' });

    const { data: ws } = await supabaseAdmin.from('workspaces').select('id').eq('id', workspaceId).eq('owner_id', user.id).maybeSingle();
    if (!ws) return res.status(403).json({ status: 'error', message: 'Only workspace owner can delete it' });

    await supabaseAdmin.from('workspace_invites').delete().eq('workspace_id', workspaceId);
    await supabaseAdmin.from('workspace_members').delete().eq('workspace_id', workspaceId);
    await supabaseAdmin.from('journeys').delete().eq('workspace_id', workspaceId);
    await supabaseAdmin.from('personas').delete().eq('workspace_id', workspaceId);
    await supabaseAdmin.from('metrics').delete().eq('workspace_id', workspaceId);
    const { error: delErr } = await supabaseAdmin.from('workspaces').delete().eq('id', workspaceId);

    if (delErr) throw delErr;
    res.json({ status: 'success', message: 'Workspace deleted' });
  } catch (err) {
    logSystemError(err, 'DELETE /api/workspace');
    console.error('Error deleting workspace:', err);
    res.status(500).json({ error: err.message });
  }
});

// --- WORKSPACE MEMBERS (for journey owner dropdown, any workspace member can call) ---
app.get('/api/workspace/members', async (req, res) => {
    const token = req.headers.authorization?.split(' ')[1];
    const { workspaceId } = req.query;
    if (!token) return res.status(401).json({ status: 'error', message: 'Unauthorized' });
    if (!workspaceId) return res.status(400).json({ status: 'error', message: 'workspaceId required' });

    try {
        const { data: { user }, error: authError } = await supabase.auth.getUser(token);
        if (authError || !user) return res.status(401).json({ status: 'error', message: 'Invalid token' });

        const workspaceIds = await getAccessibleWorkspaceIds(user.id);
        if (!workspaceIds.includes(workspaceId)) return res.status(403).json({ status: 'error', message: 'Access denied' });

        const { data: workspace, error: wsErr } = await supabaseAdmin.from('workspaces').select('id, owner_id').eq('id', workspaceId).maybeSingle();
        if (wsErr || !workspace) return res.status(404).json({ status: 'error', message: 'Workspace not found' });

        const { data: members, error: membersError } = await supabaseAdmin
            .from('workspace_members')
            .select('user_id')
            .eq('workspace_id', workspace.id);
        if (membersError) throw membersError;

        const userIds = [...new Set([
            workspace.owner_id,
            ...(members || []).map(m => m.user_id).filter(Boolean)
        ])].filter(Boolean);

        let profilesMap = {};
        if (userIds.length > 0) {
            const { data: profiles } = await supabaseAdmin.from('profiles').select('id, email, full_name').in('id', userIds);
            if (profiles) profiles.forEach(p => { profilesMap[p.id] = p; });
        }
        const missing = userIds.filter(id => !profilesMap[id]?.full_name && !profilesMap[id]?.email);
        let authMap = {};
        if (missing.length > 0) {
            const authResults = await Promise.all(missing.map(id => supabase.auth.admin.getUserById(id)));
            authResults.forEach((r, i) => {
                const uid = missing[i];
                const u = r.data?.user;
                if (u) authMap[uid] = { email: u.email || null, full_name: u.user_metadata?.full_name || null };
            });
        }

        const list = userIds.map(uid => {
            const p = profilesMap[uid] || {};
            const a = authMap[uid] || {};
            return { id: uid, full_name: p.full_name ?? a.full_name ?? null, email: p.email ?? a.email ?? null };
        });

        res.json({ status: 'success', data: list });
    } catch (err) {
        console.error('Error fetching workspace members:', err);
        logSystemError(err, 'GET /api/workspace/members');
        res.status(500).json({ status: 'error', error: err.message });
    }
});

// --- TEAM ROUTES ---

// Get Team Members & Invites
app.get('/api/workspace/team', async (req, res) => {
    const token = req.headers.authorization?.split(' ')[1];
    const { workspaceId } = req.query;
    if (!token) return res.status(401).json({ error: 'Unauthorized' });

    try {
        const { data: { user } } = await supabase.auth.getUser(token);
        if (!user) return res.status(401).json({ error: 'Unauthorized' });

        // Get workspace ID specifically — use admin for reliable read
        const { data: workspace } = await supabaseAdmin.from('workspaces')
            .select('id')
            .eq('owner_id', user.id)
            .eq('id', workspaceId)
            .single();
        
        if (!workspace) return res.status(403).json({ error: 'Only workspace owners can view team settings' });

        // Get Members (без join на profiles — FK може відсутній) — admin for reliable read
        const { data: members, error: membersError } = await supabaseAdmin
            .from('workspace_members')
            .select('id, role, joined_at, user_id')
            .eq('workspace_id', workspace.id);

        if (membersError) throw membersError;

        // Окремо підтягуємо profiles за user_id
        const userIds = [...new Set((members || []).map(m => m.user_id).filter(Boolean))];
        let profilesMap = {};
        if (userIds.length > 0) {
            const { data: profiles } = await supabaseAdmin
                .from('profiles')
                .select('id, email, full_name')
                .in('id', userIds);
            if (profiles) profiles.forEach(p => { profilesMap[p.id] = p; });
        }

        // Якщо в profiles немає email або full_name — підтягуємо з Auth (service role)
        let authMap = {};
        const missing = userIds.filter(id => {
            const p = profilesMap[id];
            return !p?.email || !p?.full_name;
        });
        if (missing.length > 0) {
            const authResults = await Promise.all(
                missing.map(id => supabase.auth.admin.getUserById(id))
            );
            authResults.forEach((res, i) => {
                const uid = missing[i];
                const u = res.data?.user;
                if (u) authMap[uid] = { email: u.email || null, full_name: u.user_metadata?.full_name || null };
            });
        }

        const membersWithProfiles = (members || []).map(m => {
            const pid = m.user_id;
            const fromProfile = profilesMap[pid];
            const fromAuth = authMap[pid];
            return {
                ...m,
                email: fromProfile?.email ?? fromAuth?.email ?? null,
                full_name: fromProfile?.full_name ?? fromAuth?.full_name ?? null,
            };
        });

        // Get Pending Invites
        const { data: invites, error: invitesError } = await supabaseAdmin
            .from('workspace_invites')
            .select('*')
            .eq('workspace_id', workspace.id)
            .eq('status', 'pending');

        if (invitesError) throw invitesError;

        res.json({ 
            status: 'success', 
            data: { 
                members: membersWithProfiles, 
                invites: invites || []
            } 
        });
    } catch (err) {
        logSystemError(err, 'GET /api/workspace/team');
        console.error('Error fetching team:', err);
        res.status(500).json({ error: err.message });
    }
});

// Invite Member
app.post('/api/workspace/invite', async (req, res) => {
    const token = req.headers.authorization?.split(' ')[1];
    const { email, role = 'member', workspaceId, workspace_id } = req.body;
    const targetWorkspaceId = workspaceId || workspace_id || req.query.workspaceId || req.query.workspace_id;

    if (!token) return res.status(401).json({ error: 'Unauthorized' });
    if (!targetWorkspaceId) return res.status(400).json({ error: 'Workspace ID is required' });

    try {
        const { data: { user } } = await supabase.auth.getUser(token);
        
        // Use admin for reliable read (avoids RLS blocking on local)
        const { data: workspace } = await supabaseAdmin.from('workspaces')
            .select('id')
            .eq('owner_id', user.id)
            .eq('id', targetWorkspaceId)
            .single();
        
        if (!workspace) return res.status(403).json({ error: 'Only owners can invite' });

        const planLimits = await getWorkspacePlanAndLimits(workspace.id);
        if (planLimits && planLimits.maxMembers != null && (planLimits.usage.members >= planLimits.maxMembers)) {
            return res.status(403).json({ status: 'error', code: 'LIMIT_REACHED', limit: 'members' });
        }

        const normalizedEmail = String(email).trim().toLowerCase();
        // Use admin so we always find existing row (e.g. re-invite after member was removed; RLS could hide accepted invites)
        const { data: existingInvite } = await supabaseAdmin
            .from('workspace_invites')
            .select('id, status')
            .eq('workspace_id', workspace.id)
            .ilike('email', normalizedEmail)
            .maybeSingle();

        if (existingInvite) {
            if (existingInvite.status === 'pending') {
                return res.json({ status: 'success', message: 'Invite already sent to this email.', data: { id: existingInvite.id } });
            }
            // Re-invite: update existing row (e.g. was accepted/rejected, or member was removed) to pending so we don't hit unique constraint
            const { data: updated, error: updateErr } = await supabaseAdmin
                .from('workspace_invites')
                .update({ status: 'pending', role })
                .eq('id', existingInvite.id)
                .select()
                .single();
            if (updateErr) throw updateErr;
            console.log(`📧 [MOCK EMAIL] Re-sending invite to ${email} for workspace ${workspace.id}`);
            return res.json({ status: 'success', message: 'Invite sent successfully.', data: updated });
        }

        const { data, error } = await supabaseAdmin
            .from('workspace_invites')
            .insert([{ workspace_id: workspace.id, email: normalizedEmail, role }])
            .select()
            .single();

        if (error) throw error;

        console.log(`📧 [MOCK EMAIL] Sending invite to ${email} for workspace ${workspace.id}`);

        res.json({ status: 'success', message: 'Invite sent successfully.', data });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Cancel (revoke) a pending invite — тільки власник воркспейсу
app.delete('/api/workspace/invite/:id', async (req, res) => {
    const token = req.headers.authorization?.split(' ')[1];
    const { id: inviteId } = req.params;
    if (!token) return res.status(401).json({ error: 'Unauthorized' });

    try {
        const { data: { user } } = await supabase.auth.getUser(token);
        const { data: invite } = await supabaseAdmin.from('workspace_invites')
            .select('id, workspace_id')
            .eq('id', inviteId)
            .single();
        if (!invite) return res.status(404).json({ error: 'Invite not found' });

        const { data: workspace } = await supabaseAdmin.from('workspaces')
            .select('id')
            .eq('id', invite.workspace_id)
            .eq('owner_id', user.id)
            .single();
        if (!workspace) return res.status(403).json({ error: 'Only workspace owner can cancel invites' });

        const { error } = await supabaseAdmin
            .from('workspace_invites')
            .delete()
            .eq('id', inviteId);
        if (error) throw error;
        res.json({ status: 'success', message: 'Invite cancelled' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Remove a member from workspace — тільки власник воркспейсу
app.delete('/api/workspace/member/:id', async (req, res) => {
    const token = req.headers.authorization?.split(' ')[1];
    const { id: memberRowId } = req.params;
    if (!token) return res.status(401).json({ error: 'Unauthorized' });

    try {
        const { data: { user } } = await supabase.auth.getUser(token);
        const { data: member } = await supabaseAdmin.from('workspace_members')
            .select('id, workspace_id')
            .eq('id', memberRowId)
            .single();
        if (!member) return res.status(404).json({ error: 'Member not found' });

        const { data: workspace } = await supabaseAdmin.from('workspaces')
            .select('id')
            .eq('id', member.workspace_id)
            .eq('owner_id', user.id)
            .single();
        if (!workspace) return res.status(403).json({ error: 'Only workspace owner can remove members' });

        const { error } = await supabaseAdmin
            .from('workspace_members')
            .delete()
            .eq('id', memberRowId);
        if (error) throw error;
        res.json({ status: 'success', message: 'Member removed from workspace' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- РОУТИ ДЛЯ ПРОФІЛЮ (PROFILE) ---

// Отримати профіль користувача
app.get('/api/profile', async (req, res) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ status: 'error', message: 'Unauthorized' });

  try {
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) return res.status(401).json({ status: 'error', message: 'Invalid token' });

    // Отримуємо додаткові дані з таблиці profiles (admin — сервер без JWT контексту)
    let { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .maybeSingle();
    
    // Auto-create profile only when row truly missing — never overwrite existing full_name
    if (!profile) {
        const fullName = (user.user_metadata?.full_name || (user.email && user.email.split('@')[0]) || '').trim() || 'User';
        const { data: inserted, error: insertErr } = await supabaseAdmin
            .from('profiles')
            .insert({ id: user.id, email: user.email || '', full_name: fullName })
            .select()
            .maybeSingle();
        if (!insertErr && inserted) {
            profile = inserted;
        } else if (insertErr?.code === '23505') {
            // Row exists (e.g. race) — fetch existing so we never overwrite name
            const { data: existing } = await supabaseAdmin.from('profiles').select('*').eq('id', user.id).maybeSingle();
            if (existing) profile = existing;
        }
    }

    // Об'єднуємо дані з auth (email) та profiles (full_name); якщо збережено "User" — показуємо частину email
    const rawName = profile?.full_name || '';
    const displayName = (rawName && rawName !== 'User') ? rawName : (user.email && user.email.split('@')[0]) || rawName || '';
    const data = {
        id: user.id,
        email: user.email,
        role: profile?.role || 'user',
        full_name: displayName,
        avatar_color: profile?.avatar_color || 'bg-blue-100 text-blue-600',
    };

    res.json({ status: 'success', data });
  } catch (err) {
    logSystemError(err, 'GET /api/profile');
    console.error('Error fetching profile:', err);
    res.status(500).json({ error: err.message });
  }
});

// Оновити профіль (ім'я, колір аватара)
app.put('/api/profile', async (req, res) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ status: 'error', message: 'Unauthorized' });

  const { full_name, avatar_color } = req.body;

  try {
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) return res.status(401).json({ status: 'error', message: 'Invalid token' });

    const payload = { id: user.id, full_name };
    if (avatar_color !== undefined) payload.avatar_color = avatar_color;

    const { data, error } = await supabaseAdmin
      .from('profiles')
      .upsert(payload)
      .select()
      .single();

    if (error) throw error;
    res.json({ status: 'success', data: { ...data, email: user.email } });
  } catch (err) {
    logSystemError(err, 'PUT /api/profile');
    console.error('Error updating profile:', err);
    res.status(500).json({ error: err.message });
  }
});

// --- SUPPORT & FEEDBACK (two-way: user submits, admin replies, user sees badge) ---

// Create submission (Report issue / Send idea)
app.post('/api/feedback', async (req, res) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ status: 'error', message: 'Unauthorized' });
  try {
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) return res.status(401).json({ status: 'error', message: 'Invalid token' });
    const { type, subject, body, steps_to_reproduce, attachment_url, category } = req.body;
    if (!type || !subject || !body || !['issue', 'idea'].includes(type)) {
      return res.status(400).json({ status: 'error', message: 'type (issue|idea), subject, body required' });
    }
    const row = {
      user_id: user.id,
      type,
      subject: String(subject).trim(),
      body: String(body).trim(),
      steps_to_reproduce: type === 'issue' ? (steps_to_reproduce && String(steps_to_reproduce).trim()) || null : null,
      attachment_url: type === 'issue' ? (attachment_url && String(attachment_url).trim()) || null : null,
      category: type === 'idea' ? (category && String(category).trim()) || null : null,
      status: 'open',
    };
    // RLS: feedback_insert_own requires auth.uid() = user_id — use client with user JWT so insert runs as that user
    const anonKey = process.env.SUPABASE_ANON_KEY;
    const client = anonKey
      ? createClient(process.env.SUPABASE_URL, anonKey, { global: { headers: { Authorization: `Bearer ${token}` } } })
      : supabase;
    const { data, error } = await client.from('feedback').insert([row]).select().single();
    if (error) throw error;
    res.status(201).json({ status: 'success', data });
  } catch (err) {
    logSystemError(err, 'POST /api/feedback');
    console.error('Error creating feedback:', err);
    res.status(500).json({ status: 'error', error: err.message });
  }
});

// List my feedback (with unread count per item for badge in list)
app.get('/api/feedback', async (req, res) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ status: 'error', message: 'Unauthorized' });
  try {
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) return res.status(401).json({ status: 'error', message: 'Invalid token' });
    const { data: list, error } = await supabaseAdmin
      .from('feedback')
      .select('id, type, subject, status, created_at, updated_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });
    if (error) throw error;
    const ids = (list || []).map((f) => f.id);
    if (ids.length === 0) return res.json({ status: 'success', data: list || [] });
    const { data: replyCounts } = await supabaseAdmin
      .from('feedback_replies')
      .select('feedback_id')
      .eq('author_type', 'admin')
      .is('read_at', null);
    const unreadByFeedback = {};
    (replyCounts || []).forEach((r) => { unreadByFeedback[r.feedback_id] = (unreadByFeedback[r.feedback_id] || 0) + 1; });
    const withUnread = (list || []).map((f) => ({ ...f, unread_count: unreadByFeedback[f.id] || 0 }));
    res.json({ status: 'success', data: withUnread });
  } catch (err) {
    logSystemError(err, 'GET /api/feedback');
    console.error('Error listing feedback:', err);
    res.status(500).json({ status: 'error', error: err.message });
  }
});

// Unread count (for red badge next to Support button) — must be before /:id
app.get('/api/feedback/unread-count', async (req, res) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ status: 'error', message: 'Unauthorized' });
  try {
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) return res.status(401).json({ status: 'error', message: 'Invalid token' });
    const { data: myFeedback } = await supabaseAdmin.from('feedback').select('id').eq('user_id', user.id);
    const ids = (myFeedback || []).map((f) => f.id);
    if (ids.length === 0) return res.json({ status: 'success', data: 0 });
    const { count, error } = await supabaseAdmin
      .from('feedback_replies')
      .select('*', { count: 'exact', head: true })
      .in('feedback_id', ids)
      .eq('author_type', 'admin')
      .is('read_at', null);
    if (error) throw error;
    res.json({ status: 'success', data: count ?? 0 });
  } catch (err) {
    logSystemError(err, 'GET /api/feedback/unread-count');
    console.error('Error getting unread count:', err);
    res.status(500).json({ status: 'error', error: err.message });
  }
});

// Get one thread (feedback + replies)
app.get('/api/feedback/:id', async (req, res) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ status: 'error', message: 'Unauthorized' });
  try {
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) return res.status(401).json({ status: 'error', message: 'Invalid token' });
    const { id } = req.params;
    const { data: feedback, error: feedError } = await supabaseAdmin
      .from('feedback')
      .select('*')
      .eq('id', id)
      .eq('user_id', user.id)
      .single();
    if (feedError || !feedback) return res.status(404).json({ status: 'error', message: 'Not found' });
    const { data: replies, error: repError } = await supabaseAdmin
      .from('feedback_replies')
      .select('id, author_type, body, read_at, created_at')
      .eq('feedback_id', id)
      .order('created_at', { ascending: true });
    if (repError) throw repError;
    res.json({ status: 'success', data: { ...feedback, replies: replies || [] } });
  } catch (err) {
    logSystemError(err, 'GET /api/feedback/:id');
    console.error('Error getting feedback thread:', err);
    res.status(500).json({ status: 'error', error: err.message });
  }
});

// Mark admin replies as read (when user opens thread)
app.patch('/api/feedback/:id/read', async (req, res) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ status: 'error', message: 'Unauthorized' });
  try {
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) return res.status(401).json({ status: 'error', message: 'Invalid token' });
    const { id } = req.params;
    const { data: feedback } = await supabaseAdmin.from('feedback').select('id').eq('id', id).eq('user_id', user.id).single();
    if (!feedback) return res.status(404).json({ status: 'error', message: 'Not found' });
    const { error: updateErr } = await supabaseAdmin
      .from('feedback_replies')
      .update({ read_at: new Date().toISOString() })
      .eq('feedback_id', id)
      .eq('author_type', 'admin')
      .is('read_at', null);
    if (updateErr) throw updateErr;
    res.json({ status: 'success' });
  } catch (err) {
    logSystemError(err, 'PATCH /api/feedback/:id/read');
    console.error('Error marking feedback read:', err);
    res.status(500).json({ status: 'error', error: err.message });
  }
});

// Delete own feedback (ticket) — replies deleted by FK CASCADE
app.delete('/api/feedback/:id', async (req, res) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ status: 'error', message: 'Unauthorized' });
  try {
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) return res.status(401).json({ status: 'error', message: 'Invalid token' });
    const { id } = req.params;
    const { data: feedback } = await supabaseAdmin.from('feedback').select('id').eq('id', id).eq('user_id', user.id).single();
    if (!feedback) return res.status(404).json({ status: 'error', message: 'Not found' });
    const { error: delError } = await supabaseAdmin.from('feedback').delete().eq('id', id);
    if (delError) throw delError;
    res.json({ status: 'success' });
  } catch (err) {
    logSystemError(err, 'DELETE /api/feedback/:id');
    console.error('Error deleting feedback:', err);
    res.status(500).json({ status: 'error', error: err.message });
  }
});

// --- Admin: list all feedback ---
app.get('/api/admin/feedback', async (req, res) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ status: 'error', message: 'Unauthorized' });
  try {
    const { error: adminAuthError } = await getAdminUserFromToken(token);
    if (adminAuthError?.message === 'Access denied') return res.status(403).json({ status: 'error', message: 'Access denied' });
    if (adminAuthError) return res.status(401).json({ status: 'error', message: 'Invalid token' });
    const { data, error } = await supabase
      .from('feedback')
      .select('id, user_id, type, subject, status, created_at, updated_at')
      .order('created_at', { ascending: false });
    if (error) throw error;
    res.json({ status: 'success', data: data || [] });
  } catch (err) {
    logSystemError(err, 'GET /api/admin/feedback');
    console.error('Error listing admin feedback:', err);
    res.status(500).json({ status: 'error', error: err.message });
  }
});

// --- Admin: feedback count (total + open/unreplied) for sidebar badge ---
app.get('/api/admin/feedback/count', async (req, res) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ status: 'error', message: 'Unauthorized' });
  try {
    const { error: adminAuthError } = await getAdminUserFromToken(token);
    if (adminAuthError?.message === 'Access denied') return res.status(403).json({ status: 'error', message: 'Access denied' });
    if (adminAuthError) return res.status(401).json({ status: 'error', message: 'Invalid token' });
    const { count: total, error: totalErr } = await supabaseAdmin.from('feedback').select('*', { count: 'exact', head: true });
    if (totalErr) throw totalErr;
    const { count: open, error: openErr } = await supabaseAdmin.from('feedback').select('*', { count: 'exact', head: true }).eq('status', 'open');
    if (openErr) throw openErr;
    res.json({ status: 'success', data: { total: total ?? 0, open: open ?? 0 } });
  } catch (err) {
    logSystemError(err, 'GET /api/admin/feedback/count');
    console.error('Error getting admin feedback count:', err);
    res.status(500).json({ status: 'error', error: err.message });
  }
});

// --- Admin: get one thread + post reply ---
app.get('/api/admin/feedback/:id', async (req, res) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ status: 'error', message: 'Unauthorized' });
  try {
    const { error: adminAuthError } = await getAdminUserFromToken(token);
    if (adminAuthError?.message === 'Access denied') return res.status(403).json({ status: 'error', message: 'Access denied' });
    if (adminAuthError) return res.status(401).json({ status: 'error', message: 'Invalid token' });
    const { id } = req.params;
    const { data: feedback, error: feedError } = await supabaseAdmin.from('feedback').select('*').eq('id', id).single();
    if (feedError || !feedback) return res.status(404).json({ status: 'error', message: 'Not found' });
    const { data: replies } = await supabase
      .from('feedback_replies')
      .select('id, author_type, body, read_at, created_at')
      .eq('feedback_id', id)
      .order('created_at', { ascending: true });
    res.json({ status: 'success', data: { ...feedback, replies: replies || [] } });
  } catch (err) {
    logSystemError(err, 'GET /api/admin/feedback/:id');
    console.error('Error getting admin feedback thread:', err);
    res.status(500).json({ status: 'error', error: err.message });
  }
});

app.post('/api/admin/feedback/:id/reply', async (req, res) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ status: 'error', message: 'Unauthorized' });
  try {
    const { error: adminAuthError } = await getAdminUserFromToken(token);
    if (adminAuthError?.message === 'Access denied') return res.status(403).json({ status: 'error', message: 'Access denied' });
    if (adminAuthError) return res.status(401).json({ status: 'error', message: 'Invalid token' });
    const { id } = req.params;
    const { body } = req.body;
    if (!body || !String(body).trim()) return res.status(400).json({ status: 'error', message: 'body required' });
    const { data: feedback } = await supabaseAdmin.from('feedback').select('id').eq('id', id).single();
    if (!feedback) return res.status(404).json({ status: 'error', message: 'Not found' });
    const { data: reply, error } = await supabaseAdmin
      .from('feedback_replies')
      .insert([{ feedback_id: id, author_type: 'admin', author_id: user.id, body: String(body).trim() }])
      .select()
      .single();
    if (error) throw error;
    await supabaseAdmin.from('feedback').update({ status: 'replied', updated_at: new Date().toISOString() }).eq('id', id);
    res.status(201).json({ status: 'success', data: reply });
  } catch (err) {
    logSystemError(err, 'POST /api/admin/feedback/:id/reply');
    console.error('Error posting admin reply:', err);
    res.status(500).json({ status: 'error', error: err.message });
  }
});

// --- РОУТИ ДЛЯ ПІДПИСОК (SUBSCRIPTIONS) ---

// 1. Отримати активні плани (публічний). ?locale=en|uk — features from features_by_locale
app.get('/api/plans', async (req, res) => {
    try {
        const locale = (req.query.locale || 'en').toLowerCase();
        const { data, error } = await supabase
            .from('plans')
            .select('*')
            .eq('is_active', true)
            .order('tier', { ascending: true });

        if (error) throw error;
        const plans = (data || []).map((plan) => {
            const byLocale = plan.features_by_locale || {};
            const features = (byLocale[locale] != null ? byLocale[locale] : byLocale.en) ?? plan.features ?? [];
            const byDesc = plan.description_by_locale || {};
            const description = (byDesc[locale] != null ? byDesc[locale] : byDesc.en) ?? plan.description ?? '';
            return { ...plan, features, description };
        });
        res.json({ status: 'success', data: plans });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Ensure current user has Starter subscription (for new registrations via client signUp). Use admin client so RLS does not block.
app.post('/api/subscriptions/ensure-starter', async (req, res) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'Unauthorized' });

    try {
        const { data: { user }, error: authError } = await supabase.auth.getUser(token);
        if (authError || !user) return res.status(401).json({ error: 'Invalid token' });

        const { data: existing } = await supabaseAdmin
            .from('subscriptions')
            .select('id')
            .eq('user_id', user.id)
            .eq('status', 'active')
            .limit(1)
            .maybeSingle();
        if (existing) return res.status(200).json({ status: 'ok', message: 'Already has subscription' });

        const { data: starterPlan } = await supabaseAdmin
            .from('plans')
            .select('id')
            .ilike('name', 'Starter')
            .eq('is_active', true)
            .limit(1)
            .maybeSingle();
        if (!starterPlan) return res.status(500).json({ error: 'Starter plan not found' });

        const periodEnd = new Date();
        periodEnd.setMonth(periodEnd.getMonth() + 1);
        const { error: subInsertErr } = await supabaseAdmin.from('subscriptions').insert([{
            user_id: user.id,
            plan_id: starterPlan.id,
            status: 'active',
            current_period_start: new Date(),
            current_period_end: periodEnd,
        }]);
        if (subInsertErr) throw subInsertErr;
        return res.status(200).json({ status: 'ok', message: 'Starter assigned' });
    } catch (err) {
        console.error('ensure-starter error:', err);
        return res.status(500).json({ error: err.message });
    }
});

// 2. Призначити план користувачу (Тільки Адмін або Система)
app.post('/api/subscriptions/assign', async (req, res) => {
    const token = req.headers.authorization?.split(' ')[1];
    const { userId, planId, status = 'active' } = req.body;

    if (!token) return res.status(401).json({ error: 'Unauthorized' });

    try {
        // Перевірка прав адміна (спрощена, краще через middleware)
        const { data: { user } } = await supabase.auth.getUser(token);
        const { data: profile } = await supabaseAdmin.from('profiles').select('role').eq('id', user.id).single();
        
        if (profile?.role !== 'admin') {
            return res.status(403).json({ error: 'Access denied' });
        }

        // Деактивуємо старі підписки
        await supabaseAdmin
            .from('subscriptions')
            .update({ status: 'canceled', current_period_end: new Date() })
            .eq('user_id', userId)
            .neq('status', 'canceled');

        // Створюємо нову
        const { data, error } = await supabaseAdmin
            .from('subscriptions')
            .insert([{
                user_id: userId,
                plan_id: planId,
                status: status,
                current_period_start: new Date(),
                // current_period_end: ... (можна додати логіку +1 місяць)
            }])
            .select()
            .single();

        if (error) throw error;
        res.json({ status: 'success', data });
    } catch (err) {
        console.error('Error assigning plan:', err);
        res.status(500).json({ error: err.message });
    }
});

// --- ADMIN USER MANAGEMENT ---

// Get User Details (Full View)
// Приймаємо обидва варіанти URL, щоб не залежати від кешу фронтенда
app.get(['/api/users-manage/:id', '/api/admin/users/:id'], async (req, res) => {
    const { id } = req.params;
    console.log(`🔍 [MANAGE] Fetching details for user: ${id}`);

    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
        console.log('❌ No token provided');
        return res.status(401).json({ error: 'Unauthorized' });
    }

    try {
        const { error: adminAuthError } = await getAdminUserFromToken(token);
        if (adminAuthError?.message === 'Access denied') {
            console.log('❌ Access denied for non-admin user');
            return res.status(403).json({
                error: 'Access denied',
                message: "Your account needs role 'admin' in the profiles table to view user details.",
            });
        }
        if (adminAuthError) {
             console.log('❌ Auth error:', adminAuthError);
             return res.status(401).json({ error: 'Invalid token' });
        }

        // 1. Profile
        const { data: userProfile, error: profileError } = await supabaseAdmin
            .from('profiles')
            .select('*')
            .eq('id', id)
            .single();
        
        if (profileError) {
            console.error("❌ Profile error:", profileError);
            return res.status(404).json({
                error: 'User not found',
                message: 'No profile found for this user id.',
            });
        }

        // 2. Workspaces (Owned & Joined)
        const { data: ownedWorkspaces } = await supabaseAdmin
            .from('workspaces')
            .select('*, workspace_members(count)')
            .eq('owner_id', id);
        
        const { data: joinedWorkspaces } = await supabaseAdmin
            .from('workspace_members')
            .select('role, joined_at, workspaces(*)')
            .eq('user_id', id);

        // 3. Subscriptions (History)
        const { data: subscriptions } = await supabaseAdmin
            .from('subscriptions')
            .select('*, plans(name, price_monthly)')
            .eq('user_id', id)
            .order('created_at', { ascending: false });

        console.log(`✅ Found user: ${userProfile.email}`);

        res.json({
            status: 'success',
            data: {
                profile: userProfile,
                owned_workspaces: ownedWorkspaces || [],
                joined_workspaces: joinedWorkspaces || [],
                subscriptions: subscriptions || []
            }
        });

    } catch (err) {
        console.error('❌ SERVER ERROR:', err);
        res.status(500).json({ error: err.message });
    }
});

// Assign Plan (Manual Admin Override)
// Приймаємо обидва варіанти URL
app.post(['/api/users-manage/assign-plan', '/api/admin/users/assign-plan'], async (req, res) => {
    const token = req.headers.authorization?.split(' ')[1];
    const { userId, planId, durationDays, customEndDate } = req.body;

    if (!token) return res.status(401).json({ error: 'Unauthorized' });

    try {
        const { error: adminAuthError } = await getAdminUserFromToken(token);
        if (adminAuthError?.message === 'Access denied') return res.status(403).json({ error: 'Access denied' });
        if (adminAuthError) return res.status(401).json({ error: 'Invalid token' });

        let endDate = new Date();
        if (customEndDate) {
            endDate = new Date(customEndDate);
        } else if (durationDays) {
            endDate.setDate(endDate.getDate() + parseInt(durationDays));
        } else {
            endDate.setMonth(endDate.getMonth() + 1);
        }

        // Call existing logic or reuse code. For simplicity, we reuse the logic but with custom date.
        // Deactivate old active subs
        await supabaseAdmin.from('subscriptions').update({ status: 'canceled' }).eq('user_id', userId).eq('status', 'active');

        const { data, error } = await supabaseAdmin.from('subscriptions').insert([{ user_id: userId, plan_id: planId, status: 'active', current_period_start: new Date(), current_period_end: endDate }]).select().single();
        if (error) throw error;
        res.json({ status: 'success', data });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// --- РОУТИ ДЛЯ ІНТЕРВ'Ю (INTERVIEWS) ---

// 1. Отримати всі інтерв'ю робочого простору
app.get('/api/interviews', async (req, res) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ status: 'error', message: 'Unauthorized' });

    try {
        const { data: { user }, error: authError } = await supabase.auth.getUser(token);
        if (authError || !user) return res.status(401).json({ status: 'error', message: 'Invalid token' });

        const workspaceIds = await getAccessibleWorkspaceIds(user.id);
        
        let query = supabaseAdmin.from('interviews').select('*');
        if (workspaceIds.length > 0) {
            query = query.in('workspace_id', workspaceIds);
        } else {
            query = query.eq('user_id', user.id);
        }

        const { data, error } = await query.order('created_at', { ascending: false });
        if (error) throw error;

        // Fetch owner names
        const userIds = [...new Set(data.map(i => i.user_id).filter(Boolean))];
        let profilesMap = {};
        if (userIds.length > 0) {
            const { data: profiles } = await supabaseAdmin.from('profiles').select('id, full_name, email').in('id', userIds);
            if (profiles) profiles.forEach(p => { profilesMap[p.id] = p.full_name || p.email; });
        }

        const interviewsWithOwners = data.map(i => sanitizeInterviewForClient({
            ...i,
            owner: profilesMap[i.user_id] || 'Unknown'
        }));
        res.json({ status: 'success', data: interviewsWithOwners });
    } catch (err) {
        logSystemError(err, 'GET /api/interviews');
        res.status(500).json({ error: err.message });
    }
});

// 2. Отримати одне інтерв'ю
app.get('/api/interviews/:id', async (req, res) => {
    const token = req.headers.authorization?.split(' ')[1];
    const { id } = req.params;
    if (!token) return res.status(401).json({ status: 'error', message: 'Unauthorized' });

    try {
        const { data: { user }, error: authError } = await supabase.auth.getUser(token);
        if (authError || !user) return res.status(401).json({ status: 'error', message: 'Invalid token' });

        const { data: interview, error } = await supabaseAdmin.from('interviews').select('*').eq('id', id).single();
        if (error) throw error;

        const workspaceIds = await getAccessibleWorkspaceIds(user.id);
        if (interview.workspace_id && !workspaceIds.includes(interview.workspace_id)) {
            return res.status(404).json({ status: 'error', message: 'Interview not found or access denied' });
        }

        res.json({ status: 'success', data: sanitizeInterviewForClient(interview) });
    } catch (err) {
        logSystemError(err, `GET /api/interviews/${id}`);
        res.status(500).json({ status: 'error', error: err.message });
    }
});

// 3. Створити інтерв'ю
app.post('/api/interviews', async (req, res) => {
    const token = req.headers.authorization?.split(' ')[1];
    const { title, status, transcript_data, workspace_id: bodyWorkspaceId, type } = req.body;
    if (!token) return res.status(401).json({ status: 'error', message: 'Unauthorized' });

    try {
        const { data: { user }, error: authError } = await supabase.auth.getUser(token);
        if (authError || !user) return res.status(401).json({ status: 'error', message: 'Invalid token' });

        let workspace = null;
        if (bodyWorkspaceId) {
            const allowed = await getAccessibleWorkspaceIds(user.id);
            if (allowed.includes(bodyWorkspaceId)) workspace = { id: bodyWorkspaceId };
        }
        if (!workspace) workspace = await getCurrentWorkspaceForUser(user.id);
        if (!workspace) return res.status(403).json({ status: 'error', message: 'Create or join a workspace first' });

        // PLAN LIMIT CHECK
        const planLimits = await getWorkspacePlanAndLimits(workspace.id);
        if (planLimits && planLimits.maxInterviews != null && (planLimits.usage.interviews >= planLimits.maxInterviews)) {
            return res.status(403).json({
                status: 'error',
                code: 'LIMIT_REACHED',
                limit: 'interviews',
                message: `Your current plan allows up to ${planLimits.maxInterviews} interviews.`
            });
        }

        const { data, error } = await supabaseAdmin.from('interviews').insert([{
            title: title || 'New Interview',
            status: status || 'draft',
            type: type || 'live',
            transcript_data: transcript_data || [],
            workspace_id: workspace.id,
            user_id: user.id
        }]).select().single();

        if (error) throw error;
        try {
            const usageResult = await incrementWorkspaceInterviewUsage(workspace.id);
            if (!usageResult.persisted) {
                console.warn(`Interview usage counter is not available yet for workspace ${workspace.id}; falling back to current row count until migration is applied.`);
            }
        } catch (usageError) {
            await logSystemError(usageError, 'POST /api/interviews increment usage');
            const rollbackResult = await supabaseAdmin
                .from('interviews')
                .delete()
                .eq('id', data.id);
            if (rollbackResult.error) {
                await logSystemError(rollbackResult.error, 'POST /api/interviews rollback after usage increment failure');
            }
            return res.status(500).json({
                status: 'error',
                error: 'Failed to reserve interview quota. Please try again.',
            });
        }
        res.status(201).json({ status: 'success', data });
    } catch (err) {
        logSystemError(err, 'POST /api/interviews');
        res.status(500).json({ status: 'error', error: err.message });
    }
});

// 4. Оновити інтерв'ю
app.put('/api/interviews/:id', async (req, res) => {
    const token = req.headers.authorization?.split(' ')[1];
    const { id } = req.params;
    const { title, status, transcript_data, summary_data, type } = req.body;
    if (!token) return res.status(401).json({ status: 'error', message: 'Unauthorized' });

    try {
        const { data: { user }, error: authError } = await supabase.auth.getUser(token);
        if (authError || !user) return res.status(401).json({ status: 'error', message: 'Invalid token' });

        const { data: existing, error: fetchErr } = await supabaseAdmin.from('interviews').select('id, workspace_id').eq('id', id).single();
        if (fetchErr || !existing) return res.status(404).json({ status: 'error', message: 'Interview not found' });
        
        const workspaceIds = await getAccessibleWorkspaceIds(user.id);
        if (!workspaceIds.includes(existing.workspace_id)) return res.status(403).json({ status: 'error', message: 'Access denied' });

        const updates = { updated_at: new Date().toISOString() };
        if (title !== undefined) updates.title = title;
        if (status !== undefined) updates.status = status;
        if (type !== undefined) updates.type = type;
        if (transcript_data !== undefined) updates.transcript_data = transcript_data;
        if (summary_data !== undefined) updates.summary_data = summary_data;

        const { data, error } = await supabaseAdmin.from('interviews').update(updates).eq('id', existing.id).select().single();
        if (error) throw error;
        res.json({ status: 'success', data });
    } catch (err) {
        logSystemError(err, `PUT /api/interviews/${id}`);
        res.status(500).json({ status: 'error', error: err.message });
    }
});

// 5. Видалити інтерв'ю
app.delete('/api/interviews/:id', async (req, res) => {
    const token = req.headers.authorization?.split(' ')[1];
    const { id } = req.params;
    if (!token) return res.status(401).json({ status: 'error', message: 'Unauthorized' });

    try {
        const { data: { user }, error: authError } = await supabase.auth.getUser(token);
        if (authError || !user) return res.status(401).json({ status: 'error', message: 'Invalid token' });

        const { data: existing, error: fetchErr } = await supabaseAdmin.from('interviews').select('id, workspace_id, user_id').eq('id', id).single();
        if (fetchErr || !existing) return res.status(404).json({ status: 'error', message: 'Interview not found' });

        const workspaceIds = await getAccessibleWorkspaceIds(user.id);
        if (!workspaceIds.includes(existing.workspace_id)) return res.status(403).json({ status: 'error', message: 'Access denied' });

        const isCreator = existing.user_id === user.id;
        const { data: ws } = await supabaseAdmin.from('workspaces').select('owner_id').eq('id', existing.workspace_id).maybeSingle();
        const isOwner = ws && ws.owner_id === user.id;
        console.log(`Delete Int. Check: isCreator=${isCreator}, isOwner=${isOwner}, user_id=${existing.user_id}, currentUser=${user.id}`);
        if (!isCreator && !isOwner) {
            console.log(`Delete Int. Error: 403 Access Denied. User is not owner or creator.`);
            return res.status(403).json({ status: 'error', message: 'Only creator or owner can delete' });
        }

        const { error } = await supabaseAdmin.from('interviews').delete().eq('id', id);
        if (error) {
            console.error("Supabase delete returned error:", error);
            throw error;
        }
        res.json({ status: 'success', message: 'Interview deleted successfully' });
    } catch (err) {
        logSystemError(err, `DELETE /api/interviews/${id}`);
        res.status(500).json({ status: 'error', error: err.message });
    }
});

// 6. Згенерувати AI Саммарі (Заглушка/Mock)
app.post('/api/interviews/:id/generate-summary', async (req, res) => {
    const token = req.headers.authorization?.split(' ')[1];
    const { id } = req.params;
    if (!token) return res.status(401).json({ status: 'error', message: 'Unauthorized' });

    try {
        const { data: { user }, error: authError } = await supabase.auth.getUser(token);
        if (authError || !user) return res.status(401).json({ status: 'error', message: 'Invalid token' });

        const { data: existing, error: fetchErr } = await supabaseAdmin.from('interviews').select('id, workspace_id, transcript_data, summary_data').eq('id', id).single();
        if (fetchErr || !existing) return res.status(404).json({ status: 'error', message: 'Interview not found' });

        const workspaceIds = await getAccessibleWorkspaceIds(user.id);
        if (!workspaceIds.includes(existing.workspace_id)) return res.status(403).json({ status: 'error', message: 'Access denied' });

        if (!existing.transcript_data || existing.transcript_data.length === 0) {
            return res.status(400).json({ status: 'error', message: 'No transcript data found for this interview.' });
        }

        const summaryRequest = resolveInterviewSummaryRequest(req.body || {});
        const { preset, selectedSections, mergeMode } = summaryRequest;

        // 1. Initialize Gemini API
        if (!process.env.GEMINI_API_KEY) {
             throw new Error("GEMINI_API_KEY is not configured on the server.");
        }
        const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
        // We use gemini-using-pro for complex reasoning and json output
        const model = genAI.getGenerativeModel({ model: "gemini-2.5-pro" });

        // 2. Format the transcript for the prompt
        const conversationText = existing.transcript_data.map(
             line => `[${line.timestamp}] ${line.speaker}: ${line.text}`
        ).join('\n');

        // 3. Construct the prompt
        const prompt = buildInterviewSummaryPrompt({ conversationText, selectedSections });

        // 4. Call Gemini
        const result = await model.generateContent(prompt);
        const responseText = result.response.text();

        // 5. Parse the JSON response
        let aiSummaryData;
        try {
            const cleanJsonString = cleanModelJson(responseText);
            aiSummaryData = normalizeInterviewSummaryData(JSON.parse(cleanJsonString));
        } catch (parseError) {
            console.error("Failed to parse Gemini response as JSON:", responseText);
            throw new Error("AI returned an invalid response format.");
        }

        if (!aiSummaryData) {
            throw new Error("AI returned an empty or unsupported summary format.");
        }

        if (mergeMode === 'merge_selected') {
            aiSummaryData = mergeInterviewSummarySections(existing.summary_data, aiSummaryData, selectedSections);
        }

        aiSummaryData = withInterviewSystemState(
            aiSummaryData,
            buildInterviewSummarySystemState(
                getInterviewSystemState(existing.summary_data),
                {
                    provider: 'gemini',
                    model: 'gemini-2.5-pro',
                    preset,
                    selectedSections,
                    mergeMode,
                }
            )
        );

        const { data, error } = await supabaseAdmin.from('interviews')
            .update({ summary_data: aiSummaryData, updated_at: new Date().toISOString() })
            .eq('id', existing.id)
            .select()
            .single();

        if (error) throw error;
        
        res.json({ status: 'success', data });
    } catch (err) {
        logSystemError(err, `POST /api/interviews/${id}/generate-summary`);
        res.status(500).json({ status: 'error', error: err.message });
    }
});

const upload = multer({ dest: 'uploads/' });
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const safeDeleteFile = (filePath) => {
    if (!filePath) return;
    try {
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
        }
    } catch (err) {
        console.warn(`Failed to delete temp file ${filePath}:`, err.message);
    }
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
        const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
            },
            body: createForm(responseFormat),
        });

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

const processInterviewAudioUpload = async ({ interviewId, file }) => {
    let geminiFileId = null;
    let fileManager = null;
    let transcriptionSystemState = null;

    try {
        let newTranscriptData;
        if (process.env.OPENAI_API_KEY) {
            const openAiResult = await transcribeAudioWithOpenAI(file);
            newTranscriptData = openAiResult.transcript;
            transcriptionSystemState = {
                ...openAiResult.systemState,
                uploadStatus: 'completed',
            };
            console.info('[interview-upload] completed with OpenAI transcription', {
                interviewId,
                model: transcriptionSystemState.model,
                provider: transcriptionSystemState.provider,
                responseFormat: transcriptionSystemState.responseFormat,
                usedFallbackSegmentation: transcriptionSystemState.usedFallbackSegmentation,
                transcriptTurns: Array.isArray(newTranscriptData) ? newTranscriptData.length : 0,
            });
        } else {
            if (!process.env.GEMINI_API_KEY) {
                throw new Error("Neither OPENAI_API_KEY nor GEMINI_API_KEY is configured.");
            }

            fileManager = new GoogleAIFileManager(process.env.GEMINI_API_KEY);
            const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
            const model = genAI.getGenerativeModel({ model: "gemini-2.5-pro" });

            const uploadResponse = await fileManager.uploadFile(file.path, {
                mimeType: file.mimetype,
                displayName: file.originalname,
            });
            geminiFileId = uploadResponse.file.name;

            let fileStatus = await fileManager.getFile(geminiFileId);
            while (fileStatus.state === "PROCESSING") {
                await sleep(5000);
                fileStatus = await fileManager.getFile(geminiFileId);
            }

            if (fileStatus.state === "FAILED") {
                throw new Error("Audio processing failed on Gemini servers.");
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
                        fileUri: uploadResponse.file.uri
                    }
                },
                { text: prompt },
            ]);

            const responseText = result.response.text();

            try {
                const cleanJsonString = responseText.replace(/^```json\s*/, '').replace(/\s*```$/, '').trim();
                newTranscriptData = JSON.parse(cleanJsonString);

                if (!Array.isArray(newTranscriptData)) {
                    throw new Error("Parsed data is not an array");
                }
            } catch (e) {
                console.error("Transcription parse error:", e);
                console.error("Raw response:", responseText);
                throw new Error("AI returned an invalid transcript format.");
            }

            transcriptionSystemState = {
                ...buildInterviewTranscriptionSystemState({
                    provider: 'gemini',
                    model: 'gemini-2.5-pro',
                    durationSeconds: null,
                    file,
                    responseFormat: 'custom_json_array',
                    usedFallbackSegmentation: false,
                }),
                uploadStatus: 'completed',
            };
        }

        if (!Array.isArray(newTranscriptData) || newTranscriptData.length === 0) {
            throw new Error('The transcription provider returned an empty transcript.');
        }

        const { error } = await supabaseAdmin.from('interviews')
            .update({
                transcript_data: newTranscriptData,
                summary_data: withInterviewSystemState(null, transcriptionSystemState),
                status: 'completed',
                updated_at: new Date().toISOString()
            })
            .eq('id', interviewId);

        if (error) throw error;
    } catch (err) {
        logSystemError(err, `ASYNC interview upload ${interviewId}`);
        const { data: latestInterview } = await supabaseAdmin
            .from('interviews')
            .select('summary_data')
            .eq('id', interviewId)
            .maybeSingle();

        await updateInterviewStatusCompat(
            interviewId,
            'failed',
            {
                upload_error_message: err.message || INTERVIEW_UPLOAD_ERROR_FALLBACK,
                summary_data: withInterviewSystemState(latestInterview?.summary_data ?? null, transcriptionSystemState),
            },
            latestInterview?.summary_data ?? null
        );
    } finally {
        safeDeleteFile(file.path);

        if (fileManager && geminiFileId) {
            try {
                await fileManager.deleteFile(geminiFileId);
            } catch (cleanupErr) {
                console.warn("Could not delete file from Google AI Studio:", cleanupErr.message);
            }
        }
    }
};

// 7. Upload Audio and Transcribe
app.post('/api/interviews/:id/upload-audio', upload.single('audio'), async (req, res) => {
    const token = req.headers.authorization?.split(' ')[1];
    const { id } = req.params;
    
    if (!token) return res.status(401).json({ status: 'error', message: 'Unauthorized' });
    if (!req.file) return res.status(400).json({ status: 'error', message: 'No audio file uploaded.' });

    try {
        const { data: { user }, error: authError } = await supabase.auth.getUser(token);
        if (authError || !user) return res.status(401).json({ status: 'error', message: 'Invalid token' });

        const { data: existing, error: fetchErr } = await supabaseAdmin.from('interviews')
            .select('*')
            .eq('id', id).single();
            
        if (fetchErr || !existing) return res.status(404).json({ status: 'error', message: 'Interview not found' });

        const workspaceIds = await getAccessibleWorkspaceIds(user.id);
        if (!workspaceIds.includes(existing.workspace_id)) return res.status(403).json({ status: 'error', message: 'Access denied' });

        if (existing.status === 'processing') {
            safeDeleteFile(req.file.path);
            return res.status(409).json({ status: 'error', error: 'Transcription is already in progress for this interview.' });
        }

        const processingPayload = {
            transcript_data: [],
            summary_data: null,
            updated_at: new Date().toISOString()
        };

        const { data: updatedInterview } = await updateInterviewStatusCompat(
            existing.id,
            'processing',
            processingPayload,
            existing.summary_data ?? null
        );

        const uploadFile = {
            path: req.file.path,
            mimetype: req.file.mimetype,
            originalname: req.file.originalname,
        };

        setImmediate(() => {
            processInterviewAudioUpload({
                interviewId: existing.id,
                file: uploadFile,
            }).catch((backgroundErr) => {
                logSystemError(backgroundErr, `ASYNC interview upload dispatch ${existing.id}`);
            });
        });

        res.status(202).json({ status: 'accepted', data: updatedInterview });
    } catch (err) {
        logSystemError(err, `POST /api/interviews/${id}/upload-audio`);
        safeDeleteFile(req.file?.path);
        res.status(500).json({ status: 'error', error: err.message });
    }
});

// Налаштування для роздачі статики в продакшені (Клієнт і Адмінка)
if (process.env.NODE_ENV === 'production') {
    const path = require('path');
    
    // 1. Статика Клієнта (головний домен)
    app.use(express.static(path.join(__dirname, 'public/client')));
    
    // 2. Статика Адмінки (шлях /admin)
    app.use('/admin', express.static(path.join(__dirname, 'public/admin')));

    // 3. Fallback для React Router Адмінки
    app.get('/admin/*', (req, res) => {
        res.sendFile(path.join(__dirname, 'public/admin/index.html'));
    });

    // 4. Fallback для React Router Клієнта (ВИКЛЮЧАЮЧИ /api)
    app.get('*', (req, res, next) => {
        if (req.path.startsWith('/api/')) {
            return next(); // Передає управління наступному middleware (404 для API)
        }
        res.sendFile(path.join(__dirname, 'public/client/index.html'));
    });
}

// Усі незбіги маршрутів (для API, або якщо не продакшен) — JSON 404 (щоб клієнт отримував JSON)
app.use((req, res) => {
    res.status(404).json({
        error: 'Route not found',
        message: `${req.method} ${req.path} is not registered on this server.`,
        path: req.path,
    });
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
