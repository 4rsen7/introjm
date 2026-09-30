const fs = require('fs');
let code = fs.readFileSync('server/modules/research/team/router.js', 'utf8');

const putRoute = `    router.put('/workspaces/:id', auth, route(async (req, res) => {
        const { id } = req.params;
        const { name } = req.body;
        if (!name || typeof name !== 'string') throw new ResearchError(400, 'VALIDATION_FAILED', 'Invalid workspace name');
        const { data: member } = await db.from('workspace_members').select('role').eq('workspace_id', id).eq('user_id', req.researchUser.id).maybeSingle();
        if (member?.role !== 'owner') throw new ResearchError(403, 'RESEARCH_ACCESS_DENIED', 'Only workspace owners can rename workspaces');
        
        const { error } = await supabaseAdmin.from('workspaces').update({ name: name.trim() }).eq('id', id);
        if (error) throw error;
        
        return send(res, { status: 'success' }, 200);
    }));\n`;

code = code.replace("    router.get('/workspaces/:id/invites', auth, route(async (req, res) => {", putRoute + "    router.get('/workspaces/:id/invites', auth, route(async (req, res) => {");

fs.writeFileSync('server/modules/research/team/router.js', code);
