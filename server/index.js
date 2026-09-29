const {
    INTERVIEW_SYSTEM_KEY,
    isPlainObject,
    getInterviewSystemState,
    withInterviewSystemState,
    cleanModelJson,
    cleanString,
    normalizeEnum,
    normalizeStringArray,
    normalizeInterviewSummaryData,
    DEFAULT_SUMMARY_MODEL,
    SummaryService,
} = require('./modules/interviews/summary');
const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const path = require('path');
const { spawn } = require('child_process');
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { GoogleAIFileManager } = require('@google/generative-ai/server');
const multer = require('multer');
const fs = require('fs');
const ffmpegStaticPath = require('ffmpeg-static');
const { encrypt, decrypt } = require('./integrations/encrypt');
const googleSheets = require('./integrations/googleSheets');
const { getIntegrationProvider, getIntegrationProviders } = require('./integrations/providerRegistry');
const { mapRowsToMetric } = require('./integrations/mapRowsToMetric');
const { initMetricAutoSyncScheduler } = require('./jobs/metricAutoSync');
const { createExportToken, verifyExportToken } = require('./exportToken');
const rawSupabase = require('./supabaseClient');
const rawSupabaseAdmin = rawSupabase.supabaseAdmin || rawSupabase;
const { readProductFlags, createLegacyDataClient, verifyProductScope } = require('./productScope');
const productFlags = readProductFlags({
    ...process.env,
    PRODUCT_SCOPE_ENABLED: process.env.PRODUCT_SCOPE_ENABLED ?? 'true',
    RESEARCH_ENABLED: process.env.RESEARCH_ENABLED ?? 'true',
});
const researchJobsEnabled = productFlags.researchEnabled && process.env.RESEARCH_JOBS_ENABLED !== 'false';
const supabase = createLegacyDataClient(rawSupabase, { enabled: productFlags.productScopeEnabled });
const supabaseAdmin = createLegacyDataClient(rawSupabaseAdmin, { enabled: productFlags.productScopeEnabled });
const { createResearchRouter } = require('./modules/research/router');
const { createResearchJobsRouter } = require('./modules/research/jobs/router');
const { createResearchMediaRouter } = require('./modules/research/media');
const { createResearchStorage } = require('./modules/research/media/storage');
const { createResearchAdminRouter } = require('./modules/research/admin/router');
const { createResearchTeamRouter } = require('./modules/research/team/router');
const { loadAdminUserDetails } = require('./modules/access/adminDetails');
const rateLimit = require('express-rate-limit');
const {
    assertWorkspaceFeatureLimit,
    getWorkspacePlanAndLimits,
    incrementWorkspaceInterviewUsage,
    reserveWorkspaceQuotaUsage,
} = require('./billing/entitlements');

const { createTranscriptionService } = require('./modules/interviews/transcription');
const {
    prepareInterviewUploadForTranscription,
    getInterviewUploadExtension,
    transcribeAudioWithProviderFallback,
    serializeErrorForLog,
} = createTranscriptionService({ logSystemEvent });

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
const RESEARCH_ORIGIN = (process.env.RESEARCH_ORIGIN || 'https://research.iterojm.com').replace(/\/$/, '');
const RESEARCH_HOST = new URL(RESEARCH_ORIGIN).hostname;
const ADMIN_ORIGIN = (process.env.ADMIN_ORIGIN || 'https://admin.iterojm.com').replace(/\/$/, '');
const ADMIN_HOST = (() => {
  try {
    return new URL(ADMIN_ORIGIN).host;
  } catch {
    return 'admin.iterojm.com';
  }
})();

const APP_ROUTE_PREFIXES = ['/auth', '/dashboard', '/journeys', '/journey', '/personas', '/portraits', '/metrics', '/interviews', '/materials', '/settings', '/archive', '/export'];
const isAppRoutePath = (path = '/') => APP_ROUTE_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}/`));

const PADDLE_PRICE_CONFIG = Object.freeze({
  Pro: {
    productId: process.env.PADDLE_PRO_PRODUCT_ID || null,
    monthlyPriceId: process.env.PADDLE_PRO_PRICE_ID_MONTHLY || null,
    yearlyPriceId: process.env.PADDLE_PRO_PRICE_ID_YEARLY || null,
  },
  Enterprise: {
    productId: process.env.PADDLE_ENTERPRISE_PRODUCT_ID || null,
    monthlyPriceId: process.env.PADDLE_ENTERPRISE_PRICE_ID_MONTHLY || null,
    yearlyPriceId: process.env.PADDLE_ENTERPRISE_PRICE_ID_YEARLY || null,
  },
});

function enrichPlanWithPaddleConfig(plan) {
  const paddle = PADDLE_PRICE_CONFIG[plan?.name] || {};
  return {
    ...plan,
    paddle_product_id: paddle.productId || null,
    paddle_price_id_monthly: paddle.monthlyPriceId || null,
    paddle_price_id_yearly: paddle.yearlyPriceId || null,
  };
}

function resolvePaddlePlanConfigByPriceId(priceId) {
  if (!priceId) return null;

  const normalizedPriceId = String(priceId);

  for (const [planName, config] of Object.entries(PADDLE_PRICE_CONFIG)) {
    if (config.monthlyPriceId === normalizedPriceId) {
      return {
        planName,
        billingInterval: 'monthly',
        ...config,
      };
    }

    if (config.yearlyPriceId === normalizedPriceId) {
      return {
        planName,
        billingInterval: 'yearly',
        ...config,
      };
    }
  }

  return null;
}

function parsePaddleSignatureHeader(headerValue) {
  if (!headerValue) return { timestamp: null, signatures: [] };

  const pairs = String(headerValue)
    .split(/[;,]/)
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const [key, ...valueParts] = part.split('=');
      return [key, valueParts.join('=')];
    });

  const timestamp = pairs.find(([key]) => key === 'ts')?.[1] || null;
  const signatures = pairs
    .filter(([key]) => key === 'h1')
    .map(([, value]) => value)
    .filter(Boolean);

  return { timestamp, signatures };
}

function verifyPaddleSignature(rawBody, signatureHeader, secret) {
  if (!secret) throw new Error('PADDLE_WEBHOOK_SECRET is not configured.');
  if (!rawBody || !Buffer.isBuffer(rawBody)) return false;

  const { timestamp, signatures } = parsePaddleSignatureHeader(signatureHeader);
  if (!timestamp || signatures.length === 0) return false;

  const payload = `${timestamp}:${rawBody.toString('utf8')}`;
  const expectedSignature = crypto.createHmac('sha256', secret).update(payload).digest('hex');
  const expectedBuffer = Buffer.from(expectedSignature, 'utf8');

  return signatures.some((signature) => {
    const receivedBuffer = Buffer.from(signature, 'utf8');
    return receivedBuffer.length === expectedBuffer.length && crypto.timingSafeEqual(expectedBuffer, receivedBuffer);
  });
}

function normalizePaddleSubscriptionStatus(status) {
  switch (String(status || '').toLowerCase()) {
    case 'active':
    case 'trialing':
      return 'active';
    case 'past_due':
    case 'paused':
    case 'canceled':
      return 'canceled';
    default:
      return 'canceled';
  }
}

function extractPaddleBillingWindow(subscriptionData = {}, billingInterval = null) {
  const billingPeriod = subscriptionData.current_billing_period || {};
  const currentPeriodStart = billingPeriod.starts_at || subscriptionData.started_at || new Date().toISOString();
  let currentPeriodEnd = billingPeriod.ends_at || null;

  if (!currentPeriodEnd && billingInterval) {
    const fallbackEnd = new Date(currentPeriodStart);
    if (!Number.isNaN(fallbackEnd.getTime())) {
      if (billingInterval === 'yearly') {
        fallbackEnd.setFullYear(fallbackEnd.getFullYear() + 1);
      } else {
        fallbackEnd.setMonth(fallbackEnd.getMonth() + 1);
      }
      currentPeriodEnd = fallbackEnd.toISOString();
    }
  }

  return {
    currentPeriodStart,
    currentPeriodEnd,
  };
}

function isSameTimestamp(left, right) {
  if (!left && !right) return true;
  if (!left || !right) return false;

  const leftDate = new Date(left);
  const rightDate = new Date(right);
  if (!Number.isNaN(leftDate.getTime()) && !Number.isNaN(rightDate.getTime())) {
    return leftDate.getTime() === rightDate.getTime();
  }

  return String(left) === String(right);
}

async function findPlanByName(planName) {
  if (!planName) return null;

  const { data, error } = await supabaseAdmin
    .from('plans')
    .select('id, name')
    .ilike('name', planName)
    .eq('is_active', true)
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data || null;
}

async function applyHostedSubscriptionForUser({
  userId,
  planId,
  status,
  currentPeriodStart,
  currentPeriodEnd,
}) {
  const normalizedStatus = normalizePaddleSubscriptionStatus(status);
  const normalizedStart = currentPeriodStart ? new Date(currentPeriodStart).toISOString() : new Date().toISOString();
  const normalizedEnd = currentPeriodEnd ? new Date(currentPeriodEnd).toISOString() : null;

  const { data: existingRows, error: existingError } = await supabaseAdmin
    .from('subscriptions')
    .select('id, user_id, plan_id, status, current_period_start, current_period_end')
    .eq('user_id', userId)
    .eq('plan_id', planId)
    .eq('status', normalizedStatus)
    .order('created_at', { ascending: false })
    .limit(5);

  if (existingError) throw existingError;

  const hasMatchingRow = (existingRows || []).some((row) =>
    String(row.plan_id) === String(planId)
    && String(row.status) === normalizedStatus
    && isSameTimestamp(row.current_period_start, normalizedStart)
    && isSameTimestamp(row.current_period_end, normalizedEnd)
  );

  if (hasMatchingRow) {
    return;
  }

  await supabaseAdmin
    .from('subscriptions')
    .update({
      status: 'canceled',
      current_period_end: normalizedEnd || new Date().toISOString(),
    })
    .eq('user_id', userId)
    .eq('status', 'active');

  const { error: insertError } = await supabaseAdmin
    .from('subscriptions')
    .insert([{
      user_id: userId,
      plan_id: planId,
      status: normalizedStatus,
      current_period_start: normalizedStart,
      current_period_end: normalizedEnd,
    }]);

  if (insertError) throw insertError;

  if (normalizedStatus === 'active') {
    const { data: activeRows, error: activeRowsError } = await supabaseAdmin
      .from('subscriptions')
      .select('id, current_period_start, current_period_end, created_at')
      .eq('user_id', userId)
      .eq('plan_id', planId)
      .eq('status', 'active')
      .order('created_at', { ascending: false });

    if (activeRowsError) throw activeRowsError;

    const [, ...duplicateRows] = (activeRows || []).filter((row) =>
      isSameTimestamp(row.current_period_start, normalizedStart)
      && isSameTimestamp(row.current_period_end, normalizedEnd)
    );

    if (duplicateRows.length > 0) {
      const duplicateIds = duplicateRows.map((row) => row.id);
      const { error: dedupeError } = await supabaseAdmin
        .from('subscriptions')
        .update({ status: 'canceled' })
        .in('id', duplicateIds);

      if (dedupeError) throw dedupeError;
    }
  }
}

function ensurePlaywrightBrowserExecutables(localBrowsersDir) {
    if (!localBrowsersDir || !fs.existsSync(localBrowsersDir)) return;

    const executableNames = new Set([
        'chrome',
        'chrome-headless-shell',
        'headless_shell',
    ]);

    const visit = (currentPath) => {
        let stat;
        try {
            stat = fs.statSync(currentPath);
        } catch {
            return;
        }

        if (stat.isDirectory()) {
            for (const entry of fs.readdirSync(currentPath)) {
                visit(path.join(currentPath, entry));
            }
            return;
        }

        if (!stat.isFile()) return;

        const basename = path.basename(currentPath);
        if (!executableNames.has(basename)) return;

        const desiredMode = stat.mode | 0o755;
        if (desiredMode !== stat.mode) {
            fs.chmodSync(currentPath, desiredMode);
        }
    };

    visit(localBrowsersDir);
}

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
  RESEARCH_ORIGIN,
  'https://www.iterojm.com',
  'https://iterojm.vercel.app',
  'https://iterojm-app.vercel.app',
  'https://iterojm-admin.vercel.app',
];

const INTERVIEW_UPLOAD_ERROR_FALLBACK = 'Transcription failed. Please try uploading again.';

const DEFAULT_OPENAI_REALTIME_TRANSCRIPTION_MODEL = 'gpt-4o-transcribe';
const OPENAI_TRANSCRIPTION_MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024;






const DEFAULT_INTERVIEW_PROCESSING_STALE_MS = 30 * 60 * 1000;
const DEFAULT_INTERVIEW_UPLOAD_MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024;









const INTERVIEW_PROCESSING_STALE_MS = (() => {
    const configuredTimeout = Number(process.env.INTERVIEW_PROCESSING_STALE_MS);
    return Number.isFinite(configuredTimeout) && configuredTimeout > 0
        ? configuredTimeout
        : DEFAULT_INTERVIEW_PROCESSING_STALE_MS;
})();
const INTERVIEW_UPLOAD_MAX_FILE_SIZE_BYTES = (() => {
    const configuredLimit = Number(process.env.INTERVIEW_UPLOAD_MAX_FILE_SIZE_BYTES);
    return Number.isFinite(configuredLimit) && configuredLimit > 0
        ? configuredLimit
        : DEFAULT_INTERVIEW_UPLOAD_MAX_FILE_SIZE_BYTES;
})();
const ALLOWED_INTERVIEW_UPLOAD_EXTENSIONS = new Set(['.mp3', '.wav', '.m4a', '.mp4', '.webm']);
const ALLOWED_INTERVIEW_UPLOAD_MIME_TYPES = new Set([
    'audio/mpeg',
    'audio/mp3',
    'audio/wav',
    'audio/x-wav',
    'audio/wave',
    'audio/vnd.wave',
    'audio/mp4',
    'audio/x-m4a',
    'audio/m4a',
    'audio/webm',
    'video/webm',
    'video/mp4',
]);
function buildInterviewPortraitPrompt({ interviewTitles, conversationText, summaryContext }) {
    const summaryJson = summaryContext ? JSON.stringify(summaryContext, null, 2) : 'null';
    const titlesBlock = Array.isArray(interviewTitles) && interviewTitles.length > 0
        ? interviewTitles.map((title, index) => `${index + 1}. ${title || 'Untitled interview'}`).join('\n')
        : '1. Untitled interview';

    return `You are a senior JTBD strategist and customer research lead.
