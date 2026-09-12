import { createClient } from "@supabase/supabase-js";

const testMode = typeof window !== "undefined"
  && new URLSearchParams(window.location.search).get("mode") === "test";
const supabaseMode = testMode ? "test" : "production";
const supabaseUrl = testMode ? import.meta.env.VITE_SUPABASE_TEST_URL : import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = testMode ? import.meta.env.VITE_SUPABASE_TEST_ANON_KEY : import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);
export { supabaseMode };

export const supabase = supabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        storageKey: `sakura-timecard-auth-${supabaseMode}`,
      },
    })
  : null;
