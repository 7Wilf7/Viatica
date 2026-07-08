import "./styles.css";
import { Capacitor, registerPlugin } from "@capacitor/core";
import { thiingsIconUrls } from "./assets/thiings/index.js";
import { productLogoUrl } from "./assets/logo.js";
import {
  CATEGORIES,
  DEFAULT_BUDGETS,
  EXPENSE_CATEGORY_ALIASES,
  EXPENSE_CATEGORIES,
  INCOME_CATEGORIES,
  TRANSACTION_TYPES,
} from "./core/constants.js";
import { exportTransactionsCsv, importTransactionsCsv } from "./core/csv.js";
import {
  getCloudSession,
  isCloudTimeoutError,
  isCloudAuthConfigured,
  onCloudAuthStateChange,
  sendAevumPasswordReset,
  signInToAevum,
  signOutFromAevum,
} from "./core/cloud.js";
import {
  deleteCloudTransaction,
  hasDemoSeedArtifacts,
  isCloudUserChangedError,
  mergePendingLocalTransactions,
  saveCloudTransaction,
  stripDemoSeedArtifacts,
  syncViaticaLedger,
} from "./core/cloudSync.js";
import { formatCurrency, monthKey, todayKey, toDateInputValue, transactionSign } from "./core/format.js";
import {
  EMPTY_AEVUM_PROFILE,
  fetchAevumProfile,
  saveAevumProfile,
} from "./core/profileSync.js";
import {
  filterTransactions,
  isProjectOnlyTransaction,
  normalizeBudgets,
  normalizeProjectLabel,
  normalizeTransaction,
  projectLabelFromTags,
  summarizeLedger,
} from "./core/ledger.js";
import {
  DEFAULT_LEDGER_PERIOD,
  ledgerPeriodRange,
  ledgerPeriodsEqual,
  normalizeLedgerPeriod,
  pastMonths,
  pastYears,
} from "./core/period.js";
import {
  EMPTY_STATE,
  exportState,
  hasStateForOwner,
  loadState,
  loadStateForOwner,
  saveStateForOwner,
} from "./core/storage.js";

const app = document.querySelector("#app");
const LOCALES = [
  { id: "zh", label: "中" },
  { id: "en", label: "EN" },
];
const PRODUCT_NAME = "Viatica";
const APP_VERSION = typeof __APP_VERSION__ === "string" ? __APP_VERSION__ : "0.1.0";
const GITHUB_RELEASES_API = "https://api.github.com/repos/7Wilf7/Viatica/releases/latest";
const SUPABASE_PUBLIC_URL = (import.meta.env?.VITE_SUPABASE_URL || "").replace(/\/+$/, "");
const MIRROR_APK_URL = SUPABASE_PUBLIC_URL
  ? `${SUPABASE_PUBLIC_URL}/storage/v1/object/public/releases/viatica-latest.apk`
  : null;
const AUTO_CHECK_CACHE_MS = 30 * 60 * 1000;
const CLOUD_MUTATION_SYNC_DELAY_MS = 250;
const CLOUD_BOOT_SYNC_DELAY_MS = 8000;
const CLOUD_FOREGROUND_SYNC_DELAY_MS = 5000;
const CLOUD_SYNC_TIMEOUT_MS = 12000;
const CLOUD_SYNC_FEEDBACK_MIN_MS = 600;
const CLOUD_SYNC_SUCCESS_HOLD_MS = 900;
const CLOUD_SYNC_ERROR_HOLD_MS = 4000;
const CLOUD_SYNC_RETRY_DELAY_MS = 15000;
const CLOUD_SYNC_DEFERRED_NOTICE_MIN_MS = 5 * 60 * 1000;
const FOREGROUND_SYNC_MIN_MS = 3 * 60 * 1000;
const FOREGROUND_SYNC_RETRY_MIN_MS = 60 * 1000;
const BOOT_REVEAL_MS = 4200;
const DEMO_ACCOUNT_EMAIL = "demo@demo.com";
const ApkInstaller = registerPlugin("ApkInstaller");
const ApkDownloader = registerPlugin("ApkDownloader");
let releaseCheckCache = null;
let cloudSyncTimer = 0;
let cloudSyncFeedbackTimer = 0;
let cloudSyncFeedbackStartedAt = 0;
let cloudSyncDeferredNoticeAt = 0;
let ledgerRevision = 0;
let lastTabTap = { tab: "", at: 0 };
const cloudAuthConfigured = isCloudAuthConfigured();
let bootSplashVisible = true;
let bootSplashDismissTimer = 0;
const bootSplashStartedAt = globalThis.performance?.now?.() || Date.now();
let ledgerStorageOwnerId = "";
let signedOutLedgerDirty = false;
const storedState = loadState();
const storedTransactions = normalizeTransactionList(storedState.transactions);
const state = {
  ...storedState,
  transactions: storedTransactions,
  budgets: storedState.budgets,
  accounts: [],
  activeTab: "ledger",
  filters: {
    query: "",
    type: "all",
    book: "all",
    category: "all",
    account: "all",
    month: monthKey(new Date()),
  },
  searchOpen: false,
  captureDraft: null,
  captureProjectOpen: false,
  budgetKeypadCategory: "",
  budgetDraft: null,
  startingAssetsFormOpen: false,
  editingTransactionId: null,
  pwaRefreshInProgress: false,
  ledgerPeriod: { ...DEFAULT_LEDGER_PERIOD },
  ledgerPeriodDropdown: "",
  ledgerView: "flow",
  settingsContent: "home",
  auth: {
    accountOpen: false,
    busy: false,
    configured: cloudAuthConfigured,
    error: "",
    loginMode: "signin",
    loginOpen: false,
    notice: "",
    ready: !cloudAuthConfigured,
    session: null,
    user: null,
  },
  profile: {
    data: { ...EMPTY_AEVUM_PROFILE },
    draft: { ...EMPTY_AEVUM_PROFILE },
    status: "idle",
    error: "",
  },
  cloudSync: {
    status: "idle",
    lastSyncedAt: "",
    lastAttemptAt: "",
    error: "",
    feedback: false,
    pendingMutation: false,
  },
  update: {
    status: "idle",
    release: null,
    showNotes: false,
    showRecentAction: false,
    installState: "idle",
    installMsg: "",
    downloadPct: null,
    autoCheckStarted: false,
  },
};

state.budgets = normalizeBudgets(state.budgets);
state.preferences = {
  activeBook: "日常账本",
  locale: "zh",
  startingAssets: 0,
  ...state.preferences,
};
delete state.preferences.dataMode;
delete state.preferences.deletedAccounts;
state.preferences.startingAssets = normalizeStartingAssets(state.preferences.startingAssets);
if (!Array.isArray(state.preferences.deletedTransactionIds)) state.preferences.deletedTransactionIds = [];
state.accounts = [];
if (!LOCALES.some((item) => item.id === state.preferences.locale)) state.preferences.locale = "zh";
state.filters.book = "all";
state.filters.account = "all";
state.filters.month = "";

const TABS = [
  { id: "ledger", labelKey: "tab.ledger" },
  { id: "calendar", labelKey: "tab.calendar" },
  { id: "capture", labelKey: "tab.capture" },
  { id: "assets", labelKey: "tab.assets" },
  { id: "settings", labelKey: "tab.settings" },
];

const LEDGER_PERIOD_SEGMENTS = [
  { type: "month", labelKey: "range.month", dropdown: true },
  { type: "week", labelKey: "range.week", dropdown: true },
  { type: "year", labelKey: "range.year", dropdown: true },
  { type: "all", labelKey: "range.all", dropdown: false },
];

const PROFILE_GENDERS = [
  { id: "male", labelKey: "profile.genderMale" },
  { id: "female", labelKey: "profile.genderFemale" },
  { id: "other", labelKey: "profile.genderOther" },
];

const CHART_COLORS = [
  "oklch(0.700 0.052 86)",
  "oklch(0.720 0.090 145)",
  "oklch(0.680 0.090 230)",
  "oklch(0.720 0.090 330)",
  "oklch(0.720 0.100 50)",
  "oklch(0.730 0.080 275)",
];

const LEDGER_VIEWS = [
  { id: "flow", labelKey: "ledger.flow", icon: "flow" },
  { id: "chart", labelKey: "ledger.chart", icon: "chartLine" },
];

const GLYPHS = {
  ledger: `
    <path d="M2.5 2.4 H6 C6.6 2.4 7 2.9 7 3.5 V11.4 C7 10.8 6.5 10.4 5.8 10.4 H2.5 Z" />
    <path d="M11.5 2.4 H8 C7.4 2.4 7 2.9 7 3.5 V11.4 C7 10.8 7.5 10.4 8.2 10.4 H11.5 Z" />
    <path d="M4 5 H5.7" />
    <path d="M8.3 5 H10" />
  `,
  calendar: `
    <rect x="2.2" y="3" width="9.6" height="8.4" rx="1.4" />
    <path d="M4.5 1.8 V4.2" />
    <path d="M9.5 1.8 V4.2" />
    <path d="M2.2 5.4 H11.8" />
    <path d="M4.4 7.6 H4.45" />
    <path d="M7 7.6 H7.05" />
    <path d="M9.6 7.6 H9.65" />
  `,
  plus: `
    <path d="M7 2.5 V11.5" />
    <path d="M2.5 7 H11.5" />
  `,
  search: `
    <circle cx="6.2" cy="6.2" r="3.5" />
    <path d="M8.8 8.8 L11.6 11.6" />
  `,
  flow: `
    <path d="M2.5 3.4 H8.8" />
    <path d="M2.5 7 H11.5" />
    <path d="M2.5 10.6 H7.5" />
    <circle cx="10.8" cy="3.4" r="0.8" fill="currentColor" stroke="none" />
    <circle cx="8.9" cy="10.6" r="0.8" fill="currentColor" stroke="none" />
  `,
  chartPie: `
    <path d="M7 2.2 V7 H11.8" />
    <path d="M11.8 7 C11.8 9.7 9.7 11.8 7 11.8 C4.3 11.8 2.2 9.7 2.2 7 C2.2 4.3 4.3 2.2 7 2.2 Z" />
    <path d="M7 2.2 C9.7 2.2 11.8 4.3 11.8 7" />
  `,
  chartBars: `
    <path d="M2.2 11.4 H11.8" />
    <rect x="3" y="6.6" width="1.6" height="4.4" rx="0.45" />
    <rect x="6.2" y="3.8" width="1.6" height="7.2" rx="0.45" />
    <rect x="9.4" y="5.3" width="1.6" height="5.7" rx="0.45" />
  `,
  chartLine: `
    <path d="M2.2 11.2 H11.8" />
    <path d="M2.8 9.4 L5.1 6.8 L7.3 8.1 L11.2 3.8" />
    <circle cx="5.1" cy="6.8" r="0.65" fill="currentColor" stroke="none" />
    <circle cx="7.3" cy="8.1" r="0.65" fill="currentColor" stroke="none" />
    <circle cx="11.2" cy="3.8" r="0.65" fill="currentColor" stroke="none" />
  `,
  project: `
    <circle cx="7" cy="7" r="4.8" />
    <path d="M7 6.4 V9.5" />
    <path d="M7 4.5 H7.05" />
  `,
  assets: `
    <path d="M2.2 4.2 H11.8 V11.2 H2.2 Z" />
    <path d="M3.2 4.2 V2.8 H9.8 C10.8 2.8 11.4 3.3 11.4 4.2" />
    <path d="M9 7.4 H12.2 V9.4 H9 C8.4 9.4 8 9 8 8.4 C8 7.8 8.4 7.4 9 7.4 Z" />
    <path d="M10 8.4 H10.1" />
  `,
  settings: `
    <circle cx="7" cy="7" r="2" />
    <path d="M7 1.8 V3" />
    <path d="M7 11 V12.2" />
    <path d="M1.8 7 H3" />
    <path d="M11 7 H12.2" />
    <path d="M3.3 3.3 L4.2 4.2" />
    <path d="M9.8 9.8 L10.7 10.7" />
    <path d="M10.7 3.3 L9.8 4.2" />
    <path d="M4.2 9.8 L3.3 10.7" />
  `,
  edit: `
    <path d="M3 10.9 L5.7 10.3 L10.6 5.4 C11.2 4.8 11.2 3.9 10.6 3.4 C10 2.8 9.2 2.8 8.6 3.4 L3.7 8.3 Z" />
    <path d="M8.2 3.8 L10.2 5.8" />
  `,
  trash: `
    <path d="M3.2 4.3 H10.8" />
    <path d="M5.5 2.7 H8.5" />
    <path d="M4.1 4.3 L4.7 11.1 H9.3 L9.9 4.3" />
    <path d="M6.1 6.3 V9.2" />
    <path d="M7.9 6.3 V9.2" />
  `,
  food: `
    <path d="M2.8 6.8 H11.2 C11 9.5 9.3 11.3 7 11.3 C4.7 11.3 3 9.5 2.8 6.8 Z" />
    <path d="M4.2 4.1 C5.4 3.3 8.6 3.3 9.8 4.1" />
    <path d="M3.5 11.3 H10.5" />
    <path d="M11 4.3 L12 3.2" />
  `,
  transport: `
    <path d="M2.5 7.2 L3.7 4.4 C4 3.8 4.5 3.5 5.2 3.5 H8.8 C9.5 3.5 10 3.8 10.3 4.4 L11.5 7.2" />
    <rect x="2.3" y="6.5" width="9.4" height="3.4" rx="1" />
    <path d="M4.2 9.9 V11" />
    <path d="M9.8 9.9 V11" />
    <path d="M4.2 8.2 H4.3" />
    <path d="M9.7 8.2 H9.8" />
  `,
  shopping: `
    <path d="M3 5 H11 L10.2 11.5 H3.8 Z" />
    <path d="M5 5 C5 3.4 5.8 2.5 7 2.5 C8.2 2.5 9 3.4 9 5" />
    <path d="M5.2 7.7 H8.8" />
  `,
  home: `
    <path d="M2.3 6.5 L7 2.7 L11.7 6.5" />
    <path d="M3.5 6.1 V11.2 H10.5 V6.1" />
    <path d="M5.8 11.2 V8.2 H8.2 V11.2" />
  `,
  phone: `
    <rect x="4.3" y="1.9" width="5.4" height="10.2" rx="1.2" />
    <path d="M6.2 3.4 H7.8" />
    <path d="M6.8 10.4 H7.2" />
  `,
  scissors: `
    <circle cx="4.1" cy="10" r="1.3" />
    <circle cx="9.9" cy="10" r="1.3" />
    <path d="M5.1 9 L10.6 3.5" />
    <path d="M8.9 9 L3.4 3.5" />
  `,
  bike: `
    <circle cx="4" cy="9.2" r="2" />
    <circle cx="10" cy="9.2" r="2" />
    <path d="M4 9.2 L6.2 5.6 H8 L10 9.2" />
    <path d="M6.2 5.6 L8.1 9.2 H5.2" />
    <path d="M7.8 4.2 H9.2" />
  `,
  metro: `
    <rect x="3.1" y="2.4" width="7.8" height="7.8" rx="1.5" />
    <path d="M4.8 4.6 H9.2" />
    <path d="M4.7 7.1 H4.75" />
    <path d="M9.2 7.1 H9.25" />
    <path d="M5.2 10.2 L4.3 11.6" />
    <path d="M8.8 10.2 L9.7 11.6" />
  `,
  taxi: `
    <path d="M2.5 7.5 L3.8 4.7 C4.1 4.1 4.6 3.8 5.3 3.8 H8.7 C9.4 3.8 9.9 4.1 10.2 4.7 L11.5 7.5" />
    <rect x="2.3" y="6.8" width="9.4" height="3.2" rx="1" />
    <path d="M5.7 3.8 V2.8 H8.3 V3.8" />
    <path d="M4.2 8.4 H4.25" />
    <path d="M9.8 8.4 H9.85" />
  `,
  shirt: `
    <path d="M5 2.8 C5.5 3.4 6.1 3.7 7 3.7 C7.9 3.7 8.5 3.4 9 2.8 L11.5 4.2 L10.2 6.4 L9.2 5.8 V11.4 H4.8 V5.8 L3.8 6.4 L2.5 4.2 Z" />
  `,
  device: `
    <rect x="3.1" y="3.2" width="7.8" height="7.1" rx="1.1" />
    <path d="M5.2 11.5 H8.8" />
    <path d="M7 10.3 V11.5" />
  `,
  sofa: `
    <path d="M3.2 7.1 V5.2 C3.2 4.4 3.8 3.9 4.6 3.9 H9.4 C10.2 3.9 10.8 4.4 10.8 5.2 V7.1" />
    <path d="M2.4 7.1 H11.6 V10.5 H2.4 Z" />
    <path d="M4.2 10.5 V11.5" />
    <path d="M9.8 10.5 V11.5" />
  `,
  shield: `
    <path d="M7 2.2 L11 3.8 V6.8 C11 9.2 9.4 10.8 7 11.8 C4.6 10.8 3 9.2 3 6.8 V3.8 Z" />
    <path d="M5.2 7 L6.4 8.2 L8.9 5.5" />
  `,
  capsule: `
    <path d="M4.2 9.8 C3.2 8.8 3.2 7.2 4.2 6.2 L6.2 4.2 C7.2 3.2 8.8 3.2 9.8 4.2 C10.8 5.2 10.8 6.8 9.8 7.8 L7.8 9.8 C6.8 10.8 5.2 10.8 4.2 9.8 Z" />
    <path d="M5.6 5.6 L8.4 8.4" />
  `,
  app: `
    <rect x="2.6" y="2.6" width="3.2" height="3.2" rx="0.8" />
    <rect x="8.2" y="2.6" width="3.2" height="3.2" rx="0.8" />
    <rect x="2.6" y="8.2" width="3.2" height="3.2" rx="0.8" />
    <rect x="8.2" y="8.2" width="3.2" height="3.2" rx="0.8" />
  `,
  book: `
    <path d="M3 2.7 H6.2 C6.7 2.7 7 3.1 7 3.6 V11.2 C7 10.7 6.6 10.4 6 10.4 H3 Z" />
    <path d="M11 2.7 H7.8 C7.3 2.7 7 3.1 7 3.6 V11.2 C7 10.7 7.4 10.4 8 10.4 H11 Z" />
  `,
  file: `
    <path d="M4 2.3 H8.4 L10.6 4.6 V11.7 H4 Z" />
    <path d="M8.4 2.3 V4.6 H10.6" />
    <path d="M5.6 7.1 H8.6" />
    <path d="M5.6 9 H8.2" />
  `,
  movie: `
    <rect x="2.5" y="3.1" width="9" height="7.8" rx="1.2" />
    <path d="M4.4 3.1 V10.9" />
    <path d="M9.6 3.1 V10.9" />
    <path d="M2.5 5.4 H11.5" />
    <path d="M2.5 8.6 H11.5" />
  `,
  game: `
    <path d="M4.1 6 H9.9 C11.1 6 11.9 6.8 12.1 8.1 L12.3 9.7 C12.4 10.6 11.4 11.2 10.7 10.5 L9.5 9.3 H4.5 L3.3 10.5 C2.6 11.2 1.6 10.6 1.7 9.7 L1.9 8.1 C2.1 6.8 2.9 6 4.1 6 Z" />
    <path d="M4.7 7.6 V9" />
    <path d="M4 8.3 H5.4" />
    <path d="M9.3 8 H9.35" />
    <path d="M10.5 8.7 H10.55" />
  `,
  hotel: `
    <rect x="2.8" y="3" width="8.4" height="8.4" rx="1.1" />
    <path d="M5 11.4 V8.6 H9 V11.4" />
    <path d="M4.8 5.4 H4.85" />
    <path d="M7 5.4 H7.05" />
    <path d="M9.2 5.4 H9.25" />
  `,
  ticket: `
    <path d="M2.6 4.4 H11.4 V6.1 C10.6 6.1 10 6.5 10 7 C10 7.5 10.6 7.9 11.4 7.9 V9.6 H2.6 V7.9 C3.4 7.9 4 7.5 4 7 C4 6.5 3.4 6.1 2.6 6.1 Z" />
    <path d="M6.8 5.2 V8.8" />
  `,
  fee: `
    <path d="M4.2 3.4 H9.8 V11.2 H4.2 Z" />
    <path d="M5.6 5.4 H8.4" />
    <path d="M5.6 7.2 H8.4" />
    <path d="M5.6 9 H7.2" />
  `,
  gear: `
    <path d="M3 9.5 C4.6 8.1 5.4 5.6 6.1 3.1 L8.1 3.7 C7.9 5.2 8.5 6.5 10.2 7.9 C11.3 8.8 11.1 10.8 9.4 11.2 C7.3 11.7 4.6 10.9 3 9.5 Z" />
    <path d="M5.4 8.3 L8.9 9.3" />
    <path d="M6 6.7 L8 7.2" />
  `,
  training: `
    <path d="M2 11.2 L5.2 5.2 L7.1 8.1 L9 4.2 L12.2 11.2 Z" />
    <path d="M5.2 5.2 L6.2 6.9" />
    <path d="M8.8 4.8 L10.1 7.2" />
  `,
  health: `
    <path d="M7 11.5 C4 9.5 2.4 7.8 2.4 5.6 C2.4 4.2 3.4 3.1 4.7 3.1 C5.6 3.1 6.4 3.6 7 4.5 C7.6 3.6 8.4 3.1 9.3 3.1 C10.6 3.1 11.6 4.2 11.6 5.6 C11.6 7.8 10 9.5 7 11.5 Z" />
    <path d="M7 5.9 V8.5" />
    <path d="M5.7 7.2 H8.3" />
  `,
  ai: `
    <rect x="3.2" y="3.2" width="7.6" height="7.6" rx="1.4" />
    <path d="M5.2 1.8 V3.2" />
    <path d="M8.8 1.8 V3.2" />
    <path d="M5.2 10.8 V12.2" />
    <path d="M8.8 10.8 V12.2" />
    <path d="M1.8 5.2 H3.2" />
    <path d="M10.8 5.2 H12.2" />
    <path d="M1.8 8.8 H3.2" />
    <path d="M10.8 8.8 H12.2" />
    <path d="M5.5 7 H8.5" />
  `,
  subscription: `
    <rect x="2.3" y="3.4" width="9.4" height="7.2" rx="1.2" />
    <path d="M2.3 5.6 H11.7" />
    <path d="M4.2 8.3 H6.2" />
    <path d="M8.5 8.3 H9.8" />
  `,
  learning: `
    <path d="M2.5 2.8 H6.1 C6.7 2.8 7 3.2 7 3.8 V11 C7 10.4 6.6 10.1 5.9 10.1 H2.5 Z" />
    <path d="M11.5 2.8 H7.9 C7.3 2.8 7 3.2 7 3.8 V11 C7 10.4 7.4 10.1 8.1 10.1 H11.5 Z" />
  `,
  entertainment: `
    <path d="M7 2.2 L8.5 5.2 L11.8 5.7 L9.4 8 L10 11.3 L7 9.7 L4 11.3 L4.6 8 L2.2 5.7 L5.5 5.2 Z" />
  `,
  travel: `
    <path d="M2.2 8.5 L12 3.2 L9.8 11.4 L7.2 8.1 L4.2 10.3 Z" />
    <path d="M7.2 8.1 L12 3.2" />
  `,
  work: `
    <rect x="2.3" y="4.2" width="9.4" height="6.8" rx="1.2" />
    <path d="M5.2 4.2 V3.1 H8.8 V4.2" />
    <path d="M2.3 7 H11.7" />
  `,
  salary: `
    <rect x="2.3" y="3.5" width="9.4" height="7" rx="1.2" />
    <path d="M4.1 5.5 H9.9" />
    <path d="M4.1 7.2 H7.4" />
    <path d="M9.1 8.5 H9.2" />
  `,
  gift: `
    <rect x="2.7" y="5.6" width="8.6" height="5.2" rx="1" />
    <path d="M2.3 5.6 H11.7" />
    <path d="M7 5.6 V10.8" />
    <path d="M7 5.4 C6.2 3.6 4.4 3.1 4 4.2 C3.7 5.1 5.1 5.6 7 5.6 Z" />
    <path d="M7 5.4 C7.8 3.6 9.6 3.1 10 4.2 C10.3 5.1 8.9 5.6 7 5.6 Z" />
  `,
  transferIn: `
    <path d="M2.5 9.6 H11.5 V11.3 H2.5 Z" />
    <path d="M7 2.4 V8.2" />
    <path d="M4.7 6 L7 8.3 L9.3 6" />
  `,
  refund: `
    <path d="M4.1 4.6 C4.9 3.5 6.1 3 7.5 3 C9.8 3 11.6 4.8 11.6 7.1 C11.6 9.4 9.8 11.2 7.5 11.2 C5.7 11.2 4.2 10.2 3.5 8.8" />
    <path d="M4 2.9 V4.7 H5.8" />
    <path d="M7 5.1 V8.9" />
    <path d="M5.7 6.2 H8.2" />
  `,
  cash: `
    <path d="M2.2 4.3 H11.8 V10.7 H2.2 Z" />
    <circle cx="7" cy="7.5" r="1.4" />
    <path d="M4.1 6.1 V6.2" />
    <path d="M9.9 8.8 V8.9" />
  `,
  bank: `
    <path d="M2.2 5.2 L7 2.4 L11.8 5.2 Z" />
    <path d="M3 11.2 H11" />
    <path d="M4 5.2 V10" />
    <path d="M7 5.2 V10" />
    <path d="M10 5.2 V10" />
  `,
  more: `
    <circle cx="4" cy="7" r="0.8" fill="currentColor" stroke="none" />
    <circle cx="7" cy="7" r="0.8" fill="currentColor" stroke="none" />
    <circle cx="10" cy="7" r="0.8" fill="currentColor" stroke="none" />
  `,
};

const CATEGORY_META = {
  "餐饮": { icon: "food", thing: "hamburger", fg: "oklch(0.70 0.11 50)", bg: "oklch(0.70 0.11 50 / 0.16)" },
  "交通": { icon: "transport", thing: "car", fg: "oklch(0.68 0.11 230)", bg: "oklch(0.68 0.11 230 / 0.15)" },
  "购物": { icon: "shopping", thing: "shoppingBag", fg: "oklch(0.72 0.10 330)", bg: "oklch(0.72 0.10 330 / 0.15)" },
  "运动": { icon: "training", thing: "dumbbell", fg: "oklch(0.70 0.09 160)", bg: "oklch(0.70 0.09 160 / 0.15)" },
  "生活": { icon: "home", thing: "house", fg: "oklch(0.74 0.07 72)", bg: "oklch(0.74 0.07 72 / 0.15)" },
  "健康": { icon: "health", thing: "heart", fg: "oklch(0.72 0.13 24)", bg: "oklch(0.72 0.13 24 / 0.15)" },
  "AI 工具": { icon: "ai", thing: "robot", fg: "oklch(0.73 0.10 275)", bg: "oklch(0.73 0.10 275 / 0.15)" },
  "订阅": { icon: "app", thing: "subscription", fg: "oklch(0.72 0.10 85)", bg: "oklch(0.72 0.10 85 / 0.16)" },
  "学习": { icon: "learning", thing: "book", fg: "oklch(0.73 0.09 245)", bg: "oklch(0.73 0.09 245 / 0.15)" },
  "娱乐": { icon: "entertainment", thing: "gameController", fg: "oklch(0.76 0.10 95)", bg: "oklch(0.76 0.10 95 / 0.16)" },
  "旅行": { icon: "travel", thing: "airplane", fg: "oklch(0.72 0.10 205)", bg: "oklch(0.72 0.10 205 / 0.15)" },
  "工作": { icon: "work", thing: "calendar", fg: "oklch(0.76 0.08 82)", bg: "oklch(0.76 0.08 82 / 0.16)" },
  "薪酬": { icon: "salary", thing: "money", fg: "oklch(0.76 0.08 120)", bg: "oklch(0.76 0.08 120 / 0.15)" },
  "红包": { icon: "gift", thing: "redEnvelope", fg: "oklch(0.72 0.13 28)", bg: "oklch(0.72 0.13 28 / 0.14)" },
  "转入": { icon: "transferIn", thing: "wallet", fg: "oklch(0.72 0.10 165)", bg: "oklch(0.72 0.10 165 / 0.14)" },
  "退款": { icon: "refund", thing: "refund", fg: "oklch(0.74 0.08 205)", bg: "oklch(0.74 0.08 205 / 0.14)" },
  "其他收入": { icon: "cash", thing: "cash", fg: "oklch(0.76 0.05 118)", bg: "oklch(0.76 0.05 118 / 0.13)" },
  "其他": { icon: "more", thing: "box", fg: "oklch(0.76 0.05 85)", bg: "oklch(0.76 0.05 85 / 0.13)" },
};

