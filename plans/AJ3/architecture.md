# AJ3 — Architecture

**Workpackage:** AJ3 — Design variants are real TSX, reviewed and annotated in the browser.
**Concept input:** `plans/AJ3/concept.md` (four process nouns; reads `DESIGN-CLASS`, never re-derives).
**`/design` skipped:** AJ3 has **no product UI surface**. Its "Human design review" field is **No** — it builds review *tooling* (viewer/annotation wiring + a fixtures/mock-provider layer), not a new base component or page. The only "UI" is the isolation harness, which is plumbing, not a designed surface. No variants to explore. → skip `/design`, skip `/design-critique`.

---

## 0. Ground-truth corrections this plan is built on (trust over stale spec)

The AJ3 spec text predates AJ1's redo and is partly stale. This plan is built on the corrected reality:

1. **Visual regression = vitest DOM-snapshot net**, not Playwright golden PNGs. File: `packages/design-system/src/__tests__/catalog-snapshot.test.tsx`. No Docker, no Playwright in the gate, no screenshots in CI. (`.claude/rules/visual-regression.md`.) Every "golden PNG / screenshot baseline" phrase in the AJ3 spec is stale.
2. **AJ1 is done.** `packages/design-system/html/` is gone; `visual-parity.md` is gone; the viewer's HTML toggle is gone. Variants are authored as `.stories.tsx` and render live at `:8098`.
3. **`/human-design-review` does not exist** — this WP creates it.
4. **A shared mock-provider layer does not yet exist — but the *pattern* already does, in `packages/web`, ad-hoc and duplicated.** This WP **consolidates** it, it does not invent it. Verified in-tree:
   - `packages/web/src/pages/WorkBetCreate.stories.tsx` wraps in `<MemoryRouter initialEntries={["/work/bet/new"]}>` via a local `PageWrapper`.
   - `packages/web/src/pages/AgentProfile.stories.tsx` wraps in `<MemoryRouter>` + `<Routes>` via a local `wrap()` helper.
   - **12** web stories (`AssistantOverlay`, `ArtifactSection`, `ArtifactThreadsSummary`, `RecipientPicker`, `AgentProfile`, `KnowledgeCreate`, `WorkBetCreate`, `WorkTeam`, `WorkRoutine`, `Conversations`, `SetupFlow`, `WorkTask`) already mount router/context surfaces in isolation today, each with its own copy-pasted wrapper.
   - Fixture layer already exists too: `packages/web/src/pages/__fixtures__/work-bet-fixtures.ts` (`MOCK_BETS`/`FALLBACK_BET`) and `packages/web/src/fixtures/knowledge-data.ts`.
   - `packages/web` has `react-router-dom@^7.14.1` as a first-party dep and owns `AssistantContext` (`packages/web/src/contexts/AssistantContext.tsx`) — so router + context imports resolve natively. `packages/web/src/__tests__/WorkBet.test.tsx` already mounts a real page through `<MemoryRouter>` in jsdom.

   The deliverable is therefore: **extract one shared, documented `packages/web/src/preview/MockProviders` module from the existing duplicated wrappers**, give it a mount test, and point `/design` at it. Real current consumers, not speculative infrastructure.

A Playwright screenshot of the *running viewer* remains a fine dev convenience for a design artifact — it is NOT the regression mechanism.

5. **The harness lives in `packages/web`, NOT `packages/design-system`.** `packages/design-system` is router-agnostic by committed decision (`@lore AG4`: *"no react-router import in design-system"* — `Breadcrumb.tsx` injects `LinkComponent` instead) and `package.json` has neither `react-router-dom` nor `@hyperidle/web` as a dependency, so importing `MemoryRouter`/`AssistantContext` there would break `npm run check` from design-system. The DS snapshot net is also deliberately scoped to `packages/design-system/src/` only (`@lore AJ1-W3`: *"cross-package coupling avoided"*). DS stories are all presentational (props + noop callbacks) and need no harness. The router/context hazard is a **web** problem; the harness is a **web** module. This resolves the earlier "which package" question outright — there is no coupling dilemma.

---

## 1. Deliverables A–F → file map

