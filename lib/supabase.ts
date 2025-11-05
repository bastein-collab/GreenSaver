// lib/supabase.ts
import { createClient } from "@supabase/supabase-js";

const url = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const anon = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;

// If envs are missing, we'll still allow the app to run (the services return fallback data)
export const supabase =
  url && anon ? createClient(url, anon) : ({} as any);
