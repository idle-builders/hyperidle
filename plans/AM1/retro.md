# AM1 — Retro: Conversation Experience Pipeline Run

**Workpackage:** AM1 "Conversation Experience — the Part model"
**Branch:** `design/AM1-conversation-experience`, PR #344
**Status:** DONE (round-2 review verdict)
**Run:** Resumed pipeline; concept + design + human-design-review were already complete (8 founder annotation rounds). `/pipeline AM1` started at architecture phase.
**Commit trail:** 39 commits from concept lock to plan retirement (concept → 8 design rounds → architecture → 2 critique rounds + W5 fold → write-tests → write-code session 1 (substrate) → scope BLOCKER → architecture amendment → write-code session 2 (migration) → 2 review rounds → docs).

---

## Cost Signals

### 1. Architecture critique ran 2 rounds (C1 totality hole + W5 new finding)

**What happened:** The first architecture plan had a CRITICAL (C1): the `block → /knowledge` mapping was not total over `BlockHostKind`. A `BlockRef` carries `{blockId, hostKind, hostId}` and only `hostKind === "knowledge_item"` has a valid `knowledgeId`; the plan specified no rule for bet/task/artifact/agent/user-hosted blocks. The plan also carried 4 WARNINGs (W1–W4) and 4 NITs. The designer revised (C1 total block mapping via existing `resolveHostRoute`; W1 lint rule; W2 drop `recommended`; W3 collapse duplicate mention; W4 drop `blockAnchor`). Critique round 2 (re-review) then surfaced a **new WARNING (W5)**: `entity-ref → OpenTarget` was also not total — the `"message"` kind in `EntityRef.kind` had no mapping rule. A final architecture fold committed W5 + N5 (path typo), then build began.

**Turn cost:** Two critique cycles + one more architecture fold before any code was written. The core cause of C1 was that the reconciliation pass checked routes and type shapes but did not audit the exhaustiveness of discriminated mappings — the exact class of hole that `/architecture-critique` is supposed to catch.

**What worked:** The critique caught C1 and W5 before build. Both would have become builder improvisation (the "undocumented decision" class of rework the critique is designed to prevent). The W5 totality check in round 2 surfaced because the C1 fix made the exhaustiveness lens more salient, demonstrating that critique round 2 (re-review) is genuinely valuable on totality-heavy designs, not a rubber stamp.

---

### 2. Two write-code sessions due to a mid-build scope BLOCKER (live-page migration)

**What happened:** The architecture plan's task 8 said "Wire `Conversations.tsx`" (replace ThreadShell render path). During build session 1, the builder completed tasks 1-7 and task 10 (substrate: Part/Embed/OpenTarget vocabulary, adapter, PartList, DS promotions, ConversationSurface composition) but did NOT migrate the live `Conversations.tsx` page — it still rendered `ThreadShell`. The BLOCKER: the builder flagged that a wholesale swap would regress the protected inline-verdict/reasoning behaviors. The founder resolved it with a clear product policy ("desktop app, versioned releases — no live cutover; every change is done completely"), which triggered a designer plan-amendment (architecture amendment §12, tasks 11-14) and a second builder session.

**Turn cost:** One full extra builder session (tasks 11-14: ConversationSurface real props, Conversations live page swap, protected-test updates, review-page verdict confirm + prune). The architecture plan's task 8 had an ambiguous scope: "Wire `Conversations.tsx`" was in the plan but the question "is the approved design the story only, or is it the live page?" was never resolved before build. The spec said "Depends on: None" and the builder could reasonably interpret the design surface as the story viewer — the plan did not explicitly state that the live page swap was in scope and non-negotiable.

**Process gap:** The plan should have explicitly stated whether the deliverable is "ConversationSurface story" or "ConversationSurface story + Conversations page". For a surface redesign at this scale (replacing a primary page), the live-page migration must be named in the architecture plan as a numbered task, not implicit in "wire `Conversations.tsx`." The "desktop app, versioned releases" policy is the decisive context — and it was not in the plan.

---

### 3. Review round 1 found a CRITICAL betId dead-URL defect

