# L3 — Security Review (Step 12, READ ONLY)

**Branch.** `feat/L3-artifact-primitive` (worktree `.worktrees/L3`)
**Diff.** `git diff main..HEAD`
**Reviewer.** Security Researcher (STRIDE + OWASP Top 10 + input validation + auth review)
**Date.** 2026-04-28
**Scope.** `packages/server/src/routes/artifacts.ts`, `packages/db/src/schema.ts`, `packages/db/src/schema.pg.ts`, migrations, supporting middleware (read-only sweep), `packages/web/src/hooks/useArtifacts.ts`, `packages/design-system/src/Artifact*.tsx`.

Three-tier classification per the security charter:
- ALWAYS — automatic enforcement; violations are CRITICAL/HIGH.
- ASK FIRST — needs human decision; surfaced as MEDIUM warnings.
- NEVER — block unconditionally; surfaced as CRITICAL.

---

## Total findings by severity

- CRITICAL: 0
- HIGH: 2
- MEDIUM: 4
- LOW: 4
- INFO: 3

No CRITICAL findings. The two HIGH findings (cross-tenant leakage on portfolio/permalink, missing role check on writers) would be ship-blockers for a multi-tenant deployment but are tolerable in the current single-tenant API-key world. They MUST be tracked as follow-ups before any second tenant is provisioned.

Cross-tenant access status: **HAND-WAVED** — see HIGH-1.
DoS guards status:
- Pagination cap: **enforced** (default 50, hard cap 200, returned as 400 LIMIT_TOO_HIGH).
- Payload size: **partially enforced** — POST and PATCH /preview wrap the per-route 64 KiB `createBodyLimit`, but PATCH /cost does NOT (relies only on the global 1 MiB limit). See MEDIUM-1.
- Query bounds: pagination `+1` over-read is bounded; `axis=portfolio` and `axis=product`/`axis=bet` execute an unbounded `SELECT … FROM tasks` first to materialise the task-id list (see HIGH-2/MEDIUM-2 for impact).

---

## HIGH

### HIGH-1 — Cross-tenant artifact disclosure (no tenant scoping on read)
**Tier.** ALWAYS (multi-tenancy charter: "Cross-tenant data access without explicit sharing" is a NEVER).
**File.** `packages/server/src/routes/artifacts.ts:163-242`; `packages/db/src/schema.ts` (no `tenant_id` column anywhere — `products`, `tasks`, `bets`, `artifacts`).
**Threat.** STRIDE Information Disclosure / OWASP A01 Broken Access Control. Any authenticated principal that holds the master `HYPERIDLE_API_KEY` can:
1. `GET /api/artifacts?axis=portfolio` → enumerate every artifact in the factory regardless of which tenant/product/team owns it.
2. `GET /api/artifacts/:id` → fetch any artifact by id with zero ownership check; the route does a single `eq(artifacts.id, id)` lookup (line 234-239) and returns the row.
3. `GET /api/artifacts?axis=bet&betId=<guess>` → list artifacts for a bet from a foreign product.

The architecture plan §8 promises "fetch route applies the existing tenant-scope filter (joins tasks → bets → products → tenant). 404 (not 403) on cross-tenant lookups" — the implementation does **none** of this. The existing test `cross-tenant-isolation` (artifacts-route.test.ts:296-305) is a tautology: it asserts the response is `200 || 404` and "not 403", which would pass even if every artifact were globally readable.

**Exploit.** Holder of the API key issues `GET /api/artifacts?axis=portfolio` → entire artifact corpus across tenants returned. Holder issues `GET /api/artifacts/<random-uuid>` and either gets a hit (data) or a 404 (existence-check oracle if the system is ever re-keyed per tenant).

**Why HIGH not CRITICAL.** Today the system has a single global API key and effectively one tenant — there is nothing to cross. The moment a second product team, second human user, or per-team API key lands, this becomes CRITICAL.

