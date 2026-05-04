# L1 — Simplification Scan

Read-only pass over commits `5b08030` + `5de1c32`. Concept-locked items per the brief (4-message DU, 6-DS family, `legacy_item_id`, closed `host_kind` enum, verdict authz) are excluded from criticism.

---

## CRITICAL

### C1. `ReviewVerdictBar` exposes 5 verdicts that have no listener and no path to the API
**Files:** `packages/design-system/src/ReviewVerdictBar.tsx:12-22,43-52`; consumed by `packages/design-system/src/ThreadShell.tsx:163-184`.

`VerdictGrammarAction` is a 10-action open enum: 5 binding verdicts plus `comment | inline-comment | reply | snooze | escalate`. `ThreadShell.onAction` explicitly switches on the 5 binding verdicts and silently drops the other 5 — every "Comment", "Inline comment", "Reply", "Snooze", "Escalate" button click is a dead button in production. The non-binding section is wired with the same chrome (rendered, hover state, disabled state) as the live verdicts, so a founder cannot tell which buttons work. Either delete the 5 dead actions for L1 (Composer already provides "Reply"), or make the 5 actions a separate prop the page must opt-into. The `ThreadHostBannerAction` enum (`onMoreActions` in `ThreadHostBanner.tsx:39,55`) has the same shape: declared, exported, never wired.

**Simpler:** drop the non-binding + sidecar arrays from `ReviewVerdictBar` and the `onMoreActions` prop from `ThreadHostBanner` until L1b actually needs them. Saves ~30 LOC and removes a UX trap.

### C2. `routes/conversations.ts` is dual-writing the same domain
**File:** `packages/server/src/routes/conversations.ts:140-164,254-285`.

`POST /api/conversations/responses` writes a `verdict`-typed message AND emits the legacy `response_recorded` event. `GET /api/conversations/:threadId` reads verdict-typed messages and projects them back to the dropped-`responses` row shape. Meanwhile `routes/threads.ts` is the canonical L1 surface and does the same writes correctly with proper authz, idempotency, and re-open semantics. The legacy router has none of these guarantees — `approverId` is sender-supplied with no founder check, no idempotency on `client_key`, no verdict-resolves-which-review check (it falls back to `body.itemId` if no review message exists). It is a parallel, weaker code path to the same table.

**Simpler:** delete `POST /responses` and the response-projection in `GET /:threadId`. If a callsite still needs the legacy shape, mark it deprecated and route it to the L1 router. Keeping both paths means every future verdict invariant must be re-implemented twice.

---

## WARNINGS

### W1. `routes/threads.ts:78-105` — three layers of unsafe `as` casts in `rowToThread` / `rowToMessage`
Brand types are stringly-typed (`thread.ts:55-57`), so `id as Thread["id"]` is a no-op. `participants: JSON.parse(row.participants) as ReadonlyArray<Thread["initiatorId"]>` and `payload: JSON.parse(...) as Message["payload"]` followed by `as Message` defeat the discriminated union the schema worked hard to define. Either drop the brand alias and the casts, or actually validate with `messageInputSchema` on read.

### W2. `routes/threads-schema.ts:103-110` — exhaustiveness check that is dead code
```ts
const TypesCheck: ReadonlyArray<(typeof MESSAGE_TYPES)[number]> = ["plain","review","questionnaire","verdict"];
void TypesCheck;
```
A `void`-suppressed const with a hand-typed literal array does not assert the discriminated union covers `MESSAGE_TYPES`. If `MESSAGE_TYPES` adds a value, this stays green. Either delete or use a real `satisfies`-based check on `messageInputSchema.options`.

### W3. `routes/threads.ts:61-76` — `readInitialSenderId` peeks at the agents table to default a sender
The default-non-founder participant lookup adds a per-create DB read for the case `X-Identity` is absent AND the message is review/questionnaire. This is a test-affordance leaking into production. The page should always send `X-Identity`; alternatively, require `senderId` in the create body. Removing it deletes the helper and the `agents` import in the create path.

