# Design

## System
Viatica belongs to the same product family as Aevum, Ultreia, and Sidera. It
shares the family's Linear-inspired product language: dark surfaces, precise
thin lines, subtle ambient light, restrained blur, and short stateful motion.
The accent shifts from Aevum's neutral system glow to a restrained muted
ledger-brass accent on a neutral dark graphite base.

When a design task asks to reference Ultreia, first resolve the current local
repo paths through Aevum's ecosystem docs:
`C:\Users\wilf7\dev\Aevum\docs\ecosystem\REPO_PATHS.md` on Windows or
`/Users/danxiao/Projects/Aevum/docs/ecosystem/REPO_PATHS.md` on macOS. Use the
current Ultreia app as the source of truth for family-level mobile patterns.
Adapt those patterns to Viatica's ledger workflow instead of copying unrelated
training features.

The current UI target is a mobile app shell, not a one-page dashboard. Primary
navigation is a persistent bottom tab bar:

- Ledger
- Calendar
- Add
- Assets
- Settings

This order follows the mobile accounting pattern Wilf wants from iCost:
review records first, inspect dates second, put capture in the center plus
action, keep assets separate from statistics, and reserve settings for local
data operations and product notes.

iCost is a product reference for information density, list hierarchy, calendar
grid clarity, and friendly category icon language. Do not copy its light skin
or assets. Viatica should translate those lessons into its own dark, restrained
ledger tool: fewer heavy borders and glows, clear category glyphs, compact
transaction rows, and data-first cards that feel useful rather than decorative.

Family roles stay distinct: Aevum is the neutral system layer, Ultreia is the
deep moss / olive training layer, Viatica is the muted brass ledger layer, and
Sidera is the cold star-blue / muted violet knowledge layer. Shared design does
not grant shared access to private ledger data.

## Colors
- Background: neutral dark graphite around `oklch(0.112 0.006 95)`.
- Panel: translucent graphite around `oklch(0.175 0.008 95 / 0.86)`.
- Ink: `oklch(0.965 0.004 95)`.
- Muted ink: `oklch(0.765 0.010 95)`.
- Line: fine translucent graphite around `oklch(0.400 0.014 95 / 0.46)`.
- Accent: restrained muted ledger brass for primary actions, active/focus
  states, budget fills, progress, the center Add tab, and the Viatica mark. Use
  it in small areas only; avoid bright yellow, coin gold, delivery-app yellow,
  neon, wealth-management gold, or gamified-finance styling.
- Ambient light and panel gradients should stay graphite-first. Brass glow is a
  small state cue, not the page atmosphere.

## Typography
- Font stack: `Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`.
- Fixed product type scale. Do not use viewport-scaled text.
- Use tabular-feeling hierarchy through weight and spacing, not decorative fonts.

## Components
- Add opens the capture form and is the primary action surface in the center of
  the bottom tab bar. The center tab shows a large plus only; the other four
  tabs use the same restrained monoline SVG icon style as Ultreia.
- Capture uses a tap-first accounting flow inspired by iCost's interaction
  clarity, not its light visual skin: expense / income fills the full switch,
  expense and income use different category sets, category buttons reveal detail
  chips, and a built-in amount keypad keeps the system keyboard out of the main
  path. A compact date control supports backfill, and recent templates or a
  repeated transaction may prefill a draft without saving it automatically.
  Frequent templates stay in one compact row, filter to the active expense or
  income type, rank by use count with recency as the tie-breaker, and share the
  middle scroll region with categories. Notes are part of a template's pattern
  so otherwise similar entries with different fixed notes stay separate.
  Expense detail chips expand directly below the four-category row containing
  their parent, so the relationship stays visible; tapping the same parent again
  collapses that detail group. Income categories can be saved without a detail
  chip when the detail would only repeat the category. Date and time-period
  selection use Viatica's built-in five-row scroll-snap wheels rather than native
  system pickers, and their open state survives background sync renders. The
  compact date trigger, time-period trigger, and note field share one row. On
  mobile, the amount readout and keypad stay pinned at the bottom of the Add
  surface while the category/detail area scrolls independently, so long detail
  rows do not push the keypad away. Do not show account chips in the primary Add
  flow unless account switching becomes a real high-frequency need again.
- The official Viatica logo source lives at `resources/brand/viatica-logo.png`.
  The splash renders that exact desktop source from its first frame, including
  the double-line border, with no redraw, fade, scale, blur, sheen, or assembly.
  Its splash-specific PNG changes only the area outside that border to
  transparency; every visible source pixel inside the frame remains unchanged.
  Other in-app surfaces use the resized display copy through
  `src/assets/logo.js`; PWA launcher icons in `public/icons/` are generated
  copies of the same mark.
- Brand exposure should stay product-native: the script-style Viatica wordmark
  reveals left to right at a constant linear speed while the Logo remains
  static, and Settings keeps a compact Aevum account header. Do not turn the app
  into a landing page.
