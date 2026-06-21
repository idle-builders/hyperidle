# AM1 — Architecture Critique (reviewer, cold read)

**Plan under review:** `plans/AM1/architecture.md` (commit `3eb561ef`).
**Inputs honored against:** `plans/AM1/concept.md` (LOCKED), `plans/AM1/design/approved.md` (LOCKED §6/§8), `.pipeline/work-packages/TRACK-AM.md` §AM1.
**Method:** every load-bearing claim verified against the branch, not taken on faith. Routes, types, the snapshot-net glob, and the existing chip/fold were read directly.

---

## Claims I verified against reality (all TRUE except where noted)

| Plan claim | Verdict |
|---|---|
| Routes `/knowledge/:knowledgeId`, `/artifacts/:id`, `/work/bet/:betId/review/:reviewId` exist | **TRUE** — `router.tsx` L95, L97, L91. |
| `ConversationSurface.tsx` exists, 1110 lines, local `Fold` (L322) + `ReferenceChip` (L378) | **TRUE** — verified. |
| Snapshot net globs `../*.stories.tsx` (DS root) + `../kinds/` only; web stories NOT in net | **TRUE** — `catalog-snapshot.test.tsx` L51-54. Enumeration guard is `≥59`, not `≥56` as the rule doc says — plan's R2 reasoning is sound but the exact floor differs. |
| `thread.ts` `Message`/`MessageType`/`InlineRef`/`ArtifactRef`/`verdictDecisionLabel`/`exhaustiveAssert` exist, unchanged | **TRUE**. |
| `computeSenderGrouping` is `Message`-typed | **TRUE** — R1 coupling concern is real; `groupParts` mitigation is correct. |
| `VerdictPayload.resolvesMessageId` exists for verdict→resolved fold | **TRUE** — L209. |
| Existing `no-restricted-imports` ESLint infra exists | **TRUE** — `eslint.config.ts` L348+ (multiple blocks). Relevant to AC5 finding below. |

The plan's reconciliation table is unusually honest and mostly accurate. Two of its mappings, however, hide totality holes the adapter cannot satisfy as specified.

---

## 9-Dimension Scoring

| # | Dimension | Score | Note |
|---|---|---|---|
| 1 | Spec/contract fidelity (concept + design + ACs) | 7 | All 8 ACs have named methods; concept hard-rules respected. Docked for the block-routing totality hole (C1) and the questionnaire-field mismatch (W2) that contradict the source data. |
| 2 | Type-model soundness | 6 | Discriminants closed + `unknown` fallback genuinely encoded. But `OpenTarget{route:"knowledge"}` requires a `knowledgeId` the source `BlockRef` cannot always provide (C1); `QuestionOption.recommended` has no source (W2); duplicate mention representation (W3). |
| 3 | Boundary / layer integrity | 8 | Source-agnostic split is the right call and the design-it-twice rejects Option B for the correct reason. AC5 boundary is achievable. Docked only for the weak enforcement mechanism (W1). |
| 4 | Verification rigor (AC → method) | 6 | Strong on most ACs. AC5 method ("static import-graph check OR a type-level test") is hand-wavy and points at a test where a lint rule is the right tool (W1). AC8 page-test asserts a "path string" map, not real navigation (NIT). |
| 5 | Reuse vs duplication | 8 | `groupParts` duplication justified; `ReferenceChip`/`Fold` promotion in-budget; collapses 3 callbacks to 1 `onOpen`. Good. |
| 6 | Routing-seam design (§6) | 6 | `OpenTarget` is closed and covers all four §6 affordances. But the `knowledge` variant is under-specified for non-knowledge-hosted blocks (C1), and `blockAnchor` has no documented derivation from `BlockRef.blockId` (W4). |
| 7 | Security posture | 8 | Correct that AM1 is render-only; sanitizer-reuse + React-escaped chip text + no new raw-HTML path is the right frame. No new attack surface. Honest N/A grid. |
| 8 | Task atomicity / sequencing | 8 | 10 ordered, independently committable tasks with a correct dependency note. Realistic multi-session L scope. |
| 9 | Risk surfacing / self-critique | 8 | R1–R5 are real and well-reasoned; self-critique is not theater. Docked because the two totality holes (C1, W2) were NOT surfaced as risks — they should have been caught by the reconciliation pass. |

**Overall: 7.0/10** (mean 7.2, rounded down for one CRITICAL).

---

## CRITICAL findings