### W4. `routes/threads.ts:107-116` — `err()` wrapper saves zero lines
`err("validation_error", "Invalid JSON", 400)` then `c.json(e.body, e.status)` is the same shape as `c.json({ error: "...", code: "..." }, 400)`. The wrapper is used 9 times and saves no characters; meanwhile `zodErrorToBody` (line 485) returns a different shape and bypasses it, so the abstraction is already inconsistent.

### W5. `services/policy-engine.ts:108-113` — review-message lookup discards the index
```ts
db.select().from(messages).where(eq(messages.threadId, item.threadId)).all().find((m) => m.type === "review");
```
Loads every message in the thread to JS just to find the first review. Add `eq(messages.type, "review")` to the WHERE and `orderBy(desc(createdAt)).limit(1)` to use the `messages_thread_id_idx`. Same anti-pattern at `routes/conversations.ts:262-266`.

### W6. `routes/agents.ts:154-170` and `skill-tools/read-inbox.ts:26-45` — JS-side participant filter on every inbox read
Both pull `limit*4` (or unbounded) rows then `JSON.parse(participants).includes(agentId)` in JS. The `@lore L1a` comment in `read-inbox.ts:21-26` already flags "future story may project a participants table" — this is acceptable for L1a but the linear-scan fallback in `routes/threads.ts:158-172` (no `.limit()` at all on the DB-side; whole-table scan) is a production landmine the moment threads count crosses ~10k.

### W7. `routes/threads.ts:225-228` — server force-adds sender to participants on create
`participants = input.participants.includes(senderId) ? input.participants : [...input.participants, senderId]`. The Zod schema allowed any participant list; the route silently mutates it. Either reject with 400 or document this as the contract. Today a caller can pass `participants:[A]`, get a thread with `[A,sender]`, and never see a warning.

### W8. `services/builtin-routines.ts:303-343` — `testResetRequested` is module-level mutable test state in production code
The hidden flag is consumed silently inside `writeStoredLevel`. Tests should inject a clock/state via a parameter or use a shadowed DB row, not flip a module global. This couples the prod path to a test detail.

### W9. `design-system/src/ThreadShell.tsx:67-71` — `[...messages].sort()` on every render
Messages arrive sorted DESC from the API (`routes/threads.ts:195`), then ASC-reversed twice (route line 199, ThreadShell line 67). Pick one canonical order at the API boundary; let the consumer trust it. Today every render allocates a new array and re-sorts.

### W10. `design-system/src/ThreadShell.tsx:90-126` — error-state JSX is nearly the entire success-state JSX duplicated
The error branch re-renders `ThreadHostBanner` with `blocking={false}, resolved=…, pinned=…, participants=…` and an `<ErrorState>`; the populated branch does the same plus the rest. Extract the banner once or render `<ErrorState>` inline in the populated tree. Today the duplication means a change to the banner contract has to be made twice.

### W11. `design-system/src/ThreadHead.tsx:18-19` — `onPromoteArtifact` and `onVerdict` props that are destructured-but-never-used
`ThreadHead` accepts `onPromoteArtifact` and `onVerdict` in its prop type but only renders the artifact slot and the resolved-verdict label. The two callbacks have no consumer in `ThreadShell`. Delete until a caller exists.

