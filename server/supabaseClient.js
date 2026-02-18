require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseKey) {
    console.error('❌ CRITICAL ERROR: SUPABASE_SERVICE_KEY is missing in .env file!');
} else {
    if (String(supabaseKey).startsWith('sb_publishable_') || String(supabaseKey).includes('anon')) {
        console.warn('⚠️ SUPABASE_SERVICE_KEY looks like the ANON (publishable) key. Use the service_role key (sb_secret_...) or set SUPABASE_SERVICE_ROLE_KEY for workspace/subscription creation.');
    }
    console.log('✅ Supabase Client initialized. Key length:', supabaseKey.length);
}

const supabase = createClient(supabaseUrl, supabaseKey);
// Client that bypasses RLS: use for creating default workspace and assigning Starter. Prefer SUPABASE_SERVICE_ROLE_KEY if set.
const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey || supabaseKey);
if (serviceRoleKey) console.log('✅ Supabase Admin (RLS-bypass) using SUPABASE_SERVICE_ROLE_KEY');

module.exports = supabase;
module.exports.supabaseAdmin = supabaseAdmin;