**Mitigation.**
1. Add a tenant/product scope to the `auth` context (the master key currently carries no principal identity).
2. Join `artifacts → tasks → products` and filter by the caller's allowed product set in BOTH `GET /` and `GET /:id`.
3. Convert "artifact in another tenant" responses to `404 NOT_FOUND` (already the documented contract — just not enforced).
4. Strengthen the `cross-tenant-isolation` test: seed two products, mint two principals, assert principal-A's request for principal-B's artifact id returns 404 and that `axis=portfolio` returns ONLY principal-A's rows.

### HIGH-2 — Missing role/scope check on writer endpoints (POST + PATCH)
**Tier.** ALWAYS ("Authorization checks on every data access").
**File.** `packages/server/src/routes/artifacts.ts:244-381`.
**Threat.** STRIDE Elevation of Privilege / OWASP A01. The architecture plan §5.1 + §8 commit: "POST/PATCH … required + role≥agent. The role hierarchy lives in `packages/server/src/middleware/auth.ts` (read-only verification by reading the existing role checks)." The actual `auth.ts` middleware has **no role concept at all** — it only checks the constant API key. Anyone with the API key (a viewer-role human, a stolen key in a misconfigured dev box, a leaked CI secret) can:
- POST arbitrary artifacts attached to any task id that exists in the DB,
- Mint cost values on any artifact that hasn't yet been settled (financial-attribution tampering),
- Mint preview JSON on any artifact whose preview is null (preview hijack).

There is NO scoping on `producingTaskId` either: the only check (line 255-262) is "does the task exist" — not "does the caller own it" or "is the caller the agent who ran the producing session".

**Exploit.** Any leaked key + a task id (which travel together in URL paths and notification payloads) can write a fake `decision` artifact `{ kind: "decision", claim: "ship the malicious feature", rationale: "..." }` against any task. That artifact then propagates into the human review surface (L11) and into knowledge layers downstream.

**Mitigation.**
1. Add an explicit `requireAgentRole` (or equivalent) middleware on POST + both PATCH handlers, even if it is a stub-that-always-passes today — the contract surface MUST be present so the next reviewer cannot accidentally remove a guard that was never written.
2. Verify the caller can write to `producingTaskId` via the existing task-write check (the L3 plan §8 spoofing row claims this exists in `tasks.ts` — port the same check here).
3. Track the actual role implementation as a follow-up (L3-FU-RBAC).

---

## MEDIUM

### MEDIUM-1 — `PATCH /:id/cost` lacks per-route body limit
**Tier.** ASK FIRST (DoS hardening).
**File.** `packages/server/src/routes/artifacts.ts:329`.
**Threat.** STRIDE DoS. POST and PATCH /preview wrap `createBodyLimit({ maxSize: PREVIEW_BODY_LIMIT })` (64 KiB) — see lines 246, 305. PATCH /cost does NOT. It falls back to the global `HYPERIDLE_MAX_BODY_BYTES` default of 1 MiB (`app.ts:223`). The cost payload is three nullable numbers. A malicious or compromised caller can push 1 MiB JSON at this endpoint, costing 16× the JSON parser's work for a route that should accept ~100 bytes.
**Exploit.** Loop 60 PATCH /cost requests/min × 1 MiB JSON of nested junk → ~1 GiB/min of parser pressure per principal slot. Rate-limited at 60/min so contained but not bounded to the actual payload need.
**Mitigation.** Wrap the PATCH /cost handler in `createBodyLimit({ maxSize: 1024 })` or similar. The schema's three nullable numbers fit in well under 256 bytes.

