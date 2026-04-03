import { createClient } from '@supabase/supabase-js';

let _supabase = null;

/** 
 * Lazily initialize the Supabase client when first requested.
 * Supports both VITE_SUPABASE_URL and SUPABASE_URL for flexibility.
 * Does NOT cache a failed (null) result — retries every call until credentials are available.
 */
function getSupabaseClient() {
  // Return cached working client
  if (_supabase) return _supabase;

  // Check multiple possible env var names for URL and key
  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (supabaseUrl && supabaseServiceKey) {
    _supabase = createClient(supabaseUrl, supabaseServiceKey);
    const maskedKey = supabaseServiceKey.substring(0, 10) + '...';
    console.log(`[Supabase] Client initialized. URL: ${supabaseUrl}, Key: ${maskedKey}`);
  } else {
    // Log which specific vars are missing to aid debugging
    console.warn('[Supabase] Cannot initialize — missing credentials:');
    if (!supabaseUrl) console.warn('  VITE_SUPABASE_URL =', process.env.VITE_SUPABASE_URL, '| SUPABASE_URL =', process.env.SUPABASE_URL);
    if (!supabaseServiceKey) console.warn('  SUPABASE_SERVICE_ROLE_KEY =', process.env.SUPABASE_SERVICE_ROLE_KEY ? '[SET]' : '[MISSING]');
    // Do NOT cache null — allow retry on next request
    return null;
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
  auth: {}
};

/** Returns true if the Supabase client is configured and available */
export const isSupabaseConfigured = () => getSupabaseClient() !== null;

/** Diagnostic info (safe to expose — no secrets) */
export const getSupabaseDiagnostics = () => ({
  configured: isSupabaseConfigured(),
  hasUrl: !!(process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL),
  hasServiceKey: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
  resourcesPath: process.env.RESOURCES_PATH || '(not set)',
  urlPrefix: (process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '').substring(0, 20) || '(missing)',
});
