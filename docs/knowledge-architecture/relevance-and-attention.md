# Relevance / Attention

Two scores exist; they answer different questions and never collapse into one number.

- **`relevanceScore`** — *user-facing*. The Knowledge view ranks rows by this. It answers: "of the items the user could read right now, which are most worth their attention?" Source: server-tracked behavioural signals (recency × frequency × citation). Owned by the data layer, not the facilitator.
- **`attentionScore`** — *facilitator-facing*. The "needs human" queue uses this. It answers: "of the items in the system, which need human judgement applied?" Source: structural and qualitative signals (novelty, conflict, taste-sensitivity, confidence, repetition). Owned by the facilitators.

Both ride on the same `knowledge_items` row. They are separate columns. They derive from disjoint inputs. A high `relevanceScore` does not imply a high `attentionScore` — the most-accessed item in the system may be perfectly settled and need no human input.

> The data contracts below land in TRACK-L story L22. The spec is L5 (`docs/knowledge-architecture/relevance-and-attention.md`, this section, plus `plans/L5/architecture.md`). Cross-link: `plans/reviews/improvements-knowledge.md` #1.

## `relevanceScore` — three signals, server-tracked

Every knowledge item carries four behavioural fields, all populated from server-side tracking — never client analytics:

| Field | Source | Meaning |
|---|---|---|
| `lastValidatedAt` | `knowledge_edit_log` filtered to `editor='facilitator'` OR status transitions into `validated` | When was this last endorsed by a facilitator or a human? |
| `lastEditedAt` | `knowledge_edit_log` most-recent row, any editor | When was the body last touched at all? |
| `lastAccessedAt` | `knowledge_access_log` most-recent row | When did anyone (human or agent) last fetch this item via `GET /api/knowledge/:layer/:id`? |
| `accessCount30d` | `COUNT(knowledge_access_log)` over the trailing 30 days | How often was it fetched recently? |

Access tracking is server-side by construction: every `GET /api/knowledge/:layer/:id` 200 response appends one row to `knowledge_access_log`. Detail fetches count; list/search responses do not (the user did not open any specific item). Materialisation by the Knowledge Fabric (the budgeted bulk-load into a session pack) does NOT count — the fabric loads via internal repo calls, not the HTTP route, and would dominate the signal if counted. Self-reported access from agents is forbidden under the same security model that forbids agent-writable `meta.impact`: agents can game the score, so the source of truth is the route handler, not the agent.

The composite is a weighted sum of three signals, each normalised to `[0, 1]`:

```
relevanceScore =
    w_recency   * recencySignal
  + w_frequency * frequencySignal
  + w_citation  * citationSignal

  / (w_recency + w_frequency + w_citation_effective)

where:
  recencySignal     = exp(-ln(2) * age_days / RECENCY_HALFLIFE_DAYS)
                      // age_days = days since max(lastValidatedAt, lastEditedAt, lastAccessedAt)
                      // 1.0 at age 0, 0.5 at the half-life, asymptotic to 0
  frequencySignal   = clamp01(accessCount30d / FREQUENCY_SATURATION)
  citationSignal    = if citationCount IS NULL → 0
                      else clamp01(citationCount / CITATION_SATURATION)

  w_citation_effective = w_citation when citationCount IS NOT NULL else 0
                         // citation is staged (see below); while null, it is dropped
                         // from the denominator so a row with only recency+frequency
                         // normalises correctly.
```

Numerical defaults (all overridable in DB — see "Configuration" below):

| Constant | Default | Notes |
|---|---|---|
| `RECENCY_HALFLIFE_DAYS` | 14 | Fortnightly cadence; aligns with the weekly Knowledge curation rhythm. |
| `FREQUENCY_SATURATION` | 5 accesses | After 5 accesses in 30 days the signal saturates. Same shape as the existing `REPETITION_SATURATION` constant. |
| `FREQUENCY_WINDOW_DAYS` | 30 | The "recent window" length. |
| `CITATION_SATURATION` | 5 | Placeholder while citation is staged. Tunable when citation ships. |
| `w_recency` | 0.4 | |
| `w_frequency` | 0.4 | |
| `w_citation` | 0.2 | Lowest while staged at zero contribution; ready to grow when citation ships. |

## Citation: staged with absent values

**Decision (architect, L5 plan):** citation does NOT ship in L22. The `citationCount` and `lastCitedAt` columns exist on the row contract but remain `null` until a trustworthy source is wired. While null, the impact column in the Knowledge view renders `—`, never `0` or a fake constant.

