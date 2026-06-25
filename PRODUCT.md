# Product

## Register

product

## Users
Wilf uses Viatica on mobile first to record daily expenses quickly and reliably.
The app must be ready for real daily accounting by 2026-07-01.
Because Wilf has not used a dedicated ledger app for a long time, the product
should help him restart bookkeeping without requiring a complex setup ritual.

## Product Purpose
Viatica is the standalone personal ledger in Wilf's Aevum / Ultreia family of
personal tools. It owns transaction capture, editing, import/export, budgets,
accounts, and local ledger records. The legacy book field may stay in local
data for compatibility, but the current product should not expose multi-book
workflow unless a real need appears. Aevum should only receive overview
snapshots and reviewed events from Viatica.

## Brand Personality
Precise, calm, practical. It should feel like a durable ledger tool rather than
a gamified finance app.

## Design Principles
- Fast capture first: amount, title, account, category, and notes stay within
  one short form. Book selection stays out of the primary UI for now.
- App shell first: mobile navigation uses five bottom tabs in this order:
  Ledger, Calendar, Add, Assets, and Settings. Add is the centered plus action.
- Ledger first, not dashboard first: Ledger owns the top Flow / Charts switch.
  Charts means statistics. Do not place an All Books selector or visible book
  filter in Ledger until multi-book use is explicitly reintroduced.
- Category statistics and category budgets are different concepts. Statistics
  summarize actual spending by category. Budgets compare actual spending against
  editable monthly category targets saved locally.
- Assets owns local account setup: accounts can be created locally, opening
  balances are editable, and account net equals opening balance plus ledger
  income/expense flow.
- Settings should stay compact on mobile. Manual, changelog, and budget editing
  open as second-level pages following Ultreia's settings pattern.
- Requirement review first: before building new product requests, compare the
  idea with strong mobile accounting apps such as iCost, then adapt it to
  Wilf's personal needs instead of copying generic finance-app complexity.
- Learn from iCost's clarity: compact ledgers, readable calendar cells,
  category-first rows, and friendly icon grouping. Keep Viatica dark, local,
  restrained, and purpose-built instead of copying iCost's light visual skin.
- Local-first by default: no backend write path until sync rules are explicit.
- Data must be portable: CSV export and full JSON backup are baseline features.
- Aevum integration is summary-based: private notes stay inside Viatica unless a
  reviewed event explicitly shares them.
- Ultreia alignment is product-language alignment: reuse relevant mobile
  patterns and settings conventions, but keep Viatica's ledger workflow and data
  boundary independent.
- Serious product UI: dense, scannable, and quiet, with a neutral dark graphite
  base and restrained muted ledger-brass accent.
- Brand presence is functional and restrained: the official Viatica logo appears
  in the PWA icon, a short boot splash, and the Settings brand header.

## Current Milestone
The active milestone is to make the PWA ready for real daily accounting by
2026-07-01. The priority is not AI features yet; it is speed, clarity, account
setup, backup, and confidence in the transaction workflow.

## Temporary Demo State
Temporary demo data is enabled before formal bookkeeping starts. It is stored in
`src/core/demoData.js` and only shown when local `viatica:v1` has no real
transactions. The demo seed is for reviewing Ledger, Calendar, Charts, Assets,
and budget behavior. Explicit data-saving actions exit demo mode and start real
local state, but the demo seed should still be removed or disabled before
Viatica becomes the source of truth for real records.
