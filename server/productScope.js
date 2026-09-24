// Keep legacy routes on the IteroJM database surface after Research is enabled.
// The corresponding SQL views enforce scope for reads AND writes, including
// owner-id fallbacks and subscription cancellation in older route handlers.
const LEGACY_TABLES = new Set([
    'workspaces', 'workspace_members', 'workspace_invites',
    'plans', 'subscriptions', 'interviews', 'interview_folders',
    'journeys', 'personas', 'portraits', 'metrics',
    'workspace_period_usage', 'workspace_usage_counters',
]);

function readProductFlags(env = process.env) {
    const productScopeEnabled = env.PRODUCT_SCOPE_ENABLED === 'true';
    const researchEnabled = env.RESEARCH_ENABLED === 'true';
    if (researchEnabled && !productScopeEnabled) {
        throw new Error('RESEARCH_ENABLED requires PRODUCT_SCOPE_ENABLED and the Research migrations.');
    }
    return { productScopeEnabled, researchEnabled };
}

function createLegacyDataClient(client, { enabled = false } = {}) {
    if (!enabled) return client;
    return new Proxy(client, {
        get(target, key) {
            if (key === 'from') {
                return (table) => target.from(LEGACY_TABLES.has(table) ? `iterojm_${table}` : table);
            }
            const value = Reflect.get(target, key, target);
            return typeof value === 'function' ? value.bind(target) : value;
        },
    });
}

async function verifyProductScope(client, { productScopeEnabled }) {
    if (productScopeEnabled) {
        const { error } = await client.from('iterojm_workspaces').select('id').limit(0);
        if (error) throw new Error('Product-scoped database views are not ready. Apply and verify both Research migrations.');
        return;
    }
    // A disabled feature flag must never re-expose Research rows to old routes.
    for (const table of ['workspaces', 'plans', 'subscriptions']) {
        const { data, error } = await client.from(table).select('id').eq('product_key', 'research').limit(1);
        const missingProductColumn = ['42703', 'PGRST204'].includes(error?.code)
            && String(error.message || '').includes('product_key');
        if (missingProductColumn) continue; // Pre-migration IteroJM installation.
        if (error) throw new Error('Could not verify product isolation before starting the server.');
        if (data?.length) throw new Error('Research data exists. Keep PRODUCT_SCOPE_ENABLED=true, even when RESEARCH_ENABLED=false.');
    }
}

module.exports = { LEGACY_TABLES, readProductFlags, createLegacyDataClient, verifyProductScope };