const SUBCATEGORY_META = {
  "早餐": { icon: "food", thing: "croissant" },
  "午餐": { icon: "food", thing: "sandwich" },
  "晚餐": { icon: "food", thing: "ramen" },
  "宵夜": { icon: "food", thing: "moon" },
  "咖啡奶茶": { icon: "cash", thing: "coffee" },
  "水果": { icon: "food", thing: "apple" },
  "零食": { icon: "food", thing: "chips" },
  "餐饮:其他": { icon: "more", thing: "plate" },
  "共享单车": { icon: "bike", thing: "bicycle" },
  "地铁": { icon: "metro", thing: "train" },
  "打车": { icon: "taxi", thing: "taxi" },
  "日用品": { icon: "shopping", thing: "shoppingBasket" },
  "服饰": { icon: "shirt", thing: "tShirt" },
  "数码": { icon: "device", thing: "desktopComputer" },
  "家居": { icon: "sofa", thing: "sofa" },
  "装备": { icon: "gear", thing: "gear" },
  "补给": { icon: "food", thing: "proteinBar" },
  "康复": { icon: "health", thing: "bandAid" },
  "训练课": { icon: "training", thing: "stopwatch" },
  "赛事报名": { icon: "ticket", thing: "trophy" },
  "房租": { icon: "home", thing: "key" },
  "理发": { icon: "scissors", thing: "scissors" },
  "话费": { icon: "phone", thing: "phone" },
  "保险": { icon: "shield", thing: "shield" },
  "医疗": { icon: "health", thing: "stethoscope" },
  "药品": { icon: "capsule", thing: "pillBottle" },
  "ChatGPT": { icon: "ai", thing: "chatBubble" },
  "Aevum": { icon: "ai", thing: "cloud" },
  "App": { icon: "app", thing: "mobilePhone" },
  "课程": { icon: "learning", thing: "graduationCap" },
  "书籍": { icon: "book", thing: "openBook" },
  "资料": { icon: "file", thing: "file" },
  "工具": { icon: "device", thing: "toolbox" },
  "电影": { icon: "movie", thing: "movie" },
  "游戏": { icon: "game", thing: "dice" },
  "娱乐:餐饮": { icon: "food", thing: "restaurant" },
  "娱乐:其他": { icon: "more", thing: "partyPopper" },
  "旅行:交通": { icon: "transport", thing: "bus" },
  "住宿": { icon: "hotel", thing: "hotel" },
  "旅行:餐饮": { icon: "food", thing: "fork" },
  "门票": { icon: "ticket", thing: "ticket" },
  "提现手续费": { icon: "fee", thing: "receipt" },
  "其他:其他": { icon: "more", thing: "questionMark" },
  "工资": { icon: "salary", thing: "briefcase" },
  "家教费": { icon: "learning", thing: "teacher" },
};

const ACCOUNT_META = {
  "现金": { icon: "cash", fg: "oklch(0.76 0.08 94)", bg: "oklch(0.76 0.08 94 / 0.16)" },
  "微信": { icon: "assets", fg: "oklch(0.72 0.10 150)", bg: "oklch(0.72 0.10 150 / 0.15)" },
  "支付宝": { icon: "assets", fg: "oklch(0.70 0.11 235)", bg: "oklch(0.70 0.11 235 / 0.15)" },
  "银行卡": { icon: "bank", fg: "oklch(0.73 0.08 245)", bg: "oklch(0.73 0.08 245 / 0.15)" },
  "信用卡": { icon: "subscription", fg: "oklch(0.70 0.10 25)", bg: "oklch(0.70 0.10 25 / 0.14)" },
  "其他": { icon: "more", fg: "oklch(0.76 0.05 85)", bg: "oklch(0.76 0.05 85 / 0.13)" },
};

const EXPENSE_CAPTURE_CATEGORY_GROUPS = [
  { category: "餐饮", items: ["早餐", "午餐", "晚餐", "宵夜", "咖啡奶茶", "水果", "零食", "其他"] },
  { category: "交通", items: ["共享单车", "地铁", "打车"] },
  { category: "购物", items: ["日用品", "服饰", "数码", "家居"] },
  { category: "运动", items: ["装备", "补给", "康复", "训练课", "赛事报名"] },
  { category: "生活", items: ["房租", "理发", "话费"] },
  { category: "健康", items: ["保险", "医疗", "药品"] },
  { category: "AI 工具", items: ["ChatGPT", "Aevum"] },
  { category: "订阅", items: ["App"] },
  { category: "学习", items: ["课程", "书籍", "资料", "工具"] },
  { category: "娱乐", items: ["电影", "游戏", "餐饮", "其他"] },
  { category: "旅行", items: ["交通", "住宿", "餐饮", "门票"] },
  { category: "其他", items: ["提现手续费", "其他"] },
];

const ASSET_AMOUNT_KEY_ROWS = [
  ["1", "2", "3", "backspace"],
  ["4", "5", "6", "clear"],
  ["7", "8", "9", "00"],
  [".", "0"],
];

const INCOME_CAPTURE_CATEGORY_GROUPS = [
  { category: "薪酬", items: ["工资", "家教费"] },
  { category: "红包", items: [] },
  { category: "退款", items: [] },
  { category: "其他收入", items: [] },
];

const AMOUNT_KEY_ROWS = [
  ["1", "2", "3", "backspace"],
  ["4", "5", "6", "clear"],
  ["7", "8", "9", "00"],
  [".", "0", "submit"],
];

const CAPTURE_TIME_SEGMENTS = [
  { id: "morning", labelKey: "capture.timeMorning", hour: 8 },
  { id: "noon", labelKey: "capture.timeNoon", hour: 12 },
  { id: "afternoon", labelKey: "capture.timeAfternoon", hour: 15 },
  { id: "evening", labelKey: "capture.timeEvening", hour: 19 },
  { id: "late", labelKey: "capture.timeLate", hour: 1 },
];

const MANUAL_SECTIONS = [
  {
    title: {
      zh: "第一天怎么用",
      en: "First-day setup",
    },
    items: {
      zh: [
        "从底部中间的“+”开始，先点支出或收入，再点对应类型的分类、子项和金额。",
        "新增流水默认使用内置金额键盘，尽量避免调出系统金额键盘；账本不再区分微信、支付宝、银行卡这类子账户。",
        "支出和收入使用不同分类：收入不会出现交通、购物这类支出入口。",
      ],
      en: [
        "Start from the centered + tab. Pick expense or income, then the matching category, detail, and amount.",
        "New entries use the built-in amount keypad first; the ledger no longer separates wallet or bank sub-accounts.",
        "Expense and income use different categories, so income no longer shows spending categories like transport or shopping.",
      ],
    },
  },
  {
    title: {
      zh: "查账与修正",
      en: "Review and correct",
    },
    items: {
      zh: [
        "“账本”顶部是类型筛选 + 流水 / 图表切换：流水用于查单笔记录，图表就是统计。",
        "“日历”用于快速定位日期，并查看本月支出、收入和有记录的天数。",
        "账本周期可切换所有时间、本周、本月、今年；支出、收入和记录数会跟着周期变化。需要时点放大镜搜索，或用分类筛选。长按单笔流水可以编辑或删除。",
        "项目用于把一次比赛、一次旅行这类相关流水归在一起；图表页会按项目统计总额。已经在记账起点前付过的钱，可以勾选“仅记录项目”，它只进项目统计，不影响资产和日常支出，也不会显示日期或时间段。",
      ],
      en: [
        "Ledger starts with type filtering plus Flow / Charts: Flow reviews individual entries, and Charts means statistics.",
        "Calendar locates dates quickly and shows monthly spending, income, and active ledger days.",
        "Switch the Ledger period between All Time, This Week, This Month, and This Year. Expense, income, and entry count follow that period. Use the magnifier for search or Category when needed. Long-press an entry to edit or delete it.",
        "Projects group related entries for a race, trip, or similar event. Charts summarize project totals. For money paid before your ledger start date, mark it Project only: it counts toward the project without changing assets, normal spending, or date/time ledger context.",
      ],
    },
  },
  {
    title: {
      zh: "分类统计和分类预算",
      en: "Category statistics and budgets",
    },
    items: {
      zh: [
        "分类统计只看当前类型和周期筛选下的流水：所选周期内每个分类实际花了多少钱，用来回答“钱花到哪里了”。",
        "分类预算是目标对照：实际支出 / 你设置的每月预算，用来回答“这个分类有没有接近上限”。",
        "预算在“设置 → 分类预算”里改，初始值来自 Viatica 默认预算；登录 Aevum 账号后会随账本一起同步。",
      ],
      en: [
        "Category statistics read the current type and period filters: how much each category spent in the selected period.",
        "Category budgets compare actual spending against the monthly target you set.",
        "Edit budgets in Settings → Category budgets. Defaults come from Viatica; signed-in budgets sync with the Aevum account.",
      ],
    },
  },
  {
    title: {
      zh: "资产、备份和 PWA 更新",
      en: "Assets, backup, and PWA refresh",
    },
    items: {
      zh: [
        "“资产”先看资产概览；资产金额按一个初始资金总额加流水净额计算，不再维护微信、支付宝、银行卡这类子账户。",
        "收入可以只选主分类保存；红包、退款和其他收入的具体说明直接写在备注里。",
        "需要演示时，退出当前 Aevum 账号并登录专用 Demo 账号；演示数据存在云端，不再使用本机内置 Demo 模式。",
        "登录 Aevum 账号后，真实流水和分类预算会与 Supabase 云端合并同步；空设备不会覆盖已有数据。",
        "PWA 更新后如果仍看到旧界面，用“清缓存并重载”；它不会清除 `viatica:v1` 里的账本数据。",
      ],
      en: [
        "Assets leads with the Assets Overview row. The amount is one starting-assets total plus ledger net, without wallet or bank sub-accounts.",
        "Income can be saved from the primary category alone; describe gifts, refunds, and other income in the note when needed.",
        "For demos, sign out of your current Aevum account and sign in with the dedicated Demo account. Demo data now lives in the cloud instead of a bundled local mode.",
        "After signing in to the Aevum account, real entries and category budgets merge with Supabase cloud data; an empty device will not overwrite existing data.",
        "If the PWA still shows an old interface after an update, use Clear cache and reload; it keeps `viatica:v1` ledger data.",
      ],
    },
  },
  {
    title: {
      zh: "家族产品边界",
      en: "Product-family boundaries",
    },
    items: {
      zh: [
        "Viatica、Ultreia 和 Aevum 是家族产品，移动端布局和设置结构会保持同一套产品语言。",
        "流水明细只属于 Viatica；Aevum 只能接收概览快照或经过确认的跨产品事件。",
        "更新日志记录 Viatica 自己的产品变化，不等同于 Ultreia 或 Aevum 的发布记录。",
      ],
      en: [
        "Viatica, Ultreia, and Aevum are family products, so mobile layout and settings structure should feel related.",
        "Transaction details belong only to Viatica; Aevum receives only overview snapshots or reviewed cross-product events.",
        "This changelog records Viatica changes only, not Ultreia or Aevum releases.",
      ],
    },
  },
];

const CHANGELOG_ENTRIES = [
  {
    date: "2026-07-06",
    title: {
      zh: "改用云端 Demo 账号",
      en: "Moved Demo Data To A Cloud Account",
    },
    items: {
      zh: [
        "移除本机内置 Demo 模式和设置页数据模式开关，账本、日历、资产和预算都只读取当前 Aevum 账号或本机真实数据。",
        "演示数据改为写入专用 Aevum Demo 账号；需要给朋友展示时，退出当前账号后登录 Demo 账号即可。",
        "账号切换时本地缓存按 Aevum user 分开保存，非 Demo 账号同步时会忽略 `demo_txn_*` 演示流水和明显的 Demo 初始资产，避免 Demo 数据继续混进个人账本。",
        "开屏动画改为单一时间轴，启动期间发生页面重绘时不会从头重播或中途卡住。",
        "资产页恢复单一初始资金编辑：长按资产概览后用内置数字键盘修改，并同步到 Aevum 云端偏好。",
        "本机数据变动后会更快触发云端写库，并用顶部小状态条显示上传中、已保存或稍后重试，避免静默同步失败造成 PWA 和 App 数据不一致。",
      ],
      en: [
        "Removed the bundled local Demo mode and Settings data-mode switch; Ledger, Calendar, Assets, and Budgets now read only the active Aevum account or real local data.",
        "Demo data now lives in a dedicated Aevum Demo account. Sign out and use that account when showing the app to friends.",
        "Account switching now keeps local caches per Aevum user, and non-Demo accounts ignore `demo_txn_*` entries plus obvious Demo starting assets so Demo data does not leak into personal ledgers.",
        "The splash animation now uses one fixed timeline, so page rerenders during launch no longer restart or cut off the animation.",
        "Restored single starting-assets editing on Assets: long-press Assets Overview, edit with the built-in keypad, and sync it through Aevum cloud preferences.",
        "Local data changes now trigger cloud writes sooner and show a compact top status for uploading, saved, or retrying states so silent sync failures do not make PWA and App data drift.",
      ],
    },
  },
  {
    date: "2026-07-05",
    title: {
      zh: "打磨开屏和资产页",
      en: "Polished Splash And Assets",
    },
    items: {
      zh: [
        "重新编排开屏 Logo 动画：5 个金属块从不同方向拼合，并过渡到真实 Viatica Logo 图片作为最终定格帧。",
        "去掉加一笔页面的子类外框并扩大分类区域，餐饮和运动的两行子类可以直接显示。",
        "资产页顶部资产概览不再默认显示初始资金和净流水拆分。",
        "仅记录项目的补录不再显示日期或时间段，也不会作为本月流水出现；项目名和项目补录现在在流水里单独成行。",
      ],
      en: [
        "Rechoreographed the splash logo animation: five metallic blocks assemble and resolve into the real Viatica logo image as the final held frame.",
        "Removed the Add detail-chip frame and expanded the category area so two-row Food and Sport details can show directly.",
        "Simplified the Assets overview by hiding starting-assets and ledger-net breakdowns by default.",
        "Project-only backfills no longer show a date or time segment, no longer appear as current-month ledger entries, and project details now get their own ledger row line.",
      ],
    },
  },
  {
    date: "2026-07-04",
    title: {
      zh: "修复同步和加一笔反馈",
      en: "Fixed sync and Add feedback",
    },
    items: {
      zh: [
        "加强云同步冲突处理，避免无时间戳的云端旧记录覆盖本机流水或初始资金。",
        "回到前台、进入账本/资产/设置时会保守触发云端刷新，减少 PWA 和 APP 长时间不同步。",
        "双击底部“账本”会手动同步云端数据，并显示与 Ultreia 一致的顶部同步反馈。",
        "餐饮子类新增“零食”。",
        "Add 页子类选中态更明显，切走再回来也会保留当前分类、细项、时间段、金额和备注草稿。",
        "账本流水行不再显示具体时分，改成早上、中午、下午、晚上、凌晨这类时间段；资产概览增加初始资金和流水净额拆分。",
        "PWA 清缓存重载流程参考 Ultreia 简化为直接重新加载，并避免缓存云同步和更新检查请求。",
        "图表里的分类占比和趋势图放大了绘图区，减少空白并让分类百分比更靠近标签。",
        "新增轻量项目统计，用于汇总比赛、旅行等事件花费；项目补录不影响资产和日常支出。",
      ],
      en: [
        "Strengthened cloud conflict handling so untimestamped cloud rows cannot overwrite local entries or starting assets.",
        "Conservatively refreshes cloud data when returning to the foreground or opening Ledger, Assets, or Settings.",
        "Double-tapping the bottom Ledger tab now manually syncs cloud data with an Ultreia-style top sync indicator.",
        "Added Snacks under Food details.",
        "Made Add detail-chip selection clearer and preserved the current category, detail, time segment, amount, and note draft across rerenders.",
        "Ledger rows now show broad time segments instead of exact clock time; Assets now splits starting assets and ledger net.",
        "Simplified the PWA cache-clear reload after Ultreia and avoids caching cloud sync and update-check requests.",
        "Expanded the category-share and trend chart plotting areas, with tighter category percentages.",
        "Added lightweight project statistics for race, trip, and event costs; project-only backfills do not affect assets or normal spending.",
      ],
    },
  },
  {
    date: "2026-07-03",
    title: {
      zh: "合并运动分类并新增生活分类",
      en: "Consolidated Sports and Added Lifestyle",
    },
    items: {
      zh: [
        "将比赛/训练和运动装备统一为运动大类，装备、补给、康复、训练课和赛事报名都放在运动下面。",
        "新增生活大类，先放入房租和理发；旧运动类记录和预算会自动归并到运动统计。",
      ],
      en: [
        "Merged Race/Training and Sports Gear into Sports, with gear, supplies, recovery, training classes, and race registration underneath.",
        "Added Lifestyle with rent and haircut, while legacy sports records and budgets automatically roll into Sports statistics.",
      ],
    },
  },
  {
    date: "2026-07-01",
    title: {
      zh: "对齐 Ultreia 的 APK 更新流程",
      en: "Aligned APK update flow with Ultreia",
    },
    items: {
      zh: [
        "新增设置页检查更新入口，显示当前版本并从 GitHub Releases 检查最新 APK。",
        "Android APK 内支持通过系统 DownloadManager 下载更新包，并调用系统安装器安装。",
        "PWA 清缓存按钮只在 Web/PWA 环境显示，原生 APK 内改走应用更新流程。",
        "微调加一笔分类：交通把共享单车放在最前，其他只保留手续费。",
        "资产概览长按编辑改为自带数字键盘和右侧确认按钮，并统一文案为初始资金。",
        "流水行去掉账户名显示，图表补充分类占比图例并移除每日趋势说明灰字。",
        "Demo 样本数据按当前月份展示，避免默认本月视图空白。",
        "Settings 首页移除 CSV 导出、CSV 导入和 JSON 备份入口，减少本地维护按钮干扰。",
        "接入 Aevum 账号云同步：登录后自动合并本机与 Supabase 数据，Settings 可手动触发同步。",
      ],
      en: [
        "Added a Settings update checker that shows the current version and checks GitHub Releases for the latest APK.",
        "Android APK builds can download updates through the system DownloadManager and open the system installer.",
        "The PWA cache-clear action stays Web/PWA-only; native APK builds use the app update flow instead.",
        "Refined Add categories: shared bike is first under transport, and Other keeps only fees.",
        "Changed Assets Overview long-press editing to a built-in keypad with the Confirm button on the right, and renamed the label to starting assets.",
        "Removed account names from ledger rows, added a category-share legend, and removed the daily trend helper caption.",
        "Demo sample data now shifts into the current month so the default monthly review is not empty.",
        "Removed CSV export, CSV import, and JSON backup shortcuts from the Settings home to reduce local-maintenance clutter.",
        "Connected Aevum account cloud sync: signing in merges local and Supabase data, with a manual sync action in Settings.",
      ],
    },
  },
  {
    date: "2026-06-30",
    title: {
      zh: "细化记账分类和资产概览",
      en: "Refined capture categories and asset overview",
    },
    items: {
      zh: [
        "微调支出和收入的快捷分类：合并咖啡奶茶，新增共享单车，调整比赛/训练、健康和收入分类顺序。",
        "Add 页分类图标改为每行 4 个，并略微放大图标，提升手机点按稳定性。",
        "支出细项统一放到全部主分类下面，并修复切换交通、购物、运动装备等分类时细项消失的问题。",
        "红包、退款和其他收入不再要求选择细项。",
        "资产页移除可见加号和 Total Assets 小标题，改为长按资产概览行直接编辑初始金额。",
        "分类预算改为两列紧凑布局，百分比和分类金额同排显示，减少资产页纵向滚动。",
      ],
      en: [
        "Refined expense and income capture details, including coffee/milk tea, shared bikes, training, health, and income categories.",
        "Changed Add category icons to four per row and made the icons slightly larger for more reliable mobile tapping.",
        "Moved expense details under the full category grid and fixed missing detail chips when switching to categories such as transport, shopping, or gear.",
        "Removed required detail picks for gifts, refunds, and other income.",
        "Removed the visible plus and Total Assets sublabel from Assets; long-press Assets Overview to edit the opening amount directly.",
        "Changed category budgets to a tighter two-column layout with percent and budget amount on the same row.",
      ],
    },
  },
  {
    date: "2026-06-29",
    title: {
      zh: "新增点按式记账输入",
      en: "Tap-first capture input",
    },
    items: {
      zh: [
        "新增流水改为支出 / 收入双栏切换，按钮各占一半宽度。",
        "Capture 加入支出 / 收入专用分类、子项和内置金额键盘，减少系统键盘输入。",
        "Add 页改为金额和键盘固定在底部，只让上方分类和子项区域滚动。",
        "收入分类改为薪酬、红包、转入、退款和其他收入，并补齐对应 monoline 图标。",
        "资产页默认只保留我的总资产和分类预算，账户新增收进资产概览的小加号。",
      ],
      en: [
        "Changed the new-entry type switch to a balanced Expense / Income two-segment control.",
        "Added type-specific category, detail, and built-in amount keypad controls to reduce system-keyboard input.",
        "Pinned the amount and keypad area at the bottom of Add while only the category/detail area scrolls.",
        "Changed income capture to Salary, Gift, Transfer in, Refund, and Other income with matching monoline icons.",
        "Kept Assets focused on Total assets and category budgets, with account setup tucked behind the overview plus button.",
      ],
    },
  },
  {
    date: "2026-06-28",
    title: {
      zh: "对齐 Ultreia 的账本顶部结构",
      en: "Aligned Ledger top structure with Ultreia",
    },
    items: {
      zh: [
        "账本顶部改为类型筛选 + 流水/图表切换，再接时间周期和三项概览数据，整体更接近 Ultreia Training 首页。",
        "类型筛选会同时影响流水和图表；时间周期会影响概览、流水列表和图表统计。",
        "设置页合并使用手册和更新日志，并加入个人 / Demo 数据模式一键切换。",
      ],
      en: [
        "Reworked Ledger top structure into type filter + Flow/Charts, then period range and three overview metrics, closer to Ultreia Training.",
        "The type filter now affects both Flow and Charts; the period range affects overview metrics, entries, and chart statistics.",
        "Merged Manual and Changelog in Settings and added a one-tap Personal / Demo data mode switch.",
      ],
    },
  },
  {
    date: "2026-06-28",
    title: {
      zh: "账本与资产页继续压缩",
      en: "Tighter Ledger and Assets layout",
    },
    items: {
      zh: [
        "账本顶部把月份、月度概览和净结余收进同一行，月份直接承担月度筛选入口。",
        "流水区去掉重复标题，搜索默认收成放大镜，只保留快捷类型和分类筛选。",
        "资产页改为先看我的总资产，账户新增和初始资金设置收进小加号展开入口。",
      ],
      en: [
        "Moved month, monthly overview, and net balance into one Ledger overview row, with the month acting as the month filter.",
        "Removed the duplicate Flow title, collapsed search into a magnifier, and kept only quick type chips plus category filtering.",
        "Changed Assets to lead with total assets and moved account creation/opening balance setup behind a small plus action.",
      ],
    },
  },
  {
    date: "2026-06-25",
    title: {
      zh: "接入正式 Viatica 品牌标识",
      en: "Added the official Viatica brand mark",
    },
    items: {
      zh: [
        "把桌面 logo 文件夹里的 Viatica 标识纳入项目资源，并生成 PWA 桌面图标。",
        "新增启动开屏：logo 加 Viatica 手写感字标，和 Ultreia 的开屏语言保持同族但更克制。",
        "设置页顶部新增品牌头，让产品身份更清楚。",
      ],
      en: [
        "Added the Viatica logo from the desktop logo folder to project resources and generated PWA launcher icons.",
        "Added a boot splash with the logo and a Viatica script-style wordmark, related to Ultreia's boot language but quieter.",
        "Added a brand header at the top of Settings.",
      ],
    },
  },
  {
    date: "2026-06-25",
    title: {
      zh: "账本、日历和账户操作简化",
      en: "Simplified ledger, calendar, and account actions",
    },
    items: {
      zh: [
        "账本页顶部改为本月概览，不再强调日常账本/训练账本等分账本结构。",
        "流水筛选移除账本筛选，单笔流水改为长按后显示编辑和删除动作，默认列表更干净。",
        "日历去掉重复的最近流水，月历只渲染需要的周数；资产默认账户收敛为微信、银行卡、支付宝、其他，并支持长按删除账户。",
      ],
      en: [
        "Changed Ledger top content to a monthly overview instead of emphasizing separate daily/training/travel books.",
        "Removed the book filter from Flow and moved entry edit/delete actions behind long press for a cleaner default list.",
        "Removed duplicate recent entries from Calendar, renders only needed calendar weeks, and keeps default accounts to WeChat, Bank Card, Alipay, and Other with long-press deletion.",
      ],
    },
  },
  {
    date: "2026-06-25",
    title: {
      zh: "石墨底座与黄铜强调",
      en: "Graphite base with ledger-brass accent",
    },
    items: {
      zh: [
        "把应用底座从偏金黄/深棕的金融感收回到中性深石墨灰，普通面板、线条和文字不再整体发黄。",
        "黄铜色只保留在主按钮、添加入口、当前 tab、焦点环、进度条和 Viatica 标识等关键状态上。",
        "同步调整 PWA theme 色、图标和设计文档，明确 Viatica 是 serious personal ledger，而不是财富管理或促销感产品。",
      ],
      en: [
        "Moved the app base from a gold-brown finance feel back to neutral dark graphite so ordinary panels, lines, and text no longer tint the whole interface yellow.",
        "Kept ledger brass only for primary actions, the Add entry point, current tabs, focus rings, progress fills, and the Viatica mark.",
        "Updated PWA theme color, icon, and design docs to frame Viatica as a serious personal ledger rather than a wealth-management or promotional product.",
      ],
    },
  },
  {
    date: "2026-06-25",
    title: {
      zh: "账本视觉与图标系统打磨",
      en: "Ledger visual and icon polish",
    },
    items: {
      zh: [
        "参考 iCost 的信息层级和分类图标语言，重做底部导航、分类、账户、账本和流水行的小图标，但保留 Viatica 自己的暗色账本风格。",
        "压缩流水筛选区和流水行高度，金额、账户和编辑动作更安静，手机上一屏能看到更多有效流水。",
        "日历格子显示每日收入/支出金额，日期保持顶部居中，方便继续调整图表和月度回顾。",
      ],
      en: [
        "Reworked bottom navigation, category, account, book, and row-action glyphs using iCost's hierarchy as reference while keeping Viatica's own dark ledger style.",
        "Compressed Flow filters and entry rows so amount, account, and row actions stay quieter and more entries fit on mobile.",
        "Calendar cells now show daily income and expense amounts with day numbers kept top-centered for review and chart tuning.",
      ],
    },
  },
  {
    date: "2026-06-25",
    title: {
      zh: "临时演示流水",
      en: "Temporary demo ledger data",
    },
    items: {
      zh: [
        "加入一组临时模拟流水、账户初始资金和分类预算，用于在正式记账前查看账本、日历、统计、资产和预算表现。",
        "演示数据只在本机没有真实流水时展示，不写入 `viatica:v1`；后续关闭 demo 开关或删除 demo 文件即可移除。",
      ],
      en: [
        "Added temporary demo transactions, opening balances, and category budgets so Ledger, Calendar, Charts, Assets, and budgets can be reviewed before real accounting starts.",
        "Demo data only appears when no real entries exist and is not written to `viatica:v1`; disabling the demo flag or deleting the demo file removes it later.",
      ],
    },
  },
  {
    date: "2026-06-25",
    title: {
      zh: "账户初始资金与底部导航打磨",
      en: "Account opening balances and bottom nav polish",
    },
    items: {
      zh: [
        "资产页新增账户创建和初始资金编辑，账户净额按初始资金加流水收支计算。",
        "底部导航改为 Ultreia 同风格线性图标，中间添加入口只保留大号加号。",
        "收紧账本筛选、日历和资产概览排版，减少无必要的灰色说明文字。",
      ],
      en: [
        "Added account creation and opening-balance editing in Assets; account net now combines opening balances with ledger flow.",
        "Changed bottom navigation to Ultreia-style line icons, with the center Add action shown as a large plus only.",
        "Tightened ledger filters, calendar cells, and Assets overview while removing unnecessary secondary copy.",
      ],
    },
  },
  {
    date: "2026-06-25",
    title: {
      zh: "记账界面收敛",
      en: "Ledger interface cleanup",
    },
    items: {
      zh: [
        "收敛低频辅助字段入口，快速记账只保留支出和收入两种类型。",
        "日历改为规整 6×7 格子，日期居中，只保留轻量日期标记。",
        "设置首页删去二级说明文字，语言切换改为紧凑的中 / EN 开关。",
      ],
      en: [
        "Removed low-frequency auxiliary entry points, keeping quick capture to expense and income.",
        "Changed Calendar to a regular 6×7 grid with centered day numbers and light date markers.",
        "Removed secondary copy from Settings home and changed language switching to a compact 中 / EN control.",
      ],
    },
  },
  {
    date: "2026-06-25",
    title: {
      zh: "设置页收敛与分类预算编辑",
      en: "Compact settings and editable category budgets",
    },
    items: {
      zh: [
        "参考 Ultreia 的移动端设置，把设置页改为紧凑列表，使用手册、更新日志和分类预算进入独立页面。",
        "补充分清“分类统计”和“分类预算”：统计只看实际流水，预算是实际支出对照每月目标。",
        "新增分类预算编辑入口，预算保存到本机 `viatica:v1`，资产页用它计算预算执行。",
      ],
      en: [
        "Reworked Settings into a compact list, following Ultreia's mobile settings pattern; Manual, Changelog, and Category budgets now open as separate pages.",
        "Clarified Category statistics versus Category budgets: statistics read actual entries, while budgets compare spending against monthly targets.",
        "Added editable category budgets saved locally in `viatica:v1`, used by Assets for budget progress.",
      ],
    },
  },
  {
    date: "2026-06-25",
    title: {
      zh: "重构为 iCost 风格五栏记账结构",
      en: "Five-tab accounting shell inspired by iCost",
    },
    items: {
      zh: [
        "底部导航改为“账本 / 日历 / + / 资产 / 设置”，中心加号承接最高频记账动作。",
        "账本页顶部去掉“全部账本”，只保留“流水 / 图表”；图表即统计视图。",
        "新增保存后自动回到账本流水页，让新记录是否保存成功更容易确认。",
      ],
      en: [
        "Changed bottom navigation to Ledger / Calendar / + / Assets / Settings, with the centered plus for the primary capture action.",
        "Removed All Books from the top of Ledger and kept only Flow / Charts; Charts is the statistics view.",
        "After saving, the app now returns to Ledger flow so the new entry is easier to confirm.",
      ],
    },
  },
  {
    date: "2026-06-25",
    title: {
      zh: "设置页加入使用手册与更新日志",
      en: "Settings guide and changelog",
    },
    items: {
      zh: [
        "参考 Ultreia 的设置页手册入口，在 Viatica 设置页新增“使用手册 / 更新日志”分段阅读区。",
        "补齐从 2026-06-24 初始 PWA 到当前版本的产品更新记录。",
        "项目文档明确 Viatica、Ultreia、Aevum 是家族产品，并规定参考 Ultreia 时先查看当前 Ultreia 代码。",
      ],
      en: [
        "Added a Settings reading area for Manual and Changelog, following Ultreia's guide entry pattern.",
        "Backfilled the product changelog from the 2026-06-24 initial PWA to the current version.",
        "Documented Viatica, Ultreia, and Aevum as family products, with Ultreia code as the reference when requested.",
      ],
    },
  },
  {
    date: "2026-06-25",
    title: {
      zh: "移动端账本体验向 Ultreia 对齐",
      en: "Mobile ledger aligned with Ultreia",
    },
    items: {
      zh: [
        "Today 改成移动端优先的概览页，加入时间范围切换、快速操作和月历支出视图。",
        "Capture 加入常用模板和 app-native 选择控件，减少手机端表单摩擦。",
        "Ledger 增加快捷筛选和更紧凑的流水行。",
      ],
      en: [
        "Reworked Today into a mobile-first overview with range switching, quick actions, and a monthly spending calendar.",
        "Added capture templates and app-native choice controls to reduce mobile form friction.",
        "Added quick ledger filters and denser transaction rows.",
      ],
    },
  },
  {
    date: "2026-06-25",
    title: {
      zh: "黄铜强调方向初稿",
      en: "Initial ledger-brass accent direction",
    },
    items: {
      zh: [
        "将 Viatica 的产品识别色调整为低饱和账本黄铜，和 Aevum / Ultreia 的暗色产品语言保持同族但不混淆。",
        "同步调整图标、背景、描边、焦点和按钮状态。",
      ],
      en: [
        "Tuned Viatica's product accent toward muted ledger brass so it feels related to Aevum / Ultreia without blending into them.",
        "Updated icon, background, borders, focus states, and button states.",
      ],
    },
  },
  {
    date: "2026-06-24",
    title: {
      zh: "手机端输入控件与账本紧凑化",
      en: "Mobile controls and denser ledger",
    },
    items: {
      zh: [
        "用 app-native 选择控件替换普通下拉，改善手机端账本、账户、分类和币种选择。",
        "压缩流水列表和备份设置的视觉密度，让手机屏幕一次显示更多有效信息。",
        "收紧 Capture 布局和 Today 摘要，突出快速记账路径。",
      ],
      en: [
        "Replaced plain selects with app-native choice controls for book, account, category, and currency selection.",
        "Compressed ledger rows and backup settings so more useful information fits on mobile.",
        "Tightened Capture layout and Today summary around the fast-capture path.",
      ],
    },
  },
  {
    date: "2026-06-24",
    title: {
      zh: "PWA 更新、语言和部署路径",
      en: "PWA refresh, language, and deployment",
    },
    items: {
      zh: [
        "设置页加入 PWA 清缓存并重载按钮，用于更新后强制刷新旧界面。",
        "加入中文 / English 界面语言切换，且不改已有流水数据。",
        "补充生产 PWA 地址、GitHub 地址和部署说明。",
      ],
      en: [
        "Added the Settings action to clear PWA cache and reload when an old interface is still cached.",
        "Added Chinese / English interface switching without changing existing ledger data.",
        "Documented the production PWA URL, GitHub repository, and deployment path.",
      ],
    },
  },
  {
    date: "2026-06-24",
    title: {
      zh: "初始 Viatica PWA",
      en: "Initial Viatica PWA",
    },
    items: {
      zh: [
        "建立 vanilla HTML / CSS / JavaScript + Vite 的可安装 PWA。",
        "确定本地优先存储：流水、预算、偏好保存在浏览器 `localStorage` 的 `viatica:v1`。",
        "完成 Today、Capture、Ledger、Budgets、Settings 五个底部标签和核心账本逻辑测试。",
        "加入 CSV 导入导出、JSON 完整备份、分类预算和账本/账户/分类基础模型。",
      ],
      en: [
        "Created the installable PWA with vanilla HTML / CSS / JavaScript and Vite.",
        "Established local-first storage for transactions, budgets, and preferences under browser `localStorage` key `viatica:v1`.",
        "Shipped the Today, Capture, Ledger, Budgets, and Settings bottom tabs plus core ledger tests.",
        "Added CSV import/export, full JSON backup, category budgets, and base book/account/category models.",
      ],
    },
  },
];

