const supabase = require('../supabaseClient');
const { createLegacyDataClient, readProductFlags } = require('../productScope');
// Research admission currently uses explicit beta grants, never legacy plans.
const supabaseAdmin = createLegacyDataClient(supabase.supabaseAdmin || supabase, {
    enabled: readProductFlags().productScopeEnabled,
});

const PERIOD_USAGE_FEATURE_KEYS = {
    interviews: 'interviews_created',
    portraits: 'portrait_generations',
    ai_summaries: 'ai_summaries',
    exports: 'pdf_exports',
};

const FEATURE_DEFINITIONS = {
    members: {
        category: 'capacity',
        selector: (limits) => limits?.capacity?.members ?? null,
        message: (limit) => `Your current plan allows up to ${limit} team members in this workspace.`,
    },
    journeys: {
        category: 'capacity',
        selector: (limits) => limits?.capacity?.journeys ?? null,
        message: (limit) => `Your current plan allows up to ${limit} journey maps in this workspace.`,
    },
    personas: {
        category: 'capacity',
        selector: (limits) => limits?.capacity?.personas ?? null,
        message: (limit) => `Your current plan allows up to ${limit} personas in this workspace.`,
    },
    metrics: {
        category: 'capacity',
        selector: (limits) => limits?.capacity?.metrics ?? null,
        message: (limit) => `Your current plan allows up to ${limit} metrics in this workspace.`,
    },
    interviews: {
        category: 'quota',
        periodUsageKey: PERIOD_USAGE_FEATURE_KEYS.interviews,
        selector: (limits) => limits?.quotas?.interviewsCreated ?? null,
        message: (limit) => `Your current plan allows up to ${limit} interview creations this billing period.`,
    },
    portraits: {
        category: 'quota',
        periodUsageKey: PERIOD_USAGE_FEATURE_KEYS.portraits,
        selector: (limits) => limits?.quotas?.portraitGenerations ?? null,
        message: (limit) => `Your current plan allows up to ${limit} portrait generations this billing period.`,
    },
    ai_summaries: {
        category: 'quota',
        periodUsageKey: PERIOD_USAGE_FEATURE_KEYS.ai_summaries,
        selector: (limits) => limits?.quotas?.aiSummaries ?? null,
        message: (limit) => `Your current plan allows up to ${limit} AI insight generations this billing period.`,
    },
    exports: {
        category: 'quota',
        periodUsageKey: PERIOD_USAGE_FEATURE_KEYS.exports,
        selector: (limits) => limits?.quotas?.pdfExports ?? null,
        message: (limit) => `Your current plan allows up to ${limit} PDF exports this billing period.`,
    },
};

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

function normalizeCount(value, fallback = 0) {
    return Number.isFinite(Number(value)) ? Number(value) : fallback;
}

function normalizeLimit(limit) {
    return limit == null || !Number.isFinite(Number(limit)) ? null : Number(limit);
}

function normalizePeriodBoundary(value) {
    if (!value) return null;
    const parsed = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(parsed.getTime())) return null;
    return parsed.toISOString();
}

function hasBillingWindow(billing) {
    return Boolean(
        normalizePeriodBoundary(billing?.currentPeriodStart)
        && normalizePeriodBoundary(billing?.currentPeriodEnd)
    );
}

function isSubscriptionCurrentlyValid(subscription, now = new Date()) {
    if (!subscription || subscription.status !== 'active') return false;
    if (!subscription.current_period_end) return true;
    return new Date(subscription.current_period_end) > now;
}

function inferBillingInterval(subscription) {
    const periodStart = subscription?.current_period_start ? new Date(subscription.current_period_start) : null;
    const periodEnd = subscription?.current_period_end ? new Date(subscription.current_period_end) : null;

    if (!periodStart || !periodEnd || Number.isNaN(periodStart.getTime()) || Number.isNaN(periodEnd.getTime())) {
        return null;
    }

    const diffDays = Math.round((periodEnd.getTime() - periodStart.getTime()) / (1000 * 60 * 60 * 24));
    if (diffDays >= 330) return 'yearly';
    if (diffDays >= 27) return 'monthly';
    return null;
}

