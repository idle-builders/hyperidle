# Q1 Architecture Critique

**Reviewer:** Phase 2 Reviewer (producer/evaluator separation)
**Artifact:** `plans/Q1/architecture.md`
**Round:** 1

---

## 9-Dimension Architectural Rubric

### 1. Spec Fidelity (8/9)

The plan addresses every acceptance criterion from TRACK-Q.md:

| AC | Covered By |
|----|-----------|
| "New thread" action accessible | Task 8 (RecipientPicker in AppShell submenu) |
| Recipient picker with search/filter | Tasks 2, 6, 7 (API + hook + component) |
| DM thread creation persisted | Task 1 (findOrCreateDirectThread extension) + Task 9 (wire creation) |
| New thread appears immediately | Task 16 (thread_created WS event refresh) |
| Dial-in affordance visible | Task 12 (useActiveSessionForTask) + Task 13 (UI toggle) |
| Activity stream (actions, cost, reasoning) | Tasks 3, 4, 5, 10, 11 (buffer + endpoint + WS + hook + panel) |
| User can interject | Existing POST /api/threads/:id/messages (no new work) |
| Observe mode read-only | Section 3.4 (no auth check, no notification to agent) |
| Session end graceful transition | Task 14 (summary card + transition) |
| Vitest tests | Task 19 (8 specific test files listed) |
| Playwright E2E | Tasks 17, 18 (2 E2E spec files with scenario outlines) |

**Deduction:** The AC says "DM-configured thread (host=sender, two participants)". The plan implements `hostKind: recipientKind` (host = the recipient, not sender). This is actually correct for the existing data model (the host is the entity the thread is "about"), but it contradicts the AC's wording "host=sender." The plan should have called this out explicitly as a clarification of the AC's imprecise language. The spec's "host=sender" is wrong if we read it literally -- it should say "host=recipient" per the Thread primitive contract. The plan silently corrects the spec. This is fine but should be documented.

### 2. Layer Integrity (9/9)

The plan respects the three-layer architecture:
- **Human Interface (web):** RecipientPicker, SessionActivityPanel, hooks -- all in `packages/web/`
- **Meta Layer (server):** Routes, services, WsBroadcaster extension -- all in `packages/server/`
- **No cross-layer violations:** The web layer talks to server via REST + WebSocket. The server talks to the event bus. No direct DB access from frontend.

The data model extension (`findOrCreateDirectThread` with `recipientKind`) stays within `packages/server/src/services/` -- correct layer. The `packages/db` schema is untouched.

### 3. API Contract Quality (7/9)

**GET /api/recipients** -- Well-defined response shape. Query params documented. Read-only projection.

**GET /api/sessions/:id/activity** -- Response shape uses `Record<string, unknown>` for the `data` field. This is a type safety issue. The plan defines three discriminated payload shapes (tool_call, reasoning, cost_tick) but then erases the type to `Record<string, unknown>`. This forces the client to cast or runtime-check. Should be a discriminated union:

```typescript
type ActivityEntry =
  | { type: "tool_call"; timestamp: number; data: { toolName: string; argsSummary: string } }
  | { type: "reasoning"; timestamp: number; data: { excerpt: string } }
  | { type: "cost_tick"; timestamp: number; data: { deltaMinor: number; totalMinor: number; currency: string } };
```

**WebSocket topic `session:<sessionId>`** -- The plan says "Any authenticated identity can subscribe to `session:<id>` topics." This is intentional (spec: observe mode is read-only). But the existing `createDbSubscribeAuthorizer` rejects any topic that isn't in `GLOBAL_TOPICS` and doesn't start with `thread:`:

```typescript
if (GLOBAL_TOPICS.has(topic)) return true;
if (!topic.startsWith("thread:")) return false;  // <-- session: topics hit this
```

The plan does not mention modifying the authorizer to allow `session:*` topics. This is a blocking implementation gap. Without the authorizer change, all `session:*` subscribes will return `forbidden`.

**Deductions:**
- `Record<string, unknown>` instead of discriminated union (-1)
- Missing authorizer modification for `session:*` topics (-1)

### 4. Data Model Accuracy (9/9)

The plan correctly identifies that no schema changes are needed. I verified:
- `threads.hostKind` is `text("host_kind").notNull()` -- accepts any string, not an enum. "user" and "agent" are valid values.
- `findOrCreateDirectThread` currently hardcodes `hostKind: "agent"`. The extension to accept `recipientKind` is a minimal, backward-compatible change.
- Session activity is ephemeral (in-memory ring buffer). No persistence needed. Correct for a desktop app.
- The `ToolCallRecordedEvent` already has `sessionId`, `toolName`, `argsSummary` -- exactly what the activity buffer needs.

### 5. Naming Honesty (8/9)

Names are clear and accurate:
- `SessionActivityBuffer` -- describes what it is (buffer of session activity)
- `useSessionActivity` -- describes its purpose
- `RecipientPicker` -- standard picker pattern name
- `useRecipients` -- standard hook naming
- `useActiveSessionForTask` -- descriptive, though long

