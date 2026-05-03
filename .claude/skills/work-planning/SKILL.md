---
name: work-planning
description: "Create a new work-package spec — outcome-level only — and register it in the manifest + track index. Founder-only. Use when introducing a new story or breaking a track into stories. Triggers: 'add a new story', 'plan a work package', 'register X under Track Y'."
argument-hint: "[track-letter] [short-title] (e.g. 'L mobile-thread-collapse')"
user-invocable: true
min_tool_calls: 8
---

# Work Planning — Define and Register a Work Package

You are creating a new work-package spec. The output is a **specification** the pipeline can consume: what the user / system should observe when this is done — not how to build it.

---

## Who runs this skill

**Founder-only.** This skill is invoked manually by the founder when introducing or reshaping a story.

The pipeline agent (`/pipeline`) and any pipeline-spawned sub-agent must NEVER invoke `/work-planning`. Inventing scope mid-run is forbidden — that is what `blocked: concept-missing` and `blocked: spec-incomplete` exist for. If you are inside a pipeline run and find yourself reaching for this skill, stop and mark the story `blocked` instead.

---

## What a work package IS (and isn't)

A work package is the **smallest deliverable end-to-end change** that has its own observable outcome and its own acceptance criteria.

**It IS:**
- An outcome statement: what becomes true for the user or the system when this ships.
- A list of acceptance criteria phrased as observable behavior.
- A list of dependencies on other work packages — only when they are real blockers (the story literally cannot be implemented or verified until the dep is `done`).
- A complexity estimate (S / M / L) that determines how the scheduler dispatches it.

**It is NOT:**
- An implementation plan. No file paths, no type signatures, no chosen libraries, no migration steps. Those belong in `/architecture`'s output, written *after* this story is registered.
- A design exploration. No component layouts, no spacing decisions, no copy. Those come from `/design` after registration.
- A concept doc. If the story introduces or reshapes a load-bearing noun, run `/concept` first; this skill refuses to register without it.
- A backlog item. If it has no AC, it is not a work package.

---

## Pre-flight checks (refuse to proceed if any fails)

1. **Track letter is valid.** Must match an existing `docs/work-packages/TRACK-<letter>.md` or be a deliberate new track (in which case create the TRACK file first with the same scope-rules section other tracks use).
2. **Story ID is unique.** Read `docs/work-packages/pipeline-manifest.yaml`; the generated ID (e.g. `L30`) must not collide with any existing entry.
3. **Concept gate.** If this story introduces or reshapes a primitive / load-bearing noun (Thread / Block / Artifact / Bet / Cost / etc.), the relevant section in `docs/concept/*.md` AND the `SHARED.md` "Shared Contracts" entry must already exist. If not, refuse to register and tell the founder to run `/concept <noun>` first. This mirrors the runtime gate enforced in `/pipeline`.
4. **Dependencies are real blockers.** For each declared dependency, write one sentence justifying *why* this story cannot start until that one is `done`. "Logically related" is not a blocker — it just serializes the scheduler. If you cannot articulate the blocker, drop the dep.
5. **Sizing fits the rule.**

---

## Sizing rule (S / M / L)

| Size | Rule of thumb | Scheduler behavior |
|------|---------------|--------------------|
| **S** | ≤30 minutes of focused work. ≤3 acceptance criteria. Touches one subsystem. No new primitives. | **Batched** with up to 3 other S stories from the same track in one agent session. |
| **M** | Half-day to one day. Touches one subsystem or contract. AC list fits in 5–7 bullets. | **Solo agent**, one session per story. |
| **L** | Multi-day. Touches multiple subsystems, introduces or reshapes a primitive, or has ≥8 AC. | **Solo agent**, one session per story. May need split into smaller stories during `/architecture`; that's expected. |

**Decomposition rule.** If a story has more than 7 acceptance criteria, or if its AC span more than one subsystem, split it. Two M stories that compose are nearly always better than one L story that doesn't.

**Honesty rule.** Don't size something S to make it batchable. If the work is genuinely M, say M. The scheduler's parallelism is not a reward for under-estimation.

---

## Output contract — the spec template

Story specs live **inline as H3 sections inside `docs/work-packages/TRACK-<letter>.md`** (NOT as standalone files). Follow the existing convention used by TRACK-K, TRACK-L, etc. Pipeline-step artifacts (`<id>-architecture-review.md`, `<id>-plan.md`, …) DO get their own files — those are produced later by `/architecture` and friends, not by you.

Append the spec at the bottom of the relevant `TRACK-<letter>.md`, with **exactly** these sections, in this order:

