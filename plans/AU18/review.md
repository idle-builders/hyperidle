## Review: AU18

Phase 4 code review — contract = `plans/AU18/architecture.md` (8/10, round 3). Independently
re-ran every gate: `check` PASS (10 pkgs), `lint` PASS (both guards wired + green),
`test` 436 PASS, `test:integration:service` 2737 PASS / 0 fail, both guards `--fixtures`
+ `--check` PASS.

### Architecture
- OBSERVATION — `notifications/notification-queue.ts` — AC-1 — Single-owner holds 100%.
  `git grep notificationQueue packages/server/src` (non-test) returns ONLY notification-queue.ts;
  all 6 call sites (dispatcher/digest/notifications-routes/retention-reaper/lifecycle-propagation/
  teams-routes) route through exported functions. Guard `--check` green.
- OBSERVATION — `services/server-config.ts` — §5 — Schema extension follows the existing
  manual per-section pattern EXACTLY: every new section (observability/gitExport/cost/internal +
  notifications.delivery/silence/mutedTypes) wired in all three places (DEFAULTS, applyDefaults
  per-section `.parse()`, updateServerConfig merge branch). The §5 notifications deep-merge hazard
  is correctly closed — delivery/silence merged independently (server-config.ts:388-403) so a
  delivery-only patch preserves silence. Nested-default Zod-v4 gotcha handled via
  `applyNotificationsDefaults` explicit re-parse.
- OBSERVATION — `routes/status.ts` — §3.1 — Generic `/settings` GET+PATCH removed outright (not
  repointed); confirmed no web consumer (`packages/web` has zero `/status/settings` refs; the
  `/api/settings` refs are the separate settings.ts route). `factory_start_time` read → constant
  `SERVER_START_TIME`. Retired-endpoint test file deleted.

### Design
- N/A — no UI surface.

### Security
- OBSERVATION — `notifications/config.ts` — §3 — Notification secrets (smtp_password,
  ntfy_auth_token) correctly moved to `server_credentials` with real encryption
  (encrypt/decryptCredentialValue + getServerSecret); never written to the server_config blob.
  Redaction preserved (`REDACTED`/`*Set` flags via SafeNotificationConfig). No secret in logs.
  All SSRF/injection sanitizers (ntfy URL private-IP/DNS-rebind, SMTP CRLF, cron, email/topic)
  carried over unchanged.
- OBSERVATION — `packages/db/system-prompt-templates.ts` + `routes/agents.ts` — §3 traversal fix —
  Map-as-allowlist is airtight: `readSystemPromptTemplateForRole` resolves `filename =
  SYSTEM_PROMPT_TEMPLATE_FILES[role]` and returns null BEFORE any fs access for non-keys; the
  filename reaching `fs` is always a compile-time literal. Traversal fixtures (`../etc/passwd`,
  `..%2f`, uppercase, empty) all → null in the unit test. Route auth unchanged
  (`requireBoundary({kind:"public-data"})`); response shape `{role, content}` preserved; 404 parity
  for `assistant`/unknown.
- OBSERVATION — `config/git-export-config.ts` — AC-5 — The path/SSRF defense-in-depth in
  `loadGitExportConfig` (sanitizeRepoPath against repoRoot, sanitizeRemoteUrl against
  allowFileRemote) is intact; both re-sourced from `server_config.gitExport` instead of the KV table.
- OBSERVATION — `scripts/au18-*.ts` — AC-6 — Both guards are real, wired into `package.json`
  `lint` chain, and self-tested. Notification guard: AST scan of `.from/.insert/.update/.delete`
  + all 4 join methods with bare `notificationQueue` first-arg, zero-allowlist (owning file + its
  own test only); 4 fixture scenarios exercise violation/scoping/wrong-test/clean. KV-shape guard:
  correctly flags the `{key/k/name PK, value, timestamps}` shape, un-flags server_config/
  server_credentials typed tables; name-based boundary documented. Ran both `--fixtures` and
  `--check` myself: PASS.

### Adversarial / Simplification / Slop
- OBSERVATION (Auditor) — Verified headline claims against the diff myself: "18 exported functions"
  = 16 production-shaped + findById/listAll test-support (documented in module header); "zero
  remaining callers" of factorySettings = confirmed by whole-repo grep (only comments/@lore/
  migration-history remain) + green `check` (symbol deleted from schema/barrel/zod-schemas).
- OBSERVATION (deviation scrutiny) — All 3 builder-flagged deviations are justified, not drift:
  (a) findById/listAll — necessary because the zero-allowlist guard forbids tests touching the
  table directly, so generic test assertions need repository reads; test-only, documented.
  (b) QueueStatus type deletion — dead exported type, zero orphan refs (grep-confirmed), clean.
  (c) `limit` on listByStatus/listUnread — NOT speculative: original routes had `.limit(min(q,500))`
  and `.limit(50)`; callers pass `listByStatus(db, status, limit)` / `listUnread(db, 50)` —
  behavior-preserving. Flood-cap `[0]` semantics preserved (`const [oldestDigest] = await
  listPendingDigest(db)`).
