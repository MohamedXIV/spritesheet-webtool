## 2025-02-19 - Accessible Controls in Custom Players
**Learning:** Custom video player controls often lack accessible names for icon-only buttons and visible focus indicators, making them unusable for screen reader and keyboard users.
**Action:** Always add `aria-label` to icon-only buttons and explicitly define `:focus-visible` styles when building custom control interfaces.
