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
  // Prioritize VITE_ prefixed to match frontend env for consistency
  const supabaseUrl = (process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL)?.trim();
  const supabaseServiceKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SERVICE_ROLE_KEY)?.trim();

  if (supabaseUrl && supabaseServiceKey) {
    // Validate basics
    if (!supabaseUrl.startsWith('http')) {
      console.error(`[Supabase] Invalid URL format: ${supabaseUrl}`);
      return null;
    }

    try {
      _supabase = createClient(supabaseUrl, supabaseServiceKey, {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      });
      const maskedKey = supabaseServiceKey.substring(0, 8) + '...';
      console.log(`[Supabase] Client initialized successfully. URL: ${supabaseUrl}, Role: Service`);
    } catch (err) {
      console.error('[Supabase] Client creation failed:', err.message);
      return null;
    }
  } else {
    // Log helpful troubleshooting notes
    console.warn('[Supabase] Missing credentials for cloud sync:');
    if (!supabaseUrl) console.warn('  -> URL: Missing (Set VITE_SUPABASE_URL or SUPABASE_URL)');
    if (!supabaseServiceKey) console.warn('  -> Key: Missing (Set SUPABASE_SERVICE_ROLE_KEY)');
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
  auth: {
    signInWithPassword: (...args) => {
      const client = getSupabaseClient();
      if (!client) throw new Error('Supabase is not configured');
      return client.auth.signInWithPassword(...args);
    }
  }
};

/** Returns true if the Supabase client is configured and available */
export const isSupabaseConfigured = () => getSupabaseClient() !== null;

/** Diagnostic info (safe to expose — no secrets) */
export const getSupabaseDiagnostics = () => {
  const url = (process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '').trim();
  const key = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  
  return {
    configured: isSupabaseConfigured(),
    hasUrl: !!url,
    hasServiceKey: !!key,
    urlValid: url.startsWith('http'),
    keyLength: key.length,
    resourcesPath: process.env.RESOURCES_PATH || '(not set)',
    urlPrefix: url.substring(0, 20) || '(missing)',
    errorMessage: !url ? 'Missing SUPABASE_URL' : (!key ? 'Missing SUPABASE_SERVICE_ROLE_KEY' : null)
  };
};
