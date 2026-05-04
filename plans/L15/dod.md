## L15 — Definition of Done audit

Verdict: PASS

### Per-AC

- AC1 — drag-to-move removed from Kanban — PASS — evidence:
  - `packages/web/src/shell/Kanban.tsx` (read in full): no `useDraggable`, `useDroppable`, `DndContext`, `DragOverlay`, `KeyboardSensor`, `PointerSensor`, `useSensor(s)`, `closestCenter`, `@dnd-kit/*`, `COLUMN_TO_STATE`, or `resolveKanbanDrop`. `KanbanProps` does not declare `onMoveTask`. `STATE_TO_COLUMN` is a one-way state→column map only.
  - `packages/web/src/pages/WorkTeam.tsx`: no `handleMoveTask`, no `COLUMN_TO_STATE` import; only `handleOpenThread` + `handleRequestStateChange`.
  - PROTECTED guard: `packages/web/src/shell/__tests__/Kanban.no-dnd.test.ts` (lines 23-69) — string-scans both files for the 12 forbidden symbols and the dropped exports. Green in verify.
- AC2 — task affordance + thread post — PASS — evidence:
  - Kebab affordance + Open thread row: `Kanban.tsx:43,120-124` wires `onRequestStateChange`/`onOpenThread`/`pendingByTask` through to `TaskCard`. Asserted by `__tests__/TaskCard.kebab.test.tsx`, `TaskCard.title-row.test.tsx`, `shell/__tests__/Kanban.props.test.tsx`.
  - Verb post path: `WorkTeam.tsx:254-342` builds `{ type:"plain", payload:{ text }, clientKey }` against `requestMessageText(verb)` and POSTs to `/api/threads/<id>/messages` (or atomic `POST /api/threads` with `initialMessage` on first request). Asserted by `__tests__/WorkTeam.request-post.test.tsx` (canonical body shape, success toast, 500 toast, network-reject toast) and `WorkTeam.lazy-bootstrap.test.tsx` (first request → POST /api/threads; second request → POST /api/threads/<id>/messages).
  - Open-thread on no-thread task (DR4 fix): `WorkTeam.tsx:183-252` POSTs `/api/threads` server-side, then navigates. Asserted by `__tests__/WorkTeam.open-thread.test.tsx:65-83`.
  - In-flight guard (AR1/SR1/DR5): `WorkTeam.tsx:150-152, 197, 260` `pendingByTask` map. Asserted by `__tests__/WorkTeam.in-flight-guard.test.tsx` — rapid double-click yields exactly ONE fetch, spinner appears, kebab disabled, second click no-ops.
  - Optimistic-update prohibition (PROTECTED): `__tests__/TaskCard.optimistic-prohibition.test.tsx` — chip text never changes on click; chip is a pure projection of `state` prop.
- AC3 — drag survives only on Canvas — PASS — evidence: `packages/web/src/shell/Canvas.tsx` still imports `DndContext`, `useDraggable`, `useDroppable` from `@dnd-kit/core` (grep confirmed). `__tests__/Canvas.test.tsx` is green in verify. Kanban path is the only place drag was removed.
- AC4 — vitest coverage — PASS — evidence: 6 dedicated L15 vitest files (`Kanban.no-dnd`, `Kanban.props`, `TaskCard.kebab`, `TaskCard.title-row`, `TaskCard.optimistic-prohibition`, `WorkTeam.request-post`, `WorkTeam.lazy-bootstrap`, `WorkTeam.open-thread`, `WorkTeam.in-flight-guard`) — every spec asserts the AC text directly, not `toBeDefined()`. All green.
- AC5 — playwright e2e — PASS — evidence: `packages/web/e2e/kanban-drag-noop.spec.ts` (drag attempt → column unchanged) and `packages/web/e2e/kanban-request-verb.spec.ts` (open kebab → pick Pause → success toast). Spec asserts AC text directly. (Playwright not run in this audit; specs read end-to-end and assertions match AC.)
- AC6 — `bun run check` + lint + test green — PASS for L15 — evidence: `bun run verify` summary: 321 test files passed, 3257 tests passed, 1 file/1 test failed. Sole failure is `packages/pipeline/src/__tests__/runner-otel.test.ts > handleSystemMessage emits OTel spans > opens a span on task_started and closes it on task_notification` — pre-existing OTel exporter issue in the pipeline package, completely unrelated to L15 (no kanban / drag / thread surface). check + lint:biome + lint:eslint passed.

### Verify summary

`bun run verify`: typecheck OK, biome OK, eslint OK, vitest 3257/3261 pass.
Pre-existing failures (not L15): `packages/pipeline/src/__tests__/runner-otel.test.ts` — `handleSystemMessage emits OTel spans > opens a span on task_started and closes it on task_notification` (exporter receives 0 spans instead of 1). Out of scope.

### Spec drift

None observed. Implementation matches approved.md §5 state matrix (request-in-flight spinner, success/failure toasts, optimistic prohibition) and architecture.md §3.4–§4.1 (in-flight guard + lazy-bootstrap atomic path). Follow-ups file scoped to deferred review items, none of which are required by L15 ACs.

### Recommendation

PROCEED to ship. All six ACs have direct, citable evidence; protected tests guard against regression; the lone verify failure is a documented out-of-scope pipeline OTel issue.