### C1 — `block → /knowledge/:knowledgeId` mapping is not total; the adapter has no rule for non-knowledge-hosted blocks
**Location:** §1.3 `OpenTarget` (`architecture.md` L146 `{ route: "knowledge"; knowledgeId; blockAnchor? }`); §1.2 Embed `block` (L129); reconciliation row L41; design §6 routing table.

The design §6 contract routes the **block** chip to `/knowledge/:knowledgeId`. But a `BlockRef` on this branch is `{ blockId, hostKind, hostId }` (`thread.ts` L116-120) and `hostKind ∈ {bet, task, knowledge_item, artifact, agent, user}` (`blocks/types.ts` L20-27). Only `hostKind === "knowledge_item"` yields a valid `knowledgeId` (`= hostId`). For a block hosted on a bet/task/artifact/agent/user message, the adapter **cannot** produce a `{route:"knowledge", knowledgeId}` target — there is no knowledge id to route to.

The plan's `derivePartsFromMessages` is asserted to be total over its inputs, but it specifies **no** rule for this case. Three of the eight ACs (AC2 embed, AC3 all-types-render, AC8 routing) depend on this mapping, and the plan's own AC8 test ("click block chip → `onOpen({route:"knowledge",…})`") will pass only for a knowledge-hosted fixture — masking the hole.

**What the designer must add:** an explicit, total rule for `BlockRef → OpenTarget`. Either (a) restrict the `block` Embed/chip to `hostKind === "knowledge_item"` and map every other host to its own route (`bet`/`task`/`artifact` → the existing routes; `agent`/`user` → ?), or (b) widen the `knowledge` `OpenTarget` / add host-keyed variants so the adapter is provably exhaustive over `BlockHostKind`. As written, the adapter cannot be implemented without an undocumented decision the builder will improvise — exactly the rework `/architecture` exists to prevent.

---

## WARNING findings

### W1 — AC5 enforcement names a test where a lint rule is the correct tool, and the method is hand-wavy
**Location:** §7 AC5 row (L282): *"**Type/import test** `PartList.dependency.test.ts`: assert (via static import-graph check or a type-level test) that `PartList.tsx` does NOT import `Message`/`thread.js`/`harness`."*

AC5 ("factored so AM3 reuses without reimplementing") is a **static codebase property** — CLAUDE.md is explicit: "If an AC describes a static property, enforce it with the type system or a lint rule, not a test." The branch already has `no-restricted-imports` infrastructure (`eslint.config.ts` L348+). A `no-restricted-imports` rule scoped to `PartList.tsx`/`parts/**` banning `thread.js`/`harness` is the durable, build-time enforcement. A "static import-graph check" inside a vitest file is `readFileSync`-grepping — which CLAUDE.md says is "not a test, it's a lint rule." And "or a type-level test" cannot assert the *absence* of an import at all. The plan must commit to the lint-rule mechanism, not offer a vague disjunction. (The companion runtime proof — two adapters feed one `<PartList>` — is fine and should stay as the executable half.)

### W2 — `Part.questionnaire.options: QuestionOption[]` with `recommended` has no source field
**Location:** §1.1 `Part` (L102), `QuestionOption` (L105); §5 questionnaire row; design §5 "Recommended" tag.

`QuestionnairePayload.options` is `ReadonlyArray<string>` (`thread.ts`) — flat strings, **no** `recommended` flag and **no** per-option metadata. The plan's `Part.questionnaire` promises `options: ReadonlyArray<QuestionOption>` where `QuestionOption = { label, recommended }`, and design §5 calls for a neutral "Recommended" tag. The adapter has no source data to populate `recommended`; it can only ever set `false`. Either the type promises a field that is dead, or AM1 silently needs a `QuestionnairePayload` change — which the concept forbids (hard-rule 5, Thread/Message unchanged). The plan must either drop `recommended` from the Part type (and note the design's "Recommended" tag is deferred / has no data), or surface a Thread-schema dependency as a BLOCKER. Right now it does neither.

### W3 — Duplicate mention representation on the prose Part (`mentions` field AND `mention` Embed)
**Location:** §1.1 `Part` prose variant (L99: `mentions: ReadonlyArray<MentionRef>`) vs §1.2 Embed (L133: `{ kind: "mention"; identityId; displayName }`).

A `prose` Part carries mentions in TWO places: a dedicated `mentions: MentionRef[]` field and `embeds` of `kind:"mention"`. The plan never says which is authoritative for render, or why both exist. `BasePart.embeds` already holds "zero-or-more Embeds the Part hosts" — the separate `mentions` field is redundant and invites drift (renderer reads one, adapter populates the other). Also, the `mentions` field leaks the source type `MentionRef` from `thread.ts` into the prose Part shape; the `mention` Embed already abstracts it to `{identityId, displayName}`. Pick one. Recommend: drop the `mentions` field; mentions are `mention` Embeds like every other inline reference (consistent with the closed Embed set in concept §Closure).