| # | Deliverable | Kind | Files |
|---|---|---|---|
| A | Rewrite `/design` (TSX variants in isolation, retire `mockup.html` + screenshot-baseline staleness) | skill doc | `.claude/skills/design/SKILL.md` |
| B | Isolation harness (shared mock providers, consolidated from existing web wrappers) + proving test + one real-surface opt-in | **CODE** | `packages/web/src/preview/MockProviders.tsx`, `packages/web/src/preview/index.ts`, `packages/web/src/preview/MockProviders.test.tsx`, reuse `packages/web/src/pages/__fixtures__/*` + `packages/web/src/fixtures/*`, convert one existing page story to render through it |
| B+ | Gate-decision helper (`DESIGN-CLASS → run\|skip`; park is orchestrator-conditioned, see § 5.5) + unit test | **CODE** | `packages/shared/src/design-review-decision.ts`, `packages/shared/src/__tests__/design-review-decision.test.ts`, export from `packages/shared/src/index.ts` |
| C | New `/human-design-review` skill | skill doc | `.claude/skills/human-design-review/SKILL.md` |
| D | Pipeline park-for-review phase | skill doc | `.claude/skills/pipeline/SKILL.md` |
| E | Planning-time review estimate | skill docs | `.claude/skills/work-planning/SKILL.md`, `.claude/skills/concept/SKILL.md` |
| F | `/design-critique` minor update (slot conditional phase after it) | skill doc | `.claude/skills/design-critique/SKILL.md` |

**The code-bearing deliverables are B and B+.** A, C, D, E, F are markdown skill edits. B gets an automated mount test against a *real* page surface; B+ gets a pure-function unit test. C's live annotation loop is **documented-and-deferred** (see § 8).

---

## 2. Deliverable B — the shared isolation harness (consolidate the existing web wrappers)

### 2.1 Why a harness at all, and why it's a *consolidation*

Presentational stories work because data arrives as props and callbacks are noops (`TaskSheet`, `GlobalSearchPanel`, all DS primitives). A **page-level surface** that reaches for `useNavigate()`/`useParams()` (react-router v7) or `useContext(AssistantContext)` throws or returns broken values when mounted bare. The fix already exists in `packages/web` — but as **12 duplicated ad-hoc wrappers** (`PageWrapper` in `WorkBetCreate.stories.tsx`, `wrap()` in `AgentProfile.stories.tsx`, and 10 more). AJ3's deliverable is to **extract one shared `MockProviders` module** from that duplication, document it, give it a mount test, and point `/design` at it. This is not new infrastructure — it has 12 current consumers and removes copy-paste.

The harness must NOT boot the real app (`router.tsx`, real data layer) — that would drag in a backend and defeat the no-backend contract. It is the thinnest shim that makes `useNavigate`/`useContext` not throw.

### 2.2 File layout (exact) — lives in `packages/web`

```
packages/web/src/
├── preview/
│   ├── MockProviders.tsx          # the shared mock-provider shim (router + AssistantContext)
│   ├── index.ts                    # re-exports MockProviders (+ types); the /design entry point
│   └── MockProviders.test.tsx      # PROVES a REAL page surface mounts w/o backend (the AC2 test)
├── pages/__fixtures__/             # EXISTING — reuse work-bet-fixtures.ts; add demand-driven only
└── fixtures/                       # EXISTING — knowledge-data.ts etc.; add demand-driven only
```

`packages/web` is the right home: it owns `react-router-dom@^7.14.1` (first-party dep) and `AssistantContext` (`packages/web/src/contexts/AssistantContext.tsx`), so all imports resolve natively under `tsc`/vitest — no cross-package gamble, no `@lore AG4`/`AJ1-W3` violation. Fixtures already live in web (`pages/__fixtures__/`, `fixtures/`) and are governed by the existing `__fixtures__` import boundary (`@lore L16 AC-3`; eslint `no-restricted-imports` block) — no new fixtures package, no `mock-inventory`/`demo-fixture-guard` interaction to re-check (those target production *imports* of fixtures, which stories/tests are exempt from).

### 2.3 `MockProviders.tsx` — the shim (imports resolve natively in web)

```tsx
// packages/web/src/preview/MockProviders.tsx
import type { ReactNode, JSX } from "react";
import { MemoryRouter } from "react-router-dom";
import { AssistantContext, type AssistantContextValue } from "../contexts/AssistantContext";

export interface MockProvidersProps {
  children: ReactNode;
  /** Initial router entry; defaults to "/". Lets a story mount at a route. */
  route?: string;
  /** Override the assistant context; defaults to the no-op stable default. */
  assistant?: Partial<AssistantContextValue>;
}

const DEFAULT_ASSISTANT: AssistantContextValue = {
  overlayOpen: false,
  attachContext: () => undefined,
};

export function MockProviders({ children, route = "/", assistant }: MockProvidersProps): JSX.Element {
  return (
    <MemoryRouter initialEntries={[route]}>
      <AssistantContext.Provider value={{ ...DEFAULT_ASSISTANT, ...assistant }}>
        {children}
      </AssistantContext.Provider>
    </MemoryRouter>
  );
}
```

**Provider list rationale.** Exactly two providers cover the two real isolation hazards: react-router hooks (`useNavigate`/`useParams`/`<Link>`) → `MemoryRouter`; `AssistantContext` consumers → a Provider seeded from the context's own stable default (the exact `{ overlayOpen: false, attachContext: () => undefined }` default verified in `AssistantContext.tsx`). Adding more providers speculatively violates "thinnest shim." A surface needing a route param (`useParams`) wraps the children in `<Routes><Route path=… element=…/></Routes>` itself (as `AgentProfile.stories.tsx` does today) — `MockProviders` provides the router, the story provides its own route match when needed. If a future surface needs a third context, the builder adds it then, same "smallest thing that stops a throw" bar.

