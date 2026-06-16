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
- A design exploration. No component layouts, no spacing decisions, no copy. Those come from `/design` after registration.
- A concept doc. If the workpackage introduces or reshapes a load-bearing noun, run `/concept` first; this skill refuses to register without it.
- A backlog item. If it has no AC, it is not a work package.

---

## Pre-flight checks (refuse to proceed if any fails)

1. **Track letter is valid.** Must match an existing `.pipeline/work-packages/TRACK-<letter>.md` or be a deliberate new track (in which case create the TRACK file first with the same scope-rules section other tracks use).
2. **Workpackage ID is unique.** Read `.pipeline/work-packages/pipeline-manifest.yaml`; the generated ID (e.g. `L30`) must not collide with any existing entry.
3. **Concept gate — two levels.** Distinguish the **overall (track) concept** from the **per-workpackage concept**.
   - **Overall (track) concept** — what this worktrack as a whole does: its load-bearing nouns, the boundary or primitive it establishes, the frame every workpackage in it shares. This **must be defined enough before registering the track's workpackages** (it lives in `docs/<topic>/` ground truth, often with a `plans/<track>/concept.md`). Assess it. If the overall concept for what the track does is vague, contested, or has open conceptual questions, **FLAG it as part of work-planning** — name the open questions and exactly what `/concept` work is still to be done — and do not paper over it. Register specs only when the frame is stable enough that the ACs won't churn; if it isn't, hold and recommend a track-level `/concept` first.
   - **Per-workpackage concept** — the concept specific to one workpackage (its own noun/shape). This **may be deferred**: the pipeline runs `/concept <id>` before that workpackage's `/architecture`. So a workpackage that introduces or reshapes its *own* noun does **not** block registration — note it in **Plan calls** ("concept-introducing — run `/concept` first") so the pipeline gates it at build time.
   - Net: the hard line is the *track* concept (flag/hold if underdefined); per-WP concept work still pending is a *flag carried into the spec*, not a registration blocker. This mirrors the runtime gate enforced in `/pipeline`.
4. **Justification check.** The workpackage must have a clear answer to: "Who specifically benefits, and what's the cost of NOT building this?" If the only argument is "it would be nice," "other products have it," or "the research says so," the workpackage is not justified. Features are complexity — every one makes the system harder to understand, maintain, and explain. The burden of proof is on the workpackage to earn its existence. Refuse to register if the justification is weak.
5. **Existing-implementation check.** Before writing the spec, search the codebase for the capability being proposed. Read the relevant source files — schemas, routes, fabric services, UI pages. If the feature largely exists, the spec must document what's already built (in a "What exists today" paragraph) and identify only the genuine gap. Proposing to build something that already exists is the #1 failure mode in work-planning. When in doubt, spawn an Explore agent to audit the relevant subsystem.
6. **Dependencies are real blockers — and a proof vehicle is one.** For each declared dependency, write one sentence on why this workpackage cannot start until that one is `done`. "Logically related" is not a blocker — drop it. But "cannot be **verified**" blocks as hard as "cannot be implemented": if a workpackage's proof strategy is "prove the ACs through the lane / harness / contract defined in WP-Y," then WP-Y is a hard dependency. Order dependencies **before** their consumers in the manifest; a proof vehicle ordered after its consumers ships them unverifiable. (Track AH did this — AH5 defined the real-LLM lane every other AH workpackage had to prove through, but was ordered last, so AH1–AH4 shipped with mocked tests.)
7. **Sizing fits the rule.**
8. **Pre-build gates declared.** Every WP must declare both pre-build gates — **Concept** (required / not required) and **Design** (required / light / not required) — per "## Pre-build gates". Refuse to register a WP whose gates are unstated or hand-waved: a WP that touches a load-bearing noun with no `docs/` file to point at must mark `Concept: Required`; a WP with an open user-facing surface must mark `Design: Required` and carry its direction forks as design-exploration axes, never pre-resolve them. The **Human design review.** field is the sharper forecast of the Design gate (new essential/base/primitive component or large redesign → `Yes`); it is advisory — `/design`'s `DESIGN-CLASS` is authoritative at design time.

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

