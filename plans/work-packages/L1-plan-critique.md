# Architecture Critique: L1

**Score: 8/10** (SA:9 LI:8 AC:9 DM:8 N:8 MD:8 FMC:9 S:6 V:9)

Reviewed: `docs/work-packages/L1-plan.md` (1250 lines, post-Phase-4 adversary revision).

## Verification of advertised fixes

| Fix | Advertised | Verified |
|---|---|---|
| C1 — `verdict` closure as T0 | T0 in §13 + Q3.1 in §1 | YES — §13 T0 lists 5 doc anchors; §3 AC-1 verifies them |
| C2 — migration step ordering + `legacy_item_id` | §5.3 reordered; §5.1 col added | YES — step 5 (type-backfill) precedes step 7 (verdict synthesis); `legacy_item_id` defined in §5.1 line 375 + commented in §5.1 lines 422-432 |
| C3 — protected list cleanup + T17 | §16 removed; T17 added | YES — §16 "Removed from protected set" paragraph; T17 in §13 |
| C4 — verdict authorization | §6.1 subsection + §11 row + §9 tests | YES — three rules (a)(b)(c); §11 row "verdict-typed message"; tests in §9 |
| C5 — re-open semantics | §6.1 subsection; no separate endpoint | YES — atomic clear of `resolvedAt` + `thread_reopened`; no POST /reopen |
| M1 — clientKey Zod | §6.1 + §11 + §9 tests | YES — `z.string().min(8).max(128)` + regex; cross-sender test |
| M2 — PG FK-drop + JSONB→TEXT | §5.4 expanded | YES — explicit constraint names; `responses` table FK drops itemized |
| M3 — L1a/L1b split | §15 rewritten | YES — L1a ~7d, L1b ~2d; named boundary; T14/T15 deferred |
| M4 — daily-digest + policy-engine | §10 + T8 + T8.5 | YES — both services listed; T8.5 added with own deps |
| M5 — WS subscribe protocol | §6.2 expanded | YES — subscribe/unsubscribe JSON; authz-on-subscribe; ack message |

All ten advertised fixes are present and substantive. **No advertised fix is missing.**

## Codebase verification (CC-007)

Spot-checks against real code:

| Claim | Verified |
|---|---|
| `packages/db/src/schema.ts` `threads.kind` + `messages.recipient_id`/`subject`/`body`/`file_lease_ids` exist | YES — schema.ts lines 167-194 |
| `packages/db/src/schema.pg.ts` no `jsonb` import; `participants: text` | YES — lines 1, 166 |
| `services/policy-engine.ts:104` writes `db.insert(responses)` | YES — line 1 imports `responses`; line 104 inserts |
| `services/daily-digest.ts` reads `responses` table | YES — lines 1, 33-44 |
| `web/src/components/ThreadSections.tsx` `ThreadItem.kind: 'review' \| 'chat'` | YES — line 16 |
| `web/src/__tests__/ThreadSections.test.tsx` + `ThreadRow.test.tsx` exist | YES |
| 7+ callers of `threads.kind` in test fixtures (cost-cap, agents, rail, ws-broadcaster, daily-digest, conversations…) | YES — at least 14 grep hits |

The plan's "current bug" claims line up with the codebase. No phantom file paths.

---

## CRITICAL

(none — all five advertised criticals were applied and the fixes are sound.)

## WARNING