**Import path is VERIFIED, not unverified.** `packages/web/src/pages/WorkBetCreate.stories.tsx` already imports `MemoryRouter` from `react-router-dom` and renders in the viewer + in `WorkBet.test.tsx` under jsdom. react-router v7's `MemoryRouter` export location is confirmed in-tree — no `⚠️ UNVERIFIED` flag needed.

### 2.4 Fixtures — reuse existing, grow demand-driven

The fixture layer **already exists** in web and is import-boundary-guarded:
- `packages/web/src/pages/__fixtures__/work-bet-fixtures.ts` exports `MOCK_BETS` / `FALLBACK_BET` (typed `BetDetail`).
- `packages/web/src/fixtures/knowledge-data.ts` for knowledge surfaces.

The real-surface opt-in (§ 2.6) **reuses** these — it imports an existing fixture, it does not author a new one. Seed a new fixture only if the chosen opt-in surface has no existing fixture. Do NOT pre-build fixtures for surfaces that aren't yet consumed — that is the scope creep WARNING-2 names. The layer grows demand-driven; AJ3 adds at most what its one opt-in surface needs.

### 2.5 (reserved — coupling dilemma deleted)

The earlier "which package / cross-package coupling" question is **resolved by relocation**: the harness lives in `packages/web`, where `react-router-dom` and `AssistantContext` are first-party. There is no Option-1/Option-2 import hedge, no `tsc`-resolution gamble, no `@lore AG4`/`AJ1-W3` tension. Section intentionally left as a tombstone so downstream readers know the dilemma was retired, not forgotten.

### 2.6 The proving test (the automated AC for B) — mounts a REAL page surface

**File:** `packages/web/src/preview/MockProviders.test.tsx` (`*.test.tsx` → component lane, runs in `npm run test`).

The test must discharge **AC2** directly: *a page-level or data-fed surface mounts via thin mock providers, no server/db/real data.* It therefore mounts a **real web page**, fed by an **existing fixture**, through `MockProviders` — NOT a synthetic test-local `HazardSurface`. (A test that mounts a component you wrote in the same file proves only "providers don't throw"; mounting a real data-fed page is what proves the AC.) Concretely, render `WorkBet` (or another existing page that consumes router + accepts an override-data prop), seeded from `MOCK_BETS`:

```tsx
// @vitest-environment jsdom — packages/web/src/preview/MockProviders.test.tsx
import { render, screen } from "@testing-library/react";
import { Route, Routes } from "react-router-dom";
import { expect, test } from "vitest";
import { MockProviders } from "./index";
import { MOCK_BETS } from "../pages/__fixtures__/work-bet-fixtures";
import { WorkBet } from "../pages/WorkBet";

test("a real data-fed page surface mounts via mock providers, no backend", () => {
  render(
    <MockProviders route={`/work/bet/${MOCK_BETS.b1!.id}`}>
      <Routes>
        <Route path="/work/bet/:betId" element={<WorkBet overrideBet={MOCK_BETS.b1} />} />
      </Routes>
    </MockProviders>,
  );
  // Asserts against the REAL surface: the page rendered its real heading from fixture data.
  expect(screen.getByRole("heading", { name: MOCK_BETS.b1!.title })).toBeInTheDocument();
  // (No server, no db, no network — only react-router-dom + AssistantContext + the fixture.)
});
```

This is a real test: it imports application code (`WorkBet`, `MockProviders`, the fixture) and asserts the rendered DOM of a real page — not a grep, not a `not.toThrow()`. It runs in the fast lane, jsdom, no browser. The assertion is against fixture-derived content the page actually renders, so it would fail if `MockProviders` failed to supply the router or context the page needs.

**Structural guard (static property → lint rule).** Add an ESLint `no-restricted-imports` block scoped to `packages/web/src/preview/**` forbidding `@hyperidle/server` and `@hyperidle/db` — the preview module must never reach a backend. Implement by copying the shape of the existing `__fixtures__` `no-restricted-imports` block in `eslint.config.ts`. Per CLAUDE.md, a static "must not import X" property is a lint rule, not a test.

### 2.7 How a real story opts in (and the 12 existing wrappers migrate)

A page-level variant story wraps its render via the shared module instead of a local copy:

```tsx
// packages/web/src/pages/WorkBetCreate.stories.tsx (after consolidation)
import { MockProviders } from "../preview";
export const EmptyState = () => (
  <MockProviders route="/work/bet/new"><WorkBetCreate /></MockProviders>
);
```

