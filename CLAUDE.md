# Fren Labs — Claude Instructions

## Project
React + Vite app. IBM Plex Mono, dark Bloomberg terminal aesthetic.
Color palette in `src/constants.js` (C.accent = #CC6600 copper-orange).
Routing via React Router v6. Deployed on Vercel at https://fren-labs.vercel.app.

## Style rules
- All styles are inline React style objects — no CSS files or CSS-in-JS libraries.
- Squared corners everywhere: `borderRadius: 0` or `borderRadius: 2`. Never higher.
- Section header bars use the negative-margin flush technique:
  panel has `padding: 16` → header uses `margin: "-16px -16px 14px -16px"`
- Bloomberg color palette only — no other colors outside `constants.js`.

## Mobile
- **Always optimise for mobile screens (≤ 640px) alongside desktop changes.**
- Use the `useIsMobile(breakpoint)` hook pattern (see `src/Shell.jsx` or `src/App.jsx`).
- On mobile: hide decorative/secondary text in headers, use stacked layouts over wide flex rows, avoid hardcoded `minWidth` values that exceed ~120px.
- Tables that can't be reformatted should use `overflowX: "auto"` on their wrapper.

## Key files
- `src/constants.js` — color palette and DEFAULT_CONFIG
- `src/Shell.jsx` — persistent nav layout with live clock and F-key bar
- `src/pages/Home.jsx` — tool directory landing page
- `src/App.jsx` — Lending Loop Optimizer tool (main tool)
- `src/pages/DeltaNeutral.jsx` — Delta Neutral Explorer tool
- `src/computations.js` — pure math functions (no side effects)
- `src/presets.js` — strategy preset configs
