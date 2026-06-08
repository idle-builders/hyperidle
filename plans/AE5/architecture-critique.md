# Architecture Critique: AE5 — Communication Refinements

ARCHITECTURE-SCORE: 8/10  rounds=1  score-line: SA:8 LI:9 AC:7 DM:9 N:9 MD:8 FMC:7 S:8 V:8

---

## Scoring Breakdown

### 1. Spec Alignment — 8/10

The four ACs from the workpackage map to plan tasks:

| AC | Plan task(s) |
|---|---|
| "Users can @mention a specific participant, and the mentioned user receives a notification" | Tasks 1, 2, 4 (MentionRef type, parsing utils, server resolution + participant add) |
| "@mentions are a recognized inline element within the block primitive" | Tasks 1, 6 (MentionRef in InlineRef union, CommentRow rendering) |
| "Within conversations, a user can see and navigate to the thread's host context" | Tasks 5 (hostTitle), 8 (context link in Conversations header) |
| "Agent presence is visible — whether currently in an active session or idle" | Tasks 5 (identity extension), 7 (presence dots in ThreadHostBanner + ThreadRow) |

Coverage is complete. No AC is missing a corresponding task.

Scope creep check: Task 5 includes both identity extension (for presence, maps to AC4) and hostTitle resolution (for context link, maps to AC3). Both are needed. Thread-list presence was considered and explicitly deferred (§5.4) -- good discipline. The plan does not invent requirements.

Minor gap: the validation scenario "Given participant A @mentions participant B, then B receives a notification" maps to Task 4, which specifies the participant-addition mechanism. But the "notification" is defined as "thread appears in B's Conversations." The plan does not explicitly verify this end-to-end (that the Conversations page query picks up threads where the user is in `participants`). This is an existing feature of the thread list query, so no new code is needed, but the plan should note this dependency rather than assume it.

### 2. Layer Integrity — 9/10

Layer discipline is clean:
- `packages/shared` gets pure types and pure functions (MentionRef, mention parsing/segmentation). No DB, no HTTP, no React.
- `packages/server` gets server-side resolution (buildMentionLookup, identity extension, hostTitle queries). Database access stays in the server layer.
- `packages/design-system` gets rendering components (MentionToken, PresenceDot). No data fetching.
- `packages/web` gets wiring (host-route resolution, thread detail hook extension, Conversations page integration).

No cross-layer violations detected. The `segmentMentions` utility in shared is correctly positioned -- it's a pure text transformation usable by both server (for future server-rendered previews) and the client renderer.

### 3. API Contracts — 7/10

The plan extends the `GET /api/threads/:id` response with two new fields:
- `hostTitle?: string | null` -- nullable, documented per host kind.
- `identities[id].isAgent?: boolean` and `identities[id].operationalStatus?: AgentOperationalStatus` -- optional fields, backward compatible.

The `POST /api/threads/:id/messages` request body is unchanged (client sends raw `@name` text in `payload.text`). The response body implicitly includes the enriched `MentionRef` entries in `payload.refs[]` after server resolution. This is correct -- the API shape doesn't change for the client sending messages, only for the stored/returned payload.

Findings: the plan does not specify the exact response shape of the extended identities. It gives the TypeScript type signature for `buildThreadIdentities` but does not document the JSON wire shape (e.g., is `operationalStatus` a string literal from the `AgentOperationalStatus` union?). For a v1 internal API this is acceptable but slightly loose.

The `mentionRefSchema` Zod addition (§2.4) is well-specified with field-level constraints (`identityId: z.string().min(1)`, `displayName: z.string().min(1)`).

### 4. Data Model Alignment — 9/10

Zero new DB migrations, zero new tables, zero new columns -- confirmed and correct. The plan leverages existing schema:
- MentionRef stored in `messages.payload` JSON (the `PlainPayload.refs[]` array).
- Participant additions in `threads.participants` JSON column.
- Agent operational status derived from existing `sessions` table.
- Host title resolved from existing entity tables (`bets`, `tasks`, `knowledgeItems`).

The `InlineRef` union extension from 2 to 3 members is backward compatible -- existing persisted data with `EntityRef` or `BlockRef` entries will still parse through the updated `inlineRefSchema` discriminated union.

