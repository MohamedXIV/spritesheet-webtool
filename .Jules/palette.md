# Palette's Journal

This journal tracks critical UX and accessibility learnings from the Spritesheet Webtool project.

## Format
`## YYYY-MM-DD - [Title]
**Learning:** [UX/a11y insight]
**Action:** [How to apply next time]`

## 2026-02-04 - Semantic Button Refactoring
**Learning:** Replacing `div` with `button` in CSS Modules requires explicit `width: 100%` and `text-align: left` to match flexbox `div` layout, especially for dropdown items.
**Action:** When refactoring interactive divs, always reset `background`, `border`, `font`, and check layout properties like `width`.
