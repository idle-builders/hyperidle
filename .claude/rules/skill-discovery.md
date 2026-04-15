# Skill Discovery

Before responding to ANY implementation or review request, check if a skill should be invoked. Even at 1% chance of applicability, invoke the skill BEFORE generating any response.

## Decision Flowchart

```
User request arrives
    │
    ├── Is it about planning work? ──────────→ /planning <story>
    ├── Is it about building a feature? ─────→ /implement <story>
    ├── Is it about running multiple stories? → /pipeline <target>
    ├── Is it about reviewing code? ─────────→ /review <changes>
    ├── Is it about verifying code works? ───→ /verify
    ├── Is it about shipping/committing? ────→ /ship <story>
    ├── Is it about checking if done? ───────→ /check-definition-of-done <story>
    ├── Is it about simplifying code? ───────→ /simplify <files>
    ├── Is it about AI code quality? ────────→ /slop-scan <files>
    ├── Is it about security analysis? ──────→ /threat-model <scope>
    ├── Is it about documenting decisions? ──→ /lore <files|scan|index>
    ├── Is it about process improvement? ────→ /retro <story|pipeline>
    └── None of the above? ──────────────────→ Proceed normally
```

## Red Flags — Rationalizations for Skipping Skills

| Rationalization | Why It's Wrong |
|---|---|
| "This is too simple for /implement" | Simple stories have the highest skip rate and highest regression rate. |
| "I already know what to do" | The skill isn't about knowing — it's about the process gates that catch what you missed. |
| "The skill will slow me down" | A 5-minute skill invocation prevents a 2-hour rework. |
| "I'll just do a quick fix" | Quick fixes without /verify leave broken states for the next agent. |
| "The user didn't ask for a review" | If code changed, it needs review. That's not optional. |
| "I can skip the design phase" | You can. You shouldn't. The adversary exists because your designs have blind spots. |
| "I don't need to plan, I'll figure it out as I go" | That's how you end up rewriting half the implementation. 10 minutes of /planning saves hours of rework. |
| "A retro is navel-gazing" | Without /retro, you repeat the same mistakes every story. Compounding improvement is the whole point. |

## Skill Priority

1. **Planning first:** /planning (before any implementation)
2. **Process skills:** /implement, /pipeline, /review, /check-definition-of-done
3. **Quality skills:** /verify, /simplify, /slop-scan
4. **Support skills:** /ship, /threat-model, /lore
5. **Compounding:** /retro (after shipping — feeds improvements back into skills)
