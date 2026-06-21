# AM1 — Code Review (Phase 4)

Reviewer, Phase 4. Branch `design/AM1-conversation-experience`, PR #344, vs `origin/main`.
Gates verified live: `npm run check` PASS (13/13), `npm run lint` PASS (0 errors, warnings only), 82 AM1 tests PASS, AC5 lint rule fires as **error** on a planted `Message` import, snapshot floors bumped +2 (61/60).

---

## Verdict on the four judgment calls I was asked to rule on

1. **"Verdict flow is unaffected" reconciliation — LEGITIMATE.** The AM track AC reads "verdict flow is unaffected" and the validation scenario reads "verdict flow is unaffected" alongside "all message types remain correct and reachable." The locked design §5 explicitly removes inline Approve/Reject ("NO inline decision … the decision is made on the review page"). The plan's reading (§12.9) — verdict *semantics* unchanged (Message `verdict` type, `VerdictPayload`, `verdictDecisionLabel`, resolves-relationship, `ReviewResolvedPart` echo, POST shape all byte-identical; only the decision *UI* relocates) — is the correct reconciliation. The AC governs the data/echo flow, not the affordance location, and the founder approved the relocation. The verdict echo path is intact and tested (`AM1-part.test.ts:329`). **Not a violation.**

2. **The two gaps.**
   - **`betId: ""` — AM1 DEFECT (must-fix), not the AM5 boundary.** `derivePartsFromMessages` hardcodes `reviewTarget: { betId: "", reviewId: message.id }` (`part.ts:285,315`). `ReviewPayload` carries no `betId` (`thread.ts:195`), so the *adapter* genuinely cannot source it — and it correctly must not (it is source-agnostic; reaching for thread/bet context would break AC5). **But the PAGE can and does have it.** `Conversations.tsx` already holds `data.thread.hostKind`/`data.thread.hostId` and resolves `hostRoute` from them (`Conversations.tsx:321`); a task/bet-hosted thread's host context is the bet identity. The defect is architectural placement: the betId must be sourced at the page boundary (where thread→bet context exists) and threaded into the OpenTarget, not fabricated as `""` in the source-agnostic adapter. Shipping `/work/bet//review/:id` is a broken link — `resolveHostRoute` is not even involved (review route is built directly in `open-handler.ts:40` as `/work/bet/${target.betId}/review/${target.reviewId}`), so `betId:""` yields a literal double-slash path that matches no real bet. Design §6/§8 scope *standardization* of routing to AM5, but a *correct betId for the existing route* is AM1's own wiring (§12.4 names "the existing, real ReviewPage" as the destination — a malformed path does not reach it). **Must-fix.**
   - **`ReviewPage.handleSubmitVerdict` no-op — OUT OF AM1 SCOPE (confirmed).** `ReviewPage.tsx:148-150` is an AL3 stub ("wiring to the thread API is out of scope"). This is the AL track, pre-existing, untouched by AM1. Correctly not an AM1 defect. **End-to-end implication noted in finding ADV-1.**

3. **Capability regression — REAL, cross-track merge-sequencing concern (not an AM1 code blocker).** AM1 removes the previously-working inline-verdict dispatch (`Conversations.dispatch.test.tsx` deleted; the verdict POST branch removed from `onAppend`). Combined with gap 2b (`ReviewPage` verdict is a no-op) AND gap 2a (the "Open review" link is malformed), there is a release window where a user **cannot approve anything**: not in the conversation (removed), not on the review page (no-op), and cannot even *reach* the review page (broken betId). This is correct per each track's scope in isolation, but the *merged product* regresses a working capability. **Recommendation: this is a founder merge-sequencing call, not an AM1 rewrite** — AM1 honored its locked design. BUT the malformed-betId (gap 2a) is independently a must-fix because even once AL3 wires the verdict, the conversation cannot route to it. Fix 2a in AM1; sequence AL3-verdict-wiring before treating verdict-taking as restored.