Why staged, not shipped:
1. **No trustworthy source today.** Citation means "the agent actually used this knowledge to produce its output" — a behavioural signal, not a delivery signal. The fabric knows what it materialised (delivery), but materialisation is a superset of citation.
2. **Self-report is gameable.** An agent reporting "I cited X" on session completion is the same security shape as agent-writable `meta.impact` — the existing engine in `packages/fabric/src/attention-scoring.ts` explicitly rejects that pattern with the lore "an agent could trivially inflate the signal to force its own notes into the human queue." Citation self-report would inherit the same vulnerability.
3. **The two reliable paths are bigger than L22.** (a) Make consulting knowledge a typed harness tool (`readKnowledge(id)` recorded server-side, write-restricted to the harness, not the agent). (b) Post-hoc trace analysis (NLP on the agent's reasoning to attribute knowledge use). Both are research-grade and need their own track.
4. **Forward-compat.** The data contract already carries the columns. When a future story (label: `L-CITATION`, not yet specced) ships a trustworthy source, the column flips from null to populated, the renderer flips from `—` to a number, the composite weight already exists. No migration churn.

## Anti-pattern rule (binding)

Until citation data exists, the impact column renders `—`, never a fake number. The current per-kind impact constant in `packages/fabric/src/attention-scoring.ts` (`IMPACT_BY_KIND`: `principle: 1.0`, `pattern: 0.8`, `decision: 0.6`, etc.) is the bug this spec exists to fix. L22 deletes the constant. Until citation ships, agents and the UI both know that impact = absent → `—`, and the composite simply omits citation from the denominator.

The same rule applies to every behavioural signal: any field that is `null` renders `—` in the UI. Never `0`, never a default, never a fake constant. A row with all signals null reads:

```
recency: —   frequency: —   impact: —
```

Tested by the L22 fake-zero-guard.

## Configuration: DB, never source

All seven constants above (three weights + four shape constants) live in the existing `factory_settings` table, under the `relevance.` prefix:

```
relevance.weight.recency        = "0.4"
relevance.weight.frequency      = "0.4"
relevance.weight.citation       = "0.2"
relevance.recencyHalflifeDays   = "14"
relevance.frequencySaturation   = "5"
relevance.frequencyWindowDays   = "30"
relevance.citationSaturation    = "5"
```

This mirrors the established pattern for `attention.weight.*` in `packages/fabric/src/scoring-config.ts`. Same loader shape, same security model, same defense-in-depth defaults-as-fallback-in-source. Tuning takes effect on the next batch — no rebuild, no env vars, no source change.

The settings write endpoint MUST reject agent writes to any key under the `relevance.` prefix. This is human-write-only configuration. Source-resident default constants are the bootstrap (so an empty settings table still yields a sane score), not the active tuning. Tuning lives in the table.

---

## `attentionScore` — facilitator queue (separate from `relevanceScore`)

When an item crosses a threshold on `attentionScore`, it enters a human's queue. The score is a weighted sum of:

| Signal | Why it matters | Weight |
|--------|----------------|--------|
| **Novelty** | Have we seen this pattern before? New patterns carry more information. | high |
| **Impact** | If wrong, how many agents/products would be affected? | high |
| **Conflict** | Does this contradict something we already believe? Contradictions force choice. | high |
| **Repetition** | Has this shown up multiple times independently? (Auto-validates without human.) | reduces need |
| **Confidence** | How sure are we? Based on outcome data, agent uncertainty, agreement. | reduces need |
| **Taste sensitivity** | Is this the kind of thing that needs human judgment? (Brand voice, aesthetics, strategic framing, customer intuition — things agents can't generate.) | high |
| **Recency of review** | Has a human looked at this part of the system recently? | medium |
| **Usage frequency** | Is this actually being used, or just sitting there? | medium |

`attentionScore` is the existing engine (`packages/fabric/src/attention-scoring.ts`); it is unchanged by L5. The "Recency of review" signal it consumes overlaps with `relevanceScore`'s recency input (both ultimately read `knowledge_edit_log`), but the two scores are computed and stored separately because they answer different questions and have different consumers.

Low score → the facilitator handles it autonomously. High score → it surfaces in the Knowledge view's "needs attention" list. The facilitator also chooses *what kind* of feedback to ask for:

| Signal | Question to ask |
|--------|-----------------|
| Novelty + high impact | "Is this pattern real? Should we make it a rule?" (validation) |
| Conflict | "A and B contradict. Which applies when?" (resolution) |
| Stale but popular | "This is old but still referenced. Still true?" (refresh) |
| Taste-sensitive | "Does this feel right for our brand/customer?" (judgment) |
| Cross-layer promotion | "Should this practice become a factory principle?" (elevation) |

This last column is the real point. Most agent systems either dump everything on humans (inbox hell) or auto-act on everything (drift). The facilitator's job is to ask the *right kind of question* about the *right item* at the *right time*. That's the work that converts information into knowledge.
