# L15 — Security Review (READ-ONLY)

**Scope.** L15 changes only on branch `ab/L15-1a` against `main`.
**Mode.** Read-only. Findings only — no code edits.
**Frame.** STRIDE + OWASP Top 10 + HyperIdle agent-trust-boundary checks.

**Files inspected (L15 surface).**
- `packages/shared/src/task-verbs.ts`
- `packages/web/src/shell/TaskRequestPopover.tsx`
- `packages/web/src/pages/WorkTeam.tsx`
- `packages/web/src/pages/WorkTeamTaskThread.tsx`
- `packages/web/src/lib/thread-detail.ts`
- `packages/web/src/shell/Kanban.tsx`
- `packages/web/src/router.tsx`
- `packages/design-system/src/Tag.tsx`
- `packages/web/e2e/team-request.spec.ts`
- (Adjacent unchanged but load-bearing) `packages/server/src/routes/threads.ts`, `packages/server/src/routes/threads-schema.ts`, `packages/server/src/middleware/{auth,cors}.ts`, `packages/server/src/app.ts`, `packages/design-system/src/{ThreadShell,CommentRow,Composer}.tsx`

---

## Threat-model summary (asset → highest-impact finding)

| Asset | Top threat in L15 | Verdict |
|---|---|---|
| Task-thread integrity (L1 messages tied to tasks) | A user types in the thread page composer; message is silently dropped (no UI feedback, no persisted append) — a **R**epudiation / integrity risk. | MUST-FIX |
| `host_id` (task) authorization | No server-side check that the `task-1` referenced as `host_id` actually exists or that the requester is allowed to post to that task. The route accepts ANY `host_id`. | MUST-FIX (inherited L1 IDOR; L15 widens the surface by being the first user-facing writer to `host_kind=task` threads) |
| Sender identity on POST /api/threads | Server reads `X-Identity` header to set `senderId`, falls back to `u-founder`. The L15 client does NOT set `X-Identity`. Any authenticated holder of the API key can pose as any "founder" by setting the header. | SHOULD-FIX (inherited from L1; L15 inherits and does not introduce mitigation) |
| Plain-message body content | Rendered as text via React in `CommentRow.tsx:84` (`{payload.text}`). No `dangerouslySetInnerHTML` — XSS is contained at the renderer. | OK |
| Thread-detail decoder shape | `decodeThreadDetail` in `lib/thread-detail.ts` validates field types but **trusts `value.messages` as `ReadonlyArray<Message>` via an unchecked `as` cast**. | SHOULD-FIX |
| Rate-limit on POST /api/threads* | Global 60/min/key limiter applies (`app.ts:194-205`). Acceptable floor but per-thread/per-task flood is uncapped. | NICE-TO-HAVE |
| CSRF | Same-origin cookie-less API key auth + CORS origin allowlist (`http://localhost:5173`). No browser-implicit-credential surface. Acceptable. | OK (note: dev-only origin; harden before prod — out of L15 scope) |
| State-mutation bypass (PATCH /api/tasks/:id/state) | Confirmed: no L15 client code calls any `/api/tasks/*/state` endpoint. The popover only POSTs messages. | OK |

---

## MUST-FIX