Discovery is unchanged — `discoverStories` (`viewer/discovery.ts`) picks up any named export that is a function; the viewer + the DOM-snapshot net render it identically. The harness is a wrapper component, not a new render mode, so **no viewer change**.

**Migration scope discipline.** AJ3 must (a) ship `MockProviders` + its test, and (b) convert **one** existing page story (the opt-in example, e.g. `WorkBetCreate.stories.tsx`) to use it, proving the consolidation path end-to-end *and* discharging AC2's "real surface" via a catalogued story. The other 11 ad-hoc wrappers are documented as the migration target but **not** all rewritten in AJ3 (that would balloon the diff + force a snapshot re-bless across 11 stories for zero behavior change). Converting one is the proof; the rest migrate opportunistically. Re-bless the DOM-snapshot net only for the one converted story, after reading the diff (`.claude/rules/visual-regression.md`) — the wrapper change is DOM-affecting only if it alters the rendered tree; `MemoryRouter` renders no extra DOM, so the diff should be empty or trivial. Enumeration guard (≥56 DS stories) is unaffected — web stories are not in the DS catalog count.

---

## 3. Deliverable A — rewrite `/design`

Edit `.claude/skills/design/SKILL.md`. Keep the spine (multi-variant discipline: novel=3, routine=1, routine-low-conf=2; anti-convergence; 9-dim critique gate; the `DESIGN-CLASS:` greppable line). Change the **medium and isolation**:

- **Variant artifact = `.stories.tsx` rendered in isolation + spec + screenshot of the live render.** One story = prototype = annotation surface = (post-build) catalog entry. Already-present `variant.tsx` language → formalize as a `.stories.tsx` export discovered by the viewer.
- **Replace** Phase-1 output `variant.tsx` (temporary story export) with: author the variant as a `.stories.tsx` story that renders **in isolation** — DS primitives render bare; a page/data/context surface (which lives in `packages/web`) wraps in `<MockProviders>` from `packages/web/src/preview` + an existing fixture. State the rule: *no design needs a backend, routing, or real data to be shown and annotated.* Cross-reference `WorkBetCreate.stories.tsx` as the canonical example of a page-fed variant mounting via `MockProviders`.
- **Remove screenshot-baseline staleness.** The `screenshot.png` step stays as a *dev convenience* (`npx playwright screenshot http://localhost:8098/#<Story>`), explicitly labelled "a looked-at artifact for the critique, NOT the regression baseline — regression is the DOM-snapshot net." Strip any implication that the screenshot is a golden baseline.
- **Add a one-line pointer** to the new `/human-design-review` phase: after `/design-critique`, a `novel` `DESIGN-CLASS` triggers human review (cross-reference, do not duplicate the gate logic).
- Update the Output-artifacts tree: `variant.tsx` → `<Story>.stories.tsx` (or keep `variant.tsx` filename but state it must be a discoverable story module).

**Do not** change the routine/novel classifier or the `DESIGN-CLASS` line format — downstream (`/human-design-review`, pipeline) reads it verbatim.

---

## 4. Deliverable C — `/human-design-review` skill

New file `.claude/skills/human-design-review/SKILL.md`. Front-matter: `name: human-design-review`, `user-invocable: true`, `description` per the concept. Structure:

### 4.1 When it runs (the gate)

| `DESIGN-CLASS` | `/human-design-review`? |
|---|---|
| `novel` | **Runs** (or parks — see § 5) |
| `routine` | Skipped |
| `routine-low-conf` | Skipped |

The trigger is **read** from the `DESIGN-CLASS:` line `/design` emits — no re-classification, no presence check, no parallel gate. (Concept § Noun 1 "What it is NOT.")

### 4.2 The annotation-tool wiring (verified facts)

Primary: **Vibe Annotations** (Chrome extension + local MCP server, MIT, localhost-only). Fallback: **MCP Pointer** (MIT, captures React component → source file).

| | Vibe Annotations (primary) | MCP Pointer (fallback) |
|---|---|---|
| Start server | `vibe-annotations-server start` | `npx -y @mcp-pointer/server@latest start` |
| Port / transport | `http://127.0.0.1:3846/mcp` (HTTP) | WebSocket `:7007` |
| Register w/ Claude Code | `claude mcp add --scope user --transport http vibe-annotations http://127.0.0.1:3846/mcp` | `npx -y @mcp-pointer/server config claude` |
| MCP tools (agent drains queue) | `read_annotations` (list pending, URL filter + pagination), `watch_annotations` (long-poll for new), `delete_annotation` (remove after fix) | `get-pointed-element` (returns text info on currently pointed element) |

