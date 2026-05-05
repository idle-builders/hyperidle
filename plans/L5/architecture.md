# L5 — Knowledge relevance signals: technical plan

> Architecture output for `docs/work-packages/TRACK-L.md` § L5 (lines 177-205).
> Concept input: `docs/knowledge-architecture/relevance-and-attention.md` (the "Relevance / Attention" section, written by this story).
> Implementation contract for L22: `docs/work-packages/TRACK-L.md` § L22 (lines 707-734).
> Cross-link: `plans/reviews/improvements-knowledge.md` #1.
> Bug L22 fixes: `packages/fabric/src/attention-scoring.ts` (per-kind impact constant + `computeUsage` returning literal 0).

L5 is **spec-only**. No schema, no routes, no code. The data contracts and types land in L22. This plan records the architect's decisions so L22 has a single, unambiguous target.

---

## 1. Story summary

L5 rewrites the "Relevance / Attention" section of `docs/knowledge-architecture/relevance-and-attention.md` so that recency and frequency are first-class data contracts (every knowledge item knows when it was last validated, last edited, last accessed, and how often it has been accessed in a recent window from server-side tracking), records a citation ship-or-stage decision with rationale, defines the composite formula and its tunable inputs, picks numerical defaults, names the configuration source (DB), and forbids the fake-number anti-pattern explicitly.

---

## 2. Decision log

### Decision D1 — Citation: STAGED with absent values (`—`) for L22

**Decision.** Citation is **NOT shipped** in L22. The `citationCount` field exists in the data contract but is allowed to be `null`, and the impact column renders `—` until a trustworthy citation source is wired. L22 deletes the `IMPACT_BY_KIND` constant in `packages/fabric/src/attention-scoring.ts` regardless — the bug is fixed by removing the fake number, not by replacing it with another fake number.

**Rationale.**

