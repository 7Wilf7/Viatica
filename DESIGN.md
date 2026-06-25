# Design

## System
Viatica belongs to the same product family as Aevum and Ultreia. It shares the
family's Linear-inspired product language: dark surfaces, precise thin lines,
subtle ambient light, restrained blur, and short stateful motion. The accent
shifts from Aevum's violet-blue glow to a restrained muted ledger-brass accent
on a neutral dark graphite base.

When a design task asks to reference Ultreia, inspect
`/Users/danxiao/Projects/ultreia` first and use the current Ultreia app as the
source of truth for family-level mobile patterns. Adapt those patterns to
Viatica's ledger workflow instead of copying unrelated training features.

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
- The official Viatica logo source lives at `resources/brand/viatica-logo.png`.
  In-app brand surfaces use the resized display copy through
  `src/assets/logo.js`; PWA launcher icons in `public/icons/` are generated
  copies of the same mark.
- Brand exposure should stay product-native: a short boot splash with logo +
  script-style Viatica wordmark, and a compact Settings brand header. Do not
  turn the app into a landing page.
- Viatica owns a small custom monoline glyph set for bottom navigation,
  categories, accounts, and row actions. Category icons may use subtle
  differentiated colors, but they should stay soft and tool-like, not childish
  or promotional.
- Ledger owns filtering, editing, deletion, and a top Flow / Charts switch.
  Charts means statistics.
- Ledger must not show an All Books selector or visible book filter unless the
  product intentionally reintroduces multi-book workflow.
- Calendar owns the monthly spending calendar and a compact month summary.
  Calendar day numbers sit at the top center of each cell so the body of the
  cell can later hold daily income/expense details.
- Charts under Ledger own actual statistics only. Category statistics are
  actual spending summaries and must not display budget targets.
- Assets owns account creation, opening balances, account net, and category
  budgets. Account net is opening balance plus ledger income/expense flow.
  Category budgets compare actual spending with monthly targets.
- Settings uses the Ultreia-style compact mobile list. Long content such as the
  manual, changelog, and category budget editor opens as a second-level page,
  not inline on the Settings home.
- Settings owns local data actions, exports, imports, editable budgets, and
  PWA/storage notes.
- Budget rows and transaction rows use dense panels, not oversized cards.
  Transaction rows prioritize category icon, title, time/type context, amount,
  and account; edit/delete actions stay hidden until long press.
- Buttons and form controls follow one shape vocabulary with visible focus.
- Empty states tell Wilf the next practical action.

## Motion
Use 150-220ms transitions for hover, focus, active, save feedback, and row
interactions. Ambient light may move slowly in the background. Respect
`prefers-reduced-motion`.