Your task is to create ONE progress-driven customer portrait from a set of interviews.

This portrait is not a demographic persona.
It must describe how this customer moves toward progress using the Forces of Progress methodology:
- pushes
- pulls
- anxieties
- habits

CRITICAL RULES:
- Detect the dominant language of the source material and write the entire output in that same language.
- Base every conclusion only on evidence from the transcript or structured summary.
- Prefer the structured summary when it is present, but use the transcript as the final source of truth.
- Synthesize repeatable patterns across the full interview set, not one-off anecdotes.
- Do not invent demographics, job titles, company facts, budgets, or behaviors that are not supported.
- Keep the portrait actionable for product, research, and messaging teams.
- If something is unclear, prefer an empty string or empty array instead of guessing.
- Return only JSON.

Return EXACTLY one valid JSON object with this schema:
{
  "title": "string",
  "archetype": "string",
  "summary": "string",
  "jobToBeDone": "string",
  "progressMoment": "string",
  "decisionStyle": "string",
  "dominantForce": "pushes|pulls|anxieties|habits|balanced",
  "forcesOfProgress": {
    "pushes": ["string"],
    "pulls": ["string"],
    "anxieties": ["string"],
    "habits": ["string"]
  },
  "personalityTraits": ["string"],
  "opportunityAngles": ["string"],
  "evidenceQuotes": ["string"]
}

LIMITS:
- title: 2 to 6 words
- archetype: 2 to 4 words
- summary: 1 concise paragraph
- pushes/pulls/anxieties/habits: up to 5 each
- personalityTraits: up to 5
- opportunityAngles: up to 5
- evidenceQuotes: up to 3

Interview set:
${titlesBlock}

Structured summary context:
${summaryJson}