4. **AC5 reuse boundary — VERIFIED REAL, not prose.** Planted a `Message` import into `parts/UnknownPart.tsx` and ran whole-project `npx eslint .`: it fired `error … 'Message' import from '@hyperidle/shared' is restricted. AM1 W1 …`. The rule (`eslint.config.ts:933-979`) is correctly placed LAST (flat-config replace semantics), bans `Message/InlineRef/EntityRef/BlockRef/MentionRef` named imports + `thread*`/`harness` path patterns, and restates the api-fetch ban. The two-adapter proof is executable, not prose: `AM1-source-agnostic.test.ts` constructs `Part[]` from both `derivePartsFromMessages` and the `derivePartsFromSession` stub and merges them into one `Part[]` with no cast (the type-level half) plus shape assertions (the runtime half).

5. **Slop / simplification — deferred composer is HONEST; empty-betId path is a DEAD-END.** The "+" menu items are visible-but-inert (`ConversationSurface.tsx:226`, `InsertMenu.onPick` just closes). Nothing fakes a capability — the menu opens, an item closes it, no false success, no fabricated chip. §12.6 documents this as the honest minimum (send works; rich-compose deferred). **Acceptable.** The empty-betId path, by contrast, is a graceless dead-end (broken nav), covered separately as ARCH-1.

---

## Lens 1 — Architecture

**CRITICAL**

- **ARCH-1 — `betId: ""` produces a malformed review route.** `part.ts:285` and `part.ts:315` hardcode `betId: ""`. `open-handler.ts:40` builds `/work/bet/${betId}/review/${reviewId}` → `/work/bet//review/:id`. The destination `ReviewPage` route is `/work/bet/:betId/review/:reviewId`; an empty betId segment yields a path with no valid bet, so "Open review"/"View review" navigate to a dead URL. The fix is to source betId at the PAGE boundary (it has thread→host context) and thread it through the OpenTarget, keeping the adapter source-agnostic. Plan §12.4 names "the existing, real ReviewPage" as the destination — a malformed path contradicts that. (Cross-ref: this is gap 2a; the test that "covers" Open review only asserts `lastPath.toContain("/work/bet")`, which a double-slash path satisfies — see ADV-2.)

**WARNING**

- **ARCH-2 — `resolvedBy` carries a message id, rendered as a person.** Resolved branch sets `resolvedBy: verdict ? verdict.resolvesMessageId : author.name` (`part.ts:291,313`). `ReviewResolvedPart.tsx:46` renders `… by {part.resolvedBy} …`, so a verdict-resolved review echoes "**Approved** by rv2 · …" — a raw message id where the design §5 contract is "✓ **Approved** by A. Founder · …" (a person). `VerdictPayload` has no actor field, but the verdict *message* has a `senderId` (the resolver) that the adapter already iterates; `resolvedBy` should be the resolver's resolved author name (via `resolveAuthor(verdictMessage.senderId, …)`), not `resolvesMessageId` (which is the id of the message being resolved — semantically the wrong field entirely). The `AM1-part.test.ts:351` resolved test asserts only `label`, never `resolvedBy`, so this is unguarded.

**OBSERVATION**

- **ARCH-3 — `entity-ref` of `task`/`bet` renders with the `block` chip kind/icon.** `embeds.tsx:60` maps any non-knowledge entity-ref to `kind="block"`. A task or bet reference therefore shows the block (stacked-lines) glyph. `ReferenceChipKind` is `artifact|image|knowledge|block` — no task/bet kind exists, so this is within the locked DS budget, but the icon lies mildly about the referent. Acceptable for AM1 (the chips still route correctly to the host surface); note for a future ReferenceChip kind expansion. Not a defect.
- **ARCH-4 — Layer integrity intact.** Human-Interface-only; no Meta/Runtime reach. Adapter in `shared`, renderer in `web` importing only `Part`. No Thread/Message/verdict schema change (concept hard-rule 5 honored). Docs updated in-PR (`docs/human-interface-layer/part-model.md` added, index + thread-primitive cross-referenced). No stale doc found.

---

## Lens 2 — Design

**WARNING**

