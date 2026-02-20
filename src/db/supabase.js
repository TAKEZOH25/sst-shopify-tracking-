require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY; // Use Service Role Key for backend processing

if (!supabaseUrl || !supabaseKey) {
    console.error('[SUPABASE] Missing API credentials in .env');
    // We don't throw here to allow app to start even if DB is not configured yet, 
    // but worker will fail if it tries to use it.
}

const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: {
        autoRefreshToken: false,
        persistSession: false
    }
});

module.exports = supabase;
