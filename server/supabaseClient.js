import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { existsSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let _supabase = null;
let _envLoaded = false;

/**
 * Self-healing env loader: tries multiple locations for the .env file.
 * Called lazily only when Supabase vars are missing — handles the case where
 * ES module hoisting caused supabaseClient.js to be evaluated before
 * server/index.js ran dotenv.config(), or where fork() env passing failed.
 */
function tryLoadEnv() {
  if (_envLoaded) return;
  _envLoaded = true;

  if (process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL) return; // Already set

  const candidates = [
    // 1. Electron production: resourcesPath passed by main.cjs
    process.env.RESOURCES_PATH ? path.join(process.env.RESOURCES_PATH, '.env') : null,
    // 2. Dev / standalone: project root (server/../.env)
    path.join(__dirname, '..', '.env'),
    // 3. Fallback: wherever node's CWD is
    path.join(process.cwd(), '.env'),
  ].filter(Boolean);

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      const result = dotenv.config({ path: candidate, override: true });
      if (!result.error) {
        console.log(`[Supabase] Loaded env from: ${candidate}`);
        return;
      }
    }
  }

  console.warn('[Supabase] Could not find a .env file in any expected location.');
}

/** 
 * Lazily initialize the Supabase client when first requested.
 * Supports both VITE_SUPABASE_URL and SUPABASE_URL for flexibility.
 * Does NOT cache a failed (null) result — retries every call until credentials are available.
 */
function getSupabaseClient() {
  // Return cached working client
  if (_supabase) return _supabase;

  // Self-heal: attempt to load .env if Supabase vars are not present
  if (!process.env.VITE_SUPABASE_URL && !process.env.SUPABASE_URL) {
    tryLoadEnv();
  }

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
      console.log(`[Supabase] Client initialized successfully. URL: ${supabaseUrl}`);
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
