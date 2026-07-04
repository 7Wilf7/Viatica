# Viatica

Viatica is the standalone local-first ledger app in Wilf's Aevum / Ultreia
family of personal tools. It is meant to live as its own installable PWA and
GitHub repository, not as a subfolder inside Aevum or Ultreia.

## Product Family

- Viatica owns private ledger data, transaction capture, budgets, and local
  backups.
- Aevum receives only overview snapshots and reviewed cross-product events.
- Ultreia is the main reference for family-level mobile product patterns,
  especially settings, guide/changelog structure, and restrained dark UI.

## Scope

- Fast mobile transaction capture.
- Bottom-tab app shell for Ledger, Calendar, Add, Assets, and Settings.
- Ledger uses a top Flow / Charts switch. Charts is the statistics view.
- Category statistics summarize actual spending. Category budgets compare
  spending against editable monthly targets in Settings.
- Settings uses compact list rows; Manual, Changelog, and Category budgets open
  as second-level pages.
- Books, legacy account compatibility, starting assets, categories, and editable
  category budgets.
- Local browser persistence under `viatica:v1`, with Aevum-account cloud sync
  when signed in.
- CSV import/export and JSON backup remain maintenance capabilities, but they
  are no longer foregrounded on the Settings home.
- Aevum overview snapshot export for later read-only integration.

## Product Decision Rule

Wilf has not used a dedicated ledger app for a while. New Viatica feature
requests should be judged against strong mobile accounting apps such as iCost,
then adapted to Wilf's personal workflow instead of copied as generic finance
software.

## Data Model

Viatica keeps an offline/device cache in `localStorage` under `viatica:v1`.
When the user signs in with the shared Aevum account, the app syncs that local
cache with the Aevum Supabase tables using the `viatica_*` prefix.

The first sync is merge-first rather than overwrite-first: Viatica reads cloud
transactions, budgets, and accounts, merges them with the current device, keeps
the newest `updatedAt` when transaction ids match, saves the merged state back
to `viatica:v1`, and upserts the merged state to Supabase. This protects an
empty PWA from wiping an APK that already has data.

The local state includes transactions, category budgets, preferences, and legacy
account records for compatibility. The current UI treats accounts as hidden
internals: Assets shows one starting-assets value plus ledger income/expense
flow, and transaction rows do not show account names.

## Temporary Demo Data

Temporary demo data is currently enabled for pre-launch review. The seed lives
in `src/core/demoData.js` behind `VIATICA_DEMO_DATA_ENABLED = true`.

- It appears automatically for a fresh empty install and can also be selected
  from Settings to hide personal data during demos.
- It includes sample transactions, starting assets, and category budgets so
  Ledger, Calendar, Charts, Assets, and budget progress can be reviewed without
  manual entry.
- Runtime Demo dates shift into the current month so the default monthly review
  does not look empty when the calendar moves past the original seed month.
- While demo mode is active, `persist()` does not write the demo transactions,
  demo budgets, or demo accounts into `viatica:v1`.
- Explicit data-saving actions such as saving a transaction, importing CSV,
  editing budgets, or editing accounts exit demo mode and start real local
  state.
- Remove it later by setting `VIATICA_DEMO_DATA_ENABLED = false` or deleting the
  demo file and its import path.

## Commands

```bash
npm install
npm run dev
npm run test
npm run lint
npm run build
npm run android:sync
npm run apk:debug
```

`apk:debug` builds the Capacitor Android debug APK after syncing the latest Vite
bundle. It requires a local JDK and Android SDK, just like Ultreia's Android
build.

## Android APK Release Flow

Viatica follows the same release shape as Ultreia:

1. Bump `package.json` `version` to the APK version.
2. Commit the version bump and any release changes.
3. Push a tag such as `v0.1.1`.
4. `.github/workflows/release.yml` builds with Node 22, JDK 21, and Android SDK,
   syncs Capacitor, signs the release APK from GitHub Secrets, creates a GitHub
   Release, and uploads `viatica-vX.Y.Z.apk`.
5. The workflow also tries to mirror the latest APK to the public Supabase
   Storage object `releases/viatica-latest.apk` for a faster China download
   path. The app falls back to the GitHub Release asset if the mirror is absent.

The in-app Settings update checker reads the local version from `package.json`
via Vite's `__APP_VERSION__` define, checks
`https://api.github.com/repos/7Wilf7/Viatica/releases/latest`, and in the
Android APK uses the native `ApkDownloader` / `ApkInstaller` bridge to download
and open the system installer. In Web/PWA mode it opens the APK asset link.

Release shorthand and versioning also follow Ultreia:

- `git tag v0.1.1 && git push origin v0.1.1` triggers the APK release.
- Wilf saying "推 APK" means validate, bump if needed, commit, push the `v*`
  tag, and let GitHub Actions create the signed APK.
- Wilf saying a shorthand such as "推 0111" means `0.11.1`; `0110` means
  `0.11.0`. If the number is ambiguous, confirm before tagging.
- Before pushing an APK tag, run `npm run test`, `npm run lint`,
  `npm run build`, and, when the local Android toolchain is available,
  `cd android && .\gradlew.bat :app:processReleaseMainManifest --no-daemon`.
- Pre-1.0 versions only advance by release content: PATCH for fixes/style/copy
  polish, MINOR for user-visible feature batches, and no skipped numbers by
  feel.
- Viatica's GitHub repo should stay public like Ultreia so Releases and APK
  downloads work without a private-repo login barrier.

Required GitHub Secrets match Ultreia's naming:

| Secret | Purpose |
|---|---|
| `ANDROID_KEYSTORE_BASE64` | Base64-encoded release keystore |
| `ANDROID_KEYSTORE_PASSWORD` | Keystore password |
| `ANDROID_KEY_ALIAS` | Release key alias |
| `ANDROID_KEY_PASSWORD` | Release key password |
| `VITE_SUPABASE_URL` | Build-time public Supabase URL; also used for APK mirror |
| `VITE_SUPABASE_ANON_KEY` | Build-time public Supabase anon/publishable key |
| `SUPABASE_SERVICE_ROLE_KEY` | Optional mirror upload to Supabase Storage |

## Deployment

Production PWA:

- `https://viatica.cash`

After any verified project change, commit and push to `main`, then deploy the
latest `main` branch to Vercel production immediately. Use:

```bash
npx vercel --prod
```

If Vercel CLI auth or project linking is missing, stop and report that blocker
instead of changing credentials or production settings.

GitHub:

- `https://github.com/7Wilf7/Viatica`

APK packaging uses Capacitor with Android package id `app.aevum.viatica`.