Transcript:
"""
${conversationText}
"""`;
}

function buildInterviewPortraitSystemState({ provider, model, sourceInterviewId, sourceInterviewIds }) {
    return {
        portraitGeneration: {
            provider,
            model,
            sourceInterviewId,
            sourceInterviewIds: Array.isArray(sourceInterviewIds) ? sourceInterviewIds : (sourceInterviewId ? [sourceInterviewId] : []),
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

function parseIsoDateMs(value) {
    if (typeof value !== 'string' || !value.trim()) return null;
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : null;
}

function getInterviewProcessingStartedAtMs(interview) {
    const systemState = getInterviewSystemState(interview?.summary_data);
    return (
        parseIsoDateMs(systemState.startedAt)
        ?? parseIsoDateMs(interview?.updated_at)
        ?? parseIsoDateMs(interview?.created_at)
    );
}

function isInterviewProcessingStale(interview) {
    if (!interview || getEffectiveInterviewStatus(interview) !== 'processing') return false;
    const transcriptData = Array.isArray(interview.transcript_data) ? interview.transcript_data : [];
    if (transcriptData.length > 0) return false;

    const startedAtMs = getInterviewProcessingStartedAtMs(interview);
    if (!Number.isFinite(startedAtMs)) return false;

    return Date.now() - startedAtMs > INTERVIEW_PROCESSING_STALE_MS;
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

    if (nextStatus === 'failed') {
        const currentSummaryData = extraUpdates.summary_data !== undefined
            ? extraUpdates.summary_data
            : existingSummaryData;
        const currentSystemState = getInterviewSystemState(currentSummaryData);
        const failedSystemState = {
            ...currentSystemState,
            uploadStatus: 'failed',
            uploadError: extraUpdates.upload_error_message || INTERVIEW_UPLOAD_ERROR_FALLBACK,
            failedAt: new Date().toISOString(),
        };

        basePayload.summary_data = withInterviewSystemState(currentSummaryData, failedSystemState);
    }

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

    const currentSummaryData = extraUpdates.summary_data !== undefined
        ? extraUpdates.summary_data
        : (existingSummaryData !== null ? existingSummaryData : null);
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

function mapLearningMaterialListItem(material) {
    if (!material) return material;
    return {
        id: material.id,
        slug: material.slug,
        locale: material.locale || 'uk',
        title: material.title,
        subtitle: material.subtitle || '',
        excerpt: material.excerpt || '',
        category: material.category || 'Playbook',
        cover_image_url: material.cover_image_url || '',
        author_name: material.author_name || 'IteroJM Team',
        reading_time_minutes: material.reading_time_minutes ?? null,
        hero_tone: material.hero_tone || 'cobalt',
        featured: !!material.featured,
        published_at: material.published_at || null,
        created_at: material.created_at || null,
        updated_at: material.updated_at || null,
    };
}

function mapSupportNewsItem(news, readNewsIds = new Set()) {
    if (!news) return news;
    return {
        id: news.id,
        locale: news.locale || 'uk',
        title: news.title,
        subtitle: news.subtitle || '',
        summary: news.summary || '',
        body_html: news.body_html || '',
        cover_image_url: news.cover_image_url || '',
        tone: news.tone || 'cobalt',
        status: news.status || 'draft',
        pinned: !!news.pinned,
        published_at: news.published_at || null,
        created_at: news.created_at || null,
        updated_at: news.updated_at || null,
        is_read: readNewsIds.has(news.id),
    };
}

function resolveContentLocale(req) {
    const rawLocale = String(req?.query?.locale || req?.headers?.['x-iterojm-locale'] || '').trim().toLowerCase();
    if (rawLocale.startsWith('en')) return 'en';
    if (rawLocale.startsWith('uk') || rawLocale.startsWith('ua')) return 'uk';
    return 'uk';
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

app.post('/api/webhooks/paddle', express.raw({ type: 'application/json' }), async (req, res) => {
    const secret = process.env.PADDLE_WEBHOOK_SECRET;
    if (!secret) {
        console.error('PADDLE_WEBHOOK_SECRET is not set');
        return res.status(500).json({ error: 'Webhook not configured' });
    }

    const rawBody = req.body;
    if (!rawBody || !Buffer.isBuffer(rawBody)) {
        return res.status(400).json({ error: 'Invalid body' });
    }

    const signature = req.get('Paddle-Signature');
    if (!signature) {
        return res.status(401).json({ error: 'Missing Paddle-Signature' });
    }

    if (!verifyPaddleSignature(rawBody, signature, secret)) {
        return res.status(401).json({ error: 'Invalid signature' });
    }

    let payload;
    try {
        payload = JSON.parse(rawBody.toString('utf8'));
    } catch (error) {
        return res.status(400).json({ error: 'Invalid JSON' });
    }

    const eventType = payload?.event_type;
    const subscriptionData = payload?.data || {};
    const customData = subscriptionData.custom_data || {};
    const subscriptionItems = Array.isArray(subscriptionData.items) ? subscriptionData.items : [];
    const firstPriceId = subscriptionItems[0]?.price?.id || null;
    const planConfig = resolvePaddlePlanConfigByPriceId(firstPriceId);

    if (!planConfig) {
        return res.status(200).json({ ok: true, message: 'Price not mapped' });
    }

    const userId = customData.user_id || null;
    if (!userId) {
        console.warn('Paddle webhook: missing custom_data.user_id for event', eventType);
        return res.status(200).json({ ok: true, message: 'User not resolved' });
    }

    const planRow = await findPlanByName(planConfig.planName);
    if (!planRow) {
        console.warn('Paddle webhook: no plan found for mapped name', planConfig.planName);
        return res.status(200).json({ ok: true, message: 'Plan not found' });
    }

    const { currentPeriodStart, currentPeriodEnd } = extractPaddleBillingWindow(subscriptionData, planConfig.billingInterval);

    try {
        switch (eventType) {
            case 'subscription.created':
            case 'subscription.activated':
            case 'subscription.updated':
            case 'subscription.resumed':
            case 'subscription.paused':
            case 'subscription.past_due':
            case 'subscription.canceled':
                await applyHostedSubscriptionForUser({
                    userId,
                    planId: planRow.id,
                    status: subscriptionData.status,
                    currentPeriodStart,
                    currentPeriodEnd,
                });
                return res.status(200).json({ ok: true });
            case 'transaction.completed':
            case 'transaction.paid':
            case 'transaction.payment_failed':
                return res.status(200).json({ ok: true, message: 'Transaction event acknowledged' });
            default:
                return res.status(200).json({ ok: true, message: 'Event ignored' });
        }
    } catch (error) {
        console.error('Paddle webhook processing failed:', error);
        return res.status(500).json({ error: 'Failed to process webhook' });
    }
});

app.use('/api/admin/research', express.json({ limit: '100kb' }), createResearchAdminRouter({
    supabaseAdmin: rawSupabaseAdmin, authenticate: getAuthenticatedUserFromToken, enabled: productFlags.researchEnabled,
    onError: error => console.error('[Research admin]', error?.code || 'REQUEST_FAILED'),
}));
app.use('/api/research', express.json({ limit: '3mb' }), createResearchTeamRouter({
    supabaseAdmin: rawSupabaseAdmin, authenticate: getAuthenticatedUserFromToken, enabled: productFlags.researchEnabled,
}), createResearchMediaRouter({
    supabaseAdmin: rawSupabaseAdmin, authenticate: getAuthenticatedUserFromToken,
    storage: createResearchStorage(rawSupabaseAdmin),
    enabled: researchJobsEnabled && process.env.RESEARCH_MEDIA_ENABLED === 'true',
    onError: error => console.error('[Research media]', error?.code || 'REQUEST_FAILED'),
}), createResearchJobsRouter({
    supabaseAdmin: rawSupabaseAdmin,
    authenticate: getAuthenticatedUserFromToken,
    enabled: researchJobsEnabled,
    onError: (error) => console.error('[Research jobs]', error?.code || 'REQUEST_FAILED'),
}), createResearchRouter({
    supabaseAdmin: rawSupabaseAdmin,
    authenticate: getAuthenticatedUserFromToken,
    enabled: productFlags.researchEnabled,
    onError: (error) => console.error('Research API error:', error.code || 'RESEARCH_ERROR'),
}));
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
async function logSystemEvent(level, message, details = {}) {
    try {
        const { error: insertError } = await supabaseAdmin.from('system_logs').insert([{
            level,
            message,
            details
        }]);
        if (insertError) throw insertError;
    } catch (e) {
        console.error('Failed to log system event to DB:', e);
    }
}

async function logSystemError(error, context = '') {
    await logSystemEvent('error', error.message || 'Unknown error', {
        ...serializeErrorForLog(error),
        context,
    });
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
    const { count: historicalCount } = await supabaseAdmin
        .from('subscriptions')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId);
    if ((historicalCount ?? 0) > 0) return;
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

        const exportLimitCheck = await assertWorkspaceFeatureLimit(journey.workspace_id, 'exports');
        if (!exportLimitCheck.allowed) {
            return res.status(403).json(exportLimitCheck.error);
        }

        await reserveWorkspaceQuotaUsage(journey.workspace_id, 'exports', {
            entitlements: exportLimitCheck.entitlements,
        });

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
                ensurePlaywrightBrowserExecutables(localBrowsersDir);
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

        const journeyLimitCheck = await assertWorkspaceFeatureLimit(workspace.id, 'journeys');
        if (!journeyLimitCheck.allowed) {
            return res.status(403).json(journeyLimitCheck.error);
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

    const personaLimitCheck = await assertWorkspaceFeatureLimit(workspace.id, 'personas');
    if (!personaLimitCheck.allowed) {
      return res.status(403).json(personaLimitCheck.error);
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

// --- РОУТИ ДЛЯ PORTRAITS ---

app.get('/api/portraits', async (req, res) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ status: 'error', message: 'Unauthorized' });

  try {
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) return res.status(401).json({ status: 'error', message: 'Invalid token' });

    await applyPendingInvitesForUser(user.id, user.email);

    const workspaceIds = await getAccessibleWorkspaceIds(user.id);

    let query = supabaseAdmin.from('portraits').select('*');
    if (workspaceIds.length > 0) {
      query = query.in('workspace_id', workspaceIds);
    } else {
      query = query.eq('user_id', user.id);
    }

    const { data, error } = await query.order('created_at', { ascending: false });
    if (error) throw error;

    res.json({ status: 'success', data: await enrichPortraitRows(data || []) });
  } catch (err) {
    logSystemError(err, 'GET /api/portraits');
    console.error('Error fetching portraits:', err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/portraits/generate-from-interview', async (req, res) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ status: 'error', message: 'Unauthorized' });

  const requestedInterviewIds = Array.isArray(req.body?.interviewIds)
    ? req.body.interviewIds
    : [req.body?.interviewId];
  const interviewIds = [...new Set(
    requestedInterviewIds
      .map((value) => cleanString(value))
      .filter(Boolean)
  )];
  const requestedTitle = cleanString(req.body?.title);

  if (interviewIds.length === 0) {
    return res.status(400).json({ status: 'error', message: 'At least one interviewId is required.' });
  }

  try {
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) return res.status(401).json({ status: 'error', message: 'Invalid token' });

    const { data: interviews, error: fetchErr } = await supabaseAdmin
      .from('interviews')
      .select('id, title, workspace_id, transcript_data, summary_data')
      .in('id', interviewIds);

    if (fetchErr) {
      throw fetchErr;
    }

    if (!Array.isArray(interviews) || interviews.length !== interviewIds.length) {
      return res.status(404).json({ status: 'error', message: 'One or more interviews were not found' });
    }

    const workspaceIds = await getAccessibleWorkspaceIds(user.id);
    const workspaceId = interviews[0]?.workspace_id;

    if (!workspaceId || !workspaceIds.includes(workspaceId)) {
      return res.status(403).json({ status: 'error', message: 'Access denied' });
    }

    const hasMixedWorkspaces = interviews.some((interview) => interview.workspace_id !== workspaceId);
    if (hasMixedWorkspaces) {
      return res.status(400).json({ status: 'error', message: 'All interviews must belong to the same workspace.' });
    }

    const portraitLimitCheck = await assertWorkspaceFeatureLimit(workspaceId, 'portraits');
    if (!portraitLimitCheck.allowed) {
      return res.status(403).json(portraitLimitCheck.error);
    }

    const orderedInterviews = interviewIds
      .map((id) => interviews.find((interview) => interview.id === id))
      .filter(Boolean);

    const interviewContexts = orderedInterviews.map((interview) => ({
      id: interview.id,
      title: interview.title || 'Untitled interview',
      transcriptData: Array.isArray(interview.transcript_data) ? interview.transcript_data : [],
      summaryContext: normalizeInterviewSummaryData(interview.summary_data),
    }));

    const hasUsableContext = interviewContexts.some((interview) => interview.transcriptData.length > 0 || interview.summaryContext);
    if (!hasUsableContext) {
      return res.status(400).json({
        status: 'error',
        message: 'Generate transcript or summary insights for at least one selected interview first.',
      });
    }

    if (!process.env.GEMINI_API_KEY) {
      throw new Error('GEMINI_API_KEY is not configured on the server.');
    }

    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-pro' });
    const conversationText = interviewContexts
      .map((interview) => {
        const transcriptBlock = interview.transcriptData.length > 0
          ? interview.transcriptData.map(
              (line) => `[${line.timestamp}] ${line.speaker}: ${line.text}`
            ).join('\n')
          : '[No transcript available]';

        return `## Interview: ${interview.title}\n${transcriptBlock}`;
      })
      .join('\n\n');

    const summaryContext = interviewContexts
      .filter((interview) => interview.summaryContext)
      .map((interview) => ({
        interviewId: interview.id,
        interviewTitle: interview.title,
        summary: interview.summaryContext,
      }));

    const prompt = buildInterviewPortraitPrompt({
      interviewTitles: interviewContexts.map((interview) => interview.title),
      conversationText,
      summaryContext: summaryContext.length > 0 ? summaryContext : null,
    });

    const result = await model.generateContent(prompt);
    const responseText = result.response.text();

    let portraitData;
    try {
      const cleanJsonString = cleanModelJson(responseText);
      portraitData = normalizeInterviewPortraitData(JSON.parse(cleanJsonString));
    } catch (parseError) {
      console.error('Failed to parse Gemini portrait response as JSON:', responseText);
      throw new Error('AI returned an invalid portrait format.');
    }

    if (!portraitData) {
      throw new Error('AI returned an empty or unsupported portrait format.');
    }

    await reserveWorkspaceQuotaUsage(workspaceId, 'portraits', {
      entitlements: portraitLimitCheck.entitlements,
    });

    const primaryInterview = orderedInterviews[0];
    const finalTitle = requestedTitle || portraitData.title || (
      orderedInterviews.length === 1
        ? `${primaryInterview?.title || 'Interview'} portrait`
        : `Combined portrait (${orderedInterviews.length} interviews)`
    );
    const portraitPayload = withInterviewSystemState(
      {
        ...portraitData,
        title: finalTitle,
      },
      buildInterviewPortraitSystemState({
        provider: 'gemini',
        model: 'gemini-2.5-pro',
        sourceInterviewId: primaryInterview?.id || null,
        sourceInterviewIds: orderedInterviews.map((interview) => interview.id),
      })
    );

    const { data, error } = await supabaseAdmin
      .from('portraits')
      .insert([{
        workspace_id: workspaceId,
        user_id: user.id,
        source_interview_id: primaryInterview?.id || null,
        title: finalTitle,
        portrait_data: portraitPayload,
        updated_at: new Date().toISOString(),
      }])
      .select()
      .single();

    if (error) throw error;

    const [enrichedPortrait] = await enrichPortraitRows([data]);
    res.json({ status: 'success', data: enrichedPortrait });
  } catch (err) {
    logSystemError(err, 'POST /api/portraits/generate-from-interview');
    console.error('Error generating portrait:', err);
    res.status(500).json({ status: 'error', error: err.message });
  }
});