function buildStarterPeriodWindow(now = new Date()) {
    const periodStart = now instanceof Date ? new Date(now.getTime()) : new Date(now);
    const periodEnd = new Date(periodStart.getTime());
    periodEnd.setMonth(periodEnd.getMonth() + 1);

    return {
        currentPeriodStart: periodStart.toISOString(),
        currentPeriodEnd: periodEnd.toISOString(),
    };
}

function buildUsageSummary(used, limit) {
    const normalizedUsed = normalizeCount(used, 0);
    const normalizedLimit = normalizeLimit(limit);

    return {
        used: normalizedUsed,
        limit: normalizedLimit,
        remaining: normalizedLimit == null ? null : Math.max(0, normalizedLimit - normalizedUsed),
    };
}

async function getLegacyWorkspaceCreatedInterviewUsage(workspaceId, currentInterviewCount = 0) {
    const { data, error } = await supabaseAdmin
        .from('workspace_usage_counters')
        .select('interviews_created')
        .eq('workspace_id', workspaceId)
        .maybeSingle();

    if (error) {
        if (isMissingDatabaseObjectError(error, 'workspace_usage_counters')) {
            return normalizeCount(currentInterviewCount, 0);
        }
        throw error;
    }

    const persistedCount = normalizeCount(data?.interviews_created, 0);
    return Math.max(normalizeCount(currentInterviewCount, 0), persistedCount);
}

