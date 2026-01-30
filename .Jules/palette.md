## 2026-01-30 - [Accessible Custom Menus]
**Learning:** Custom menu bars implemented with `div`s create severe accessibility barriers (no keyboard access). Refactoring to semantic `<button>` elements with CSS resets (`background: none; border: none; font-family: inherit`) preserves the visual design while enabling keyboard navigation and screen reader support.
**Action:** Always verify custom interactive components use semantic HTML or full ARIA role/tabindex implementation. For menus, native `<button>` triggers are simpler and more robust than `div` with `role="button"`.