app.delete('/api/portraits/:id', async (req, res) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ status: 'error', message: 'Unauthorized' });

  const { id } = req.params;

  try {
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) return res.status(401).json({ status: 'error', message: 'Invalid token' });

    const { data: portrait } = await supabaseAdmin
      .from('portraits')
      .select('id, user_id, workspace_id')
      .eq('id', id)
      .single();

    if (!portrait) return res.status(404).json({ status: 'error', message: 'Portrait not found' });

    const workspaceIds = await getAccessibleWorkspaceIds(user.id);
    if (!workspaceIds.includes(portrait.workspace_id)) {
      return res.status(403).json({ status: 'error', message: 'Access denied' });
    }

    const isCreator = portrait.user_id === user.id;
    const { data: ws } = await supabaseAdmin.from('workspaces').select('owner_id').eq('id', portrait.workspace_id).maybeSingle();
    const isOwner = ws && ws.owner_id === user.id;
    if (!isCreator && !isOwner) {
      return res.status(403).json({ status: 'error', message: 'Only the creator or workspace owner can delete this portrait' });
    }

    const { error } = await supabaseAdmin.from('portraits').delete().eq('id', id);
    if (error) throw error;

    res.json({ status: 'success', message: 'Portrait deleted successfully' });
  } catch (err) {
    logSystemError(err, 'DELETE /api/portraits/:id');
    console.error('Error deleting portrait:', err);
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

    const metricsLimitCheck = await assertWorkspaceFeatureLimit(workspace.id, 'metrics');
    if (!metricsLimitCheck.allowed) {
      return res.status(403).json(metricsLimitCheck.error);
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
const INTEGRATION_PROVIDERS = getIntegrationProviders();
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
      const adapter = getIntegrationProvider(provider);
      if (!adapter?.refreshAccessToken) return null;
      const refreshed = await adapter.refreshAccessToken(refreshToken);
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

function getMetricConnectedUserId(metric) {
  const fromConfig = metric?.integration_config?.connected_user_id;
  return fromConfig || metric?.user_id || null;
}

function createIntegrationSyncError(message, code = 'SYNC_ERROR') {
  const error = new Error(message);
  error.code = code;
  return error;
}

async function fetchIntegrationRows(provider, accessToken, integrationConfig) {
  const adapter = getIntegrationProvider(provider);
  if (!adapter?.fetchMetricRows) {
    throw createIntegrationSyncError(`Unsupported integration provider: ${provider}`, 'UNSUPPORTED_PROVIDER');
  }

  return adapter.fetchMetricRows({
    accessToken,
    integrationConfig,
  });
}

async function syncMetricFromIntegration(metric, options = {}) {
  if (!metric) throw createIntegrationSyncError('Metric not found', 'METRIC_NOT_FOUND');

  const provider = metric.data_source;
  const integrationConfig = metric.integration_config;
  if (!integrationConfig || typeof integrationConfig !== 'object' || !INTEGRATION_PROVIDERS.includes(provider)) {
    throw createIntegrationSyncError('Metric is not linked to an integration', 'NOT_INTEGRATION');
  }

  const connectedUserId = getMetricConnectedUserId(metric);
  if (!connectedUserId) {
    throw createIntegrationSyncError('Metric has no connected integration owner', 'INTEGRATION_OWNER_MISSING');
  }

  const accessToken = await getOrRefreshIntegrationTokens(connectedUserId, provider);
  if (!accessToken) {
    throw createIntegrationSyncError('Please reconnect your account', 'INTEGRATION_DISCONNECTED');
  }

  const rows = await fetchIntegrationRows(provider, accessToken, integrationConfig);
  const updates = mapRowsToMetric(metric.type, rows);
  const updatePayload = { updated_at: new Date(), ...updates };
  const { data: updated, error } = await supabaseAdmin.from('metrics').update(updatePayload).eq('id', metric.id).select().single();
  if (error) throw error;

  if (options.onSynced) {
    await options.onSynced({ metric, updated, provider, connectedUserId });
  }

  return updated;
}

async function runNightlyMetricAutoSync() {
  const { data: metrics, error } = await supabaseAdmin
    .from('metrics')
    .select('id, name, type, data_source, integration_config, user_id, workspace_id')
    .in('data_source', INTEGRATION_PROVIDERS)
    .not('integration_config', 'is', null);

  if (error) throw error;

  const summary = {
    scanned: (metrics || []).length,
    synced: 0,
    failed: 0,
    providers: {},
    errors: [],
  };

  for (const metric of metrics || []) {
    const provider = metric.data_source;
    summary.providers[provider] = summary.providers[provider] || { synced: 0, failed: 0 };

    try {
      await syncMetricFromIntegration(metric);
      summary.synced += 1;
      summary.providers[provider].synced += 1;
    } catch (err) {
      summary.failed += 1;
      summary.providers[provider].failed += 1;
      summary.errors.push({
        metricId: metric.id,
        provider,
        error: err?.message || 'Unknown error',
      });
      logSystemError(err, `metric auto-sync ${metric.id}`);
      console.error(`[metric-auto-sync] Failed to sync metric ${metric.id}:`, err);
    }
  }

  if (summary.errors.length > 20) {
    summary.errors = summary.errors.slice(0, 20);
  }

  return summary;
}

function normalizeInterviewPortraitData(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;

  const forcesOfProgress = raw.forcesOfProgress && typeof raw.forcesOfProgress === 'object' && !Array.isArray(raw.forcesOfProgress)
    ? raw.forcesOfProgress
    : {};

  const normalized = {
    title: cleanString(raw.title || raw.name || raw.portraitName),
    archetype: cleanString(raw.archetype || raw.portraitType || raw.segment),
    summary: cleanString(raw.summary || raw.description || raw.narrative),
    jobToBeDone: cleanString(raw.jobToBeDone || raw.mainJob),
    progressMoment: cleanString(raw.progressMoment || raw.triggerMoment || raw.switchMoment),
    decisionStyle: cleanString(raw.decisionStyle),
    dominantForce: normalizeEnum(raw.dominantForce, ['pushes', 'pulls', 'anxieties', 'habits', 'balanced']),
    forcesOfProgress: {
      pushes: normalizeStringArray(forcesOfProgress.pushes, 5),
      pulls: normalizeStringArray(forcesOfProgress.pulls, 5),
      anxieties: normalizeStringArray(forcesOfProgress.anxieties, 5),
      habits: normalizeStringArray(forcesOfProgress.habits, 5),
    },
    personalityTraits: normalizeStringArray(raw.personalityTraits || raw.traits, 5),
    opportunityAngles: normalizeStringArray(raw.opportunityAngles || raw.opportunities, 5),
    evidenceQuotes: normalizeStringArray(raw.evidenceQuotes || raw.quotes, 3),
  };

  const hasContent =
    normalized.title ||
    normalized.archetype ||
    normalized.summary ||
    normalized.jobToBeDone ||
    normalized.progressMoment ||
    normalized.decisionStyle ||
    normalized.dominantForce ||
    normalized.forcesOfProgress.pushes.length > 0 ||
    normalized.forcesOfProgress.pulls.length > 0 ||
    normalized.forcesOfProgress.anxieties.length > 0 ||
    normalized.forcesOfProgress.habits.length > 0 ||
    normalized.personalityTraits.length > 0 ||
    normalized.opportunityAngles.length > 0 ||
    normalized.evidenceQuotes.length > 0;

  return hasContent ? normalized : null;
}

async function enrichPortraitRows(rows) {
  if (!Array.isArray(rows) || rows.length === 0) return [];

  const userIds = [...new Set(rows.map((row) => row.user_id).filter(Boolean))];
  const interviewIds = [...new Set(rows.flatMap((row) => {
    const generationState = isPlainObject(row?.portrait_data?.[INTERVIEW_SYSTEM_KEY]?.portraitGeneration)
      ? row.portrait_data[INTERVIEW_SYSTEM_KEY].portraitGeneration
      : null;
    const ids = Array.isArray(generationState?.sourceInterviewIds)
      ? generationState.sourceInterviewIds
      : [];
    const primaryId = row.source_interview_id ? [row.source_interview_id] : [];
    return [...ids, ...primaryId].filter(Boolean);
  }))];
  const profilesMap = {};
  const interviewsMap = {};

  if (userIds.length > 0) {
    const { data: profiles } = await supabaseAdmin
      .from('profiles')
      .select('id, full_name, email')
      .in('id', userIds);

    if (profiles) {
      profiles.forEach((profile) => {
        profilesMap[profile.id] = profile.full_name || profile.email || 'Unknown';
      });
    }
  }

  if (interviewIds.length > 0) {
    const { data: interviews } = await supabaseAdmin
      .from('interviews')
      .select('id, title')
      .in('id', interviewIds);

    if (interviews) {
      interviews.forEach((interview) => {
        interviewsMap[interview.id] = interview.title || 'Untitled interview';
      });
    }
  }

  return rows.map((row) => {
    const generationState = isPlainObject(row?.portrait_data?.[INTERVIEW_SYSTEM_KEY]?.portraitGeneration)
      ? row.portrait_data[INTERVIEW_SYSTEM_KEY].portraitGeneration
      : null;
    const sourceInterviewIds = Array.isArray(generationState?.sourceInterviewIds) && generationState.sourceInterviewIds.length > 0
      ? generationState.sourceInterviewIds.filter(Boolean)
      : (row.source_interview_id ? [row.source_interview_id] : []);

    return {
      ...row,
      owner: profilesMap[row.user_id] || 'Unknown',
      source_interview_ids: sourceInterviewIds,
      source_interview_titles: sourceInterviewIds
        .map((id) => interviewsMap[id] || '')
        .filter(Boolean),
      source_interview_title: row.source_interview_id ? (interviewsMap[row.source_interview_id] || '') : '',
      updated_at: row.updated_at || row.created_at,
    };
  });
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
    const adapter = getIntegrationProvider(provider);
    if (!adapter?.authorize) return res.status(400).json({ status: 'error', message: 'Invalid provider' });
    const redirectUri = process.env[provider === 'google_sheets' ? 'GOOGLE_REDIRECT_URI' : 'MS_REDIRECT_URI'] || `${API_PUBLIC_ORIGIN}/api/integrations/${provider}/callback`;
    const url = adapter.authorize(redirectUri, state);
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
  const providerQuery = `provider=${encodeURIComponent(provider)}`;
  if (!INTEGRATION_PROVIDERS.includes(provider)) return res.redirect(redirectBase + `?integration=error&${providerQuery}&message=Invalid+provider`);
  if (!verified || !verified.userId || !code) return res.redirect(redirectBase + `?integration=error&${providerQuery}&message=Invalid+state`);
  const userId = verified.userId;
  const redirectUri = process.env[provider === 'google_sheets' ? 'GOOGLE_REDIRECT_URI' : 'MS_REDIRECT_URI'] || `${API_PUBLIC_ORIGIN}/api/integrations/${provider}/callback`;
  try {
    const adapter = getIntegrationProvider(provider);
    if (!adapter?.exchangeCodeForTokens) throw new Error('Invalid provider');
    const tokens = await adapter.exchangeCodeForTokens(code, redirectUri);
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
    return res.redirect(redirectBase + `?integration=connected&${providerQuery}`);
  } catch (err) {
    logSystemError(err, 'GET /api/integrations/:provider/callback');
    return res.redirect(redirectBase + `?integration=error&${providerQuery}&message=` + encodeURIComponent(err.message || 'Connection failed'));
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
    const updated = await syncMetricFromIntegration(metric);
    return res.json({ status: 'success', data: updated });
  } catch (err) {
    logSystemError(err, 'POST /api/metrics/:id/sync');
    const code = err.code || (err.message && err.message.includes('reconnect') ? 'INTEGRATION_DISCONNECTED' : 'SYNC_ERROR');
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
    const rows = await fetchIntegrationRows(provider, accessToken, cfg);
    const updates = mapRowsToMetric(type, rows);
    return res.json({ status: 'success', data: updates });
  } catch (err) {
    logSystemError(err, 'POST /api/integrations/fetch-data');
    const code = err.code || (err.message && err.message.includes('reconnect') ? 'INTEGRATION_DISCONNECTED' : 'SYNC_ERROR');
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
        limits: limits || {
          planName: null,
          planId: null,
          currentPeriodStart: null,
          currentPeriodEnd: null,
          billing: { status: null, currentPeriodStart: null, currentPeriodEnd: null, interval: null },
          capacity: {
            members: { used: 0, limit: null, remaining: null },
            journeys: { used: 0, limit: null, remaining: null },
            personas: { used: 0, limit: null, remaining: null },
            metrics: { used: 0, limit: null, remaining: null },
          },
          quotas: {
            interviewsCreated: { used: 0, limit: null, remaining: null },
            portraitGenerations: { used: 0, limit: null, remaining: null },
            aiSummaries: { used: 0, limit: null, remaining: null },
            pdfExports: { used: 0, limit: null, remaining: null },
          },
          maxMembers: null,
          maxJourneys: null,
          maxPersonas: null,
          maxMetrics: null,
          maxInterviews: null,
          maxPortraitsPerPeriod: null,
          maxAiSummariesPerPeriod: null,
          maxExportsPerPeriod: null,
          usage: { members: 0, journeys: 0, personas: 0, metrics: 0, interviews: 0, portraits: 0, ai_summaries: 0, exports: 0 },
        },
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

        const memberLimitCheck = await assertWorkspaceFeatureLimit(workspace.id, 'members');
        if (!memberLimitCheck.allowed) {
            return res.status(403).json(memberLimitCheck.error);
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
            console.log(`[WORKSPACE INVITE] Re-invited ${email} to workspace ${workspace.id}`);
            return res.json({ status: 'success', message: 'Invite sent successfully.', data: updated });
        }

        const { data, error } = await supabaseAdmin
            .from('workspace_invites')
            .insert([{ workspace_id: workspace.id, email: normalizedEmail, role }])
            .select()
            .single();

        if (error) throw error;

        console.log(`[WORKSPACE INVITE] Invited ${email} to workspace ${workspace.id}`);

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

app.get('/api/learning-materials', async (req, res) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ status: 'error', message: 'Unauthorized' });

  try {
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) return res.status(401).json({ status: 'error', message: 'Invalid token' });
    const locale = resolveContentLocale(req);

    const { data, error } = await supabaseAdmin
      .from('learning_materials')
      .select('id, slug, locale, title, subtitle, excerpt, category, cover_image_url, author_name, reading_time_minutes, hero_tone, featured, published_at, created_at, updated_at')
      .eq('status', 'published')
      .eq('locale', locale)
      .order('featured', { ascending: false })
      .order('sort_order', { ascending: true })
      .order('published_at', { ascending: false, nullsFirst: false });

    if (error) throw error;

    res.json({
      status: 'success',
      data: (data || []).map(mapLearningMaterialListItem),
    });
  } catch (err) {
    logSystemError(err, 'GET /api/learning-materials');
    res.status(500).json({ status: 'error', error: err.message });
  }
});