async function incrementLegacyWorkspaceInterviewUsage(workspaceId) {
    const rpcResult = await supabaseAdmin.rpc('increment_workspace_interview_usage', {
        p_workspace_id: workspaceId,
    });

    if (!rpcResult.error) {
        return { persisted: true, count: normalizeCount(rpcResult.data, null) };
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
        const nextCount = normalizeCount(currentRow.data.interviews_created, 0) + 1;
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
        return { persisted: true, count: normalizeCount(updateResult.data?.interviews_created, nextCount) };
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
    return { persisted: true, count: normalizeCount(insertResult.data?.interviews_created, 1) };
}

async function getPersistedWorkspacePeriodUsage(workspaceId, featureKey, billing) {
    const periodStart = normalizePeriodBoundary(billing?.currentPeriodStart);
    const periodEnd = normalizePeriodBoundary(billing?.currentPeriodEnd);

    if (!periodStart || !periodEnd) {
        return { available: false, count: 0 };
    }

    const { data, error } = await supabaseAdmin
        .from('workspace_period_usage')
        .select('used')
        .eq('workspace_id', workspaceId)
        .eq('feature_key', featureKey)
        .eq('period_start', periodStart)
        .eq('period_end', periodEnd)
        .maybeSingle();

    if (error) {
        if (isMissingDatabaseObjectError(error, 'workspace_period_usage')) {
            return { available: false, count: 0 };
        }
        throw error;
    }

    return {
        available: true,
        count: normalizeCount(data?.used, 0),
    };
}

async function incrementWorkspacePeriodUsage(workspaceId, featureKey, billing, amount = 1) {
    const delta = normalizeCount(amount, 0);
    const periodStart = normalizePeriodBoundary(billing?.currentPeriodStart);
    const periodEnd = normalizePeriodBoundary(billing?.currentPeriodEnd);

    if (delta <= 0 || !periodStart || !periodEnd) {
        return { persisted: false, count: null };
    }

    const rpcResult = await supabaseAdmin.rpc('increment_workspace_period_usage', {
        p_workspace_id: workspaceId,
        p_feature_key: featureKey,
        p_period_start: periodStart,
        p_period_end: periodEnd,
        p_delta: delta,
    });

    if (!rpcResult.error) {
        return { persisted: true, count: normalizeCount(rpcResult.data, delta) };
    }

    if (!isMissingDatabaseObjectError(rpcResult.error, 'increment_workspace_period_usage')) {
        throw rpcResult.error;
    }

    const currentRow = await supabaseAdmin
        .from('workspace_period_usage')
        .select('id, used')
        .eq('workspace_id', workspaceId)
        .eq('feature_key', featureKey)
        .eq('period_start', periodStart)
        .eq('period_end', periodEnd)
        .maybeSingle();

    if (currentRow.error) {
        if (isMissingDatabaseObjectError(currentRow.error, 'workspace_period_usage')) {
            return { persisted: false, count: null };
        }
        throw currentRow.error;
    }

    if (currentRow.data?.id) {
        const nextCount = normalizeCount(currentRow.data.used, 0) + delta;
        const updateResult = await supabaseAdmin
            .from('workspace_period_usage')
            .update({
                used: nextCount,
                updated_at: new Date().toISOString(),
            })
            .eq('id', currentRow.data.id)
            .select('used')
            .single();

        if (updateResult.error) throw updateResult.error;
        return { persisted: true, count: normalizeCount(updateResult.data?.used, nextCount) };
    }

    const insertResult = await supabaseAdmin
        .from('workspace_period_usage')
        .insert([{
            workspace_id: workspaceId,
            feature_key: featureKey,
            period_start: periodStart,
            period_end: periodEnd,
            used: delta,
        }])
        .select('used')
        .single();

    if (insertResult.error) throw insertResult.error;
    return { persisted: true, count: normalizeCount(insertResult.data?.used, delta) };
}

async function getWorkspaceCreatedInterviewUsage(workspaceId, currentInterviewCount = 0, billing = null) {
    const periodUsage = await getPersistedWorkspacePeriodUsage(
        workspaceId,
        PERIOD_USAGE_FEATURE_KEYS.interviews,
        billing
    );

    if (periodUsage.available) {
        return periodUsage.count;
    }

    return getLegacyWorkspaceCreatedInterviewUsage(workspaceId, currentInterviewCount);
}

async function incrementWorkspaceInterviewUsage(workspaceId, billing = null) {
    const periodResult = await incrementWorkspacePeriodUsage(
        workspaceId,
        PERIOD_USAGE_FEATURE_KEYS.interviews,
        billing,
        1
    );

    if (periodResult.persisted) {
        return periodResult;
    }

    return incrementLegacyWorkspaceInterviewUsage(workspaceId);
}

async function getWorkspaceSubscriptionPlan(workspaceId, options = {}) {
    const now = options.now instanceof Date ? options.now : new Date();
    const { data: workspace, error: workspaceError } = await supabaseAdmin
        .from('workspaces')
        .select('id, owner_id')
        .eq('id', workspaceId)
        .maybeSingle();

    if (workspaceError) {
        throw workspaceError;
    }

    if (!workspace) return null;

    const { data: subscriptions, error: subscriptionsError } = await supabaseAdmin
        .from('subscriptions')
        .select('*')
        .eq('user_id', workspace.owner_id)
        .eq('status', 'active')
        .order('current_period_end', { ascending: false });

    if (subscriptionsError) {
        throw subscriptionsError;
    }

    const validSubscription = (subscriptions || []).find((subscription) =>
        isSubscriptionCurrentlyValid(subscription, now)
    );

    let resolvedSubscription = validSubscription || null;
    let plan = null;

    if (resolvedSubscription) {
        const planResult = await supabaseAdmin
            .from('plans')
            .select('*')
            .eq('id', resolvedSubscription.plan_id)
            .maybeSingle();

        if (planResult.error) {
            throw planResult.error;
        }

        plan = planResult.data || null;
    }

    if (!resolvedSubscription || !plan) {
        const starterPlanResult = await supabaseAdmin
            .from('plans')
            .select('*')
            .ilike('name', 'Starter')
            .eq('is_active', true)
            .limit(1)
            .maybeSingle();

        if (starterPlanResult.error) {
            throw starterPlanResult.error;
        }

        const starterPlan = starterPlanResult.data || null;
        if (!starterPlan) return null;

        const validStarterSubscription = (subscriptions || []).find((subscription) =>
            subscription.plan_id === starterPlan.id && isSubscriptionCurrentlyValid(subscription, now)
        );

        if (validStarterSubscription) {
            resolvedSubscription = validStarterSubscription;
            plan = starterPlan;
        } else {
            const { currentPeriodStart, currentPeriodEnd } = buildStarterPeriodWindow(now);
            const upsertStarterResult = await supabaseAdmin
                .from('subscriptions')
                .insert([{
                    user_id: workspace.owner_id,
                    plan_id: starterPlan.id,
                    status: 'active',
                    current_period_start: currentPeriodStart,
                    current_period_end: currentPeriodEnd,
                }])
                .select('*')
                .single();

            if (upsertStarterResult.error) {
                throw upsertStarterResult.error;
            }

            resolvedSubscription = upsertStarterResult.data;
            plan = starterPlan;
        }
    }

    if (!resolvedSubscription || !plan) return null;

    return {
        workspace,
        subscription: resolvedSubscription,
        plan,
    };
}

async function getWorkspacePlanAndLimits(workspaceId, options = {}) {
    const subscriptionBundle = await getWorkspaceSubscriptionPlan(workspaceId, options);
    if (!subscriptionBundle) return null;

    const { subscription, plan } = subscriptionBundle;
    const billing = {
        status: subscription.status || 'active',
        currentPeriodStart: subscription.current_period_start ?? null,
        currentPeriodEnd: subscription.current_period_end ?? null,
        interval: subscription.billing_interval || inferBillingInterval(subscription),
        cancelAtPeriodEnd: subscription.cancel_at_period_end ?? null,
    };

    const [membersRes, journeysRes, personasRes, metricsRes, interviewsRes] = await Promise.all([
        supabaseAdmin.from('workspace_members').select('*', { count: 'exact', head: true }).eq('workspace_id', workspaceId),
        supabaseAdmin.from('journeys').select('*', { count: 'exact', head: true }).eq('workspace_id', workspaceId),
        supabaseAdmin.from('personas').select('*', { count: 'exact', head: true }).eq('workspace_id', workspaceId),
        supabaseAdmin.from('metrics').select('*', { count: 'exact', head: true }).eq('workspace_id', workspaceId),
        supabaseAdmin.from('interviews').select('*', { count: 'exact', head: true }).eq('workspace_id', workspaceId),
    ]);

    const [interviewUsageCount, portraitUsage, aiSummariesUsage, exportUsage] = await Promise.all([
        getWorkspaceCreatedInterviewUsage(workspaceId, interviewsRes.count ?? 0, billing),
        getPersistedWorkspacePeriodUsage(workspaceId, PERIOD_USAGE_FEATURE_KEYS.portraits, billing),
        getPersistedWorkspacePeriodUsage(workspaceId, PERIOD_USAGE_FEATURE_KEYS.ai_summaries, billing),
        getPersistedWorkspacePeriodUsage(workspaceId, PERIOD_USAGE_FEATURE_KEYS.exports, billing),
    ]);

    const capacity = {
        members: buildUsageSummary(membersRes.count ?? 0, plan.max_members ?? null),
        journeys: buildUsageSummary(journeysRes.count ?? 0, plan.max_journeys ?? null),
        personas: buildUsageSummary(personasRes.count ?? 0, plan.max_personas ?? null),
        metrics: buildUsageSummary(metricsRes.count ?? 0, plan.max_metrics ?? null),
    };
    const quotas = {
        interviewsCreated: buildUsageSummary(interviewUsageCount, plan.max_interviews ?? null),
        portraitGenerations: buildUsageSummary(portraitUsage.count, plan.max_portraits_per_period ?? null),
        aiSummaries: buildUsageSummary(aiSummariesUsage.count, plan.max_ai_summaries_per_period ?? null),
        pdfExports: buildUsageSummary(exportUsage.count, plan.max_exports_per_period ?? null),
    };

    return {
        planName: plan.name,
        planId: plan.id,
        currentPeriodStart: billing.currentPeriodStart,
        currentPeriodEnd: billing.currentPeriodEnd,
        billing,
        capacity,
        quotas,
        maxMembers: normalizeLimit(plan.max_members),
        maxJourneys: normalizeLimit(plan.max_journeys),
        maxPersonas: normalizeLimit(plan.max_personas),
        maxMetrics: normalizeLimit(plan.max_metrics),
        maxInterviews: normalizeLimit(plan.max_interviews),
        maxPortraitsPerPeriod: normalizeLimit(plan.max_portraits_per_period),
        maxAiSummariesPerPeriod: normalizeLimit(plan.max_ai_summaries_per_period),
        maxExportsPerPeriod: normalizeLimit(plan.max_exports_per_period),
        usage: {
            members: capacity.members.used,
            journeys: capacity.journeys.used,
            personas: capacity.personas.used,
            metrics: capacity.metrics.used,
            interviews: quotas.interviewsCreated.used,
            portraits: quotas.portraitGenerations.used,
            ai_summaries: quotas.aiSummaries.used,
            exports: quotas.pdfExports.used,
        },
    };
}

function getFeatureUsageSummary(entitlements, featureKey) {
    const definition = FEATURE_DEFINITIONS[featureKey];
    if (!definition) return null;
    return definition.selector(entitlements);
}

async function assertWorkspaceFeatureLimit(workspaceId, featureKey, options = {}) {
    const entitlements = options.entitlements || await getWorkspacePlanAndLimits(workspaceId, options);
    const summary = getFeatureUsageSummary(entitlements, featureKey);
    const delta = Math.max(1, normalizeCount(options.delta, 1));
    const definition = FEATURE_DEFINITIONS[featureKey];

    if (!definition || !summary || summary.limit == null) {
        return { allowed: true, entitlements, summary };
    }

    if ((summary.used + delta) <= summary.limit) {
        return { allowed: true, entitlements, summary };
    }

    return {
        allowed: false,
        entitlements,
        summary,
        error: {
            status: 'error',
            code: 'LIMIT_REACHED',
            limit: featureKey,
            message: definition.message(summary.limit),
        },
    };
}

async function reserveWorkspaceQuotaUsage(workspaceId, featureKey, options = {}) {
    const definition = FEATURE_DEFINITIONS[featureKey];
    if (!definition || definition.category !== 'quota') {
        return { persisted: false, count: null };
    }

    const entitlements = options.entitlements || await getWorkspacePlanAndLimits(workspaceId, options);
    const summary = getFeatureUsageSummary(entitlements, featureKey);
    const result = featureKey === 'interviews'
        ? await incrementWorkspaceInterviewUsage(workspaceId, entitlements?.billing)
        : await incrementWorkspacePeriodUsage(
            workspaceId,
            definition.periodUsageKey,
            entitlements?.billing,
            Math.max(1, normalizeCount(options.amount, 1))
        );

    if (result.persisted || summary?.limit == null) {
        return result;
    }

    throw new Error(`Billing period usage storage is not available for ${featureKey}. Apply the latest billing migrations first.`);
}

module.exports = {
    PERIOD_USAGE_FEATURE_KEYS,
    assertWorkspaceFeatureLimit,
    buildUsageSummary,
    getFeatureUsageSummary,
    getWorkspaceCreatedInterviewUsage,
    getWorkspacePlanAndLimits,
    getWorkspaceSubscriptionPlan,
    incrementWorkspaceInterviewUsage,
    isMissingDatabaseObjectError,
    isSubscriptionCurrentlyValid,
    reserveWorkspaceQuotaUsage,
};