const MESSAGES = {
  zh: {
    "app.sections": "Viatica 页面",
    "splash.label": "Viatica 正在启动",
    "sync.syncing": "正在同步数据",
    "sync.uploading": "正在上传数据",
    "sync.saved": "已保存到云端",
    "sync.failed": "上传失败，稍后重试",
    "tab.capture": "添加",
    "tab.ledger": "账本",
    "tab.calendar": "日历",
    "tab.assets": "资产",
    "tab.settings": "设置",
    "type.expense": "支出",
    "type.income": "收入",
    "today.transactionCount": "记录数",
    "today.expense": "{range}支出",
    "today.income": "{range}收入",
    "today.calendarTitle": "{month} 日历",
    "today.recentTitle": "最近流水",
    "today.recentSorted": "按发生时间排序。",
    "today.recentEmptyHint": "今天可以从第一笔开始。",
    "today.recentEmpty": "还没有流水。点击底部“+”开始记录。",
    "capture.editTitle": "编辑流水",
    "capture.quickTitle": "快速记一笔",
    "capture.hint": "先把真实流水记下来，分类和备注可以稍后补。",
    "capture.cancel": "取消",
    "capture.amount": "金额",
    "capture.type": "类型",
    "capture.title": "标题",
    "capture.merchant": "商家 / 对象",
    "capture.book": "账本",
    "capture.account": "账户",
    "capture.category": "分类",
    "capture.currency": "币种",
    "capture.time": "时间",
    "capture.timeMorning": "早上",
    "capture.timeNoon": "中午",
    "capture.timeAfternoon": "下午",
    "capture.timeEvening": "晚上",
    "capture.timeLate": "凌晨",
    "capture.tags": "标签",
    "capture.project": "项目",
    "capture.projectToggle": "项目选项",
    "capture.projectPlaceholder": "比赛 / 旅行名",
    "capture.projectOnly": "仅记录项目",
    "capture.note": "备注",
    "capture.notePlaceholder": "点击填写备注",
    "capture.amountKeypad": "金额键盘",
    "capture.done": "完成",
    "capture.keypadBackspace": "退格",
    "capture.keypadClear": "清空",
    "capture.saveEdit": "保存修改",
    "capture.save": "保存流水",
    "ledger.title": "账本",
    "ledger.overview": "账本概览",
    "ledger.monthExpense": "支出",
    "ledger.monthIncome": "收入",
    "ledger.flow": "流水",
    "ledger.chart": "图表",
    "ledger.period": "时间周期",
    "period.thisWeek": "本周",
    "period.lastWeek": "上周",
    "period.weeksAgo": "{n} 周前",
    "period.thisMonth": "本月",
    "period.thisYear": "今年",
    "ledger.matchCount": "{count} 条匹配记录。",
    "ledger.empty": "还没有匹配流水。先记录一笔，或调整筛选条件。",
    "ledger.typeFilter": "流水类型",
    "stats.title": "统计",
    "stats.hint": "图表先覆盖支出、收入和记录数。",
    "stats.pieTitle": "分类占比",
    "stats.barTitle": "金额对比",
    "stats.lineTitle": "每日金额趋势",
    "stats.lineMeta": "",
    "stats.categoryTitle": "分类统计",
    "stats.categoryHint": "只按真实流水汇总，不看预算目标。",
    "stats.projectTitle": "项目统计",
    "stats.projectOnly": "含补录",
    "stats.projectCount": "{count} 笔",
    "stats.noProject": "当前范围还没有项目数据。",
    "stats.noCategory": "当前范围还没有可统计数据。",
    "stats.other": "其他",
    "assets.title": "资产概览",
    "assets.totalAssets": "我的总资产",
    "assets.hint": "基于初始资金和流水净额汇总。",
    "assets.accountTitle": "账户金额",
    "assets.accountHint": "收入记正数，支出记负数。",
    "assets.categoryTitle": "预算",
    "assets.categoryHint": "实际支出对照每月目标。",
    "assets.totalBudget": "总预算",
    "assets.accountName": "账户名称",
    "assets.openingBalance": "初始资金",
    "assets.flowNet": "流水净额",
    "assets.addAccount": "确认",
    "assets.editAssets": "长按编辑初始资金",
    "assets.deleteAccount": "删除账户",
    "assets.accountSaved": "资产已确认。",
    "assets.startingAssetsSaved": "初始资金已保存。",
    "assets.accountDeleted": "账户已删除。",
    "assets.accountInvalid": "初始资金必须是数字。",
    "assets.accountNetTitle": "账户净额",
    "assets.noAccount": "还没有账户。点击右上角加号添加。",
    "assets.noBudget": "暂无预算数据。",
    "settings.accountTitle": "Aevum 账号",
    "settings.accountLocal": "未登录 · 本机模式",
    "settings.accountChecking": "正在检查账号状态...",
    "settings.accountMissingConfig": "未配置 Supabase 环境变量",
    "settings.accountSignedIn": "已登录",
    "settings.accountSyncPending": "退出前会保留本机账本",
    "settings.accountProfile": "账号资料",
    "settings.accountProfileHint": "显示名、出生日期和性别会同步到 Aevum / Ultreia。",
    "settings.signIn": "登录 Aevum 账号",
    "settings.signOut": "退出登录",
    "settings.signingOut": "正在退出...",
    "settings.resetPassword": "重置密码",
    "settings.resetPasswordHint": "向当前邮箱发送重置邮件",
    "settings.languageTitle": "界面语言",
    "settings.brandLine": "本机优先的个人账本",
    "settings.languageHint": "只切换界面文案，不改已有流水、账本、分类和导出数据。",
    "settings.dataSection": "数据",
    "settings.productSection": "产品",
    "settings.localSection": "本机",
    "settings.iconCreditTitle": "分类图标",
    "settings.iconCreditHint": "部分分类图标来自",
    "settings.cloudSyncTitle": "云同步",
    "settings.cloudSyncHint": "把本机账本和 Aevum 云端合并",
    "settings.cloudSyncSignIn": "先登录",
    "settings.cloudSyncIdle": "自动同步已开启",
    "settings.cloudSyncPending": "等待上传",
    "settings.cloudSyncing": "同步中...",
    "settings.cloudSynced": "已同步",
    "settings.cloudSyncError": "同步失败",
    "settings.cloudSyncRetrying": "上传失败，稍后重试",
    "settings.importExportTitle": "备份与迁移",
    "settings.importExportHint": "维护用途：用于手动迁移、恢复数据或保留离线备份。",
    "settings.exportCsv": "导出 CSV",
    "settings.importCsv": "导入 CSV",
    "settings.exportJson": "导出完整备份",
    "settings.budgetTitle": "预算",
    "settings.budgetHint": "设置每月分类目标",
    "settings.budgetPageHint": "预算是目标，不是流水；资产页会用这里的金额计算执行进度。",
    "settings.budgetSave": "保存预算",
    "settings.budgetReset": "恢复默认",
    "settings.budgetSaved": "预算已保存。",
    "settings.budgetResetDone": "预算已恢复默认。",
    "settings.budgetInvalid": "预算必须是 0 或正数。",
    "settings.pwaTitle": "PWA 更新",
    "settings.pwaHint": "更新后仍看到旧界面时使用；不会清除 viatica:v1 账本数据。",
    "settings.clearing": "正在清理...",
    "settings.clearCache": "清缓存并重载",
    "settings.version": "版本",
    "settings.viewRecent": "查看最近更新",
    "settings.checkUpdate": "检查更新",
    "settings.updateChecking": "检查中...",
    "settings.updateLatest": "已是最新版本",
    "settings.updateError": "无法检查更新",
    "settings.updateNoRelease": "还没有发布正式 APK。首次推 APK 后，这里会显示最新版本。",
    "settings.updateDownload": "下载 APK",
    "settings.updateInstall": "立即更新",
    "settings.updateDownloading": "下载中...",
    "settings.updateInstalling": "正在打开安装...",
    "settings.updateInstallFailed": "应用内安装失败 —— 已改用浏览器下载。",
    "settings.updateNetworkHint": "看起来是网络/DNS 问题，请检查网络后重试。",
    "settings.updateHideRecent": "收起更新",
    "settings.updateNewTitle": "新版本 v{v}",
    "settings.updateRecentTitle": "最新版本 v{v}",
    "settings.guideTitle": "使用手册与更新日志",
    "settings.guideHint": "使用说明和产品变化",
    "settings.manualTitle": "使用手册",
    "settings.manualHint": "包含使用说明和迭代过程",
    "settings.back": "返回",
    "profile.title": "个人资料",
    "profile.hint": "这些是 Aevum 账号的通用资料；在 Viatica、Ultreia 任意一边修改后都会从云端同步。",
    "profile.displayName": "显示名",
    "profile.birthDate": "出生日期",
    "profile.gender": "性别",
    "profile.genderMale": "男",
    "profile.genderFemale": "女",
    "profile.genderOther": "其他 / 不愿透露",
    "profile.notSet": "未设置",
    "profile.save": "保存资料",
    "profile.saving": "正在保存...",
    "profile.saved": "资料已同步。",
    "profile.saveFailed": "资料保存失败。",
    "profile.loadFailed": "资料读取失败，稍后再试。",
    "login.title": "登录 Aevum 账号",
    "login.desc": "登录同一个 Aevum 账号后，本机账本会和云端合并同步。",
    "login.email": "邮箱",
    "login.password": "密码",
    "login.submit": "登录",
    "login.submitting": "正在登录...",
    "login.forgotPassword": "忘记密码？",
    "login.resetTitle": "重置密码",
    "login.resetDesc": "输入 Aevum 账号邮箱，我会让 Supabase 发送重置邮件。",
    "login.sendReset": "发送重置邮件",
    "login.sendingReset": "正在发送...",
    "login.backToSignIn": "返回登录",
    "login.close": "关闭",
    "login.error": "登录失败，请检查邮箱和密码。",
    "login.resetSent": "重置邮件已发送，请检查邮箱。",
    "login.resetError": "重置邮件发送失败，请稍后再试。",
    "toast.authMissingConfig": "还没有配置 Supabase 环境变量，暂时只能使用本机模式。",
    "toast.authSignedIn": "已登录 Aevum 账号。",
    "toast.authSignedOut": "已退出 Aevum 账号。",
    "toast.cloudSyncDone": "账本已同步。",
    "toast.cloudSyncFailed": "云同步失败：{message}",
    "toast.cloudSyncDeferred": "本地数据已可用，云同步稍后重试。",
    "toast.cloudSyncSignIn": "请先登录 Aevum 账号再同步。",
    "manual.changelogHeading": "产品迭代过程",
    "filter.search": "搜索标题、商家、项目、标签",
    "filter.allTypes": "全部类型",
    "filter.allBooks": "账本",
    "filter.allCategories": "分类",
    "filter.allAccounts": "账户",
    "range.month": "本月",
    "range.week": "本周",
    "range.year": "今年",
    "range.all": "所有时间",
    "txn.edit": "编辑",
    "txn.delete": "删除",
    "txn.projectOnly": "项目补录",
    "confirm.delete": "删除这笔流水？",
    "confirm.deleteAccount": "删除账户“{account}”？已有流水不会被删除。",
    "calendar.summaryTitle": "本月小计",
    "calendar.activeDays": "记账天数",
    "toast.updated": "流水已更新。",
    "toast.saved": "流水已保存。",
    "toast.saveFailed": "保存失败：{message}",
    "toast.imported": "已导入 {count} 条流水。",
    "toast.importFailed": "导入失败：{message}",
    "toast.deleted": "流水已删除。",
  },
  en: {
    "app.sections": "Viatica sections",
    "splash.label": "Viatica is starting",
    "sync.syncing": "Syncing Data",
    "sync.uploading": "Uploading Data",
    "sync.saved": "Saved To Cloud",
    "sync.failed": "Upload Failed, Retrying",
    "tab.capture": "Add",
    "tab.ledger": "Ledger",
    "tab.calendar": "Calendar",
    "tab.assets": "Assets",
    "tab.settings": "Settings",
    "type.expense": "Expense",
    "type.income": "Income",
    "today.transactionCount": "Entries",
    "today.expense": "{range} Spent",
    "today.income": "{range} Income",
    "today.calendarTitle": "{month} Calendar",
    "today.recentTitle": "Recent Entries",
    "today.recentSorted": "Sorted by time.",
    "today.recentEmptyHint": "Start with the first entry today.",
    "today.recentEmpty": "No entries yet. Tap the bottom + to start.",
    "capture.editTitle": "Edit Entry",
    "capture.quickTitle": "Quick Capture",
    "capture.hint": "Record the real transaction first. Category and notes can come later.",
    "capture.cancel": "Cancel",
    "capture.amount": "Amount",
    "capture.type": "Type",
    "capture.title": "Title",
    "capture.merchant": "Merchant / Person",
    "capture.book": "Book",
    "capture.account": "Account",
    "capture.category": "Category",
    "capture.currency": "Currency",
    "capture.time": "Time",
    "capture.timeMorning": "Morning",
    "capture.timeNoon": "Noon",
    "capture.timeAfternoon": "Afternoon",
    "capture.timeEvening": "Evening",
    "capture.timeLate": "Late",
    "capture.tags": "Tags",
    "capture.project": "Project",
    "capture.projectToggle": "Project Options",
    "capture.projectPlaceholder": "Race / trip name",
    "capture.projectOnly": "Project only",
    "capture.note": "Note",
    "capture.notePlaceholder": "Tap to add a note",
    "capture.amountKeypad": "Amount Keypad",
    "capture.done": "Done",
    "capture.keypadBackspace": "Backspace",
    "capture.keypadClear": "Clear",
    "capture.saveEdit": "Save Changes",
    "capture.save": "Save Entry",
    "ledger.title": "Ledger",
    "ledger.overview": "Ledger Overview",
    "ledger.monthExpense": "Spent",
    "ledger.monthIncome": "Income",
    "ledger.flow": "Flow",
    "ledger.chart": "Charts",
    "ledger.period": "Time Period",
    "period.thisWeek": "This Week",
    "period.lastWeek": "Last Week",
    "period.weeksAgo": "{n} Weeks Ago",
    "period.thisMonth": "This Month",
    "period.thisYear": "This Year",
    "ledger.matchCount": "{count} matching entries.",
    "ledger.empty": "No matching entries yet. Record one or adjust filters.",
    "ledger.typeFilter": "Entry Type",
    "stats.title": "Statistics",
    "stats.hint": "Charts start with spending, income, and entry count.",
    "stats.pieTitle": "Category Share",
    "stats.barTitle": "Amount Comparison",
    "stats.lineTitle": "Daily Amount Trend",
    "stats.lineMeta": "",
    "stats.categoryTitle": "Category Statistics",
    "stats.categoryHint": "Based only on real entries, not budget targets.",
    "stats.projectTitle": "Project Statistics",
    "stats.projectOnly": "includes backfill",
    "stats.projectCount": "{count} entries",
    "stats.noProject": "No project data in this range yet.",
    "stats.noCategory": "No chartable data in this range yet.",
    "stats.other": "Other",
    "assets.title": "Assets Overview",
    "assets.totalAssets": "Total Assets",
    "assets.hint": "Based on starting assets and ledger net.",
    "assets.accountTitle": "Account Balances",
    "assets.accountHint": "Income is positive and expense is negative.",
    "assets.categoryTitle": "Budget",
    "assets.categoryHint": "Actual spending against monthly targets.",
    "assets.totalBudget": "Total Budget",
    "assets.accountName": "Account Name",
    "assets.openingBalance": "Starting Assets",
    "assets.flowNet": "Ledger Net",
    "assets.addAccount": "Confirm",
    "assets.editAssets": "Long-press to edit starting assets",
    "assets.deleteAccount": "Delete Account",
    "assets.accountSaved": "Assets confirmed.",
    "assets.startingAssetsSaved": "Starting assets saved.",
    "assets.accountDeleted": "Account deleted.",
    "assets.accountInvalid": "Starting assets must be a number.",
    "assets.accountNetTitle": "Account Net",
    "assets.noAccount": "No accounts yet. Tap the plus button to add one.",
    "assets.noBudget": "No budget data yet.",
    "settings.accountTitle": "Aevum Account",
    "settings.accountLocal": "Signed out · Local mode",
    "settings.accountChecking": "Checking account...",
    "settings.accountMissingConfig": "Supabase environment variables are missing",
    "settings.accountSignedIn": "Signed in",
    "settings.accountSyncPending": "Local ledger stays on this device after sign-out",
    "settings.accountProfile": "Account Profile",
    "settings.accountProfileHint": "Display Name, Birth Date, And Gender Sync With Aevum / Ultreia.",
    "settings.signIn": "Sign In To Aevum",
    "settings.signOut": "Sign Out",
    "settings.signingOut": "Signing out...",
    "settings.resetPassword": "Reset Password",
    "settings.resetPasswordHint": "Send a reset email to this account",
    "settings.languageTitle": "Interface Language",
    "settings.brandLine": "Local-First Personal Ledger",
    "settings.languageHint": "Switches interface copy only; existing entries, books, categories, and exports stay unchanged.",
    "settings.dataSection": "Data",
    "settings.productSection": "Product",
    "settings.localSection": "Local",
    "settings.iconCreditTitle": "Category Icons",
    "settings.iconCreditHint": "Some category icons by",
    "settings.cloudSyncTitle": "Cloud Sync",
    "settings.cloudSyncHint": "Merge this ledger with Aevum cloud",
    "settings.cloudSyncSignIn": "Sign In First",
    "settings.cloudSyncIdle": "Auto Sync Ready",
    "settings.cloudSyncPending": "Upload Pending",
    "settings.cloudSyncing": "Syncing...",
    "settings.cloudSynced": "Synced",
    "settings.cloudSyncError": "Sync Failed",
    "settings.cloudSyncRetrying": "Upload Failed, Retrying",
    "settings.importExportTitle": "Backup and Migration",
    "settings.importExportHint": "Maintenance only: move devices manually, restore data, or keep an offline backup.",
    "settings.exportCsv": "Export CSV",
    "settings.importCsv": "Import CSV",
    "settings.exportJson": "Export Full Backup",
    "settings.budgetTitle": "Budget",
    "settings.budgetHint": "Set Monthly Category Targets",
    "settings.budgetPageHint": "Budgets are targets, not entries. Assets uses these values for budget progress.",
    "settings.budgetSave": "Save Budgets",
    "settings.budgetReset": "Restore Defaults",
    "settings.budgetSaved": "Budgets saved.",
    "settings.budgetResetDone": "Budgets restored to defaults.",
    "settings.budgetInvalid": "Budgets must be 0 or positive.",
    "settings.pwaTitle": "PWA Refresh",
    "settings.pwaHint": "Use this when the app still shows an old interface; viatica:v1 ledger data is kept.",
    "settings.clearing": "Clearing...",
    "settings.clearCache": "Clear Cache And Reload",
    "settings.version": "Version",
    "settings.viewRecent": "View Recent Updates",
    "settings.checkUpdate": "Check Updates",
    "settings.updateChecking": "Checking...",
    "settings.updateLatest": "Up To Date",
    "settings.updateError": "Could Not Check Updates",
    "settings.updateNoRelease": "No release APK has been published yet. This will show the latest version after the first APK release.",
    "settings.updateDownload": "Download APK",
    "settings.updateInstall": "Update Now",
    "settings.updateDownloading": "Downloading...",
    "settings.updateInstalling": "Opening Installer...",
    "settings.updateInstallFailed": "In-app install failed. Downloading in the browser instead.",
    "settings.updateNetworkHint": "This looks like a network/DNS issue. Check your connection and retry.",
    "settings.updateHideRecent": "Hide Updates",
    "settings.updateNewTitle": "New Version v{v}",
    "settings.updateRecentTitle": "Latest Version v{v}",
    "settings.guideTitle": "Manual And Changelog",
    "settings.guideHint": "Usage Notes And Product Changes",
    "settings.manualTitle": "Manual",
    "settings.manualHint": "Includes Usage Notes And Product History",
    "settings.back": "Back",
    "profile.title": "Personal Profile",
    "profile.hint": "These are shared Aevum account fields. Changes made in Viatica or Ultreia sync through the cloud.",
    "profile.displayName": "Display Name",
    "profile.birthDate": "Birth Date",
    "profile.gender": "Gender",
    "profile.genderMale": "Male",
    "profile.genderFemale": "Female",
    "profile.genderOther": "Other / Prefer Not To Say",
    "profile.notSet": "Not Set",
    "profile.save": "Save Profile",
    "profile.saving": "Saving...",
    "profile.saved": "Profile synced.",
    "profile.saveFailed": "Could Not Save Profile.",
    "profile.loadFailed": "Could Not Load Profile. Try Again Later.",
    "login.title": "Sign In To Aevum",
    "login.desc": "Sign in to the same Aevum account to merge this local ledger with cloud data.",
    "login.email": "Email",
    "login.password": "Password",
    "login.submit": "Sign In",
    "login.submitting": "Signing in...",
    "login.forgotPassword": "Forgot password?",
    "login.resetTitle": "Reset Password",
    "login.resetDesc": "Enter your Aevum account email and Supabase will send a reset link.",
    "login.sendReset": "Send Reset Email",
    "login.sendingReset": "Sending...",
    "login.backToSignIn": "Back To Sign In",
    "login.close": "Close",
    "login.error": "Sign-in failed. Check your email and password.",
    "login.resetSent": "Reset email sent. Check your inbox.",
    "login.resetError": "Could not send reset email. Try again later.",
    "toast.authMissingConfig": "Supabase environment variables are not configured yet. Local mode is still available.",
    "toast.authSignedIn": "Signed in to Aevum.",
    "toast.authSignedOut": "Signed out of Aevum.",
    "toast.cloudSyncDone": "Ledger synced.",
    "toast.cloudSyncFailed": "Cloud sync failed: {message}",
    "toast.cloudSyncDeferred": "Local data is ready. Cloud sync will retry later.",
    "toast.cloudSyncSignIn": "Sign in to Aevum before syncing.",
    "manual.changelogHeading": "Product History",
    "filter.search": "Search title, merchant, project, tags",
    "filter.allTypes": "All Types",
    "filter.allBooks": "Book",
    "filter.allCategories": "Category",
    "filter.allAccounts": "Account",
    "range.month": "This Month",
    "range.week": "This Week",
    "range.year": "This Year",
    "range.all": "All Time",
    "txn.edit": "Edit",
    "txn.delete": "Delete",
    "txn.projectOnly": "Project Backfill",
    "confirm.delete": "Delete this entry?",
    "confirm.deleteAccount": "Delete account “{account}”? Existing entries will not be deleted.",
    "calendar.summaryTitle": "Month Summary",
    "calendar.activeDays": "Active Days",
    "toast.updated": "Entry updated.",
    "toast.saved": "Entry saved.",
    "toast.saveFailed": "Save failed: {message}",
    "toast.imported": "Imported {count} entries.",
    "toast.importFailed": "Import failed: {message}",
    "toast.deleted": "Entry deleted.",
  },
};

