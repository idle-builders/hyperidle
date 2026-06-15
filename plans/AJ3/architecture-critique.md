# AJ3 — Architecture Critique

**Reviewer persona, Phase 2.** Scores `plans/AJ3/architecture.md` (the designer's plan) cold against the 9-dimension rubric. Evidence-grounded against the live codebase, the AJ3 spec (`TRACK-AJ.md` §AJ3), and `.claude/rules/visual-regression.md`.

**Verdict: APPROVED (Round 2) — overall 9/10.** (Round 1 was REVISE 6.5; all four findings resolved — see "## Round 2" at the bottom.) Round-1 record preserved below for the trail.

**Round 1 verdict: REVISE** — overall **6.5/10**. One CRITICAL: the single code-bearing deliverable (B, the isolation harness) is placed in the wrong package, re-importing `react-router-dom` + `@hyperidle/web` into `packages/design-system`, which contradicts two committed `@lore` decisions (AG4 "no react-router import in design-system"; AJ1-W3 "cross-package coupling avoided" in the DS snapshot net) and duplicates an existing, working precedent in `packages/web`. Everything else — gate rule, park state, scope discipline, buildable-vs-deferred line, skill-edit targeting — is sound and well-evidenced. Fix the harness placement and this is a clean APPROVE.

---

## AC coverage map (8 ACs)

| # | AC (abbreviated) | Plan section | Covered? |
|---|---|---|---|
| 1 | `/design` produces each variant as a live TSX story (not HTML mockup); artifacts = component + spec + screenshot | §3 (Deliverable A) | ✅ Yes |
| 2 | Variant prototyped/annotated as a story rendering **in isolation with fixtures + thin mock providers**, no backend; one story = prototype/annotation/catalog | §2 (Deliverable B), §2.6 mount test | ⚠️ Covered but **misplaced** (see CRITICAL-1) |
| 3 | `/human-design-review` runs after `/design-critique`, gated purely on `DESIGN-CLASS` stakes, no presence check, no re-classify | §4.1 gate table, §5.1 phase insertion | ✅ Yes — gated on `DESIGN-CLASS` only |
| 4 | When it runs: founder annotates elements (incl. positional intent), agent drains MCP feedback, revises, loops to approval | §4.2 wiring, §4.3 loop | ✅ Documented; execution **deferred** (correctly, §8) |
| 5 | A `novel` design in an autonomous run **parks** (`awaiting-human-design-review`) rather than auto-shipping | §5.2 park contract | ✅ Yes — `status`, not `blocked` reason |
| 6 | `/work-planning` (primary) + `/concept` estimate review need at planning time, recorded as highlighted track-doc field | §6.1, §6.2 | ✅ Yes — anchor `Complexity.` line confirmed present |
| 7 | When review does NOT fire (routine), `/design` selects by in-session scoring, pipeline proceeds without blocking | §4.1 (skip rows), §5.1 (skip→Phase 3), §7 | ✅ Yes |
| 8 | Approved variant flows into `/architecture` + `/write-code` as real component code, no HTML→TSX rebuild | §3, §2.7, additive contract | ✅ Yes |

**No AC is unaddressed.** AC2 is the only one with a structural defect (placement), not a coverage gap.

---

## 9-dimension scores

| # | Dimension | Score | Note |
|---|---|---|---|
| 1 | **AC completeness** | 9/10 | All 8 ACs mapped; buildable-vs-deferred line drawn explicitly (§8). |
| 2 | **Layer / boundary integrity** | 5/10 | **CRITICAL-1.** Harness placed in `packages/design-system`, importing `react-router-dom` + `@hyperidle/web` — violates AG4 lore (DS is router-agnostic) and AJ1-W3 lore (DS snapshot net avoids cross-package web coupling). Wrong package; precedent already in `packages/web`. |
| 3 | **Data model / contract fidelity** | 8/10 | `AssistantContextValue` shape (`overlayOpen`/`attachContext`) verified correct against source. Park status field shape pinned. |
| 4 | **Naming honesty** | 9/10 | Nouns sharp, aliases-not-to-use listed. "isolation harness" / "park" / "advisory forecast" all honest. |
| 5 | **Module depth / proportionality** | 6/10 | Harness is over-built for zero current consumers (see WARNING-2). Two-provider scope is otherwise disciplined. |
| 6 | **Scope discipline (no product behavior)** | 9/10 | No product surface touched; annotation tool stays standalone-over-MCP, never bundled (§4.2). Gate-helper marked optional. Strong. |
| 7 | **Failure-mode coverage** | 8/10 | §10 enumerates 6 failure modes with mitigations; graceful degradation (§4.4) is correct. The `⚠️ UNVERIFIED` items are real and flagged — but their default resolution is backwards (see CRITICAL-1). |
| 8 | **Testability / proof honesty** | 8/10 | Mount test is a real test (imports + asserts runtime, not a grep). Buildable-vs-deferred line is honest: live MCP loop correctly deferred to founder walkthrough, not faked. Lint-rule-for-static-property follows CLAUDE.md. |
| 9 | **Task ordering / buildability** | 7/10 | 9 ordered tasks, dependency-correct. Blocked only by CRITICAL-1: task 2's import will fail `npm run check` from DS (`react-router-dom` is not a DS dependency). |

**Overall: 6.5/10 → REVISE** (one CRITICAL drags an otherwise-7.5 plan below the bar).

---

## CRITICAL findings

### CRITICAL-1 — Isolation harness is in the wrong package; violates two committed `@lore` decisions and duplicates an existing precedent
**Section:** §2.2–§2.4 (file layout, `MockProviders.tsx`, coupling decision), task 1–3.

The plan places `MockProviders.tsx` + `fixtures/*` under `packages/design-system/src/` and resolves the coupling question (§2.4) in favour of **Option 1**: import `react-router-dom`'s `MemoryRouter` and `@hyperidle/web`'s `AssistantContext` into design-system. Three hard problems, all verified against the live tree:

1. **Violates `@lore AG4`.** `packages/design-system/src/Breadcrumb.tsx` states verbatim: *"Router-agnostic via injected LinkComponent — **no react-router import in design-system**. Web passes RR's `<Link>`; stories pass plain `<a>`."* The plan's `MockProviders` does exactly the forbidden thing. `packages/design-system/package.json` has **no** `react-router-dom` and **no** `@hyperidle/web` dependency (verified) — so `npm run check` (`tsc --noEmit`) from design-system will not resolve `react-router-dom` (absent from `packages/design-system/node_modules`; only at repo root). Task 2 as written breaks the typecheck gate.

2. **Violates `@lore AJ1-W3`.** `catalog-snapshot.test.tsx` carries the comment: *"NOT the viewer's web-shell/web-component globs (**cross-package coupling avoided**)."* The DS snapshot net was deliberately scoped to `packages/design-system/src/` only, precisely to keep `@hyperidle/web` out of the DS test build. The plan's §2.4 cites the *viewer's* Vite glob (`../../web/src/...`, a relative-path compile-time glob) as precedent — but that is a **Vite build glob of relative paths**, not a bare `@hyperidle/web/...` module specifier resolved through tsc/node in a vitest run. The two are not equivalent; the plan conflates them. The plan's own `⚠️ UNVERIFIED` flag and R1 risk admit this, then default to Option 1 anyway — the wrong default.

3. **Duplicates an existing, working precedent.** The "page-level / data-fed / router-consuming surface mounting in isolation" problem is **already solved** in `packages/web`, where react-router-dom and AssistantContext resolve natively:
   - `packages/web/src/pages/WorkBetCreate.stories.tsx` already wraps in `<MemoryRouter initialEntries={[…]}>` (verified).
   - `packages/web/src/fixtures/` and `packages/web/src/pages/__fixtures__/work-bet-fixtures.ts` already exist as the fixture layer (verified).
   - 10+ web stories (`AppShell`, `Conversations`, `WorkBet`, `AgentProfile`, `SetupFlow`, …) already mount router/context surfaces in isolation today.

   The harness the plan proposes to *create* in design-system largely *exists* in web. AC2 only requires "a story renders in isolation with fixtures + thin mock providers, no backend" — it does **not** require that the harness live in `packages/design-system`.

**Required fix (designer):** Move the isolation harness to `packages/web` (where react-router-dom + AssistantContext are first-party deps and the precedent + fixtures already live), OR keep design-system primitives router-agnostic per AG4 and formalize the *web-side* `MockProviders` + shared-fixtures pattern that already exists, lifting the inline `MemoryRouter` wrappers and `__fixtures__` into one shared `packages/web/src/preview/` module. The mount test then lives in `packages/web` and resolves its imports natively — no AG4/AJ1-W3 violation, no `tsc` resolution gamble, no Option-1/Option-2 hedge. Re-point §2 file layout, §2.4 (delete the coupling dilemma — it evaporates), and tasks 1–3 + 5 accordingly. The `⚠️ UNVERIFIED` react-router-v7 import path is also pre-answered: `packages/web/src/pages/WorkBetCreate.stories.tsx` already imports `MemoryRouter` from `react-router-dom` and renders, so v7's export location is confirmed in-tree.

---

## WARNING findings

### WARNING-1 — Mount test proves the mechanism but task 4 (the only real consumer) is what proves the AC end-to-end; don't let it be optional-feeling
**Section:** §2.6 (mount test), §2.7 + task 4 (opt-in example).

The mount test (§2.6) renders a synthetic `HazardSurface` — a test-local component that uses `useNavigate` + `useContext`. That proves the *providers don't throw*, but it does not prove AC2's "a real page-level / data-fed surface renders in isolation." A test that mounts a fixture you wrote in the same file is weaker than mounting a real surface. **Task 4 (convert one real page-fed story to the harness) is the artifact that actually discharges AC2** — but §9 task 4 reads as a demonstration ("to prove the path end-to-end"), and §10 frames the whole harness as demand-driven. Make task 4 **non-optional** and assert AC2 against a real surface, not just the synthetic `HazardSurface`. Otherwise the harness ships proven-to-not-throw but never proven against a real data-fed page — exactly the gap AC2 names.

### WARNING-2 — Harness has zero current consumers; risk of building infrastructure ahead of demand
**Section:** §2 (whole deliverable B), §2.5 (fixtures).

No existing **design-system** story needs router/context (verified: DS `src/*.stories.tsx` are all presentational). The surfaces that need it already live in `packages/web` and already have ad-hoc wrappers. The plan acknowledges scope-creep risk and says "seed only what task 4 needs" (good), but the deeper question stands: is a *new shared harness* warranted now, or should AJ3 **document the `/design` workflow** ("page-fed variants mount via `<MemoryRouter>` + fixtures, like `WorkBetCreate.stories.tsx`") and formalize the existing web pattern, deferring a dedicated shared module until a second consumer appears? The lighter move satisfies AC2 (the capability exists and is demonstrated) without standing up a package-level abstraction for one consumer. Tie this to the CRITICAL-1 fix: relocating to web makes "reuse the existing pattern" the natural, smaller landing.

---

## NICE findings

- **NICE-1 (§2.7 / §5.1).** The viewer route claim ("story `title` → hash route `:8098/#<StoryTitle>`") is asserted but not re-verified against `viewer/main.tsx`'s `useHashRoute` mapping in this plan. Cheap for the builder to confirm before the `/human-design-review` skill hard-codes the route shape; low risk.
- **NICE-2 (§4.2).** MCP `read_annotations` arg-schema is `⚠️ UNVERIFIED` and the plan correctly instructs run-time MCP introspection rather than hard-coding args. Good. Consider stating the fallback explicitly in the skill: if introspection is unavailable, the agent reports the tool surface it found rather than guessing.
- **NICE-3 (gate-decision helper, task 6).** The optional pure `designReviewDecision(designClass) → run|skip|park` helper is a genuinely cheap, real automated proof of the gate rule (the one mechanical thing that *can* be unit-tested without an LLM run). Recommend promoting it from optional to **included** — it is the only automated proof that the `DESIGN-CLASS → action` mapping is correct, and it costs ~10 lines. Place in `packages/shared/src/`.

---

## What the plan gets right (carry to Phase 4)

- **Gate is purely `DESIGN-CLASS`-driven** (§4.1, §5.1): no new classifier, no presence check, no parallel gate. Matches AC3 + the spec's "do not invent a new classifier, do not add a presence check" exactly.
- **Park is a `status`, not a `blocked` reason** (§5.2): the right call. `awaiting-human-design-review` is intentional-working-as-designed, resolution is "founder runs review" not "bugfix" — folding into `blocked` would lose that signal. Matches AC5 + concept Noun 3.
- **Buildable-vs-deferred line is honest** (§8): the live human-annotation loop is genuinely human-in-the-loop + external-MCP-tool-dependent and is correctly **documented-and-deferred to founder walkthrough**, NOT faked as auto-validated. Everything mechanically buildable (skill edits, gate logic, park status string, planning field, mount test, import guard) is built and code-validated. No pretense. This is the dimension most plans get wrong; AJ3 gets it right.
- **Scope discipline** (§6 scope rules, §10.2/.4): no product behavior touched; annotation tool stays standalone-over-MCP, never added to `package.json`. Matches the track-wide scope rule and AC.
- **Skill-edit targets verified present:** `work-planning` `Complexity.` line (anchor for the new field), `concept` Phase 0 / New-primitive classification, `design-critique` "When This Runs", and the `skill-discovery.md` individual-skills list (where `/human-design-review` must be registered — §9 task 7 correctly calls this out).
- **Stale-spec corrections (§0)** are correct: visual regression IS the vitest DOM-snapshot net (confirmed against `.claude/rules/visual-regression.md`); every "golden PNG / screenshot baseline" phrase in the AJ3 spec text is stale; the plan rightly treats the screenshot as a dev convenience, not the regression baseline.

---

## Verdict

**REVISE — 6.5/10.** One CRITICAL (harness package placement violating AG4 + AJ1-W3 lore and duplicating an existing web precedent) must be fixed before the builder proceeds — as written, task 2 breaks `npm run check` from design-system. Two WARNINGs (make the real-surface proof non-optional; reconsider building a shared harness for zero current consumers). The process design — gate, park, deferral honesty, scope discipline, skill targeting — is strong and needs no change. Fix CRITICAL-1 (relocate to `packages/web`, reuse the existing `MemoryRouter`+`__fixtures__` precedent) and this is a clean APPROVE.

---

## Round 2 — re-critique of the REVISED plan

**Reviewer persona, Phase 2 (round 2).** Re-scored the revised `architecture.md` against round-1 findings, then a fresh full pass. All claims spot-checked against the live tree.

### Round-1 findings — resolution status

| Finding | Resolved? | Evidence |
|---|---|---|
| **CRITICAL-1** — harness in wrong package (`design-system`), re-imports `react-router-dom` + `@hyperidle/web`, violates `@lore AG4` + `AJ1-W3` | ✅ **Resolved** | Harness relocated to `packages/web/src/preview/` (§2.2, §2.3, §5.1 file map, tasks 1–3). `MockProviders` imports `react-router-dom` (first-party web dep) + `../contexts/AssistantContext` — both native in web. §0.5 explicitly states "harness lives in `packages/web`, NOT `packages/design-system`" and cites AG4/AJ1-W3 as the reason DS is excluded. No router/context import lands in `packages/design-system` anywhere in the plan. §2.5 reduced to a tombstone — the coupling dilemma is deleted, not hidden. |
| **WARNING-1** — mount test renders a synthetic `HazardSurface`, doesn't prove AC2's real-surface clause | ✅ **Resolved** | §2.6 + task 2 now render the REAL `WorkBet` page fed by `MOCK_BETS.b1`, asserting the page's real fixture-derived heading (`MOCK_BETS.b1.title`). Explicitly contrasts against the rejected synthetic `HazardSurface` ("A test that mounts a component you wrote in the same file proves only 'providers don't throw'"). It is required ordered task 2, not optional. |
| **WARNING-2** — harness is speculative infra for zero consumers | ✅ **Resolved** | §0.4, §2.1, §10.1 reframe the deliverable as *consolidating 12 existing ad-hoc wrappers* (verified: `WorkBetCreate.stories.tsx` `PageWrapper`, `AgentProfile.stories.tsx` `wrap()`). Ships with one wrapper actually migrated (task 3), removes copy-paste rather than adding an abstraction for zero callers. |
| **NICE-3** — promote gate helper to included | ✅ **Adopted** | B+ promoted to INCLUDED (§1 deliverable table, §5.5, task 4). Path `packages/shared/src/design-review-decision.ts`, exported from `packages/shared/src/index.ts`, unit test `packages/shared/src/__tests__/design-review-decision.test.ts` asserting all three inputs. |

### Live-tree spot-checks (all passed)

- `packages/web/src/pages/WorkBetCreate.stories.tsx` — uses `MemoryRouter` + local `PageWrapper` (line 9, 13–17). The duplication the plan consolidates is real.
- `packages/web/src/pages/AgentProfile.stories.tsx` — uses `MemoryRouter` + `Routes` + local `wrap()` (lines 11, 14–20). Second ad-hoc wrapper confirmed.
- `packages/shared/src/index.ts` — **exists** (9.3KB). B+ export target valid.
- `packages/shared/src/__tests__/` — exists with `*.test.ts` convention (AC1-outcome-types.test.ts, etc.). B+ test lands in an established home.
- `AssistantContextValue` (`AssistantContext.tsx` lines 42–53) — exactly `{ overlayOpen: boolean; attachContext: (ref) => void }`, default `{ overlayOpen: false, attachContext: () => undefined }`. Plan's `DEFAULT_ASSISTANT` is a field-for-field match.
- `WorkBet` (`WorkBet.tsx` line 558) — `WorkBet({ loading, overrideBet }?)`, `useParams` for `betId`, renders `bet.title` as heading (line 937). Mount test is real and buildable: `overrideBet` short-circuits the fetch (line 570), so no network fires.
- `MOCK_BETS.b1.title === "User auth flow"` — fixture-derived assertion is concrete, not invented.
- `eslint.config.ts` — `no-restricted-imports` precedent for `@hyperidle/server` ban (line 428) + `__fixtures__` block (line 284) exists. The `preview/**` guard (task 5) is a copy of an established shape.

### Fresh full-pass check

- **All 8 ACs still covered.** AC2's structural defect (the only round-1 coverage flaw) is fixed: real surface, real fixture, real assertion, required task. AC1/3/5/6/7/8 unchanged and sound. AC4 correctly documented-and-deferred.
- **Buildable-vs-deferred line honest (§8).** B (real-surface mount) + B+ (gate helper) + skill-edit consistency built and code-validated; live MCP annotation loop + autonomous-park-end-to-end deferred to founder walkthrough. No pretense the human loop runs autonomously.
- **No product-behavior change.** All changes in pipeline/skill/web-tooling layer. `preview/` is dev/story/test surface, lint-guarded against server/db. Gate helper is pure logic in `@hyperidle/shared`. No Human Interface ↔ Meta ↔ Agent Runtime boundary crossed.
- **Gate purely DESIGN-CLASS-driven (§4.1, §5.1).** No new classifier, no presence check, no parallel gate. `designReviewDecision(novel) → "run"`; `routine`/`routine-low-conf` → `"skip"`. Park is the orchestrator's mode-conditioned outcome of `run`, correctly NOT folded into the pure helper (naming honesty preserved — §5.5).
- **Park-state correct.** `awaiting-human-design-review` is a `status`, not a `blocked` reason; written to `.pipeline/progress/<id>.json` by the orchestrator; parks one WP, siblings proceed. Matches AC5 + concept Noun 3.

### Round-2 9-dimension scores

| # | Dimension | R1 | R2 | Note |
|---|---|---|---|---|
| 1 | AC completeness | 9 | **9** | AC2 real-surface clause now genuinely discharged. |
| 2 | Layer / boundary integrity | 5 | **9** | CRITICAL-1 resolved — harness in web, native deps, no AG4/AJ1-W3 violation. |
| 3 | Data model / contract fidelity | 8 | **9** | `AssistantContextValue` + `BetDetail`/`MOCK_BETS` + park-status shapes all verified against source. |
| 4 | Naming honesty | 9 | **9** | `designReviewDecision` returns `run\|skip`, deliberately not `park` — honest about where park lives. |
| 5 | Module depth / proportionality | 6 | **9** | Reframed as consolidation of 12 real wrappers; two providers; one story migrated as proof. |
| 6 | Scope discipline | 9 | **9** | No product surface; MCP tool standalone-over-MCP; 11 wrappers deferred to avoid diff balloon. |
| 7 | Failure-mode coverage | 8 | **9** | §10.5 covers snapshot diff, MCP-absent degradation, park-vs-blocked, unverified arg schema, gate drift. |
| 8 | Testability / proof honesty | 8 | **9** | Real-surface mount test + gate-helper unit test + lint guard; deferred line honest. |
| 9 | Task ordering / buildability | 7 | **9** | 7 ordered tasks, dependency-correct, imports resolve natively (no `tsc` gamble). |

### Remaining findings

- No CRITICAL.
- No WARNING.
- **NICE-1 (carry-over, builder watch).** §4.3 / §5.1 viewer route claim ("story `title` → hash route `:8098/#<StoryTitle>`") asserted but not re-verified against `viewer/main.tsx`'s `useHashRoute` mapping. Cheap for the builder to confirm before the `/human-design-review` skill hard-codes the route shape. Low risk, does not block.
- **NICE-2 (carry-over).** MCP `read_annotations` arg schema is `⚠️ UNVERIFIED`; plan correctly instructs run-time MCP introspection rather than hard-coding. Good. Stated in skill (§4.2, R2).

### Verdict (Round 2)

**APPROVED — 9/10.** All four round-1 findings resolved with live-tree-grounded fixes; CRITICAL-1 fully retired (no router/context import in `packages/design-system`; coupling dilemma deleted). All 8 ACs covered, buildable-vs-deferred line honest, no product-behavior change, gate purely DESIGN-CLASS-driven, park-state correct. Two low-risk NICE carry-overs are builder-watch items, not blockers. **Builder proceeds.**