### 5. Naming — 9/10

Names are honest and precise:
- `MentionRef` follows the established `EntityRef`/`BlockRef` pattern.
- `extractMentionCandidates` / `resolveMentions` / `segmentMentions` -- clear pipeline stages.
- `buildMentionLookup` -- describes what it builds.
- `PresenceDot` -- exact visual element name.
- `resolveHostRoute` -- maps (hostKind, hostId) to a route path.

No conflicts with existing vocabulary. "Mention" is a new term consistent with the concept's vocabulary table. The concept explicitly prohibits "tag", "ping", "at-mention", "notification" as aliases.

### 6. Module Depth — 8/10

The `mention.ts` module in shared exposes three functions and three interfaces for a complete mention pipeline (extract, resolve, segment). This is a cohesive module with a small surface hiding reasonable complexity (regex parsing, name resolution, text segmentation).

`resolveHostRoute` is a leaf utility with one job. Shallow but appropriate -- it's a mapping function, not a module.

The `buildMentionLookup` function in the server is scoped correctly. It builds the name-to-identity map used by `resolveMentions`. The plan specifies team-wide resolution scope with a `@lore` comment explaining why -- good depth.

Minor concern: `segmentMentions` in shared takes `ReadonlyArray<InlineRef>` (the full refs array) and must internally filter for MentionRef entries. This means it accepts a wider type than it needs. A narrower signature taking `ReadonlyArray<MentionRef>` would be more honest, with the caller doing the filter. But the current signature avoids requiring every caller to pre-filter, which is a reasonable convenience.

### 7. Failure-Mode Coverage — 7/10