### MUST-1 — Composer in `WorkTeamTaskThread` silently swallows user messages
**Tier classification.** ALWAYS — output sanitization / write-path integrity.
**STRIDE.** Repudiation + Tampering (the user believes a message was sent; it wasn't).
**File.** `packages/web/src/pages/WorkTeamTaskThread.tsx:30-32, 110`.
**Issue.** `ThreadShell` unconditionally renders a `<Composer>` (verified at `packages/design-system/src/ThreadShell.tsx:427`). The L15 page wires `onAppendMessage={noopAppend}` where `noopAppend` is an `async (): Promise<void> => {}` (line 30). When the user types into the composer and clicks Send, the Composer's submit path (`packages/design-system/src/Composer.tsx:42` — `await onSubmit(...)`) resolves with no side-effect, no error, no toast, no error-state on the message stream. The message is gone.
**Why this is a security issue (not just UX).** The thread is the auditable record of human↔agent intent. A user posting "stop the agent" believes they have intervened; the message never reaches the server; the agent continues. The user has performed a non-repudiable action in their head ("I told the agent to stop") that the system cannot prove or replay. The audit trail diverges from user intent silently.
**Exploit.** Open `/work/team/tasks/t1/thread`, type any message in the composer, click Send. No 4xx, no UI feedback that the message was discarded. (Confirmed by reading `WorkTeamTaskThread.tsx:30-32` and the `Composer.onSubmit` invariant in `Composer.tsx:42`.)
**Fix.** Three options, in decreasing-preference order:
1. Wire `onAppendMessage` to a real POST against `/api/threads/{thread.id}/messages` (the same flow `TaskRequestPopover` uses). The thread page should be a peer write-surface, not a read-only one.
2. Hide the Composer when the page is intended to be read-only — extend `ThreadShell` with a `readOnly?: boolean` prop and pass `readOnly` from `WorkTeamTaskThread`. Document the contract in `ThreadShell`'s JSDoc.
3. At minimum, surface an inline error when `onAppendMessage` is a no-op (e.g. throw and let the Composer's existing error path render). The current silent no-op is the worst of all worlds.

### MUST-2 — `decodeThreadDetail` casts `messages` to `ReadonlyArray<Message>` without per-message validation
**Tier classification.** ALWAYS — input validation at trust boundary (server → client).
**STRIDE.** Tampering (a malformed/poisoned message slips through the decoder and is rendered or fed back into agent prompts when the thread is reloaded).
**File.** `packages/web/src/lib/thread-detail.ts:99-101`.
**Issue.** The decoder strictly validates `value.thread` (every field by type) and reduces `identities` to a known shape — good. But `messages` is admitted as a bare array length check followed by `value.messages as ReadonlyArray<Message>`. Any payload with the right top-level keys but malformed message bodies passes. The contract claim in the comment ("Server validates each `Message` via zod") shifts trust to the server, but the decoder runs in the browser against any HTTP response — including a future evil-CDN intercept, a misconfigured proxy, or a server bug.
**Exploit.** A malformed message (e.g. `{ type: "plain", payload: { text: 12345 } }` or a verdict missing `resolvesMessageId`) reaches `<ThreadShell>`, which then crashes mid-render (no error boundary — confirmed: `WorkTeamTaskThread.tsx:104-113` mounts `<ThreadShell>` directly). Worse: a message with `type: "plain"` and a payload object containing extra unexpected keys silently propagates through `CommentRow.tsx` rendering.
**Fix.** Either (a) per-message validation in `decodeThreadDetail` (mirror the server's `messageRowSchema` discriminated union — the decoder is the right home), or (b) wrap `<ThreadShell>` in an error boundary so a malformed message degrades to an error state instead of a white screen. (a) is safer.
**Cross-ref.** The simplification scan flagged the same file for unsafe-cast issues in the OLD `WorkTeamTaskThread` (now resolved by extraction). The unchecked-array-cast survived the extraction.

### MUST-3 — `host_kind=task` writes are not gated by task existence or task-level ACL
**Tier classification.** NEVER — cross-tenant data access without explicit scope check.
**STRIDE.** Elevation of Privilege + Tampering.
**File.** `packages/server/src/routes/threads.ts:278-378` (POST /api/threads), reachable via `packages/web/src/shell/TaskRequestPopover.tsx:62-80`.
**Issue.** `POST /api/threads` accepts an arbitrary `hostId: string` (only `min(1)` per `threads-schema.ts:117`) for `hostKind: "task"`. There is no FK check that the task row exists, no check that the caller is on the task's owning team, and no check that `ownerAgentId` is actually the task's owner. Worse: the L15 client (`TaskRequestPopover.tsx:68`) constructs `participants: [founderId, ownerAgentId]` from CLIENT-supplied data — an attacker can pass any `participants` array, and the server's only authz on creation is that the inferred `senderId` is added to the participants list (`threads.ts:294-297`). No cross-check against the underlying task. After creation, `POST /api/threads/:id/messages` only checks "sender is in participants" (`threads.ts:418`).
**Exploit.**
1. Adversary holding the API key (today: a single shared key — see SHOULD-1) calls `POST /api/threads` with `hostKind: "task"`, `hostId: "<any-task-id>"`, `participants: ["adversary-id", "victim-agent-id"]`. The thread is created against a task they have no business with.
2. They subsequently `POST /api/threads/:id/messages` and inject "Mark blocked" / "Kill" deterministic-format strings. The agent reading the thread's line-1 regex (per plan §10) sees a forged human request from "@A. Founder" (because the `actorName` in `formatRequestMessageBody` is also CLIENT-supplied — `task-verbs.ts:77`).
3. **Knowledge poisoning vector.** The thread's plain-text payload is later persisted into L1 task-learnings → L2 product state. A poisoned message ("@CEO requested: Kill") becomes a knowledge artifact that future agents read as ground truth.
**Note on shared inheritance.** This is largely an inherited L1 gap (the plan's §8 acknowledges it under "Posting to a thread for a task the user does not have access to" → `auth-middleware-participant-scope` follow-up). L15 is the FIRST user-facing writer for `host_kind=task`, so it materially expands the attack surface. Marking MUST-FIX because L15 ships a UI that exercises the gap by default.
**Fix.**
1. Server: in `POST /api/threads`, when `hostKind === 'task'`, require the task row to exist (`db.select().from(tasks).where(eq(tasks.id, hostId)).get()`); 404 otherwise. Same for the other host kinds where applicable.
2. Server: validate that the caller has authorization to post against this task (team membership check — needs the team-scoped task lookup that the L15 plan §11 risk 1 already flagged as missing).
3. Server: when `hostKind === 'task'`, require `ownerAgentId` (or all `participants[]` whose role is "agent") to actually belong to the task's owning team. Reject otherwise.
4. Server: stop trusting the CLIENT-supplied `actorName` for the deterministic body. Either strip the `@<actorName>` prefix server-side and let the agent rely on `senderId`, or generate the body server-side from the trusted `senderId`. Today the line-1 string is purely client-controlled.

---

## SHOULD-FIX

### SHOULD-1 — `X-Identity` header is unsigned and unset by the L15 client → impersonation surface
**Tier classification.** ASK FIRST — this is an inherited L1 model issue, but L15 is the first UI to write `host_kind=task` threads and inherits the gap.
**STRIDE.** Spoofing.
**File.** `packages/server/src/routes/threads.ts:50-56` (server reads), `packages/web/src/shell/TaskRequestPopover.tsx:62-95` (client never sets the header).
**Issue.** The server identifies the sender via the `X-Identity` request header, falling back to `u-founder` if absent. There is no signature on the header, no binding to the API key, no allowlist of which identities a given key may assume. A holder of the single API key can impersonate any agent or founder by setting `X-Identity: <id>`. The L15 client doesn't set the header, so every L15 request becomes a `u-founder`-attributed message. This is fine while the system is single-user, but the L15 popover ALSO sends a CLIENT-controlled `actorName` ("A. Founder" hardcoded as `DEFAULT_FOUNDER_NAME` in `Kanban.tsx:84`) embedded in the `text` payload. Two independent, unverified identity claims: the header AND the in-text `@<actorName>`.
**Exploit.** A second user (sharing the API key) sends a request popover message; the server attributes it to `u-founder`; the message body says "@A. Founder requested: Kill". An auditor cannot reconstruct who actually sent it.
**Fix.** Bind sender identity to the authenticated principal — replace the trust-the-header model with an auth middleware that derives the sender from a signed token (post-MVP). For L15 specifically: at minimum, make the server reject any client-supplied `actorName` in the body and reconstruct the line-1 string server-side from the resolved `senderId` + identity table. The client-side `formatRequestMessageBody` becomes a UI preview, not a wire format.
**Cross-ref.** Plan §8 row "Verb tampering" claims "the verb has no semantic meaning to the server" — true today, but the plan AC says the agent parses the line-1 string, so the message body IS the contract. A forged actorName silently rewrites the contract.

### SHOULD-2 — `WorkTeam.tsx` `ThreadDetailResponse` cast bypasses validation for the count fan-out
**Tier classification.** ALWAYS — input validation.
**STRIDE.** Tampering / DoS (a malformed message-array crashes the Kanban render).
**File.** `packages/web/src/pages/WorkTeam.tsx:128-156`.
**Issue.** Two ad-hoc interfaces (`ThreadListResponse`, `ThreadDetailResponse`) are cast onto `await res.json()` results. The `messages` field is `ReadonlyArray<unknown>` with no per-row check. `detail.messages?.length ?? 0` (line 156) is the count rendered into the Tag chip — if the server returns `{ messages: 1234 }` (a number), the optional chaining swallows the error and the count goes to `0`; if it returns a malformed object that has a `length` property, garbage flows into the UI.
**Exploit.** Lower-severity than MUST-2 because the result is rendered as a number, not as text. But this is the same trust-boundary mistake that MUST-2 flags; both should be cleaned up in the same pass.
**Fix.** Reuse `decodeThreadDetail` from `lib/thread-detail.ts` for the detail fetch (`fetchThreadMetaForTask`'s second hop). Add a tiny `decodeThreadList` for the first hop. Stop hand-rolling response interfaces in the page.

### SHOULD-3 — `note` textarea has no server-aligned client cap and no client-side trim/length enforcement of the FULL body
**Tier classification.** ASK FIRST.
**STRIDE.** DoS (large notes inflate thread size; expensive to render and to ship through agent context).
**File.** `packages/web/src/shell/TaskRequestPopover.tsx:204` (`maxLength={280}`), vs. `packages/server/src/routes/threads-schema.ts:35` (server allows `text.max(16_384)`).
**Issue.** The client caps the NOTE at 280 chars but the body sent to the server is `formatRequestMessageBody` — which prepends a 30-80-char line 1. Server cap is on the COMPOSED body (16,384). So the client cap is comfortably under the server cap — that's fine. The real issue: the L15 client sends `note` straight into the body without trimming control characters or normalizing newlines. A note like `"\n\n\n\n... (256 newlines) ...\n"` slips through 280 chars and renders as an absurd visual gap in `CommentRow.tsx:84` (which uses `whitespace-pre-wrap`). Knowledge layer ingest could pick this up too.
**Fix.** In `formatRequestMessageBody` (or in the popover's `handleSend`), strip control chars (`/[\x00-\x08\x0B-\x1F\x7F]/g`) and collapse runs of >2 newlines. The trim already in `task-verbs.ts:78` handles leading/trailing whitespace but not inner pathological content.

### SHOULD-4 — `WorkTeam.tsx` thread fan-out leaks `taskId` enumeration into the access log even when no thread exists
**Tier classification.** ASK FIRST.
**STRIDE.** Information disclosure (low impact today).
**File.** `packages/web/src/pages/WorkTeam.tsx:140` + `packages/server/src/routes/threads.ts:175-181`.
**Issue.** On every Kanban mount, the client issues 5+ `GET /api/threads?host_kind=task&host_id=<id>` requests, one per fixture-task. The server returns 200 + `{ threads: [] }` whether the task exists or not (no existence check, see MUST-3). An attacker observing access logs cannot distinguish "task exists, no thread" from "task does not exist". That's actually acceptable from a privacy angle today — but it bakes in a pattern where the client enumerates task IDs against the API. Once real task data lands (post-L15), this fan-out is per-pageview enumeration, easy to abuse for timing or oracle attacks.
**Fix.** Add the batched endpoint mentioned in plan §10 trade-off (B) before exposing real per-team tasks. Plan §11 risk 1 already lines this up. Surfacing here so security signs off on the batch endpoint's authz model when it lands.

---

## NICE-TO-HAVE

### NTH-1 — POST /api/threads* uses the global 60/min/key limiter; consider a tighter per-thread cap
The plan §8 first row escalates to follow-up `thread-message-rate-limit`. Confirmed against `app.ts:187-205` — the global limiter at `HYPERIDLE_RATE_LIMIT_PER_MIN` (default 60) covers `/api/threads*`. That's a defensible floor for the single-user case. For multi-tenant it's too generous (60 messages/min/key against ANY thread is a lot of agent context churn). Add a per-thread, per-sender 5/min limiter when L1's follow-up lands. Not a L15 blocker.

### NTH-2 — Thread-list response trust in `WorkTeamTaskThread.tsx:56`
`const list = (await listRes.json()) as { threads: Array<{ id: string }> };` — same shape-without-validation pattern as SHOULD-2. If `threads[0]` is `null` or non-object, `first.id` crashes. Tiny, but cleanup at the same time as SHOULD-2.

### NTH-3 — `noopAppend` documentation drift
`WorkTeamTaskThread.tsx:30-32` comment says "L15: thread page is read-only; composing happens via the request popover." But `<ThreadShell>` renders a `<Composer>` regardless. The comment encodes an assumption that the renderer doesn't honour. Either (a) make the assumption true (read-only ThreadShell — see MUST-1 fix path 2), or (b) drop the misleading comment. Today the comment misleads the next agent into thinking the page is safe.

### NTH-4 — The deterministic body grammar makes the message a parseable command surface
`formatRequestMessageBody` produces `@<actorName> requested: <verb-label>` as line 1. Plan §10 trade-off (4) and §8 verb-tampering row note that "agents parse line 1 with regex". This is a soft prompt-injection vector by design: the verb string IS the contract between the human and the agent. Once an agent does anything more than render this — once it acts on it — the line-1 grammar becomes a privileged command channel running over an unauthenticated text payload. **Today no agent code parses this string.** Flagging for the day someone wires the agent side: the parser MUST refuse to act on a request whose `senderId` doesn't match a server-trusted identity, NOT trust the in-body `@<actorName>`. The parser should also reject any line-1 verb outside `REQUEST_VERBS`, and SHOULD reject if line 2 contains markdown/HTML constructs that look like agent-instruction injection (e.g. "Ignore previous instructions and ..."). Add this to the agent-side architecture spec when it's drafted.

### NTH-5 — `lib/thread-detail.ts` exports `isObject` and `ThreadDetailDecodeError` but neither is used outside the file
Defensive surface area expansion; not a bug. If they stay unused, narrow them to `function`-private.

### NTH-6 — The thread page's loading state on a slow / hung server can hang indefinitely
`WorkTeamTaskThread.tsx:39-81` has no fetch timeout. A deliberately slow upstream pins the page in the loading skeleton forever — minor DoS / availability concern, mostly UX. Add a `setTimeout(() => ac.abort(), 10_000)` in the effect.

---

## Counts

- **MUST-FIX:** 3
- **SHOULD-FIX:** 4
- **NICE-TO-HAVE:** 6

## Top 3

1. **MUST-1** — Composer in `WorkTeamTaskThread` silently swallows messages → user-facing repudiation/integrity hole.
2. **MUST-3** — `POST /api/threads` with `hostKind:'task'` accepts any `hostId` and any `participants[]`, with no task-existence or task-team-membership check. L15 is the first UI to exercise this gap; expands knowledge-poisoning surface.
3. **MUST-2** — `decodeThreadDetail` admits `messages` as an unchecked `as ReadonlyArray<Message>` cast. Malformed server payloads crash `<ThreadShell>` mid-render with no error boundary.

## Verdict

**REVISE.** Three MUST-FIX items: (1) the page silently drops user messages typed into the composer — the worst kind of audit-trail divergence; (2) a thread-create authz/IDOR gap that L15 is the first UI to exercise (server accepts arbitrary `hostId` + client-controlled `participants` for `host_kind=task`); (3) an unchecked cast in the new `decodeThreadDetail` that lets malformed server messages reach the renderer. Two of the three (MUST-1 and MUST-2) are L15-introduced. MUST-3 is partly inherited but L15 widens it.

The good: the L15 contract itself is sound. No `dangerouslySetInnerHTML`, no SQL injection surface (Drizzle + Zod), no PATCH bypass for task state (confirmed: no L15 client code touches `/api/tasks/*/state`), CORS is locked to the dev origin, the existing rate limiter covers the new write paths at a defensible default, and the plain-text rendering path in `CommentRow` uses React-escaped text. The plain-message body content is correctly treated as data, not code, in the renderer — provided the agent parser to come (NTH-4) treats it the same way.
