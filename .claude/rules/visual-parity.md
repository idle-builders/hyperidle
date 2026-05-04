---
paths:
  - "packages/design-system/**"
---

# Visual Parity: HTML is the Design Reference

- HTML component files in `packages/design-system/html/` are the design source of truth. They are edited by Claude Design. **NEVER change the styling of HTML files.**
- TSX components in `packages/design-system/src/` must match the HTML rendering pixel-for-pixel. When there is a visual discrepancy, always fix the TSX, never the HTML.
- The visual regression threshold is 5% max pixel diff. This is non-negotiable. Do not raise it — fix the TSX instead.
- HTML files may be adapted for renderability (e.g., adding data attributes, fixing broken markup) but never for styling changes.