**What happened:** `derivePartsFromMessages` hardcoded `reviewTarget: { betId: "", reviewId: message.id }` — the source-agnostic adapter cannot know the betId. `open-handler.ts` built the review route as `/work/bet/${betId}/review/${reviewId}`, so `betId: ""` produced `/work/bet//review/:id`, a broken path that matches no real bet. The review tests asserted only `toContain("/work/bet")` (which the double-slash path satisfies) or `typeof betId === "string"` (which `""` satisfies) — three tests were asserting *around* the defect, not *over* it. The fix: source betId at the page boundary (where thread→host context is available) and thread it into the OpenTarget via `createOpenHandler`, keeping the adapter source-agnostic.

**Turn cost:** One fix cycle (3 commits: ARCH-1 betId fix, ARCH-2 resolvedBy person vs message id, DES-1 honest questionnaire state) + a round-2 re-review.

**Root cause:** The architecture plan §12.4 named "the existing, real ReviewPage" as the destination but did not specify HOW the review betId reaches the adapter when the adapter is source-agnostic. The architectural seam (source-agnostic adapter + page-boundary betId sourcing) was clear in principle but the concrete wiring — "page derives betId from thread.hostId when hostKind==='bet'" — was not specified in the plan's task 11/12 detail. The builder implemented the correct architecture (source-agnostic adapter) but left the betId as a placeholder `""` without completing the page-boundary wiring that makes it functional.

The test coverage gap compounded the defect: the three assertions were written to the adapter contract ("adapter emits a string betId") rather than to the functional contract ("the review route is navigable"). The red-phase tests for AC2/AC3 did not include a navigation test that asserts a *reachable* review URL.

---

## Cross-Track Dependency Gaps Surfaced

### "Depends on: None" was inaccurate

The AM1 spec states `Depends on: None` but AM1 functionally depends on:

1. **AL3** (`ReviewPage.handleSubmitVerdict`) for the end-to-end verdict flow. AM1 removed inline verdict dispatch (correct per locked design §5). AL3's verdict is a no-op stub (`ReviewPage.tsx:148-150`). With inline verdict gone and AL3 not wired, there is no reachable approve path in the merged product. This is a cross-track merge-sequencing gap, not an AM1 code defect — but it was not flagged in the spec or architecture plan.

2. **AM5** (open/routing contract) for the full artifact/block routing vision. AM1 correctly wired chips to existing routes as hooks (not building destination views), but the "Open review" chip's betId wiring had a correctness gap precisely because the routing contract is not yet standardized. AM5 would make the betId routing robust by giving the open/routing contract awareness of task→bet context.

**Work-planning process gap:** Dependency declarations in workpackage specs should include *functional* dependencies (surfaces AM1 alters that other tracks also alter) and *sequencing* dependencies (which other WPs must ship first to avoid capability regression), not only *technical* build dependencies.

---

### AC/design contradiction that should have been caught earlier

AM1's validation scenario reads: "Given the existing message types (plain/review/questionnaire/verdict), when each renders in the new style, then all remain correct and reachable, and **verdict flow is unaffected**." But the locked design §5 explicitly removes inline Approve/Reject from the conversation ("NO inline decision … the decision is made on the review page"). The architecture plan's §12.9 correctly reconciled this ("verdict semantics unchanged; only the decision UI relocates"), but the code review had to make this ruling explicitly — the reconciliation was not pre-loaded into the AC. If a reviewer had been less careful, they could have flagged the inline-verdict removal as an AC violation and triggered unnecessary rework.

**Process opportunity:** When design locks a decision that changes where a behavior lives (the verdict is now on ReviewPage, not in the conversation), the architecture plan should update the relevant AC wording or add an explicit note to prevent ambiguity at review.

---

## What Went Well

### 1. Source-agnostic Part boundary + lint-rule enforcement

The core AC5 architecture decision — source-agnostic `Part` split in `shared`, renderer in `web` importing only `Part` — was sound and enforced at build time by a `no-restricted-imports` ESLint block scoped to `PartList.tsx`/`parts/**`. The rule bans `Message/InlineRef/EntityRef/BlockRef/MentionRef` named imports and `thread*`/`harness` path patterns. The code review verified the rule fires as a build error on a planted `Message` import. This is the right enforcement mechanism (a static codebase property → lint rule, not a test), and it directly enables the AM3 reuse contract.

### 2. Single `onOpen` routing seam (`createOpenHandler`)

Collapsing three callbacks into one `OpenHandler` seam (`createOpenHandler(navigate)`) was a genuine simplification that kept the renderer router-free. The design-system story passes a `console.info` noop; the page passes the real navigator. The separation was clean and held through the scope-blocker amendment (the seam was pre-wired in session 1 and consumed correctly in session 2).

