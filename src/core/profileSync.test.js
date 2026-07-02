import test from "node:test";
import assert from "node:assert/strict";
import { aevumProfilePatchToRow, normalizeAevumProfile } from "./profileSync.js";

test("normalizes shared Aevum profile fields from the cloud row", () => {
  const profile = normalizeAevumProfile({
    display_name: "Wilf",
    birth_date: "1991-05-09",
    gender: "male",
  }, { email: "wilf@example.com" });

  assert.deepEqual(profile, {
    displayName: "Wilf",
    birthDate: "1991-05-09",
    gender: "male",
  });
});

test("falls back to auth metadata and ignores unsupported gender values", () => {
  const profile = normalizeAevumProfile({
    gender: "unknown",
  }, {
    email: "fallback@example.com",
    user_metadata: { full_name: "Fallback Name" },
  });

  assert.deepEqual(profile, {
    displayName: "Fallback Name",
    birthDate: "",
    gender: "",
  });
});

test("converts an empty birth date to null for Supabase date columns", () => {
  assert.deepEqual(aevumProfilePatchToRow({
    displayName: "Wilf",
    birthDate: "",
    gender: "other",
  }), {
    display_name: "Wilf",
    birth_date: null,
    gender: "other",
  });
});