Sources (verified June 2026): https://www.vibe-annotations.com/docs/mcp-setup , https://github.com/RaphaelRegnier/vibe-annotations , https://github.com/etsd-tech/mcp-pointer , https://www.npmjs.com/package/@mcp-pointer/server . These are *adopted* tools wired over MCP — **never bundled into HyperIdle** (TRACK-AJ scope rule: "standalone dev tool wired over MCP, never a dependency embedded in HyperIdle's bundle"). The skill documents the one-time `claude mcp add` wiring; it adds nothing to `package.json`.

⚠️ **UNVERIFIED nuance:** exact `read_annotations` argument schema (URL-filter param name, pagination shape) is from the docs page summary, not a hands-on call. The skill states the tool *names and intent* (verified) and instructs the agent to introspect the live tool schema via MCP at run time rather than hard-coding arguments. MCP Pointer's `get-pointed-element` optional params (`textDetail` 0–2, `cssLevel` 0–3) are documented but should likewise be confirmed live.

### 4.3 The loop (when it fires, founder present)

```
1. Serve the variant: `npm run ds:serve` → viewer at :8098.
   Each variant's route is the hash route for its story: http://localhost:8098/#<StoryTitle>.
   (discovery.ts maps the story module `title` → hash route; main.tsx's useHashRoute renders it.)
2. Founder opens that route, annotates elements (incl. positional intent "move this here").
3. Agent drains the queue: `read_annotations` (filter by the viewer URL), or `watch_annotations` to long-poll.
4. Agent revises the corresponding TSX (the real component/story), `delete_annotation` per resolved note.
5. Re-render (viewer hot-reloads); founder re-inspects.
6. Repeat until founder approves. On approval → write approved.md, proceed to /architecture → /write-code.
```

Each variant's viewer route is served by the existing viewer (no new server) — the story `title` is the hash route. The agent filters `read_annotations` by that URL so it only drains notes for the variant under review.

### 4.4 Graceful degradation (no annotation tool present)

The skill MUST define the autonomous/degraded path:

- **Autonomous run, `novel` design** → does NOT attempt annotation. **Parks** (§ 5). This is the spec's hard rule: high-stakes design is not autonomously shippable.
- **Interactive run, but no annotation MCP server reachable** → degrade: the agent detects the MCP tool is absent (the `claude mcp add` wiring was never done), and falls back to the **prose-on-screenshot** channel (`npx playwright screenshot` of the variant + founder writes markdown feedback), looping the same approve/revise cycle without spatial anchoring. It logs that spatial annotation was unavailable. It does NOT hard-fail and does NOT auto-approve.

### 4.5 What this skill is NOT (carry from concept)

Not `/design-critique` (agent rubric), not `/visual-polish` (post-build fidelity), not presence-gated, not a new classifier. One-line each, cross-referencing concept.

---

## 5. Deliverable D — pipeline park-for-review

Edit `.claude/skills/pipeline/SKILL.md`. Slot the conditional phase **after Phase 2 critique, before Phase 3 (write-tests)**.

### 5.1 Phase insertion

In the 6-phase table and the persona-dispatch block, after `/design-critique` add:

The stakes half of the gate is the unit-tested `designReviewDecision(DESIGN-CLASS)` helper (§ 5.5, `@hyperidle/shared`): `"skip"` → proceed; `"run"` → enter the mode-conditioned branch below. The doc references the helper as the source of truth for the mapping; the orchestrator owns only the mode-conditioned run-vs-park split.

```
Phase 2.5 — human-design-review (conditional, stakes-gated):
  Read DESIGN-CLASS from the design output (the line /design emitted).
  decision = designReviewDecision(DESIGN-CLASS)   // @hyperidle/shared, unit-tested
  ├─ decision == "skip"  (routine | routine-low-conf) → SKIP silently, proceed to Phase 3.
  └─ decision == "run"   (novel):
       ├─ Autonomous run (default; PIPELINE_INTERACTIVE != "1" OR no annotation tool):
       │    → PARK. Write .pipeline/progress/<id>.json:
       │        status = "awaiting-human-design-review",
       │        currentStep = "human-design-review",
       │        reason = "novel design requires founder review",
       │        parkedAt = <now>.
       │    → STOP this WP's pipeline progression (do NOT dispatch write-tests/code/ship).
       │      Other WPs in the batch proceed.
       └─ Interactive run with annotation tool:
            → dispatch designer to run /human-design-review (annotate→revise→approve loop).
            → on founder approval, proceed to Phase 3.
```

### 5.2 Park-state contract

- **Status value:** `awaiting-human-design-review` (a `status`, NOT a `blocked` reason — concept § Noun 3). Distinct from `blocked` because it is intentional (working as designed) and its resolution is "founder runs the review," not a bugfix.
- **Where set:** the pipeline orchestrator writes `.pipeline/progress/<id>.json` at the Phase 2.5 gate. This is the orchestrator's owned file (pipeline state contract).
- **Effect:** the WP does not advance to build/ship. The final human summary lists it as `parked: awaiting human design review` — distinct from `done` and `blocked`.

