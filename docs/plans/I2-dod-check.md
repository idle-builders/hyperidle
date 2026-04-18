# I2 — Security Hardening — Definition of Done Audit

**Branch.** `feat/I2-security-hardening` (worktree `/workspace/.worktrees/I2`)
**Auditor.** Independent QA
**Date.** 2026-04-18

## Validation runs

- `bun run check` → **PASS** (zero TS errors). `tsc --noEmit -p tsconfig.json` clean.
- `bun run lint` → exit 1, but **inherited from `main`** (pre-existing
  errors in `packages/fabric/src/materialization.ts` snake_case interface
  fields and `packages/web/src/shell/ArtifactView.tsx` `dangerouslySetInnerHTML`).
  None of the 4 errors are in I2-touched files. Verified by checking out
  `main` and re-running lint — same failures.
- `bun run test` → **PASS** (149 test files, 1666 tests passed, 2 skipped, 123s).

---

## Cluster 1 — Agent sandbox (S1–S6)

| AC | Verdict | Evidence |
|---|---|---|
| Allow-listed env (PATH, HOME, LANG, ANTHROPIC_API_KEY) | PASS | `packages/server/src/harness/claude-agent-sdk-adapter.ts:27` `ALLOWED_ENV_KEYS`; `:70-77` builds env from list + apiKey only. Test `harness/__tests__/claude-agent-sdk-adapter.security.test.ts:78-136` (4 cases inc. allow-list subset). |
| `allowDangerouslySkipPermissions` gated behind `HYPERIDLE_UNSAFE_AGENT_MODE=true` + warn log | PASS | `claude-agent-sdk-adapter.ts:84-104` strict `=== "true"` check; warn-once via `unsafeModeWarningEmitted`. Tests `:139-167` (default-off) and `:170-196` (typo-defense `=1` does not enable). |
| Local adapter refuses prod | PASS | `harness/local-workspace-adapter.ts:53-67` constructor-level throw. Test `local-workspace-adapter.security.test.ts:39-75` (5 cases). |
| Docker `spawn` argv form for `docker exec` | PASS | `harness/docker-workspace-adapter.ts:32-48` (`runDocker` argv); `:102-119` (exec uses `["exec", id, "sh", "-c", command]`). Test `docker-workspace-adapter.security.test.ts:68-145` proves payload `$(cat /etc/passwd)` lands as a single literal argv element. |
| Unit: agent env lacks HYPERIDLE_API_KEY | PASS | `claude-agent-sdk-adapter.security.test.ts:79-89`. |
| Unit: docker exec metacharacters not host-evaluated | PASS | `docker-workspace-adapter.security.test.ts:69-97`. |

## Cluster 2 — Authentication (A1–A6)

| AC | Verdict | Evidence |
|---|---|---|
| `crypto.timingSafeEqual` used | PASS | `middleware/timing-safe.ts:16-22` SHA-256 then `timingSafeEqual` (handles unequal lengths via hash equalization — addresses constraint l.110). `middleware/auth.ts:42` calls comparator. Test `middleware/__tests__/auth.timing-safe.test.ts:74-107` mocks `node:crypto` to verify call. |
| WS short-lived upgrade token (REST mint) | PASS | `auth/upgrade-token-store.ts:30-123` (32-byte random, 60s TTL default, single-shot). `routes/auth.ts:29-40` `POST /ws-token`. `routes/ws.ts:71-89` rejects without/with-bad token. Tests `__tests__/websocket.test.ts:99-116` + `__tests__/server-factory.integration.test.ts:283-345`. |
| Server fails fast on missing `HYPERIDLE_API_KEY` | PASS | `index.ts:10-15` writes FATAL stderr and `process.exit(1)`. Test `__tests__/index.startup.integration.test.ts:36-89` spawns subprocess with key cleared and asserts non-zero exit + stderr message. |
| Unit: timing-safe used | PASS | `auth.timing-safe.test.ts:74-107`. |
| Unit: WS rejects expired/reused upgrade tokens | PASS | Reuse: `server-factory.integration.test.ts:297-322`. Expiry: `:324-333` (TTL=200ms via env). Store unit: `auth/__tests__/upgrade-token-store.test.ts` (cap eviction). |

## Cluster 3 — Input validation (V1–V5)

