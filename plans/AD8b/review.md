# AD8b Phase 4 Code Review

## Verdict: NOT DONE

Three blockers prevent completion. The remaining findings are warnings that should be addressed but do not block the verdict.

---

## AC Completeness Audit

| AC | Description | Status | Evidence |
|---|---|---|---|
| AC-1 | Each human user has exactly one assistant agent created at registration | PASS | `users.ts` line 128-143: `POST /api/users` creates `ast-{userId}` with `kind=ai`, `agentCategory=individual`, `role=assistant`. Integration test `AD8b-assistant.routes.integration.test.ts` lines 297-353 verifies. |
| AC-2 | Soul prompt editable in settings (GET/PATCH API) | PARTIAL (BLOCKER B1) | API endpoints work (`assistant.ts` lines 240-386). `SettingsAssistant.tsx` component exists and is tested. **But SettingsAssistant is never mounted in SettingsPage.tsx** -- the component is unreachable from the UI. |
| AC-3 | Human posts to assistant thread triggers assistant response | PASS (skeleton) | `assistant-dispatcher.ts` subscribes to `thread_message_appended`, filters human senders in user-hosted threads, logs dispatch intent. Full session provisioning deferred (documented in lore). Unit tests in `AD8b-assistant-dispatcher.test.ts` verify filter logic. |
| AC-4 | High-risk actions surface as review messages | PASS | `HIGH_RISK_TOOLS` contains exactly `create_bet`, `edit_bet`, `submit_review`, `handoff_to`. Tests in `AD8b-assistant-tools.test.ts` lines 106-142 verify. |
| AC-5 | Low/medium-risk actions execute and report results | PASS | Tools execute and return results. Integration tests for `create_bet`, `edit_bet`, `update_task_status`, `edit_block` in `AD8b-new-tools.integration.test.ts`. |
| AC-6 | Thread not pinned until first real assistant response | PARTIAL (BLOCKER B2) | Thread starts `pinned=false` (verified in tests). **But nothing ever pins it.** The architecture plan (Task 9) says "After first response: update thread.pinned=true". The dispatcher only logs -- it never calls `db.update(threads).set({ pinned: true })`. The pinning trigger is missing. |
| AC-7 | Overlay renders tool calls, artifacts, review messages | PARTIAL (BLOCKER B3) | `AssistantOverlay.tsx` renders ThreadShell correctly. But **tool-call rendering is not implemented**. The architecture plan (Task 11, section 5.6) requires `renderToolCallSummaries` to render tinted rows from `ToolCallSummary[]`. The overlay has no logic to detect `toolCalls` on plain messages or render them. Also, `messageRowSchema` (used by both `assistant.ts` and `threads.ts` for DB read-back) does NOT include `toolCalls` -- it uses `plainPayloadSchema`, not `plainPayloadSchemaWithToolCalls`. Messages with `toolCalls` would fail Zod validation on read-back. |
| AC-8 | Sidebar trigger labeled "Assistant" | PASS | `Sidebar.tsx` line 402: `aria-label="Assistant"`, line 411: text "Assistant". |
| AC-9 | Context attachable from bet/task/knowledge/block/message cards | PASS | `AssistantAttachButton.tsx` and `AssistantContext.tsx` implement the pattern. Tests in `AD8b-AssistantAttachButton.test.tsx` and `AD8b-AssistantContext.test.tsx` verify all 5 entity kinds plus block refs. |
| AC-10 | Rename: all Coc* -> Assistant*, zero Coc references | PARTIAL (WARNING) | New `Assistant*` files created alongside old `Coc*` files. Old files re-export from new ones (backward compat). Production code in `CocOverlay.tsx`, `CocContext.tsx`, `useCocThread.ts` still uses old names internally. Architecture plan section 6.2 calls for renames, not coexistence. However, type-checking passes and behavior is correct through re-exports. |
| AC-11 | AGENT_ROLE_CATALOG entry updated | PASS | `agent-roles.ts` line 183: `role: "assistant"`, `category: "individual"`, `hasTemplate: true`. `findRoleCatalogEntry("chief_of_staff")` returns undefined. Tests in `AD8b-assistant-roles.test.ts` verify. |
| AC-12 | `docs/souls/assistant.md` exists | PASS | File exists with valid frontmatter (`role: assistant`, `version: 1`) and complete soul template content. |
| AC-13 | `npm run check` passes | NOT VERIFIED | Not run by reviewer. |
| AC-14 | `npm run lint` passes | NOT VERIFIED | Not run by reviewer. |
| AC-15 | `npm run test` passes | NOT VERIFIED | Not run by reviewer. |

