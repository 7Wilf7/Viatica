# Viatica

Viatica is the standalone local-first ledger app in Wilf's Aevum product
family. It lives as its own installable PWA, Android APK, and GitHub repository,
not as a subfolder inside Aevum or Ultreia.

Production PWA: <https://viatica.cash>

## Product Family

- **Aevum**: global launcher, cross-product policy, derived-memory lifecycle,
  exception handling, and future Agent routing.
- **Ultreia**: endurance training, races, recovery, weather context, AI Coach,
  and training-specific Agent actions.
- **Viatica**: private ledger, transaction capture, budgets, imports, exports,
  backup, sync, and APK/PWA distribution.
- **Sidera**: capture/reflection, learning, deep research, knowledge graph,
  review state, and Sidera Agent proposals.

Viatica's private ledger remains inside Viatica. Cross-product use must go
through Aevum Query, Report, or Action contracts under standing policy; raw
ledger rows are not shared.

## Current Scope

- Fast mobile transaction capture with row-inline subcategories and built-in
  date/time wheels.
- Bottom-tab app shell: Ledger, Calendar, Add, Assets, Settings.
- Ledger Flow / Charts, period filters, compact metrics, search, editing, and
  deletion.
- Calendar month navigation, day details, date backfill, recurring reminders,
  deterministic review, and an inline managed project catalog.
- Add selects existing projects from that catalog instead of accepting free-text
  project names.
- Recent transaction templates, repeat-entry drafts, and visible local
  bookkeeping memory.
- Monthly recurring items shown as overdue or next-30-day reminders that
  require manual confirmation before they become ledger transactions.
- Category statistics and editable category budgets.
- One starting-assets value plus ledger income/expense flow.
- Local browser persistence under `viatica:v1`.
- Aevum-account cloud sync through shared Supabase `viatica_*` tables.
- CSV import/export and JSON backup as maintenance capabilities.
- Dedicated Aevum Demo account seeded from `src/core/demoData.js`.

## Commands

```bash
npm install
npm run dev
npm run test
npm run lint
npm run build
VIATICA_DEMO_PASSWORD=... npm run seed:demo
VIATICA_ENV_FILE=/path/to/.env.local VIATICA_DEMO_PASSWORD=... npm run seed:demo
npm run android:sync
npm run apk:debug
```

`apk:debug` builds the Capacitor Android debug APK after syncing the latest Vite
bundle. It requires a local JDK and Android SDK.

## Documentation Map

- `AGENTS.md`: project rules for Codex and other agents.
- `PRODUCT.md`: product purpose, boundaries, sync principles, and current
  milestone.
- `DESIGN.md`: family design language and Viatica-specific ledger UI rules.
- `docs/finance-loop.md`: calendar, templates, recurring reminders, review
  signals, and their storage boundary.
- `docs/pwa-recovery.md`: stale-shell recovery assets, cache behavior, and live
  verification steps.
- `docs/android-release.md`: APK versioning, signing, tag, and release runbook.
- `src/core/*.test.js`: core ledger and sync behavior coverage.
- `scripts/seed-demo-account.mjs`: Demo account seed helper.

## Data Model

Viatica keeps a local cache under `viatica:v1`. Signed-in ledgers use
account-specific localStorage keys shaped as `viatica:v1:user:<Aevum user id>`
and sync with the shared Aevum Supabase project using `viatica_*` tables. First
sync is merge-first rather than overwrite-first, and mutations save locally
before background cloud writes.

Transaction deletion is represented by a synced `deleted_at` tombstone on
`viatica_transactions`. Devices merge active rows and tombstones by the latest
transaction timestamp, so an offline device cannot restore a row deleted on
another device. Legacy databases without `deleted_at` temporarily fall back to
physical deletion until the reviewed migration is applied.

`preferences.merchantRules` and `preferences.recurringTransactions` remain in
the active device cache for offline use and sync as account-scoped JSON items
through `viatica_preference_items`, including deletion tombstones. The managed
project catalog syncs through `viatica_projects`, including empty projects and
deletion tombstones; project names attached to transactions remain part of
normal transaction sync. Confirmed recurring occurrences are ordinary cloud
transactions in addition to the synced reminder rule.

## Android APK Release Flow

Viatica follows Ultreia's release shape:

1. Bump `package.json` `version`.
2. Commit the version bump and release changes.
3. Push a tag such as `v0.2.11`.
4. `.github/workflows/release.yml` builds, signs, and uploads the APK to GitHub
   Releases.

Before pushing an APK tag, run `npm run test`, `npm run lint`, `npm run build`,
and, when the Android toolchain is available,
`cd android && .\gradlew.bat :app:processReleaseMainManifest --no-daemon`.

Required GitHub Secrets match Ultreia's naming: `ANDROID_KEYSTORE_BASE64`,
`ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`,
`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, and optional
`SUPABASE_SERVICE_ROLE_KEY`.

## Deployment

After verified project changes, commit and push to `main`, then deploy the
latest `main` branch to Vercel production when the project rules require it:

```bash
npx vercel --prod
```

GitHub: `https://github.com/7Wilf7/Viatica`

APK package id: `app.aevum.viatica`
