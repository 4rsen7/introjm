const fs = require('fs');
let code = fs.readFileSync('server/modules/research/team/router.js', 'utf8');

code = code.replace("const { error } = await supabaseAdmin.from('workspaces').update({ name: name.trim() }).eq('id', id);", "const { error } = await db.from('workspaces').update({ name: name.trim() }).eq('id', id);");

fs.writeFileSync('server/modules/research/team/router.js', code);
