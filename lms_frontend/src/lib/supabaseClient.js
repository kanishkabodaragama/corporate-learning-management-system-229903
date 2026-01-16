import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.REACT_APP_SUPABASE_URL;
const SUPABASE_KEY = process.env.REACT_APP_SUPABASE_KEY;

// PUBLIC_INTERFACE
/**
 * True when required Supabase env vars are present.
 * In deployments, these should always be set.
 *
 * @returns {boolean}
 */
export const isSupabaseConfigured = Boolean(SUPABASE_URL && SUPABASE_KEY);

/**
 * NOTE:
 * Supabase client creation throws if the URL is invalid (e.g. empty string).
 * To keep the app renderable in CI/tests even when env vars are not set yet,
 * we use a safe local fallback.
 *
 * IMPORTANT: Configure these env vars in real environments:
 * - REACT_APP_SUPABASE_URL
 * - REACT_APP_SUPABASE_KEY (anon/public key)
 */
const FALLBACK_URL = "http://localhost:54321";
const FALLBACK_KEY = "public-anon-key";

const supabaseUrl = isSupabaseConfigured ? SUPABASE_URL : FALLBACK_URL;
const supabaseKey = isSupabaseConfigured ? SUPABASE_KEY : FALLBACK_KEY;

// PUBLIC_INTERFACE
/**
 * Supabase client used across the app for auth/database access.
 */
export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    // Supabase handles persistence automatically via localStorage.
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

if (!isSupabaseConfigured && typeof window !== "undefined") {
  // eslint-disable-next-line no-console
  console.warn(
    "[Supabase] Missing REACT_APP_SUPABASE_URL / REACT_APP_SUPABASE_KEY. Using local fallback values (auth will not work until configured)."
  );
}
