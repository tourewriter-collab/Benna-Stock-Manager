import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

let supabase = null;

if (supabaseUrl && supabaseServiceKey) {
  supabase = createClient(supabaseUrl, supabaseServiceKey);
  const maskedKey = supabaseServiceKey.substring(0, 10) + '...';
  console.log(`[Supabase] Backend client initialized with URL: ${supabaseUrl} and Key: ${maskedKey}`);
} else {
  console.warn('[Supabase] Missing credentials (VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY) — sync features disabled');
  if (!supabaseUrl) console.warn('[Supabase] VITE_SUPABASE_URL is missing');
  if (!supabaseServiceKey) console.warn('[Supabase] SUPABASE_SERVICE_ROLE_KEY is missing');
}

export { supabase };

/** Returns true if the Supabase client is configured and available */
export const isSupabaseConfigured = () => supabase !== null;