### 5.3 Why park, not ship

The pipeline's default stance is "no human, never pause." AJ3's deliberate exception (stated in TRACK-AJ § 5 and § AJ3 contracts): **a `novel` design must not auto-ship unreviewed.** Park is the mechanism. This is the *one* place the autonomous pipeline yields to stakes rather than presence. The pipeline doc must state this exception explicitly so a future agent does not "optimize" the park away to keep the run unattended-green.

### 5.4 Interaction with AJ2's `PIPELINE_INTERACTIVE`

`/human-design-review` is **stakes-gated, not mode-gated**. But mode affects the *novel* branch outcome: interactive + tool present → loop; otherwise → park. Autonomous mode never runs the interactive loop; it parks. The canonical `PIPELINE_INTERACTIVE` rule (defined once in `pipeline/SKILL.md`) is referenced, not re-derived. Park happens whenever the loop can't run for a novel design — whether because mode is autonomous or the tool is absent.

### 5.5 Gate-decision helper (B+ — the unit-tested source of truth for the mapping)

The `DESIGN-CLASS → action` mapping the pipeline doc encodes (§ 5.1) gets a single, importable, unit-tested function so the rule cannot silently drift between the doc and any future caller:

```ts
// packages/shared/src/design-review-decision.ts
export type DesignClass = "novel" | "routine" | "routine-low-conf";
export type DesignReviewDecision = "run" | "skip" | "park";

/**
 * Pure gate rule: maps a /design DESIGN-CLASS to the human-design-review action.
 * `run`  → novel design, review/loop applies (caller decides loop-vs-park by mode+tool).
 * `skip` → routine or routine-low-conf, proceed straight to build.
 * `park` is NOT returned here — it is the orchestrator's mode-conditioned outcome of `run`
 *   in an autonomous/no-tool run. This function encodes ONLY the stakes mapping.
 */
export function designReviewDecision(designClass: DesignClass): DesignReviewDecision {
  return designClass === "novel" ? "run" : "skip";
}
```

**Path decision.** Lives in `packages/shared/src/design-review-decision.ts`, exported from `packages/shared/src/index.ts` (shared is the home for cross-cutting pure logic + the `*_CLASS` vocabulary; the pipeline orchestrator and any future caller can import `@hyperidle/shared`). Unit test `packages/shared/src/__tests__/design-review-decision.test.ts` asserts all three inputs: `novel → "run"`, `routine → "skip"`, `routine-low-conf → "skip"`. This is a real test (imports the function, asserts the return) and the only mechanical proof of the gate rule available without an LLM run.

**Naming honesty.** The function returns `"run" | "skip"` — it deliberately does NOT return `"park"`, because park is not a property of the design class; it is a property of (novel **and** no founder/tool). Folding park into this pure function would lie about where the decision lives. The pipeline doc (§ 5.1) references this helper for the stakes half and keeps the mode-conditioned park half as orchestrator logic. The `DesignReviewDecision` type name is honest about being the *gate* decision, not the *final* action.

---

## 6. Deliverable E — planning-time review estimate

### 6.1 `/work-planning` (primary)

Edit `.claude/skills/work-planning/SKILL.md`:
- Add **"Human design review."** to the spec template (§ Output contract), right after **Complexity.**, as a **highlighted required field**: `**Human design review.** Yes | No — <one-line reason: new essential/base/primitive component or large redesign → Yes; otherwise No>.`
- Add a pre-flight estimate step: at registration, the founder forecasts whether the WP introduces a new essential/base/primitive component or a large redesign → `Yes`, else `No`.
- State the **advisory contract**: this is a *forecast*; the authoritative trigger is `/design`'s `DESIGN-CLASS` at design time. A `No` forecast does not suppress review if `/design` later classifies `novel`.

This formalizes the convention TRACK-AJ already shows (every AJ WP carries the field). AJ3 makes it template-mandatory.

### 6.2 `/concept` (where it runs)

Edit `.claude/skills/concept/SKILL.md`: add a short note that when concept work reveals a New primitive / essential component (Phase 0 classification), `/concept` may **refine** the planning-time "Human design review" forecast to `Yes` in the track doc (since concept is where new nouns/components first surface). Keep it advisory — `DESIGN-CLASS` still decides.

---

## 7. Deliverable F — `/design-critique` minor update

Edit `.claude/skills/design-critique/SKILL.md`: add one line at the end of "When This Runs" / output: *After critique completes, if `DESIGN-CLASS == novel`, the conditional `/human-design-review` phase runs next (pipeline Phase 2.5); for routine/routine-low-conf the pipeline proceeds straight to build.* No scoring-logic change — critique stays agent-vs-agent rubric scoring; it just hands off to the new conditional phase.

---

## 8. Buildable here vs documented-and-deferred (draw the line clearly)

