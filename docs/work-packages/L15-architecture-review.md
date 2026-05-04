# L15 Architecture Review (Implementation vs Plan/Spec)

Severity totals: CRITICAL 1, WARNING 4, OBSERVATION 3.

## CRITICAL

- **Comfortable-density reveal is a no-op (broken AC).** `packages/design-system/src/TaskCard.tsx:72` uses `data-[density=comfortable]:opacity-100`. Tailwind's `data-*` variant matches the attribute on the SAME element, but `data-density="comfortable"` is set on `AppShell` (`packages/web/src/layouts/AppShell.tsx:494`). Plan §4.5.1 + §Q5 require an ancestor selector (`[data-density="comfortable"] [data-task-overflow] { opacity: 1 }`). `TaskCard.density.test.tsx:48` masks this — it only asserts the className string, not computed style. Spec AC: kebab always visible at comfortable density. **Currently fails in real DOM.**

## WARNING

- **`ensureTaskThread` drops the module-scope cache.** Plan §4.5.6 specifies a `Map<taskId, threadId>` cache to avoid repeated GETs; `ensureTaskThread.ts` has none and the comment says "no client cache". This is a deliberate plan deviation justified inline but not flagged in the plan reconciliation.
- **`POST /api/threads` body diverges from plan.** Plan §4.5.6 calls for `participants=[founderId]` and an `initialMessage` seed. Implementation (`ensureTaskThread.ts:67-74`) sends only `{ hostKind, hostId, title }`. Whether the server route accepts this minimal shape needs verification (plan §4.4 cites `createThreadBodySchema`).
- **`refs[].kind` "task" not yet in shared schema.** `inlineRefSchema` (threads-schema.ts:25) accepts `task`, good — but plan §4.1 said `InlineRef { kind: "task", id }`; verify the closed enum stays aligned. OK today.
- **E2E spec path.** Plan §6.1 names `apps/e2e/tests/team-board-task-actions.spec.ts`; implementation lives at `packages/web/e2e/team-board-task-actions.spec.ts`. Functionally fine, but the route-checklist/test matrix in the plan now points to a non-existent path.

## OBSERVATION

- Layer integrity respected: web does not import server internals; `taskStateRequest.ts` stays in web shell as planned; no schema deltas; Canvas drag untouched.
- API contracts honored: `POST /api/threads/:id/messages` body matches §4.4 (type=plain, payload.text matches `STATE_REQUEST_PREFIX`, refs, clientKey). Status mapping (400/403/other) correct.
- Naming matches plan: `TaskActionsMenu`, `ensureTaskThread`, `formatStateRequestText`, `makeStateRequestClientKey`, `STATE_REQUEST_PREFIX`, route `/work/team/task/:taskId/thread`, `STATE_TO_COLUMN`, `COLUMN_TO_STATE` — all conformant.
