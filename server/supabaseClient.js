import { createClient } from '@supabase/supabase-js';

let _supabase = null;

/** 
 * Lazily initialize the Supabase client when first requested.
 * This ensures process.env is fully loaded before we read from it.
 */
function getSupabaseClient() {
  if (_supabase) return _supabase;

  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (supabaseUrl && supabaseServiceKey) {
    _supabase = createClient(supabaseUrl, supabaseServiceKey);
    const maskedKey = supabaseServiceKey.substring(0, 10) + '...';
    console.log(`[Supabase] Backend client initialized with URL: ${supabaseUrl} and Key: ${maskedKey}`);
  } else {
    // Note: Use log levels appropriately; sync won't work but app won't crash
    console.warn('[Supabase] Missing credentials (VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY) — sync features disabled');
    if (!supabaseUrl) console.warn('[Supabase] VITE_SUPABASE_URL is missing');
    if (!supabaseServiceKey) console.warn('[Supabase] SUPABASE_SERVICE_ROLE_KEY is missing');
  }

  return _supabase;
}

// Proxy exports to maintain current API while enabling lazy initialization
export const supabase = {
  from: (...args) => {
    const client = getSupabaseClient();
    if (!client) throw new Error('Supabase is not configured');
    return client.from(...args);
  },
  auth: {
    // Add auth proxy if needed in the future
  }
};

/** Returns true if the Supabase client is configured and available */
export const isSupabaseConfigured = () => {
  return getSupabaseClient() !== null;
};
