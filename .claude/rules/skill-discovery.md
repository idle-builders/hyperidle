# Skill Discovery

Before responding to ANY implementation or review request, check if a skill should be invoked. Even at 1% chance of applicability, invoke the skill BEFORE generating any response.

## Two kinds of skills

**Individual skills** — domain knowledge loaded INTO an agent session. They define a specific act, not a step. They never launch agents.
- `/concept`, `/design`, `/architecture` (designer — production)
- `/human-design-review` (designer + founder — conditional stakes-gated phase after `/design-critique`; founder annotates the rendered variant in the browser, designer revises the TSX to approval. Novel `DESIGN-CLASS` only; a novel design in an autonomous run parks)
- `/design-critique`, `/architecture-critique`, `/review` (reviewer — evaluation + 6 lenses + AC completeness)
- `/write-tests`, `/write-code`, `/write-docs`, `/visual-polish` (builder)
- `/ship` (builder — verify + attestation + PR)
- `/retro` (Explore agent — fresh-context observation)
- `/compound` (self-improvement — pattern detection in retro log)
- `/lore` (any)

**Combined skills** — orchestrate agent launches. They define steps: "launch agent X with skill Y."
- `/pipeline` — full autonomous build pipeline
- `/upgrade-versions` — foundation-first layered dependency upgrade

**Manual deep-review skills (Fable, founder-invoked)** — run on the `auditor` agent (Fable), NOT part of `/pipeline`. Whole-surface, coverage-aware across runs via `.pipeline/audits/<domain>/ledger.json`. Reserved for high-stakes passes where Fable's long-horizon lead pays for itself.
- `/security-audit` — full penetration-style security bench
- `/product-deep-review` — feature functionality + user value + visual testing

## Decision Flowchart

```
User request arrives
    │
    ├── Is it about defining a primitive or domain concept? → /concept <story>
    ├── Is it about exploring UI/UX direction? ──→ /design <story>
    ├── Is it about a founder annotating a rendered design variant? → /human-design-review <story>
    ├── Is it about producing the technical plan? → /architecture <story>
    ├── Is it about building a feature? ─────────→ /pipeline <story>
    ├── Is it about running multiple stories? ───→ /pipeline <target>
    ├── Is it about reviewing code? ─────────────→ /review <changes>
    ├── Is it about shipping / pushing / PRs? ──→ /ship <workpackage-id>
    ├── Is it about writing user-facing docs? ───→ /write-docs <doc-path>
    ├── Is it about documenting decisions? ──────→ /lore <files|scan|index>
    ├── Is it about visual fidelity? ────────────→ /visual-polish <reference>
    ├── Is it about process improvement? ────────→ /retro <workpackage|pipeline>
    ├── Is it about updating dependencies? ──────→ /upgrade-versions [scope]
    └── None of the above? ──────────────────────→ Proceed normally
```

**Note (block-1b):** `/ship` handles the verify → attestation → commit → push → PR flow. The attestation system (HMAC-signed `.verify-attestation.json`) lets CI validate in ~30s instead of re-running full verify. `/review` is the single comprehensive review skill — 3 positive lenses (architecture, design, security) + 3 negative lenses (adversarial, simplification, slop) + AC completeness. `/write-tests` and `/write-code` stay separate — red and green are different cognitive acts. `/design-critique` and `/architecture-critique` moved from designer to reviewer — the evaluator must be a different agent than the producer. The reviewer runs critique in Phase 2, then code review in Phase 4, carrying design/arch context forward.

## Red Flags — Rationalizations for Skipping Skills

| Rationalization | Why It's Wrong |
|---|---|
| "This is too simple for /pipeline" | Simple workpackages have the highest skip rate and highest regression rate. |
| "I already know what to do" | The skill isn't about knowing — it's about the process gates that catch what you missed. |
| "The skill will slow me down" | A 5-minute skill invocation prevents a 2-hour rework. |
| "I'll just do a quick fix" | Quick fixes that skip `npm run check && npm run lint && npm run test` leave broken states for the next agent. |
| "The user didn't ask for a review" | If code changed, it needs review. That's not optional. |
| "I can skip the design phase" | You can. You shouldn't. The critique exists because your designs have blind spots. |
| "I don't need to plan, I'll figure it out as I go" | That's how you end up rewriting half the implementation. 10 minutes of /architecture saves hours of rework. |
| "The workpackage has obvious UI, I'll skip /design" | The design step is where multi-variant exploration happens. Skipping it locks you into the first idea — almost always not the best one. |
| "I know what a Thread / Block / Artifact is, I'll skip /concept" | If the concept were obvious you wouldn't need a 4-paragraph workpackage. /concept's probes catch silent assumptions before they become load-bearing. |
| "A retro is navel-gazing" | Without /retro, you repeat the same mistakes every workpackage. Compounding improvement is the whole point. |
| "I'll just bump versions manually" | Manual bumps skip changelog research, miss breaking changes, and skip verification. /upgrade-versions catches what you won't. |

## Skill Priority

1. **Concept first:** /concept (any story that introduces or reshapes a primitive / domain concept / load-bearing noun)
2. **Design next:** /design (designer produces; UI stories, before architecture)
3. **Architecture then:** /architecture (designer produces; every story, before any code)
4. **Critique:** /design-critique then /architecture-critique (reviewer evaluates; different agent than producer)
5. **Combined skills:** /pipeline
6. **Maintenance skills:** /upgrade-versions, /lore
7. **Compounding:** /retro (after shipping — feeds improvements back into skills)
