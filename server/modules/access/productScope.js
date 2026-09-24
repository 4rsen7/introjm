const PRODUCTS = Object.freeze({ ITEROJM: 'iterojm', RESEARCH: 'research' });

class ResearchError extends Error {
    constructor(status, code, message) {
        super(message);
        this.status = status;
        this.code = code;
    }
}

function assertProduct(product) {
    if (!Object.values(PRODUCTS).includes(product)) throw new Error('Unknown product scope');
    return product;
}

function assertDatabaseResult(result) {
    if (result.error) throw result.error;
    return result.data;
}

// Missing product columns are deliberately NOT ignored: callers opting in to product
// scoping must apply the migration. Legacy callers keep their flag-off path unchanged.
async function listProductWorkspaces(db, userId, product = PRODUCTS.RESEARCH) {
    assertProduct(product);
    const [ownedResult, membershipsResult] = await Promise.all([
        db.from('workspaces').select('id,name,owner_id,product_key').eq('owner_id', userId).eq('product_key', product),
        db.from('workspace_members').select('workspace_id,role').eq('user_id', userId),
    ]);
    const owned = assertDatabaseResult(ownedResult) || [];
    const memberships = assertDatabaseResult(membershipsResult) || [];
    const ownedIds = new Set(owned.map((workspace) => workspace.id));
    const membershipIds = [...new Set(memberships.map((row) => row.workspace_id))].filter((id) => !ownedIds.has(id));
    const memberWorkspaces = membershipIds.length
        ? assertDatabaseResult(await db.from('workspaces').select('id,name,owner_id,product_key').in('id', membershipIds).eq('product_key', product)) || []
        : [];
    const roles = new Map(memberships.map((row) => [row.workspace_id, row.role || 'member']));
    return [
        ...owned.map((workspace) => ({ ...workspace, role: 'owner' })),
        ...memberWorkspaces.map((workspace) => ({ ...workspace, role: roles.get(workspace.id) })),
    ];
}

async function requireProductWorkspace(db, userId, workspaceId, product = PRODUCTS.RESEARCH) {
    assertProduct(product);
    const workspace = assertDatabaseResult(await db.from('workspaces')
        .select('id,name,owner_id,product_key').eq('id', workspaceId).eq('product_key', product).maybeSingle());
    if (!workspace) throw new ResearchError(404, 'NOT_FOUND', 'Workspace not found');
    if (workspace.owner_id === userId) return { ...workspace, role: 'owner' };
    const membership = assertDatabaseResult(await db.from('workspace_members')
        .select('role').eq('workspace_id', workspaceId).eq('user_id', userId).maybeSingle());
    if (!membership) throw new ResearchError(404, 'NOT_FOUND', 'Workspace not found');
    return { ...workspace, role: membership.role || 'member' };
}

module.exports = { PRODUCTS, ResearchError, assertDatabaseResult, listProductWorkspaces, requireProductWorkspace };