1. **No trustworthy source today.** Citation means "the agent actually used this knowledge item to produce its output" — a behavioral signal, not a delivery signal. The Knowledge Fabric knows what it materialized into a session (delivery), but materialization is a superset of citation: the fabric loaded 200 practices; the agent referenced two. Reading `meta.usageCount` from the knowledge_items row is already documented as forbidden in `packages/fabric/src/attention-scoring.ts` lore — `meta` is agent-writable and "an agent could trivially inflate the signal to force its own notes into the human queue." Self-reported citation in session-completion output has the same gameability shape: a low-trust agent can over-cite to inflate items it authored.
2. **The two reliable paths are bigger than L22.** (a) Make consulting knowledge a typed harness tool (`readKnowledge(id)` recorded server-side, write-restricted to the harness, not the agent) — this is a multi-track contract change. (b) Post-hoc trace analysis (NLP on the agent's reasoning to attribute knowledge use) — research-grade, not data-layer work. Neither belongs in L22.
3. **Recency and frequency are sufficient for the v3 Knowledge Basic 1 journey.** "Surface the most relevant items" is served by recency × frequency alone today. The composite weights citation at zero until citation has a trustworthy source.
4. **The anti-pattern rule kicks in.** The existing per-kind impact constant is already a fake number (`anti_pattern: 0.8`, `decision: 0.6`, etc.). It looks like data; it is not. L22 deletes it. Until citation data exists, the impact column reads `—`.
5. **Forward-compat of the data contract.** L22 still adds the `citationCount` and `lastCitedAt` columns (nullable). When a future story (call it `L-CITATION` — to be specced when the harness contract decision is made) ships a trustworthy source, the column already exists, the composite already weights it, and the renderer already switches from `—` to a number when the field becomes non-null. No migration churn.

**What this means for L22 concretely:**
- Schema columns added: `lastValidatedAt`, `lastEditedAt`, `lastAccessedAt`, `accessCount30d`, `citationCount` (nullable; populated only when a trusted source exists), `lastCitedAt` (nullable).
- The composite formula uses citation with a non-zero weight, but with the convention that `null` citation → that signal contributes 0 (not 0.5, not a default — explicitly absent). This keeps the formula stable when citation eventually ships.
- The renderer rule: any signal that is `null` renders `—`. Never 0, never a fake constant. Tested by the L22 fake-zero-guard test.

**What this defers:** a follow-up story `L-CITATION` (out of Track L; not yet specced) owns either the typed `readKnowledge(id)` harness tool or the post-hoc trace path. The architect re-evaluates feasibility at that time.

### Decision D2 — Composite formula

The relevance composite is a weighted sum of three signals normalised to `[0, 1]`, with the convention that `null` inputs contribute 0:

```
relevance(item) =
    w_recency   * recencySignal(item)
  + w_frequency * frequencySignal(item)
  + w_citation  * citationSignal(item)

  / (w_recency + w_frequency + w_citation_effective)

where:
  recencySignal     = exp(-ln(2) * age_days / RECENCY_HALFLIFE_DAYS)
                      // age_days = max(0, now - max(lastValidatedAt, lastEditedAt, lastAccessedAt)) / 1 day
                      // 1.0 at age 0, 0.5 at half-life, asymptotic to 0
  frequencySignal   = clamp01(accessCount30d / FREQUENCY_SATURATION)
                      // saturates at FREQUENCY_SATURATION accesses in the trailing 30-day window
  citationSignal    = if citationCount == null   → 0
                      else clamp01(citationCount / CITATION_SATURATION)
                      // staged in L22 — always 0 until D1's follow-up

  w_citation_effective = w_citation if citationCount != null else 0
                         // omits citation from the denominator while it is staged,
                         // so a row with only recency+frequency normalises correctly
```

Rationale:
- **Exponential decay for recency** matches the established mental model ("how stale is this") and is bounded `[0, 1]` without clamping artifacts. The half-life parameter is the one tunable knob that captures "what counts as fresh."
- **Linear-saturating frequency** mirrors the existing `REPETITION_SATURATION` pattern in `attention-scoring.ts` — agents and humans understand "after N accesses it stops mattering more."
- **Effective denominator** is the part most easy to get wrong: when citation is staged (null), we drop its weight from the divisor so a row with only recency + frequency does not get penalised. When citation ships, the denominator naturally re-includes it.
- This is a separate score from the existing `attentionScore` (which serves the human-queue use case in `attention-scoring.ts`). Naming: `relevanceScore` is the user-facing rank for the Knowledge view; `attentionScore` remains the facilitator-queue signal. L22 surfaces `relevanceScore` on the row; the existing attention score is unchanged.

### Decision D3 — Numerical defaults

Picked by the architect at plan time. All values are tunable in `factory_settings` per Decision D4.

| Constant | Default | Unit | Rationale |
|---|---|---|---|
| `RECENCY_HALFLIFE_DAYS` | `14` | days | Fortnightly cadence — items not touched in two weeks start losing relevance; items dormant for two months are halved twice (relevance 0.25). Mirrors the founder's weekly-curation rhythm in §9 of `docs/knowledge-architecture/`. |
| `FREQUENCY_SATURATION` | `5` | accesses | After 5 accesses in 30 days the signal saturates. Matches the existing `REPETITION_SATURATION` constant value in `attention-scoring.ts`. |
| `FREQUENCY_WINDOW_DAYS` | `30` | days | The "recent window" for `accessCount30d`. Aligns with monthly Chief-of-Staff coaching cadence. |
| `CITATION_SATURATION` | `5` | citations | Same shape as frequency; placeholder until D1's follow-up ships citation. Tunable so the future story can re-pick. |
| `w_recency` | `0.4` | weight | Highest of the three — the v3 doc names recency as the load-bearing signal. |
| `w_frequency` | `0.4` | weight | Equal to recency — together they carry the entire composite while citation is staged. |
| `w_citation` | `0.2` | weight | Lowest while staged at zero contribution; ready to grow when citation ships. |

The weights sum to `1.0` so the normalised composite is `[0, 1]` directly. They MUST remain non-negative; the loader rejects negative or non-finite values (defense-in-depth, mirroring `loadAttentionWeights` in `scoring-config.ts`).

### Decision D4 — Configuration source: DB (`factory_settings`), not env

**Decision.** All tunable constants in D3 live in the existing `factory_settings` table under the prefix `relevance.`:

```
relevance.weight.recency        = "0.4"
relevance.weight.frequency      = "0.4"
relevance.weight.citation       = "0.2"
relevance.recencyHalflifeDays   = "14"
relevance.frequencySaturation   = "5"
relevance.frequencyWindowDays   = "30"
relevance.citationSaturation    = "5"
```

**Rationale.**
1. **Precedent.** Attention weights already live in `factory_settings` under `attention.weight.*` (see `packages/fabric/src/scoring-config.ts:126`). Same shape, same loader pattern, same security model.
2. **Security model is established.** The lore on `loadAttentionWeights` says: "`attention.weight.*` factory_settings keys MUST be human-write-only. The settings write endpoint is expected to reject agent writes to any key under the `attention.weight.` prefix." L22 extends the same prefix-rejection rule to `relevance.*`.
3. **Per-deployment tuning without rebuild.** Env vars require a process restart and do not survive across SQLite + PostgreSQL drivers cleanly. Factory settings are a Drizzle-native table read on every score; tuning takes effect on the next batch.
4. **Non-source.** AC explicitly forbids tunables in source. The existing scoring-config.ts pattern keeps DEFAULTs as a fallback constant in source (defense-in-depth — a totally-empty settings table still yields a sane score) but the *active* tuning is the DB row. This matches AC: "Configuration that tunes the composite lives in DB or env, never in source." Defaults-as-fallback is not "lives in source" — it is "lives in the table; source is the bootstrap."

### Decision D5 — Access tracking: server-side, on `GET /api/knowledge/:layer/:id`

**Decision.** A knowledge "access" is recorded when the server returns a single knowledge item to a client (human or agent). The existing handler at `packages/server/src/routes/knowledge.ts:203` (`router.get("/:layer/:id", ...)`) is the access boundary. List endpoints (`GET /:layer`, `GET /search`) do NOT count as access — only the detail fetch does.

**Mechanism.**
- A new `knowledge_access_log` table records `(item_id, accessor_kind, accessor_id, accessed_at)`. Append-only, indexed on `(item_id, accessed_at)`.
- `accessor_kind` is the closed enum `human | agent`. `accessor_id` is the user/agent id from the request auth context.
- The detail handler appends one row per successful 200 response. The append is non-blocking from the user's perspective: the response returns first, the row write fires after (the write must still be observable in the next read for tests; L22 picks the implementation — fire-and-forget is fine if the test fixture asserts eventual consistency, otherwise synchronous is the simpler choice).
- The frequency signal is computed by counting log rows with `accessed_at >= now - FREQUENCY_WINDOW_DAYS` per `item_id`. This is a single grouped query in the L22 batch context-builder, mirroring the existing `editRows` aggregation in `buildAttentionContext`.

**Why server-side, not client analytics.**
- The AC explicitly says "from server-side tracking, not client analytics." Client analytics is gameable, requires a separate pipeline, and double-counts on tab refreshes. Server-side counts the canonical "the data was delivered to the consumer" event.
- Self-reported access from agents (e.g. an agent saying "I read 5 items") is forbidden under the same security model as `meta.impact`: agent-writable, gameable, rejected.

**What gets counted.**
- A user opening a Knowledge detail page → counts.
- An agent calling `GET /api/knowledge/L3/<id>` (e.g. to fetch a practice during a session) → counts.
- The Knowledge Fabric materialising 200 items into a session pack → does **not** count (the pack is built via internal repo calls, not the HTTP route). Materialization is bounded by the budget and would dominate the signal if counted.
- A list view rendering 50 rows → does **not** count (the user did not open any item).

**Recency vs access.**
- `lastAccessedAt` is `MAX(accessed_at)` from the log per item.
- `accessCount30d` is `COUNT(*)` from the log over the trailing 30 days per item.
- `lastValidatedAt` and `lastEditedAt` come from the existing `knowledge_edit_log` (filter by editor type) — no new source needed.

### Decision D6 — Naming

- The user-facing composite is **`relevanceScore`** (Knowledge view sort).
- The facilitator-queue signal stays **`attentionScore`** (existing `attention-scoring.ts` engine, untouched by L5/L22).
- `lastValidatedAt` = most recent edit by editor=`facilitator` or status transition into `validated`.
- `lastEditedAt` = most recent edit by any editor (human or agent).
- `lastAccessedAt` = most recent row in `knowledge_access_log` per item.
- `accessCount30d` = trailing-30-day count from `knowledge_access_log`.
- `citationCount` = `null` until the staged citation source ships; `lastCitedAt` paired with it.

These names land in the spec; L22 implements them.

---

## 3. route-checklist

```
routes: none (spec-only)
```

L5 ships zero new routes, zero schema changes, zero code. The implementation contract for L22 is recorded here; L22's plan owns its own route checklist when it is written.

For reference, L22 will touch:
- `GET /api/knowledge/:layer/:id` — adds the access-log append (the only behavioural change).
- New schema: `knowledge_access_log` table; new columns on `knowledge_items` row payload (derived projections).
- New `factory_settings` keys under `relevance.*`.
- `packages/fabric/src/attention-scoring.ts` — `IMPACT_BY_KIND` constant deleted; `computeUsage` rewired to read from `knowledge_access_log`. (L22's surgery, not L5's.)

---

## 4. Acceptance criteria — verification methods

Spec-only story; each AC is verified by reading the rewritten section.

| ID | AC | Verification |
|---|---|---|
| AC-1 | The "Relevance / Attention" section of `docs/knowledge-architecture/relevance-and-attention.md` is rewritten so recency and frequency ship as data contracts (every knowledge item knows last-validated / last-edited / last-accessed and 30-day access count from server-side tracking). | Read `docs/knowledge-architecture/relevance-and-attention.md` — assert the four data fields are named, the source is named as `knowledge_access_log` from server-side tracking, and "client analytics" is explicitly excluded. |
| AC-2 | Citation ship-or-stage decision recorded in spec with rationale. | Read the spec — assert it names "stage" as the decision, points at the security/feasibility rationale, and names the future story label. |
| AC-3 | Composite formula + numerical defaults recorded. | Read the spec — assert the formula, the 7 constants in D3 with values, and the staged-citation effective-denominator rule are present. |
| AC-4 | Configuration source named as DB (`factory_settings`), never source. | Read the spec — assert it names `factory_settings`, the `relevance.*` prefix, and the human-write-only security rule. |
| AC-5 | Anti-pattern rule explicit: render `—` not a fake number. The bug citation points at `packages/fabric/src/attention-scoring.ts`. | Read the spec — assert the literal rule "render `—` not a fake number" is present and the file path is cited. |
| AC-6 | Cross-link: `plans/reviews/improvements-knowledge.md` #1 cites this spec. | Either (a) `improvements-knowledge.md` #1 already references "L5" / `relevance-and-attention.md`, or (b) the rewritten section back-references `improvements-knowledge.md` #1 explicitly. The current `improvements-knowledge.md` line 24 already names the proposed columns; this plan ensures the rewritten section back-references that document. |
| AC-7 | `bun run check` + `bun run lint` pass. | Run the commands. Skip `bun run test` (no test changes for spec-only). |

---

## 5. Ordered task list

1. **T1** — Read the existing knowledge-architecture docs to anchor the new file at the correct location.
2. **T2** — Create `docs/knowledge-architecture/relevance-and-attention.md` with the full "Relevance / Attention" section: `relevanceScore` as user-facing rank, `attentionScore` as facilitator-queue signal, recency + frequency as first-class data contracts from `knowledge_access_log` server-side tracking. Citation staged with absent values rendering `—`. Composite formula, numerical defaults, configuration source, anti-pattern rule, and cross-link are all written into the file.
3. **T3** — Add a one-line link from `docs/knowledge-architecture/index.md` to the new file.
4. **T4** — Verify cross-link consistency: the new file names `plans/reviews/improvements-knowledge.md` #1 by file + section. Add the "Spec / implementation" back-reference at the bottom of `improvements-knowledge.md` #1 if it lacks an L5 anchor.
5. **T5** — Run `bun run check` + `bun run lint`. Confirm zero errors. Skip `bun run test` (spec-only — no code changed).
6. **T6** — Commit and report.

No implementation code. No tests. No schema. The plan and the rewritten section are the only artifacts.

---

## 6. No-test rationale (spec-only)

L5 changes Markdown files in `docs/knowledge-architecture/` and `plans/L5/`. There is no behaviour to test. The L22 story owns the tests that prove the spec is implemented correctly:
- L22 tests assert the seven `factory_settings` keys load with the correct defaults and reject negatives.
- L22 tests assert the composite formula matches D2 byte-for-byte on golden fixtures.
- L22 tests assert the fake-zero-guard: a row with all signals null renders `—`, never 0 or a fake constant.
- L22 e2e: open Knowledge → row signals visible → sort by recency → list re-orders.

L5's only quality gate is `bun run check` + `bun run lint` — the markdown is grammatically valid and the file still parses. Both are run.

---

## 7. Cross-link to `plans/reviews/improvements-knowledge.md` #1

`plans/reviews/improvements-knowledge.md` #1 ("Three relevance signals as first-class data — All three agreed") names the columns this plan formalises:
- `lastAccessedAt`, `lastValidatedAt`, `accessCount`, `citationCount`, `impactScore` — recorded as the proposed change at line 24.
- The architect's call (this plan) takes the proposal further: stages citation, names the access-tracking mechanism, picks decay constants, picks weights, and points at `factory_settings` as the config source.

The new `docs/knowledge-architecture/relevance-and-attention.md` file cites `plans/reviews/improvements-knowledge.md` #1 by file + section heading.

---

## 8. Decisions deferred to L22 (not this plan)

L5 is spec-only. L22 owns:
- Schema migration for `knowledge_access_log` (table shape, indexes, dual-driver SQLite + PostgreSQL).
- Schema migration for the new columns on the materialised knowledge-item projection (whether they are computed in a view or denormalised on the row).
- The exact `GET /api/knowledge/:layer/:id` instrumentation (synchronous vs fire-and-forget access-log append; the test fixture decides).
- Whether the per-kind impact constant is deleted in a `BREAKING:` step or behind a feature flag (architect's call at L22 plan time — a hard delete is cleaner; this plan recommends hard delete because the fake number is the bug the rewritten spec exists to fix).
- The Knowledge view sort UI and URL state — L22's own design + architecture pass.

---

## 9. Open questions (none blocking)

- **OQ-1 (informational):** the future `L-CITATION` story has not been allocated a track-letter. The architect rebooting Track L (or whoever extends Track P/Q) should pick one when the harness contract decision is made. This plan does not block on it.
- **OQ-2 (informational):** the rewritten section calls out that `lastValidatedAt` derives from `knowledge_edit_log` filtered to `editor='facilitator'` OR status-transition-into-validated. The exact derivation belongs in L22's plan; the rewritten spec just names the input source.

No question blocks L5 from shipping the rewrite.
