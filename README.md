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
- Bottom-tab app shell for Today, Capture, Ledger, Budgets, and Settings.
- Books, accounts, categories, budgets, reimbursable records, receipt attachment.
- Local browser persistence under `viatica:v1`.
- CSV import/export for portability.
- Aevum overview snapshot export for later read-only integration.

## Data Model

Viatica currently stores data only on the device in the browser's `localStorage`
under `viatica:v1`. It does not upload transactions to Supabase or any other
database.

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

GitHub:

- `https://github.com/7Wilf7/Viatica`

APK packaging comes after the PWA workflow is confirmed.
