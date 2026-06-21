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

---
---

# AM1 — Architecture Critique, ROUND 2 (re-review of the revised plan)

**Plan under review:** `plans/AM1/architecture.md` (revised). **Round-1 verdict was REVISE** (1 CRITICAL + 4 WARNINGs + 4 NITs).
**Method:** every claimed fix verified against the branch source, not the prose. Read `host-route.ts`, `thread.ts` (`HOST_KINDS`, `BLOCK_HOST_KINDS`, `BlockRef`, `MentionRef`, `EntityRef`, `QuestionnairePayload`), `blocks/types.ts`, `eslint.config.ts` (L348 block), `KnowledgeDetail.tsx`, `catalog-snapshot.test.tsx` (live floors).

---

## Fix verification (claim → reality)

| # | Round-1 finding | Revised-plan claim | Verified against branch | Holds? |
|---|---|---|---|---|
| **C1** | `block → /knowledge` not total over `BlockHostKind` | Every `BlockRef` → `{route:"host",hostKind,hostId}` resolved via `resolveHostRoute`; no `knowledgeId` fabricated | `host-route.ts` L18-37: `resolveHostRoute(hostKind: HostKind, hostId)` is a **switch with no `default`, every arm returned** → TS-exhaustive over all 8 `HostKind`. `BLOCK_HOST_KINDS` (blocks/types.ts L20-28) = `{bet,task,knowledge_item,artifact,agent,user}` (6) ⊊ `HOST_KINDS` (8). Every `BlockHostKind` member resolves: bet/task/knowledge_item/artifact/agent→path, user→null. No `knowledgeId` minted; `OpenTarget.host.hostKind: BlockHostKind` (L155). AC8 (L301) + Task 2 (L343) now exercise a **bet-hosted** block, so the hole cannot hide. | **YES** |
| **W1** | AC5 named a test where a lint rule belongs; method hand-wavy | Scoped `no-restricted-imports` ESLint block on `PartList.tsx`+`parts/**`, banning `Message`/`InlineRef`/`thread*`/`harness` | `eslint.config.ts` has real `no-restricted-imports` infra with `files:`+`patterns:` (L348 block is the cited precedent; `groups`/`paths` shape used in 10+ blocks). Plan AC5 (L298) + Task 6 (L347) commit to the lint rule as the durable gate, with the two-adapter runtime proof as the executable half. CLAUDE.md rule honored (static import-absence → lint, not vitest grep). | **YES** |
| **W2** | `QuestionOption.recommended` had no source | `recommended`/`QuestionOption` dropped; options are `ReadonlyArray<string>` | `QuestionnairePayload.options: ReadonlyArray<string>` (thread.ts L204) — no per-option metadata. Plan §1.1 (L106), §5 (L261), W2 note (L116) all use `ReadonlyArray<string>`; "Recommended" tag explicitly deferred (no data source, stated not silently dead). No fabricated source remains. | **YES** |
| **W3** | Duplicate mention representation; `MentionRef` leak | `mentions` field removed; mentions are `mention` Embeds only | Plan §1.1 prose variant (L103) carries no `mentions` field; W3 note (L114) states mentions live only as `mention` Embeds `{identityId,displayName}`. `MentionRef` (thread.ts L133, with required `sourceText`) never appears in the Part shape. No `thread.ts` type leaks into `Part`. (Note: adapter must still read `MentionRef.sourceText` for span segmentation — that's adapter-internal, correctly the one place allowed to know `MentionRef`.) | **YES** |
| **W4** | `blockAnchor` had no derivation; destination ignores it | `blockAnchor` dropped; anchoring deferred to AM5 | `KnowledgeDetail.tsx` reads `useParams<{knowledgeId}>` (L268) ONLY — no `useSearchParams`/`hash`/`location` anchor consumption. The `data-block-id` querySelector (L697,709) is driven by in-page actions, not a route param. Dropping `blockAnchor` is correct (the destination genuinely ignores any anchor today) — not a regression of the design promise; the §1.3 note (L170) + §6 note (L282) defer anchoring to AM5 explicitly. | **YES** |
| **N1** | AC8 page-test asserted a string map, not navigation | Spy `navigate`, assert it is **called** with resolved path; null route → no call | AC8 (L301) + Task 8 (L349) assert `navigate` is called per `OpenTarget` and that `host`+`user` (null) does **not** call it. Real wiring proof, not a format fn. | **YES** |
| **N2** | Task 10 OR-clause (unresolved-then-resolved) | OR-clause removed | Task 10 (L351) states only "ConversationSurface composes `<PartList>`". No value-free optionality. | **YES** |
| **N3** | `unknown` reason read as dead defensive code | Tied to a concrete deserialization-drift source | §1.1 (L120) ties `wire-unrecognised-type` to over-the-wire deserialization (forward-compat server message type ahead of the web client) — a genuine boundary the TS exhaustiveness check cannot prove unreachable. Justified, not slop. | **YES** |
| **N4** | Enumeration-guard floor unnamed | Bump floors +2 for the 2 promoted DS stories | Live floors: `catalog-snapshot.test.tsx` L73 `≥59`, L223 `≥58`. Plan AC6 (L299) + Tasks 3-4 (L344-345) name the new floors `≥61`/`≥60` — exactly +2. Correct. | **YES** |

All 9 round-1 findings are genuinely resolved against the branch. C1 — the sole CRITICAL — is now provably total over `BlockHostKind` via an existing, TS-exhaustive resolver. No rubber-stamp: each fix traced to source.

---

## NEW finding (surfaced by the C1 fix, not present in round-1)

### W5 (WARNING, new) — `entity-ref` → `OpenTarget` is not total over `EntityRef.kind`; the `"message"` member has no mapping rule
**Location:** §1.2 Embed `entity-ref` (L139 `entityKind: EntityRef["kind"]`); mapping prose §1.2 (L143) and §2.1 (L183).

`EntityRef.kind = "knowledge_item" | "task" | "artifact" | "bet" | "message"` (thread.ts L112). The plan specifies a target rule for four of the five: `artifact → {route:"artifact"}`; `knowledge_item`/`bet`/`task → {route:"host"}`. The fifth, **`"message"`, has no rule**. It cannot use `{route:"host"}` either — `OpenTarget.host.hostKind` is typed `BlockHostKind` (L155), which does **not** include `"message"` (it's not a host kind). So the same totality class the C1 fix closed for the `block` path remains open one path over, in `entity-ref`. The adapter as written cannot be implemented for a `message`-kind `EntityRef` without an undocumented decision (drop to `unknown`/skip the Embed? a future message-permalink route?).

This is narrower than round-1 C1 (cross-message references are an edge case, and `MESSAGE_TYPES`/`InlineRef` already support `message` EntityRefs today via `renderRefEmbeds`), so it is a **WARNING, not a CRITICAL** — but it is the exact "adapter not provably total → builder improvises" gap `/architecture` exists to prevent. **Fix:** state the rule for `EntityRef.kind === "message"` (recommend: map to an `unknown`/dropped Embed in AM1 with a note that message-permalink routing is out of scope, OR add a `{route:"message"}` target if a destination exists). One sentence; no schema change.

---

## NIT (new, non-blocking)

- **N5** — Required-reading L19 cites `packages/web/src/services/host-route.js`; the file is `host-route.ts` (the reconciliation table L42 cites `.ts` correctly). Cosmetic; fix the `.js` typo.

---

## Re-score (9 dimensions)

| # | Dimension | R1 | R2 | Note |
|---|---|---|---|---|
| 1 | Spec/contract fidelity | 7 | 8 | C1 + W2 holes closed; ACs intact. −1 lingering: W5 entity-ref `message` member. |
| 2 | Type-model soundness | 6 | 8 | `host` target total over `BlockHostKind`; `recommended` dropped; mention dup collapsed. −1: `entity-ref` union not total over `EntityRef.kind` (W5). |
| 3 | Boundary / layer integrity | 8 | 9 | AC5 now a real build-time lint rule on the cited infra; renderer imports `Part` only. |
| 4 | Verification rigor | 6 | 8 | AC5 → lint rule; AC8 → real `navigate` spy incl. non-knowledge host + null-route no-op. |
| 5 | Reuse vs duplication | 8 | 8 | Unchanged — `groupParts`, `ReferenceChip`/`Fold` promotion, one `onOpen`. |
| 6 | Routing-seam design | 6 | 8 | `host` seam provably exhaustive via existing resolver; `blockAnchor` correctly deferred. −1: W5. |
| 7 | Security posture | 8 | 8 | Unchanged — render-only, sanitizer reuse, React-escaped chip text, honest N/A grid. |
| 8 | Task atomicity / sequencing | 8 | 8 | Tasks updated to encode C1/W1/N4; dependency note intact. |
| 9 | Risk surfacing / self-critique | 8 | 8 | Critique-resolution log (L373) is honest and traceable. (W5 not self-caught — same blind spot class as the original C1, hence not 9.) |

**Overall: 8.1/10** (mean 8.1). No CRITICAL. One new WARNING (W5, narrow, one-sentence fix).

---

## VERDICT

The revision is genuine, not cosmetic. The CRITICAL (C1) is fully closed against a TS-exhaustive existing resolver, no `knowledgeId` is fabricated, and the AC8 test exercises a non-knowledge-hosted block so the totality can't regress silently. All 4 WARNINGs and all 4 NITs are resolved and verified against branch source. One new WARNING (W5) surfaced as a sibling of the C1 fix — the `entity-ref` `"message"` member has no total mapping — but it is narrow, edge-case, and a one-sentence fix; it does not block the build (the load-bearing block path is total, and the builder has a documentable default).

Overall ≥7, no CRITICAL → build may proceed. The designer should fold W5 (and N5) into the plan before or during Task 2 (the adapter), where the `entity-ref` mapping is implemented.

`VERDICT: PASS (score 8/10)`
