## 2026-01-25 - Missing ARIA Labels on Icon-only Buttons
**Learning:** The application uses `title` attributes for tooltips on icon-only buttons (like media controls), but consistently misses `aria-label` attributes. This makes the interface accessible to mouse users (via tooltip) but confusing for screen reader users who only hear the icon content (often emoji or nothing).
**Action:** When working on existing components with icon-only buttons, check if `aria-label` is missing even if `title` is present.
