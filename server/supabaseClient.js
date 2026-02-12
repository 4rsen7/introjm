require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

if (!supabaseKey) {
    console.error('❌ CRITICAL ERROR: SUPABASE_SERVICE_KEY is missing in .env file!');
} else {
    console.log('✅ Supabase Client initialized. Key length:', supabaseKey.length);
}

const supabase = createClient(supabaseUrl, supabaseKey);

module.exports = supabase;