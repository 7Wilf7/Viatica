# Product

## Register

product

## Users

Wilf uses Viatica on mobile first to record daily expenses quickly and
reliably. The current priority is reliable daily use, cross-device sync
confidence, fast capture, and a calm path back into bookkeeping without a
complex setup ritual.

## Product Purpose

Viatica is the standalone personal ledger in the Aevum product family. It owns
transaction capture, editing, import/export, budgets, categories, legacy account
compatibility, starting assets, local bookkeeping memory, recurring reminders,
deterministic financial review, local ledger records, cloud sync, and APK/PWA
distribution. Aevum should receive only overview snapshots and reviewed events
from Viatica.

## Product Boundary

- Viatica owns private ledger data, transaction rows, budgets, category
  statistics, starting assets, local backups, and ledger sync.
- Aevum owns global entry points, reviewed events, memory inbox, permissions,
  and future cross-domain Agent routing.
- Ultreia owns training. Sidera owns learning, capture/reflection, and
  knowledge graph.
- Viatica may emit reviewed financial events, such as training gear purchases,
  but other products must not read or edit Viatica's private ledger directly.

## Brand Personality

Precise, calm, practical. It should feel like a durable ledger tool rather than
a gamified finance app.

## Family Alignment

Viatica shares the Aevum family language: mobile-first app shell, dark graphite
base, precise controls, restrained glow, short logo-led splash, Aevum account
identity, and Ultreia-inspired settings/update discipline. Its own accent is
muted ledger brass used sparingly for primary actions, progress, active states,
and the Viatica mark.

## Design Principles

- Fast capture first: expense/income, category, optional detail, amount keypad,
  save.
- The main navigation remains Ledger, Calendar, Add, Assets, and Settings, with
  Add as the centered plus action.
- Ledger owns Flow / Charts, period switching, compact metrics, search, editing,
  and deletion.
- Calendar owns month navigation, day details, date backfill, upcoming recurring
  reminders, deterministic review, and grouped project totals. Charts stays
  focused on category statistics and trends instead of duplicating those views.
- Add may reuse recent transactions as templates or repeat drafts, but it still
  requires an explicit save.
- Recurring reminders never write silently. Confirm creates a normal
  transaction; Skip only advances the next date; Modify opens a draft first.
- Category budgets are separate editable monthly targets.
- Assets uses one starting-assets value plus ledger income/expense flow, not a
  foregrounded bank-account manager.
- Settings stays compact. Manual/changelog, budgets, updates, and maintenance
  actions should open as second-level pages when they need space.
- Learn from iCost's density and clarity, but keep Viatica dark, restrained,
  local-first, and purpose-built.
- Account naming is shared across products: say Aevum account, not Viatica
  account. Deleting an account means deleting the whole Aevum account and all
  product data.

## Data And Sync Principles

- `viatica:v1` remains the signed-out/offline cache.
- Signed-in data uses the shared Aevum Supabase project and the `viatica_*`
  tables.
- First sync is merge-first, not overwrite-first. Keep the newest `updatedAt`
  when ids match and protect an empty PWA from wiping an APK with data.
- Signed-in mutations save locally first, then write and retry in the
  background.
- Bookkeeping memory and recurring rules currently remain local-only under
  `preferences.merchantRules` and `preferences.recurringTransactions`; do not
  describe them as cross-device features until a reviewed cloud schema exists.
- Transaction details stay private unless an explicit reviewed event shares a
  summary with Aevum.
- Product demos use a dedicated Aevum Demo account seeded from
  `src/core/demoData.js`, not an in-app Personal/Demo switch.

## Release Principles

Viatica follows Ultreia's release shape: Vercel for Web/PWA, Capacitor for APK,
GitHub Releases for signed Android distribution, and pre-1.0 semver discipline.
APK shorthand and versioning should stay aligned with Ultreia.

## Current Milestone

The active milestone is a reliable daily finance loop: fast capture, calendar
backfill, repeatable entries, manually confirmed recurring reminders,
deterministic review, clear recovery, and sync confidence. The next trust gap is
restore preview and conflict-safe recovery. AI features remain later work.

## Accessibility & Inclusion

Keep numbers, category labels, budgets, and sync states readable on mobile.
Support visible focus, reduced motion, and non-color-only status cues.