### W4 — `blockAnchor` on the knowledge target has no derivation rule
**Location:** §1.3 `OpenTarget` knowledge variant (L146 `blockAnchor?`); §6 route-checklist ("+ block anchor", L262); design §6 ("anchored to the block").

The design routes the block chip "anchored to the block" and the `OpenTarget` carries an optional `blockAnchor`. But the plan never states how the adapter derives the anchor (is it `BlockRef.blockId`? a slug? does `KnowledgeDetail` even consume an anchor param?). I checked `KnowledgeDetail.tsx` — it resolves `knowledgeId` from the route param (L268-269) but I found no anchor/hash consumption. If the destination ignores the anchor, the field is decorative and the "anchored to the block" design promise is unmet. The plan should either specify the anchor derivation + confirm `KnowledgeDetail` consumes it, or drop `blockAnchor` and note anchoring is deferred to AM5 (the standardized-routing WP) — which is a defensible scope call, but must be *stated*.

---

## NIT findings

- **N1 — AC8 page-test asserts a string map, not navigation.** §7 AC8 (L285): *"`navHandler` maps each route to the expected path string."* Asserting `navHandler({route:"review",…}) === "/work/bet/…/review/…"` tests a format function, not that `navigate()` is called. Acceptable as a light check given AM1 builds no destinations, but call it what it is (a path-format assertion), not routing proof.
- **N2 — Task 10 leaves a fork unresolved-then-resolved in the same breath.** §10 task 10 (L335) states both "stays as the approved visual reference OR is refactored" then "Decision: refactor". The OR clause is noise; state the decision only. (Slop: value-free optionality.)
- **N3 — `unknown` reason `"unrecognised-message-type"` is documented as "impossible today by TS exhaustiveness."** §1.1 (L113). A branch that the type system proves unreachable is dead defensive code unless it guards deserialization drift — which it might (redacted/forward-compat). Fine to keep, but the plan should tie it to a concrete drift source (e.g. a future server message type arriving over the wire) rather than "guards future drift," or it reads as AI defensive over-engineering.
- **N4 — Enumeration-guard floor.** The visual-regression rule doc says `≥56`; the live guard is `≥59` (`catalog-snapshot.test.tsx` L73, L223). Promoting `ReferenceChip` + `Fold` adds 2 DS stories → the builder must bump the floor and the plan should name the new expected count so the guard isn't left stale (it currently doesn't mention the floor at all).

---

## What the plan got right (so the designer doesn't over-correct)

- Source-agnostic `Part` split in `shared` with renderer in `web` is the correct, enforceable shape for AC5; the design-it-twice rejects co-location for the right reason.
- Closed Part/Embed discriminants + `unknown` fallback that returns a quiet placeholder (never throws) faithfully mirrors the Block `unknown` precedent the concept cites.
- `OpenTarget`/`onOpen` collapsing three callbacks into one seam is a genuine simplification, not creep, and keeps the renderer router-free.
- Honest R2 snapshot-net blind-spot disclosure — the plan does not invent a gate that doesn't exist (web stories genuinely aren't globbed; verified).
- Security framing is correct for a render-only reshape; no fabricated controls.

---

## VERDICT

The boundary architecture is sound and most ACs are well-instrumented, but the adapter is **not provably total**: the load-bearing `block → /knowledge` mapping (C1) cannot be implemented for non-knowledge-hosted blocks as specified, and two type fields (W2 `recommended`, W4 `blockAnchor`) promise source data that does not exist. These are exactly the gaps that become builder improvisation and rework. C1 is a CRITICAL.

`VERDICT: REVISE`

The designer must address, before build:
1. **C1** — specify a total `BlockRef → OpenTarget` rule over all of `BlockHostKind` (restrict the block chip to knowledge-hosted, or add host-keyed targets).
2. **W1** — commit AC5 enforcement to a `no-restricted-imports` lint rule (existing infra), not a vague import-graph test.
3. **W2** — resolve `QuestionOption.recommended`: drop it (no source) or surface a Thread-schema dependency.
4. **W3** — collapse the duplicate mention representation to the `mention` Embed only.
5. **W4** — specify `blockAnchor` derivation + confirm `KnowledgeDetail` consumes it, or explicitly defer anchoring to AM5.

NITs N1–N4 are non-blocking but cheap to fold in.
