import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { existsSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let _supabase = null;
let _envLoaded = false;
let _diagAttempts = [];

/**
 * Self-healing env loader: tries multiple locations for the .env file.
 */
function tryLoadEnv() {
  if (_envLoaded) return;
  _envLoaded = true;

  _diagAttempts = [];
  const addDiag = (p, success, err) => _diagAttempts.push({ path: p, success, error: err });

  // If already set by main.js (via fork env), don't reload .env unless necessary
  if ((process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL) && 
      (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SERVICE_ROLE_KEY)) {
     console.log('[Supabase] Credentials already present in process.env');
     addDiag("PROCESS_ENV", true);
     return; 
  }

  const candidates = [
    // 1. Electron production: resourcesPath passed by main.cjs
    process.env.RESOURCES_PATH ? path.join(process.env.RESOURCES_PATH, '.env') : null,
    // 2. Common Electron resource root
    path.join(process.cwd(), 'resources', '.env'),
    // 3. Fallback: current directory or repo root
    path.join(process.cwd(), '.env'),
    path.join(__dirname, '..', '.env'),
    path.join(__dirname, '..', '..', '.env'),
  ].filter(Boolean);

  console.log('[Supabase] Searching for .env in candidates...');
  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      const result = dotenv.config({ path: candidate, override: true });
      if (!result.error) {
        console.log(`[Supabase] SUCCESS: Loaded env from ${candidate}`);
        addDiag(candidate, true);
        return;
      } else {
        console.warn(`[Supabase] FAILED to parse ${candidate}: ${result.error.message}`);
        addDiag(candidate, false, result.error.message);
      }
    } else {
      addDiag(candidate, false, "File not found");
    }
  }

  console.warn('[Supabase] WARNING: Could not find any .env file. Credentials must be provided via process.env.');
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
    errorMessage: !url ? 'Missing SUPABASE_URL' : (!key ? 'Missing SUPABASE_SERVICE_ROLE_KEY' : null),
    diagAttempts: _diagAttempts,
    cwd: process.cwd(),
    nodeVersion: process.version,
    env: {
       VITE_SUPABASE_URL: url ? `${url.substring(0, 15)}...` : null,
       SUPABASE_SERVICE_ROLE_KEY: key ? "PRESENT (hidden)" : null
    }
  };
};
