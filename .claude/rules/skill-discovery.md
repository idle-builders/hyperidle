# Skill Discovery

Before responding to ANY implementation or review request, check if a skill should be invoked. Even at 1% chance of applicability, invoke the skill BEFORE generating any response.

## Decision Flowchart

```
User request arrives
    │
    ├── Is it about defining a primitive or domain concept? → /concept <workpackage>
    ├── Is it about exploring UI/UX direction? → /design <workpackage>
    ├── Is it about design quality of one component? → /design-critique <component>
    ├── Is it about producing the technical plan? → /architecture <workpackage>
    ├── Is it about scoring an architecture plan? → /architecture-critique <workpackage>
    ├── Is it about building a feature? ─────→ /implement <workpackage>
    ├── Is it about running multiple workpackages? → /pipeline <target>
    ├── Is it about writing tests (TDD red)? → /write-tests <workpackage>
    ├── Is it about writing code (TDD green)? → /write-code <workpackage>
    ├── Is it about reviewing code? ─────────→ /review <changes>
    ├── Is it about verifying code works? ───→ /verify
    ├── Is it about shipping/committing? ────→ /ship <workpackage>
    ├── Is it about checking if done? ───────→ /check-definition-of-done <workpackage>
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

## Verification Gate — Non-Negotiable

Every skill that produces or modifies code MUST end with `bun run verify`. This is built into /write-tests, /write-code, /apply-review, /simplify, /ship, /upgrade, and /pipeline (step 15b). If you invoke any of these skills manually or compose them ad-hoc, verify is still required — never skip it because "the tests already passed during development."

## Red Flags — Rationalizations for Skipping Skills

| Rationalization | Why It's Wrong |
|---|---|
| "This is too simple for /implement" | Simple workpackages have the highest skip rate and highest regression rate. |
| "I already know what to do" | The skill isn't about knowing — it's about the process gates that catch what you missed. |
| "The skill will slow me down" | A 5-minute skill invocation prevents a 2-hour rework. |
| "I'll just do a quick fix" | Quick fixes without /verify leave broken states for the next agent. |
| "The user didn't ask for a review" | If code changed, it needs review. That's not optional. |
| "I can skip the design phase" | You can. You shouldn't. The adversary exists because your designs have blind spots. |
| "I don't need to plan, I'll figure it out as I go" | That's how you end up rewriting half the implementation. 10 minutes of /architecture saves hours of rework. |
| "The workpackage has obvious UI, I'll skip /design" | The design step is where multi-variant exploration happens. Skipping it locks you into the first idea — almost always not the best one. |
| "I know what a Thread / Block / Artifact is, I'll skip /concept" | If the concept were obvious you wouldn't need a 4-paragraph workpackage. /concept's probes catch silent assumptions before they become load-bearing. |
| "A retro is navel-gazing" | Without /retro, you repeat the same mistakes every workpackage. Compounding improvement is the whole point. |
| "I'll just bump versions manually" | Manual bumps skip changelog research, miss breaking changes, and skip verification. /upgrade catches what you won't. |

## Skill Priority

1. **Concept first:** /concept (any workpackage that introduces or reshapes a primitive / domain concept / load-bearing noun)
2. **Design next:** /design + /design-critique (UI workpackages, before architecture)
3. **Architecture then:** /architecture + /architecture-critique (every workpackage, before any code)
4. **Process skills:** /implement, /pipeline, /review, /check-definition-of-done
5. **Quality skills:** /verify, /simplify, /slop-scan
6. **Maintenance skills:** /upgrade, /ship, /threat-model, /lore
7. **Compounding:** /retro (after shipping — feeds improvements back into skills)
