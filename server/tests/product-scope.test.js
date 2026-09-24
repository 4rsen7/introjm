const test = require('node:test');
const assert = require('node:assert/strict');
const { LEGACY_TABLES, readProductFlags, createLegacyDataClient, verifyProductScope } = require('../productScope');

test('unmigrated deployments retain the original client and default Research off', () => {
    const client = {};
    assert.equal(createLegacyDataClient(client), client);
    assert.deepEqual(readProductFlags({}), { productScopeEnabled: false, researchEnabled: false });
    assert.throws(() => readProductFlags({ RESEARCH_ENABLED: 'true' }), /requires PRODUCT_SCOPE_ENABLED/);
});

test('legacy data operations are routed to SQL-enforced product views', () => {
    const calls = [];
    const client = {
        auth: { marker: 'auth' },
        from(table) {
            assert.equal(this, client);
            calls.push(table);
            return { table };
        },
        rpc(name) { assert.equal(this, client); return name; },
    };
    const scoped = createLegacyDataClient(client, { enabled: true });
    for (const table of LEGACY_TABLES) {
        assert.equal(scoped.from(table).table, `iterojm_${table}`);
    }
    assert.equal(scoped.from('profiles').table, 'profiles');
    assert.equal(scoped.auth, client.auth);
    assert.equal(scoped.rpc('existing_rpc'), 'existing_rpc');
    assert.equal(calls.length, LEGACY_TABLES.size + 1);
});

test('Research uses its explicitly injected raw client, never a mutable global switch', () => {
    const raw = { from: (table) => table };
    const legacy = createLegacyDataClient(raw, { enabled: true });
    assert.equal(legacy.from('interviews'), 'iterojm_interviews');
    assert.equal(raw.from('interviews'), 'interviews');
    assert.deepEqual(readProductFlags({ PRODUCT_SCOPE_ENABLED: 'true', RESEARCH_ENABLED: 'true' }), {
        productScopeEnabled: true, researchEnabled: true,
    });
});

test('startup refuses unscoped legacy routes after any Research data exists', async () => {
    const fake = (result) => ({ from: () => ({ select() { return this; }, eq() { return this; }, limit: async () => result }) });
    await verifyProductScope(fake({ error: { code: '42703', message: 'column product_key does not exist' } }), { productScopeEnabled: false });
    await verifyProductScope(fake({ data: [] }), { productScopeEnabled: false });
    await assert.rejects(verifyProductScope(fake({ data: [{ id: 'research' }] }), { productScopeEnabled: false }), /Keep PRODUCT_SCOPE_ENABLED/);
    await assert.rejects(verifyProductScope(fake({ error: { code: 'ETIMEDOUT' } }), { productScopeEnabled: false }), /Could not verify/);
    await assert.rejects(verifyProductScope(fake({ error: { code: '42P01' } }), { productScopeEnabled: true }), /views are not ready/);
    await verifyProductScope(fake({ data: [] }), { productScopeEnabled: true });
});