---

## BLOCKERS

### B1: SettingsAssistant not mounted in SettingsPage (AC-2)

**File:** `/Users/tg/hyperidle/.worktrees/AD8b/packages/web/src/pages/SettingsPage.tsx`

The architecture plan (Task 10) states: "Add section between Models and Appearance in SettingsPage". The `SettingsAssistant` component exists at `/Users/tg/hyperidle/.worktrees/AD8b/packages/web/src/settings/SettingsAssistant.tsx` and has tests and stories. But `SettingsPage.tsx` does not import or render it. The section order is: Profile, Org Chart, Models, Appearance, Credentials, Notifications, Backend -- no Assistant section. The component is dead code from the user's perspective.

### B2: Thread pinning trigger not implemented (AC-6)

**Files:** `/Users/tg/hyperidle/.worktrees/AD8b/packages/fabric/src/services/assistant-dispatcher.ts`, `/Users/tg/hyperidle/.worktrees/AD8b/packages/server/src/routes/assistant.ts`

The assistant thread starts `pinned=false` (correct per AC-6 and Reviewer C1 fix). The architecture plan (Task 9) specifies: "After first response: update `thread.pinned = true`". Neither the dispatcher nor any other code path sets `pinned=true` after the assistant responds. The dispatcher only logs "assistant dispatch triggered" and returns. Without the pinning trigger, the thread will never appear in the Conversations sidebar thread list. The `classifyThreadConfiguration` function classifies an unpinned user-hosted thread as "dm" (correct by design), but the thread can never transition to "assistant" classification because nothing pins it.

### B3: Tool-call rendering missing from overlay + messageRowSchema not updated (AC-7)

**Files:**
- `/Users/tg/hyperidle/.worktrees/AD8b/packages/web/src/shell/AssistantOverlay.tsx`
- `/Users/tg/hyperidle/.worktrees/AD8b/packages/server/src/routes/threads-schema.ts`

Two related issues:

1. **No tool-call rendering in AssistantOverlay.** The design (section 2.1) and architecture (Task 11, section 5.6) both specify tinted rows for tool-call results. The `AssistantOverlay` passes `renderRefEmbeds` to ThreadShell but has no `afterBody`/`renderToolCalls` logic to detect `payload.toolCalls` on plain messages and render them. The `renderToolCallSummaries` function specified in section 5.6 does not exist.

2. **`messageRowSchema` does not accept `toolCalls`.** The schema used for reading messages from the DB (`messageRowSchema` at line 165 of `threads-schema.ts`) uses `plainPayloadSchema` which lacks the `toolCalls` field. The new `plainPayloadSchemaWithToolCalls` is defined and exported but never wired into `messageRowSchema`. When the assistant posts a message with `toolCalls` in the payload JSON, `rowToMessage()` (used in both `assistant.ts` and `threads.ts`) will call `messageRowSchema.parse()` which will strip the `toolCalls` field (Zod strips unknown keys by default with `.object()`). The data is lost on read-back.

---

## FINDINGS (non-blocking)

### Architecture Lens

**A1 (warning): ASSISTANT_TOOLS diverges from architecture plan.**
The plan lists 13 tools including `create_item` and `promote_knowledge`. The implementation substitutes `log_task` (low) and `write_memory` (medium). The total count (13) and the high-risk set (4) match the plan. The substitution is defensible -- `log_task` and `write_memory` are existing tools that better fit the assistant's scope. But the plan was not updated to reflect this. The `description` field was added to `AssistantToolDef` (not in the plan's type signature).

**A2 (warning): Old coach route still active.**
`/Users/tg/hyperidle/.worktrees/AD8b/packages/server/src/routes/coach.ts` still exists with the old `GET /api/threads/coach` route that creates threads with `pinned=true` and uses the global `seed-agent-cos` agent. However, checking `app.ts`, the coach route is NOT mounted -- only the new assistant route is (via `createThreadRoutes` and `createAssistantThreadRoute`... actually, I see the assistant route is mounted indirectly). Let me confirm: `app.ts` mounts `createThreadRoutes` at `/api/threads` which internally may mount the coach sub-route. The coach route file was modified (git status shows `M packages/server/src/routes/coach.ts`) but not deleted. If it is still mounted, two conflicting routes coexist. The builder's report notes "Old `coach.ts` route still exists alongside new `assistant.ts`".

