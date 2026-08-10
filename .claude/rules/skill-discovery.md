# Skill Discovery

Before responding to ANY implementation or review request, check if a skill should be invoked. Even at 1% chance of applicability, invoke the skill BEFORE generating any response.

The core pipeline skills ship from the **`pipeline@agent-pipeline` plugin** (`ambrovia/agent-skills-pipeline`), invoked **namespaced** as `/pipeline:<skill>`. HyperIdle-specific skills (`/visual-polish`, `/security-audit`, `/product-deep-review`, `/upgrade-versions`) are local, invoked bare. Repo-specific bindings the plugin skills read (`verify`, `paths.docs`, design system, models) live in `pipeline.config.yml`.

## Two kinds of skills

**Individual skills** — domain knowledge loaded INTO an agent session. They define a specific act, not a step. They never launch agents.
- `/pipeline:refine`, `/pipeline:design`, `/pipeline:architecture` (planner — production)
- `/pipeline:human-concept-review` (planner + founder — conditional stakes-gated phase after the critiques; founder reviews the user/dev-guide draft + the rendered variant in the browser, planner revises code + draft to approval. Runs when the design is `novel` OR the docs are a `significant` rewrite; in an autonomous run a high-stakes change parks)
- `/pipeline:design-critique`, `/pipeline:architecture-critique`, `/pipeline:review` (reviewer — evaluation + 6 lenses + AC completeness)
- `/pipeline:write-tests`, `/pipeline:write-code`, `/pipeline:write-docs`, `/visual-polish` (builder)
- `/pipeline:ship` (builder — verify + attestation + PR)
- `/pipeline:retro` (fresh-context observation)
- `/pipeline:compound` (self-improvement — pattern detection in retro log)
- `/pipeline:lore` (any)

**Combined skills** — orchestrate agent launches. They define steps: "launch agent X with skill Y."
- `/pipeline:pipeline` — full autonomous build pipeline
- `/pipeline:work-planning` — register a new work package (settles the track's strategic frame)
- `/upgrade-versions` — foundation-first layered dependency upgrade

**Manual deep-review skills (Fable, founder-invoked)** — run on the `auditor` agent (Fable), NOT part of the pipeline. Whole-surface, coverage-aware across runs via `.pipeline/audits/<domain>/ledger.json`. Reserved for high-stakes passes where Fable's long-horizon lead pays for itself.
- `/security-audit` — full penetration-style security bench
- `/product-deep-review` — feature functionality + user value + visual testing

## Decision Flowchart

```
User request arrives
    │
    ├── Is it about sharpening the user requirement? ──→ /pipeline:refine <story>
    ├── Is it about exploring UI/UX direction? ──→ /pipeline:design <story>
    ├── Is it about a founder reviewing the guide draft + design? → /pipeline:human-concept-review <story>
    ├── Is it about producing the technical plan? → /pipeline:architecture <story>
    ├── Is it about building a feature? ─────────→ /pipeline:pipeline <story>
    ├── Is it about running multiple stories? ───→ /pipeline:pipeline <target>
    ├── Is it about reviewing code? ─────────────→ /pipeline:review <changes>
    ├── Is it about shipping / pushing / PRs? ──→ /pipeline:ship <workpackage-id>
    ├── Is it about writing user-facing docs? ───→ /pipeline:write-docs <doc-path>
    ├── Is it about documenting decisions? ──────→ /pipeline:lore <files|scan|index>
    ├── Is it about visual fidelity? ────────────→ /visual-polish <reference>
    ├── Is it about process improvement? ────────→ /pipeline:retro <workpackage|pipeline>
    ├── Is it about updating dependencies? ──────→ /upgrade-versions [scope]
    └── None of the above? ──────────────────────→ Proceed normally
```

**Note (block-1b):** `/pipeline:ship` handles the verify → commit → push → PR flow. There is no attestation step: `npm run verify` runs the static gates locally and CI runs every gate — including the affected test slice — live on the PR. `/pipeline:review` is the single comprehensive review skill — 3 positive lenses (architecture, design, security) + 3 negative lenses (adversarial, simplification, slop) + AC completeness. `/pipeline:write-tests` and `/pipeline:write-code` stay separate — red and green are different cognitive acts. `/pipeline:design-critique` and `/pipeline:architecture-critique` live with the reviewer, not the producer — the evaluator must be a different agent than the producer. The reviewer runs critique in Phase 2, then code review in Phase 4, carrying design/arch context forward.

## Red Flags — Rationalizations for Skipping Skills

| Rationalization | Why It's Wrong |
|---|---|
| "This is too simple for /pipeline:pipeline" | Simple workpackages have the highest skip rate and highest regression rate. |
| "I already know what to do" | The skill isn't about knowing — it's about the process gates that catch what you missed. |
| "The skill will slow me down" | A 5-minute skill invocation prevents a 2-hour rework. |
| "I'll just do a quick fix" | Quick fixes that skip `npm run check && npm run lint && npm run test` leave broken states for the next agent. |
| "The user didn't ask for a review" | If code changed, it needs review. That's not optional. |
| "I can skip the design phase" | You can. You shouldn't. The critique exists because your designs have blind spots. |
| "I don't need to plan, I'll figure it out as I go" | That's how you end up rewriting half the implementation. 10 minutes of /pipeline:architecture saves hours of rework. |
| "The workpackage has obvious UI, I'll skip /pipeline:design" | The design step is where multi-variant exploration happens. Skipping it locks you into the first idea — almost always not the best one. |
| "I know what a Thread / Block / Artifact is, I'll skip /pipeline:refine" | If the requirement were obvious you wouldn't need a 4-paragraph workpackage. /pipeline:refine's probes catch silent assumptions before they become load-bearing. |
| "A retro is navel-gazing" | Without /pipeline:retro, you repeat the same mistakes every workpackage. Compounding improvement is the whole point. |
| "I'll just bump versions manually" | Manual bumps skip changelog research, miss breaking changes, and skip verification. /upgrade-versions catches what you won't. |

## Skill Priority

1. **Refine first:** /pipeline:refine (any story whose goal is unclear, or that introduces/reshapes a primitive / domain concept / load-bearing noun)
2. **Design next:** /pipeline:design (planner produces; UI stories, before architecture)
3. **Architecture then:** /pipeline:architecture (planner produces; every story, before any code)
4. **Critique:** /pipeline:design-critique then /pipeline:architecture-critique (reviewer evaluates; different agent than producer)
5. **Combined skills:** /pipeline:pipeline
6. **Maintenance skills:** /upgrade-versions, /pipeline:lore
7. **Compounding:** /pipeline:retro (after shipping — feeds improvements back into skills)
