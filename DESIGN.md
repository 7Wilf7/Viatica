# Design

## System
Viatica belongs to the same product family as Aevum and Ultreia. It shares the
family's Linear-inspired product language: dark surfaces, precise thin lines,
subtle ambient light, restrained blur, and short stateful motion. The accent
shifts from Aevum's violet-blue glow to a low-saturation deep ledger blue /
steel blue.

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

## Colors
- Background: `oklch(0.115 0.014 258)`
- Panel: translucent dark blue-neutral around `oklch(0.18 0.018 258 / 0.86)`
- Ink: `oklch(0.965 0.006 258)`
- Muted ink: `oklch(0.77 0.022 258)`
- Line: fine translucent blue lines around `oklch(0.43 0.046 258 / 0.48)`
- Accent: deep ledger blue / steel blue for primary actions, active focus,
  budget fills, and the Viatica mark. Keep it cool, low-saturation, and used in
  small areas only; avoid bright blue, technology-blue, or fintech-marketing
  glow.

## Typography
- Font stack: `Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`.
- Fixed product type scale. Do not use viewport-scaled text.
- Use tabular-feeling hierarchy through weight and spacing, not decorative fonts.

## Components
- Add opens the capture form and is the primary action surface in the center of
  the bottom tab bar.
- Ledger owns filtering, editing, deletion, and a top Flow / Charts switch.
  Charts means statistics.
- Ledger must not show an All Books selector at the top; book filtering belongs
  inside the Flow filters.
- Calendar owns the monthly spending calendar and recent entries.
- Charts under Ledger own actual statistics only. Category statistics are
  actual spending summaries and must not display budget targets.
- Assets owns account net, category budgets, and book spending review. Category
  budgets compare actual spending with monthly targets.
- Settings uses the Ultreia-style compact mobile list. Long content such as the
  manual, changelog, and category budget editor opens as a second-level page,
  not inline on the Settings home.
- Settings owns local data actions, exports, imports, editable budgets, and
  PWA/storage notes.
- Budget rows and transaction rows use dense panels, not oversized cards.
- Buttons and form controls follow one shape vocabulary with visible focus.
- Empty states tell Wilf the next practical action.

## Motion
Use 150-220ms transitions for hover, focus, active, save feedback, and row
interactions. Ambient light may move slowly in the background. Respect
`prefers-reduced-motion`.