### MEDIUM-2 — `kind` is `text NOT NULL` with no DB-level constraint or length cap
**Tier.** ASK FIRST (defence in depth).
**File.** `packages/db/src/schema.ts:391-409`, `packages/db/src/schema.pg.ts:378-397`, migrations `0007_dusty_maria_hill.sql` / `0006_soft_epoch.sql`.
**Threat.** STRIDE Tampering + storage exhaustion. The plan §3.1 / §10 Q2 explicitly chose "closed at the wire, lenient at the column" — the API normalises unknown values to `unknown_kind`. Acceptable in principle. But:
- A row inserted via a future code path that bypasses the route (a migration backfill, an admin SQL session, a not-yet-existing service) can write `kind = 'A'.repeat(10_000_000)` and the column will accept it.
- There is no `CHECK (kind IN (…))` and no `varchar(64)` cap.
**Exploit.** Future direct-DB-writer (or a SQL-injection chain through some other route) plants a kind that passes API normalisation but consumes disk and breaks downstream consumers that assume short tokens.
**Mitigation.** Either add a `CHECK kind IN (…ARTIFACT_KINDS)` (note this would tighten the "lenient ingest" promise — discuss) OR add a `varchar(64)` cap on the column. Recommend the length cap; preserves forward-compat.

### MEDIUM-3 — Cost numbers accept negatives, NaN, Infinity, and non-integers
**Tier.** ASK FIRST (input-domain hygiene).
**File.** `packages/server/src/routes/artifacts.ts:107-120` (createArtifactSchema cost; patchCostSchema).
**Threat.** STRIDE Tampering. `z.number().nullable()` accepts `-1`, `1.5`, `Number.MAX_SAFE_INTEGER + 1`, etc. The DB columns are `integer` (SQLite) / `bigint` (PG plan but actually `integer` in the migration — see INFO-1). An attacker can:
- Settle `money_micros: -1_000_000_000` to make a producing session look like it earned money.
- Settle `tokens_input: 1.5` to break downstream sums.
- Settle `tokens_output: Number.MAX_VALUE` to corrupt aggregation queries.
The same applies to preview-schema numbers (`slideCount`, `width`, `height`, `passed`, `failed`).
**Exploit.** POST `{ money_micros: -1_000_000_000_000, tokens_input: -999, tokens_output: -999 }` → the immutability guard fires only AFTER the row is settled, so the bogus values lock in permanently.
**Mitigation.** Tighten the schema:
```
z.number().int().nonnegative().finite().nullable()
```
Apply to: `money_micros`, `tokens_input`, `tokens_output`, `slideCount`, `width`, `height`, `passed`, `failed`. Plus `slideCount` should be ≥ 0 (or ≥ 1, depending on intent).

### MEDIUM-4 — `axis=product`/`bet` issue an unbounded `SELECT` and pass the result through `inArray`
**Tier.** ASK FIRST (DoS / query-bound hygiene).
**File.** `packages/server/src/routes/artifacts.ts:182-199`.
**Threat.** STRIDE DoS. For `axis=bet` and `axis=product` the route first runs `db.select({ id: tasks.id }).from(tasks).where(eq(tasks.betId, …))` with no LIMIT, then passes the full id array into `inArray(artifacts.producingTaskId, taskIds)`. If a product or bet has thousands of tasks, the in-memory id array, the bound-parameter list, and the resulting `IN (…)` clause all balloon. SQLite has a default `SQLITE_MAX_VARIABLE_NUMBER` (typically 999 or 32766 depending on build) — exceeding it raises an error, but more dangerous: PG's `IN (…)` with 100k parameters is accepted but slow and re-plans poorly.
**Exploit.** A product with >1000 tasks turns one cheap-looking GET into a O(N) materialisation + O(N) IN clause + DB plan churn.
**Mitigation.** Rewrite as a single JOIN: `SELECT … FROM artifacts JOIN tasks ON tasks.id = artifacts.producing_task_id WHERE tasks.product_id = $1 ORDER BY artifacts.created_at DESC LIMIT $2` — single round-trip, plan is stable, no parameter explosion. Same for `axis=bet`.

---

## LOW