- **DES-1 — `QuestionnairePart` selection is an inert affordance with a real pressed state.** `QuestionnairePart.tsx:23` holds local `selected` state; clicking an option sets `aria-pressed` and a filled style but posts nothing (comment: "answering is not wired to a backend in AM1; the selection is a visual affordance only"). This is *less* honest than the composer "+" menu: the option visibly latches into a selected state, which reads as "your answer was recorded" when nothing was recorded. Action→feedback expectation is violated — a user will believe they answered. Either remove the latching pressed-state (hover-only, no persistent selection) or document the inert state visibly. Compare the composer, which fakes nothing. (Note: questionnaire-answer wiring is plausibly out of AM1 scope like verdict-taking; if so the *latching selected state* should not ship.)

**OBSERVATION**

- **DES-2 — All token/grid/a11y checks pass.** No hardcoded colors, on-grid spacing, closed radius scale, closed type scale; `npm run lint` design rules clean (warnings are pre-existing baseline). Promoted `ReferenceChip`/`Fold` carry `data-ds-*`, have `.stories.tsx`, entered the snapshot net (floors +2). Focus rings via DS button chrome; agent cue is `aria-label`'d; reply-cancel/remove have labels. Avatar initials are hand-rolled in `ConversationSurface` (not the DS `Avatar`) — acceptable since the surface deliberately hand-rolls chrome to render router-free in the viewer (documented `:24-25`).
- **DES-3 — States.** Page owns loading/not-found/error/empty (`Conversations.tsx:246-282`); `ConversationSurface` renders only the populated state (correct per the no-skeleton-in-design memory). Empty thread → `PartList` renders an empty column; acceptable.

---

## Lens 3 — Security

**OBSERVATION (no findings)**

- **SEC-1 — No new attack surface.** AM1 is render-only + one reused POST. The send path (`Conversations.tsx:227`) reuses the existing `/api/threads/:id/messages` endpoint, unchanged shape, with `clientKey: crypto.randomUUID()`. No new route, no new credential, no path/URL input, no SSRF surface. Rate-limiting N/A (no new mutation route).
- **SEC-2 — Injection guards intact.** `ReferenceChip` renders `label`/`meta` as React-escaped text, never HTML (`ReferenceChip.tsx:77-78`); block chip shows title only. `ProsePart` segments mention text via regex split into escaped text spans — no `dangerouslySetInnerHTML` anywhere in the diff (grep clean). The mention regex escapes its tokens (`ProsePart.tsx:25`). No agent-text→HTML path introduced.

---

## Lens 4 — Adversarial

**CRITICAL**

- **ADV-1 (The Auditor) — capability regression across the merge.** See judgment call 3. Inline verdict removed + AL3 verdict no-op + malformed betId = no reachable approve path in the merged product. AM1 in isolation is correct; the *integration* regresses. Must-fix the betId (ARCH-1); flag the AL3 sequencing to the founder.

**WARNING**

- **ADV-2 (The Saboteur) — three tests assert AROUND the betId hole rather than guarding it.** The known defect (ARCH-1) is shielded by weak assertions:
  - `AM1-part.test.ts:302` — `expect(typeof p.reviewTarget.betId).toBe("string")`. `""` is a string; the test passes on the broken value. Should assert `betId` is non-empty / resolves to a real bet.
  - `Conversations.review-routing.test.tsx:155` — `expect(lastPath).toContain("/work/bet")`. `/work/bet//review/m-rev-am1` contains `/work/bet`; passes on the malformed path.
  - `Conversations.part-migration.test.tsx:224` + comment `:219-223` — explicitly documents the betId is "not yet populated … see report" and asserts only `toContain("/work/bet")`. The test *knows* the value is broken and tests the navigation-fires behavior instead. Honest in comment, but it means the suite is green over a broken link. When ARCH-1 is fixed, these three assertions must tighten to prove the real betId.

**OBSERVATION**