- **[plan §13 T8 deps + T8.5 timing]** T8 lists "T8 Legacy reader fixes (incl. daily-digest rewrite)" with deps `T3, T4` only, but the daily-digest rewrite needs the **`legacy_item_id`** column populated AND the verdict-message backfill (§5.3 step 7) complete to LEFT JOIN against `messages.legacy_item_id`. If T4 only covers steps 8-11 (drop), the join target may not be backfilled by step-5/7 timing inside T3 vs T4. → **Fix:** clarify in T8's "Deps" line that T8 must run after migration step 7 (verdict backfill) — i.e., after the full T4. Already implied, but the T3/T4 split as written ("steps 1-7" vs "steps 8-11") doesn't tell the implementer that step 7 is *inside* T3, which contradicts the §13 T3 line ("steps 1-9 of §5.3") versus the §15 effort table ("T3 Schema + up-migration (steps 1-9)"). The §5.3 numbered list has 11 steps; T3+T4 must partition them unambiguously. As written, T3 owns steps 1-9 and T4 owns 10-11 — **but the §13 T4 line says T4 owns "Steps 8-10 of §5.3 (verdict backfill, drop legacy columns, drop responses)"** which contradicts T3 owning step 7. → Resolve the T3/T4 step ownership in §13 to match §15.

- **[plan §6.4 / §10 / T9]** `routes/conversations.ts` legacy `POST /api/conversations/responses` is described as "deprecated and replaced" but T9's resolution is "internally append a `verdict` message via the repo layer". The plan does NOT specify what authorization model the legacy endpoint enforces during the deprecation window. If the legacy endpoint silently bypasses the new C4 verdict authorization rule (founder-only + can't-self-verdict), it becomes a covert privilege-escalation path. → **Fix:** add a §11 row stating "legacy `POST /api/conversations/responses` enforces the same verdict authorization as the new endpoint; rejected callers receive 403 with the same code". Add an integration test in §9.

- **[plan §6.2 / §11]** WS subscribe authorization is solid for `thread:<id>`. But the plan also says "the existing topics (`'conversations'`, `'work'`, `'rail'`) keep their current behavior: any authenticated user may subscribe (they are global feeds; per-row authorization is applied by the server when constructing the broadcast payload)". The `thread_created` event emits on `'conversations'` topic and **carries the new thread's id + host context in the payload**. A non-participant subscribed to `'conversations'` would see thread-creation events for threads they cannot read. → **Fix:** clarify whether `thread_created` payload on the `'conversations'` topic strips host_id/host_kind for non-participants, or whether per-recipient filtering is applied at broadcast time. Currently silent.

- **[plan §13 T17 + protected tests]** T17 rewrites `ThreadSections.test.tsx` + `ThreadRow.test.tsx` — but `ThreadSections.tsx` itself has internal logic (`classifyThread`, `groupBySection`) that depends on the `kind: 'review' | 'chat'` literal. The plan says "rewrite the components to consume it directly" but does not specify the new classifier (which thread surfaces in 'reviews' vs 'chats' section now that `kind` is gone). The natural answer is `headCollapsePredicate(messages).headMessageId !== null && head.type ∈ {review, questionnaire}` ⇒ reviews; else ⇒ chats. **Fix:** spell this out in T17, or push it to L8 with a §14 risk row noting that L1a leaves ThreadSections rendering all threads in one bucket until L8.

## SUGGESTION

- **[§4 / §15.E participants storage]** Decision E (JSON column) acknowledges `participant_id` filter does a linear scan. With Postgres + TEXT, this means `LIKE '%<id>%'` per row, which is unindexable AND incorrect (substring match across UUIDs that happen to share prefixes). The §4 type comment says "sorted lexicographically" — server-side query needs JSON parsing, not LIKE. → Spell out the query strategy: parse JSON in app layer per row OR add a generated column. Otherwise the `participant_id` query path is silently correct-only-by-luck.

- **[§5.5 indexes]** `messages_unresolved_idx (thread_id, resolved_at)` is described as "partial-index-friendly". Drizzle SQLite syntax for partial indexes is `WHERE resolved_at IS NULL` — not stated. The composite `(thread_id, resolved_at)` indexes ALL rows; the partial form is what makes the unresolved-scan cheap. → Either declare the partial index explicitly or drop the "partial-index-friendly" claim.