- Viatica owns a small custom monoline glyph set for bottom navigation,
  categories, accounts, and row actions. Category icons may use subtle
  differentiated colors, but they should stay soft and tool-like, not childish
  or promotional. The category pictogram assets come from Thiings.co; keep this
  attribution in project documentation rather than showing a Settings-home
  credit row.
- Ledger owns filtering, editing, deletion, and the top Flow / Charts switch.
  Ledger and Calendar retain their independent scroll positions across
  background sync and local view renders. Editing a ledger row stores a row
  anchor so Save or Cancel returns to the same row instead of the top.
  Long-press actions expand inline below the selected transaction so Repeat,
  Edit, Recurring, and Delete remain visible without horizontal scrolling; the
  open row stays open across background refreshes until an action or outside tap
  closes it.
  Charts means statistics. Its top structure follows Ultreia's Training home
  rhythm, adapted to accounting: type filter on the left, Flow / Charts switch
  on the right, a four-part period switch below, then three compact metric cells
  for expense, income, and record count. The type filter affects both Flow and
  Charts; the period switch affects the overview, Flow rows, and Charts
  statistics. Search stays collapsed behind a magnifier, and the visible filter
  row should stay minimal.
- Ledger must not show an All Books selector or visible book filter unless the
  product intentionally reintroduces multi-book workflow.
- Calendar owns month navigation and four focused secondary views: Month
  Summary, Pending Recurring, Review, and Projects. Tapping a day opens its
  entries and a date-bound backfill action. Recurring reminders require Confirm,
  Skip, or Modify This Time; Review is read-only and calculated locally. Its
  mobile month block follows Ultreia's current Calendar pattern: previous month,
  centered month title, next month, and Today sit in one compact navigation row;
  weekday labels and the 6×7 grid form one graphite block that stays fixed at the
  top of Calendar's own scroll area. Viatica replaces Ultreia moss with restrained
  ledger brass. Calendar day numbers sit at the top center of each cell so daily
  income/expense values stay scannable.
- Charts under Ledger stay focused on category statistics and trends. Project
  totals and their related entries live together under Calendar → Projects and
  should not be duplicated in Charts. Category statistics are actual spending
  summaries and must not display budget targets.
- Assets owns total assets, the hidden starting-assets value, legacy account
  compatibility, and category budgets. The default Assets screen should lead
  with total assets and category budgets, not a visible account-balance list.
  Assets Overview uses one single panel instead of a nested card. Starting-assets
  editing stays behind a long-press on the Assets Overview row and should expose
  only the amount, a built-in numeric keypad, and a right-side Confirm action,
  keeping account internals out of the primary UI. Category budgets compare
  actual spending with monthly targets and use a compact two-column mobile grid;
  the category, budget amount, and percent should share the row to reduce
  vertical scrolling. Budget amount editing should also avoid system numeric
  keyboards by using Viatica's built-in keypad.
- Settings uses the Ultreia-style compact mobile list. The top identity block
  follows Ultreia's mobile account header pattern, but the copy says Aevum
  account because the identity is shared across all four Aevum products. The
  manual and changelog are combined into one guide page so usage notes and
  product iteration history live together. Long content such as the guide and
  category budget editor opens as a second-level page, not inline on the
  Settings home.
- Visible date, time, and option selection controls use Viatica-owned buttons,
  menus, or wheels. Do not expose browser/OS date pickers or native select menus
  in the product UI; profile birth date and bookkeeping-memory category editing
  follow the same internal-control rule as Add.
- Settings includes an Ultreia-style app update row: show the installed version,
  check GitHub Releases, expand recent release notes when current, and expose a
  compact update/download action when a newer APK exists. Native APK builds use
  Android's system DownloadManager and installer; Web/PWA builds keep the
  separate cache-clear action for stale deployed assets.
- The login screen follows Ultreia's auth composition: centered product logo,
  small 中 / EN language pill, restrained email/password form, and compact
  secondary actions. Viatica must not store saved passwords in localStorage.
- Product demos use a dedicated Aevum Demo account, not an in-app Personal /
  Demo data mode switch. Settings should never present Demo as a second local
  data model; it should only expose the active Aevum account state.
- Settings owns Aevum account entry, shared profile fields, the guide/changelog,
  editable budgets, local bookkeeping memory, recurring-rule management, app
  updates, and PWA/storage notes. Routine cloud sync
  should feel quiet and automatic: background retries should not show toast
  popups, while explicit manual sync can still use a compact top status. Do not
  foreground CSV import, CSV export, or JSON backup on the Settings home while
  the product direction is Aevum account sync; keep backup-style actions as
  maintenance capabilities unless Wilf asks to surface them again.
- Budget rows and transaction rows use dense panels, not oversized cards.
  Transaction rows prioritize category icon, title, time/type context, and
  amount; account names stay hidden unless account switching is reintroduced.
  Edit/delete actions stay hidden until long press.
- Buttons and form controls follow one shape vocabulary with visible focus.
- Empty states tell Wilf the next practical action.

## Motion
Use 150-220ms transitions for hover, focus, active, save feedback, and row
interactions. Ambient light may move slowly in the background. Respect
`prefers-reduced-motion`.