function t(key, replacements = {}) {
  const messages = MESSAGES[state.preferences.locale] || MESSAGES.zh;
  const template = messages[key] || MESSAGES.zh[key] || key;
  return Object.entries(replacements).reduce(
    (text, [name, value]) => text.replaceAll(`{${name}}`, String(value)),
    template,
  );
}

function displayLocale() {
  return state.preferences.locale === "en" ? "en-US" : "zh-CN";
}

function formatMoney(amount, currency) {
  return formatCurrency(amount, currency, currency === "CNY" ? "zh-CN" : displayLocale());
}

function captureAmountDisplay(amount, currency = "CNY") {
  const value = String(amount ?? "").trim();
  if (!value) return currency === "CNY" ? "¥0.00" : formatMoney(0, currency);
  if (currency !== "CNY") return `${currency} ${value}`;
  return `¥${value}`;
}

function captureTimeSegmentId(value) {
  const d = value ? new Date(value) : new Date();
  if (Number.isNaN(d.getTime())) return "morning";
  const hour = d.getHours();
  if (hour >= 5 && hour < 11) return "morning";
  if (hour >= 11 && hour < 14) return "noon";
  if (hour >= 14 && hour < 18) return "afternoon";
  if (hour >= 18 && hour < 24) return "evening";
  return "late";
}

function captureTimeSegmentLabel(value) {
  const selected = captureTimeSegmentId(value);
  const item = CAPTURE_TIME_SEGMENTS.find((segment) => segment.id === selected) || CAPTURE_TIME_SEGMENTS[0];
  return t(item.labelKey);
}

function transactionProjectLabel(txn = {}) {
  return normalizeProjectLabel(txn.project || projectLabelFromTags(txn.tags));
}

function dateInputValueWithHour(value, hour) {
  const d = value ? new Date(value) : new Date();
  const safeDate = Number.isNaN(d.getTime()) ? new Date() : d;
  safeDate.setHours(hour, 0, 0, 0);
  return toDateInputValue(safeDate);
}

