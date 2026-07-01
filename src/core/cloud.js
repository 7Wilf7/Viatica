import { createClient } from "@supabase/supabase-js";

const VITE_ENV = import.meta.env || {};
const SUPABASE_URL = VITE_ENV.VITE_SUPABASE_URL || "";
const SUPABASE_ANON_KEY = VITE_ENV.VITE_SUPABASE_ANON_KEY || "";

let client = null;

export function isCloudAuthConfigured() {
  return Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
}

export function getCloudClient() {
  if (!isCloudAuthConfigured()) return null;
  if (!client) {
    client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        autoRefreshToken: true,
        detectSessionInUrl: true,
        persistSession: true,
      },
    });
  }
  return client;
}

export async function getCloudSession() {
  const supabase = getCloudClient();
  if (!supabase) return null;
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  return data.session || null;
}

export async function getCloudUser() {
  const supabase = getCloudClient();
  if (!supabase) return null;
  const { data, error } = await supabase.auth.getUser();
  if (error) throw error;
  return data.user || null;
}

export function onCloudAuthStateChange(callback) {
  const supabase = getCloudClient();
  if (!supabase) return () => {};
  const { data } = supabase.auth.onAuthStateChange((_event, session) => {
    callback(session || null);
  });
  return () => data.subscription.unsubscribe();
}

export async function signInToAevum(email, password) {
  const supabase = getCloudClient();
  if (!supabase) throw new Error("Supabase is not configured");
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });
  if (error) throw error;
  return data.session || null;
}

export async function signOutFromAevum() {
  const supabase = getCloudClient();
  if (!supabase) return;
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

export async function sendAevumPasswordReset(email) {
  const supabase = getCloudClient();
  if (!supabase) throw new Error("Supabase is not configured");
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: window.location.origin,
  });
  if (error) throw error;
}