app.get('/api/learning-materials/:slug', async (req, res) => {
  const token = req.headers.authorization?.split(' ')[1];
  const { slug } = req.params;
  if (!token) return res.status(401).json({ status: 'error', message: 'Unauthorized' });

  try {
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) return res.status(401).json({ status: 'error', message: 'Invalid token' });
    const locale = resolveContentLocale(req);

    const { data, error } = await supabaseAdmin
      .from('learning_materials')
      .select('id, slug, locale, title, subtitle, excerpt, category, cover_image_url, author_name, reading_time_minutes, hero_tone, featured, published_at, created_at, updated_at, body_html')
      .eq('slug', slug)
      .eq('locale', locale)
      .eq('status', 'published')
      .maybeSingle();

    if (error) throw error;
    if (!data) return res.status(404).json({ status: 'error', message: 'Learning material not found' });

    res.json({
      status: 'success',
      data: {
        ...mapLearningMaterialListItem(data),
        body_html: data.body_html || '',
      },
    });
  } catch (err) {
    logSystemError(err, `GET /api/learning-materials/${slug}`);
    res.status(500).json({ status: 'error', error: err.message });
  }
});

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

app.get('/api/news', async (req, res) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ status: 'error', message: 'Unauthorized' });

  try {
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) return res.status(401).json({ status: 'error', message: 'Invalid token' });
    const locale = resolveContentLocale(req);

    const [{ data: newsList, error: newsError }, { data: views, error: viewsError }] = await Promise.all([
      supabaseAdmin
        .from('support_news')
        .select('id, locale, title, subtitle, summary, body_html, cover_image_url, tone, status, pinned, published_at, created_at, updated_at')
        .eq('status', 'published')
        .eq('locale', locale)
        .order('pinned', { ascending: false })
        .order('published_at', { ascending: false, nullsFirst: false }),
      supabaseAdmin
        .from('support_news_views')
        .select('news_id')
        .eq('user_id', user.id),
    ]);

    if (newsError) throw newsError;
    if (viewsError) throw viewsError;

    const readNewsIds = new Set((views || []).map((item) => item.news_id));
    res.json({
      status: 'success',
      data: (newsList || []).map((item) => mapSupportNewsItem(item, readNewsIds)),
    });
  } catch (err) {
    logSystemError(err, 'GET /api/news');
    console.error('Error listing support news:', err);
    res.status(500).json({ status: 'error', error: err.message });
  }
});

