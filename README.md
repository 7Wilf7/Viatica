# Viatica

Viatica is the standalone local-first ledger app for Aevum's product system. It
is meant to live as its own installable PWA and GitHub repository, not as a
subfolder inside Aevum.

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

The first web/PWA deployment target is Vercel. APK packaging comes after the PWA
workflow is confirmed.
