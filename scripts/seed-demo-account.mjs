import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import {
  DEMO_ACCOUNTS,
  DEMO_BUDGETS,
  demoTransactionsForMonth,
} from "../src/core/demoData.js";
import { normalizeAccounts, normalizeTransaction } from "../src/core/ledger.js";
import { pushCloudState } from "../src/core/cloudSync.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  const raw = fs.readFileSync(filePath, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;
    const [, key, value] = match;
    const parsedValue = value.trim().replace(/^['"]|['"]$/g, "");
    if (!parsedValue || process.env[key]) continue;
    process.env[key] = parsedValue;
  }
}

loadEnvFile(path.join(rootDir, ".env.local"));
loadEnvFile(path.join(rootDir, ".env"));
if (process.env.VIATICA_ENV_FILE) {
  loadEnvFile(process.env.VIATICA_ENV_FILE);
}

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "";
const anonKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || "";
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const demoEmail = process.env.VIATICA_DEMO_EMAIL || "demo@demo.com";
const demoPassword = process.env.VIATICA_DEMO_PASSWORD || "";

if (!supabaseUrl || !anonKey) {
  throw new Error("Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY.");
}

if (!demoPassword) {
  throw new Error("Missing VIATICA_DEMO_PASSWORD.");
}

function createSupabaseClient(key) {
  return createClient(supabaseUrl, key, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  });
}

async function findUserByEmail(adminClient, email) {
  let page = 1;
  while (page < 20) {
    const { data, error } = await adminClient.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    const user = data.users.find((item) => item.email?.toLowerCase() === email.toLowerCase());
    if (user) return user;
    if (data.users.length < 1000) return null;
    page += 1;
  }
  return null;
}

async function ensureDemoUserWithAdmin(adminClient) {
  const existing = await findUserByEmail(adminClient, demoEmail);
  if (existing) {
    const { data, error } = await adminClient.auth.admin.updateUserById(existing.id, {
      password: demoPassword,
      email_confirm: true,
      user_metadata: { display_name: "Viatica Demo" },
    });
    if (error) throw error;
    return data.user;
  }

  const { data, error } = await adminClient.auth.admin.createUser({
    email: demoEmail,
    password: demoPassword,
    email_confirm: true,
    user_metadata: { display_name: "Viatica Demo" },
  });
  if (error) throw error;
  return data.user;
}

async function ensureDemoUserWithAnon(publicClient) {
  const signUp = await publicClient.auth.signUp({
    email: demoEmail,
    password: demoPassword,
    options: {
      data: { display_name: "Viatica Demo" },
    },
  });
  if (signUp.error && !/already|registered|exists/i.test(signUp.error.message || "")) {
    throw signUp.error;
  }

  const { data, error } = await publicClient.auth.signInWithPassword({
    email: demoEmail,
    password: demoPassword,
  });
  if (error) throw error;
  return data.user;
}

async function saveDemoProfile(client, userId) {
  const row = {
    display_name: "Viatica Demo",
    birth_date: null,
    gender: "",
  };
  const existing = await client
    .from("profiles")
    .select("id")
    .eq("id", userId)
    .maybeSingle();
  if (existing.error) throw existing.error;

  const query = existing.data
    ? client.from("profiles").update(row).eq("id", userId)
    : client.from("profiles").insert({ id: userId, ...row });
  const { error } = await query;
  if (error) throw error;
}

function buildDemoLedgerState(now = new Date()) {
  return {
    transactions: demoTransactionsForMonth(now).map((txn) => normalizeTransaction(txn, now)),
    budgets: { ...DEMO_BUDGETS },
    accounts: normalizeAccounts(DEMO_ACCOUNTS, [], now),
    preferences: {
      deletedTransactionIds: [],
    },
  };
}

const adminClient = serviceRoleKey ? createSupabaseClient(serviceRoleKey) : null;
const publicClient = createSupabaseClient(anonKey);
const user = adminClient
  ? await ensureDemoUserWithAdmin(adminClient)
  : await ensureDemoUserWithAnon(publicClient);
const writeClient = adminClient || publicClient;
const state = buildDemoLedgerState();

try {
  await saveDemoProfile(writeClient, user.id);
} catch (error) {
  console.warn(`Skipped demo profile seed: ${error.message}`);
}
await pushCloudState(writeClient, user.id, state);

console.log(`Seeded ${demoEmail}`);
console.log(`user_id=${user.id}`);
console.log(`transactions=${state.transactions.length}`);
console.log(`accounts=${state.accounts.length}`);
console.log(`budgets=${Object.keys(state.budgets).length}`);