**Minor concern:** The hook `useActiveSessionForTask` is mentioned in the plan but not in the "New Files" table (section 4.2). It appears only in the code snippet (section 4.6). Should it be a standalone hook or inline logic? The plan is ambiguous -- if it's just a `useSWR` call to `GET /api/sessions?task_id=<id>&state=active`, it doesn't need its own file. But naming it suggests it exists as a separate hook. Clarify.

### 6. Task Ordering & Dependencies (8/9)

The dependency graph is correct and the parallelization opportunities are identified:
- Phase 1 tasks (1-5) are all independent -- correct
- Phase 2 depends on Phase 1 server endpoints -- correct
- Phase 3 depends on Phase 1 for the activity endpoint/WS -- correct
- Phase 4 (polish, tests) depends on everything above -- correct

Critical path: Tasks 3 -> 4 -> 10 -> 11 -> 13 -> 14 -> 18. This is reasonable.

**Deduction:** Task 5 (WS event forwarding) requires the authorizer modification for `session:*` topics. This dependency is missing from the graph. Without it, the frontend (Task 10) will subscribe to `session:<id>` and get `forbidden`. This should be a separate task or merged into Task 5.

### 7. Testing Strategy Adequacy (8/9)

8 unit test files + 2 E2E spec files cover the full feature surface:
- Server: routes (recipients, sessions activity), services (direct-thread, activity buffer)
- Client: hooks (useRecipients, useSessionActivity), components (RecipientPicker, SessionActivityPanel)
- E2E: DM creation flow, dial-in flow

The E2E scenarios (section 11) are specific and testable:
- "Create a task with an active session (seeded fixture)" -- acknowledges fixture setup
- "Fixture injects tool_call_recorded events" -- acknowledges event simulation

**Minor gap:** No test for the "session ends before dial-in" case (section 10, failure mode 2). The E2E only covers "dial in, then session ends." The inverse (no active session -> no badge) should be a unit test on the Conversations page component. This is implicitly covered but not explicitly listed.

### 8. Trade-Off Log Quality (9/9)

Five decisions documented with alternatives, costs of chosen, costs of alternative. Each is well-reasoned:
- In-memory buffer vs persistence -- correct for desktop
- Client-side filtering -- correct for small lists (10-50 recipients)
- Fixed flexbox vs resizable split -- avoids a11y complexity
- No new component slot -- correctly argues it doesn't earn its keep
- Session topics without auth -- correctly cites spec intention

The trade-off log is honest and the alternatives are genuine (not strawmen).

### 9. Scope Containment (8/9)

The plan explicitly reuses existing endpoints (POST /api/threads, POST /api/threads/:id/messages, GET /api/sessions, GET /api/threads/:id). New surface is minimal: 2 new endpoints, 1 new WS topic, 1 new service, 2 new components, 2 new hooks.

No new database tables. No new message types. No new host kinds. The constraint "system grows at the edges" is respected.

**Deduction:** The plan lists 19 ordered tasks. For a workpackage estimated at "L (~5d)", this is aggressive. 19 tasks in 5 days means less than half a day per task. Some tasks (Task 7: RecipientPicker component, Task 11: SessionActivityPanel component) are substantial. The plan does not address whether the 5-day estimate is still realistic given the task count, or whether parallelization across agents is assumed.

---

## Aggregate Score: 74/81 (8.2/9)

| Dimension | Score |
|-----------|-------|
| Spec Fidelity | 8 |
| Layer Integrity | 9 |
| API Contract Quality | 7 |
| Data Model Accuracy | 9 |
| Naming Honesty | 8 |
| Task Ordering | 8 |
| Testing Strategy | 8 |
| Trade-Off Log | 9 |
| Scope Containment | 8 |
| **Average** | **8.2** |

---

## Verdict: PASS (8.2 >= 7.0 threshold)

The architecture plan advances. The builder must address the following:

### Blocking Issues (must fix before implementation)

1. **Authorizer for `session:*` topics.** The existing `createDbSubscribeAuthorizer` will reject `session:*` subscriptions because it only allows global topics and `thread:*` topics. The builder must extend the authorizer to allow `session:*` (any authenticated user can subscribe). Add this as a sub-task within Task 5 or as a new task between 5 and 10.

2. **Discriminated union for activity entries.** Replace `Record<string, unknown>` with a proper discriminated union type for the `data` field in `SessionActivityResponse.activity`. This is a TypeScript strict mode requirement -- `Record<string, unknown>` forces unsafe casts downstream.

### Non-Blocking Issues (should address during implementation)

3. **Document the "host=sender" AC clarification.** The AC says "host=sender" but the implementation correctly uses "host=recipient". Add a `@lore` comment in the code explaining this divergence.

4. **Clarify `useActiveSessionForTask`.** Either add it to the "New Files" table or inline it into Conversations.tsx. Do not leave it as an implicit dependency.

5. **Dependency graph update.** Task 5 should explicitly include "extend authorizer for session:* topics" or a new Task 5b should be added.