Covered:
- Unknown `@name` tokens: left as plain text, no error (concept hard rule #4).
- Self-mention: suppressed as participant-addition no-op (concept hard rule #3).
- Name conflicts (two users named "Aria"): first-match-by-id determinism, documented in risk register.
- Orphan thread host (entity deleted): context link renders raw hostId.
- Operational status query failure: no dots render (graceful degradation).

Missing or underspecified:
- **Rate limiting on mention fan-out.** A message with 50 `@name` tokens would attempt 50 name resolutions and potentially 50 participant additions in one transaction. The plan does not specify a cap on mentions per message. The concept says "0..N mentions" with no upper bound. A cap (e.g., max 20 mentions per message) would prevent abuse and bound the transaction size.
- **Transaction size for participant addition.** The plan says "inside the transaction: update `threads.participants` if new participants were added." For a message with many mentions resolving to new participants, this is a single JSON column update. The risk is low but the plan should note the O(n) nature of the participant array update.
- **Security: no trust boundary validation on `@name` tokens.** The regex `(?:^|\s)@(\S+)` will match `@<script>alert(1)</script>` as a mention candidate. The resolution step (lookup in name map) will fail to find it and drop it as unresolved. But the raw text is still rendered -- this is the existing behavior for all message text, relying on React's default escaping. The plan should note that mention rendering does not introduce new XSS vectors because React escapes rendered text.

### 8. Simplicity / Over-Engineering Risk — 8/10

The plan is disciplined about scope:
- No client-side autocomplete (deferred).
- No thread-list presence (deferred to follow-up).
- No block-level mentions (concept explicitly defers this).
- No group mentions (concept hard rule #4).
- No separate notification primitive.

The trade-off analysis (§10) addresses three genuine design decisions with honest comparisons. No straw-man alternatives.

The `MentionCandidate` / `ResolvedMention` / `MentionSegment` type chain in `mention.ts` is three types for a three-stage pipeline. Each type adds information to the previous stage's output. This is not over-engineered -- it's a correctly typed pipeline.

One area of mild concern: the plan includes `sourceText` on `ResolvedMention` and uses it in `segmentMentions`, but the `MentionRef` type (§1.1) does not include `sourceText`. This creates a gap in the data flow -- either `sourceText` needs to be on `MentionRef` (so the renderer can match text) or the renderer must reconstruct it from `@{displayName}` (which works when the user typed the display name exactly, but not when casing differs). This is a design inconsistency, not over-engineering.

### 9. Verifiability — 8/10

Each task has a concrete test file path and acceptance description. The plan lists 6 new test files plus extensions to 2 existing test files. Test-first ordering is maintained (tasks are ordered by dependency, each is "independently testable").

Task 4 has the most specific acceptance criteria: "a message with `@AgentName` results in the mentioned agent being added to `thread.participants`" and "the returned message payload contains a MentionRef in `refs[]`." These are directly testable assertions.

Task 6 specifies Storybook stories as a deliverable (`.stories.tsx`). This satisfies the design system rule that every component change has a story.

Missing: no protected-tests list. For a workpackage that modifies `InlineRef` (a shared type used across the codebase), the plan should enumerate which existing tests must NOT break -- at minimum the T4 InlineRef tests, the L1 thread schema tests, and any switch/exhaustive-check sites. The risk register mentions "grep for `kind === "block"` and `kind === "knowledge_item"`" but doesn't formalize this as a protected-tests checklist.

---

## CRITICAL

- [plan §1.1 vs §1.4 and §4.1] **MentionRef is missing `sourceText`.** The `MentionRef` interface in §1.1 has `{ kind, identityId, displayName }`. But §1.4 says `segmentMentions` matches `MentionRef.sourceText` occurrences in the text. The concept's essential properties list `sourceText` as a property of Mention ("Preserved for round-trip fidelity"). The type must include `readonly sourceText: string` so the renderer can locate the exact text spans to highlight -- matching by `@{displayName}` alone fails when the user typed a different casing or partial name that resolved to the same identity.

## WARNING

- [plan §7, Failure-Mode Coverage] **No cap on mentions per message.** A single message with 100 `@` tokens would trigger 100 name lookups and potentially 100 participant additions. Add a constant (e.g., `MAX_MENTIONS_PER_MESSAGE = 20`) and truncate candidates after extraction. This bounds the transaction size and prevents abuse.

- [plan §9, Verifiability] **No protected-tests list.** Widening `InlineRef` from 2 to 3 members will break any exhaustive switch on `InlineRefKind`. The plan's risk register acknowledges this but does not enumerate the specific test files and switch sites that must be verified. Add a protected-tests block listing: (1) existing InlineRef narrowing tests in shared, (2) `renderRefEmbeds` filter in Conversations.tsx, (3) any switch on `ref.kind` in CommentRow or ThreadShell.

- [plan §3.2] **hostTitle resolution N+1 risk.** The plan shows a per-host-kind switch with individual queries (`db.select(...).from(bets).where(...)`, etc.). For the thread detail endpoint (one thread at a time), this is a single query -- acceptable. But the code pattern invites copy-paste into list endpoints where it would become N+1. Add a `@lore` note warning that this pattern is thread-detail-only and must not be used in list contexts.

## SUGGESTION

- [plan §5.2] The plan says "extract [PresenceDot] to a shared `PresenceDot.tsx` within the design-system" but then opts for "inline duplication is acceptable for 2 consumers." With ThreadHostBanner and ThreadRow both rendering identical 6px dots, extracting a 10-line component now avoids the inevitable extraction later and keeps the two renderings provably identical. The component is small enough that the cost of extraction is near zero.

- [plan §10.2] The regex `(?:^|\s)@(\S+)` will greedily match trailing punctuation: `@Aria,` becomes candidate `Aria,`, `@Aria.` becomes `Aria.`. The plan should specify whether the regex strips trailing punctuation or whether the name lookup handles it. The concept's resolution rule says "Unknown `@name` tokens are left as plain text" -- so `@Aria,` failing to resolve because of the trailing comma would be a UX friction point.

- [plan §2.1] `buildMentionLookup` query scope is "all users where `teamId IN (...)`." The plan should verify that the `users` table has a `teamId` column and document what happens for users not assigned to any team (if the system allows that).

## What's Working Well

- **Zero migrations, zero new events.** The plan achieves all four ACs by extending existing JSON payloads (MentionRef in `refs[]`), existing columns (`threads.participants`), and deriving data at query time (operational status, host title). This is the minimal-infrastructure approach and it is correct.

- **The server-side mention resolution architecture is clean.** Extract candidates (pure) -> resolve against name map (pure with lookup) -> enrich payload + add participants (transactional). Three distinct stages, each independently testable. The concept's hard rules (server-authoritative, atomic with message write, self-mention suppression) all have clear implementation points in the plan.