### LOW-1 — `JSON.parse` of `previewJson` lacks a structural guard and trusts DB content
**Tier.** ALWAYS (output sanitisation before serving).
**File.** `packages/server/src/routes/artifacts.ts:138-143`.
**Threat.** STRIDE Tampering / OWASP A08 Software & Data Integrity. The code states "We control writes (always JSON.stringify of ArtifactPreview); a parse failure here is a real corruption bug — let it propagate." A single corrupt row (manual SQL fix, future migration mistake, future writer that bypasses the route) crashes the whole page response. There is no per-row try/catch and no zod re-validation on read; only a discriminant equality check (`parsed.kind === kind`).
**Exploit.** A row with `previewJson = '{"kind":"code_diff","hunks":[{"header":"x","lines":[{"kind":"add","text":"<script>"}]}]}'` round-trips fine — but a row whose JSON is structurally garbage (`'{"kind":"code_diff"}'` missing required fields) will be accepted because only `kind` is checked. The renderer then reads undefined `hunks`/`file` and crashes downstream.
**Mitigation.** Re-validate on read with `artifactPreviewSchema.safeParse(parsed)`; on failure, return `preview: null` and log the corrupt row id. Treats data-at-rest as untrusted (defence in depth).

### LOW-2 — Rate limiter ignores anonymous callers, but `unauthenticated` requests still hit the route's GET path? — Verified safe but fragile
**Tier.** INFO-leaning-LOW.
**File.** `packages/server/src/app.ts:194-206`, `packages/server/src/middleware/auth.ts`.
**Observation.** `authMiddleware` mounts at `api.use("*", authMiddleware)` AFTER the rate limiter. Good. But the rate-limit identity selection picks `X-API-Key` first (hashed), and a caller that hammers with bogus keys gets per-bogus-key buckets up to the LRU cap of 10 000. An attacker rotating fake `X-API-Key` headers exhausts the bucket map and forces eviction of legitimate buckets.
**Why not HIGH.** This is the global rate-limit design (I2 review HIGH-3/HIGH-4 already addressed eviction policy with LRU). L3 inherits it, doesn't worsen it. Flagging because the artifact route is a new attractive target (its `:id` GET is reachable without revealing whether the id existed pre-auth).
**Mitigation.** None needed in L3 scope. Track if it becomes a real abuse pattern.

### LOW-3 — `producingTaskId` accepted as any non-empty string; no length/format check
**Tier.** ASK FIRST (input hygiene).
**File.** `packages/server/src/routes/artifacts.ts:101`.
**Observation.** `z.string().min(1)` — a 1 GiB string passes Zod, then bounces off the FK lookup. Drizzle parameterises so SQL injection is closed, but the comparison work isn't free.
**Mitigation.** Add `.max(64)` (UUIDs are 36 chars; current ids in tests like `"task_a"` are short). Same for `taskId`, `betId`, `productId` query params (lines 178, 184, 191).