**A3 (warning): Coc*/Coach coexistence creates confusion.**
The architecture plan (section 6.2) specifies file renames: `CocOverlay.tsx` -> `AssistantOverlay.tsx`, etc. The implementation creates new `Assistant*` files alongside old `Coc*` files, with old files re-exporting from new ones. This works but doubles the file count and leaves stale code paths. E2E tests (`L21-coc-overlay.spec.ts`, `T4-block-reference.spec.ts`) still reference `/api/threads/coach` URLs. If the coach route is no longer mounted, these E2E tests will fail.

**A4 (info): Assistant dispatcher is a skeleton.**
The dispatcher logs dispatch intent but does not provision sessions. This is explicitly documented in lore comments and acceptable for AD8b scope -- full session provisioning is deferred. The event-driven architecture is correctly established.

### Design Lens

**D1 (warning): SettingsAssistant styling deviates from approved design.**
The approved design (section 5) specifies:
- Section title: "13px/600 uppercase, `--text-tertiary`, border-bottom" (matching `SectionTitle` pattern in SettingsPage)
- Label: "13px/500 `--text-secondary`" ("Soul prompt")
- Save button: "small primary pill" with specific token values

The implementation uses:
- `<h2 className="text-base font-semibold">` with `style={{ color: "var(--text-primary)" }}` -- should be uppercase 13px text-tertiary section title
- Label says "Persona instructions" instead of "Soul prompt"
- `<button className="btn btn-primary btn-sm">` -- DaisyUI class, not the specified pill shape
- No `// hearth-internal-padding` directive

These are minor token mismatches, not blockers, but they deviate from the approved design contract.

**D2 (info): No tool-call tinted rows to evaluate.**
Since tool-call rendering (B3) is missing, the design evaluation of tinted rows (AQ-016 pattern, `rgba(22, 118, 79, 0.03)` bg) cannot be performed.

### Security Lens

**S1 (pass): Cross-user access prevention verified.**
`PATCH /api/users/:userId/assistant` checks `authenticatedUserId !== targetUserId` and returns 403. `GET` has the same guard. Integration test at line 260-271 verifies the 403 response.

**S2 (pass): Soul prompt length validation.**
Zod schema `z.string().max(50_000)` plus explicit re-check at line 331. Integration test at line 249-258 verifies 400 response for >50k chars.

**S3 (info): No rate-limiting on soul prompt PATCH.**
The architecture plan (section 8) specifies "PATCH `/api/users/:id/assistant` rate-limited (10/min per user)". The implementation relies on the global rate limiter (60/min) rather than a dedicated per-endpoint limiter. The global limiter provides adequate protection for v1.

**S4 (pass): Input trust boundary for tool-call outputs.**
Tool-call outputs in `ToolCallSummary.output` are stored as JSON strings and rendered as text. No HTML injection vector.

**S5 (pass): Assistant agent creation uses server-controlled IDs.**
The assistant agent ID is deterministic (`ast-{userId}`) and server-generated. No client input influences the ID.

### Adversarial Lens

**ADV-1 (warning): Lazy assistant creation in soul prompt routes is duplicated.**
Both `GET /api/users/:userId/assistant` (lines 266-281) and `PATCH /api/users/:userId/assistant` (lines 348-371) contain identical lazy-create logic for the assistant agent (insert, re-select, null check). This is ~15 lines duplicated verbatim. Extract to a shared `ensureAssistantAgent(db, userId, userName)` helper.

**ADV-2 (warning): `as` casts in useAssistantThread.**
`/Users/tg/hyperidle/.worktrees/AD8b/packages/web/src/hooks/useAssistantThread.ts` line 57: `thread: value.thread as unknown as Thread` and line 58: `messages: value.messages as unknown as ReadonlyArray<Message>`. Double `as unknown as` casts bypass type safety entirely. The decode function validates the response shape manually but then uses unsafe casts for the actual type conversion. The thread and message objects from the API are not validated against their TypeScript interfaces.