app.get('/api/news/unread-count', async (req, res) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ status: 'error', message: 'Unauthorized' });

  try {
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) return res.status(401).json({ status: 'error', message: 'Invalid token' });
    const locale = resolveContentLocale(req);

    const [{ data: publishedNews, error: publishedError }, { data: views, error: viewsError }] = await Promise.all([
      supabaseAdmin.from('support_news').select('id').eq('status', 'published').eq('locale', locale),
      supabaseAdmin.from('support_news_views').select('news_id').eq('user_id', user.id),
    ]);

    if (publishedError) throw publishedError;
    if (viewsError) throw viewsError;

    const viewedIds = new Set((views || []).map((item) => item.news_id));
    const unreadCount = (publishedNews || []).filter((item) => !viewedIds.has(item.id)).length;
    res.json({
      status: 'success',
      data: unreadCount,
    });
  } catch (err) {
    logSystemError(err, 'GET /api/news/unread-count');
    console.error('Error getting support news unread count:', err);
    res.status(500).json({ status: 'error', error: err.message });
  }
});

app.get('/api/news/:id', async (req, res) => {
  const token = req.headers.authorization?.split(' ')[1];
  const { id } = req.params;
  if (!token) return res.status(401).json({ status: 'error', message: 'Unauthorized' });

  try {
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) return res.status(401).json({ status: 'error', message: 'Invalid token' });
    const locale = resolveContentLocale(req);

    const [{ data: item, error: newsError }, { data: view, error: viewError }] = await Promise.all([
      supabaseAdmin
        .from('support_news')
        .select('id, locale, title, subtitle, summary, body_html, cover_image_url, tone, status, pinned, published_at, created_at, updated_at')
        .eq('id', id)
        .eq('locale', locale)
        .eq('status', 'published')
        .maybeSingle(),
      supabaseAdmin
        .from('support_news_views')
        .select('news_id')
        .eq('news_id', id)
        .eq('user_id', user.id)
        .maybeSingle(),
    ]);

    if (newsError) throw newsError;
    if (viewError) throw viewError;
    if (!item) return res.status(404).json({ status: 'error', message: 'News item not found' });

    res.json({
      status: 'success',
      data: mapSupportNewsItem(item, new Set(view ? [view.news_id] : [])),
    });
  } catch (err) {
    logSystemError(err, 'GET /api/news/:id');
    console.error('Error getting support news item:', err);
    res.status(500).json({ status: 'error', error: err.message });
  }
});

app.patch('/api/news/:id/read', async (req, res) => {
  const token = req.headers.authorization?.split(' ')[1];
  const { id } = req.params;
  if (!token) return res.status(401).json({ status: 'error', message: 'Unauthorized' });

  try {
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) return res.status(401).json({ status: 'error', message: 'Invalid token' });
    const locale = resolveContentLocale(req);

    const { data: newsItem, error: newsError } = await supabaseAdmin
      .from('support_news')
      .select('id')
      .eq('id', id)
      .eq('locale', locale)
      .eq('status', 'published')
      .maybeSingle();

    if (newsError) throw newsError;
    if (!newsItem) return res.status(404).json({ status: 'error', message: 'News item not found' });

    const { error: upsertError } = await supabaseAdmin
      .from('support_news_views')
      .upsert([{ news_id: id, user_id: user.id, viewed_at: new Date().toISOString() }], { onConflict: 'news_id,user_id' });

    if (upsertError) throw upsertError;

    res.json({ status: 'success' });
  } catch (err) {
    logSystemError(err, 'PATCH /api/news/:id/read');
    console.error('Error marking support news as read:', err);
    res.status(500).json({ status: 'error', error: err.message });
  }
});

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
    const { user, error: adminAuthError } = await getAdminUserFromToken(token);
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

app.get('/api/admin/news', async (req, res) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ status: 'error', message: 'Unauthorized' });

  try {
    const { error: adminAuthError } = await getAdminUserFromToken(token);
    if (adminAuthError?.message === 'Access denied') return res.status(403).json({ status: 'error', message: 'Access denied' });
    if (adminAuthError) return res.status(401).json({ status: 'error', message: 'Invalid token' });

    const [{ data: newsItems, error: newsError }, { data: views, error: viewsError }] = await Promise.all([
      supabaseAdmin
        .from('support_news')
        .select('*')
        .order('pinned', { ascending: false })
        .order('published_at', { ascending: false, nullsFirst: false })
        .order('created_at', { ascending: false }),
      supabaseAdmin
        .from('support_news_views')
        .select('news_id, user_id'),
    ]);

    if (newsError) throw newsError;
    if (viewsError) throw viewsError;

    const viewCountByNewsId = {};
    (views || []).forEach((item) => {
      if (!item?.news_id) return;
      viewCountByNewsId[item.news_id] = (viewCountByNewsId[item.news_id] || 0) + 1;
    });

    res.json({
      status: 'success',
      data: (newsItems || []).map((item) => ({
        ...item,
        view_count: viewCountByNewsId[item.id] || 0,
      })),
    });
  } catch (err) {
    logSystemError(err, 'GET /api/admin/news');
    console.error('Error listing admin news:', err);
    res.status(500).json({ status: 'error', error: err.message });
  }
});

app.get('/api/admin/news/:id', async (req, res) => {
  const token = req.headers.authorization?.split(' ')[1];
  const { id } = req.params;
  if (!token) return res.status(401).json({ status: 'error', message: 'Unauthorized' });

  try {
    const { error: adminAuthError } = await getAdminUserFromToken(token);
    if (adminAuthError?.message === 'Access denied') return res.status(403).json({ status: 'error', message: 'Access denied' });
    if (adminAuthError) return res.status(401).json({ status: 'error', message: 'Invalid token' });

    const [{ data: newsItem, error: newsError }, { count: viewCount, error: countError }] = await Promise.all([
      supabaseAdmin.from('support_news').select('*').eq('id', id).maybeSingle(),
      supabaseAdmin.from('support_news_views').select('*', { count: 'exact', head: true }).eq('news_id', id),
    ]);

    if (newsError) throw newsError;
    if (countError) throw countError;
    if (!newsItem) return res.status(404).json({ status: 'error', message: 'News item not found' });

    res.json({
      status: 'success',
      data: {
        ...newsItem,
        view_count: viewCount ?? 0,
      },
    });
  } catch (err) {
    logSystemError(err, 'GET /api/admin/news/:id');
    console.error('Error getting admin news item:', err);
    res.status(500).json({ status: 'error', error: err.message });
  }
});

app.post('/api/admin/news', async (req, res) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ status: 'error', message: 'Unauthorized' });

  try {
    const { user, error: adminAuthError } = await getAdminUserFromToken(token);
    if (adminAuthError?.message === 'Access denied') return res.status(403).json({ status: 'error', message: 'Access denied' });
    if (adminAuthError) return res.status(401).json({ status: 'error', message: 'Invalid token' });

    const { title, subtitle, summary, body_html, cover_image_url, tone, status, pinned, locale } = req.body || {};
    if (!title || !String(title).trim() || !summary || !String(summary).trim() || !body_html || !String(body_html).trim()) {
      return res.status(400).json({ status: 'error', message: 'title, summary, body_html are required' });
    }

    const payload = {
      title: String(title).trim(),
      subtitle: subtitle ? String(subtitle).trim() : null,
      summary: String(summary).trim(),
      body_html: String(body_html).trim(),
      cover_image_url: cover_image_url ? String(cover_image_url).trim() : null,
      locale: ['uk', 'en'].includes(locale) ? locale : 'uk',
      tone: ['cobalt', 'emerald', 'amber', 'rose'].includes(tone) ? tone : 'cobalt',
      status: status === 'published' ? 'published' : 'draft',
      pinned: !!pinned,
      created_by: user.id,
      updated_by: user.id,
    };

    const { data, error } = await supabaseAdmin.from('support_news').insert([payload]).select().single();
    if (error) throw error;
    res.status(201).json({ status: 'success', data });
  } catch (err) {
    logSystemError(err, 'POST /api/admin/news');
    console.error('Error creating admin news item:', err);
    res.status(500).json({ status: 'error', error: err.message });
  }
});

app.put('/api/admin/news/:id', async (req, res) => {
  const token = req.headers.authorization?.split(' ')[1];
  const { id } = req.params;
  if (!token) return res.status(401).json({ status: 'error', message: 'Unauthorized' });

  try {
    const { user, error: adminAuthError } = await getAdminUserFromToken(token);
    if (adminAuthError?.message === 'Access denied') return res.status(403).json({ status: 'error', message: 'Access denied' });
    if (adminAuthError) return res.status(401).json({ status: 'error', message: 'Invalid token' });

    const { title, subtitle, summary, body_html, cover_image_url, tone, status, pinned, locale } = req.body || {};
    if (!title || !String(title).trim() || !summary || !String(summary).trim() || !body_html || !String(body_html).trim()) {
      return res.status(400).json({ status: 'error', message: 'title, summary, body_html are required' });
    }

    const payload = {
      title: String(title).trim(),
      subtitle: subtitle ? String(subtitle).trim() : null,
      summary: String(summary).trim(),
      body_html: String(body_html).trim(),
      cover_image_url: cover_image_url ? String(cover_image_url).trim() : null,
      locale: ['uk', 'en'].includes(locale) ? locale : 'uk',
      tone: ['cobalt', 'emerald', 'amber', 'rose'].includes(tone) ? tone : 'cobalt',
      status: status === 'published' ? 'published' : 'draft',
      pinned: !!pinned,
      updated_by: user.id,
    };

    const { data, error } = await supabaseAdmin.from('support_news').update(payload).eq('id', id).select().single();
    if (error) throw error;
    res.json({ status: 'success', data });
  } catch (err) {
    logSystemError(err, 'PUT /api/admin/news/:id');
    console.error('Error updating admin news item:', err);
    res.status(500).json({ status: 'error', error: err.message });
  }
});