**What exists today.** One paragraph summarizing the relevant infrastructure and capabilities that already exist in the codebase. Name the specific tables, services, routes, or UI pages that this workpackage builds on. If this is greenfield, say "Nothing — this is a new capability." This paragraph prevents the architecture pass from rebuilding what already works and helps the builder understand what to extend vs create. Required for M and L workpackages; optional for S.

**What's genuinely missing.** 2-3 sentences identifying the specific gap between what exists and what the workpackage delivers. This is the delta — the reason this workpackage needs to exist. If you cannot articulate the delta clearly, the workpackage may not be needed.

**Depends on.** A bulleted list of workpackage IDs, or "None." For each declared dep, one sentence on *why this workpackage cannot start until that one is `done`*.

**Complexity.** S | M | L — drives scheduler dispatch (see sizing rule).

**Pre-build gates.** **A required, highlighted field.** Two explicit declarations so the founder (and `/pipeline`) know what must run *before* this WP is built — see "## Pre-build gates" below for the decision rules. State both, each with a one-line reason:
- **Concept:** `Required — run /concept <id> first (introduces/reshapes: <noun>)` | `Not required — reuses concepts already locked in docs/<topic>/<file>.md`.
- **Design:** `Required — novel surface; /design multi-variant + human review` | `Light — extends <existing component/page>; single-variant /design, no human-review park` | `Not required — backend/infra/concept-only; skip /design`.

**Human design review.** Yes | No — `<one-line reason>`. **A required, highlighted field.** This is the sharper forecast of the **Design** gate above: a `Design: Required` WP that introduces a new essential/base/primitive component or large redesign forecasts `Yes`; `Design: Light` or `Not required` forecasts `No`. Forecast at planning time whether this workpackage will need founder design review: a **new essential / base / primitive component or a large redesign → Yes**; a routine tweak, a backend/infra/concept-only WP, or an extension of an existing component → No. This is an **advisory forecast**, NOT the trigger: the authoritative gate is `/design`'s `DESIGN-CLASS` at design time (a WP forecast `No` that `/design` later classifies `novel` still parks for review). The field exists so the founder sees up front which work will park. Example: `**Human design review.** Yes — introduces a new base list-primitive; its shape is what's being decided.` (This formalizes the convention TRACK-AJ already shows on every WP.)

**Acceptance criteria.** A bulleted list of observable, testable statements — see "Writing Good ACs" below. These are the single source of truth flowing through all pipeline phases: `/concept` checks scope against them, `/design` produces variants for them, `/architecture` writes tasks to satisfy them, `/write-tests` produces one failing test per AC, `/write-code` makes those tests pass, and `/review` audits code against them.

**Validation scenarios.** 2–4 Given/When/Then scenarios. These are the minimum the QA gate (`/review`) will run. They must collectively cover every AC.

**Plan calls.** One short paragraph telling `/architecture` what kind of planning this workpackage needs. Most workpackages: "Standard architecture pass — types, contracts, ordered tasks." Foundational primitives: "Multi-version exploration; design-it-twice on the data shape." Pure-backend infra: "Skip /design step; plan + write-tests + write-code." If the workpackage is concept-introducing, name the noun and point at the concept doc.

**Contracts / constraints.** Bullet list of hard rules the implementation must honor (e.g. "no new on-disk markdown dialect", "migration is forward-only", "no emojis", "back-compat preserved at the API level not the row level"). These are guarantees the reviewer will check, separate from AC.

**Out of scope.** Bullet list of things a reader might assume are part of this workpackage but are not. Future improvements, related workpackages, edge cases deliberately deferred.

**Effort.** S (~Xmin) | M (~Xh) | L (~Xd) — same letter as Complexity, with a rough time estimate. The estimate is informational; the letter drives scheduler behavior. Examples: `S (~30min)`, `M (~4h)`, `L (~5d)`.
```

