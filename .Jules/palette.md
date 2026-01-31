## 2024-10-27 - Converting Interactive Divs to Buttons
**Learning:** This codebase heavily uses interactive `div`s with CSS modules. When refactoring to `button` for accessibility, standard button resets (`background: none`, `border: none`, `font-family: inherit`, `padding: 0` if needed) must be applied within the CSS module classes to preserve exact visual parity while enabling keyboard navigation.
**Action:** When fixing similar components, apply these reset properties to the interactive class in the `.module.css` file.
