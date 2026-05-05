# L5 — Plan critique

> Architecture-quality scoring of `plans/L5/architecture.md` and the applied edits to
> `docs/knowledge-architecture/relevance-and-attention.md` (the new "Relevance / Attention" file)
> plus the back-link in `plans/reviews/improvements-knowledge.md` #1.
>
> Story spec: `docs/work-packages/TRACK-L.md` § L5.

L5 is **spec-only** — no code, no schema, no routes. The critique evaluates the plan as an
implementation contract for L22. Each dimension is scored 0–10. Pass threshold per the
architecture-critique rubric is **average ≥ 7**.

---

## Scoring

### 1. Spec alignment — 9 / 10

Every L5 acceptance criterion in TRACK-L.md § L5 lines 185–192 maps to a concrete artefact
in the plan:

| AC | Plan locus | Concept-doc locus |
|---|---|---|
| AC-1 (recency + frequency as data contracts, server-side) | § Decision D5 + D6 | "`relevanceScore` — three signals, server-tracked" subsection |
| AC-2 (citation ship-or-stage decision recorded) | § Decision D1 | "Citation: staged with absent values" subsection |
| AC-3 (composite + inputs + numerical defaults) | § Decision D2 + D3 | composite-formula code block + defaults table |
| AC-4 (config in DB or env, never source) | § Decision D4 | "Configuration: DB, never source" subsection |
| AC-5 (anti-pattern rule + bug citation) | § Decision D1 + D6 | "Anti-pattern rule (binding)" subsection |
| AC-6 (cross-link from improvements-knowledge.md #1) | § 7 | back-link in `plans/reviews/improvements-knowledge.md` #1 |
| AC-7 (check + lint + test green) | § 6 + § AC-7 | n/a (verified by DoD) |

Minor docking: AC-2 in TRACK-L.md says "the architect AND DESIGNER assess feasibility …
during planning." The plan records the architect's call but does not record a designer
sign-off. The decision is still load-bearing on a security/feasibility argument that is
firmly architect-side, so this is a presentation gap rather than a content gap.

### 2. Layer integrity — 9 / 10

Three-layer boundary is respected:
- **Human Interface** consumes `relevanceScore` for sort/rank — no direct primitive-store access.
- **Meta Layer** owns `knowledge_access_log` and the composite computation in the fabric package.
- **Agent Runtime** is read-only against `GET /api/knowledge/:layer/:id`; the access append
  is server-side, gameability is explicitly rejected (D5 + the matching anti-pattern in
  `attention-scoring.ts` lore).

The plan correctly keeps `relevanceScore` (user-facing) and `attentionScore` (facilitator
queue) as separate columns with disjoint inputs. They share `knowledge_edit_log` recency
but compute and store independently — the concept doc spells this out.

Minor docking: the plan implicitly couples L22 to a route handler in `packages/server/`. That
coupling is correct but worth a one-liner in L22's architecture pass.

### 3. Contracts — 8 / 10

Concrete contracts are named:

- Six row fields: `lastValidatedAt`, `lastEditedAt`, `lastAccessedAt`, `accessCount30d`,
  `citationCount` (nullable), `lastCitedAt` (nullable).
- One new table shape: `knowledge_access_log(item_id, accessor_kind, accessor_id, accessed_at)`,
  append-only, indexed on `(item_id, accessed_at)`.
- Seven `factory_settings` keys under the `relevance.` prefix with default values.
- One closed enum: `accessor_kind = human | agent`.
- One route side-effect: `GET /api/knowledge/:layer/:id` 200 → append one row.
- Composite formula spelled out byte-level with the staged-citation effective-denominator rule.

Docking: `lastValidatedAt`'s derivation is intentionally fuzzy (D6 + OQ-2: "edit by
editor=facilitator OR status transition into validated"). That OR is a real branch — the
two paths can disagree. L22 owns the resolution but the plan should name "tie-break: most recent of the two" or similar to
prevent drift.

### 4. Data model — 7 / 10

Strengths:
- Append-only log with the right index (`item_id, accessed_at`).
- Nullable citation columns avoid migration churn when `L-CITATION` ships.
- DB-backed config mirrors the established `attention.weight.*` shape verbatim.

Weaknesses:
- The plan does not name retention policy for `knowledge_access_log`. The frequency window
  is 30 days; log rows older than that contribute nothing to the signal but cost storage.
- No mention of how the row-level projection materialises (derived columns vs view vs join).
- No mention of indexing on `lastAccessedAt` for the Knowledge view sort.

These are not blockers — L5 is spec-only — but a strong plan would surface them so L22's
architect does not rediscover them.

### 5. Naming — 9 / 10

`relevanceScore` (user-facing) vs `attentionScore` (facilitator-facing) is a good split.
Field names are precise: `lastValidatedAt`, `lastEditedAt`, `lastAccessedAt`, `accessCount30d`,
`citationCount`, `lastCitedAt`. The `30d` suffix encodes the window length in the name —
expensive to change later, but the window is also DB-tunable.

`knowledge_access_log` matches the existing `knowledge_edit_log`. The `accessor_kind` /
`accessor_id` pair mirrors common audit-log shape.

### 6. Depth — 8 / 10

The plan goes deep where it matters:
- Citation staging is justified with a four-point rationale.
- Numerical defaults are picked with rationale.
- The staged-citation effective-denominator rule is spelled out.
- The `meta.usageCount` lore is surfaced as the precedent for rejecting agent self-report.

### 7. Failure-mode coverage — 8 / 10

Coverage:
- Empty settings table → defaults-as-fallback in source (defense-in-depth).
- Negative or non-finite weight → loader rejects, mirrors `loadAttentionWeights`.
- All signals null → renders `—`; tested by L22's fake-zero-guard.
- `null` citation → contributes 0; effective denominator drops the weight.
- Self-reported access → forbidden under the same security rule as `meta.impact`.
- Materialisation traffic → explicitly excluded from the count.

Gaps:
- No mention of clock-skew or future-dated `accessed_at` rows.
- No mention of high-cardinality DoS: an agent could call `GET /api/knowledge/:layer/:id`
  in a tight loop to inflate `accessCount30d`. L22 should pick rate-limit, unique-accessor-days, or document accepted risk.

### 8. Simplicity — 9 / 10

The plan is the right size for a spec-only story. The composite formula is a weighted sum
of three normalised signals with a single staged-citation special case — as simple as the
contract can be without losing the L22 fake-zero guarantee.

### 9. Verifiability — 7 / 10

L5 is spec-only, so verifiability is reading the rewritten section and the back-link doc.
The AC-verification table at § 4 spells out the read for each AC.

Docking: the strongest contract in the spec is verifiable only at L22 (fake-zero-guard test).
L5 cannot run that test. This is the main reason verifiability does not score higher.

---

## Average

| Dimension | Score |
|---|---|
| Spec alignment | 9 |
| Layer integrity | 9 |
| Contracts | 8 |
| Data model | 7 |
| Naming | 9 |
| Depth | 8 |
| Failure-mode coverage | 8 |
| Simplicity | 9 |
| Verifiability | 7 |
| **Average** | **8.22** |

Pass threshold: 7. **Verdict: PASS.**

---

## Findings worth flagging (non-blocking)

These are recorded for L22's architect, not gate L5:

1. **Retention policy for `knowledge_access_log`** — the 30-day window means rows older than
   that contribute nothing to the live signal. Name the policy in L22's plan (drop, archive,
   or roll up).
2. **Agent-driven access inflation** — agents can hit `GET /api/knowledge/:layer/:id` in a
   loop to inflate `accessCount30d` for items they authored. L22 should pick:
   rate-limit per (accessor_id, item_id), count unique-accessor-days, or document the
   accepted risk.
3. **`lastValidatedAt` tie-break** — when an edit AND a status transition happen in the same
   facilitator pass, the plan defers the derivation to L22 (OQ-2). The tie-break direction
   ("most recent of the two") is a contract decision; record it in L22's plan.
4. **`accessCount30d` column-name lock-in** — the `30d` suffix bakes the window length into
   the name. A future change to `FREQUENCY_WINDOW_DAYS = 60` forces a rename.
5. **Designer sign-off (AC-2)** — TRACK-L.md says the architect AND designer evaluate
   citation feasibility. The plan records the architect's call. A one-line designer
   acknowledgement would close the AC presentation gap; the substance is sound.

None of the five blocks shipping. They are L22 inputs.