app.delete('/api/admin/news/:id', async (req, res) => {
  const token = req.headers.authorization?.split(' ')[1];
  const { id } = req.params;
  if (!token) return res.status(401).json({ status: 'error', message: 'Unauthorized' });

  try {
    const { error: adminAuthError } = await getAdminUserFromToken(token);
    if (adminAuthError?.message === 'Access denied') return res.status(403).json({ status: 'error', message: 'Access denied' });
    if (adminAuthError) return res.status(401).json({ status: 'error', message: 'Invalid token' });

    const { error } = await supabaseAdmin.from('support_news').delete().eq('id', id);
    if (error) throw error;
    res.json({ status: 'success' });
  } catch (err) {
    logSystemError(err, 'DELETE /api/admin/news/:id');
    console.error('Error deleting admin news item:', err);
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
            return enrichPlanWithPaddleConfig({ ...plan, features, description });
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

        const { count: historicalCount, error: historicalError } = await supabaseAdmin
            .from('subscriptions')
            .select('*', { count: 'exact', head: true })
            .eq('user_id', user.id);
        if (historicalError) throw historicalError;
        if ((historicalCount ?? 0) > 0) {
            return res.status(200).json({ status: 'ok', message: 'Subscription history exists; skipping auto-assignment' });
        }

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

        const related = await loadAdminUserDetails(supabaseAdmin, id);

        console.log(`✅ Found user: ${userProfile.email}`);

        res.json({
            status: 'success',
            data: {
                profile: userProfile,
                ...related
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

const normalizeInterviewFolderName = (name) => String(name || '').trim().slice(0, 80);

async function assertInterviewFolderAccess(folderId, workspaceId, workspaceIds) {
    if (!folderId) return null;
    const { data: folder, error } = await supabaseAdmin
        .from('interview_folders')
        .select('id, workspace_id')
        .eq('id', folderId)
        .single();
    if (error || !folder) {
        const notFound = new Error('Folder not found');
        notFound.status = 404;
        throw notFound;
    }
    if (!workspaceIds.includes(folder.workspace_id) || (workspaceId && folder.workspace_id !== workspaceId)) {
        const accessDenied = new Error('Folder access denied');
        accessDenied.status = 403;
        throw accessDenied;
    }
    return folder;
}

app.get('/api/interview-folders', async (req, res) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ status: 'error', message: 'Unauthorized' });

    try {
        const { data: { user }, error: authError } = await supabase.auth.getUser(token);
        if (authError || !user) return res.status(401).json({ status: 'error', message: 'Invalid token' });

        const workspaceIds = await getAccessibleWorkspaceIds(user.id);
        if (workspaceIds.length === 0) {
            return res.json({ status: 'success', data: [] });
        }

        const { data, error } = await supabaseAdmin
            .from('interview_folders')
            .select('*')
            .in('workspace_id', workspaceIds)
            .order('created_at', { ascending: true });
        if (error) throw error;

        res.json({ status: 'success', data: data || [] });
    } catch (err) {
        logSystemError(err, 'GET /api/interview-folders');
        res.status(500).json({ status: 'error', error: err.message });
    }
});

app.post('/api/interview-folders', async (req, res) => {
    const token = req.headers.authorization?.split(' ')[1];
    const { name, workspace_id: bodyWorkspaceId } = req.body;
    if (!token) return res.status(401).json({ status: 'error', message: 'Unauthorized' });

    try {
        const { data: { user }, error: authError } = await supabase.auth.getUser(token);
        if (authError || !user) return res.status(401).json({ status: 'error', message: 'Invalid token' });

        const folderName = normalizeInterviewFolderName(name);
        if (!folderName) return res.status(400).json({ status: 'error', message: 'Folder name is required' });

        const workspaceIds = await getAccessibleWorkspaceIds(user.id);
        let workspace = null;
        if (bodyWorkspaceId && workspaceIds.includes(bodyWorkspaceId)) workspace = { id: bodyWorkspaceId };
        if (!workspace) workspace = await getCurrentWorkspaceForUser(user.id);
        if (!workspace) {
            return res.status(403).json({ status: 'error', message: 'Create or join a workspace first' });
        }

        const { data, error } = await supabaseAdmin
            .from('interview_folders')
            .insert([{
                name: folderName,
                workspace_id: workspace.id,
                user_id: user.id,
            }])
            .select()
            .single();
        if (error) throw error;

        res.status(201).json({ status: 'success', data });
    } catch (err) {
        logSystemError(err, 'POST /api/interview-folders');
        res.status(500).json({ status: 'error', error: err.message });
    }
});

app.put('/api/interview-folders/:id', async (req, res) => {
    const token = req.headers.authorization?.split(' ')[1];
    const { id } = req.params;
    const { name } = req.body;
    if (!token) return res.status(401).json({ status: 'error', message: 'Unauthorized' });

    try {
        const { data: { user }, error: authError } = await supabase.auth.getUser(token);
        if (authError || !user) return res.status(401).json({ status: 'error', message: 'Invalid token' });

        const workspaceIds = await getAccessibleWorkspaceIds(user.id);
        const { data: existing, error: fetchErr } = await supabaseAdmin
            .from('interview_folders')
            .select('id, workspace_id')
            .eq('id', id)
            .single();
        if (fetchErr || !existing) return res.status(404).json({ status: 'error', message: 'Folder not found' });
        if (!workspaceIds.includes(existing.workspace_id)) return res.status(403).json({ status: 'error', message: 'Access denied' });

        const folderName = normalizeInterviewFolderName(name);
        if (!folderName) return res.status(400).json({ status: 'error', message: 'Folder name is required' });

        const { data, error } = await supabaseAdmin
            .from('interview_folders')
            .update({ name: folderName, updated_at: new Date().toISOString() })
            .eq('id', existing.id)
            .select()
            .single();
        if (error) throw error;

        res.json({ status: 'success', data });
    } catch (err) {
        logSystemError(err, `PUT /api/interview-folders/${id}`);
        res.status(500).json({ status: 'error', error: err.message });
    }
});

app.delete('/api/interview-folders/:id', async (req, res) => {
    const token = req.headers.authorization?.split(' ')[1];
    const { id } = req.params;
    if (!token) return res.status(401).json({ status: 'error', message: 'Unauthorized' });

    try {
        const { data: { user }, error: authError } = await supabase.auth.getUser(token);
        if (authError || !user) return res.status(401).json({ status: 'error', message: 'Invalid token' });

        const workspaceIds = await getAccessibleWorkspaceIds(user.id);
        const { data: existing, error: fetchErr } = await supabaseAdmin
            .from('interview_folders')
            .select('id, workspace_id')
            .eq('id', id)
            .single();
        if (fetchErr || !existing) return res.status(404).json({ status: 'error', message: 'Folder not found' });
        if (!workspaceIds.includes(existing.workspace_id)) return res.status(403).json({ status: 'error', message: 'Access denied' });

        const { error: clearFolderError } = await supabaseAdmin
            .from('interviews')
            .update({ folder_id: null, updated_at: new Date().toISOString() })
            .eq('folder_id', existing.id);
        if (clearFolderError) throw clearFolderError;

        const { error } = await supabaseAdmin
            .from('interview_folders')
            .delete()
            .eq('id', existing.id);
        if (error) throw error;

        res.json({ status: 'success', message: 'Folder deleted successfully' });
    } catch (err) {
        logSystemError(err, `DELETE /api/interview-folders/${id}`);
        res.status(500).json({ status: 'error', error: err.message });
    }
});

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

        if (isInterviewProcessingStale(interview)) {
            const { data: failedInterview } = await updateInterviewStatusCompat(
                interview.id,
                'failed',
                {
                    upload_error_message: 'Transcription timed out. Please upload the audio again.',
                    summary_data: interview.summary_data,
                },
                interview.summary_data
            );
            return res.json({ status: 'success', data: failedInterview });
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
    const { title, status, transcript_data, workspace_id: bodyWorkspaceId, type, folder_id } = req.body;
    if (!token) return res.status(401).json({ status: 'error', message: 'Unauthorized' });

    try {
        const { data: { user }, error: authError } = await supabase.auth.getUser(token);
        if (authError || !user) return res.status(401).json({ status: 'error', message: 'Invalid token' });

        const accessibleWorkspaceIds = await getAccessibleWorkspaceIds(user.id);
        let workspace = null;
        if (bodyWorkspaceId) {
            if (accessibleWorkspaceIds.includes(bodyWorkspaceId)) workspace = { id: bodyWorkspaceId };
        }
        if (!workspace) workspace = await getCurrentWorkspaceForUser(user.id);
        if (!workspace) return res.status(403).json({ status: 'error', message: 'Create or join a workspace first' });
        const folder = folder_id
            ? await assertInterviewFolderAccess(folder_id, workspace.id, accessibleWorkspaceIds)
            : null;

        // PLAN LIMIT CHECK
        const interviewLimitCheck = await assertWorkspaceFeatureLimit(workspace.id, 'interviews');
        if (!interviewLimitCheck.allowed) {
            return res.status(403).json(interviewLimitCheck.error);
        }

        const { data, error } = await supabaseAdmin.from('interviews').insert([{
            title: title || 'New Interview',
            status: status || 'draft',
            type: type || 'live',
            transcript_data: transcript_data || [],
            workspace_id: workspace.id,
            user_id: user.id,
            folder_id: folder?.id || null
        }]).select().single();

        if (error) throw error;
        try {
            const usageResult = await incrementWorkspaceInterviewUsage(workspace.id, interviewLimitCheck.entitlements?.billing);
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
    const { title, status, transcript_data, summary_data, type, folder_id } = req.body;
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
        if (folder_id !== undefined) {
            if (folder_id === null || folder_id === '') {
                updates.folder_id = null;
            } else {
                const folder = await assertInterviewFolderAccess(folder_id, existing.workspace_id, workspaceIds);
                updates.folder_id = folder.id;
            }
        }

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

// 6. Згенерувати AI Саммарі
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

        const aiSummaryLimitCheck = await assertWorkspaceFeatureLimit(existing.workspace_id, 'ai_summaries');
        if (!aiSummaryLimitCheck.allowed) {
            return res.status(403).json(aiSummaryLimitCheck.error);
        }

        if (!process.env.GEMINI_API_KEY) {
            throw new Error("GEMINI_API_KEY is not configured on the server.");
        }
        const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
        const model = genAI.getGenerativeModel({ model: DEFAULT_SUMMARY_MODEL });
        const summaryService = new SummaryService({
            generateText: async (prompt) => {
                const result = await model.generateContent(prompt);
                return result.response.text();
            },
            onInvalidResponse: (responseText) => {
                console.error("Failed to parse Gemini response as JSON:", responseText);
            },
        });
        const aiSummaryData = await summaryService.generate({
            transcriptData: existing.transcript_data,
            existingSummaryData: existing.summary_data,
            request: req.body || {},
        });

        await reserveWorkspaceQuotaUsage(existing.workspace_id, 'ai_summaries', {
            entitlements: aiSummaryLimitCheck.entitlements,
        });

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

const formatFileSizeLabel = (bytes) => {
    if (!Number.isFinite(bytes) || bytes <= 0) return '0 MB';
    const megabytes = bytes / (1024 * 1024);
    const rounded = megabytes >= 10 ? Math.round(megabytes) : Number(megabytes.toFixed(1));
    return `${rounded} MB`;
};



const isAllowedInterviewUploadFile = (file = {}) => {
    const extension = getInterviewUploadExtension(file.originalname);
    const mimeType = String(file.mimetype || '').toLowerCase();
    return ALLOWED_INTERVIEW_UPLOAD_EXTENSIONS.has(extension) || ALLOWED_INTERVIEW_UPLOAD_MIME_TYPES.has(mimeType);
};

const createHttpError = (status, message, code = null) => {
    const error = new Error(message);
    error.status = status;
    if (code) error.code = code;
    return error;
};

const upload = multer({
    dest: 'uploads/',
    limits: {
        fileSize: INTERVIEW_UPLOAD_MAX_FILE_SIZE_BYTES,
    },
    fileFilter: (req, file, callback) => {
        if (!isAllowedInterviewUploadFile(file)) {
            callback(createHttpError(415, 'Unsupported file type. Please upload an MP3, WAV, M4A, MP4, or WEBM file.', 'UNSUPPORTED_MEDIA_TYPE'));
            return;
        }

        callback(null, true);
    },
});

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






















const interviewUploadMiddleware = (req, res, next) => {
    upload.single('audio')(req, res, (err) => {
        if (!err) {
            next();
            return;
        }

        safeDeleteFile(req.file?.path);

        if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
            res.status(413).json({
                status: 'error',
                error: `File exceeds the ${formatFileSizeLabel(INTERVIEW_UPLOAD_MAX_FILE_SIZE_BYTES)} upload limit.`,
            });
            return;
        }

        res.status(Number.isInteger(err?.status) ? err.status : 500).json({
            status: 'error',
            error: err?.message || 'Failed to upload audio file.',
        });
    });
};

















const buildOpenAiRealtimeTranscriptionSession = ({
    prompt = '',
} = {}) => ({
    type: 'transcription',
    audio: {
        input: {
            transcription: {
                model: process.env.OPENAI_REALTIME_TRANSCRIPTION_MODEL || DEFAULT_OPENAI_REALTIME_TRANSCRIPTION_MODEL,
                prompt,
            },
            turn_detection: {
                type: 'server_vad',
                threshold: 0.5,
                prefix_padding_ms: 300,
                silence_duration_ms: 500,
            },
            noise_reduction: null,
        },
    },
    include: ['item.input_audio_transcription.logprobs'],
});

const createOpenAiRealtimeClientSecret = async ({
    prompt = '',
} = {}) => {
    if (!process.env.OPENAI_API_KEY) {
        throw new Error('OPENAI_API_KEY is not configured.');
    }

    const response = await fetch('https://api.openai.com/v1/realtime/client_secrets', {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            session: buildOpenAiRealtimeTranscriptionSession({ prompt }),
        }),
    });

    const payload = await response.json().catch(() => null);
    if (!response.ok) {
        throw new Error(
            payload?.error?.message
            || payload?.message
            || `OpenAI realtime client secret creation failed with status ${response.status}.`
        );
    }

    const clientSecret = payload?.value || payload?.client_secret?.value || payload?.client_secret;
    if (!clientSecret || typeof clientSecret !== 'string') {
        throw new Error('OpenAI did not return a valid realtime client secret.');
    }

    return clientSecret;
};



































const processInterviewAudioUpload = async ({ interviewId, file }) => {
    let transcriptionSystemState = null;
    let transcriptionInputFile = file;

    try {
        if (!process.env.OPENAI_API_KEY && !process.env.GEMINI_API_KEY) {
            throw new Error('No transcription provider API key is configured on the server.');
        }

        transcriptionInputFile = await prepareInterviewUploadForTranscription(file);
        const transcriptionResult = await transcribeAudioWithProviderFallback(transcriptionInputFile, { interviewId });
        const newTranscriptData = transcriptionResult.transcript;
        transcriptionSystemState = transcriptionResult.systemState;
        console.info('[interview-upload] completed transcription', {
            interviewId,
            model: transcriptionSystemState.model,
            provider: transcriptionSystemState.provider,
            responseFormat: transcriptionSystemState.responseFormat,
            transcriptTurns: Array.isArray(newTranscriptData) ? newTranscriptData.length : 0,
        });

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

        const failureSummaryData = transcriptionSystemState
            ? withInterviewSystemState(latestInterview?.summary_data ?? null, transcriptionSystemState)
            : (latestInterview?.summary_data ?? null);

        await updateInterviewStatusCompat(
            interviewId,
            'failed',
            {
                upload_error_message: err.message || INTERVIEW_UPLOAD_ERROR_FALLBACK,
                summary_data: failureSummaryData,
            },
            latestInterview?.summary_data ?? null
        );
    } finally {
        safeDeleteFile(file.path);
        if (transcriptionInputFile?.path && transcriptionInputFile.path !== file.path) {
            safeDeleteFile(transcriptionInputFile.path);
        }
    }
};

// 7. Upload Audio and Transcribe
app.post('/api/interviews/:id/upload-audio', interviewUploadMiddleware, async (req, res) => {
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

        const uploadFile = {
            path: req.file.path,
            mimetype: req.file.mimetype,
            originalname: req.file.originalname,
            size: req.file.size,
        };
        const processingSystemState = {
            uploadStatus: 'processing',
            startedAt: new Date().toISOString(),
            sourceUploadFileName: uploadFile.originalname || '',
            sourceUploadFileSizeBytes: Number.isFinite(uploadFile.size) ? uploadFile.size : null,
            sourceUploadMimeType: uploadFile.mimetype || '',
        };
        const processingPayload = {
            transcript_data: [],
            summary_data: withInterviewSystemState(null, processingSystemState),
            updated_at: new Date().toISOString()
        };

        const { data: updatedInterview } = await updateInterviewStatusCompat(
            existing.id,
            'processing',
            processingPayload,
            existing.summary_data ?? null
        );

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

app.post('/api/interviews/:id/realtime-token', async (req, res) => {
    const token = req.headers.authorization?.split(' ')[1];
    const { id } = req.params;

    if (!token) return res.status(401).json({ status: 'error', message: 'Unauthorized' });

    try {
        const { data: { user }, error: authError } = await supabase.auth.getUser(token);
        if (authError || !user) return res.status(401).json({ status: 'error', message: 'Invalid token' });

        const { data: existing, error: fetchErr } = await supabaseAdmin.from('interviews')
            .select('*')
            .eq('id', id)
            .single();

        if (fetchErr || !existing) return res.status(404).json({ status: 'error', message: 'Interview not found' });

        const workspaceIds = await getAccessibleWorkspaceIds(user.id);
        if (!workspaceIds.includes(existing.workspace_id)) return res.status(403).json({ status: 'error', message: 'Access denied' });

        const clientSecret = await createOpenAiRealtimeClientSecret({
            prompt: [
                'This is a live user interview between an interviewer and a respondent.',
                'Prefer a verbatim transcript.',
                'Expect Ukrainian, English, and occasional Russian speech.',
                'Expect product research, CX, journey mapping, and software terminology.',
            ].join(' '),
        });

        res.json({ status: 'success', data: { clientSecret } });
    } catch (err) {
        logSystemError(err, `POST /api/interviews/${id}/realtime-token`);
        res.status(500).json({ status: 'error', message: err.message });
    }
});

// Налаштування для роздачі статики в продакшені (Клієнт і Адмінка)
if (process.env.NODE_ENV === 'production') {
    const researchStatic = express.static(path.join(__dirname, 'public/research'));
    app.use((req, res, next) => {
        if (req.hostname !== RESEARCH_HOST || req.path.startsWith('/api/')) return next();
        if (!productFlags.researchEnabled) return res.status(404).send('Research is not enabled');
        if (!['GET', 'HEAD'].includes(req.method)) return next();
        return researchStatic(req, res, () => {
            const entry = path.join(__dirname, 'public/research/index.html');
            if (!fs.existsSync(entry)) return res.status(503).send('Research is not ready');
            return res.sendFile(entry);
        });
    });
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

verifyProductScope(rawSupabaseAdmin, productFlags).then(() => {
    app.listen(PORT, () => {
        console.log(`Server running on port ${PORT}`);
        initMetricAutoSyncScheduler({
            supabaseAdmin,
            runDailySync: runNightlyMetricAutoSync,
            logger: console,
        });
        if (researchJobsEnabled && process.env.RESEARCH_EMBEDDED_WORKER !== 'false') {
            const { main: startResearchWorker } = require('./workers/research');
            startResearchWorker().catch((err) => {
                console.error('[Research worker] stopped:', err.message);
            });
        }
    });
}).catch((error) => {
    console.error('Server startup refused:', error.message);
    process.exitCode = 1;
});
