const DAILY_METRIC_AUTO_SYNC_JOB_NAME = 'metric_auto_sync_daily';
const DEFAULT_POLL_INTERVAL_MS = 15 * 60 * 1000;
const DEFAULT_TIMEZONE = 'Europe/Kiev';
const DEFAULT_TARGET_HOUR = 2;
const DEFAULT_TARGET_MINUTE = 0;
const RUNNING_STALE_MS = 2 * 60 * 60 * 1000;
const inMemoryJobState = new Map();

function parseBoolean(value, defaultValue) {
  if (value == null || value === '') return defaultValue;
  const normalized = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return defaultValue;
}

function parseInteger(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isInteger(parsed) ? parsed : fallback;
}

function getTimeParts(date, timeZone) {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  });

  const parts = formatter.formatToParts(date);
  const lookup = {};
  for (const part of parts) {
    if (part.type !== 'literal') lookup[part.type] = part.value;
  }

  return {
    year: Number(lookup.year),
    month: Number(lookup.month),
    day: Number(lookup.day),
    hour: Number(lookup.hour),
    minute: Number(lookup.minute),
  };
}

function buildRunKey(date, timeZone) {
  const { year, month, day } = getTimeParts(date, timeZone);
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function shouldAttemptRun(now, config) {
  const { hour, minute } = getTimeParts(now, config.timeZone);
  const currentMinutes = hour * 60 + minute;
  const targetMinutes = config.targetHour * 60 + config.targetMinute;
  return currentMinutes >= targetMinutes;
}

async function readJobState(supabaseAdmin, jobName) {
  const { data, error } = await supabaseAdmin
    .from('background_job_runs')
    .select('*')
    .eq('job_name', jobName)
    .maybeSingle();

  if (error) throw error;
  return data || null;
}

async function markJobState(supabaseAdmin, jobName, payload) {
  const row = {
    job_name: jobName,
    updated_at: new Date().toISOString(),
    ...payload,
  };

  const { error } = await supabaseAdmin
    .from('background_job_runs')
    .upsert(row, { onConflict: 'job_name' });

  if (error) throw error;
}

function isMissingJobStateTableError(error) {
  return error?.code === 'PGRST205' || String(error?.message || '').includes('background_job_runs');
}

function createJobStateStore(supabaseAdmin, logger) {
  let useInMemoryFallback = false;
  let warned = false;

  const warnFallback = () => {
    if (warned) return;
    warned = true;
    logger.warn?.('[metric-auto-sync] background_job_runs table is missing; falling back to in-memory scheduler state until the migration is applied.');
  };

  return {
    async read(jobName) {
      if (useInMemoryFallback) return inMemoryJobState.get(jobName) || null;
      try {
        return await readJobState(supabaseAdmin, jobName);
      } catch (error) {
        if (!isMissingJobStateTableError(error)) throw error;
        useInMemoryFallback = true;
        warnFallback();
        return inMemoryJobState.get(jobName) || null;
      }
    },
    async write(jobName, payload) {
      if (useInMemoryFallback) {
        inMemoryJobState.set(jobName, { ...(inMemoryJobState.get(jobName) || {}), job_name: jobName, ...payload });
        return;
      }
      try {
        await markJobState(supabaseAdmin, jobName, payload);
      } catch (error) {
        if (!isMissingJobStateTableError(error)) throw error;
        useInMemoryFallback = true;
        warnFallback();
        inMemoryJobState.set(jobName, { ...(inMemoryJobState.get(jobName) || {}), job_name: jobName, ...payload });
      }
    },
  };
}

async function claimDailyRun(jobStateStore, config, logger) {
  const now = new Date();
  if (!shouldAttemptRun(now, config)) return null;

  const runKey = buildRunKey(now, config.timeZone);
  const state = await jobStateStore.read(config.jobName);

  if (state?.last_run_key === runKey) {
    if (state.status === 'completed') return null;
    if (state.status === 'running' && state.last_started_at) {
      const startedAt = new Date(state.last_started_at).getTime();
      if (!Number.isNaN(startedAt) && Date.now() - startedAt < RUNNING_STALE_MS) {
        return null;
      }
      logger?.warn?.(`[metric-auto-sync] Previous run for ${runKey} looks stale; retrying.`);
    }
  }

  await jobStateStore.write(config.jobName, {
    status: 'running',
    last_run_key: runKey,
    last_started_at: now.toISOString(),
    last_error: null,
  });

  return { runKey, startedAt: now };
}

function createLogger(logger) {
  return logger || console;
}

function initMetricAutoSyncScheduler(options) {
  const logger = createLogger(options?.logger);
  const enabled = parseBoolean(process.env.METRIC_AUTO_SYNC_ENABLED, true);
  if (!enabled) {
    logger.info?.('[metric-auto-sync] Scheduler disabled by METRIC_AUTO_SYNC_ENABLED.');
    return () => {};
  }

  const config = {
    jobName: DAILY_METRIC_AUTO_SYNC_JOB_NAME,
    timeZone: process.env.METRIC_AUTO_SYNC_TIMEZONE || DEFAULT_TIMEZONE,
    targetHour: parseInteger(process.env.METRIC_AUTO_SYNC_HOUR, DEFAULT_TARGET_HOUR),
    targetMinute: parseInteger(process.env.METRIC_AUTO_SYNC_MINUTE, DEFAULT_TARGET_MINUTE),
    pollIntervalMs: Math.max(60 * 1000, parseInteger(process.env.METRIC_AUTO_SYNC_POLL_MINUTES, DEFAULT_POLL_INTERVAL_MS / (60 * 1000)) * 60 * 1000),
  };

  let timer = null;
  let stopped = false;
  let tickInFlight = false;
  const jobStateStore = createJobStateStore(options.supabaseAdmin, logger);

  const tick = async () => {
    if (stopped || tickInFlight) return;
    tickInFlight = true;
    try {
      const claim = await claimDailyRun(jobStateStore, config, logger);
      if (!claim) return;

      logger.info?.(`[metric-auto-sync] Starting daily sync for ${claim.runKey} (${config.timeZone}).`);
      const result = await options.runDailySync({
        runKey: claim.runKey,
        startedAt: claim.startedAt,
        timeZone: config.timeZone,
      });

      await jobStateStore.write(config.jobName, {
        status: 'completed',
        last_run_key: claim.runKey,
        last_started_at: claim.startedAt.toISOString(),
        last_completed_at: new Date().toISOString(),
        last_error: null,
        metadata: result || null,
      });

      logger.info?.(`[metric-auto-sync] Daily sync completed for ${claim.runKey}.`);
    } catch (error) {
      logger.error?.('[metric-auto-sync] Daily sync failed:', error);
      try {
        await jobStateStore.write(config.jobName, {
          status: 'failed',
          last_error: error?.message || 'Unknown error',
        });
      } catch (writeError) {
        logger.error?.('[metric-auto-sync] Failed to persist job state:', writeError);
      }
    } finally {
      tickInFlight = false;
    }
  };

  timer = setInterval(() => {
    tick().catch((error) => logger.error?.('[metric-auto-sync] Tick failed:', error));
  }, config.pollIntervalMs);

  if (typeof timer.unref === 'function') timer.unref();

  setTimeout(() => {
    tick().catch((error) => logger.error?.('[metric-auto-sync] Initial tick failed:', error));
  }, 10 * 1000);

  logger.info?.(
    `[metric-auto-sync] Scheduler armed for ${String(config.targetHour).padStart(2, '0')}:${String(config.targetMinute).padStart(2, '0')} ${config.timeZone}, polling every ${Math.round(config.pollIntervalMs / 60000)} minute(s).`
  );

  return () => {
    stopped = true;
    if (timer) clearInterval(timer);
  };
}

module.exports = {
  DAILY_METRIC_AUTO_SYNC_JOB_NAME,
  initMetricAutoSyncScheduler,
};