---

## Pre-build gates — concept and design, per workpackage

Every workpackage must state, up front, **what thinking has to happen before code is written**. Two gates, declared independently in the **Pre-build gates** field. This is not bureaucracy — it is the signal the founder uses to decide what to run by hand (`/concept`, `/design`, design iteration + `/human-design-review`) versus what `/pipeline` can carry straight through. Get these wrong and either the pipeline builds on an unlocked concept (ACs churn mid-run) or a novel surface ships on its first-draft layout.

### The Concept gate

Mark **Concept: Required** when the WP **introduces or reshapes a load-bearing noun** — a primitive, a domain concept, a closed vocabulary, a new contract shape. The noun's identity, rejection list, and contracts must be locked (`/concept <id>`) before `/architecture`, or the build rests on sand.

Mark **Concept: Not required** when the WP **only consumes nouns already locked** in `docs/<topic>/`. Name the file(s) it reuses. Extending a surface that uses settled primitives (e.g. "render existing X on a new page") is `Not required`.

Rule of thumb: if you cannot point to the `docs/` file that already defines every load-bearing noun the WP touches, the concept is **Required**.

### The Design gate

Mark **Design: Required** when the WP creates or substantially reshapes a **user-facing surface whose form is genuinely open** — a new page, a new base/primitive component, a new interaction grammar, or a redesign. These need `/design`'s multi-variant exploration; novel ones park for `/human-design-review`. The founder decides direction by **seeing rendered variants**, not by reading prose — so direction forks (layout, IA, adoption style) belong here, never pre-resolved in the spec.

Mark **Design: Light** when the WP **extends an existing component or page** in a way with one obvious form — a single-variant `/design` pass to place it, no human-review park.

Mark **Design: Not required** when the WP is **backend, infra, data-model, or concept-only** with no rendered surface. Skip `/design` entirely (`Plan calls` should say so).

### How the two gates compose

| Concept | Design | Typical WP | What the founder runs before `/pipeline` builds it |
|---|---|---|---|
| Required | Required | A new primitive with a new surface (e.g. a new rendering grammar) | `/concept <id>` → `/design` (variants) → `/human-design-review` if novel |
| Required | Not required | A backend primitive / contract / normalization layer | `/concept <id>` only |
| Not required | Required | A new surface over settled primitives | `/design` (variants) → human review if novel |
| Not required | Light | Extending an existing component | single-variant `/design`, then build |
| Not required | Not required | Plumbing over settled concepts | straight to `/architecture` + build |

A WP that is both gates **Required** is almost always **L**, and is a candidate to split (concept/backend WP first, surface WP second) so the concept locks before the surface is designed on top of it.

---

## Writing Good ACs

ACs are the contract between the spec and every downstream phase. They describe **what becomes true** when the work ships — not how to build it. The pipeline phases exist to decide the how: `/concept` locks nouns, `/design` explores UX, `/architecture` plans implementation. ACs that prescribe the solution bypass those phases and produce brittle specs.

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
- The **overall track concept** is undefined or too vague to give the workpackages a stable frame. Hold and recommend a track-level `/concept`; flag the open conceptual questions. (A *per-workpackage* noun that needs its own `/concept` is fine — defer it via a Plan-calls note; it does not block registration.)

---

## Anti-rationalizations