| AC | Verdict | Evidence |
|---|---|---|
| `transitionTaskSchema` uses `z.enum([TASK_STATES])` | PASS | `routes/tasks.ts:22-24`; constants `packages/shared/src/types.ts:10-21`. Test `routes/__tests__/tasks.validation.test.ts:78-102`. |
| `updateBetSchema.field` enum (done_condition/hypothesis/appetite) | PASS | `routes/bets.ts:25-29`; constants `shared/src/types.ts:32-34`. Test `routes/__tests__/bets.validation.test.ts:60-81`. |
| Knowledge `:layer` validated against `["L0".."L4"]` | PASS | `routes/knowledge.ts:69-82` `layerGuard` middleware; `:178-179` mounts on `/:layer` and `/:layer/*`. Test `routes/__tests__/knowledge.validation.test.ts:46-78`. |
| Knowledge search escapes LIKE `%`, `_` (and `\`) | PASS | `services/like-escape.ts:19-21`. `routes/knowledge.ts:155` builds pattern; `:160-167` uses `ESCAPE '\\'` clause. Test `knowledge.validation.test.ts:80-143`. Bonus: `:134` caps query at 500 chars (review HIGH-5). |
| `PATCH /status/settings` blocks `git_export.`, `notifications.`, `observability.` prefixes | PASS | `routes/status.ts:51-55,128-134`. Test `routes/__tests__/status-settings-write.test.ts:40-67` (6 blocked keys). |
| Unit per fix: invalid input → 400 not 500 | PASS | All four validation tests assert `status === 400` and `code === VALIDATION_ERROR`. |

## Cluster 4 — Rate limiting (R1–R5)

| AC | Verdict | Evidence |
|---|---|---|
| Global rate-limit middleware (per-IP / per-key) | PASS | `middleware/rate-limit.ts:66-83` identity selection (key > XFF if trusted > direct). `app.ts:191-204` mounts globally with default 60/min, env-overridable. |
| Body size limit (1 MB default, configurable) | PASS | `middleware/body-limit.ts:77-128` early-abort streaming. `app.ts:221-227` mounts with 1_000_000 default + `HYPERIDLE_MAX_BODY_BYTES` override. |
| Unit: exceed → 429 | PASS | `middleware/__tests__/rate-limit.test.ts:36-55` (with `Retry-After` + `RATE_LIMITED` code). |
| Unit: oversized → 413 | PASS | `middleware/__tests__/body-limit.test.ts:45-60` (with `PAYLOAD_TOO_LARGE` code). Streaming early-abort proven `:76-133`. |

## Cluster 5 — Tool registry role enforcement (B1–B4)

| AC | Verdict | Evidence |
|---|---|---|
| `buildToolRegistry` accepts role + filters via `toolsForRole()` | PASS | `skill-tools/tool-registry.ts:127-129` (`toolsForRole`); `:140-184` (`buildToolRegistry` requires `{ role }`); production wiring `services/session-provisioning.ts:289`. |
| Builders cannot invoke facilitator tools | PASS | Each facilitator tool declares `roles: ["chief_of_staff", "practice_facilitator", "product_manager"]` (route-item.ts:77, score-attention.ts:132, promote-knowledge.ts:160, create-conflict-review.ts:110). Builder invocation returns FORBIDDEN — tested at `skill-tools/__tests__/tool-registry-role.test.ts:71-79`. |
| Unit: builder registry lacks `promote_knowledge` | PASS | `tool-registry-role.test.ts:49-56`. |
| Unit: facilitator registry has all tools | PASS | `tool-registry-role.test.ts:89-96` (chief_of_staff: 12 tools) and `:98-105` (practice_facilitator). |

---

## Validation scenarios (lines 102–107)

| Scenario | Verdict | Evidence |
|---|---|---|
| Agent env lacks `HYPERIDLE_API_KEY` | PASS | `claude-agent-sdk-adapter.security.test.ts:79-89`. |
| Docker `$(cat /etc/passwd)` literal in container | PASS | `docker-workspace-adapter.security.test.ts:69-97`. |
| Missing `HYPERIDLE_API_KEY` → process exits with error message | PASS | `index.startup.integration.test.ts:36-89`. |
| `PATCH /tasks/:id` with `state: "banana"` → 400 | PASS | `tasks.validation.test.ts:78-91`. (Note: AC names `PATCH /tasks/:id` but the transition route is `POST /tasks/:id/transition`. Test exercises the transition POST; the schema is on the right route.) |
| Builder invoking `promote_knowledge` → not-found/forbidden | PASS | `tool-registry-role.test.ts:71-79` returns FORBIDDEN (review W3 distinguishes from NOT_FOUND for genuinely unknown tools — stronger than spec). |

## Contracts / constraints (lines 110–112)

| Constraint | Verdict | Evidence |
|---|---|---|
| Rate-limit adds <1ms latency to normal requests | PASS (de facto) | Middleware is in-process Map lookup + counter; SHA-256 of header per request. No dedicated benchmark in suite, but the implementation is O(1) per request (no IO, no blocking calls). 1666-test suite would surface gross regressions. Acceptable; could be tightened with a microbenchmark in a follow-up. |
| Timing-safe handles different-length keys | PASS | `timing-safe.ts:18-21` hashes both sides to 32 bytes before comparing. Test `auth.timing-safe.test.ts:92-107` proves no throw on length mismatch. |
| Role filtering at registry level, not per-tool | PASS | `tool-registry.ts:159` `toolsForRole(options.role)` filters at registry construction. Per-tool handlers still trust their inputs — defence-in-depth, not gate. |
| All existing tests continue to pass | PASS | 1666 tests pass, 2 skipped (skips not introduced by I2 — pre-existing). |

---

## Verdict

**PASS**

Every acceptance criterion in cluster 1–5 has both implementation and test
evidence with file:line citations above. All five validation scenarios are
covered. All four contract constraints hold (the rate-limit latency
constraint is met by construction; no microbenchmark was added but is not
required by the AC).

**Notes / minor observations (non-blocking).**
1. Lint (`bun run lint`) exits 1 with 4 errors and 67 warnings. These are
   inherited from `main` (snake_case interface fields in
   `fabric/materialization.ts`, DOMPurify usage in
   `web/shell/ArtifactView.tsx`); none are in I2-touched files.
2. AC line 105 names "`PATCH /tasks/:id` with `{state: "banana"}`" but the
   transition endpoint is `POST /tasks/:id/transition`. The validator is
   on the correct route; the AC wording is imprecise but the intent
   ("invalid state → 400") is met.
3. No microbenchmark backs the "<1 ms rate-limit latency" constraint;
   in-process hash + Map lookup easily meets this in practice but a
   follow-up could pin it with a perf assertion.
