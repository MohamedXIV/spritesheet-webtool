## 2025-02-18 - Custom Menu Accessibility
**Learning:** This project uses a custom `EditorMenuBar` to avoid library conflicts, but it originally used `div`s. Changing them to `<button>`s requires a specific CSS reset to preserve the design while gaining keyboard accessibility.
**Action:** Use the "button reset" pattern (background: transparent; border: none; font: inherit) when upgrading interactive divs to buttons in this codebase.