- **[§8 / T13]** ConversationsReview.tsx integration mentions reusing `ReasoningBlock` inside `ThreadHead`. `ReasoningBlock` is a web-side component, but `ThreadHead` ships in `@hyperidle/design-system`. Cross-package import direction (DS → web) is wrong. → Either move `ReasoningBlock` into the design system, or have `ThreadHead` accept a `reasoningSlot: ReactNode` prop and let the page pass `<ReasoningBlock>`. The current phrasing implies the wrong direction.

- **[§13 T11 / §15 effort]** "T11 DS components — SIX (6 × ~1h impl + ~1h test/story = 12h)" feels light per-component. ThreadShell alone has 7 states from approved.md §4 plus scroll-position memory plus sticky behaviors. A more realistic blend is 2-3 cheap (HostBanner, CommentRow, Composer) + 3 expensive (ThreadHead, ReviewVerdictBar, ThreadShell). → Worth flagging as a §14 risk row.

- **[§15 Path X recommendation]** The plan picks "Path X" (accept ~7d for L1a) but the story header says "L (~5d)" in TRACK-L. The plan recommends updating the effort label but does not commit to which document does the update. → Add this as an explicit deliverable in T1 (concept-doc verification) or a new task before T0.

- **[§4 type signatures]** `Message.resolvedAt` is on `BaseMessage` and applies "only to review/questionnaire — null elsewhere". This is a documentation-only invariant; the type system does not enforce it (a `plain` message can carry a non-null `resolvedAt` without TS complaint). Consider moving `resolvedAt` into the per-type variants (only `review` and `questionnaire` carry it) for honest naming and type-level enforcement.

- **[§9 migration test]** The migration test fixture exercises one review with a response, one chat without. Recommend adding: (a) a thread with TWO sequential reviews (verify only the most recent's `resolvedAt` is set if both have responses); (b) an `items` row with NO matching `messages` row in the same thread (orphan items — the audit query says count must equal 0 but the migration's fallback path should be exercised).

- **[§6.3 streamId == threadId]** Per-stream-ordering keyed by threadId is fine for thread events, but `thread_created` carries `streamId = threadId` of a *brand-new* thread with no prior events. Consumers tracking per-stream highwater marks initialize the stream from this event — ensure the the canonical-shapes contracts under docs/ per-stream-ordering contract supports this initialization step.

## What's Working Well

- **Q3.1 closure rationale is exemplary.** The plan recognizes that the Phase-4 fix (adding `verdict` to the closed enum) is itself a concept-doc rule violation if it's not also a doc update, and lands T0 *before* T2 (shared types) so the implementation order honors the §4.5.8.5 "concept-first" rule. This is the kind of meta-aware reasoning that prevents silent rule-breaking. The architecture-critique rubric explicitly tests for "naming honest, no shadowing closed vocabulary" and "spec alignment" — Q3.1 + T0 score full marks on both.

- **The C2 fix is a genuinely better design, not a patch.** Adding `legacy_item_id` as an explicit migration-only audit column with a documented closure rule (NULL for new rows, NOT NULL for migration-generated rows, eligible for drop in a follow-up cleanup story) gives the migration a deterministic backbone instead of relying on `items.id == messages.id` coincidence. The pre-migration audit query (`SELECT count(*) FROM responses LEFT JOIN messages ON messages.legacy_item_id = responses.item_id WHERE messages.id IS NULL = 0`) makes the migration self-validating. This is the right shape — and the column-comment commentary (§5.1 lines 422-432) prevents future agents from confusing it for a foreign key.

---

## Verdict

**PASS** — score 8/10, every dimension ≥6.

Top 2 working-wells:
1. The T0 / Q3.1 concept-first closure handling (turning a Phase-4 fix into a meta-aware rule application).
2. The `legacy_item_id` migration backbone with the audit query and documented column closure rule.

Outstanding warnings (T3/T4 step ownership ambiguity, legacy `POST /responses` authz silence, `'conversations'` topic broadcast filtering, T17 classifier spec) are non-blocking — fix during `/write-tests` or capture as `@lore` notes.

Proceed to `/write-tests`.
