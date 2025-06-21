const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.warn('Supabase credentials not found. Using mock mode.');
}

const supabase = createClient(
    supabaseUrl || 'http://localhost:54321',
    supabaseKey || 'mock-key'
);

module.exports = supabase;