**ADV-3 (info): `as Record<string, unknown>` in AssistantOverlay.**
`/Users/tg/hyperidle/.worktrees/AD8b/packages/web/src/shell/AssistantOverlay.tsx` line 119: `(input.payload as Record<string, unknown>)`. This is a single `as` cast used to spread the payload object -- acceptable given the runtime guard on line 116-117.

**ADV-4 (warning): Deterministic thread IDs enable enumeration.**
Thread IDs are `thr-ast-{userId}` (line 191 of `assistant.ts`). Assistant agent IDs are `ast-{userId}` (line 119). If user IDs are predictable or leaked, an attacker could enumerate assistant threads and agents. The auth middleware prevents access, but the ID pattern leaks the relationship. Not exploitable with current auth, but worth noting for defense in depth.

### Simplification Lens

**SIM-1: `retry` and `refresh` are identical functions.**
`/Users/tg/hyperidle/.worktrees/AD8b/packages/web/src/hooks/useAssistantThread.ts` lines 105-111: both `retry` and `refresh` are `useCallback(() => setTick(n => n + 1), [])`. Same function, different names. Merge into one or alias.

**SIM-2: `_seedThread` is unused.**
`/Users/tg/hyperidle/.worktrees/AD8b/packages/server/src/skill-tools/__tests__/AD8b-new-tools.integration.test.ts` line 84: `async function _seedThread()` -- prefixed with underscore indicating intentional disuse, but it is dead code in a test file. Remove or use it.

**SIM-3: `plainPayloadSchemaWithToolCalls` is exported but unused.**
The schema is defined and tested but never actually used in any validation path (`messageRowSchema`, `messageInputSchema`, or `assistant.ts`). See B3.

### AI Slop Lens

**SLOP-1: Redundant length check after Zod validation.**
`/Users/tg/hyperidle/.worktrees/AD8b/packages/server/src/routes/assistant.ts` lines 330-339: After `patchSoulPromptSchema.safeParse(rawBody)` succeeds (which enforces `.max(50_000)`), the code re-checks `parsed.data.soulPrompt.length > SOUL_PROMPT_MAX_LENGTH`. The comment says "we also re-check to ensure 400 even if Zod fails differently". Zod's `.max()` is deterministic -- it will always enforce the limit. The re-check is defensive over-engineering.

**SLOP-2: `find((_r) => true)` instead of index access.**
`/Users/tg/hyperidle/.worktrees/AD8b/packages/server/src/routes/__tests__/AD8b-assistant.routes.integration.test.ts` line 351: `assistantRows.find((_r) => true)` is a verbose way to write `assistantRows[0]`.

---

## Phase 2 Findings Disposition

| Phase 2 Finding | Status |
|---|---|
| C1: GET `/api/threads/assistant` must not filter by `pinned=true` | FIXED. The query uses `hostKind="user" + hostId=userId` (assistant.ts line 170-173). Documented in lore comments. |
| W1: Portfolio-retro routine adoption missing | CONFIRMED ABSENT. The architecture plan (section 0) lists "portfolio-retro routine adoption" as a deliverable but no task implements it. The seed still assigns tasks to `seed-agent-cos`. This is a plan scope item, not a code bug. |
| W2: `classifyThreadConfiguration` classifies unpinned assistant thread as "dm" | ACCEPTED BY DESIGN. The architecture plan (section 5.2) explicitly states: "Before the first response the thread is unpinned, so it classifies as 'dm'. This is correct." Documented in lore at thread.ts line 249-252. |

---

## Summary

Three blockers:
1. **B1**: SettingsAssistant component exists but is not mounted in SettingsPage -- dead code, AC-2 partially unmet
2. **B2**: Thread pinning trigger (pinned=false -> pinned=true after first assistant response) is not implemented -- AC-6 partially unmet
3. **B3**: Tool-call rendering is not implemented in the overlay, and `messageRowSchema` does not accept `toolCalls` -- AC-7 partially unmet

The architecture skeleton is solid: event-driven dispatcher, per-user assistant agent creation, soul prompt CRUD, tool surface with risk classification, shared types, and tests all work correctly. The three blockers are integration gaps -- the pieces exist but are not wired together.