- OBSERVATION (eval rewrite) — §4.1 rewrite is mathematically sound: `sumAllUserCost` sums
  `users.costActual` over ALL users; seedFounder leaves it null, so the single seeded agent's
  `agentCostActualMinor` == the graded total. Ratios reproduce identically: 8500/10000=85%→warning,
  10500→breach, 5000→ok, 1001/1000→blocked. Phantom `factory_cost_cap_*` seeds deleted (no prod
  reader). `seedFactorySettings` helper deleted; barrel import gone.
- OBSERVATION (Simplification) — The 18-fn kitchen-sink was a plan-level "nudge not blocker"; the
  builder kept AU14's deliberate granularity. No dead code, no single-use wrappers, no impossible
  error handling beyond the documented non-positive-cap graceful no-op in cost-sentinel (reachable
  via updateServerConfig, so defensible).
- OBSERVATION (Slop) — No verbose/restating comments, no TODO/"for now"/"simplified" tells in new
  code. @lore comments are substantive (rationale, not narration).

### WARNING — docs staleness (write-docs phase, NOT a code-verdict blocker)
- WARNING — `docs/` — AC-4/AC-5 — Several ground-truth docs now describe retired behavior. The
  plan's §7 file table scoped ZERO docs changes and the pipeline updates docs at the separate
  `/pipeline:write-docs` phase (these files also already carried pre-existing staleness — e.g.
  `packages/fabric/.../cost-cap.ts` paths that moved to `packages/server` back in AU11 — confirming
  docs are maintained on a separate cadence). Not gated by any of the 7 ACs. Enumerated so
  write-docs cannot miss them:
  - `docs/architecture/as-implemented-domain-architecture.md:398` lists `factory_settings` as a live
    table (dropped) and `:417` says cost-sentinel dedupe uses `factory_settings.cost_sentinel_last_level`
    (now `server_config.internal.costSentinelLastLevel`).
  - `docs/process-layer/the-five-primitives.md:110` — "Factory cost is SUM(users.costActual), written
    to `factory_settings.cost_actual`" — the write is REMOVED; value is now live-computed via
    `getFactoryCostActual`.
  - `docs/human-interface-layer/notification-primitive.md:42` — muted keys "in `factory_settings`
    (`notifications.mute_<typeKey>`)" → now `server_config.notifications.mutedTypes`.
  - `docs/agent-layer/agent-model.md:39` — templates "seeded into `factory_settings` under
    `system_template:<role>`" → now docs-backed via SYSTEM_PROMPT_TEMPLATE_FILES; `:11` persona
    "`users.system_prompt` + `factory_settings` templates".
  - `docs/knowledge-architecture/relevance-and-attention.md:56/76/111` and
    `docs/process-layer/wip-and-cost-limits.md:35/49`, `docs/architecture/decisions.md:36`,
    `docs/architecture/kernel-strategy-split.md:203` — reference `factory_settings` as storage for
    scoring/attention/relevance/trust weights + caps (weights are now defaults-only; caps in
    `server_config.cost`).

### AC table
| AC | PASS/FAIL | Evidence |
|----|-----------|----------|
| AC-1 | PASS | `git grep notificationQueue packages/server/src` (non-test) → only notification-queue.ts; all 6 call sites delegate; au18-notification-ownership-guard --check green. |
| AC-2 | PASS | notifications/observability/git-export/mute/silence re-backed onto server_config; public fn names + return types unchanged; route/integration suites (git-export-routes, observability routes, notifications-routes, AF8 delivery) green in the 2737-pass service lane. |
| AC-3 | PASS | cost-cap.ts sole owner: `getFactoryCostActual = sumAllUserCost`, old `recordFactoryCost` write removed from recordCostAndCheck; cost-sentinel obtains total via the function + cap via `server_config.cost.capMinor` + dedup via `server_config.internal` — touches no table. |
| AC-4 | PASS | whole-repo `git grep factorySettings`/`factory_settings` → only comments, @lore, drizzle migration history, test-doc-comments — zero live symbol/import/table-access; `check` green (export deleted from schema.ts/index.ts/zod-schemas.ts); migration 0049 `DROP TABLE factory_settings` present + journal idx 49. |
| AC-5 | PASS | fast (436) + service integration (2737, 0 fail) suites green unchanged; eval graded scenarios rewritten to reproduce identical warning/breach/ok/blocked ratios; `GET /templates/:role` parity (200 for seeded incl. product_manager/qa_engineer, 404 for assistant/unknown) proven by system-prompt-template-resolution.test.ts. Observability read-clamp drop is not a regression — route Zod min/max gates writes and the only bypass (generic /settings) is retired. |
| AC-6 | PASS | 6a: au18-notification-ownership-guard `--fixtures` (4-violation + scoping + wrong-test + clean) PASS, in lint chain. 6b: old-symbol → `check` failure (table gone) AND au18-kv-shape-guard `--fixtures` negative synthetic KV pgTable flagged, empty allowlist. Both ran green by me. |
| AC-7 | PASS | §1b confirms every notificationQueue query single-table; guard's join-method matcher (leftJoin/innerJoin/rightJoin/fullJoin) fails any join placement; no allowlisted join anywhere. |

VERDICT: DONE
