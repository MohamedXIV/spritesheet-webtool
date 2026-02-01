## 2025-02-20 - Custom Menu Bar Accessibility
**Learning:** The `EditorMenuBar` component implemented a custom dropdown system using `div`s, which completely bypassed keyboard accessibility.
**Action:** When encountering custom UI components in this codebase, assume they might lack semantic HTML. Refactoring to `<button>` with CSS resets (`background: none; border: none; font: inherit`) is a reliable fix here that preserves the "custom" look while restoring native accessibility (focus, enter/space activation).
