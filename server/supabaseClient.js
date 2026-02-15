require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

if (!supabaseKey) {
    console.error('❌ CRITICAL ERROR: SUPABASE_SERVICE_KEY is missing in .env file!');
} else {
    if (String(supabaseKey).startsWith('sb_publishable_') || String(supabaseKey).includes('anon')) {
        console.warn('⚠️ SUPABASE_SERVICE_KEY looks like the ANON (publishable) key. Use the service_role key (sb_secret_...) or owner name, plan limits and other data may not load.');
    }
    console.log('✅ Supabase Client initialized. Key length:', supabaseKey.length);
}

const supabase = createClient(supabaseUrl, supabaseKey);

module.exports = supabase;