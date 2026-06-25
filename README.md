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
- Books, accounts, account opening balances, categories, and editable category
  budgets.
- Local browser persistence under `viatica:v1`.
- CSV import/export for portability.
- Aevum overview snapshot export for later read-only integration.

## Product Decision Rule

Wilf has not used a dedicated ledger app for a while. New Viatica feature
requests should be judged against strong mobile accounting apps such as iCost,
then adapted to Wilf's personal workflow instead of copied as generic finance
software.

## Data Model

Viatica currently stores data only on the device in the browser's `localStorage`
under `viatica:v1`. It does not upload transactions to Supabase or any other
database.

The local state includes transactions, category budgets, preferences, and
account records. Account net is calculated as each account's opening balance
plus income minus expenses from ledger entries.

## Temporary Demo Data

Temporary demo data is currently enabled for pre-launch review. The seed lives
in `src/core/demoData.js` behind `VIATICA_DEMO_DATA_ENABLED = true`.

- It only appears when local `viatica:v1` has no real transactions.
- It includes sample transactions, opening balances, and category budgets so
  Ledger, Calendar, Charts, Assets, and budget progress can be reviewed without
  manual entry.
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
```

## Deployment

Production PWA:

- `https://viatica-tan.vercel.app`

After any verified project change, commit and push to `main`, then deploy the
latest `main` branch to Vercel production immediately. Use:

```bash
npx vercel --prod
```

If Vercel CLI auth or project linking is missing, stop and report that blocker
instead of changing credentials or production settings.

GitHub:

- `https://github.com/7Wilf7/Viatica`

APK packaging comes after the PWA workflow is confirmed.
