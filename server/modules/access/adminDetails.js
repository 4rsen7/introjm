// Explicit hydration works for both base tables and product-scoped views. It
// avoids relying on PostgREST discovering foreign keys through filtered views.
async function loadAdminUserDetails(db, userId) {
    const rows = async (query) => {
        const { data, error } = await query;
        if (error) throw error;
        return data || [];
    };
    const [owned, joined, subscriptions] = await Promise.all([
        rows(db.from('workspaces').select('*').eq('owner_id', userId)),
        rows(db.from('workspace_members').select('workspace_id,role,joined_at').eq('user_id', userId)),
        rows(db.from('subscriptions').select('*').eq('user_id', userId).order('created_at', { ascending: false })),
    ]);
    const [members, workspaces, plans] = await Promise.all([
        owned.length ? rows(db.from('workspace_members').select('workspace_id').in('workspace_id', owned.map(w => w.id))) : [],
        joined.length ? rows(db.from('workspaces').select('*').in('id', joined.map(m => m.workspace_id))) : [],
        subscriptions.length ? rows(db.from('plans').select('id,name,price_monthly').in('id', [...new Set(subscriptions.map(s => s.plan_id).filter(Boolean))])) : [],
    ]);
    const workspaceMap = new Map(workspaces.map(w => [w.id, w]));
    const planMap = new Map(plans.map(({ id, ...plan }) => [id, plan]));
    return {
        owned_workspaces: owned.map(w => ({ ...w, workspace_members: [{ count: members.filter(m => m.workspace_id === w.id).length }] })),
        joined_workspaces: joined.filter(m => workspaceMap.has(m.workspace_id)).map(({ role, joined_at, workspace_id }) => ({ role, joined_at, workspaces: workspaceMap.get(workspace_id) })),
        subscriptions: subscriptions.map(s => ({ ...s, plans: planMap.get(s.plan_id) || null })),
    };
}

module.exports = { loadAdminUserDetails };
