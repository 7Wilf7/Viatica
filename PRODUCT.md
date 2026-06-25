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
books, accounts, and local receipt attachments. Aevum should only receive
overview snapshots and reviewed events from Viatica.

## Brand Personality
Precise, calm, practical. It should feel like a durable ledger tool rather than
a gamified finance app.

## Design Principles
- Fast capture first: amount, title, account, category, and book stay within one
  short form.
- App shell first: mobile navigation uses five bottom tabs in this order:
  Ledger, Calendar, Add, Assets, and Settings. Add is the centered plus action.
- Ledger first, not dashboard first: Ledger owns the top Flow / Charts switch.
  Charts means statistics. Do not place an All Books selector at the top of
  Ledger.
- Category statistics and category budgets are different concepts. Statistics
  summarize actual spending by category. Budgets compare actual spending against
  editable monthly category targets saved locally.
- Settings should stay compact on mobile. Manual, changelog, and budget editing
  open as second-level pages following Ultreia's settings pattern.
- Requirement review first: before building new product requests, compare the
  idea with strong mobile accounting apps such as iCost, then adapt it to
  Wilf's personal needs instead of copying generic finance-app complexity.
- Local-first by default: no backend write path until sync rules are explicit.
- Data must be portable: CSV export and full JSON backup are baseline features.
- Aevum integration is summary-based: private notes stay inside Viatica unless a
  reviewed event explicitly shares them.
- Ultreia alignment is product-language alignment: reuse relevant mobile
  patterns and settings conventions, but keep Viatica's ledger workflow and data
  boundary independent.
- Serious product UI: dense, scannable, and quiet, with deep blue as the
  Viatica accent.

## Current Milestone
The active milestone is to make the PWA ready for real daily accounting by
2026-07-01. The priority is not AI features yet; it is speed, clarity, backup,
and confidence in the transaction workflow.
