## 2026-02-02 - Semantic Buttons in CSS Modules
**Learning:** When refactoring interactive `div` elements to `button` elements in this project's CSS modules, it's critical to apply `background: none`, `border: none`, and `font-family: inherit` to preserve visual styling while enabling accessibility. Without these resets, browser default button styles (like grey backgrounds and borders) conflict with the custom design system.
**Action:** Always check for and apply CSS resets when converting non-semantic elements to semantic ones in existing components.
