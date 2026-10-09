@AGENTS.md

# Project rules

- **Text must always be readable.** Every piece of text must meet WCAG AA
  contrast (4.5:1, or 3:1 for text at least 24px, or bold and at least
  18.66px) against what is actually behind it: gradients, the background
  pattern, brush-stroke art, glyph bands. Don't use low-opacity text
  (below 75%) on the stage. Check with `npx playwright test tests/e2e/contrast.spec.ts`
  (after `npm run build`), which measures real rendered pixels; it must pass.
- Avoid em dashes in UI copy, content and docs.
- Use the SVG icon set (`src/components/Icon.tsx`), never emoji, in the UI.
