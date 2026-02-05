## 2025-02-18 - Semantic Buttons in Custom Menus

**Learning:** When replacing native menu implementations with custom designs, developers often default to `div`s for layout control, sacrificing all accessibility. Even "micro" fixes like swapping `div` for `button` require CSS resets (`background: transparent`, `border: none`, `font: inherit`, `width: 100%`) to match the original design pixel-perfectly while restoring critical keyboard/screen-reader support.

**Action:** Always check "custom" UI components for semantic HTML first. If converting `div` to `button`, immediately apply a standard "reset" CSS class or style block to prevent layout shifts from user-agent styles.