### W12. `design-system/src/Composer.tsx:25-30` — `generateClientKey` fallback is dead code in any modern runtime
`crypto.randomUUID` is on `globalThis.crypto` in every browser the project supports (Vite's baseline), Bun, and Node 18+. The `Math.random` fallback is "just in case" complexity for a contingency that does not exist in the test/CI matrix.

### W13. `services/handoff-protocol.ts:230-238` — re-throws the same "must specify one of" check that ran 150 lines earlier
Lines 81-83 already validated `params.toHuman || params.toAgent || params.toRole`. The else-branch inside the transaction re-throws the identical message because TS narrowing is lost across the closure. Annotate the params type with a discriminated union (`{ toAgent: string } | { toRole: string } | { toHuman: true }`) and the second guard disappears.

### W14. `routes/agents.ts:176-240` and `skill-tools/send-message.ts:31-65` — direct-thread reuse logic copy-pasted
Both look up `host_kind='agent', host_id=recipient`, JSON-parse `participants`, find the 2-person thread with both ids. Same loop, slightly different variable names, two failure modes if either drifts. Either consolidate behind a `findOrCreateDirectThread(db, a, b)` helper, OR (simpler) only one of these endpoints needs to exist post-L1 — the skill-tool already calls into the route's authz layer in every other tool. Pick one.

---

## SUGGESTIONS

### S1. `shared/src/thread.ts:152-169` — `classifyThreadConfiguration` is documentation-only
The doc comment explicitly says "never persisted." If it is used only by docs/concept anchors, move it out of the runtime export and into a doc snippet. Today it is exported, gives the impression of a runtime classifier consumers should call, and the only call sites are tests.

### S2. `shared/src/thread.ts:146-148` — `exhaustiveAssert` is a one-liner
`function exhaustiveAssert(value: never): never { throw new Error(...) }` is a single use in `message-types.test.ts`. Inline the throw in the consumer; the export is heavier than what it replaces.

### S3. `routes/threads.ts:485-491` — `zodErrorToBody` only branches on one path-key
Special-cases `clientKey` for a custom error code, otherwise returns generic. If clientKey is the only one, inline the check at the use-site. If more are coming, keep it. Today the abstraction is one if-statement.

### S4. `routes/threads.ts:122-178` — three-branch list query splits the same select+orderBy+limit shape
The `host_kind && host_id`, `host_kind`, and `participant_id` branches differ only in WHERE. Build the WHERE as a `SQL` fragment and run one query. Saves the participant-scope's full-table-scan-then-filter (W6).

### S5. `design-system/src/ReviewVerdictBar.tsx:35-52` — three `ReadonlyArray<ButtonSpec>` arrays mapped with identical JSX
The map is repeated 3× with the same `<button>` chrome. If C1 lands and only the 5 binding verdicts remain, this becomes one map.

### S6. `services/ws-broadcaster.ts:18-72` — 10 individual `unsub` variables threaded into `unsubscribers.push(...)`
A trivial `unsubscribers.push(eventBus.on(...))` per subscription removes the named locals (`unsub1..unsub10`) and the trailing `.push(unsub1, …, unsub10)` block.

### S7. `routes/conversations.ts:16-27` — `VERDICT_ACTIONS` literal duplicates `VERDICT_DECISIONS` from `@hyperidle/shared`
The 10-item action list overlaps the 5-item decision list plus the 5 dead actions from C1. Once C1 lands, this collapses to `z.enum(VERDICT_DECISIONS)`.

### S8. `web/src/pages/ConversationsReview.tsx:60-63` — refresh by re-fetching the entire thread after every append
Every send triggers `fetch(/api/threads/:id)` and replaces the whole detail object. The append response already returns `{ message, thread }`; merging it locally avoids the second round-trip and the visible flicker. Defer if WebSocket landing in L1b makes this moot.

---

## VERDICT

**SIMPLIFY** — 2 criticals (C1: 10 dead UI buttons; C2: dual write-path to verdicts) plus 14 warnings worth a focused half-day of pruning.

**Top 2 simplifications worth doing first:**
1. **C1 — kill the 5 dead `VerdictGrammarAction` buttons** in `ReviewVerdictBar.tsx` plus `ThreadHostBanner.onMoreActions`. Removes a UX trap (rendered, clickable, no-op) and saves ~30 LOC. Concept-aligned: only the 5 binding verdicts are spec'd for L1.
2. **C2 — delete the legacy `/api/conversations/responses` write path and its read-side projection**. The L1 router (`routes/threads.ts`) has authz, idempotency, and re-open semantics; `conversations.ts` has none. One canonical surface, one set of invariants.

Total findings: **2 CRITICAL · 14 WARNING · 8 SUGGESTION**.
