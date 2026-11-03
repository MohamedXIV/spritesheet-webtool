## 2026-01-26 - Interactive Divs Missing Keyboard Support
**Learning:** Common pattern of `div` with `onClick` (e.g., custom file inputs, menus) lacking `tabIndex` and `onKeyDown`.
**Action:** Always check for keyboard accessibility when observing custom interactive elements. Add `role="button"`, `tabIndex={0}`, and `onKeyDown` handlers.