### 3. Architecture critique caught non-total mappings before build

Both the C1 (block→knowledge totality) and W5 (entity-ref→OpenTarget totality) defects were caught by the architecture critique before a single line of implementation was written. The C1 fix (routing via the existing `resolveHostRoute`, which is TS-exhaustive over all `HostKind`) was elegant — it reused an existing, proven resolver rather than inventing a new one. The W5 fix stated the message-kind rule (drop to `unknown` Embed) explicitly so the builder had a documented decision rather than improvising.

### 4. ConversationSurface → PartList composition prevents design/production drift

The decision to have `ConversationSurface` (the approved design component) compose `<PartList>` (the production renderer) means the design story and the production page run through the same renderer. The migration in session 2 extended `ConversationSurface` to accept real props; the story passes fixtures, the page passes real data — same component, zero drift risk. This is the "round-10 lore" anti-drift pattern working correctly.

### 5. 8 founder annotation rounds produced a locked, unambiguous design

The human-design-review phase ran 8 annotation rounds before pipeline resumed, producing a single approved design with locked decisions on every load-bearing detail (identity model, author grouping, reference chip kinds, composer menu, review message shape, session fold style, open/routing contract). The architecture plan had unusually clear inputs. The high number of rounds was appropriate for a primary-surface redesign; the design phase correctly parked for human review rather than auto-shipping.

---

## Process-Improvement Candidates for `/compound`

### PIC-1 — Totality audit as a required architecture-critique lens

The C1 and W5 totality holes are a pattern: when a plan introduces a mapping from a discriminated union (like `BlockHostKind`, `EntityRef["kind"]`) to an `OpenTarget` variant, the architecture plan must enumerate every member of the union and state the rule for each. The critique should treat "this mapping is not total" as a CRITICAL class (not reviewable-if-minor). This is a new extension to the existing CC-009 architecture-critique practice.

**Proposed addition:** `architecture-critique/SKILL.md` adds a "Totality audit" lens: for every discriminated union dispatch in the plan (`switch`/exhaustive map/`kind`-based if-chain), verify the plan specifies a handler for every member, including any "unknown/forward-compat" arm. If any member has no stated rule → CRITICAL.

### PIC-2 — Live-page migration scope must be explicit in architecture plan for surface redesigns

When a workpackage redesigns an existing production surface (not just adding a story component), the architecture plan must state explicitly in a numbered task whether the live page is migrated in-scope. For primary surfaces, the "desktop app, versioned releases — every change done completely" policy is the default. The plan should name the policy context and list the migration as a task, not leave it implicit in a generic "Wire Page.tsx" note.

**Proposed addition:** `architecture/SKILL.md` adds under "Required sections" a "Live-page migration scope" field for any workpackage touching an existing production page. Values: `in-scope (complete swap)` or `out-of-scope (story only, migration in WP-N)`. If in-scope, the migration must appear as an explicit numbered task.

### PIC-3 — Functional + sequencing dependencies must be declared, not only build dependencies

AM1's spec said "Depends on: None" but the working product regressed a capability (verdict-taking) due to cross-track sequencing. Work-planning should require two dependency lists: (a) build dependencies (technically requires X to compile) and (b) functional dependencies (must land before X to avoid capability regression or broken routing). This feeds the `/pipeline` orchestrator's merge-ordering logic.

**Proposed addition:** `work-planning/SKILL.md` adds a "Functional + sequencing dependencies" field to the spec template, distinct from the technical "Depends on" field. Entries: `<WP-ID>: <why: capability / routing / data contract>`. Architecture plans inherit these and flag cross-track gaps during the reconciliation pass.

---

## Open Cross-Track Items (escalation)

**ESCALATION (medium):** `AL3 ReviewPage.handleSubmitVerdict` is a no-op stub. With AM1 removing inline verdict dispatch from the conversation, there is no reachable approve path in the merged product until AL3 wires the verdict. The "Open review" button now routes correctly (betId fix), but `ReviewPage` accepts the click and posts nothing. The founder must sequence AL3 verdict-wiring before the approve workflow is restored in the merged product.

**OBSERVATION:** Task-hosted "Open review" is silently inert (no betId for non-bet hosts). The `open-handler.ts` no-ops gracefully (no broken URL), but the button does nothing. AM5's routing contract should resolve task→bet routing so this affordance is never inert.