- **ADV-3 (The New Hire) — `derivePartsFromSession(): Part[] { return [] }` reads as dead code without the AC5 context.** It is the executable half of the reuse boundary (lored at `part.ts:343`), legitimately a stub AM3 grows. The `@lore` makes intent findable. Acceptable.
- **ADV-4 — Type safety: zero `any`/`as`/`!`/`@ts-ignore` introduced in production AM1 source.** `assertNeverPart(_value: never)` is a real compile-time exhaustiveness guard returning `<UnknownPart>` at runtime (no throw) — correct degradation. `exhaustiveAssert` used on the `EntityRef.kind` dispatch (`part.ts:231`). Grep confirms no new escape hatches.
- **ADV-5 — `groupParts` time-window edge.** `part.ts:165` uses `time - lastTime <= GROUP_WINDOW_MS` with `lastTime=0` seeded; the first part's `time - 0` is enormous so `withinWindow` is false → first part always starts a fresh group (correct). Out-of-order timestamps would mis-window, but messages arrive ordered. Minor; not a finding.

---

## Lens 5 — Simplification

**OBSERVATION**

- **SIMP-1 — `renderEmbed` `artifact` and `diff` branches are byte-identical** (`embeds.tsx:24-45`) — both render `<ReferenceChip kind="artifact" … />`. They could collapse to one `case "artifact": case "diff":`. Trivial; the split documents intent (diff is a distinct Embed kind). Leave or merge — reviewer-optional.
- No dead code, no premature generics, no impossible error handling, no unnecessary async found in the AM1 diff. The `Part`/adapter split is justified by AC5 (the WP's reason to exist), confirmed in the plan's design-it-twice (§9).

---

## Lens 6 — AI Slop

**OBSERVATION (no findings)**

- Naming is honest and concept-locked (`Part`/`Embed`/`Fold`/`OpenTarget`, `derivePartsFromMessages`/`groupParts`). Comments explain *why* (the W1 boundary, the prose≠plain decoupling, the W5 message-ref collapse) — load-bearing, not restatement. No "TODO: implement" on implemented code, no "for now"/"in production"/"simplified version" tell-tales. The `@lore` comments are genuine cross-cutting-constraint captures, not filler.

---

## AC-completeness audit

| AC (TRACK-AM §AM1) | Status | Evidence |
|---|---|---|
| **AC1** — reader follows a calm threaded conversation of deliberate messages (people+agents), easy to scan | **MET** | `PartList` author-groups via `groupParts` (5-min window, `part.ts:158`); group head renders name+time+agent-cue (`PartList.tsx:70-98`). `AM1-PartList.test.tsx` asserts grouping + agent cue (suite green, 82 tests). Page renders it live (`Conversations.part-migration.test.tsx:175` asserts `PartList` mounted, no legacy card). |
| **AC2** — a message embeds what it refers to (≥ block/artifact + session link) inline | **MET** | Adapter maps `BlockRef→block` Embed (host target), `ArtifactRef→artifact/diff`, session→`session-reference` (`part.ts:193-233`). `embeds.tsx` renders block/artifact as `ReferenceChip`, session as `Fold` (not a chip). `AM1-part.test.ts` + `AM1-PartList.test.tsx` cover both knowledge- and bet-hosted block refs (C1). |
| **AC3** — honors Thread model; host attachment, participants, all message types render in the new style; verdict flow unaffected | **MET (with ARCH-2 caveat)** | All 4 message types map (`part.ts:273-333`); verdict folds onto resolved Part, is NOT its own Part (`AM1-part.test.ts:329`, asserts no standalone verdict Part + APPROVED echo). Participants render in header (`ConversationSurface.tsx:201`). Verdict *semantics* unchanged (§12.9; concept hard-rule 5). Caveat: the `resolvedBy` echo shows a message id, not a person (ARCH-2) — the type renders, the label is wrong. |
| **AC4** — session activity NOT first-class; session is a reference, not an inlined work-log | **MET** | `PART_KINDS` has no session/event/work-log kind (`part.ts:34`); closed list type-enforced. Session is an `Embed{kind:"session-reference"}` only, rendered as a quiet `Fold` (`embeds.tsx:66`). `AM1-part.test.ts` asserts no Part produced from session activity. Concept hard-rule 3 honored. |
| **AC5** — rendering structure factored so another surface reuses it without reimplementing | **MET** | Static half: `no-restricted-imports` rule **verified firing as error** on a planted `Message` import (eslint.config.ts:933). Runtime half: `AM1-source-agnostic.test.ts` proves two adapters → one `Part[]` → one `PartList`, zero renderer change. `derivePartsFromSession` stub is the AM3 seam. |

All 5 ACs MET; the AC3 caveat (ARCH-2) and the betId defect (ARCH-1) are render/wiring correctness issues, not AC gaps in the contract sense — but ARCH-1 makes the AC2/AC3 review-routing affordance navigate to a broken URL, which I treat as a must-fix before DONE.

---

## VERDICT: NOT DONE

All 5 ACs are met in contract and all gates are green, but two correctness defects must land before this is shippable as a usable conversation:

**Must-fix:**

1. **ARCH-1 / ADV-1 (CRITICAL)** — `betId: ""` makes every "Open review"/"View review" route to `/work/bet//review/:id`, a dead URL. Source the betId at the PAGE boundary (it has thread→host context) and thread it into the review OpenTarget; keep the adapter source-agnostic. Then tighten the three weak assertions (ADV-2: `AM1-part.test.ts:302`, `review-routing.test.tsx:155`, `part-migration.test.tsx:224`) to prove a real, non-empty betId resolves.

2. **ARCH-2 (WARNING→fix)** — `resolvedBy` uses `verdict.resolvesMessageId` (a message id) where the design contract is the resolver's person-name. Use the verdict message's `senderId` resolved through `resolveAuthor`. Add a `resolvedBy` assertion to the resolved test.

**Should-fix (reviewer-optional, not blocking):**

3. **DES-1 (WARNING)** — `QuestionnairePart`'s latching selected state implies an answer was recorded when nothing posts. Drop the persistent pressed-state or make the inert status visible.

**Founder routing (not AM1 code):**

4. **ADV-1 sequencing** — AL3's `ReviewPage.handleSubmitVerdict` is a no-op; with inline verdict removed, verdict-taking is end-to-end broken across the merge. Sequence AL3 verdict-wiring before treating approve-capability as restored. Not an AM1 defect (out of scope), but the founder must know the merged product regresses approve until AL3 lands.

---
---

# Round 2 — Re-review of round-1 fixes

Reviewer, Phase 4 round 2. Verifying the three fix commits (`aec109de` ARCH-1/ARCH-2, `d225edf8` ADV-2 test tightening, `244e8fd3` DES-1) against the actual code — not the commit messages. Gates re-run live: `npm run check` PASS (13/13 packages), `npm run lint` PASS (0 errors; baseline warnings/infos only), targeted AM1 suite PASS (43/43 across `AM1-part.test.ts`, `AM1-navHandler.test.tsx`, `Conversations.part-migration.test.tsx`, `Conversations.review-routing.test.tsx`). AC5 lint rule confirmed present and byte-identical to the round-1-verified block (`eslint.config.ts:933-979`) — Message/InlineRef/EntityRef/BlockRef/MentionRef named-import ban + `thread*`/`harness` path patterns + api-fetch restatement, placed LAST. Not removed; trusting the round-1 live-fire proof.

## ARCH-1 (was CRITICAL) — betId dead URL — RESOLVED

- **(a) Valid path for bet-hosted threads — VERIFIED.** `Conversations.tsx:317` sources `reviewBetId = data.thread.hostKind === "bet" ? data.thread.hostId : null` and passes it via `createOpenHandler(navigate, { betId: reviewBetId })`. `open-handler.ts:60-67` prefers the page betId, falls back to a non-empty `target.betId`, builds `/work/bet/${betId}/review/${reviewId}`. Both page tests now assert the FULL path with a bet-hosted fixture: `expect(lastPath).toBe('/work/bet/${BET_ID}/review/${reviewId}')` plus `not.toContain("//")` (`review-routing.test.tsx:158`, `part-migration.test.tsx:228`). Genuine — the old `toContain("/work/bet")` (which a double-slash satisfied) is gone.
- **(b) No-op degradation for non-bet hosts — VERIFIED in code.** `open-handler.ts:64-66`: `const betId = pageBetId ?? targetBetId; if (betId === null) return;` — no navigation, no malformed URL. The adapter still emits `betId: ""` (the source-agnostic placeholder), `targetBetId` coerces `""→null`, so a non-bet host with no page betId genuinely no-ops. Correct graceful degradation, no dead URL shipped.
- **(c) Adapter stayed source-agnostic + AC5 boundary intact — VERIFIED.** `part.ts` betId resolution was NOT added to the adapter; the adapter still hardcodes the empty placeholder and the page/handler seam owns betId entirely (`@lore` at `open-handler.ts:21-30`). AC5 lint block unchanged and still placed last.
- **RULING on the non-bet no-op (was the open judgment call): ACCEPTABLE graceful degradation, not a dead-button defect — for AM1.** A review is inherently about a bet's work; the only conversations that legitimately host a `review` Message are bet-hosted (or task-hosted, where the bet is one hop away but not cheaply in the page's hand). For the bet-hosted case — the real one — the button routes correctly. The residual concern is the task-hosted case where "Open review" silently does nothing; that is a *thin* surface (a review Message under a task host is unusual) and the alternative (a broken `/work/bet//review` URL) is strictly worse. The honest no-op is the right AM1 behavior. **Note for AM5/AL3:** when routing is standardized, the task→bet hop should be resolved so the button is never inert. Tracked as ARCH-1-followup (OBSERVATION below), not a blocker.

