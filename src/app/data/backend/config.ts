/**
 * Backend config seam.
 *
 * The app runs in demo mode (in-memory, per-browser) until BOTH env values are
 * present — then Supabase becomes the team's single source of truth. See
 * docs/SUPABASE_SETUP.md; no code changes required to switch.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const isSupabaseConfigured = Boolean(url && anonKey);

let client: SupabaseClient | null = null;

export function getSupabaseClient(): SupabaseClient {
  if (!isSupabaseConfigured) {
    throw new Error("Supabase is not configured (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY).");
  }
  if (!client) {
    client = createClient(url!, anonKey!);
  }
  return client;
}
