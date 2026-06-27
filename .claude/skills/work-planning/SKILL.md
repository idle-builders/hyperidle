---
name: work-planning
description: "Create a new work-package spec — outcome-level only — and register it in the manifest + track index. Founder-only. Use when introducing a new workpackage or breaking a track into workpackages. Triggers: 'add a new workpackage', 'plan a work package', 'register X under Track Y'."
argument-hint: "[track-letter] [short-title] (e.g. 'L mobile-thread-collapse')"
user-invocable: true
min_tool_calls: 8
---

# Work Planning — Define and Register a Work Package

You are creating a new work-package spec. The output is a **specification** the pipeline can consume: what the user / system should observe when this is done — not how to build it.

---

## Who runs this skill

**Founder-only.** This skill is invoked manually by the founder when introducing or reshaping a workpackage.

The pipeline agent (`/pipeline`) and any pipeline-spawned sub-agent must NEVER invoke `/work-planning`. Inventing scope mid-run is forbidden — that is what `blocked: concept-missing` and `blocked: spec-incomplete` exist for. If you are inside a pipeline run and find yourself reaching for this skill, stop and mark the workpackage `blocked` instead.

---

## What a work package IS (and isn't)

A work package is the **smallest deliverable end-to-end change** that has its own observable outcome and its own acceptance criteria.

**It IS:**
- An outcome statement: what becomes true for the user or the system when this ships.
- A list of acceptance criteria phrased as observable behavior.
- A list of dependencies on other work packages — only when they are real blockers (the workpackage literally cannot be implemented or verified until the dep is `done`).
- A complexity estimate (S / M / L) that determines how the scheduler dispatches it.

**It is NOT:**
- An implementation plan. No file paths, no type signatures, no chosen libraries, no migration steps. Those belong in `/architecture`'s output, written *after* this workpackage is registered.
- A reuse plan. No "reuse component `X`", no "extend, don't replace", no "don't fork a parallel `Y`" — anywhere, including Plan calls and Contracts. Whether to reuse, extend, or build is the designer's/architect's call, made in `/design` and `/architecture`. The spec names what exists (informationally, in "What exists today") and the *invariant* a reuse would protect (semantics, vocabulary, "renders from the descriptor") — never the reuse decision itself. Forcing it forecloses the agent's judgment about what actually makes sense.
- A design exploration. No component layouts, no spacing decisions, no copy. Those come from `/design` after registration.
- A requirements doc. The per-workpackage requirement (value, noun shape, guide draft) is `/refine`'s output, produced at build time — not here. This skill settles the worktrack's *strategic frame* (via the questionnaire); it does not run `/refine`.
- A backlog item. If it has no AC, it is not a work package.

---

## Strategic-framing questionnaire (run first, before registering anything)

