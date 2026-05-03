# Skill Discovery

Before responding to ANY implementation or review request, check if a skill should be invoked. Even at 1% chance of applicability, invoke the skill BEFORE generating any response.

## Decision Flowchart

```
User request arrives
    │
    ├── Is it about defining a primitive or domain concept? → /concept <story>
    ├── Is it about exploring UI/UX direction (and in-session critique)? → /design <story>
    ├── Is it about producing the technical plan (and in-session critique)? → /architecture <story>
    ├── Is it about building a feature? ─────→ /implement <story>
    ├── Is it about running multiple stories? → /pipeline <target>
    ├── Is it about reviewing code? ─────────→ /review <changes>
    ├── Is it about checking if done? ───────→ /check-definition-of-done <story>
    ├── Is it about simplifying code? ───────→ /simplify <files>
    ├── Is it about AI code quality? ────────→ /slop-scan <files>
    ├── Is it about security analysis? ──────→ /threat-model <scope>
    ├── Is it about documenting decisions? ──→ /lore <files|scan|index>
    ├── Is it about visual fidelity? ────────→ /visual-polish <reference>
    ├── Is it about token/grid/aesthetic lint? → /design-lint <files>
    ├── Is it about process improvement? ────→ /retro <workpackage|pipeline>
    ├── Is it about updating dependencies? ──→ /upgrade [scope]
    └── None of the above? ──────────────────→ Proceed normally
```

**Note (block-1b):** `/design-critique`, `/architecture-critique`, `/verify`, and `/ship` were collapsed away. Critique now runs in-session inside `/design` (Phase 2) and `/architecture` (Phase 4); verify runs as CI on every push; ship is replaced by the continuous-commit + draft-PR pipeline (`gh pr ready` flips when Cold DoD approves, suppressed under `PIPELINE_AB_MODE=1`).

## Red Flags — Rationalizations for Skipping Skills

| Rationalization | Why It's Wrong |
|---|---|
| "This is too simple for /implement" | Simple workpackages have the highest skip rate and highest regression rate. |
| "I already know what to do" | The skill isn't about knowing — it's about the process gates that catch what you missed. |
| "The skill will slow me down" | A 5-minute skill invocation prevents a 2-hour rework. |
| "I'll just do a quick fix" | Quick fixes that skip `bun run check && bun run lint && bun run test` leave broken states for the next agent. |
| "The user didn't ask for a review" | If code changed, it needs review. That's not optional. |
| "I can skip the design phase" | You can. You shouldn't. The adversary exists because your designs have blind spots. |
| "I don't need to plan, I'll figure it out as I go" | That's how you end up rewriting half the implementation. 10 minutes of /architecture saves hours of rework. |
| "The workpackage has obvious UI, I'll skip /design" | The design step is where multi-variant exploration happens. Skipping it locks you into the first idea — almost always not the best one. |
| "I know what a Thread / Block / Artifact is, I'll skip /concept" | If the concept were obvious you wouldn't need a 4-paragraph workpackage. /concept's probes catch silent assumptions before they become load-bearing. |
| "A retro is navel-gazing" | Without /retro, you repeat the same mistakes every workpackage. Compounding improvement is the whole point. |
| "I'll just bump versions manually" | Manual bumps skip changelog research, miss breaking changes, and skip verification. /upgrade catches what you won't. |

## Skill Priority

1. **Concept first:** /concept (any story that introduces or reshapes a primitive / domain concept / load-bearing noun)
2. **Design next:** /design (UI stories, before architecture; in-session critique loop is built in)
3. **Architecture then:** /architecture (every story, before any code; in-session critique loop is built in)
4. **Process skills:** /implement, /pipeline, /review, /check-definition-of-done
5. **Quality skills:** /simplify, /slop-scan
6. **Maintenance skills:** /upgrade, /threat-model, /lore
7. **Compounding:** /retro (after shipping — feeds improvements back into skills)