Per TRACK-AJ's track-wide proof bar — process WPs are "proven by founder walkthrough of a real run" — and the honest autonomous-proof reality:

### Built + code-validated in this run (gets automated proof)
- **B — shared isolation harness (in `packages/web`):** `packages/web/src/preview/{MockProviders.tsx,index.ts}` + one converted page story. **Automated test** `packages/web/src/preview/MockProviders.test.tsx` mounts a **real data-fed page** (`WorkBet` + `MOCK_BETS` fixture) through `MockProviders` with no backend and asserts on the page's real rendered heading — directly discharging AC2. Lint rule (eslint `no-restricted-imports` scoped to `preview/**`) proves no server/db import. `npm run verify` green.
- **B+ — gate-decision helper:** `packages/shared/src/design-review-decision.ts` exports `designReviewDecision(designClass) → "run" | "skip"` with a unit test (`packages/shared/src/__tests__/design-review-decision.test.ts`). The single automated proof that the `DESIGN-CLASS → action` stakes mapping is correct (the one mechanical thing testable without an LLM run; park is the orchestrator's mode-conditioned outcome of `run`, not a return value — see § 5.5). See § 5.5 + § 9 task 4.
- **A, C, D, E, F — skill docs:** all markdown edits land and are internally consistent (gate table, park status value, MCP wiring, graceful degradation, planning field, cross-references). Validated by reading + the manifest/skill-discovery consistency (no broken skill name references).
- **D — park logic:** the progress-status value `awaiting-human-design-review` is documented with its exact write site. The pipeline doc references `designReviewDecision` (B+) so the gate-rule mapping has a unit-tested source of truth; whether a `run` becomes an interactive loop or a `park` is the orchestrator's mode+tool decision at the gate (not unit-testable without an LLM run).

### Documented-and-deferred (proven by founder walkthrough, NOT here)
- **The live annotation loop** (founder opens browser → annotates elements → agent drains MCP queue → revises TSX → re-render → founder approves). Inherently human-in-the-loop AND depends on an external Chrome extension + local MCP server that cannot be installed/driven inside this autonomous pipeline run. The skill documents the exact wiring + loop; the *execution* is deferred to a founder walkthrough on a real high-stakes WP (AG7 / AI7 per the spec's validation scenario).
- **The autonomous park firing end-to-end** through a real pipeline LLM run — deferred; the status-write contract + the `designReviewDecision` gate helper (B+) are the buildable proxies.

This line is the contract for the builder: write the real-surface mount test for B + the `designReviewDecision` unit test for B+; do NOT attempt to automate the live MCP annotation loop.

---

## 9. Ordered task list (for the builder)

1. **Mock providers (the consolidation).** Create `packages/web/src/preview/MockProviders.tsx` (`MemoryRouter` + `AssistantContext.Provider` seeded from the context's stable default) + `packages/web/src/preview/index.ts` re-exporting `MockProviders` + its prop type. Import `react-router-dom` and `../contexts/AssistantContext` — both first-party in web, resolve natively under `tsc`/vitest. No `⚠️ UNVERIFIED` flag (the import path is confirmed by `WorkBetCreate.stories.tsx` in-tree).
2. **Real-surface mount test (the AC2 proof).** `packages/web/src/preview/MockProviders.test.tsx` — render a **real page** (`WorkBet`) fed by an **existing fixture** (`MOCK_BETS.b1` from `pages/__fixtures__/work-bet-fixtures.ts`) through `<MockProviders>`, assert the page's real heading renders (per § 2.6). Runs in `npm run test`. This, not a synthetic surface, discharges AC2.
3. **Convert one existing page story.** Migrate **one** existing ad-hoc-wrapped page story (e.g. `WorkBetCreate.stories.tsx`'s `PageWrapper`) to import `MockProviders` from `../preview` instead of declaring a local `MemoryRouter` wrapper — proving the consolidation path end-to-end in the viewer + catalog. Read the snapshot diff (`.claude/rules/visual-regression.md`); `MemoryRouter` adds no DOM so the diff should be empty/trivial — re-bless only this one story if it changed. Do NOT convert the other 11 wrappers in AJ3 (documented as the migration target; opportunistic later).
4. **Gate-decision helper (B+).** Create `packages/shared/src/design-review-decision.ts` (`designReviewDecision(designClass) → "run" | "skip"`, per § 5.5) + export from `packages/shared/src/index.ts` + unit test `packages/shared/src/__tests__/design-review-decision.test.ts` asserting `novel→"run"`, `routine→"skip"`, `routine-low-conf→"skip"`. Runs in `npm run test`.
5. **Import guard.** Add an ESLint `no-restricted-imports` block scoped to `packages/web/src/preview/**` forbidding `@hyperidle/server` + `@hyperidle/db` (copy the shape of the existing `__fixtures__` block in `eslint.config.ts`). Confirm `npm run lint` green.
6. **Skill edits A, C, D, E, F** per §§ 3–7. A points `/design` at `packages/web/src/preview` `MockProviders` + `WorkBetCreate.stories.tsx` as the canonical page-fed example. D references `designReviewDecision` from `@hyperidle/shared`. C is a new file; add `/human-design-review` to `.claude/rules/skill-discovery.md`'s individual-skills list.
7. **Full verify.** `npm run verify` green (DOM-snapshot net + new mount test + gate-helper unit test + lint guard). No `mock-inventory`/`demo-fixture-guard` re-check needed — the harness lives in web `preview/` (not a production import of fixtures); the test/story consumers are already exempt from those guards.

---

## 10. In-session architectural critique

**1. Building infra ahead of demand? (the revised central question)** No — the harness has **12 current consumers** (the ad-hoc-wrapped web stories) and is framed as a *consolidation* of duplicated `MemoryRouter` wrappers into one shared `preview/` module, not speculative infrastructure. It ships with one consumer actually migrated (task 3) and removes copy-paste rather than adding an abstraction for zero callers. Two providers, no fixture-for-everything library. **Pass** (WARNING-2 resolved).

**2. Right package? (the CRITICAL that was)** Harness lives in `packages/web`, where `react-router-dom@^7.14.1` + `AssistantContext` are first-party. No `@lore AG4` violation (DS stays router-agnostic), no `@lore AJ1-W3` violation (DS snapshot net stays DS-only), no `tsc`-resolution gamble, no Option-1/Option-2 hedge. `npm run check` resolves the imports natively (proven by the existing `WorkBet.test.tsx` mounting through `MemoryRouter`). **Pass** (CRITICAL-1 resolved).

**3. Does the AC2 test prove the AC?** Yes — the mount test renders a **real data-fed page** (`WorkBet` + `MOCK_BETS` fixture) through `MockProviders` and asserts the page's real rendered heading, not a synthetic `HazardSurface`. That is the artifact AC2 names ("a page-level or data-fed surface mounts via thin mock providers, no server/db/real data"). It is a required, ordered task (task 2), not an optional demonstration. **Pass** (WARNING-1 resolved).

**4. Scope creep?** Excluded: a viewer "page-mock mode" UI, a fixtures-for-everything library, automating the MCP loop, a new classifier, rewriting all 12 wrappers. The gate helper is now **included** (it's ~10 lines + a unit test and is the only mechanical proof of the gate rule) — promoted from optional, NICE-3 adopted. **Pass.**

**5. Missing failure modes?**
- *Snapshot diff from the converted story* → task 3 reads the diff before re-blessing; `MemoryRouter` renders no DOM so the diff is empty/trivial. Covered.
- *MCP tool absent in interactive run* → graceful degradation to prose-on-screenshot (§ 4.4). Covered.
- *Park status confused with blocked* → distinct status value + concept rejection list. Covered.
- *`read_annotations` arg schema unverified* → skill instructs run-time MCP introspection, not hard-coded args (§ 4.2). Covered.
- *Gate helper drifts from the pipeline doc* → the doc references the unit-tested `designReviewDecision`; the test pins the mapping. Covered.

**6. Boundary respected?** All changes in the *pipeline/skill/web-tooling* layer — no Human Interface ↔ Meta ↔ Agent Runtime boundary crossed. The `preview/` module is a dev/story/test surface in web, governed by the `no-restricted-imports` guard (no server/db). The gate helper is pure logic in `@hyperidle/shared`. **Pass.**

**7. Trade-offs quantified?** Placement: web (native deps, 12 existing consumers) vs design-system (broken `tsc`, two `@lore` violations, zero DS consumers) — web wins on every axis. Provider count: 2 (router + assistant) vs N speculative — chose 2, the only two real hazards. Migration: convert 1 story now (proof) vs 12 (balloon diff + 11-story re-bless for zero behavior change) — chose 1. Gate helper: ~10 LOC + 3-case test buys the only automated proof of the mapping — included. **Pass.**

**8. The honest line.** § 8 draws buildable-vs-deferred sharply: B (real-surface mount) + B+ (gate helper) + skill consistency are proven here; the live annotation loop is deferred to founder walkthrough (matching the track-wide proof bar). No pretense the human loop runs autonomously. **Pass.**

**Open risks for the builder to watch:**
- R1 (low): the chosen opt-in surface for the mount test must accept an override-data prop (`WorkBet` does, via `overrideBet`) so no real fetch fires; if a different surface is picked, confirm it has the same injection seam.
- R2 (low): `read_annotations` exact arg schema unverified — skill instructs run-time MCP introspection, not hard-coded args.
- R3 (low): converting the one story (task 3) must re-bless cleanly with an empty/trivial diff; a non-trivial diff means the wrapper changed the rendered tree — investigate before blessing.