function chunkList(items, size) {
  const chunks = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

function formatWhen(value) {
  const d = value ? new Date(value) : new Date();
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat(displayLocale(), {
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#39;");
}

function localized(copy) {
  const locale = state.preferences.locale === "en" ? "en" : "zh";
  return copy?.[locale] || copy?.zh || "";
}

function activeLedgerState() {
  return {
    transactions: state.transactions,
    budgets: state.budgets,
    accounts: [],
    preferences: state.preferences,
  };
}

function editableBudgets() {
  return state.budgetDraft || state.budgets;
}

function ensureBudgetDraft() {
  if (!state.budgetDraft) state.budgetDraft = { ...state.budgets };
  return state.budgetDraft;
}

function syncBudgetDraftFromForm(form) {
  if (!form || form.getAttribute("id") !== "budget-form") return;
  const draft = ensureBudgetDraft();
  for (const category of CATEGORIES) {
    const field = form.elements.namedItem(category);
    if (field) draft[category] = field.value;
  }
}

function localLedgerSnapshot() {
  return {
    transactions: state.transactions,
    budgets: state.budgets,
    accounts: [],
    preferences: state.preferences,
  };
}

function hasUsefulLedgerState(snapshot = {}) {
  return Boolean(
    (snapshot.transactions || []).length
    || Object.keys(snapshot.budgets || {}).length
  );
}

function isDemoAccountUser(user = null) {
  return normalizeEmail(user?.email) === DEMO_ACCOUNT_EMAIL;
}

function normalizeTransactionList(transactions = [], now = new Date()) {
  return (Array.isArray(transactions) ? transactions : []).flatMap((txn) => {
    try {
      return [normalizeTransaction(txn, now)];
    } catch {
      return [];
    }
  });
}

function applyLedgerState(nextState, { preserveLocale = true } = {}) {
  const locale = state.preferences.locale;
  state.transactions = normalizeTransactionList(nextState.transactions);
  state.budgets = normalizeBudgets(nextState.budgets);
  state.preferences = {
    ...state.preferences,
    ...(nextState.preferences || {}),
    locale: preserveLocale ? locale : (nextState.preferences?.locale || locale),
  };
  delete state.preferences.dataMode;
  delete state.preferences.deletedAccounts;
  state.preferences.startingAssets = normalizeStartingAssets(state.preferences.startingAssets);
  if (!Array.isArray(state.preferences.deletedTransactionIds)) state.preferences.deletedTransactionIds = [];
  state.accounts = [];
}

function persist({ sync = true, schedule = true } = {}) {
  if (sync && !ledgerStorageOwnerId) signedOutLedgerDirty = true;
  saveStateForOwner(localLedgerSnapshot(), ledgerStorageOwnerId);
  if (!sync) return;
  ledgerRevision += 1;
  if (canCloudSync()) {
    state.cloudSync.pendingMutation = true;
    state.cloudSync.error = "";
  }
  if (schedule) scheduleCloudSync();
}

function applySyncedLedgerState(nextState) {
  applyLedgerState(nextState);
}

function storedStateForUser(user, pendingSignedOutState = null) {
  const ownerId = user?.id || "";
  if (!ownerId) return loadStateForOwner("");
  if (hasStateForOwner(ownerId)) {
    const ownerState = loadStateForOwner(ownerId);
    if (pendingSignedOutState && !isDemoAccountUser(user)) {
      return mergePendingLocalTransactions(ownerState, pendingSignedOutState);
    }
    if (!isDemoAccountUser(user) && hasDemoSeedArtifacts(ownerState)) {
      return stripDemoSeedArtifacts(ownerState, { stripLikelySeedAccounts: true });
    }
    return ownerState;
  }

  const localState = loadStateForOwner("");
  if (isDemoAccountUser(user)) {
    return structuredClone(EMPTY_STATE);
  }
  if (hasDemoSeedArtifacts(localState)) {
    const strippedLocalState = stripDemoSeedArtifacts(localState, { stripLikelySeedAccounts: true });
    return hasUsefulLedgerState(strippedLocalState) ? strippedLocalState : structuredClone(EMPTY_STATE);
  }
  return hasUsefulLedgerState(localState) ? localState : structuredClone(EMPTY_STATE);
}

function switchLedgerStorageOwner(user) {
  const nextOwnerId = user?.id || "";
  if (nextOwnerId === ledgerStorageOwnerId) return;

  const previousOwnerId = ledgerStorageOwnerId;
  const previousState = localLedgerSnapshot();
  const pendingSignedOutState = previousOwnerId === "" && signedOutLedgerDirty ? previousState : null;
  saveStateForOwner(previousState, ledgerStorageOwnerId);
  window.clearTimeout(cloudSyncTimer);
  window.clearTimeout(cloudSyncFeedbackTimer);
  cloudSyncTimer = 0;
  cloudSyncFeedbackTimer = 0;
  ledgerStorageOwnerId = nextOwnerId;
  applyLedgerState(storedStateForUser(user, pendingSignedOutState));
  if (nextOwnerId && !isDemoAccountUser(user)) signedOutLedgerDirty = false;
  state.editingTransactionId = null;
  state.captureDraft = null;
  state.captureProjectOpen = false;
  state.searchOpen = false;
  state.actionRowId = "";
  state.cloudSync.status = "idle";
  state.cloudSync.error = "";
  state.cloudSync.lastAttemptAt = "";
  state.cloudSync.lastSyncedAt = "";
  state.cloudSync.feedback = false;
  state.cloudSync.pendingMutation = false;
  ledgerRevision += 1;
  persist({ sync: false });
}

function canCloudSync() {
  return Boolean(state.auth.configured && state.auth.user);
}

function createClientTimeoutError(message) {
  const error = new Error(message);
  error.name = "TimeoutError";
  return error;
}

function withClientTimeout(promise, timeoutMs, message) {
  if (!timeoutMs || timeoutMs <= 0) return promise;
  let timer = 0;
  return Promise.race([
    promise.finally(() => globalThis.clearTimeout(timer)),
    new Promise((_, reject) => {
      timer = globalThis.setTimeout(() => reject(createClientTimeoutError(message)), timeoutMs);
    }),
  ]);
}

function maybeToastCloudSyncDeferred() {
  if (Date.now() - cloudSyncDeferredNoticeAt < CLOUD_SYNC_DEFERRED_NOTICE_MIN_MS) return;
  cloudSyncDeferredNoticeAt = Date.now();
  toast(t("toast.cloudSyncDeferred"));
}

function showCloudSyncFeedback() {
  window.clearTimeout(cloudSyncFeedbackTimer);
  cloudSyncFeedbackTimer = 0;
  if (!state.cloudSync.feedback) cloudSyncFeedbackStartedAt = Date.now();
  state.cloudSync.feedback = true;
  render();
}

function hideCloudSyncFeedback(holdMs = 0) {
  if (!state.cloudSync.feedback) return;
  const remaining = Math.max(0, CLOUD_SYNC_FEEDBACK_MIN_MS - (Date.now() - cloudSyncFeedbackStartedAt));
  window.clearTimeout(cloudSyncFeedbackTimer);
  cloudSyncFeedbackTimer = window.setTimeout(() => {
    state.cloudSync.feedback = false;
    cloudSyncFeedbackTimer = 0;
    render();
  }, remaining + Math.max(0, holdMs));
}

function scheduleCloudSync(delay = CLOUD_MUTATION_SYNC_DELAY_MS, { feedback = false } = {}) {
  if (!canCloudSync()) return;
  window.clearTimeout(cloudSyncTimer);
  cloudSyncTimer = window.setTimeout(() => {
    syncCloudNow({ silent: true, feedback });
  }, delay);
}

function scheduleForegroundCloudSync(delay = CLOUD_FOREGROUND_SYNC_DELAY_MS) {
  if (!canCloudSync() || state.cloudSync.status === "syncing") return;
  const lastSyncTime = Number(new Date(state.cloudSync.lastSyncedAt || 0));
  const lastAttemptTime = Number(new Date(state.cloudSync.lastAttemptAt || 0));
  const lastRelevantTime = Math.max(lastSyncTime || 0, lastAttemptTime || 0);
  const minGap = state.cloudSync.status === "error" ? FOREGROUND_SYNC_RETRY_MIN_MS : FOREGROUND_SYNC_MIN_MS;
  if (lastRelevantTime && Date.now() - lastRelevantTime < minGap) return;
  scheduleCloudSync(delay);
}

function cloudSyncLabel() {
  if (!state.auth.configured || !state.auth.user) return t("settings.cloudSyncSignIn");
  if (state.cloudSync.status === "syncing") return t("settings.cloudSyncing");
  if (state.cloudSync.pendingMutation && state.cloudSync.status === "error") return t("settings.cloudSyncRetrying");
  if (state.cloudSync.pendingMutation) return t("settings.cloudSyncPending");
  if (state.cloudSync.status === "error") return t("settings.cloudSyncError");
  if (state.cloudSync.lastSyncedAt) return t("settings.cloudSynced");
  return t("settings.cloudSyncIdle");
}

async function syncCloudNow({ silent = false, feedback = !silent } = {}) {
  if (!state.auth.user) {
    if (!silent) toast(t("toast.cloudSyncSignIn"));
    return;
  }
  if (state.cloudSync.status === "syncing") {
    if (feedback) showCloudSyncFeedback();
    return;
  }

  window.clearTimeout(cloudSyncTimer);
  state.cloudSync.status = "syncing";
  state.cloudSync.error = "";
  state.cloudSync.lastAttemptAt = new Date().toISOString();
  if (feedback) showCloudSyncFeedback();
  const syncStartedAtRevision = ledgerRevision;
  const expectedUser = state.auth.user
    ? { id: state.auth.user.id, email: state.auth.user.email }
    : null;

  try {
    const syncPromise = syncViaticaLedger(localLedgerSnapshot(), expectedUser);
    syncPromise.catch(() => {});
    const result = await withClientTimeout(
      syncPromise,
      CLOUD_SYNC_TIMEOUT_MS,
      "Cloud sync timed out"
    );
    // A sync result is based on its start-time snapshot; newer local entries must not be overwritten.
    if (ledgerRevision !== syncStartedAtRevision) {
      state.cloudSync.status = "idle";
      state.cloudSync.pendingMutation = true;
      scheduleCloudSync(CLOUD_MUTATION_SYNC_DELAY_MS);
      if (!silent) toast(t("toast.cloudSyncDeferred"));
      return;
    }
    applySyncedLedgerState(result.state);
    state.cloudSync.status = "synced";
    state.cloudSync.pendingMutation = false;
    state.cloudSync.lastSyncedAt = new Date().toISOString();
    persist({ sync: false });
    if (!silent) toast(t("toast.cloudSyncDone"));
  } catch (error) {
    if (isCloudUserChangedError(error)) {
      state.cloudSync.status = "idle";
      state.cloudSync.error = "";
      state.cloudSync.pendingMutation = false;
      return;
    }
    state.cloudSync.status = "error";
    state.cloudSync.error = isCloudTimeoutError(error)
      ? t("toast.cloudSyncDeferred")
      : error?.message || "";
    if (isCloudTimeoutError(error)) {
      if (silent) maybeToastCloudSyncDeferred();
      else toast(t("toast.cloudSyncDeferred"));
    } else if (!silent) {
      toast(t("toast.cloudSyncFailed", { message: state.cloudSync.error || t("settings.cloudSyncError") }));
    }
    if (state.cloudSync.pendingMutation) scheduleCloudSync(CLOUD_SYNC_RETRY_DELAY_MS);
  } finally {
    if (state.cloudSync.status === "synced" && !state.cloudSync.pendingMutation) {
      hideCloudSyncFeedback(CLOUD_SYNC_SUCCESS_HOLD_MS);
    } else if (state.cloudSync.status === "error") {
      hideCloudSyncFeedback(CLOUD_SYNC_ERROR_HOLD_MS);
    } else if (!state.cloudSync.pendingMutation && state.cloudSync.status !== "syncing") {
      hideCloudSyncFeedback();
    }
    render();
  }
}

function expectedCloudUserSnapshot() {
  return state.auth.user
    ? { id: state.auth.user.id, email: state.auth.user.email }
    : null;
}

async function syncCloudMutation(write, { feedback = false, preservePending = false } = {}) {
  if (!canCloudSync()) return;
  if (state.cloudSync.status === "syncing") {
    scheduleCloudSync(CLOUD_MUTATION_SYNC_DELAY_MS);
    return;
  }

  window.clearTimeout(cloudSyncTimer);
  const syncStartedAtRevision = ledgerRevision;
  state.cloudSync.status = "syncing";
  state.cloudSync.error = "";
  state.cloudSync.lastAttemptAt = new Date().toISOString();
  if (feedback) showCloudSyncFeedback();

  try {
    const syncPromise = Promise.resolve(write(expectedCloudUserSnapshot()));
    syncPromise.catch(() => {});
    await withClientTimeout(
      syncPromise,
      CLOUD_SYNC_TIMEOUT_MS,
      "Cloud sync timed out"
    );
    if (ledgerRevision !== syncStartedAtRevision) {
      state.cloudSync.status = "idle";
      state.cloudSync.pendingMutation = true;
      scheduleCloudSync(CLOUD_MUTATION_SYNC_DELAY_MS);
      return;
    }
    if (preservePending) {
      state.cloudSync.status = "idle";
      state.cloudSync.pendingMutation = true;
      scheduleCloudSync(CLOUD_MUTATION_SYNC_DELAY_MS);
      return;
    }
    state.cloudSync.status = "synced";
    state.cloudSync.pendingMutation = false;
    state.cloudSync.lastSyncedAt = new Date().toISOString();
    persist({ sync: false });
  } catch (error) {
    if (isCloudUserChangedError(error)) {
      state.cloudSync.status = "idle";
      state.cloudSync.error = "";
      state.cloudSync.pendingMutation = false;
      return;
    }
    state.cloudSync.status = "error";
    state.cloudSync.error = isCloudTimeoutError(error)
      ? t("toast.cloudSyncDeferred")
      : error?.message || "";
    if (isCloudTimeoutError(error)) maybeToastCloudSyncDeferred();
    if (state.cloudSync.pendingMutation) scheduleCloudSync(CLOUD_SYNC_RETRY_DELAY_MS);
  } finally {
    if (state.cloudSync.status === "synced" && !state.cloudSync.pendingMutation) {
      hideCloudSyncFeedback(CLOUD_SYNC_SUCCESS_HOLD_MS);
    } else if (state.cloudSync.status === "error") {
      hideCloudSyncFeedback(CLOUD_SYNC_ERROR_HOLD_MS);
    } else if (!state.cloudSync.pendingMutation && state.cloudSync.status !== "syncing") {
      hideCloudSyncFeedback();
    }
    render();
  }
}

function syncTransactionMutation(txn, mode, options = {}) {
  syncCloudMutation((expectedUser) => saveCloudTransaction(txn, expectedUser, { mode }), options);
}

function syncTransactionDelete(id, options = {}) {
  syncCloudMutation((expectedUser) => deleteCloudTransaction(id, expectedUser), options);
}

function tabStageScrollTop() {
  const stage = document.querySelector(".tab-stage");
  return Math.max(stage?.scrollTop || 0, window.scrollY || document.documentElement.scrollTop || 0);
}

function scrollTabStageToTop() {
  const stage = document.querySelector(".tab-stage");
  if (stage?.scrollTo) stage.scrollTo({ top: 0, behavior: "smooth" });
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function refreshLedgerFromTab() {
  if (tabStageScrollTop() > 4) {
    scrollTabStageToTop();
    return;
  }
  syncCloudNow({ silent: false });
}

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function authUserEmail() {
  return state.auth.user?.email || "";
}

function authUserName() {
  const user = state.auth.user;
  if (!user) return "";
  const meta = user.user_metadata || {};
  const displayName = meta.display_name || meta.full_name || meta.name;
  if (displayName) return String(displayName);
  const email = authUserEmail();
  return email ? email.split("@")[0] : "";
}

function accountDisplayName() {
  return state.profile.data.displayName || authUserName();
}

function profileGenderOptions(includeBlank = false) {
  const options = PROFILE_GENDERS.map((item) => ({ value: item.id, label: t(item.labelKey) }));
  return includeBlank ? [{ value: "", label: t("profile.notSet") }, ...options] : options;
}

function profileGenderLabel(value) {
  return profileGenderOptions(true).find((item) => item.value === value)?.label || t("profile.notSet");
}

function profileValue(value) {
  return String(value || "").trim() || t("profile.notSet");
}

function resetProfileState() {
  state.profile.data = { ...EMPTY_AEVUM_PROFILE };
  state.profile.draft = { ...EMPTY_AEVUM_PROFILE };
  state.profile.status = "idle";
  state.profile.error = "";
}

async function loadSharedProfile({ silent = false } = {}) {
  if (!state.auth.user) {
    resetProfileState();
    return;
  }
  state.profile.status = "loading";
  state.profile.error = "";
  if (!silent) render();
  try {
    const profile = await fetchAevumProfile();
    state.profile.data = profile;
    state.profile.draft = { ...profile };
    state.profile.status = "ready";
  } catch (error) {
    state.profile.status = "error";
    state.profile.error = error?.message || "";
  } finally {
    render();
  }
}

function openProfileSettings() {
  if (!state.auth.user) {
    openAuthDialog("signin");
    return;
  }
  state.profile.draft = { ...state.profile.data };
  state.settingsContent = "profile";
  render();
}

async function handleProfileSave(form) {
  if (!state.auth.user || state.profile.status === "saving") return;
  const data = Object.fromEntries(new FormData(form).entries());
  const nextProfile = {
    displayName: String(data.displayName || "").trim(),
    birthDate: String(data.birthDate || "").trim(),
    gender: String(data.gender || "").trim(),
  };
  state.profile.status = "saving";
  state.profile.error = "";
  render();
  try {
    const profile = await saveAevumProfile(nextProfile);
    state.profile.data = profile;
    state.profile.draft = { ...profile };
    state.profile.status = "ready";
    toast(t("profile.saved"));
  } catch (error) {
    state.profile.status = "error";
    state.profile.error = error?.message || "";
    toast(t("profile.saveFailed"));
  } finally {
    render();
  }
}

function setCloudSession(session) {
  switchLedgerStorageOwner(session?.user || null);
  state.auth.session = session;
  state.auth.user = session?.user || null;
  state.auth.ready = true;
  if (!session) {
    state.auth.accountOpen = false;
    if (state.settingsContent === "profile") state.settingsContent = "home";
    resetProfileState();
  }
}

async function initCloudAuth() {
  if (!state.auth.configured) return;
  try {
    const session = await getCloudSession();
    setCloudSession(session);
    if (session) {
      void loadSharedProfile({ silent: true });
      scheduleCloudSync(CLOUD_BOOT_SYNC_DELAY_MS);
    }
  } catch {
    state.auth.ready = true;
    state.auth.error = t("login.error");
  }
  render();
  onCloudAuthStateChange((session) => {
    setCloudSession(session);
    render();
    if (session) {
      void loadSharedProfile({ silent: true });
      scheduleCloudSync(CLOUD_BOOT_SYNC_DELAY_MS);
    }
  });
}

function openAuthDialog(mode = "signin") {
  if (!state.auth.configured) {
    toast(t("toast.authMissingConfig"));
    return;
  }
  state.auth.loginMode = mode;
  state.auth.loginOpen = true;
  state.auth.error = "";
  state.auth.notice = "";
  render();
  requestAnimationFrame(() => document.querySelector("#auth-email")?.focus());
}

function closeAuthDialog() {
  if (state.auth.busy) return;
  state.auth.loginOpen = false;
  state.auth.error = "";
  state.auth.notice = "";
  render();
}

async function handleAuthLogin(form) {
  if (state.auth.busy) return;
  state.auth.busy = true;
  state.auth.error = "";
  state.auth.notice = "";
  let signedIn = false;
  render();
  try {
    const email = normalizeEmail(form.elements.namedItem("email")?.value);
    const password = String(form.elements.namedItem("password")?.value || "");
    setCloudSession(await signInToAevum(email, password));
    state.auth.loginOpen = false;
    signedIn = true;
    void loadSharedProfile({ silent: true });
    toast(t("toast.authSignedIn"));
  } catch {
    state.auth.error = t("login.error");
  } finally {
    state.auth.busy = false;
    render();
    if (signedIn) syncCloudNow({ silent: false });
  }
}

async function handlePasswordReset(form) {
  if (state.auth.busy) return;
  state.auth.busy = true;
  state.auth.error = "";
  state.auth.notice = "";
  render();
  try {
    const email = normalizeEmail(form.elements.namedItem("email")?.value);
    await sendAevumPasswordReset(email);
    state.auth.loginMode = "signin";
    state.auth.notice = t("login.resetSent");
  } catch {
    state.auth.error = t("login.resetError");
  } finally {
    state.auth.busy = false;
    render();
  }
}

async function handleAuthSignOut() {
  if (state.auth.busy) return;
  state.auth.busy = true;
  window.clearTimeout(cloudSyncTimer);
  render();
  try {
    await signOutFromAevum();
    setCloudSession(null);
    state.cloudSync.status = "idle";
    toast(t("toast.authSignedOut"));
  } catch {
    toast(t("login.error"));
  } finally {
    state.auth.busy = false;
    render();
  }
}

function itemOptions(items) {
  return items.map((item) => ({ value: item, label: item }));
}

function uniqueItems(items) {
  return [...new Set(items.map((item) => String(item || "").trim()).filter(Boolean))];
}

function defaultAccountName() {
  return "ledger";
}

function defaultCaptureDraft() {
  return {
    type: "expense",
    amount: "",
    currency: "CNY",
    book: "日常账本",
    account: defaultAccountName(),
    category: "餐饮",
    title: "",
    merchant: "",
    occurredAt: toDateInputValue(new Date()),
    tags: "",
    note: "",
    reimbursable: false,
    receiptDataUrl: "",
  };
}

function defaultCategoryForType(type = "expense") {
  return type === "income" ? INCOME_CATEGORIES[0] : EXPENSE_CATEGORIES[0];
}

function categoriesForType(type = "all") {
  if (type === "income") return INCOME_CATEGORIES;
  if (type === "expense") return EXPENSE_CATEGORIES;
  return uniqueItems([...EXPENSE_CATEGORIES, ...INCOME_CATEGORIES]);
}

function captureGroupsForType(type = "expense") {
  return type === "income" ? INCOME_CAPTURE_CATEGORY_GROUPS : EXPENSE_CAPTURE_CATEGORY_GROUPS;
}

function sanitizeCategoryForType(type, category) {
  if (type === "income" && category === "工作") return "薪酬";
  const normalized = type === "income" ? category : (EXPENSE_CATEGORY_ALIASES[category] || category);
  const options = categoriesForType(type);
  return options.includes(normalized) ? normalized : defaultCategoryForType(type);
}

function typeOptions(includeAll = false) {
  const options = TRANSACTION_TYPES.map((item) => ({ value: item.id, label: t(`type.${item.id}`) }));
  return includeAll ? [{ value: "all", label: t("filter.allTypes") }, ...options] : options;
}

function renderChoiceField({ label, name, value, options }) {
  return `
    <div class="choice-field">
      <span>${escapeHtml(label)}</span>
      ${renderChoiceControl({ name, value, options })}
    </div>
  `;
}

function renderFilterChoice(filterKey, value, options) {
  return `
    <div class="choice-field filter-choice">
      ${renderChoiceControl({ filterKey, value, options })}
    </div>
  `;
}

function renderChoiceControl({ name = "", filterKey = "", value, options }) {
  const selected = options.find((option) => option.value === value) || options[0];
  return `
    <div class="choice-control" data-choice ${name ? `data-choice-name="${escapeHtml(name)}"` : ""} ${filterKey ? `data-choice-filter="${escapeHtml(filterKey)}"` : ""}>
      ${name ? `<input type="hidden" name="${escapeHtml(name)}" value="${escapeHtml(selected.value)}">` : ""}
      <button class="choice-trigger" type="button" data-action="toggle-choice" aria-expanded="false">
        <span>${escapeHtml(selected.label)}</span>
        <span class="choice-chevron" aria-hidden="true">▼</span>
      </button>
      <div class="choice-menu">
        ${options.map((option) => `
          <button class="choice-option ${option.value === selected.value ? "active" : ""}" type="button" data-action="choose-option" data-choice-value="${escapeHtml(option.value)}">
            ${escapeHtml(option.label)}
          </button>
        `).join("")}
      </div>
    </div>
  `;
}

function transactionInLedgerPeriod(txn, period, now = new Date()) {
  const normalizedPeriod = normalizeLedgerPeriod(period);
  if (isProjectOnlyTransaction(txn)) return normalizedPeriod.type === "all";
  const d = new Date(txn.occurredAt);
  if (Number.isNaN(d.getTime())) return false;
  const [from, to] = ledgerPeriodRange(normalizedPeriod, now);
  return d >= from && d < to;
}

function monthYearLabel(year, month) {
  return new Intl.DateTimeFormat(displayLocale(), {
    month: "short",
    year: "numeric",
  }).format(new Date(year, month, 1));
}

function ledgerPeriodLabel(period = state.ledgerPeriod, now = new Date()) {
  const normalized = normalizeLedgerPeriod(period);
  if (normalized.type === "all") return t("range.all");
  if (normalized.type === "week") {
    if (normalized.offset === 0) return t("period.thisWeek");
    if (normalized.offset === -1) return t("period.lastWeek");
    return t("period.weeksAgo", { n: Math.abs(normalized.offset) });
  }
  if (normalized.type === "year") {
    const year = normalized.year ?? now.getFullYear();
    return year === now.getFullYear() ? t("period.thisYear") : String(year);
  }
  const year = normalized.year ?? now.getFullYear();
  const month = normalized.month ?? now.getMonth();
  return year === now.getFullYear() && month === now.getMonth()
    ? t("period.thisMonth")
    : monthYearLabel(year, month);
}

function currentLedgerPeriodForType(type) {
  if (type === "week") return { type, offset: 0 };
  return { type };
}

function summarizeLedgerPeriod(transactions = [], budgets = DEFAULT_BUDGETS) {
  const normalizedBudgets = normalizeBudgets(budgets);
  const summary = {
    monthKey: ledgerPeriodLabel(),
    todayExpense: 0,
    todayIncome: 0,
    monthExpense: 0,
    monthIncome: 0,
    monthBalance: 0,
    categoryExpense: {},
    accountNet: {},
    budgets: {},
    bookExpense: {},
    reimbursableExpense: 0,
    transactionCount: 0,
  };

  for (const txn of transactions) {
    if (isProjectOnlyTransaction(txn)) continue;
    const amount = Number(txn.amount || 0);
    summary.transactionCount += 1;
    if (txn.type === "expense") {
      const category = EXPENSE_CATEGORY_ALIASES[txn.category] || txn.category;
      summary.monthExpense += amount;
      summary.categoryExpense[category] = (summary.categoryExpense[category] || 0) + amount;
      summary.bookExpense[txn.book || "日常账本"] = (summary.bookExpense[txn.book || "日常账本"] || 0) + amount;
      if (txn.reimbursable) summary.reimbursableExpense += amount;
    }
    if (txn.type === "income") summary.monthIncome += amount;
  }

  summary.monthBalance = summary.monthIncome - summary.monthExpense;

  for (const [category, budget] of Object.entries(normalizedBudgets)) {
    const spent = summary.categoryExpense[category] || 0;
    summary.budgets[category] = {
      budget,
      spent,
      remaining: Math.max(0, budget - spent),
      ratio: budget > 0 ? spent / budget : 0,
    };
  }

  return summary;
}

function rangeFilterTransactions(transactions, period = state.ledgerPeriod) {
  return transactions.filter((txn) => transactionInLedgerPeriod(txn, period));
}

function ledgerTypeFilteredTransactions(transactions) {
  return filterTransactions(transactions, {
    type: state.filters.type,
    book: "all",
    category: "all",
    account: "all",
    reimbursable: "all",
    receipt: "all",
    month: "",
    query: "",
  });
}

function ledgerFlowTransactions(periodTransactions) {
  return filterTransactions(periodTransactions, {
    ...state.filters,
    type: "all",
    book: "all",
    account: "all",
    month: "",
  });
}

function transactionTone(txn) {
  if (txn.type === "income") return "income";
  return "expense";
}

function compactMoney(amount, currency = "CNY") {
  const value = Math.abs(Number(amount || 0));
  if (value >= 10000) {
    return state.preferences.locale === "en"
      ? `${formatMoney(value / 1000, currency)}k`
      : `${formatMoney(value / 10000, currency)}万`;
  }
  return formatMoney(value, currency);
}

function signedAmount(txn) {
  const prefix = txn.type === "income" ? "+" : "-";
  return `${prefix}${formatMoney(txn.amount, txn.currency)}`;
}

function signedMoney(amount) {
  const value = Number(amount || 0);
  if (value < 0) return `-${formatMoney(Math.abs(value))}`;
  return formatMoney(value);
}

function normalizeStartingAssets(value) {
  const amount = Number(value ?? 0);
  return Number.isFinite(amount) ? Math.round(amount * 100) / 100 : 0;
}

function assetTotals(ledgerState = activeLedgerState()) {
  const opening = normalizeStartingAssets(ledgerState.preferences?.startingAssets);
  const flow = (ledgerState.transactions || []).reduce((total, txn) => (
    isProjectOnlyTransaction(txn) ? total : total + Number(txn.amount || 0) * transactionSign(txn.type)
  ), 0);
  return {
    opening,
    flow: Math.round(flow * 100) / 100,
    total: Math.round((opening + flow) * 100) / 100,
  };
}

function transactionAmountClass(txn) {
  if (txn.type === "income") return "positive";
  return "negative";
}

function transactionTypeLabel(txn) {
  return t(txn.type === "income" ? "type.income" : "type.expense");
}

function download(name, text, type = "application/json;charset=utf-8") {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function toast(message) {
  let node = document.querySelector(".toast");
  if (!node) {
    node = document.createElement("div");
    node.className = "toast";
    document.body.append(node);
  }
  node.textContent = message;
  node.classList.add("show");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => node.classList.remove("show"), 2400);
}

let longPressTimer = 0;
let longPressTarget = null;
let longPressPoint = null;

function closeActionRows(except = null) {
  document.querySelectorAll(".action-row.action-open").forEach((row) => {
    if (row !== except) row.classList.remove("action-open");
  });
}

function clearLongPress() {
  if (longPressTimer) {
    window.clearTimeout(longPressTimer);
    longPressTimer = 0;
  }
  longPressTarget = null;
  longPressPoint = null;
}

function openActionRow(row) {
  if (!row) return;
  closeActionRows(row);
  row.classList.add("action-open");
}

function runLongPressAction(node) {
  const action = node?.dataset?.longPressAction || "";
  if (action === "toggle-starting-assets-form") {
    state.startingAssetsFormOpen = !state.startingAssetsFormOpen;
    render();
  }
}

function scheduleBootSplashDismiss() {
  if (!bootSplashVisible || bootSplashDismissTimer) return;
  if (bootSplashFrameMs() !== null) return;
  const remainingMs = Math.max(0, BOOT_REVEAL_MS - bootSplashElapsedMs());
  if (remainingMs <= 0) {
    bootSplashVisible = false;
    render();
    return;
  }
  bootSplashDismissTimer = window.setTimeout(() => {
    bootSplashVisible = false;
    bootSplashDismissTimer = 0;
    render();
  }, remainingMs);
}

function bootSplashNow() {
  return globalThis.performance?.now?.() || Date.now();
}

function bootSplashElapsedMs() {
  return Math.max(0, Math.min(BOOT_REVEAL_MS, bootSplashNow() - bootSplashStartedAt));
}

function bootSplashFrameMs() {
  try {
    const value = new URLSearchParams(window.location.search).get("boot_t");
    if (value === null) return null;
    const frameMs = Number(value);
    if (!Number.isFinite(frameMs)) return null;
    return Math.max(0, Math.min(BOOT_REVEAL_MS, frameMs));
  } catch {
    return null;
  }
}

function render() {
  document.documentElement.lang = state.preferences.locale === "en" ? "en" : "zh-CN";
  const activeState = activeLedgerState();
  const summary = summarizeLedger(activeState.transactions, activeState.budgets, new Date(), activeState.accounts);
  const typeTransactions = ledgerTypeFilteredTransactions(activeState.transactions);
  const periodTransactions = rangeFilterTransactions(typeTransactions, state.ledgerPeriod);
  const ledgerSummary = summarizeLedgerPeriod(periodTransactions, activeState.budgets);
  const filteredTransactions = ledgerFlowTransactions(periodTransactions)
    .sort((a, b) => new Date(b.occurredAt) - new Date(a.occurredAt));
  const editingTransaction = state.transactions.find((txn) => txn.id === state.editingTransactionId) || null;
  const syncFeedbackClass = state.cloudSync.feedback ? " sync-feedback-active" : "";

  app.innerHTML = `
    ${bootSplashVisible ? renderBootSplash() : ""}
    <main class="app-shell tab-${escapeHtml(state.activeTab)}${syncFeedbackClass}">
      ${renderCloudSyncFeedback()}
      <section class="tab-stage">
        ${renderActiveTab(summary, ledgerSummary, filteredTransactions, editingTransaction, periodTransactions)}
      </section>

      <nav class="bottom-tabs" aria-label="${escapeHtml(t("app.sections"))}">
        ${TABS.map(renderTabButton).join("")}
      </nav>
    </main>
    ${state.auth.loginOpen ? renderAuthDialog() : ""}
    <input id="csv-import" type="file" accept=".csv,text/csv" hidden>
  `;
  scheduleBootSplashDismiss();
  maybeAutoCheckAppUpdate();
}

function cloudSyncFeedbackKind() {
  if (state.cloudSync.status === "error") return "error";
  if (state.cloudSync.status === "synced" && !state.cloudSync.pendingMutation) return "done";
  return "uploading";
}

function cloudSyncFeedbackLabel() {
  const kind = cloudSyncFeedbackKind();
  if (kind === "done") return t("sync.saved");
  if (kind === "error") return t("sync.failed");
  return t("sync.uploading");
}

function renderCloudSyncFeedback() {
  if (!state.cloudSync.feedback) return "";
  const kind = cloudSyncFeedbackKind();
  const statusIcon = kind === "done" ? "✓" : "!";
  return `
    <div class="sync-feedback sync-feedback-${kind}" role="status" aria-live="polite">
      ${kind === "uploading"
        ? `<span class="sync-spinner" aria-hidden="true"></span>`
        : `<span class="sync-status-icon" aria-hidden="true">${statusIcon}</span>`}
      <span>${escapeHtml(cloudSyncFeedbackLabel())}</span>
    </div>
  `;
}

function renderBootSplash() {
  const frameMs = bootSplashFrameMs();
  const timelineMs = frameMs === null ? bootSplashElapsedMs() : frameMs;
  const qaFrameClass = frameMs === null ? "" : " boot-splash-qa";
  const qaFrameStyle = ` style="--boot-delay: -${timelineMs}ms"`;
  return `
    <section class="boot-splash${qaFrameClass}"${qaFrameStyle} aria-label="${escapeHtml(t("splash.label"))}">
      <div class="boot-splash-stack" aria-busy="true">
        <div class="boot-logo-stage">
          <svg class="boot-logo-build" viewBox="0 0 512 512" aria-hidden="true">
            <defs>
              <linearGradient id="boot-piece-fill" x1="152" x2="360" y1="120" y2="386" gradientUnits="userSpaceOnUse">
                <stop offset="0" stop-color="#f6eec6" />
                <stop offset="0.42" stop-color="#a99a70" />
                <stop offset="1" stop-color="#4e4429" />
              </linearGradient>
              <linearGradient id="boot-piece-edge" x1="162" x2="354" y1="118" y2="386" gradientUnits="userSpaceOnUse">
                <stop offset="0" stop-color="#fff7d2" />
                <stop offset="1" stop-color="#8a7b4d" />
              </linearGradient>
              <filter id="boot-piece-glow" x="-30%" y="-30%" width="160%" height="170%">
                <feDropShadow dx="0" dy="0" stdDeviation="5.5" flood-color="#f0dda0" flood-opacity="0.32" />
                <feDropShadow dx="0" dy="9" stdDeviation="12" flood-color="#000000" flood-opacity="0.34" />
              </filter>
            </defs>
            <rect class="boot-logo-backplate" x="30" y="30" width="452" height="452" rx="88" />
            <g class="boot-logo-traces">
              <path class="boot-logo-trace boot-logo-trace-a" pathLength="1" d="M28 200 H82 C116 200 118 166 118 136 V118 C118 86 146 60 180 60 H284 C302 60 304 46 304 28" />
              <path class="boot-logo-trace boot-logo-trace-b" pathLength="1" d="M28 232 H96 C132 232 140 176 176 176 H248 C292 176 296 118 342 118 H484" />
              <path class="boot-logo-trace boot-logo-trace-c" pathLength="1" d="M28 286 H112 C152 286 166 342 206 342 H244 C282 342 286 396 286 484" />
              <path class="boot-logo-trace boot-logo-trace-d" pathLength="1" d="M484 220 H394 C360 220 352 260 318 260 H272" />
              <path class="boot-logo-trace boot-logo-trace-e" pathLength="1" d="M484 360 H416 C382 360 376 402 342 402 H316 C292 402 286 438 286 484" />
            </g>
            <g class="boot-logo-mark">
              <path class="boot-logo-piece boot-logo-piece-a" d="M170 125 C166 127 164 131 164 136 L164 183 C164 188 166 192 170 194 L246 237 C250 239 254 236 254 231 L254 180 C254 176 252 172 248 170 L176 127 C174 125 172 124 170 125 Z" />
              <path class="boot-logo-piece boot-logo-piece-b" d="M169 198 C166 196 164 199 164 204 L164 286 C164 291 166 295 170 297 L245 340 C249 342 254 339 254 334 L254 252 C254 248 252 244 248 242 L169 198 Z" />
              <path class="boot-logo-piece boot-logo-piece-c" d="M274 177 C274 174 276 172 279 170 L321 148 C324 146 328 146 331 148 L354 162 C358 165 360 169 360 174 L360 226 C360 230 358 234 354 236 L276 280 C272 282 267 279 267 274 L267 191 C267 185 269 181 274 177 Z" />
              <path class="boot-logo-piece boot-logo-piece-d" d="M276 290 L351 247 C355 245 360 248 360 253 L360 292 C360 296 358 300 354 302 L309 330 C306 332 302 332 299 330 L276 316 C273 314 271 310 271 306 L271 298 C271 294 273 292 276 290 Z" />
              <path class="boot-logo-piece boot-logo-piece-e" d="M258 313 C258 309 262 307 266 309 L304 332 C308 334 310 339 308 343 L288 385 C286 390 280 391 276 389 L260 379 C257 377 255 373 255 369 L255 320 C255 317 256 315 258 313 Z" />
            </g>
            <rect class="boot-logo-frame-rect" x="30" y="30" width="452" height="452" rx="88" pathLength="1" />
          </svg>
          <img class="brand-logo boot-splash-logo" src="${productLogoUrl}" alt="" aria-hidden="true">
          <div class="boot-logo-sheen" aria-hidden="true"></div>
        </div>
        <div class="brand-wordmark boot-wordmark">${escapeHtml(PRODUCT_NAME)}</div>
      </div>
    </section>
  `;
}

function renderActiveTab(summary, ledgerSummary, filteredTransactions, editingTransaction, chartTransactions) {
  if (state.activeTab === "capture") return renderCaptureTab(editingTransaction);
  if (state.activeTab === "calendar") return renderCalendarTab(summary);
  if (state.activeTab === "assets") return renderAssetsTab(summary);
  if (state.activeTab === "settings") return renderSettingsTab();
  return renderLedgerTab(filteredTransactions, ledgerSummary, chartTransactions);
}

function glyphSvg(name, className = "glyph") {
  const paths = GLYPHS[name] || GLYPHS.more;
  return `
    <svg class="${escapeHtml(className)}" width="20" height="20" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.45" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      ${paths}
    </svg>
  `;
}

function renderTabIcon(tabId) {
  return glyphSvg(tabId === "capture" ? "plus" : tabId, "tab-svg");
}

function iconMeta(label, kind = "category", parentLabel = "") {
  if (kind === "account") return ACCOUNT_META[label] || ACCOUNT_META["其他"];
  if (kind === "subcategory") {
    const categoryMeta = CATEGORY_META[parentLabel] || CATEGORY_META["其他"];
    const meta = SUBCATEGORY_META[`${parentLabel}:${label}`] || SUBCATEGORY_META[label] || {};
    return {
      ...categoryMeta,
      ...meta,
      fg: meta.fg || categoryMeta.fg,
      bg: meta.bg || categoryMeta.bg,
    };
  }
  return CATEGORY_META[label] || CATEGORY_META["其他"];
}

function renderIconBadge(label, kind = "category", size = "", parentLabel = "") {
  const meta = iconMeta(label, kind, parentLabel);
  const sizeClass = size ? ` ${size}` : "";
  const thingUrl = meta.thing ? thiingsIconUrls[meta.thing] : "";
  return `
    <span class="icon-badge${sizeClass}" style="--icon-bg: ${meta.bg}; --icon-fg: ${meta.fg};" aria-hidden="true">
      ${thingUrl
        ? `<img class="thing-icon" src="${thingUrl}" alt="" loading="lazy" decoding="async">`
        : glyphSvg(meta.icon)}
    </span>
  `;
}

function renderTransactionIconBadge(txn) {
  const category = txn.category || "其他";
  const title = String(txn.title || "").trim();
  const hasSubcategoryIcon = title
    && (SUBCATEGORY_META[`${category}:${title}`] || SUBCATEGORY_META[title]);
  return hasSubcategoryIcon
    ? renderIconBadge(title, "subcategory", "", category)
    : renderIconBadge(category, "category");
}

function renderTabButton(tab) {
  const active = state.activeTab === tab.id;
  const primary = tab.id === "capture";
  const label = t(tab.labelKey);
  return `
    <button class="tab-button ${primary ? "primary-tab" : ""} ${active ? "active" : ""}" data-action="tab" data-tab="${escapeHtml(tab.id)}" aria-current="${active ? "page" : "false"}" aria-label="${escapeHtml(label)}">
      <span class="tab-icon" aria-hidden="true">${renderTabIcon(tab.id)}</span>
      ${primary ? `<span class="sr-only">${escapeHtml(label)}</span>` : `<span class="tab-label">${escapeHtml(label)}</span>`}
    </button>
  `;
}

function renderLedgerModeSwitch() {
  return `
    <section class="ledger-mode-switch" aria-label="${escapeHtml(t("ledger.title"))}">
      ${LEDGER_VIEWS.map((item) => `
        <button class="${state.ledgerView === item.id ? "active" : ""}" data-action="ledger-view" data-view="${escapeHtml(item.id)}" aria-pressed="${state.ledgerView === item.id ? "true" : "false"}">
          ${glyphSvg(item.icon, "mode-icon")}
          ${escapeHtml(t(item.labelKey))}
        </button>
      `).join("")}
    </section>
  `;
}

function renderLedgerTypeFilter() {
  return `
    <div class="ledger-type-filter" aria-label="${escapeHtml(t("ledger.typeFilter"))}">
      ${renderFilterChoice("type", state.filters.type, typeOptions(true))}
    </div>
  `;
}

function renderLedgerTopbar() {
  return `
    <section class="ledger-topbar">
      ${renderLedgerTypeFilter()}
      ${renderLedgerModeSwitch()}
    </section>
  `;
}

function renderLedgerPeriodSwitch() {
  const period = normalizeLedgerPeriod(state.ledgerPeriod);
  return `
    <section class="time-switch ledger-period-switch" data-ledger-period-control aria-label="${escapeHtml(t("ledger.period"))}">
      ${LEDGER_PERIOD_SEGMENTS.map((item) => {
        const active = period.type === item.type;
        const label = active ? ledgerPeriodLabel(period) : t(item.labelKey);
        const open = state.ledgerPeriodDropdown === item.type;
        return `
        <div class="ledger-period-cell">
          <button type="button" class="ledger-period-trigger ${active ? "active" : ""}" data-action="ledger-period-segment" data-period-type="${escapeHtml(item.type)}" aria-pressed="${active ? "true" : "false"}" aria-expanded="${item.dropdown ? (open ? "true" : "false") : "false"}">
            <span>${escapeHtml(label)}</span>
            ${item.dropdown ? `<span class="ledger-period-caret" aria-hidden="true">▾</span>` : ""}
          </button>
          ${open ? renderLedgerPeriodMenu(item.type, period) : ""}
        </div>
      `;
      }).join("")}
    </section>
  `;
}

function renderLedgerPeriodMenu(type, activePeriod) {
  const options = ledgerPeriodOptions(type);
  return `
    <div class="ledger-period-menu" role="menu" data-period-menu="${escapeHtml(type)}">
      ${options.map((option) => renderLedgerPeriodOption(option, activePeriod)).join("")}
    </div>
  `;
}

function ledgerPeriodOptions(type) {
  if (type === "week") {
    return Array.from({ length: 12 }, (_, index) => {
      const offset = -index;
      return {
        period: { type: "week", offset },
        label: offset === 0 ? t("period.thisWeek") : offset === -1 ? t("period.lastWeek") : t("period.weeksAgo", { n: Math.abs(offset) }),
      };
    });
  }
  if (type === "year") {
    return pastYears(6).map((year, index) => ({
      period: index === 0 ? { type: "year" } : { type: "year", year },
      label: index === 0 ? t("period.thisYear") : String(year),
    }));
  }
  return pastMonths(24).map(({ year, month }, index) => ({
    period: index === 0 ? { type: "month" } : { type: "month", year, month },
    label: index === 0 ? t("period.thisMonth") : monthYearLabel(year, month),
  }));
}

function renderLedgerPeriodOption(option, activePeriod) {
  const period = normalizeLedgerPeriod(option.period);
  const selected = ledgerPeriodsEqual(period, activePeriod);
  return `
    <button type="button" class="ledger-period-option ${selected ? "active" : ""}" data-action="ledger-period-option" data-period-type="${escapeHtml(period.type)}" data-period-offset="${escapeHtml(period.offset ?? "")}" data-period-year="${escapeHtml(period.year ?? "")}" data-period-month="${escapeHtml(period.month ?? "")}" role="menuitemradio" aria-checked="${selected ? "true" : "false"}">
      ${escapeHtml(option.label)}
    </button>
  `;
}

function periodFromDataset(dataset = {}) {
  const type = dataset.periodType || "month";
  if (type === "all") return { type: "all" };
  if (type === "week") {
    const offset = Number(dataset.periodOffset || 0);
    return { type: "week", offset: Number.isFinite(offset) ? Math.trunc(offset) : 0 };
  }
  if (type === "year") {
    const year = Number(dataset.periodYear);
    return Number.isInteger(year) ? { type: "year", year } : { type: "year" };
  }
  const year = Number(dataset.periodYear);
  const month = Number(dataset.periodMonth);
  if (Number.isInteger(year) && Number.isInteger(month)) return { type: "month", year, month };
  return { type: "month" };
}

function closeLedgerPeriodMenu({ rerender = false } = {}) {
  if (!state.ledgerPeriodDropdown) return;
  state.ledgerPeriodDropdown = "";
  if (rerender) {
    render();
    return;
  }
  document.querySelectorAll(".ledger-period-menu").forEach((menu) => menu.remove());
  document.querySelectorAll(".ledger-period-trigger[aria-expanded=\"true\"]").forEach((button) => {
    button.setAttribute("aria-expanded", "false");
  });
}

function handleLedgerPeriodSegment(node, event) {
  const type = node.dataset.periodType || "month";
  const segment = LEDGER_PERIOD_SEGMENTS.find((item) => item.type === type);
  if (!segment) return;
  event.stopPropagation();
  if (!segment.dropdown) {
    state.ledgerPeriod = { type };
    state.ledgerPeriodDropdown = "";
    render();
    return;
  }
  if (normalizeLedgerPeriod(state.ledgerPeriod).type !== type) {
    state.ledgerPeriod = currentLedgerPeriodForType(type);
    state.ledgerPeriodDropdown = "";
  } else {
    state.ledgerPeriodDropdown = state.ledgerPeriodDropdown === type ? "" : type;
  }
  render();
}

function handleLedgerPeriodOption(node) {
  state.ledgerPeriod = periodFromDataset(node.dataset);
  state.ledgerPeriodDropdown = "";
  render();
}

function renderLedgerTab(filteredTransactions, summary, chartTransactions) {
  return `
    ${renderLedgerTopbar()}
    ${renderLedgerPeriodSwitch()}
    ${renderLedgerOverview(summary)}
    ${state.ledgerView === "chart" ? renderLedgerStats(summary, chartTransactions) : renderLedgerFlow(filteredTransactions)}
  `;
}

function renderLedgerOverview(summary) {
  return `
    <section class="ledger-overview" aria-label="${escapeHtml(t("ledger.overview"))}">
      <div class="ledger-metric-grid">
        ${renderLedgerMetric(t("ledger.monthExpense"), formatMoney(summary.monthExpense), "chartPie")}
        ${renderLedgerMetric(t("ledger.monthIncome"), formatMoney(summary.monthIncome), "chartLine")}
        ${renderLedgerMetric(t("today.transactionCount"), String(summary.transactionCount), "chartBars")}
      </div>
    </section>
  `;
}

function renderLedgerMetric(label, value, icon) {
  return `
    <div class="ledger-metric-card">
      <span class="ledger-metric-icon">${glyphSvg(icon)}</span>
      <div class="ledger-metric-copy">
        <span>${escapeHtml(label)}</span>
        <strong>${escapeHtml(value)}</strong>
      </div>
    </div>
  `;
}

function renderLedgerFlow(filteredTransactions) {
  return `
    <section class="panel ledger-flow-panel">
      ${renderFilters()}
      <div class="list">
        ${filteredTransactions.length ? filteredTransactions.map(renderTransactionRow).join("") : `<div class="empty">${escapeHtml(t("ledger.empty"))}</div>`}
      </div>
    </section>
  `;
}

function renderLedgerStats(summary, transactions = []) {
  const chartEntries = categoryChartEntries(transactions, 5);
  const chartTotal = Math.max(1, chartEntries.reduce((total, [, amount]) => total + amount, 0));
  const projectEntries = projectChartEntries(transactions, 6);
  return `
    <section class="panel stats-panel">
      <div class="section-title">
        <div>
          <h2>${escapeHtml(t("stats.title"))}</h2>
        </div>
      </div>

      ${renderStatsCharts(transactions, chartEntries, chartTotal)}

      <div class="section-title inline-section-title">
        <div>
          <h2>${escapeHtml(t("stats.categoryTitle"))}</h2>
        </div>
      </div>
      <div class="budget-list">
        ${renderCategoryStatRows(summary, 8, chartEntries, chartTotal)}
      </div>

      <div class="section-title inline-section-title">
        <div>
          <h2>${escapeHtml(t("stats.projectTitle"))}</h2>
        </div>
      </div>
      <div class="budget-list project-stat-list">
        ${renderProjectStatRows(projectEntries)}
      </div>
    </section>
  `;
}

function chartSourceType() {
  return state.filters.type === "income" ? "income" : "expense";
}

function categoryChartEntries(transactions = [], limit = 5) {
  const sourceType = chartSourceType();
  const totals = new Map();
  for (const txn of transactions) {
    if (isProjectOnlyTransaction(txn)) continue;
    if (txn.type !== sourceType) continue;
    const amount = Number(txn.amount || 0);
    if (!(amount > 0)) continue;
    const category = sourceType === "expense" ? (EXPENSE_CATEGORY_ALIASES[txn.category] || txn.category) : txn.category;
    totals.set(category, (totals.get(category) || 0) + amount);
  }
  const entries = [...totals.entries()].sort((a, b) => b[1] - a[1]);
  if (entries.length <= limit) return entries;
  const visible = entries.slice(0, limit - 1);
  const rest = entries.slice(limit - 1).reduce((sum, [, amount]) => sum + amount, 0);
  return [...visible, [t("stats.other"), rest]];
}

function dailyChartEntries(transactions = []) {
  const sourceType = chartSourceType();
  const totals = new Map();
  for (const txn of transactions) {
    if (isProjectOnlyTransaction(txn)) continue;
    if (txn.type !== sourceType) continue;
    const amount = Number(txn.amount || 0);
    if (!(amount > 0)) continue;
    const key = todayKey(txn.occurredAt);
    totals.set(key, (totals.get(key) || 0) + amount);
  }
  return [...totals.entries()].sort((a, b) => new Date(a[0]) - new Date(b[0]));
}

function projectChartEntries(transactions = [], limit = 6) {
  const sourceType = chartSourceType();
  const totals = new Map();
  for (const txn of transactions) {
    if (txn.type !== sourceType) continue;
    const project = transactionProjectLabel(txn);
    if (!project) continue;
    const amount = Number(txn.amount || 0);
    if (!(amount > 0)) continue;
    const current = totals.get(project) || { amount: 0, count: 0, projectOnlyCount: 0 };
    current.amount += amount;
    current.count += 1;
    if (isProjectOnlyTransaction(txn)) current.projectOnlyCount += 1;
    totals.set(project, current);
  }
  return [...totals.entries()]
    .map(([project, data]) => ({
      project,
      amount: Math.round(data.amount * 100) / 100,
      count: data.count,
      projectOnlyCount: data.projectOnlyCount,
    }))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, limit);
}

function chartNumber(value) {
  return Number(value.toFixed(2));
}

function pieSlicePath(cx, cy, radius, start, end) {
  const startAngle = start * Math.PI * 2 - Math.PI / 2;
  const endAngle = end * Math.PI * 2 - Math.PI / 2;
  const x1 = chartNumber(cx + radius * Math.cos(startAngle));
  const y1 = chartNumber(cy + radius * Math.sin(startAngle));
  const x2 = chartNumber(cx + radius * Math.cos(endAngle));
  const y2 = chartNumber(cy + radius * Math.sin(endAngle));
  const largeArc = end - start > 0.5 ? 1 : 0;
  return `M ${cx} ${cy} L ${x1} ${y1} A ${radius} ${radius} 0 ${largeArc} 1 ${x2} ${y2} Z`;
}

function renderPieChart(entries, total) {
  let cursor = 0;
  const slices = entries.length === 1
    ? `<circle cx="64" cy="64" r="56" fill="${CHART_COLORS[0]}"></circle>`
    : entries.map(([, amount], index) => {
      const start = cursor;
      const share = amount / total;
      cursor += share;
      return `<path d="${pieSlicePath(64, 64, 56, start, cursor)}" fill="${CHART_COLORS[index % CHART_COLORS.length]}"></path>`;
    }).join("");
  return `
    <svg class="stats-chart-svg pie-chart" viewBox="0 0 128 128" role="img" aria-label="${escapeHtml(t("stats.pieTitle"))}">
      <circle cx="64" cy="64" r="56" fill="oklch(0.145 0.006 95)"></circle>
      ${slices}
      <circle cx="64" cy="64" r="24" fill="oklch(0.130 0.006 95 / 0.92)"></circle>
    </svg>
  `;
}

function renderPieLegend(entries, total) {
  return `
    <div class="pie-legend" aria-label="${escapeHtml(t("stats.pieTitle"))}">
      ${entries.map(([category, amount], index) => {
        const percent = total > 0 ? Math.round((amount / total) * 100) : 0;
        return `
          <div class="pie-legend-item">
            <span class="pie-legend-dot" style="background: ${CHART_COLORS[index % CHART_COLORS.length]}"></span>
            <span class="pie-legend-label">${escapeHtml(category)}</span>
            <strong>${percent}%</strong>
          </div>
        `;
      }).join("")}
    </div>
  `;
}

function renderBarChart(entries) {
  const max = Math.max(...entries.map(([, amount]) => amount), 1);
  const chartWidth = 220;
  const bottom = 82;
  const top = 14;
  const plotWidth = 188;
  const step = plotWidth / Math.max(entries.length, 1);
  const barWidth = Math.min(24, Math.max(12, step * 0.52));
  const bars = entries.map(([category, amount], index) => {
    const height = Math.max(4, ((amount / max) * (bottom - top)));
    const x = chartNumber(18 + (step * index) + ((step - barWidth) / 2));
    const y = chartNumber(bottom - height);
    const label = shortChartLabel(category);
    return `
      <rect x="${x}" y="${y}" width="${chartNumber(barWidth)}" height="${chartNumber(height)}" rx="3" fill="${CHART_COLORS[index % CHART_COLORS.length]}"></rect>
      <text x="${chartNumber(x + (barWidth / 2))}" y="94" text-anchor="middle">${escapeHtml(label)}</text>
    `;
  }).join("");
  return `
    <svg class="stats-chart-svg bar-chart" viewBox="0 0 ${chartWidth} 100" role="img" aria-label="${escapeHtml(t("stats.barTitle"))}">
      <path d="M16 82 H208" class="chart-axis"></path>
      ${bars}
    </svg>
  `;
}

function renderLineChart(transactions) {
  const series = dailyChartEntries(transactions);
  const max = Math.max(...series.map(([, amount]) => amount), 1);
  const width = 300;
  const height = 132;
  const left = 34;
  const right = 288;
  const top = 12;
  const middle = 59;
  const bottom = 112;
  const points = series.map(([date, amount], index) => {
    const x = series.length === 1 ? width / 2 : left + ((right - left) * index) / (series.length - 1);
    const y = bottom - ((amount / max) * (bottom - top));
    return { date, amount, x: chartNumber(x), y: chartNumber(y) };
  });
  const path = points.map((point, index) => `${index ? "L" : "M"} ${point.x} ${point.y}`).join(" ");
  const areaPath = points.length > 1
    ? `${path} L ${points[points.length - 1].x} ${bottom} L ${points[0].x} ${bottom} Z`
    : "";
  const pointNodes = points.map((point) => `<circle cx="${point.x}" cy="${point.y}" r="1.9"></circle>`).join("");
  const maxPoint = points.reduce((highest, point) => (point.amount > highest.amount ? point : highest), points[0]);
  const maxAnchor = maxPoint.x > (left + right) / 2 ? "end" : "start";
  const maxLabelX = maxAnchor === "end" ? Math.max(left + 18, maxPoint.x - 7) : Math.min(right - 18, maxPoint.x + 7);
  const maxLabelY = Math.max(top + 8, maxPoint.y - 6);
  const first = points[0]?.date.slice(5).replace("-", "/") || "";
  const last = points[points.length - 1]?.date.slice(5).replace("-", "/") || "";
  const xLabels = points.length === 1
    ? `<text x="${width / 2}" y="126" text-anchor="middle">${escapeHtml(first)}</text>`
    : `
      <text x="${left}" y="126" text-anchor="start">${escapeHtml(first)}</text>
      <text x="${right}" y="126" text-anchor="end">${escapeHtml(last)}</text>
    `;
  return `
    <svg class="stats-chart-svg line-chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeHtml(t("stats.lineTitle"))}">
      <path d="M${left} ${top} H${right}" class="chart-grid-line"></path>
      <path d="M${left} ${middle} H${right}" class="chart-grid-line"></path>
      <path d="M${left} ${bottom} H${right}" class="chart-axis"></path>
      <path d="M${left} ${top} V${bottom}" class="chart-axis"></path>
      <text x="${left - 6}" y="${top + 3}" text-anchor="end">${escapeHtml(compactMoney(max))}</text>
      <text x="${left - 6}" y="${bottom + 3}" text-anchor="end">0</text>
      ${areaPath ? `<path d="${areaPath}" class="line-chart-area"></path>` : ""}
      <path d="${path}" class="line-chart-path"></path>
      ${pointNodes}
      <circle class="line-chart-max-marker" cx="${maxPoint.x}" cy="${maxPoint.y}" r="3.1"></circle>
      <text class="line-chart-max-label" x="${chartNumber(maxLabelX)}" y="${chartNumber(maxLabelY)}" text-anchor="${maxAnchor}">${escapeHtml(compactMoney(maxPoint.amount))}</text>
      ${xLabels}
    </svg>
  `;
}

function shortChartLabel(label) {
  const text = String(label || "");
  if (text.length <= 3) return text;
  return state.preferences.locale === "en" ? text.slice(0, 4) : text.slice(0, 2);
}

function renderStatsCharts(transactions, entries, total) {
  if (!entries.length) return `<div class="empty">${escapeHtml(t("stats.noCategory"))}</div>`;
  return `
    <div class="stats-chart-grid">
      <article class="stats-chart-card pie-share-card">
        <div class="stats-chart-title">
          ${glyphSvg("chartPie")}
          <span class="stats-chart-copy"><strong>${escapeHtml(t("stats.pieTitle"))}</strong></span>
        </div>
        <div class="pie-chart-layout">
          ${renderPieLegend(entries, total)}
          ${renderPieChart(entries, total)}
        </div>
      </article>
      <article class="stats-chart-card">
        <div class="stats-chart-title">
          ${glyphSvg("chartBars")}
          <span class="stats-chart-copy"><strong>${escapeHtml(t("stats.barTitle"))}</strong></span>
        </div>
        ${renderBarChart(entries)}
      </article>
      <article class="stats-chart-card trend">
        <div class="stats-chart-title">
          ${glyphSvg("chartLine")}
          <span class="stats-chart-copy">
            <strong>${escapeHtml(t("stats.lineTitle"))}</strong>
          </span>
        </div>
        ${renderLineChart(transactions)}
      </article>
    </div>
  `;
}

function renderCalendarTab(summary) {
  return `
    <section class="panel">
      <div class="section-title">
        <div>
          <h2>${escapeHtml(t("today.calendarTitle", { month: summary.monthKey }))}</h2>
        </div>
      </div>
      ${renderMonthCalendar()}
    </section>

    <section class="panel calendar-summary-panel">
      <div class="section-title calendar-summary-title">
        <div>
          <h2>${escapeHtml(t("calendar.summaryTitle"))}</h2>
        </div>
        <span class="calendar-active-days">
          <span>${escapeHtml(t("calendar.activeDays"))}</span>
          <strong>${monthActiveDays()}</strong>
        </span>
      </div>
      <div class="hero-grid calendar-summary">
        ${renderStat(t("today.expense", { range: t("range.month") }), compactMoney(summary.monthExpense))}
        ${renderStat(t("today.income", { range: t("range.month") }), compactMoney(summary.monthIncome))}
      </div>
    </section>
  `;
}

function monthActiveDays() {
  const { transactions } = activeLedgerState();
  const currentMonth = monthKey(new Date());
  return new Set(
    transactions
      .filter((txn) => !isProjectOnlyTransaction(txn) && monthKey(txn.occurredAt) === currentMonth)
      .map((txn) => todayKey(txn.occurredAt)),
  ).size;
}

function renderMonthCalendar() {
  const { transactions } = activeLedgerState();
  const now = new Date();
  const currentMonth = monthKey(now);
  const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const dayExpense = new Map();
  const dayIncome = new Map();
  const today = todayKey(now);

  for (const txn of transactions) {
    if (isProjectOnlyTransaction(txn)) continue;
    if (monthKey(txn.occurredAt) !== currentMonth) continue;
    const key = todayKey(txn.occurredAt);
    const amount = Number(txn.amount || 0);
    if (txn.type === "expense") dayExpense.set(key, (dayExpense.get(key) || 0) + amount);
    if (txn.type === "income") dayIncome.set(key, (dayIncome.get(key) || 0) + amount);
  }

  const weekdays = state.preferences.locale === "en"
    ? ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
    : ["一", "二", "三", "四", "五", "六", "日"];
  const cells = [];
  const leadingBlanks = (firstDay.getDay() + 6) % 7;
  for (let i = 0; i < leadingBlanks; i += 1) {
    cells.push(`<span class="calendar-cell blank"></span>`);
  }
  for (let day = 1; day <= daysInMonth; day += 1) {
    const d = new Date(now.getFullYear(), now.getMonth(), day);
    const key = todayKey(d);
    const expense = dayExpense.get(key) || 0;
    const income = dayIncome.get(key) || 0;
    cells.push(`
      <span class="calendar-cell ${expense || income ? "has-data" : ""} ${key === today ? "today" : ""}">
        <span class="calendar-day">${day}</span>
        <span class="calendar-values">
          ${expense ? `<span class="calendar-money negative">-${escapeHtml(compactMoney(expense))}</span>` : ""}
          ${income ? `<span class="calendar-money positive">+${escapeHtml(compactMoney(income))}</span>` : ""}
        </span>
      </span>
    `);
  }
  while (cells.length % 7 !== 0) {
    cells.push(`<span class="calendar-cell blank"></span>`);
  }

  return `
    <div class="month-calendar">
      ${weekdays.map((day) => `<span class="calendar-weekday">${escapeHtml(day)}</span>`).join("")}
      ${cells.join("")}
    </div>
  `;
}

function renderCaptureTab(editingTransaction) {
  return `
    <section class="panel capture-panel">
      ${editingTransaction ? `
        <div class="section-title">
          <div>
            <h2>${escapeHtml(t("capture.editTitle"))}</h2>
          </div>
          <button class="btn ghost" data-action="cancel-edit">${escapeHtml(t("capture.cancel"))}</button>
        </div>
      ` : ""}
      ${renderCaptureForm(editingTransaction)}
    </section>
  `;
}

function renderAssetsTab(summary) {
  const totals = assetTotals();
  const assetTotal = totals.total;
  return `
    <section class="panel asset-overview-panel">
      <div class="asset-total-card" data-long-press-action="toggle-starting-assets-form" role="button" tabindex="0" aria-label="${escapeHtml(t("assets.editAssets"))}">
        <span>${escapeHtml(t("assets.title"))}</span>
        <strong class="amount ${assetTotal >= 0 ? "positive" : "negative"}">${escapeHtml(signedMoney(assetTotal))}</strong>
      </div>
      ${state.startingAssetsFormOpen ? renderStartingAssetsForm(totals.opening) : ""}
    </section>

    <div class="workspace budget-workspace">
      <section class="panel">
        <div class="section-title budget-section-title">
          <div>
            <h2>${escapeHtml(t("assets.categoryTitle"))}</h2>
          </div>
          ${renderBudgetTotalProgress(summary)}
        </div>
        <div class="budget-list asset-budget-list">
          ${renderBudgetRows(summary, 12)}
        </div>
      </section>
    </div>
  `;
}

function renderStartingAssetsForm(amount) {
  return `
    <form id="starting-assets-form" class="account-form asset-account-form" autocomplete="off">
      <input type="hidden" name="startingAssets" value="${escapeHtml(normalizeStartingAssets(amount))}">
      <div class="asset-form-head">
        <span>${escapeHtml(t("assets.openingBalance"))}</span>
        <strong data-starting-assets-display>${escapeHtml(captureAmountDisplay(amount))}</strong>
      </div>
      <button class="btn secondary" type="submit">${escapeHtml(t("assets.addAccount"))}</button>
      <div class="amount-keypad asset-keypad" aria-label="${escapeHtml(t("capture.amountKeypad"))}">
        ${ASSET_AMOUNT_KEY_ROWS.flatMap((row) => row).map(renderAssetAmountKey).join("")}
      </div>
    </form>
  `;
}

function budgetTotals(summary) {
  const rows = Object.values(summary.budgets || {});
  const budget = rows.reduce((total, item) => total + Number(item.budget || 0), 0);
  const spent = rows.reduce((total, item) => total + Number(item.spent || 0), 0);
  return {
    budget,
    spent,
    ratio: budget > 0 ? Math.min(spent / budget, 1) : 0,
  };
}

function renderBudgetTotalProgress(summary) {
  const total = budgetTotals(summary);
  if (!(total.budget > 0)) return "";
  const percent = Math.round(total.ratio * 100);
  return `
    <div class="budget-total-progress" aria-label="${escapeHtml(t("assets.totalBudget"))}">
      <span>${escapeHtml(t("assets.totalBudget"))}</span>
      <strong>${escapeHtml(formatMoney(total.spent))} / ${escapeHtml(formatMoney(total.budget))}</strong>
      <div class="budget-total-track" aria-hidden="true">
        <span style="width: ${percent}%"></span>
      </div>
    </div>
  `;
}

function renderSettingsTab() {
  if (state.settingsContent === "manual") return renderSettingsPage(t("settings.manualTitle"), renderManual());
  if (state.settingsContent === "budgets") return renderSettingsPage(t("settings.budgetTitle"), renderBudgetSettings());
  if (state.settingsContent === "profile") return renderSettingsPage(t("profile.title"), renderProfileSettings());

  return `
    <section class="settings-list">
      ${renderSettingsAccountCard()}

      ${renderSettingsSection(t("settings.productSection"), [
        renderSettingsCell(t("settings.budgetTitle"), t("settings.budgetHint"), "", "budgets"),
        renderSettingsCell(t("settings.languageTitle"), "", renderLanguageSwitch()),
        renderSettingsCell(t("settings.manualTitle"), "", "", "manual"),
        renderAppUpdateChecker(),
        renderIconCreditCell(),
      ])}

      ${isNativeApp() ? "" : renderSettingsSection(t("settings.localSection"), [
        renderSettingsCell(
          state.pwaRefreshInProgress ? t("settings.clearing") : t("settings.clearCache"),
          "",
          "",
          "clear-cache-reload",
          state.pwaRefreshInProgress,
        ),
      ])}
    </section>
  `;
}

function renderSettingsAccountCard() {
  const signedIn = Boolean(state.auth.user);
  const title = signedIn ? accountDisplayName() || t("settings.accountTitle") : t("settings.accountTitle");
  const subtitle = !state.auth.configured
    ? t("settings.accountMissingConfig")
    : !state.auth.ready
      ? t("settings.accountChecking")
      : signedIn
        ? authUserEmail() || t("settings.accountSignedIn")
        : t("settings.accountLocal");
  const action = signedIn ? "toggle-auth-panel" : "open-login";
  return `
    <section class="settings-account" aria-label="${escapeHtml(t("settings.accountTitle"))}">
      <button class="settings-account-head" type="button" data-action="${escapeHtml(action)}" ${state.auth.busy ? "disabled" : ""}>
        <img class="brand-logo settings-account-logo" src="${productLogoUrl}" alt="" aria-hidden="true">
        <span class="settings-account-copy">
          <strong>${escapeHtml(title)}</strong>
          <span>${escapeHtml(subtitle)}</span>
        </span>
        <span class="settings-chevron" aria-hidden="true">${signedIn ? state.auth.accountOpen ? "⌃" : "⌄" : "›"}</span>
      </button>
      ${signedIn && state.auth.accountOpen ? `
        <div class="settings-account-panel">
          <div class="profile-mini-grid">
            ${renderProfileMiniItem(t("profile.displayName"), profileValue(state.profile.data.displayName))}
            ${renderProfileMiniItem(t("profile.birthDate"), profileValue(state.profile.data.birthDate))}
            ${renderProfileMiniItem(t("profile.gender"), profileGenderLabel(state.profile.data.gender))}
          </div>
          <button class="settings-cell" type="button" data-action="settings-content" data-content="profile">
            <span class="settings-cell-copy">
              <strong>${escapeHtml(t("settings.accountProfile"))}</strong>
              <span>${escapeHtml(state.profile.status === "error" ? t("profile.loadFailed") : t("settings.accountProfileHint"))}</span>
            </span>
            <span class="settings-chevron">›</span>
          </button>
          <div class="settings-cell account-info-cell">
            <span class="settings-cell-copy">
              <strong>${escapeHtml(t("settings.cloudSyncTitle"))}</strong>
              <span>${escapeHtml(cloudSyncLabel())}</span>
            </span>
          </div>
          <button class="settings-cell" type="button" data-action="open-reset-password">
            <span class="settings-cell-copy">
              <strong>${escapeHtml(t("settings.resetPassword"))}</strong>
              <span>${escapeHtml(t("settings.resetPasswordHint"))}</span>
            </span>
            <span class="settings-chevron">›</span>
          </button>
          <button class="settings-cell danger-cell" type="button" data-action="sign-out" ${state.auth.busy ? "disabled" : ""}>
            <span class="settings-cell-copy">
              <strong>${escapeHtml(state.auth.busy ? t("settings.signingOut") : t("settings.signOut"))}</strong>
              <span>${escapeHtml(t("settings.accountSyncPending"))}</span>
            </span>
          </button>
        </div>
      ` : ""}
    </section>
  `;
}

function renderProfileMiniItem(label, value) {
  return `
    <span class="profile-mini-item">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value)}</strong>
    </span>
  `;
}

function renderAuthDialog() {
  const resetMode = state.auth.loginMode === "reset";
  const email = authUserEmail();
  return `
    <div class="auth-modal" role="presentation">
      <section class="auth-card" role="dialog" aria-modal="true" aria-labelledby="auth-title">
        <div class="auth-logo-row">
          <span></span>
          <img class="brand-logo auth-logo" src="${productLogoUrl}" alt="" aria-hidden="true">
          ${renderLanguageSwitch()}
        </div>
        <h2 id="auth-title">${escapeHtml(resetMode ? t("login.resetTitle") : t("login.title"))}</h2>
        <p>${escapeHtml(resetMode ? t("login.resetDesc") : t("login.desc"))}</p>
        <form id="${resetMode ? "auth-reset-form" : "auth-login-form"}" class="auth-form" autocomplete="on">
          <label>
            <span>${escapeHtml(t("login.email"))}</span>
            <input id="auth-email" name="email" type="email" autocomplete="email" required value="${escapeHtml(email)}" ${state.auth.busy ? "disabled" : ""}>
          </label>
          ${resetMode ? "" : `
            <label>
              <span>${escapeHtml(t("login.password"))}</span>
              <input name="password" type="password" autocomplete="current-password" required ${state.auth.busy ? "disabled" : ""}>
            </label>
          `}
          ${state.auth.error ? `<div class="auth-message error">${escapeHtml(state.auth.error)}</div>` : ""}
          ${state.auth.notice ? `<div class="auth-message notice">${escapeHtml(state.auth.notice)}</div>` : ""}
          <button class="btn primary wide" type="submit" ${state.auth.busy ? "disabled" : ""}>
            ${escapeHtml(state.auth.busy
              ? resetMode ? t("login.sendingReset") : t("login.submitting")
              : resetMode ? t("login.sendReset") : t("login.submit"))}
          </button>
        </form>
        <div class="auth-foot">
          <button type="button" data-action="${resetMode ? "auth-mode-signin" : "auth-mode-reset"}">
            ${escapeHtml(resetMode ? t("login.backToSignIn") : t("login.forgotPassword"))}
          </button>
          <button type="button" data-action="close-login">${escapeHtml(t("login.close"))}</button>
        </div>
      </section>
    </div>
  `;
}

function renderSettingsPage(title, body) {
  return `
    <section class="settings-page">
      <div class="settings-page-head">
        <button class="btn ghost settings-back" data-action="settings-content" data-content="home">${escapeHtml(t("settings.back"))}</button>
        <h2>${escapeHtml(title)}</h2>
      </div>
      ${body}
    </section>
  `;
}

function renderProfileSettings() {
  const draft = state.profile.draft || state.profile.data || EMPTY_AEVUM_PROFILE;
  const busy = state.profile.status === "saving";
  return `
    <form id="profile-form" class="profile-form">
      <p class="settings-page-hint">${escapeHtml(t("profile.hint"))}</p>
      ${state.profile.status === "error" && state.profile.error ? `<div class="auth-message error">${escapeHtml(state.profile.error)}</div>` : ""}
      <label>
        <span>${escapeHtml(t("profile.displayName"))}</span>
        <input name="displayName" data-profile-field="displayName" type="text" autocomplete="name" value="${escapeHtml(draft.displayName)}" ${busy ? "disabled" : ""}>
      </label>
      <label>
        <span>${escapeHtml(t("profile.birthDate"))}</span>
        <input name="birthDate" data-profile-field="birthDate" type="date" value="${escapeHtml(draft.birthDate)}" ${busy ? "disabled" : ""}>
      </label>
      <div class="profile-choice-field">
        <span>${escapeHtml(t("profile.gender"))}</span>
        ${renderProfileGenderChoice(draft.gender)}
      </div>
      <button class="btn primary wide" type="submit" ${busy ? "disabled aria-busy=\"true\"" : ""}>
        ${escapeHtml(busy ? t("profile.saving") : t("profile.save"))}
      </button>
    </form>
  `;
}

function renderProfileGenderChoice(value) {
  const options = profileGenderOptions(true);
  const selected = options.find((option) => option.value === value) || options[0];
  return `
    <div class="choice-control profile-gender-choice" data-choice data-profile-choice="gender">
      <input type="hidden" name="gender" value="${escapeHtml(selected.value)}">
      <button class="choice-trigger" type="button" data-action="toggle-choice" aria-expanded="false">
        <span>${escapeHtml(selected.label)}</span>
        <span class="choice-chevron" aria-hidden="true">▼</span>
      </button>
      <div class="choice-menu">
        ${options.map((option) => `
          <button class="choice-option ${option.value === selected.value ? "active" : ""}" type="button" data-action="choose-profile-option" data-choice-value="${escapeHtml(option.value)}">
            ${escapeHtml(option.label)}
          </button>
        `).join("")}
      </div>
    </div>
  `;
}

function renderSettingsSection(title, cells) {
  return `
    <section class="settings-group" aria-label="${escapeHtml(title)}">
      <div class="settings-cells">${cells.join("")}</div>
    </section>
  `;
}

function renderSettingsCell(primary, secondary = "", right = "", action = "", disabled = false) {
  const isButton = Boolean(action);
  const content = `
    <span class="settings-cell-copy">
      <strong>${escapeHtml(primary)}</strong>
      ${secondary ? `<span>${escapeHtml(secondary)}</span>` : ""}
    </span>
    ${right ? `<span class="settings-cell-right">${right}</span>` : isButton ? `<span class="settings-chevron">›</span>` : ""}
  `;
  if (!isButton) return `<div class="settings-cell">${content}</div>`;
  const isSettingsContent = ["manual", "budgets", "profile"].includes(action);
  return `
    <button class="settings-cell" data-action="${escapeHtml(isSettingsContent ? "settings-content" : action)}" ${isSettingsContent ? `data-content="${escapeHtml(action)}"` : ""} ${disabled ? "disabled aria-busy=\"true\"" : ""}>
      ${content}
    </button>
  `;
}

function renderIconCreditCell() {
  return `
    <div class="settings-cell icon-credit-cell">
      <span class="settings-cell-copy">
        <strong>${escapeHtml(t("settings.iconCreditTitle"))}</strong>
        <span>
          ${escapeHtml(t("settings.iconCreditHint"))}
          <a href="https://www.thiings.co" target="_blank" rel="noreferrer">Thiings.co</a>
        </span>
      </span>
    </div>
  `;
}

function isNativeApp() {
  return Capacitor.isNativePlatform?.() === true;
}

function stripVersionPrefix(tag) {
  return String(tag || "").replace(/^v/i, "").trim();
}

function parseVersion(value) {
  const [core, pre = ""] = String(value || "0.0.0").split("-");
  return {
    nums: core.split(".").map((part) => Number.parseInt(part, 10) || 0),
    pre,
  };
}

function compareVersions(a, b) {
  const left = parseVersion(a);
  const right = parseVersion(b);
  const length = Math.max(left.nums.length, right.nums.length);
  for (let index = 0; index < length; index += 1) {
    const leftPart = left.nums[index] || 0;
    const rightPart = right.nums[index] || 0;
    if (leftPart > rightPart) return 1;
    if (leftPart < rightPart) return -1;
  }
  if (!left.pre && right.pre) return 1;
  if (left.pre && !right.pre) return -1;
  if (left.pre && right.pre) {
    return Math.sign(left.pre.localeCompare(right.pre, undefined, { numeric: true }));
  }
  return 0;
}

function pickApkAsset(assets) {
  if (!Array.isArray(assets)) return null;
  return assets.find((asset) => /\.apk$/i.test(asset?.name || "")) || null;
}

function hasCjk(text) {
  return /[\u3400-\u9fff]/.test(text);
}

function localizeReleaseNoteLine(line) {
  const prefix = line.match(/^(\s*[-*]\s*)/)?.[1] || "";
  let text = String(line || "").replace(/^\s*[-*]\s*/, "").trim();
  if (!text || /^\s*full changelog\s*:/i.test(text)) return "";
  text = text.replace(/^#+\s*/, "").replace(/\*\*/g, "").replace(/`/g, "").trim();
  if (/^(bump|reset|release)\s+.*v?\d+\.\d+\.\d+$/i.test(text)) return "";
  text = text
    .replace(/[;,]?\s*(bump|reset)\s+(version\s+)?(to\s+)?v?\d+\.\d+\.\d+/gi, "")
    .replace(/\bv?\d+\.\d+\.\d+\b/g, "")
    .replace(/\s*\(\s*\)/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
  if (!text) return "";
  if (state.preferences.locale === "en" || hasCjk(text)) return `${prefix}${text}`;
  const lower = text.toLowerCase();
  if (/apk|android|capacitor|release workflow|installer/.test(lower)) return `${prefix}优化 Android APK 和安装包更新流程`;
  if (/settings|update checker|check update/.test(lower)) return `${prefix}优化设置页检查更新体验`;
  if (/pwa|cache/.test(lower)) return `${prefix}优化 PWA 刷新与缓存处理`;
  if (/supabase|aevum account|auth|login/.test(lower)) return `${prefix}优化 Aevum 账号与云端配置`;
  if (/ledger|capture|transaction|budget|asset/.test(lower)) return `${prefix}优化账本、预算和资产体验`;
  if (/ui|style|layout|theme|icon|logo/.test(lower)) return `${prefix}优化界面、图标和品牌细节`;
  if (/fix|repair|resolve/.test(lower)) return `${prefix}修复应用问题`;
  if (/add|support|enable|new/.test(lower)) return `${prefix}新增应用能力`;
  return `${prefix}${text}`;
}

function cleanReleaseNotes(notes) {
  return String(notes || "")
    .split("\n")
    .map(localizeReleaseNoteLine)
    .filter(Boolean)
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function renderReleaseNotes(notes, maxChars = 900) {
  const cleaned = cleanReleaseNotes(notes).slice(0, maxChars);
  if (!cleaned) return "";
  return `
    <div class="release-notes">
      ${cleaned.split("\n").map((line, index) => {
        const isBullet = /^[-*]\s+/.test(line);
        const text = line.replace(/^[-*]\s+/, "");
        return `
          <div class="${isBullet ? "release-note-item" : "release-note-heading"}" data-note-index="${index}">
            ${escapeHtml(isBullet ? `- ${text}` : text)}
          </div>
        `;
      }).join("")}
    </div>
  `;
}

function renderAppUpdateChecker() {
  const update = state.update;
  const release = update.release;
  const recentActionEnabled = update.status === "latest" && release && update.showRecentAction;
  const primaryActionLabel = update.status === "checking"
    ? t("settings.updateChecking")
    : recentActionEnabled
      ? update.showNotes ? t("settings.updateHideRecent") : t("settings.viewRecent")
      : t("settings.checkUpdate");
  const primaryAction = recentActionEnabled ? "toggle-update-notes" : "check-update";
  const hasNewer = update.status === "newer" && release;
  const installBusy = update.installState !== "idle";
  return `
    <div class="settings-cell app-update-cell">
      <div class="app-update-head">
        <span class="settings-cell-copy">
          <strong>${escapeHtml(t("settings.version"))}</strong>
          <span>v${escapeHtml(APP_VERSION)}</span>
        </span>
        ${update.status === "latest" && recentActionEnabled ? `<span class="app-update-latest">✓ ${escapeHtml(t("settings.updateLatest"))}</span>` : ""}
        <button class="app-update-action" type="button" data-action="${escapeHtml(primaryAction)}" ${update.status === "checking" ? "disabled aria-busy=\"true\"" : ""}>
          ${escapeHtml(primaryActionLabel)}
          ${hasNewer ? `<span class="app-update-dot" aria-hidden="true"></span>` : ""}
        </button>
      </div>
      ${update.status === "error" ? `<div class="app-update-message error">${escapeHtml(t("settings.updateError"))}</div>` : ""}
      ${update.status === "no-release" ? `<div class="app-update-message">${escapeHtml(t("settings.updateNoRelease"))}</div>` : ""}
      ${update.status === "latest" && update.showNotes && release ? `
        <div class="app-update-panel">
          <strong>${escapeHtml(t("settings.updateRecentTitle", { v: release.version }))}</strong>
          ${renderReleaseNotes(release.notes, 1200) || `<div class="app-update-message ok">✓ ${escapeHtml(t("settings.updateLatest"))}</div>`}
        </div>
      ` : ""}
      ${hasNewer ? `
        <div class="app-update-panel">
          <strong>${escapeHtml(t("settings.updateNewTitle", { v: release.version }))}</strong>
          ${release.apkUrl ? `
            <div class="app-update-actions">
              ${isNativeApp() ? `
                <button class="app-update-download" type="button" data-action="install-update" ${installBusy ? "disabled aria-busy=\"true\"" : ""}>
                  ${escapeHtml(update.installState === "downloading"
                    ? `${t("settings.updateDownloading")}${update.downloadPct != null ? ` ${update.downloadPct}%` : ""}`
                    : update.installState === "installing"
                      ? t("settings.updateInstalling")
                      : `↓ ${t("settings.updateInstall")}`)}
                </button>
              ` : `
                <a class="app-update-download" href="${escapeHtml(release.apkUrl)}" target="_blank" rel="noreferrer">
                  ↓ ${escapeHtml(t("settings.updateDownload"))}
                </a>
              `}
            </div>
          ` : ""}
          ${update.installState === "downloading" ? `
            <div class="update-progress-track">
              <div class="update-progress-fill ${update.downloadPct == null ? "indeterminate" : ""}" style="${update.downloadPct == null ? "" : `width: ${update.downloadPct}%`}"></div>
            </div>
          ` : ""}
          ${update.installMsg ? `<div class="app-update-message warn">${escapeHtml(update.installMsg)}</div>` : ""}
          ${renderReleaseNotes(release.notes, 800) || `<div class="app-update-message">v${escapeHtml(release.version)}</div>`}
        </div>
      ` : ""}
    </div>
  `;
}

function renderLanguageSwitch() {
  return `
    <button class="language-switch compact-language" type="button" data-action="toggle-locale" data-locale="${escapeHtml(state.preferences.locale)}" aria-label="${escapeHtml(t("settings.languageTitle"))}">
      ${LOCALES.map(renderLocaleSegment).join("")}
    </button>
  `;
}

function renderBudgetSettings() {
  const budgets = editableBudgets();
  return `
    <form id="budget-form" class="budget-form">
      <p class="settings-page-hint">${escapeHtml(t("settings.budgetPageHint"))}</p>
      <div class="budget-editor-list">
        ${CATEGORIES.map((category) => {
          const active = state.budgetKeypadCategory === category;
          const value = budgets[category] ?? 0;
          return `
          <div class="budget-edit-row ${active ? "keypad-open" : ""}" data-budget-row data-budget-category="${escapeHtml(category)}">
            <span class="budget-edit-copy">
              ${renderIconBadge(category, "category", "small")}
              <span>${escapeHtml(category)}</span>
            </span>
            <input name="${escapeHtml(category)}" data-budget-input type="hidden" value="${escapeHtml(value)}">
            <button class="budget-amount-button" type="button" data-action="activate-budget-keypad" data-category="${escapeHtml(category)}">
              <span data-budget-amount-display>${escapeHtml(captureAmountDisplay(value))}</span>
            </button>
            ${active ? renderBudgetAmountKeypad() : ""}
          </div>
        `;
        }).join("")}
      </div>
      <div class="budget-actions">
        <button class="btn secondary" type="button" data-action="reset-budgets">${escapeHtml(t("settings.budgetReset"))}</button>
        <button class="btn primary" type="submit">${escapeHtml(t("settings.budgetSave"))}</button>
      </div>
    </form>
  `;
}

function renderManual() {
  return `
    <div class="reading-list manual-list">
      ${MANUAL_SECTIONS.map((section) => `
        <article class="reading-entry">
          <h3>${escapeHtml(localized(section.title))}</h3>
          <ul>
            ${localized(section.items).map((item) => `<li>${escapeHtml(item)}</li>`).join("")}
          </ul>
        </article>
      `).join("")}
      <article class="reading-entry guide-changelog-heading">
        <h3>${escapeHtml(t("manual.changelogHeading"))}</h3>
      </article>
      ${renderChangelogEntries()}
    </div>
  `;
}

function renderChangelogEntries() {
  return CHANGELOG_ENTRIES.map((entry) => `
    <article class="reading-entry changelog-entry">
      <div class="changelog-head">
        <span>${escapeHtml(entry.date)}</span>
        <h3>${escapeHtml(localized(entry.title))}</h3>
      </div>
      <ul>
        ${localized(entry.items).map((item) => `<li>${escapeHtml(item)}</li>`).join("")}
      </ul>
    </article>
  `).join("");
}

function renderLocaleSegment(locale) {
  const active = state.preferences.locale === locale.id;
  return `
    <span class="locale-segment ${active ? "active" : ""}">
      ${escapeHtml(locale.label)}
    </span>
  `;
}

function renderStat(label, value) {
  return `
    <div class="stat">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value)}</strong>
    </div>
  `;
}

function renderCaptureForm(editingTransaction) {
  const sourceTxn = editingTransaction || {
    ...defaultCaptureDraft(),
    ...(state.captureDraft || {}),
  };
  const type = sourceTxn.type === "income" ? "income" : "expense";
  const txn = {
    ...sourceTxn,
    type,
    category: sanitizeCategoryForType(type, sourceTxn.category),
    project: transactionProjectLabel(sourceTxn),
    projectOnly: isProjectOnlyTransaction(sourceTxn),
  };
  const projectPanelOpen = Boolean(state.captureProjectOpen || txn.project || txn.projectOnly);

  return `
    <form id="transaction-form" class="transaction-form type-${escapeHtml(txn.type)}" autocomplete="off">
      <input type="hidden" name="id" value="${escapeHtml(txn.id || "")}">
      <input type="hidden" name="type" value="${escapeHtml(txn.type)}">
      <input type="hidden" name="amount" value="${escapeHtml(txn.amount || "")}">
      <input type="hidden" name="title" value="${escapeHtml(txn.title || "")}">
      <input type="hidden" name="merchant" value="${escapeHtml(txn.merchant || "")}">
      <input type="hidden" name="book" value="${escapeHtml(txn.book || "日常账本")}">
      <input type="hidden" name="account" value="${escapeHtml(txn.account || defaultAccountName())}">
      <input type="hidden" name="category" value="${escapeHtml(txn.category || "餐饮")}">
      <input type="hidden" name="currency" value="${escapeHtml(txn.currency || "CNY")}">
      <input type="hidden" name="tags" value="${escapeHtml(Array.isArray(txn.tags) ? txn.tags.join(" ") : txn.tags || "")}">
      <div class="capture-switch" data-choice-group="type">
        ${TRANSACTION_TYPES.map((item) => `
          <button class="capture-segment ${txn.type === item.id ? "active" : ""}" type="button" data-action="pick-field" data-field="type" data-value="${escapeHtml(item.id)}" data-pick-button>
            ${escapeHtml(t(`type.${item.id}`))}
          </button>
        `).join("")}
      </div>

      ${renderCaptureCategoryBoard(txn)}

      <section class="amount-pad-panel" aria-label="${escapeHtml(t("capture.amount"))}">
        <div class="amount-readout">
          <span>${escapeHtml(t("capture.amount"))}</span>
          <button class="capture-project-toggle ${projectPanelOpen ? "active" : ""}" type="button" data-action="toggle-project-fields" aria-label="${escapeHtml(t("capture.projectToggle"))}" aria-expanded="${projectPanelOpen ? "true" : "false"}">
            ${glyphSvg("project")}
          </button>
          <strong data-amount-display>${escapeHtml(captureAmountDisplay(txn.amount, txn.currency))}</strong>
        </div>
        <div class="capture-detail-row ${txn.projectOnly ? "project-only" : ""}">
          <input type="hidden" name="occurredAt" value="${escapeHtml(toDateInputValue(txn.occurredAt || new Date()))}">
          ${renderCaptureTimeChoice(txn.occurredAt || new Date())}
          <label class="capture-note-field">
            <span>${escapeHtml(t("capture.note"))}</span>
            <input name="note" value="${escapeHtml(txn.note || "")}">
          </label>
        </div>
        <div class="capture-project-row ${projectPanelOpen ? "open" : ""}">
          <label class="capture-project-field">
            <span>${escapeHtml(t("capture.project"))}</span>
            <input name="project" value="${escapeHtml(txn.project || "")}" placeholder="${escapeHtml(t("capture.projectPlaceholder"))}">
          </label>
          <label class="capture-project-only-field">
            <input type="checkbox" name="projectOnly" value="true" ${txn.projectOnly ? "checked" : ""}>
            <span>${escapeHtml(t("capture.projectOnly"))}</span>
          </label>
        </div>

        ${renderAmountKeypad(Boolean(editingTransaction))}
      </section>
    </form>
  `;
}

function renderCaptureCategoryBoard(txn) {
  const selectedCategory = txn.category || defaultCategoryForType(txn.type);
  const selectedTitle = txn.title || "";
  const groups = captureGroupsForType(txn.type);
  const rows = chunkList(groups, 4);
  const selectedGroup = groups.find((group) => group.category === selectedCategory);
  const selectedItems = selectedGroup?.items || [];
  return `
    <section class="capture-category-board" aria-label="${escapeHtml(t("capture.category"))}">
      ${rows.map((row) => `
        <div class="capture-category-row">
          <div class="capture-category-grid">
            ${row.map((group) => `
              <button class="capture-category-button ${selectedCategory === group.category ? "active" : ""}" type="button" data-action="pick-field" data-field="category" data-value="${escapeHtml(group.category)}" data-pick-button>
                ${renderIconBadge(group.category, "category")}
                <span>${escapeHtml(group.category)}</span>
              </button>
            `).join("")}
          </div>
        </div>
      `).join("")}
      ${selectedItems.length ? `
        <div class="capture-subcategory-grid active" data-subcategory-group="${escapeHtml(selectedCategory)}">
          ${selectedItems.map((item) => `
            <button class="capture-subcategory-button ${selectedTitle === item ? "active" : ""}" type="button" data-action="pick-subcategory" data-category="${escapeHtml(selectedCategory)}" data-title="${escapeHtml(item)}">
              ${renderIconBadge(item, "subcategory", "tiny", selectedCategory)}
              <span>${escapeHtml(item)}</span>
            </button>
          `).join("")}
        </div>
      ` : ""}
    </section>
  `;
}

function renderCaptureTimeChoice(value) {
  const selected = captureTimeSegmentId(value);
  const selectedItem = CAPTURE_TIME_SEGMENTS.find((item) => item.id === selected) || CAPTURE_TIME_SEGMENTS[0];
  return `
    <div class="choice-control capture-time-choice" data-choice data-choice-time aria-label="${escapeHtml(t("capture.time"))}">
      <button class="choice-trigger" type="button" data-action="toggle-choice" aria-expanded="false">
        <span>${escapeHtml(t(selectedItem.labelKey))}</span>
        <span class="choice-chevron" aria-hidden="true">▼</span>
      </button>
      <div class="choice-menu">
      ${CAPTURE_TIME_SEGMENTS.map((item) => `
          <button class="choice-option ${selected === item.id ? "active" : ""}" type="button" data-action="choose-option" data-choice-value="${escapeHtml(item.id)}" data-hour="${item.hour}">
          ${escapeHtml(t(item.labelKey))}
        </button>
        `).join("")}
      </div>
    </div>
  `;
}

function renderAmountKeypad(isEditing = false) {
  return `
    <div class="amount-keypad" aria-label="${escapeHtml(t("capture.amountKeypad"))}">
      ${AMOUNT_KEY_ROWS.flatMap((row) => row).map((key) => renderAmountKey(key, isEditing)).join("")}
    </div>
  `;
}

function renderAmountKey(key, isEditing) {
  if (key === "submit") {
    return `
      <button class="amount-key amount-submit" type="submit">
        ${escapeHtml(isEditing ? t("capture.saveEdit") : t("capture.done"))}
      </button>
    `;
  }
  const label = key === "backspace" ? "⌫" : key === "clear" ? "C" : key;
  const aria = key === "backspace" ? t("capture.keypadBackspace") : key === "clear" ? t("capture.keypadClear") : key;
  return `
    <button class="amount-key ${key === "backspace" || key === "clear" ? "utility" : ""}" type="button" data-action="amount-key" data-key="${escapeHtml(key)}" aria-label="${escapeHtml(aria)}">
      ${escapeHtml(label)}
    </button>
  `;
}

function renderBudgetAmountKeypad() {
  return `
    <div class="amount-keypad budget-keypad" aria-label="${escapeHtml(t("capture.amountKeypad"))}">
      ${ASSET_AMOUNT_KEY_ROWS.flatMap((row) => row).map(renderAssetAmountKey).join("")}
    </div>
  `;
}

function renderAssetAmountKey(key) {
  const label = key === "backspace" ? "⌫" : key === "clear" ? "C" : key;
  const aria = key === "backspace" ? t("capture.keypadBackspace") : key === "clear" ? t("capture.keypadClear") : key;
  return `
    <button class="amount-key ${key === "backspace" || key === "clear" ? "utility" : ""} ${key === "0" ? "zero-wide" : ""}" type="button" data-action="amount-key" data-key="${escapeHtml(key)}" aria-label="${escapeHtml(aria)}">
      ${escapeHtml(label)}
    </button>
  `;
}

function renderBudgetRows(summary, limit = 6) {
  const entries = Object.entries(summary.budgets)
    .filter(([category]) => CATEGORIES.includes(category))
    .sort((a, b) => b[1].spent - a[1].spent)
    .slice(0, limit);
  if (!entries.length) return `<div class="empty">${escapeHtml(t("assets.noBudget"))}</div>`;
  return entries.map(([category, data]) => {
    const ratio = Math.min(1, data.ratio || 0);
    return `
      <div class="budget-row">
        <div class="metric-row-head">
          ${renderIconBadge(category, "category", "small")}
          <div class="metric-copy">
            <strong>${escapeHtml(category)}</strong>
            <span>${formatMoney(data.spent)} / ${formatMoney(data.budget)}</span>
          </div>
          <span class="metric-amount">${Math.round(ratio * 100)}%</span>
        </div>
        <div class="budget-track"><span style="width: ${Math.round(ratio * 100)}%"></span></div>
      </div>
    `;
  }).join("");
}

function renderCategoryStatRows(summary, limit = 8) {
  const entries = Object.entries(summary.categoryExpense)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit);
  if (!entries.length) return `<div class="empty">${escapeHtml(t("stats.noCategory"))}</div>`;
  const total = Math.max(1, summary.monthExpense);
  return entries.map(([category, amount]) => `
    <div class="budget-row">
      <div class="metric-row-head">
        ${renderIconBadge(category, "category", "small")}
        <div class="metric-copy">
          <strong>${escapeHtml(category)}</strong>
          <span>${formatMoney(amount)}</span>
        </div>
        <span class="metric-amount">${Math.round((amount / total) * 100)}%</span>
      </div>
      <div class="budget-track"><span style="width: ${Math.round((amount / total) * 100)}%"></span></div>
    </div>
  `).join("");
}

function renderProjectStatRows(entries = []) {
  if (!entries.length) return `<div class="empty">${escapeHtml(t("stats.noProject"))}</div>`;
  const max = Math.max(...entries.map((entry) => entry.amount), 1);
  return entries.map((entry) => {
    const ratio = Math.min(1, entry.amount / max);
    const meta = [
      t("stats.projectCount", { count: entry.count }),
      entry.projectOnlyCount ? t("stats.projectOnly") : "",
    ].filter(Boolean).join(" · ");
    return `
      <div class="budget-row project-stat-row">
        <div class="metric-row-head">
          ${renderIconBadge("旅行", "category", "small")}
          <div class="metric-copy">
            <strong>${escapeHtml(entry.project)}</strong>
            <span>${escapeHtml(meta)}</span>
          </div>
          <span class="metric-amount">${formatMoney(entry.amount)}</span>
        </div>
        <div class="budget-track"><span style="width: ${Math.round(ratio * 100)}%"></span></div>
      </div>
    `;
  }).join("");
}

function renderFilters() {
  return `
    <div class="filters ${state.searchOpen ? "search-open" : ""}">
      <button class="icon-button search-toggle-button ${state.searchOpen ? "active" : ""}" type="button" data-action="toggle-ledger-search" aria-label="${escapeHtml(t("filter.search"))}" aria-pressed="${state.searchOpen ? "true" : "false"}">
        ${glyphSvg("search")}
      </button>
      ${state.searchOpen ? `<input class="search-filter-input" data-filter="query" placeholder="${escapeHtml(t("filter.search"))}" value="${escapeHtml(state.filters.query)}">` : ""}
      ${renderFilterChoice("category", state.filters.category, [{ value: "all", label: t("filter.allCategories") }, ...itemOptions(categoriesForType(state.filters.type))])}
    </div>
  `;
}

function renderTransactionRow(txn) {
  const project = transactionProjectLabel(txn);
  const projectOnly = isProjectOnlyTransaction(txn);
  const note = String(txn.note || "").trim();
  const titleLine = [txn.title, note && note !== txn.title ? note : ""].filter(Boolean).join(" · ");
  const accountMeta = [
    projectOnly ? "" : formatWhen(txn.occurredAt),
    projectOnly ? "" : captureTimeSegmentLabel(txn.occurredAt),
    transactionTypeLabel(txn),
  ].filter(Boolean).join(" · ");
  const projectMeta = project || projectOnly
    ? `<span class="txn-project-meta">
        ${project ? `<span>${escapeHtml(t("capture.project"))}：${escapeHtml(project)}</span>` : ""}
        ${projectOnly ? `<span>${escapeHtml(t("txn.projectOnly"))}</span>` : ""}
      </span>`
    : "";
  return `
    <article class="txn-row action-row ${escapeHtml(transactionTone(txn))} ${projectOnly ? "project-only" : ""}" data-long-press-actions>
      <div class="txn-main">
        ${renderTransactionIconBadge(txn)}
        <div class="txn-copy">
          <strong>${escapeHtml(titleLine || txn.title)}</strong>
          ${accountMeta ? `<span>${escapeHtml(accountMeta)}</span>` : ""}
          ${projectMeta}
        </div>
        <div class="txn-side">
          <div class="amount ${transactionAmountClass(txn)}">${signedAmount(txn)}</div>
        </div>
        <div class="row-actions txn-actions">
          <button class="btn ghost row-action-button txn-action-button" data-action="edit" data-id="${escapeHtml(txn.id)}" aria-label="${escapeHtml(t("txn.edit"))}">
            ${glyphSvg("edit")}
            <span>${escapeHtml(t("txn.edit"))}</span>
          </button>
          <button class="btn ghost row-action-button txn-action-button danger-text" data-action="delete" data-id="${escapeHtml(txn.id)}" aria-label="${escapeHtml(t("txn.delete"))}">
            ${glyphSvg("trash")}
            <span>${escapeHtml(t("txn.delete"))}</span>
          </button>
        </div>
      </div>
    </article>
  `;
}

function formToTransaction(form) {
  const data = Object.fromEntries(new FormData(form).entries());
  data.reimbursable = false;
  data.receiptDataUrl = "";
  return normalizeTransaction(data);
}

function syncChoiceGroup(form, field) {
  const input = form?.elements?.namedItem(field);
  if (!input) return;
  const group = [...form.querySelectorAll("[data-choice-group]")]
    .find((item) => item.dataset.choiceGroup === field);
  if (!group) return;
  group.querySelectorAll("[data-value]").forEach((button) => {
    button.classList.toggle("active", button.dataset.value === input.value);
  });
}

function syncChoiceControl(form, field, value) {
  const choice = [...form.querySelectorAll("[data-choice-name]")]
    .find((item) => item.dataset.choiceName === field);
  if (!choice) return;
  const option = [...choice.querySelectorAll(".choice-option")]
    .find((item) => item.dataset.choiceValue === value);
  if (!option) return;
  choice.querySelector(".choice-trigger span:first-child").textContent = option.textContent.trim();
  choice.querySelectorAll(".choice-option").forEach((item) => {
    item.classList.toggle("active", item === option);
  });
}

function syncAmountDisplay(form) {
  const amount = form?.elements?.namedItem("amount")?.value || "";
  const currency = form?.elements?.namedItem("currency")?.value || "CNY";
  const display = form?.querySelector("[data-amount-display]");
  if (display) display.textContent = captureAmountDisplay(amount, currency);
}

function syncBudgetAmountDisplay(row) {
  const amount = row?.querySelector("[data-budget-input]")?.value || "";
  const display = row?.querySelector("[data-budget-amount-display]");
  if (display) display.textContent = captureAmountDisplay(amount);
}

function syncStartingAssetsDisplay(form) {
  const amount = form?.elements?.namedItem("startingAssets")?.value || "";
  const display = form?.querySelector("[data-starting-assets-display]");
  if (display) display.textContent = captureAmountDisplay(amount);
}

function syncPickButtons(form) {
  if (!form) return;
  form.querySelectorAll("[data-pick-button]").forEach((button) => {
    const field = button.dataset.field;
    const input = field ? form.elements.namedItem(field) : null;
    button.classList.toggle("active", Boolean(input && button.dataset.value === input.value));
  });

  const category = form.elements.namedItem("category")?.value || "";
  const title = form.elements.namedItem("title")?.value || "";
  const type = form.elements.namedItem("type")?.value || "expense";
  form.classList.toggle("type-income", type === "income");
  form.classList.toggle("type-expense", type !== "income");
  form.querySelectorAll("[data-subcategory-group]").forEach((group) => {
    group.classList.toggle("active", group.dataset.subcategoryGroup === category);
  });
  form.querySelectorAll("[data-action=\"pick-subcategory\"]").forEach((button) => {
    button.classList.toggle(
      "active",
      button.dataset.category === category && button.dataset.title === title,
    );
  });
}

function syncProjectOnlyMode(form) {
  if (!form || form.getAttribute("id") !== "transaction-form") return;
  const field = form.elements.namedItem("projectOnly");
  const projectOnly = Boolean(field?.checked);
  form.querySelector(".capture-detail-row")?.classList.toggle("project-only", projectOnly);
}

function syncCaptureDraftFromForm(form) {
  if (!form || form.getAttribute("id") !== "transaction-form") return;
  syncProjectOnlyMode(form);
  if (state.editingTransactionId) return;
  const data = Object.fromEntries(new FormData(form).entries());
  const type = data.type === "income" ? "income" : "expense";
  state.captureDraft = {
    ...defaultCaptureDraft(),
    type,
    amount: data.amount || "",
    currency: data.currency || "CNY",
    book: data.book || "日常账本",
    account: data.account || defaultAccountName(),
    category: sanitizeCategoryForType(type, data.category),
    title: data.title || "",
    merchant: data.merchant || "",
    occurredAt: data.occurredAt || toDateInputValue(new Date()),
    tags: data.tags || "",
    project: data.project || "",
    projectOnly: data.projectOnly === "true",
    note: data.note || "",
    reimbursable: false,
    receiptDataUrl: "",
  };
}

function refreshCaptureCategoryBoard(form) {
  const type = form?.elements?.namedItem("type")?.value || "expense";
  const category = form?.elements?.namedItem("category")?.value || defaultCategoryForType(type);
  const title = form?.elements?.namedItem("title")?.value || "";
  const board = form?.querySelector(".capture-category-board");
  if (board) {
    board.outerHTML = renderCaptureCategoryBoard({
      type,
      category: sanitizeCategoryForType(type, category),
      title,
    });
  }
}

function fillForm(values) {
  const form = document.querySelector("#transaction-form");
  if (!form) return;
  Object.entries(values).forEach(([key, value]) => {
    const field = form.elements.namedItem(key);
    if (field) field.value = value;
    syncChoiceControl(form, key, value);
    syncChoiceGroup(form, key);
  });
  syncAmountDisplay(form);
  syncPickButtons(form);
  syncCaptureDraftFromForm(form);
}

function pickFormField(button) {
  const form = button.closest("form");
  const field = button.dataset.field;
  const value = button.dataset.value;
  const input = form?.elements?.namedItem(field);
  if (!form || !field || value == null || !input) return;
  input.value = value;
  if (field === "type") {
    const category = form.elements.namedItem("category");
    const title = form.elements.namedItem("title");
    if (category) category.value = defaultCategoryForType(value);
    if (title) title.value = "";
    refreshCaptureCategoryBoard(form);
  }
  if (field === "category") {
    const title = form.elements.namedItem("title");
    if (title) title.value = "";
    refreshCaptureCategoryBoard(form);
  }
  syncChoiceControl(form, field, value);
  syncChoiceGroup(form, field);
  syncPickButtons(form);
  syncCaptureDraftFromForm(form);
}

function pickCaptureSubcategory(button) {
  fillForm({
    category: button.dataset.category || "其他",
    title: button.dataset.title || "",
  });
}

function nextAmountValue(current, key) {
  if (key === "clear") return "";
  if (key === "backspace") return current.slice(0, -1);
  if (key === ".") return current.includes(".") ? current : `${current || "0"}.`;
  if (key === "00" && (!current || current === "0")) return "0";

  const next = current === "0" && key !== "00" ? key : `${current}${key}`;
  const [whole = "", cents = ""] = next.split(".");
  if (whole.replace(/^0+/, "").length > 8) return current;
  if (cents.length > 2) return current;
  return next;
}

function applyAmountKey(button) {
  const form = button.closest("form");
  const budgetRow = button.closest("[data-budget-row]");
  const startingAssetsInput = form?.elements?.namedItem("startingAssets");
  const input = form?.elements?.namedItem("amount")
    || startingAssetsInput
    || budgetRow?.querySelector("[data-budget-input]");
  if (!input) return;
  input.value = nextAmountValue(String(input.value || ""), button.dataset.key || "");
  if (budgetRow) {
    const category = budgetRow.dataset.budgetCategory || "";
    if (category) ensureBudgetDraft()[category] = input.value;
    syncBudgetAmountDisplay(budgetRow);
  } else if (startingAssetsInput) {
    syncStartingAssetsDisplay(form);
  } else {
    syncAmountDisplay(form);
    syncCaptureDraftFromForm(form);
  }
}

async function clearPwaCacheAndReload() {
  if (state.pwaRefreshInProgress) return;
  state.pwaRefreshInProgress = true;
  render();
  try {
    if ("serviceWorker" in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(registrations.map((registration) => registration.unregister()));
    }
    if ("caches" in globalThis) {
      const keys = await caches.keys();
      await Promise.all(keys.map((key) => caches.delete(key)));
    }
  } catch (err) {
    console.warn("[clear-cache] failed:", err);
  }
  window.location.reload();
}

function maybeAutoCheckAppUpdate() {
  if (state.activeTab !== "settings" || state.settingsContent !== "home") return;
  if (state.update.autoCheckStarted) return;
  state.update.autoCheckStarted = true;
  window.setTimeout(() => {
    checkForAppUpdate({ automatic: true });
  }, 0);
}

async function checkForAppUpdate({ automatic = false } = {}) {
  if (state.update.status === "checking") return;
  if (automatic && releaseCheckCache && Date.now() - releaseCheckCache.at < AUTO_CHECK_CACHE_MS) {
    state.update.status = releaseCheckCache.status;
    state.update.release = releaseCheckCache.release;
    render();
    return;
  }
  if (!automatic) {
    state.update.showNotes = false;
    state.update.showRecentAction = false;
  }
  state.update.status = "checking";
  state.update.installMsg = "";
  render();
  try {
    const response = await fetch(GITHUB_RELEASES_API, {
      headers: { Accept: "application/vnd.github+json" },
    });
    if (response.status === 404) {
      state.update.status = "no-release";
      state.update.release = null;
      state.update.showRecentAction = false;
      state.update.showNotes = false;
      releaseCheckCache = { at: Date.now(), status: "no-release", release: null };
      render();
      return;
    }
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    const remoteVersion = stripVersionPrefix(data.tag_name || "");
    const release = {
      version: remoteVersion,
      url: data.html_url || "",
      apkUrl: pickApkAsset(data.assets)?.browser_download_url || null,
      notes: data.body || "",
    };
    const status = compareVersions(remoteVersion, APP_VERSION) > 0 ? "newer" : "latest";
    state.update.status = status;
    state.update.release = release;
    state.update.showRecentAction = !automatic && status === "latest";
    state.update.showNotes = false;
    releaseCheckCache = { at: Date.now(), status, release };
  } catch (err) {
    console.warn("[update-check] failed:", err);
    state.update.status = "error";
    state.update.release = null;
    state.update.showRecentAction = false;
    if (!automatic) state.update.showNotes = false;
  }
  render();
}

async function downloadAndInstallUpdate(githubUrl) {
  if (!githubUrl) return;
  if (!isNativeApp()) {
    window.open(githubUrl, "_blank", "noreferrer");
    return;
  }
  state.update.installMsg = "";
  state.update.downloadPct = null;
  const candidates = [MIRROR_APK_URL, githubUrl].filter(Boolean);
  let lastError = null;
  for (const url of candidates) {
    let poll = null;
    try {
      state.update.installState = "downloading";
      state.update.downloadPct = null;
      render();
      poll = window.setInterval(async () => {
        try {
          const progress = await ApkDownloader.getProgress();
          if (progress && progress.total > 0) {
            const pct = Math.min(100, Math.round((progress.bytes / progress.total) * 100));
            if (pct !== state.update.downloadPct) {
              state.update.downloadPct = pct;
              render();
            }
          }
        } catch {
          // The Android notification still shows progress; ignore transient poll errors.
        }
      }, 700);
      const result = await ApkDownloader.download({ url, fileName: "viatica-update.apk" });
      if (poll) window.clearInterval(poll);
      poll = null;
      const path = result?.path;
      if (!path) throw new Error("download returned no path");
      state.update.installState = "installing";
      state.update.downloadPct = null;
      render();
      await ApkInstaller.install({ path });
      state.update.installState = "idle";
      state.update.downloadPct = null;
      render();
      return;
    } catch (err) {
      console.warn("[update-install] download attempt failed:", url, err);
      lastError = err;
      if (poll) window.clearInterval(poll);
      state.update.downloadPct = null;
    }
  }
  state.update.installState = "idle";
  const reason = lastError?.message || String(lastError || "");
  const isNetwork = /resolve host|No address|network|timeout|unable to|failed to connect/i.test(reason);
  state.update.installMsg = `${t("settings.updateInstallFailed")}${reason ? ` (${reason})` : ""}${isNetwork ? ` ${t("settings.updateNetworkHint")}` : ""}`;
  render();
  window.open(githubUrl, "_blank", "noreferrer");
}

function closeChoiceMenus(except = null) {
  document.querySelectorAll(".choice-control.open").forEach((choice) => {
    if (choice === except) return;
    choice.classList.remove("open");
    choice.querySelector(".choice-trigger")?.setAttribute("aria-expanded", "false");
  });
}

function toggleChoiceMenu(choice) {
  if (!choice) return;
  const willOpen = !choice.classList.contains("open");
  closeChoiceMenus(choice);
  choice.classList.toggle("open", willOpen);
  choice.querySelector(".choice-trigger")?.setAttribute("aria-expanded", willOpen ? "true" : "false");
}

function chooseOption(optionNode) {
  const choice = optionNode.closest("[data-choice]");
  if (!choice) return;
  const value = optionNode.dataset.choiceValue || "";
  const label = optionNode.textContent.trim();
  const input = choice.querySelector("input[type=\"hidden\"]");
  if (input) input.value = value;
  choice.querySelector(".choice-trigger span:first-child").textContent = label;
  choice.querySelectorAll(".choice-option").forEach((option) => {
    option.classList.toggle("active", option === optionNode);
  });
  closeChoiceMenus();

  const choiceName = choice.dataset.choiceName;
  if (choiceName) syncChoiceGroup(choice.closest("form"), choiceName);

  if (choice.dataset.choiceTime != null) {
    const form = choice.closest("form");
    const input = form?.elements?.namedItem("occurredAt");
    const hour = Number(optionNode.dataset.hour || 8);
    if (input) input.value = dateInputValueWithHour(input.value || new Date(), Number.isFinite(hour) ? hour : 8);
    syncCaptureDraftFromForm(form);
  }

  const filterKey = choice.dataset.choiceFilter;
  if (filterKey) {
    state.filters[filterKey] = value;
    if (filterKey === "type" && state.filters.category !== "all") {
      const options = categoriesForType(value);
      if (!options.includes(state.filters.category)) state.filters.category = "all";
    }
    render();
  }
}

document.addEventListener("pointerdown", (event) => {
  const pressAction = event.target.closest("[data-long-press-action]");
  const row = event.target.closest("[data-long-press-actions]");
  const target = pressAction || row;
  if (!target || event.target.closest("button, input, textarea, [data-choice]")) return;
  clearLongPress();
  longPressTarget = target;
  longPressPoint = { x: event.clientX, y: event.clientY };
  longPressTimer = window.setTimeout(() => {
    if (longPressTarget?.dataset?.longPressAction) {
      runLongPressAction(longPressTarget);
    } else {
      openActionRow(longPressTarget);
    }
    clearLongPress();
  }, 520);
});

document.addEventListener("pointerup", clearLongPress);
document.addEventListener("pointercancel", clearLongPress);
document.addEventListener("pointermove", (event) => {
  if (!longPressPoint) return;
  if (Math.abs(event.clientX - longPressPoint.x) > 10 || Math.abs(event.clientY - longPressPoint.y) > 10) {
    clearLongPress();
  }
});

document.addEventListener("keydown", (event) => {
  const target = event.target.closest?.("[data-long-press-action]");
  if (!target || !["Enter", " "].includes(event.key)) return;
  event.preventDefault();
  runLongPressAction(target);
});

document.addEventListener("submit", (event) => {
  const form = event.target;
  if (!(form instanceof HTMLFormElement)) return;
  event.preventDefault();
  if (form.getAttribute("id") === "auth-login-form") {
    handleAuthLogin(form);
    return;
  }
  if (form.getAttribute("id") === "auth-reset-form") {
    handlePasswordReset(form);
    return;
  }
  if (form.getAttribute("id") === "budget-form") {
    try {
      syncBudgetDraftFromForm(form);
      const budgetSource = editableBudgets();
      const nextBudgets = {};
      for (const category of CATEGORIES) {
        const value = Number(budgetSource[category] || 0);
        if (!Number.isFinite(value) || value < 0) throw new Error(t("settings.budgetInvalid"));
        nextBudgets[category] = Math.round(value * 100) / 100;
      }
      state.budgets = nextBudgets;
      state.preferences.updatedAt = new Date().toISOString();
      state.budgetKeypadCategory = "";
      state.budgetDraft = null;
      persist();
      render();
      toast(t("settings.budgetSaved"));
    } catch (err) {
      toast(err.message || t("settings.budgetInvalid"));
    }
    return;
  }
  if (form.getAttribute("id") === "starting-assets-form") {
    try {
      const value = Number(form.elements.namedItem("startingAssets")?.value || 0);
      if (!Number.isFinite(value)) throw new Error(t("assets.accountInvalid"));
      state.preferences.startingAssets = normalizeStartingAssets(value);
      state.preferences.updatedAt = new Date().toISOString();
      state.startingAssetsFormOpen = false;
      persist();
      render();
      toast(t("assets.startingAssetsSaved"));
    } catch (err) {
      toast(err.message || t("assets.accountInvalid"));
    }
    return;
  }
  if (form.getAttribute("id") === "profile-form") {
    handleProfileSave(form);
    return;
  }
  if (form.getAttribute("id") !== "transaction-form") return;
  try {
    const data = formToTransaction(form);
    const existing = data.id ? state.transactions.find((txn) => txn.id === data.id) : null;
    let cloudTransaction = data;
    let cloudMode = "insert";
    if (existing) {
      const txn = normalizeTransaction({
        ...existing,
        ...data,
        id: existing.id,
        createdAt: existing.createdAt,
        updatedAt: new Date().toISOString(),
      });
      state.transactions = state.transactions.map((item) => item.id === txn.id ? txn : item);
      state.editingTransactionId = null;
      cloudTransaction = txn;
      cloudMode = "update";
      toast(t("toast.updated"));
    } else {
      state.transactions.unshift(data);
      state.captureDraft = null;
      toast(t("toast.saved"));
    }
    state.captureProjectOpen = false;
    state.activeTab = "ledger";
    state.ledgerView = "flow";
    const preservePending = Boolean(state.cloudSync.pendingMutation);
    persist({ schedule: false });
    render();
    syncTransactionMutation(cloudTransaction, cloudMode, { preservePending });
  } catch (err) {
    toast(t("toast.saveFailed", { message: err.message }));
  }
});

document.addEventListener("input", (event) => {
  const profileField = event.target?.dataset?.profileField;
  if (profileField) {
    state.profile.draft = {
      ...state.profile.draft,
      [profileField]: event.target.value,
    };
    return;
  }

  const key = event.target?.dataset?.filter;
  if (!key) {
    const form = event.target?.closest?.("form");
    if (form?.id === "starting-assets-form") syncStartingAssetsDisplay(form);
    syncCaptureDraftFromForm(event.target?.closest?.("#transaction-form"));
    return;
  }
  state.filters[key] = event.target.value;
  render();
});

document.addEventListener("change", (event) => {
  if (event.target.id === "csv-import") {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const imported = importTransactionsCsv(String(reader.result || ""));
        state.transactions = [...imported, ...state.transactions];
        persist();
        render();
        toast(t("toast.imported", { count: imported.length }));
      } catch (err) {
        toast(t("toast.importFailed", { message: err.message }));
      }
    };
    reader.readAsText(file);
    return;
  }

  syncCaptureDraftFromForm(event.target?.closest?.("#transaction-form"));
});

document.addEventListener("click", (event) => {
  const node = event.target.closest("[data-action]");
  if (!node) {
    if (!event.target.closest("[data-choice]")) closeChoiceMenus();
    if (!event.target.closest("[data-ledger-period-control]")) closeLedgerPeriodMenu({ rerender: true });
    if (!event.target.closest(".action-row.action-open")) closeActionRows();
    return;
  }
  const action = node.dataset.action;
  if (!node.closest("[data-ledger-period-control]")) closeLedgerPeriodMenu();

  if (action === "toggle-choice") {
    toggleChoiceMenu(node.closest("[data-choice]"));
  }
  if (action === "choose-option") {
    chooseOption(node);
  }
  if (action === "choose-profile-option") {
    const choice = node.closest("[data-choice]");
    const value = node.dataset.choiceValue || "";
    state.profile.draft = {
      ...state.profile.draft,
      gender: value,
    };
    const input = choice?.querySelector("input[type=\"hidden\"]");
    if (input) input.value = value;
    choice?.querySelector(".choice-trigger span:first-child")?.replaceChildren(document.createTextNode(node.textContent.trim()));
    choice?.querySelectorAll(".choice-option").forEach((option) => {
      option.classList.toggle("active", option === node);
    });
    closeChoiceMenus();
  }
  if (action === "pick-field") {
    pickFormField(node);
  }
  if (action === "pick-subcategory") {
    pickCaptureSubcategory(node);
  }
  if (action === "amount-key") {
    applyAmountKey(node);
  }
  if (action === "toggle-project-fields") {
    const form = node.closest("#transaction-form");
    syncCaptureDraftFromForm(form);
    state.captureProjectOpen = !state.captureProjectOpen;
    render();
  }
  if (action === "activate-budget-keypad") {
    syncBudgetDraftFromForm(node.closest("form"));
    state.budgetKeypadCategory = state.budgetKeypadCategory === node.dataset.category
      ? ""
      : node.dataset.category || "";
    render();
  }
  if (action === "tab") {
    const nextTab = node.dataset.tab || "ledger";
    const now = event.timeStamp || performance.now();
    const doubleTap = state.activeTab === nextTab
      && lastTabTap.tab === nextTab
      && now - lastTabTap.at < 320;
    lastTabTap = { tab: nextTab, at: now };
    if (doubleTap) {
      if (nextTab === "ledger") {
        refreshLedgerFromTab();
      } else {
        scrollTabStageToTop();
      }
      return;
    }
    state.activeTab = nextTab;
    if (state.activeTab !== "capture") state.captureProjectOpen = false;
    if (state.activeTab === "settings") state.settingsContent = "home";
    render();
    if (["ledger", "assets", "settings"].includes(state.activeTab)) scheduleForegroundCloudSync();
  }
  if (action === "open-capture") {
    state.editingTransactionId = null;
    state.captureProjectOpen = false;
    state.activeTab = "capture";
    render();
  }
  if (action === "open-ledger") {
    state.activeTab = "ledger";
    state.ledgerView = "flow";
    render();
    scheduleForegroundCloudSync();
  }
  if (action === "open-ledger-search") {
    state.activeTab = "ledger";
    state.ledgerView = "flow";
    state.searchOpen = true;
    render();
    requestAnimationFrame(() => document.querySelector("[data-filter=\"query\"]")?.focus());
  }
  if (action === "toggle-ledger-search") {
    const nextOpen = !state.searchOpen;
    state.searchOpen = nextOpen;
    if (!nextOpen) state.filters.query = "";
    render();
    if (nextOpen) requestAnimationFrame(() => document.querySelector("[data-filter=\"query\"]")?.focus());
  }
  if (action === "open-budgets") {
    state.activeTab = "assets";
    render();
    scheduleForegroundCloudSync();
  }
  if (action === "ledger-view") {
    const view = node.dataset.view;
    if (!LEDGER_VIEWS.some((item) => item.id === view)) return;
    state.ledgerView = view;
    render();
  }
  if (action === "ledger-period-segment") {
    handleLedgerPeriodSegment(node, event);
  }
  if (action === "ledger-period-option") {
    handleLedgerPeriodOption(node);
  }
  if (action === "settings-content") {
    const content = node.dataset.content || "home";
    if (!["home", "manual", "budgets", "profile"].includes(content)) return;
    if (content === "profile") {
      openProfileSettings();
      return;
    }
    state.settingsContent = content;
    render();
  }
  if (action === "open-login") {
    openAuthDialog("signin");
  }
  if (action === "close-login") {
    closeAuthDialog();
  }
  if (action === "auth-mode-reset") {
    openAuthDialog("reset");
  }
  if (action === "auth-mode-signin") {
    openAuthDialog("signin");
  }
  if (action === "toggle-auth-panel") {
    state.auth.accountOpen = !state.auth.accountOpen;
    render();
  }
  if (action === "open-reset-password") {
    openAuthDialog("reset");
  }
  if (action === "sign-out") {
    handleAuthSignOut();
  }
  if (action === "reset-budgets") {
    state.budgets = { ...DEFAULT_BUDGETS };
    state.budgetKeypadCategory = "";
    state.budgetDraft = null;
    state.preferences.updatedAt = new Date().toISOString();
    persist();
    render();
    toast(t("settings.budgetResetDone"));
  }
  if (action === "cancel-edit") {
    state.editingTransactionId = null;
    state.captureProjectOpen = false;
    render();
  }
  if (action === "edit") {
    state.captureDraft = null;
    state.captureProjectOpen = false;
    state.editingTransactionId = node.dataset.id;
    state.activeTab = "capture";
    render();
    document.querySelector("#transaction-form")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }
  if (action === "delete") {
    if (!confirm(t("confirm.delete"))) return;
    const deletedId = node.dataset.id;
    state.transactions = state.transactions.filter((txn) => txn.id !== deletedId);
    state.preferences.deletedTransactionIds = uniqueItems([
      ...(state.preferences.deletedTransactionIds || []),
      deletedId,
    ]);
    const preservePending = Boolean(state.cloudSync.pendingMutation);
    persist({ schedule: false });
    syncTransactionDelete(deletedId, { preservePending });
    render();
    toast(t("toast.deleted"));
  }
  if (action === "export-csv") {
    download("viatica-transactions.csv", exportTransactionsCsv(state.transactions), "text/csv;charset=utf-8");
  }
  if (action === "import-csv") {
    document.querySelector("#csv-import")?.click();
  }
  if (action === "export-json") {
    download("viatica-backup.json", exportState({
      transactions: state.transactions,
      budgets: state.budgets,
      accounts: [],
      preferences: state.preferences,
    }));
  }
  if (action === "clear-cache-reload") {
    clearPwaCacheAndReload();
  }
  if (action === "check-update") {
    checkForAppUpdate({ automatic: false });
  }
  if (action === "toggle-update-notes") {
    state.update.showNotes = !state.update.showNotes;
    render();
  }
  if (action === "install-update") {
    downloadAndInstallUpdate(state.update.release?.apkUrl || "");
  }
  if (action === "toggle-locale") {
    state.preferences.locale = state.preferences.locale === "en" ? "zh" : "en";
    persist();
    render();
  }
  if (action === "set-locale") {
    const locale = node.dataset.locale;
    if (!LOCALES.some((item) => item.id === locale)) return;
    state.preferences.locale = locale;
    persist();
    render();
  }
});

if ("serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", () => {
    if (isNativeApp()) {
      navigator.serviceWorker.getRegistrations()
        .then((registrations) => Promise.all(registrations.map((registration) => registration.unregister())))
        .catch(() => {});
      return;
    }
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  });
}

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && state.auth.user) {
    if (state.settingsContent !== "profile") void loadSharedProfile({ silent: true });
    scheduleForegroundCloudSync();
  }
});

window.addEventListener("focus", () => {
  scheduleForegroundCloudSync();
});

render();
initCloudAuth();
