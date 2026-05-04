# Removed Tests Audit Log

Single-source record of intentionally-deleted test files in `packages/web`. Format: `<date> | <file> | <story> | <one-line reason>`.

| Date | File | Story | Reason |
|------|------|-------|--------|
| 2026-05-04 | `Kanban.keyboard-drag.test.tsx` | L15 | Drag layer removed from Kanban (drop zones, sensors, `resolveKanbanDrop`, `COLUMN_TO_STATE`); the integration target no longer exists. Canvas keyboard-drag is unaffected (covered by Canvas's own tests). |
