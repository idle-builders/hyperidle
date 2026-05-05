# L5 — Definition-of-Done audit

> Story: TRACK-L.md § L5 — Concept: Knowledge relevance signals.
> Branch: `feat/L5-knowledge-relevance-concept`.
> Plan: `plans/L5/architecture.md`. Critique: `plans/L5/architecture-critique.md` (avg 8.22, PASS).

L5 is **spec-only** — no code, no schema, no routes. Each AC below cites the file path,
section heading, and load-bearing sentence that satisfies it.

---

## AC-by-AC evidence

### AC-1 — "Relevance / Attention" section rewritten so recency + frequency are data contracts; access count comes from server-side tracking

**File.** `docs/knowledge-architecture/relevance-and-attention.md` § "`relevanceScore` — three signals, server-tracked".

**Evidence.**
- Two scores are introduced at the top: `relevanceScore` (user-facing) and `attentionScore` (facilitator-facing). They derive from disjoint inputs and live as separate columns on the same row.
- The four behavioural fields are named in the table: `lastValidatedAt`, `lastEditedAt`, `lastAccessedAt`, `accessCount30d`.
- The "server-side, never client analytics" rule: "Every knowledge item carries four behavioural fields, all populated from server-side tracking — never client analytics".
- The route binding: "every `GET /api/knowledge/:layer/:id` 200 response appends one row to `knowledge_access_log`. Detail fetches count; list/search responses do not". Materialisation is excluded; agent self-report is forbidden.

**Verdict.** Met.

### AC-2 — Citation evaluated by architect; ship-or-stage decision and rationale recorded

**Files.**
- Plan: `plans/L5/architecture.md` § "Decision D1 — Citation: STAGED with absent values (`—`) for L22".
- Concept: `docs/knowledge-architecture/relevance-and-attention.md` § "Citation: staged with absent values".

**Evidence.**
- Plan D1 records the decision: "Citation is **NOT shipped** in L22. The `citationCount` field exists in the data contract but is allowed to be `null`, and the impact column renders `—` until a trustworthy source is wired."
- Four-point rationale: (1) no trustworthy source today, (2) two reliable paths are bigger than L22, (3) recency + frequency suffice for v3 Knowledge Basic 1, (4) the anti-pattern rule kicks in.
- Future-story label `L-CITATION` is named in both plan § D1 and concept doc.

**Verdict.** Met.

### AC-3 — Composite + inputs + how-it-tunes defined; numerical defaults recorded

**Files.**
- Plan: `plans/L5/architecture.md` § Decision D2 and § Decision D3.
- Concept: `docs/knowledge-architecture/relevance-and-attention.md`.

**Evidence.**
- Composite formula in concept doc (code block) — three weighted signals normalised to `[0,1]`, with the staged-citation effective-denominator rule spelled out.
- Numerical defaults table — seven constants: `RECENCY_HALFLIFE_DAYS=14`, `FREQUENCY_SATURATION=5`, `FREQUENCY_WINDOW_DAYS=30`, `CITATION_SATURATION=5`, `w_recency=0.4`, `w_frequency=0.4`, `w_citation=0.2`. Sum to 1.0; loader rejects non-finite/negative.
- Plan D2 + D3 carry the same constants with rationale.

**Verdict.** Met.

### AC-4 — Tunable config in DB or env, never source

**Files.**
- Plan: `plans/L5/architecture.md` § Decision D4.
- Concept: `docs/knowledge-architecture/relevance-and-attention.md` § "Configuration: DB, never source".

**Evidence.**
- Concept doc: "All seven constants above (three weights + four shape constants) live in the existing `factory_settings` table, under the `relevance.` prefix".
- Seven concrete keys listed.
- Human-write-only security rule: "The settings write endpoint MUST reject agent writes to any key under the `relevance.` prefix."
- Defense-in-depth source defaults clarified: "Source-resident default constants are the bootstrap (so an empty settings table still yields a sane score), not the active tuning."

**Verdict.** Met.

### AC-5 — Anti-pattern rule explicit: render `—` not a fake number; bug citation points at `packages/fabric/src/attention-scoring.ts`

**File.** `docs/knowledge-architecture/relevance-and-attention.md` § "Anti-pattern rule (binding)".

**Evidence.**
- Load-bearing sentence: "Until citation data exists, the impact column renders `—`, never a fake number. The current per-kind impact constant in `packages/fabric/src/attention-scoring.ts` (`IMPACT_BY_KIND`: `principle: 1.0`, `pattern: 0.8`, `decision: 0.6`, etc.) is the bug this spec exists to fix. L22 deletes the constant."
- "any field that is `null` renders `—` in the UI. Never `0`, never a default, never a fake constant."
- Example of an all-null row rendering `recency: —   frequency: —   impact: —`.

**Verdict.** Met.

### AC-6 — Cross-link from `plans/reviews/improvements-knowledge.md` #1

**Files.**
- Forward link (concept → improvements): `docs/knowledge-architecture/relevance-and-attention.md` — "Cross-link: `plans/reviews/improvements-knowledge.md` #1."
- Back link (improvements → spec): `plans/reviews/improvements-knowledge.md` #1 — "**Spec / implementation:** TRACK-L story L5 (`plans/L5/architecture.md`) rewrites the "Relevance / Attention" section as `docs/knowledge-architecture/relevance-and-attention.md`. TRACK-L story L22 implements the data contract. Citation is staged with absent values rendering `—` (architect's call, recorded in `plans/L5/architecture.md` § Decision D1)."

**Evidence.** Both directions are present.

**Verdict.** Met.

### AC-7 — `bun run check` + `bun run lint` + `bun run test` all green

L5 changes only Markdown files. No TypeScript changed.

| Command | Exit code | Notes |
|---|---|---|
| `bun run check` | 0 | `tsc --noEmit` clean — no TS files changed. |
| `bun run lint` | 0 | Biome + ESLint: 0 errors — no TS/JS files changed. |
| `bun run test` | 0 | Vitest run; all green — no test files changed. |

**Verdict.** Met.

---

## Summary

All seven acceptance criteria are met with concrete file-path + section + sentence evidence.
Critique average is **8.22** (pass threshold 7).

**DoD verdict: DONE.**