Work-planning starts with a **high-level, strategic conversation about what this worktrack is about** — the cheapest place to get the frame right. Run it as a questionnaire: a few sharp questions, your proposed read first, the founder confirms or redirects. The goal is to nail the worktrack at a strategic altitude, not to design any single workpackage. (Per-workpackage requirement sharpening is `/refine`'s job, later.)

Ask only what's unsettled. Lead with your read; one `AskUserQuestion` per unsettled point when the founder is reachable.

1. **Value & frame.** "What is this worktrack fundamentally about — what value does it generate, and what's the one boundary/primitive/load-bearing noun it establishes? My read: …"
2. **Shape of the work.** "What are the workpackages this breaks into, roughly?" For each, classify two things up front:
   - **Refinement?** Is the workpackage's goal still unclear enough that `/refine` should run before build to sharpen it? (Unclear / novel-noun → Yes; obvious extension → No.)
   - **Load-bearing?** Is this a workpackage where getting the user-facing shape wrong is expensive — a new essential/base/primitive component, a large redesign, or a significant user/dev-guide rewrite? Those forecast **Human concept review = Yes**.
3. **Frame stability.** "Is the frame stable enough that the ACs won't churn, or are there open conceptual questions to resolve first?" If unstable → hold; resolve the open questions here before registering.

The questionnaire's outputs feed the spec: the strategic frame lands in `docs/<topic>/` ground truth (and the **What exists today** paragraph), and the per-WP classification lands in the **Refinement.** and **Human concept review.** fields.

## Pre-flight checks (refuse to proceed if any fails)

1. **Track letter is valid.** Must match an existing `.pipeline/work-packages/TRACK-<letter>.md` or be a deliberate new track (in which case create the TRACK file first with the same scope-rules section other tracks use).
2. **Workpackage ID is unique.** Read `.pipeline/work-packages/pipeline-manifest.yaml`; the generated ID (e.g. `L30`) must not collide with any existing entry.
3. **Strategic frame — settle it here, via the questionnaire.** The worktrack's **strategic frame** — what this worktrack as a whole does: its load-bearing nouns, the boundary or primitive it establishes, the frame every workpackage shares — is **owned by this skill**. Run the strategic-framing questionnaire (see "## Strategic-framing questionnaire" below) to nail it at a high level *before* registering the track's workpackages. The frame **must be defined enough before registering** (it lives in `docs/<topic>/` ground truth). If it is vague, contested, or has open questions, **hold** — name the open questions and resolve them in the questionnaire — do not paper over it. Register specs only when the frame is stable enough that the ACs won't churn.
   - **Per-workpackage requirement** is NOT settled here — that is `/refine`'s job, run before a workpackage's `/design` + `/architecture` (the pipeline runs it if needed). A workpackage that introduces or reshapes its *own* noun does **not** block registration — flag it via the **Refinement.** field so the pipeline runs `/refine` at build time.
   - Net: the hard line is the *strategic frame* (flag/hold if underdefined); per-WP requirement work still pending is a *flag carried into the spec*, not a registration blocker. This mirrors the runtime gate enforced in `/pipeline`.
4. **Justification check.** The workpackage must have a clear answer to: "Who specifically benefits, and what's the cost of NOT building this?" If the only argument is "it would be nice," "other products have it," or "the research says so," the workpackage is not justified. Features are complexity — every one makes the system harder to understand, maintain, and explain. The burden of proof is on the workpackage to earn its existence. Refuse to register if the justification is weak.
5. **Existing-implementation check.** Before writing the spec, search the codebase for the capability being proposed. Read the relevant source files — schemas, routes, fabric services, UI pages. If the feature largely exists, the spec must document what's already built (in a "What exists today" paragraph) and identify only the genuine gap. Proposing to build something that already exists is the #1 failure mode in work-planning. When in doubt, spawn an Explore agent to audit the relevant subsystem.
6. **Dependencies are real blockers — and a proof vehicle is one.** For each declared dependency, write one sentence on why this workpackage cannot start until that one is `done`. "Logically related" is not a blocker — drop it. But "cannot be **verified**" blocks as hard as "cannot be implemented": if a workpackage's proof strategy is "prove the ACs through the lane / harness / contract defined in WP-Y," then WP-Y is a hard dependency. Order dependencies **before** their consumers in the manifest; a proof vehicle ordered after its consumers ships them unverifiable. (Track AH did this — AH5 defined the real-LLM lane every other AH workpackage had to prove through, but was ordered last, so AH1–AH4 shipped with mocked tests.)
7. **Sizing fits the rule.**
8. **Pre-build gates declared.** Every WP must declare both pre-build gates — **Refinement** (required / not required) and **Design** (required / light / not required) — per "## Pre-build gates". Refuse to register a WP whose gates are unstated or hand-waved: a WP whose goal is unclear or that touches a load-bearing noun with no `docs/` file to point at must mark `Refinement: Required`; a WP with an open user-facing surface must mark `Design: Required` and carry its direction forks as design-exploration axes, never pre-resolve them. The **Human concept review.** field is the sharper forecast across both (new essential/base/primitive component, large redesign, OR significant user/dev-guide rewrite → `Yes`); it is advisory — `conceptReviewDecision(DESIGN-CLASS, DOC-CLASS)` is authoritative at review time.

---

## Sizing rule (S / M / L)

| Size | Rule of thumb | Scheduler behavior |
|------|---------------|--------------------|
| **S** | ≤30 minutes of focused work. ≤3 acceptance criteria. Touches one subsystem. No new primitives. | **Batched** with up to 3 other S workpackages from the same track in one agent session. |
| **M** | Half-day to one day. Touches one subsystem or contract. AC list fits in 5–7 bullets. | **Solo agent**, one session per workpackage. |
| **L** | Multi-day. Touches multiple subsystems, introduces or reshapes a primitive, or has ≥8 AC. | **Solo agent**, one session per workpackage. May need split into smaller workpackages during `/architecture`; that's expected. |

**Decomposition rule.** If a workpackage has more than 7 acceptance criteria, or if its AC span more than one subsystem, split it. Two M workpackages that compose are nearly always better than one L workpackage that doesn't.

**Honesty rule.** Don't size something S to make it batchable. If the work is genuinely M, say M. The scheduler's parallelism is not a reward for under-estimation.

---

## Output contract — the spec template

Workpackage specs live **inline as H3 sections inside `.pipeline/work-packages/TRACK-<letter>.md`** (NOT as standalone files). Follow the existing convention used by TRACK-K, TRACK-L, etc. Pipeline-step artifacts (`<id>-architecture-review.md`, `<id>-plan.md`, …) DO get their own files — those are produced later by `/architecture` and friends, not by you.

Append the spec at the bottom of the relevant `TRACK-<letter>.md`, with **exactly** these sections, in this order:

```markdown
### <ID> — <Title>

**Workpackage.** One paragraph (4-6 sentences max) framed as: *As a <role>, I want <observable outcome>, so that <reason>.* Concrete, no jargon, no acronyms unless already established in `docs/`. The first reader must be able to picture the user-visible or system-visible result without reading further.

**Why this matters.** 2-4 sentences making the case for building this. Who benefits and how? What's the cost of NOT building it? Every feature adds complexity — the burden of proof is on the workpackage to justify its existence. Name the specific person (founder, team lead, agent, facilitator) whose life gets measurably better and how. If you can only argue "it would be nice" or "other products have it," the workpackage isn't ready. If simplicity would be better served by NOT building this, say so and don't register.

**What exists today.** One paragraph summarizing the relevant infrastructure and capabilities that already exist in the codebase. Name the specific tables, services, routes, or UI pages that this workpackage builds on. If this is greenfield, say "Nothing — this is a new capability." This paragraph prevents the architecture pass from rebuilding what already works and helps the builder understand what to extend vs create. **This paragraph is informational — it names what exists so the architect has the full picture; it does NOT mandate reuse.** Whether to reuse, extend, or replace a named component/service is the designer's/architect's decision, made in `/design` and `/architecture`. Required for M and L workpackages; optional for S.

**What's genuinely missing.** 2-3 sentences identifying the specific gap between what exists and what the workpackage delivers. This is the delta — the reason this workpackage needs to exist. If you cannot articulate the delta clearly, the workpackage may not be needed.

**Depends on.** A bulleted list of workpackage IDs, or "None." For each declared dep, one sentence on *why this workpackage cannot start until that one is `done`*.

**Complexity.** S | M | L — drives scheduler dispatch (see sizing rule).

**Pre-build gates.** **A required, highlighted field.** Two explicit declarations so the founder (and `/pipeline`) know what must run *before* this WP is built — see "## Pre-build gates" below for the decision rules. State both, each with a one-line reason:
- **Refinement:** `Required — run /refine <id> first (goal unclear, or introduces/reshapes: <noun>)` | `Not required — goal is clear and reuses requirements already locked in docs/<topic>/<file>.md`.
- **Design:** `Required — novel surface; /design multi-variant + human review` | `Light — extends <existing component/page>; single-variant /design, no human-review park` | `Not required — backend/infra/concept-only; skip /design`.

**Human concept review.** Yes | No — `<one-line reason>`. **A required, highlighted field.** This forecasts whether the founder will review the user-facing parts (the user/dev-guide draft + the design). Forecast `Yes` when the WP introduces a **new essential / base / primitive component, a large redesign, OR a significant rewrite of the user/dev guides**; forecast `No` for a routine tweak, a backend/infra-only WP, or an extension of an existing component with no significant guide change. This is an **advisory forecast**, NOT the trigger: the authoritative gate is `conceptReviewDecision(DESIGN-CLASS, DOC-CLASS)` at review time (a WP forecast `No` that `/design` later classifies `novel` or `/refine` marks `DOC-CLASS: significant` still parks for review). The field exists so the founder sees up front which work will park. Example: `**Human concept review.** Yes — introduces a new base list-primitive; its shape and its guide are what's being decided.` (This formalizes the convention TRACK-AJ already shows on every WP.)

**Acceptance criteria.** A bulleted list of observable, testable statements — see "Writing Good ACs" below. These are the single source of truth flowing through all pipeline phases: `/refine` sharpens the requirement against them, `/design` produces variants for them, `/architecture` writes tasks to satisfy them, `/write-tests` produces one failing test per AC, `/write-code` makes those tests pass, and `/review` audits code against them.

**Validation scenarios.** 2–4 Given/When/Then scenarios. These are the minimum the QA gate (`/review`) will run. They must collectively cover every AC.

**Plan calls.** One short paragraph telling `/architecture` what *kind* of planning this workpackage needs. Most workpackages: "Standard architecture pass — types, contracts, ordered tasks." Foundational primitives: "Multi-version exploration; design-it-twice on the data shape." Pure-backend infra: "Skip /design step; plan + write-tests + write-code." If the workpackage needs refinement (goal unclear or introduces/reshapes a noun), say so and name the noun so the pipeline runs `/refine` first. It states what planning to run and which gates apply — **NOT a list of components or services to reuse or build.** "What exists today" already names what exists (informationally); whether to reuse, extend, or replace it is the architect's call, not a Plan-calls directive.

**Contracts / constraints.** Bullet list of hard rules the implementation must honor (e.g. "no new on-disk markdown dialect", "migration is forward-only", "no emojis", "back-compat preserved at the API level not the row level"). These are guarantees the reviewer will check, separate from AC. Constraints are about *primitives, semantics, data formats, vocabulary, scope, and invariants* — **NOT which components or services to reuse, extend, replace, or refrain from building.** "Reuse `X`", "don't fork a parallel `Y`", "extend, don't replace" are reuse-vs-build decisions that belong to `/design` and `/architecture`; stating them here forecloses the agent's judgment about what actually makes sense. If a reuse protects something real, state the *invariant* (e.g. "verdict semantics unchanged", "one coherent harness model", "renders generically from the capability descriptor — no per-backend branching") and let the architect choose how to honor it.

**Out of scope.** Bullet list of things a reader might assume are part of this workpackage but are not. Future improvements, related workpackages, edge cases deliberately deferred.

**Effort.** S (~Xmin) | M (~Xh) | L (~Xd) — same letter as Complexity, with a rough time estimate. The estimate is informational; the letter drives scheduler behavior. Examples: `S (~30min)`, `M (~4h)`, `L (~5d)`.
```

---

## Pre-build gates — concept and design, per workpackage

Every workpackage must state, up front, **what thinking has to happen before code is written**. Two gates, declared independently in the **Pre-build gates** field. This is not bureaucracy — it is the signal the founder uses to decide what to run by hand (`/refine`, `/design`, design iteration + `/human-concept-review`) versus what `/pipeline` can carry straight through. Get these wrong and either the pipeline builds on an unsharpened requirement (ACs churn mid-run) or a novel surface ships on its first-draft layout.

### The Refinement gate

Mark **Refinement: Required** when the WP's **goal is unclear**, or it **introduces or reshapes a load-bearing noun** — a primitive, a domain concept, a closed vocabulary, a new contract shape. `/refine` sharpens the requirement (value, noun shape, guide draft) before `/design` + `/architecture`, or the build rests on sand.

Mark **Refinement: Not required** when the WP's goal is clear and it **only consumes requirements already locked** in `docs/<topic>/`. Name the file(s) it reuses. Extending a surface that uses settled primitives (e.g. "render existing X on a new page") is `Not required`.

Rule of thumb: if the goal is fuzzy, or you cannot point to the `docs/` file that already defines every load-bearing noun the WP touches, refinement is **Required**.

### The Design gate

Mark **Design: Required** when the WP creates or substantially reshapes a **user-facing surface whose form is genuinely open** — a new page, a new base/primitive component, a new interaction grammar, or a redesign. These need `/design`'s multi-variant exploration; novel ones park for `/human-concept-review`. The founder decides direction by **seeing rendered variants**, not by reading prose — so direction forks (layout, IA, adoption style) belong here, never pre-resolved in the spec.

Mark **Design: Light** when the WP **extends an existing component or page** in a way with one obvious form — a single-variant `/design` pass to place it, no human-review park.

Mark **Design: Not required** when the WP is **backend, infra, data-model, or concept-only** with no rendered surface. Skip `/design` entirely (`Plan calls` should say so).

### How the two gates compose

| Refinement | Design | Typical WP | What `/pipeline` runs before build (founder steers when high-stakes) |
|---|---|---|---|
| Required | Required | A new primitive with a new surface (e.g. a new rendering grammar) | `/refine <id>` → `/design` (variants) → `/human-concept-review` if novel/significant |
| Required | Not required | A backend primitive / contract / normalization layer | `/refine <id>` only |
| Not required | Required | A new surface over settled primitives | `/design` (variants) → human concept review if novel/significant |
| Not required | Light | Extending an existing component | single-variant `/design`, then build |
| Not required | Not required | Plumbing over settled requirements | straight to `/architecture` + build |

A WP that is both gates **Required** is almost always **L**, and is a candidate to split (refinement/backend WP first, surface WP second) so the requirement is sharp before the surface is designed on top of it.

---

## Writing Good ACs

ACs are the contract between the spec and every downstream phase. They describe **what becomes true** when the work ships — not how to build it. The pipeline phases exist to decide the how: `/refine` sharpens the requirement, `/design` explores UX, `/architecture` plans implementation. ACs that prescribe the solution bypass those phases and produce brittle specs.

### The outcome rule

An AC describes the **observable state** a user, agent, or system is in after the work ships. It answers "what changed?" not "what was built?"

### What ACs should describe (by downstream consumer)

| Consumer | AC should describe | AC should NOT describe |
|---|---|---|
| `/design` (if UI) | What the user understands, can do, or sees | Specific pages, layouts, component names, CSS values |
| `/architecture` | What behavior the system exhibits, what data is queryable | Specific tables, columns, endpoints, parameter names |
| `/write-tests` | What can be proven true or false | How to test it (test method is the plan's job) |
| `/review` | What to audit the code against | Implementation patterns or coding style |

### Good vs bad AC examples

| Bad AC | Why it's bad | Better version |
|---|---|---|
| "A `docs/product/index.md` exists containing a pitch, architecture overview, and concept list" | Prescribes file path and page structure — that's design/architecture work | "A first-time reader can explain what HyperIdle does in their own words after reading the product entry point" |
| "The profile page shows name, role, team, system prompt summary, harness type, model tier, creation date, and status" | Prescribes the exact UI layout — that's design work | "A team lead can see an agent's complete operational picture — identity, configuration, capabilities, activity, and health — in one view" |
| "Add `valid_from` timestamp and `valid_until` nullable timestamp columns to the kernel table" | Prescribes schema — that's architecture work | "Knowledge items track when they became valid and when they were superseded, queryable by date" |
| "The routine detail sheet reuses the TaskSheet component pattern" | Prescribes component reuse — that's design/architecture | "Clicking a routine shows its run history and configuration without leaving the Work page" |
| "Uses the existing BodyEditor component (T1)" | Names a specific component — that's architecture | "The authoring flow provides rich text editing for knowledge item bodies" |
| "Keyboard shortcuts: v to validate, e to edit, r to reject" | Prescribes the interaction design | "A reviewer can process the queue rapidly without reaching for the mouse" |

### The specificity gradient

ACs should be **specific about outcomes, vague about solutions.** The test: if two different designers would produce the same solution from your AC, it's too prescriptive. If two different reviewers can't agree on whether it passes, it's too vague.

- **Too vague:** "Knowledge management works well" — no reviewer can audit this
- **Too prescriptive:** "Knowledge list page has 3 tabs: Curated, Triage, Review, with server-side pagination and Cmd+K search" — this is a design spec, not an AC
- **Right level:** "A human can find, review, and validate knowledge items efficiently, with the most important items surfaced first" — testable (time-on-task, can they find items?), but leaves room for design

### Structural ACs vs behavioral ACs

Some workpackages are purely structural (schema changes, data model evolution). These CAN use specific structural language because there's no design/UX decision to make:

- **OK for backend-only WPs:** "Knowledge items can be queried as of a specific date, returning only items that were valid at that point" — structural behavior, no UI
- **OK for backend-only WPs:** "Superseded items are excluded from search results by default" — search behavior, testable

But even structural ACs should describe **behavior** ("items can be queried as of a date") not **implementation** ("add a `valid_from` timestamp column").

### The mental-state test (for UI workpackages)

For any AC involving a human, ask: "What mental state is the user in after this?" The AC should describe that mental state:

- "The team lead understands which agents are healthy and which need attention" (mental state)
- "A founder can tell whether the company is getting smarter over time" (mental state)
- "A new user knows what to do next after completing the getting started guide" (mental state)

If the AC describes what's on screen instead of what the user understands, it's prescribing design.

**Forbidden phrasings** (unchanged): "is implemented", "is well-designed", "follows best practices", "is efficient", "is clean."

**Required quality:** Each AC must be provable true or false by a test (unit, integration, E2E, screenshot, eval, or human walkthrough for documentation WPs). If you can't imagine the test, the AC is too vague.

---

**Forbidden sections** (the architecture/design phases produce these later):
- "Implementation steps" / "Implementation plan"
- "File changes" / "File paths"
- "Types" / "Schema" / "API endpoints"
- "Component breakdown"
- Forced component/service reuse — "reuse `X` component", "don't fork a parallel `Y`", "extend, don't replace". Reuse-vs-build is `/design` / `/architecture` scope. (Naming what exists in "What exists today" is fine — that's informational, not a directive.)
- "Visual design" / "Visual contract"
- "Tech choices" / "Library choices"

If a founder pastes implementation detail into the spec, strip it out before registering. The `/architecture` step is where those decisions live.

---

## Registration steps (perform in order, in one commit)

1. **Append the spec to the track file.** Add the new H3 section at the bottom of `.pipeline/work-packages/TRACK-<letter>.md` per the template above. If the track doesn't exist yet, create the file with the standard preamble (scope rules, reference docs, dependency-graph pointer to `.pipeline/work-packages/dependency-graph.md`) before appending.
2. **Append to the manifest.** Add an entry to `.pipeline/work-packages/pipeline-manifest.yaml` under the existing `stories:` list, placing the new entry **after** any workpackages it depends on (dependencies before consumers):
    ```yaml
      - id: <ID>
        title: <Title — same as the spec H3>
        track: <single-letter track>
        depends: [<ID>, <ID>] # or []
        complexity: S | M | L
    ```
3. **Update the WORK_PACKAGES.md index** if the row count changed for that track (e.g. `Stories: L1–L30` → `Stories: L1–L31`).
4. **Validate.** Run:
    - `npm run -w @hyperidle/pipeline test` — manifest tests must pass (catches duplicate ID, invalid complexity, dangling deps).
    - `npm run check && npm run lint` — sanity.
5. **Single commit.** All four changes ship together: TRACK update + manifest + index + tests. Message: `plan: register <ID> — <title>`.

---

## Refusal cases (return without registering)

- The work has no observable outcome — i.e. it's pure refactoring with no user-visible or system-visible change. Refactors don't get work packages; they happen *inside* a workpackage whose AC demand the cleanup, or under a parent workpackage with explicit "code health" AC.
- The "Why this matters" section cannot name a specific person whose life gets measurably better. "It would be nice" or "completeness" or "other products have it" are not justifications. Simplicity is a feature — the default answer to "should we build this?" is no.
- The dependency justification reduces to "they're related" or "the same area." Drop the dep; the scheduler will serialize via `done` ordering only when truly needed.
- The workpackage would create a cycle with an existing dependency. The manifest validator will catch it; do not register.
- A workpackage's proof strategy names a harness, lane, or contract defined in another WP that is currently ordered **after** it in the manifest. Re-sequence before registering — do not paper over it by accepting a mocked-only test strategy.
- The workpackage is sized S but has >3 AC or touches >1 subsystem. Re-size to M, or split.
- The **strategic frame** is undefined or too vague to give the workpackages a stable frame. Hold and resolve it via the strategic-framing questionnaire; flag the open conceptual questions. (A *per-workpackage* noun that needs its own `/refine` is fine — defer it via the **Refinement** gate; it does not block registration.)

---

## Anti-rationalizations

| Rationalization | Why it's wrong |
|---|---|
| "I'll add the implementation steps now and clean them out later" | Specs with implementation creep get their architecture step skipped because "the spec already said how." This is how spec drift happens. Keep them out from the start. |
| "S is fine, the AC bullets are short" | S is about scope and time, not bullet length. If it touches >1 subsystem it's M. |
| "Dependency on X is just a logical ordering" | Then it's not a dependency. The scheduler will serialize via real `done` blockers. Logical ordering is what the designer uses to plan tasks within a story. |
| "I'll skip the strategic frame and write the specs; we can backfill it later" | A *per-workpackage* requirement can be deferred — flag the **Refinement** gate and the pipeline runs `/refine` before that WP's design/architecture. The *strategic frame* cannot: without a stable frame the ACs churn. Flag/hold the track until the frame is defined enough (run the strategic-framing questionnaire). |
| "This is a small fix, it doesn't need a work package" | Then it's a commit on an open story or a one-off PR — not a thing the pipeline picks up. The manifest is the queue; if it isn't there, the pipeline won't build it. |
| "I know this feature doesn't exist yet" | Do you? The codebase has 70K+ LOC across 650+ files. The promotion pipeline, attention scoring, event system, and facilitator routines cover vast ground. Audit before assuming a gap. The #1 spec failure mode is proposing what already exists. |
| "This feature is clearly needed" | Every feature adds complexity. Simplicity is the default. The question isn't "would this be useful?" — most things would. The question is "is the cost of NOT having this higher than the cost of maintaining it forever?" If you can't articulate the cost of not building it, don't build it. |
| "The AC needs to specify the exact columns / pages / components" | No. ACs describe outcomes. `/design` decides which pages and components. `/architecture` decides which columns and endpoints. An AC that prescribes the solution bypasses both phases and produces a spec that's brittle to any design change. |
| "This AC is too vague for the builder" | The builder doesn't read ACs directly — they read the plan from `/architecture`, which translates each AC into specific tasks, types, and verification methods. ACs are the contract with the reviewer, not the builder's instruction manual. |
| "Order the harness/lane WP last, wire deps later" | A consumer whose proof strategy names a not-yet-built harness has a broken review gate by design. Proof-strategy deps bind exactly like implementation deps — sequence the harness first. (See the AH5 note in pre-flight #6.) |
| "I'll leave the pre-build gates blank — the pipeline figures it out" | Then the founder can't see which WPs need a hand-run `/refine` or `/design` before build, and a novel surface ships on its first-draft layout. Declare both gates explicitly; carry direction forks (layout/IA/adoption style) as design-exploration axes, never pre-resolved in the spec. |
| "The direction fork is important, I'll just decide it in the spec" | Direction forks are decided by *seeing rendered variants*, not by prose. Mark `Design: Required`, name the axes, and let `/design` + `/human-concept-review` resolve them. A spec that pre-resolves the layout has skipped the one phase that catches the wrong layout. |
| "I'll tell the architect to reuse the existing `X` component" | Reuse-vs-build is `/design`/`/architecture` scope — forcing it forecloses the agent's judgment about what actually makes sense. Name the *invariant* the reuse would protect (semantics, vocabulary, "renders from the descriptor") in Contracts and let them choose how; list what exists in "What exists today" (informational only). Don't copy reuse directives from a neighbouring track's spec — that's how the anti-pattern spreads. |

---

## After registration

Hand control back to the founder, and **state what each registered WP's pre-build gates imply** so they know what `/pipeline` will run (and where they may want to steer). Read the **Pre-build gates** + **Human concept review.** fields of each WP and report, in dependency order:
- WPs marked **Refinement: Required** → `/pipeline` runs `/refine <id>` first (sharpens the requirement; the founder can run it interactively to steer).
- WPs marked **Design: Required** → `/pipeline` runs `/design <id>`; novel/significant ones park for `/human-concept-review`. Surface the design-exploration axes the founder will decide by seeing rendered variants.
- WPs both **Not required / Light** → straight through `/pipeline`.

Unlike before, `/pipeline` now runs `/refine` itself (Phase 1, when the gate says so) — the founder no longer hand-runs it upstream. What still must be settled here, before registering, is the **strategic frame**; `/pipeline` fails fast (`blocked: concept-missing`) if a WP reaches build with no `docs/` frame to build on.

**Note — running interactively:** The founder can run interactive mode (`PIPELINE_INTERACTIVE=1`, the canonical rule defined in `pipeline/SKILL.md` "## Run modes") when they intend to steer — `/refine` surfaces a post-lock requirement recap with a confirm/redirect gate, and `/ship` surfaces a ship summary before merge. This is a run-time opt-in, not a spec field.

## Target

$ARGUMENTS