| Rationalization | Why it's wrong |
|---|---|
| "I'll add the implementation steps now and clean them out later" | Specs with implementation creep get their architecture step skipped because "the spec already said how." This is how spec drift happens. Keep them out from the start. |
| "S is fine, the AC bullets are short" | S is about scope and time, not bullet length. If it touches >1 subsystem it's M. |
| "Dependency on X is just a logical ordering" | Then it's not a dependency. The scheduler will serialize via real `done` blockers. Logical ordering is what the designer uses to plan tasks within a story. |
| "I'll skip /concept and write the spec; we can backfill the concept later" | Two levels. A *per-workpackage* noun's concept can be deferred — note it in Plan calls and the pipeline runs `/concept` before that WP's architecture. The *overall track* concept cannot: without a stable frame the ACs churn. Flag/hold the track until its concept is defined enough. |
| "This is a small fix, it doesn't need a work package" | Then it's a commit on an open story or a one-off PR — not a thing the pipeline picks up. The manifest is the queue; if it isn't there, the pipeline won't build it. |
| "I know this feature doesn't exist yet" | Do you? The codebase has 70K+ LOC across 650+ files. The promotion pipeline, attention scoring, event system, and facilitator routines cover vast ground. Audit before assuming a gap. The #1 spec failure mode is proposing what already exists. |
| "This feature is clearly needed" | Every feature adds complexity. Simplicity is the default. The question isn't "would this be useful?" — most things would. The question is "is the cost of NOT having this higher than the cost of maintaining it forever?" If you can't articulate the cost of not building it, don't build it. |
| "The AC needs to specify the exact columns / pages / components" | No. ACs describe outcomes. `/design` decides which pages and components. `/architecture` decides which columns and endpoints. An AC that prescribes the solution bypasses both phases and produces a spec that's brittle to any design change. |
| "This AC is too vague for the builder" | The builder doesn't read ACs directly — they read the plan from `/architecture`, which translates each AC into specific tasks, types, and verification methods. ACs are the contract with the reviewer, not the builder's instruction manual. |
| "Order the harness/lane WP last, wire deps later" | A consumer whose proof strategy names a not-yet-built harness has a broken review gate by design. Proof-strategy deps bind exactly like implementation deps — sequence the harness first. (See the AH5 note in pre-flight #6.) |
| "I'll leave the pre-build gates blank — the pipeline figures it out" | Then the founder can't see which WPs need a hand-run `/concept` or `/design` before build, and a novel surface ships on its first-draft layout. Declare both gates explicitly; carry direction forks (layout/IA/adoption style) as design-exploration axes, never pre-resolved in the spec. |
| "The direction fork is important, I'll just decide it in the spec" | Direction forks are decided by *seeing rendered variants*, not by prose. Mark `Design: Required`, name the axes, and let `/design` + `/human-design-review` resolve them. A spec that pre-resolves the layout has skipped the one phase that catches the wrong layout. |

---

## After registration

Hand control back to the founder, and **state the run order implied by the pre-build gates** so they can run them accordingly. Read the **Pre-build gates** field of each registered WP and report, in dependency order:
- WPs marked **Concept: Required** → run `/concept <id>` first (lock the noun before anything builds on it).
- WPs marked **Design: Required** → run `/design <id>` (and `/human-design-review` for novel surfaces) before build; surface the design-exploration axes the founder will decide by seeing rendered variants.
- WPs both **Not required / Light** → can go straight to `/pipeline`, which will still gate per-WP at build time.

The founder then runs concept/design by hand where it matters and lets `/pipeline` carry the rest. `/pipeline` enforces the same gates at runtime (`blocked: concept-missing` if a `Concept: Required` WP reaches architecture unlocked), so the declarations are a forecast the founder acts on early, not a substitute for the runtime gate.

**Note — running interactively:** The founder can run interactive mode (`PIPELINE_INTERACTIVE=1`, the canonical rule defined in `pipeline/SKILL.md` "## Run modes") when they intend to steer — `/concept` surfaces a post-lock recap with a confirm/redirect gate (run upstream, before the pipeline), and `/ship` surfaces a ship summary before merge (AJ2). This is a run-time opt-in, not a spec field. The recap is a `/concept` behavior (upstream of the pipeline), not a pipeline phase; no new spec-template field is needed here.

## Target

$ARGUMENTS
