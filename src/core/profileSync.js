import { getCloudClient, getCloudUser } from "./cloud.js";

const PROFILE_TABLE = "profiles";
const PROFILE_SELECT = "id,display_name,birth_date,gender";

export const EMPTY_AEVUM_PROFILE = {
  displayName: "",
  birthDate: "",
  gender: "",
};

function cleanText(value) {
  return String(value || "").trim();
}

function emailName(user) {
  const email = cleanText(user?.email);
  return email ? email.split("@")[0] : "";
}

export function normalizeAevumProfile(row = {}, user = null) {
  const meta = user?.user_metadata || {};
  return {
    displayName: cleanText(row.display_name || meta.display_name || meta.full_name || meta.name || emailName(user)),
    birthDate: cleanText(row.birth_date),
    gender: ["male", "female", "other"].includes(row.gender) ? row.gender : "",
  };
}

export function aevumProfilePatchToRow(patch = {}) {
  const birthDate = cleanText(patch.birthDate);
  return {
    display_name: cleanText(patch.displayName),
    birth_date: birthDate || null,
    gender: ["male", "female", "other"].includes(patch.gender) ? patch.gender : "",
  };
}

export async function fetchAevumProfile() {
  const supabase = getCloudClient();
  if (!supabase) throw new Error("Supabase is not configured");
  const user = await getCloudUser();
  if (!user) throw new Error("Not authenticated");

  const { data, error } = await supabase
    .from(PROFILE_TABLE)
    .select(PROFILE_SELECT)
    .eq("id", user.id)
    .maybeSingle();
  if (error) throw error;
  return normalizeAevumProfile(data || {}, user);
}

export async function saveAevumProfile(patch) {
  const supabase = getCloudClient();
  if (!supabase) throw new Error("Supabase is not configured");
  const user = await getCloudUser();
  if (!user) throw new Error("Not authenticated");

  const row = aevumProfilePatchToRow(patch);
  const existing = await supabase
    .from(PROFILE_TABLE)
    .select("id")
    .eq("id", user.id)
    .maybeSingle();
  if (existing.error) throw existing.error;

  const query = existing.data
    ? supabase.from(PROFILE_TABLE).update(row).eq("id", user.id)
    : supabase.from(PROFILE_TABLE).insert({ id: user.id, ...row });
  const { data, error } = await query.select(PROFILE_SELECT).maybeSingle();
  if (error) throw error;
  return normalizeAevumProfile(data || { ...row }, user);
}
