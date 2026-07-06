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
  Ledger account selection stays out of the primary path; Viatica keeps a
  hidden default account only for old data compatibility and total-assets math.
  Title falls back to the chosen detail/category and notes stay optional. Expense detail
  chips sit below the full primary-category grid so the category layout remains
  stable; income categories such as gifts, refunds, and other income can be
  saved from the primary category alone, with specifics written in notes. Book
  selection stays out of the primary UI for now.
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
- Assets does not foreground a user-facing account workflow. The default
  surface is one Assets Overview row with the total amount in a single panel;
  long-pressing that row reveals a compact starting-assets editor with a
  built-in keypad and a Confirm action. Internally, total assets can still use
  the legacy account/opening-balance field for compatibility, but the UI should
  read as "starting assets plus ledger income/expense flow."
- Settings should stay compact on mobile. The top identity header uses the
  shared Aevum account pattern from Ultreia, while manual/changelog and budget
  editing open as second-level pages.
- Requirement review first: before building new product requests, compare the
  idea with strong mobile accounting apps such as iCost, then adapt it to
  Wilf's personal needs instead of copying generic finance-app complexity.
- Learn from iCost's clarity: compact ledgers, readable calendar cells,
  category-first rows, and friendly icon grouping. Keep Viatica dark, local,
  restrained, and purpose-built instead of copying iCost's light visual skin.
- Local-first cache plus cloud sync: `viatica:v1` remains the offline/device
  cache, and the shared Aevum Supabase project stores signed-in ledger data in
  `viatica_accounts`, `viatica_budgets`, `viatica_preferences`, and
  `viatica_transactions`. On sign-in, Viatica merges device data with cloud
  data instead of replacing either side. The APK, mobile PWA, and desktop PWA
  should converge through the Aevum account.
- Data must remain portable, but CSV import/export and full JSON backup are
  maintenance capabilities rather than default Settings-home actions while the
  product moves toward Aevum account sync.
- Aevum integration is summary-based: private notes stay inside Viatica unless a
  reviewed event explicitly shares them.
- Ultreia alignment is product-language alignment: reuse relevant mobile
  patterns and settings conventions, but keep Viatica's ledger workflow and data
  boundary independent.
- Account naming is shared across products: say Aevum account, not Viatica
  account. Deleting an account means deleting the whole Aevum account and all
  product data; a future single-product reset must be named separately.
- Serious product UI: dense, scannable, and quiet, with a neutral dark graphite
  base and restrained muted ledger-brass accent.
- Brand presence is functional and restrained: the official Viatica logo appears
  in the PWA icon, a short boot splash, and the Settings brand header.
- Android distribution follows Ultreia's model: signed APK releases are built
  from semver Git tags by GitHub Actions, published to GitHub Releases, mirrored
  to Supabase Storage when available, and checked from the in-app Settings
  update row. Release shorthand, local validation, and pre-1.0 versioning rules
  should stay aligned with Ultreia. The Web/PWA cache refresh remains a
  separate Web-only maintenance action.

## Current Milestone
The active milestone is to make the PWA ready for real daily accounting by
2026-07-01. The priority is not AI features yet; it is speed, clarity, account
setup, backup, and confidence in the transaction workflow.

## Demo Account
Viatica does not expose an in-app Personal / Demo data mode. Product demos use a
dedicated Aevum account in Supabase, seeded from `src/core/demoData.js`, so Wilf
can show the app through the same login and cloud-sync path used by real data.
The app itself should always read and write the active Aevum account or local
`viatica:v1` cache; it should not branch into a bundled local demo ledger.
When a user signs in, the PWA stores that ledger under an account-specific
localStorage key, so switching between the Demo account and Wilf's personal
account does not merge their local caches. Non-Demo accounts should also ignore
seed transaction ids beginning with `demo_txn_` during cloud sync.
If a user records transactions before the Aevum session finishes restoring,
those pending signed-out transactions must be carried into the real account
cache instead of being hidden by the account cache swap. Demo sign-in must not
consume or clear those pending real transactions. Cloud sync calls must also
verify that the Supabase user still matches the user that started the sync.
