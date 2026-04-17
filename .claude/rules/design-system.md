---
paths:
  - "packages/web/src/components/*.stories.tsx"
  - "packages/web/src/designsystem/**"
---

# Design System

Story format: default export `{ title: "Name" }`, named exports are React components each rendering one variant. Auto-discovered via `import.meta.glob` — drop a `.stories.tsx` next to the component and it appears at `/designsystem`.

Every custom component must have a `.stories.tsx` file. Stories are a required deliverable, not optional documentation.
