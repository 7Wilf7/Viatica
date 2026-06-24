# Design

## System
Viatica shares Aevum's Linear-inspired product language: dark surfaces, precise
thin lines, subtle ambient light, restrained blur, and short stateful motion.
The accent shifts from Aevum's violet-blue glow to a low-saturation deep ledger
blue / steel blue.

The current UI target is a mobile app shell, not a one-page dashboard. Primary
navigation is a persistent bottom tab bar:

- Today
- Capture
- Ledger
- Budgets
- Settings

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
- Capture form is the primary action surface and can be reached directly from
  the bottom tab bar.
- Today shows compact overview data and recent entries.
- Ledger owns filtering, editing, and deletion.
- Budgets owns category and book spending review.
- Settings owns local data actions, exports, imports, and PWA/storage notes.
- Budget rows and transaction rows use dense panels, not oversized cards.
- Buttons and form controls follow one shape vocabulary with visible focus.
- Empty states tell Wilf the next practical action.

## Motion
Use 150-220ms transitions for hover, focus, active, save feedback, and row
interactions. Ambient light may move slowly in the background. Respect
`prefers-reduced-motion`.