## ARCH-2 (WARNING) — resolvedBy person vs message id — RESOLVED

- **VERIFIED.** `part.ts:251` now indexes verdicts as `{ payload, resolverId: m.senderId }`; the resolved branch sets `resolvedBy: verdict ? resolveAuthor(verdict.resolverId, viewerId, identities).name : author.name` (`part.ts:294`, `part.ts:319`). `resolveAuthor` (`part.ts:179-190`) returns the identity's `name` verbatim ("You" substitution happens at render, not here), so `resolvedBy` is a real display name. `ReviewResolvedPart.tsx` renders `by {part.resolvedBy}` → a person, not `rv2`. The resolved test (`AM1-part.test.ts:360-361`) now asserts `resolved.resolvedBy === "A. Founder"` AND `not.toBe(verdict.id)` — genuinely guards the person-name and rules out the old message-id value. Fixture: verdict `senderId: "u-me"` → `IDENTITIES` maps `u-me → "A. Founder"`. Real assertion, not weakened.

## ADV-2 (WARNING) — tests asserted around the hole — RESOLVED

- **VERIFIED, not weakened.** All three former weak assertions tightened:
  - `AM1-part.test.ts:303-311` — now asserts `reviewId === "rv1"` and `betId === ""` (the *adapter's* documented placeholder). This correctly proves the adapter emits the empty placeholder by design — the betId is the page's job, not the adapter's. Not a regression: it pins the contract, and the page tests prove the real value.
  - `review-routing.test.tsx:155-159` — bet-hosted fixture, asserts full `/work/bet/bet-am1/review/${id}` + `not.toContain("//")`.
  - `part-migration.test.tsx:219-229` — bet-hosted fixture (`hostKind: "bet"`, `hostId: "bet-am1-migration"`), asserts full path + `not.toContain("//")`. The old "betId not yet populated — see report" comment is gone.

## DES-1 (should-fix) — fake questionnaire latch — RESOLVED

- **VERIFIED.** `QuestionnairePart.tsx` dropped `useState`, `aria-pressed`, `onClick`, and the dual selected/unselected className branch. Options now render as static `<li>` chips inside a `<ul>` (list-none). No interactive affordance, no persistent pressed state — nothing implies an answer was recorded. Honest deferral matching the composer "+" menu. Also satisfies the `design/no-op-button` lint rule (a latching no-op button would have tripped it). `@lore` documents the deferral and that a later WP turns these into real controls.

## New finding (round 2)

**WARNING**

- **ADV-2-r2 — the empty-betId review no-op is unguarded by a direct unit test.** The new core ARCH-1 degradation branch (`open-handler.ts:65` `if (betId === null) return`) is the safety net that prevents the dead URL, yet `AM1-navHandler.test.tsx` has no test that calls the review route with `betId: ""`/`null` and asserts `navigate` is NOT called. The existing review test (`:50-53`) passes `betId: "bet-1"` (non-empty → navigates) and the host+user no-op test (`:56`) covers a different branch. The no-op is proven only indirectly (the page never produces it for the bet-hosted fixtures the page tests use). Add a one-line unit test: `createOpenHandler(navigate)({ route: "review", betId: "", reviewId: "rv1" }); expect(navigate).not.toHaveBeenCalled()`. **Not blocking** — the branch is correct and reviewed, code is right; this is a test-coverage gap on the fix, not a correctness defect. Recommend the builder add it before ship, but it does not gate DONE.

**OBSERVATION**

- **ARCH-1-followup — task-hosted review "Open review" is inert.** A review Message under a `hostKind: "task"` thread has no page-sourced betId (the page only resolves `betId` for bet hosts), so "Open review" no-ops. Correct (no dead URL) and an unusual host combination for AM1, but the task→bet resolution should be wired when AM5 standardizes routing so the affordance is never silently dead. Not an AM1 defect.

## AC table (round 2 — re-stated)

| AC (TRACK-AM §AM1) | Round-1 | Round-2 | Evidence |
|---|---|---|---|
| **AC1** — calm threaded conversation, easy to scan | MET | **MET** | Unchanged; `groupParts` author-grouping + agent cue tested (43/43 green). |
| **AC2** — message embeds what it refers to inline | MET | **MET** | Block/artifact `ReferenceChip`, session `Fold`; "Open review" now routes to a VALID review path (ARCH-1 fixed). |
| **AC3** — all message types render; verdict flow unaffected | MET (ARCH-2 caveat) | **MET (caveat cleared)** | `resolvedBy` now renders the resolver's person-name, not a message id (ARCH-2 resolved + asserted). Verdict still folds, no standalone Part. |
| **AC4** — session not first-class | MET | **MET** | Unchanged; `PART_KINDS` has no session kind; session is an Embed `Fold`. |
| **AC5** — rendering reused by another surface without reimpl | MET | **MET** | Lint block unchanged + present (`eslint.config.ts:933-979`); two-adapter source-agnostic runtime test intact; adapter stayed source-agnostic through the ARCH-1 fix (betId moved to the page, NOT the adapter). |

All 5 ACs MET. The AC3 caveat is cleared. No CRITICAL remains. Two non-blocking findings (ADV-2-r2 WARNING test-gap, ARCH-1-followup OBSERVATION).

## VERDICT (round 2): DONE

All round-1 must-fixes resolved and verified against the code (not just commit messages):
- **ARCH-1 / ADV-1 (was CRITICAL)** — betId sourced at the page boundary; bet-hosted routes resolve to the full valid path; non-bet hosts no-op (no dead URL); adapter stayed source-agnostic. Page tests tightened to the full path with `not.toContain("//")`.
- **ARCH-2 (WARNING)** — `resolvedBy` renders the resolver's person-name via `resolveAuthor`; resolved test asserts the name and rules out the message id.
- **DES-1 (should-fix)** — questionnaire options are static `<li>` chips; no fake latch.

Gates green: check PASS (13/13), lint PASS (0 errors), 43/43 targeted AM1 tests PASS, AC5 lint rule present + unchanged. No CRITICAL. The two residual findings (ADV-2-r2 unit-test gap, ARCH-1-followup task-host inertness) are non-blocking — recommend the builder add the one-line no-op unit test before `/ship`, but neither gates DONE.
