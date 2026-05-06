# L19 Architecture Critique

**Reviewer verdict:** PASS (7.4 / 10 average)

---

## Dimension Scores

| # | Dimension | Score | Justification |
|---|-----------|-------|---------------|
| 1 | Correctness | 7 | The plan correctly identifies the three new schema columns, the correlated subquery enrichment pattern, and the frontend type extensions. Two issues: (1) The concept says L19 adds `tokensUsed` to sessions, but the architecture adds `tokensInput` + `tokensOutput` — this is actually better granularity, but the concept and architecture disagree on the column name(s). Minor inconsistency between plan artifacts. (2) The architecture specifies five correlated subqueries selecting from `sessions WHERE task_id = ${tasks.id}`, each doing `ORDER BY started_at DESC LIMIT 1` independently. While correct, all five hit the same session row — a single subquery or lateral join would be more correct in the "single source of truth" sense (one subquery identifies the latest session, then you read its columns). The five independent subqueries could theoretically return data from different sessions if a concurrent insert happens between them — vanishingly unlikely in SQLite (single-writer) but architecturally imprecise. |
| 2 | Completeness | 7 | All ACs are addressed: (a) latest session data surfaced via enriched bet-detail endpoint, (b) jump-out affordance specified, (c) outcome chip via statusOutcomeToStatus mapping, (d) system can return latest session per task via the correlated subquery, (e) hardcoded data verified as trivially absent, (f) test plan covers Vitest + Playwright. One gap: the plan says `SessionOutcome` is defined in `events.ts` and already exported from the barrel — confirmed by reading the code. But the plan does not address the `stopped` outcome value. Looking at `sessions-routes.ts`, the PATCH handler derives outcome from `body.state`: `crashed` maps to `"crashed"`, anything else maps to `"completed"`. The `"stopped"` outcome is defined in the `SessionOutcome` type but never emitted by the current PATCH handler. The architecture does not explain how `"stopped"` sessions are created. This is a pre-existing gap (not introduced by L19), but the architecture should note it since the design maps all three outcomes to presentation statuses. |
| 3 | Consistency | 8 | Follows established patterns: correlated subquery enrichment (mirrors L18 artifact-thread-summary), status mapping function (mirrors I4 pattern), KanbanTask interface extension (mirrors previous L stories). Schema column naming follows existing conventions (`harness_url` snake_case in DB, `harnessUrl` camelCase in Drizzle). File ordering (schema -> types -> API -> frontend -> tests) is consistent with prior workpackages. |
| 4 | Performance | 7 | The five correlated subqueries each do `ORDER BY started_at DESC LIMIT 1` against the `sessions_task_id_idx` index. At expected volumes (< 50 tasks per bet, < 20 sessions per task), this is fine. The plan correctly notes the index coverage. The self-critique acknowledges the five subqueries could be collapsed. For SQLite at this scale, the performance is acceptable. One concern: the `started_at` column is TEXT (ISO timestamp string). String comparison for ordering works correctly for ISO 8601 strings, but the index on `task_id` alone does not cover `ORDER BY started_at DESC` — SQLite must scan all sessions for a given task_id and sort. A composite index `(task_id, started_at)` would allow the `LIMIT 1` to be satisfied by an index-only backwards scan. At < 20 sessions per task this is negligible, but the plan should note it. |
| 5 | Security | 8 | The harness URL is treated as opaque and only rendered in an `<a href>` — React escapes attribute values, preventing XSS. `rel="noopener noreferrer"` prevents opener access. `isValidHarnessUrl` rejects non-http(s) protocols, preventing `javascript:` URI injection. The `harnessUrl` field accepts `.url()` validation on the API input side (Zod schema). No new auth surfaces. No new POST/PATCH endpoints (only extending existing ones with optional fields). The nullable columns mean existing session creation flows are unaffected. No secrets exposed. Adequate. |
| 6 | Testability | 7 | Test plan covers: status mapping unit tests (3 cases, exhaustive), WorkBet rendering tests (chip visibility, jump-out visibility, malformed URL), TaskSheet rendering tests (session section presence/absence), Playwright E2E (seed + navigate + assert). One gap: no API-level test for the enriched `GET /bets/:id` response is specified. The bet detail endpoint is the critical data path — a Vitest test that seeds a bet + task + session and verifies the response includes the `latestSession*` fields would strengthen confidence. The builder should add this. |
| 7 | Maintainability | 8 | The plan uses existing abstractions (Drizzle schema, Zod validation, StatusChip mapping). No new packages, no new endpoints, no new component registrations. The `KanbanTask` interface accumulation is flagged in the self-critique as a future concern. The `isValidHarnessUrl` function is simple enough to be a co-located helper. The migration is additive (nullable columns only). |
| 8 | Simplicity | 7 | The overall approach is simple: 3 columns, enrich an existing endpoint, extend existing types and UI. The five correlated subqueries are the main complexity — the plan acknowledges they could be collapsed but chooses clarity over optimization. This is a reasonable trade-off for a Small story. The `KanbanTask` extension with 5 optional fields (when the Kanban card only uses 2 of them) is a simplicity concern — Option B (separate prop) was rejected but would have been cleaner from an interface perspective. Acceptable pragmatic choice. |
| 9 | Risk Awareness | 8 | The risk table covers: query performance at scale, BetDetail type mismatch, XSS via harness URL, nullable column compatibility. The `owner` vs `ownerAgentId` mismatch is flagged as an existing issue with a builder-verification note. The self-critique is honest about the five-subquery pattern and the KanbanTask field accumulation. Missing from the risk table: the `stopped` outcome path (how sessions get this outcome — see Completeness above). |

**Average: 7.4 / 10 — PASS**

---

## Strengths

1. Minimal surface area change — no new endpoints, no new packages, no new components.
2. Follows established patterns (L18 correlated subquery, I4 status mapping, existing schema conventions).
3. Additive-only migration with all nullable columns — zero risk to existing session creation flows.
4. Honest self-critique that flags real weaknesses without over-engineering solutions.

## Concerns for the Builder

1. **Five independent correlated subqueries.** While functionally correct in SQLite's single-writer model, the builder should consider collapsing them into a single subquery that selects all five columns from the latest session in one pass. Pattern: `(SELECT outcome, cost, tokens_input, tokens_output, harness_url FROM sessions WHERE task_id = tasks.id ORDER BY started_at DESC LIMIT 1)`. Drizzle's `sql` template can return a JSON object or the builder can use a CTE/lateral pattern. This is an optimization suggestion, not a blocking concern.

2. **No API-level test specified.** The builder should add a test for `GET /bets/:id` that verifies the `latestSession*` fields are returned correctly when a session exists and are null when no session exists.

3. **`--primary` token.** The architecture references `text-[var(--primary)]` for the jump-out link. The builder should verify this CSS custom property exists in `tokens.css`. If it comes from DaisyUI theme variables, use `text-primary` (DaisyUI utility class) instead of the raw variable reference.

4. **`stopped` outcome provenance.** The `SessionOutcome` type includes `"stopped"` but the current PATCH handler never produces it. The mapping and UI will handle it correctly if it appears in the database, but the builder should be aware there is no code path that currently writes `"stopped"` to the outcome column. This is a pre-existing gap, not L19's responsibility to fix.

5. **Migration file naming.** The plan specifies `0010_add_session_harness_fields.sql`. The builder must verify the migration sequence number does not collide with any migration added by a concurrent workpackage. Use `bun run db:generate` and compare against the drizzle directory.

---

## Verdict

Architecture plan is approved. The concerns are minor and addressable during implementation. The plan provides sufficient guidance for the builder to execute.