### LOW-4 — Image URL fields on screenshot/design previews are arbitrary strings
**Tier.** ASK FIRST.
**File.** `packages/server/src/routes/artifacts.ts:55-71`; `packages/design-system/src/ArtifactPreviewSurface.tsx` (does NOT render `<img>` for L3 — only width×height text), `packages/web/src/shell/ArtifactView.tsx:155-169` (pre-existing component, NOT in L3 diff, DOES render `<img src={data.before.src}>` unfiltered — but L3's components do not flow through it; flagged for the future wiring).
**Observation.** L3 does not render `imageUrl` from the preview today, so the immediate XSS / SSRF / data-exfil-via-image-beacon risk is contained. The schema accepts any `z.string()` though — `javascript:`, `data:`, internal-network URLs.
**Mitigation.** `z.string().url().refine(u => u.startsWith("https://") || u.startsWith("/static/"))` on `imageUrl`. Document that the renderer must continue to NOT render arbitrary URLs as `<img src>` until a sanitisation policy lands.

---

## INFO

### INFO-1 — PG migration uses `integer` for cost columns, plan promised `bigint`
**File.** `packages/db/drizzle-pg/0006_soft_epoch.sql:7-9`; plan §4.1 table.
The PostgreSQL migration declares `cost_money_micros integer`, `cost_tokens_input integer`, `cost_tokens_output integer`. PG `integer` is 32-bit signed (~2.1 billion cap). 2 billion micros = $2 100. A single Anthropic Opus session can already cost more. Token counts in long-running sessions also exceed 2 G.
This is a correctness bug, not a security bug, but a security-adjacent abuse case: an attacker who can inflate a settled cost (see HIGH-2 + MEDIUM-3) only needs ~$2.1k worth of micros to overflow / wrap. Suggest `bigint`.

### INFO-2 — `producingTaskTitle` is denormalised into the wire shape — minor PII surface
**File.** `packages/server/src/routes/artifacts.ts:133-158`.
Each artifact response carries the producing task's `title`. If task titles ever contain customer-visible PII or secrets (and there is no validation against this today), they will be served wherever artifacts are. Out of scope for L3 since L1/L2 already permit free-text task titles, but flag it: artifacts widen the read surface for that text.

### INFO-3 — `crypto.randomUUID()` is used for artifact ids — good
**File.** `packages/server/src/routes/artifacts.ts:264`.
Confirms the plan §4.1 hard rule "opaque (not derived from content)". UUID v4. Sufficient entropy that id-guessing is not a practical oracle even without the (currently missing) tenant scoping.

---

## OWASP Top 10 sweep

| OWASP | Status |
|---|---|
| A01 Broken Access Control | **HIGH-1, HIGH-2** — no tenant scope on reads, no role check on writes. |
| A02 Cryptographic Failures | n/a — no new cryptographic surface. |
| A03 Injection | OK — Drizzle parameterises; no raw SQL; no string interpolation found in `artifacts.ts`. |
| A04 Insecure Design | MEDIUM-3 (numeric domains), LOW-1 (data-at-rest trust) — defence-in-depth gaps. |
| A05 Security Misconfiguration | MEDIUM-1 (missing per-route body limit on PATCH /cost). |
| A06 Vulnerable & Outdated Components | n/a — no new deps in L3 server diff. |
| A07 Identification & Authentication Failures | HIGH-2 (no role concept at all). |
| A08 Software & Data Integrity Failures | LOW-1 (read-side preview trust). |
| A09 Logging & Monitoring Failures | n/a in L3 diff (auth logger covers reject path; no artifact-write audit log — but the plan §8 calls out event-bus emit as the audit trail; not yet wired in this implementation — see follow-up). |
| A10 SSRF | n/a — server does not fetch any URL on behalf of the request. Image URLs are only stored, not fetched (LOW-4 covers the future render path). |

---

## Verdict

**Ship blockers:** None today (single-tenant, single API key). HIGH-1 and HIGH-2 are tracked-but-not-blocking only because the deployment is still single-tenant; both BECOME ship-blockers the moment a second principal exists. They MUST be fixed before any second-tenant or per-user-key milestone.

**Recommended Step 14 (apply pass) priorities:**
1. MEDIUM-3 (numeric domain tightening) — small change, high defence value.
2. MEDIUM-1 (PATCH /cost body limit) — one-line fix.
3. MEDIUM-4 (single-JOIN rewrite for axis=bet/product) — perf + DoS hygiene.
4. INFO-1 (bigint in PG migration) — correctness; touches already-applied migration so requires a 0007 follow-up.
5. LOW-1 (read-side `safeParse`) — defence in depth for data-at-rest.
6. LOW-3 (`max(64)` on id strings).
7. HIGH-1 / HIGH-2 — schedule as L3-FU-RBAC; do NOT close as resolved without test evidence (a real cross-principal test, not a tautology).
