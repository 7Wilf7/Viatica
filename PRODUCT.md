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
- Fast capture first: new entries should be mostly tap-driven. Pick expense /
  income, then use type-specific category/detail buttons and the built-in
  amount keypad. On mobile, only the upper category/detail area should scroll;
  the amount and keypad area stays anchored so capture remains predictable.
  Account stays on the default payment account in the primary path; title falls
  back to the chosen detail/category and notes stay optional. Book selection
  stays out of the primary UI for now.
- App shell first: mobile navigation uses five bottom tabs in this order:
  Ledger, Calendar, Add, Assets, and Settings. Add is the centered plus action.
- Ledger first, not dashboard first: Ledger owns the top type filter and Flow /
  Charts switch. Charts means statistics. The top structure should mirror
  Ultreia's Training home pattern in ledger form: type filter, Flow / Charts,
  period switch for All Time / This Week / This Month / This Year, then compact
  period metrics for expense, income, and record count. The type filter affects
  both Flow and Charts; the period switch affects the overview, list, and chart
  statistics. Search is collapsed behind a magnifier. Do not place an All Books
  selector or visible book/account filter in Ledger until a real need appears.
- Category statistics and category budgets are different concepts. Statistics
  summarize actual spending by category. Budgets compare actual spending against
  editable monthly category targets saved locally.
- Assets owns local account setup, but it should not foreground account balance
  rows by default. The default surface is one Assets Overview row with the total
  amount; long-pressing that row reveals account/opening-balance editing. Total
  assets equals opening balances plus ledger income/expense flow.
- Settings should stay compact on mobile. The manual and changelog live together
  in one second-level guide page following Ultreia's settings pattern. Budget
  editing also opens as a second-level page.
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

## Personal / Demo Data Mode
Viatica supports a one-tap Personal / Demo mode switch for safe product demos.
Personal mode reads and writes the local `viatica:v1` ledger. Demo mode displays
bundled sample transactions, budgets, and accounts from `src/core/demoData.js`
without overwriting real local data, so Wilf can show the app without exposing
personal assets or spending. In Demo mode, add/edit/delete/import/export-style
real-data actions should be blocked with a reminder to switch back to Personal
mode first.