```markdown
### <ID> — <Title>

**Story.** One paragraph (4-6 sentences max) framed as: *As a <role>, I want <observable outcome>, so that <reason>.* Concrete, no jargon, no acronyms unless already in `SHARED.md`. The first reader must be able to picture the user-visible or system-visible result without reading further.

**Depends on.** A bulleted list of story IDs, or "None." For each declared dep, one sentence on *why this story cannot start until that one is `done`*.

**Complexity.** S | M | L — drives scheduler dispatch (see sizing rule).

**Acceptance criteria.** A bulleted list of observable, testable statements. Phrased so a test (unit, integration, E2E, screenshot, eval) can prove each one true or false. Forbidden phrasings: "is implemented", "is well-designed", "follows best practices". Required phrasings: concrete user actions, concrete system states, concrete outputs.

**Validation scenarios.** 2–4 Given/When/Then scenarios. These are the minimum the QA gate (`/check-definition-of-done`) will run. They must collectively cover every AC.

**Plan calls.** One short paragraph telling `/architecture` what kind of planning this story needs. Most stories: "Standard architecture pass — types, contracts, ordered tasks." Foundational primitives: "Multi-version exploration; design-it-twice on the data shape." Pure-backend infra: "Skip /design step; plan + write-tests + write-code." If the story is concept-introducing, name the noun and point at the concept doc.

**Contracts / constraints.** Bullet list of hard rules the implementation must honor (e.g. "no new on-disk markdown dialect", "migration is forward-only", "no emojis", "back-compat preserved at the API level not the row level"). These are guarantees the reviewer will check, separate from AC.

**Out of scope.** Bullet list of things a reader might assume are part of this story but are not. Future improvements, related stories, edge cases deliberately deferred.

**Effort.** S (~Xmin) | M (~Xh) | L (~Xd) — same letter as Complexity, with a rough time estimate. The estimate is informational; the letter drives scheduler behavior. Examples: `S (~30min)`, `M (~4h)`, `L (~5d)`.
```

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

1. **Append the spec to the track file.** Add the new H3 section at the bottom of `docs/work-packages/TRACK-<letter>.md` per the template above. If the track doesn't exist yet, create the file with the standard preamble (scope rules, reference docs, dependency-graph pointer to `SHARED.md`) before appending.
2. **Append to the manifest.** Add an entry to `docs/work-packages/pipeline-manifest.yaml` under the existing `stories:` list:
    ```yaml
      - id: <ID>
        title: <Title — same as the spec H3>
        track: <single-letter track>
        depends: [<ID>, <ID>] # or []
        complexity: S | M | L
    ```
3. **Update the WORK_PACKAGES.md index** if the row count changed for that track (e.g. `Stories: L1–L30` → `Stories: L1–L31`).
4. **Validate.** Run:
    - `bun run --filter @hyperidle/pipeline test` — manifest tests must pass (catches duplicate ID, invalid complexity, dangling deps).
    - `bun run check && bun run lint` — sanity.
5. **Single commit.** All four changes ship together: TRACK update + manifest + index + tests. Message: `plan: register <ID> — <title>`.

---

## Refusal cases (return without registering)

- The work has no observable outcome — i.e. it's pure refactoring with no user-visible or system-visible change. Refactors don't get work packages; they happen *inside* a story whose AC demand the cleanup, or under a parent story with explicit "code health" AC.
- The dependency justification reduces to "they're related" or "the same area." Drop the dep; the scheduler will serialize via `done` ordering only when truly needed.
- The story would create a cycle with an existing dependency. The manifest validator will catch it; do not register.
- The story is sized S but has >3 AC or touches >1 subsystem. Re-size to M, or split.
- The founder asks to register an L story with no concept-doc backing for a noun it introduces. Refuse, point them at `/concept`.

---

## Anti-rationalizations

| Rationalization | Why it's wrong |
|---|---|
| "I'll add the implementation steps now and clean them out later" | Specs with implementation creep get their architecture step skipped because "the spec already said how." This is how spec drift happens. Keep them out from the start. |
| "S is fine, the AC bullets are short" | S is about scope and time, not bullet length. If it touches >1 subsystem it's M. |
| "Dependency on X is just a logical ordering" | Then it's not a dependency. The scheduler will serialize via real `done` blockers. Logical ordering is what the architect uses to plan tasks within a story. |
| "I'll skip /concept and write the spec; we can backfill the concept later" | The pipeline will refuse to run the story without the concept-doc. You'll backfill anyway, just under deadline pressure. Run `/concept` first. |
| "This is a small fix, it doesn't need a work package" | Then it's a commit on an open story or a one-off PR — not a thing the pipeline picks up. The manifest is the queue; if it isn't there, the pipeline won't build it. |

---

## After registration

Hand control back to the founder.

## Target

$ARGUMENTS
