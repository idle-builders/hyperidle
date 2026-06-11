# AF11 — Phase 4 Code Review

## Round 2 (re-review of fix commit c2aca8c6)

**Verdict: DONE** — all 3 CRITICAL + 2 WARNING closed. No open finding. Re-verified adversarially, not by trusting the builder's summary.

Reviewer: AF11 session (same evaluator, carried context). Fix diff reviewed against the round-1 findings + `origin/main`.

### Adversarial re-verification (what I actually ran)

1. **Live exploits re-run via the new regression suite (`AF11-idor-regression.integration.test.ts`):** 5/5 PASS on fixed code (`c2aca8c6`). Then I reverted ONLY the four source files to pre-fix state (`6f99d965`), kept the tests, re-ran → **5/5 FAIL**. Proof the tests are non-vacuous and exercise the real holes:
   - `GET /api/threads/assistant` + `X-Identity: vic-B` → pre-fix returned `thread.hostId = "vic-B"` (victim's thread). Post-fix returns `atk-A`. **CLOSED.**
   - `GET /api/threads/coach` + `X-Identity: vic-B` → pre-fix returned `hostId = "vic-B"`. Post-fix `atk-A`. **CLOSED.**
   - `POST /api/threads/:id/messages` non-participant + `X-Identity: part-P` → pre-fix **201** (forged write persisted). Post-fix **403**, zero rows persisted. **CLOSED.**
   - `POST /api/users/:id/inbox` + spoofed `X-Identity` → post-fix `senderId = atk-A` (authenticated principal), not the header. **CLOSED.**
   - Restored fixed source; working tree clean.
2. **CRITICAL-2 enforcement is structurally sound, not cosmetic:** `authorizeWrite(c, …)` (`auth/authorize.ts:51`) reads principal from `c.get("userId")` → `canWrite` → `canRead` → participant-scope returns `principal ∈ participants` (`access-boundary.ts:67`). The authz subject can no longer be client-supplied.
3. **`readInitialSenderId` exemption is CORRECT** — it's on `POST /api/threads` (thread *creation*, declared `principal-self`), used only to pick the initial-message *attribution* sender. The created thread's participant set always includes the resolved sender; it is not a data-scoping authz sink over an existing resource. Retaining it is right.
4. **`auth.ts` `set("userId")` audit:** all three sites (`:115` validated bearer session, `:204` shared-mode API-key→human-user row, `:235` local-mode API-key→human-user row) derive the principal from a validated credential or the DB, **never from `X-Identity`**. The worker-token/local-mode fallback the builder exempted is genuine principal resolution, not a header sink. No hidden remaining hole.
5. **CRITICAL-3 satisfied legitimately:** `grep eslint-disable.*authz/` over `packages/server/src` → zero hits. `npm run lint:eslint` exit **0** — the route passes `authz/no-raw-db-in-route-bypassing-policy` via the real `authorizeWrite` call, no re-suppression anywhere.

### Re-verification results
- `npm run check` → PASS (12 packages, 0 type errors).
- `npm run lint` / `lint:eslint` → exit 0 (warnings/infos only, no errors; no new authz suppression).
- Touched-route integration suites (AF11-authz, coach, AD8b-assistant, threads.identity, threads.mention, threads.routes, users) → **123/123 pass**.
- Full integration suite → **2646 pass / 5 skipped / 0 fail** (ERROR/WARN lines are negative-path assertions: git-export "boom", observability "first call fails").

### Refreshed AC table (round 2)

| AC | Status | Evidence |
|---|---|---|
| AC1 — Thread-detail read-parity IDOR | **PASS** | Unchanged. `authorizeRead` host/participant scoping; WS `canSubscribe`. |
| AC2 — Assistant/coach guard from Principal, not header | **PASS** | `assistant.ts:179` + `coach.ts:157` now `userId = c.get("userId")`; `readSenderId` helper removed from both. Live spoof re-run: returns attacker's own thread, not victim's (regression tests CRITICAL-1 + sibling, both fail against pre-fix). |
| AC3 — Worker token confinement | **PASS** | Unchanged. Worker token → 401 on `/api/credentials` (+PUT); structural — `registerWorkerWsRoute` takes no credential resolver. |
| AC4 — No plaintext secret at rest | **PASS** | Unchanged. Encrypt-at-write, decrypt-at-use, idempotent migration. |
| AC5 — Ownership/scope, not "any valid key" | **PASS** | `threads.ts` POST `/:id/messages` now `senderId = c.get("userId")`, authz via `authorizeWrite` (participant-scope). Non-participant + spoofed header → 403, zero persisted (regression test fails against pre-fix as 201). Inbox POST derives senderId from principal. |
| AC6 — Default-deny chokepoint, undeclared fails closed | **PASS** | `principal-self` routes now compare to `c.get("userId")` — the round-1 caveat (declaration satisfied while boundary violated) is resolved. |
| AC7 — Three ESLint rules fail the build | **PASS** | Plugin tests 23/23. `eslint-disable authz/*` removed; route passes the rule legitimately via `authorizeWrite`. `lint:eslint` exit 0. No re-suppression. |

**All 7 ACs PASS. No CRITICAL or WARNING open.**

---

## Round 1 (original review — record retained below)

**Verdict: NOT DONE** — 3 CRITICAL (one is the live-exploited AC2 vuln class, reproduced live during this review), 2 WARNING.

Reviewer: AF11 session (carried design/arch context; approved architecture 9/10). Diff reviewed against `origin/main`. `npm run verify` passes — but green because the holes are uncovered by tests and the one lint rule that fires on the worst hole was suppressed with `eslint-disable`.

---

## AC table

| AC | Status | Evidence |
|---|---|---|
| AC1 — Thread-detail read-parity IDOR | **PASS** | `threads.ts:522` `GET /:id` loads row, parses participants, calls `authorizeRead` (host-scope→true, participant-scope→`principal ∈ participants`). WS `session:` topic (`ws-broadcaster.ts:237`) routes through `canSubscribe`, denies non-existent/unresolvable sessions. Integration AC1 tests assert real non-membership 403, participant 200, host-scope 200, 404. |
| AC2 — Assistant guard from Principal, not header | **FAIL (CRITICAL)** | Soul-prompt GET/PATCH (`assistant.ts:261/319`) correctly use `c.get("userId")`. BUT `GET /api/threads/assistant` (`assistant.ts:182`) still uses `readSenderId(c)` → `X-Identity` header. **Reproduced live**: attacker authed as A, `X-Identity: vic-B` → route returns `thr-ast-vic-B` (victim B's assistant thread + messages). Same spoof class the audit exploited. `coach.ts:168` has the identical hole. |
| AC3 — Worker token confinement | **PASS** | `worker-ws.ts`: token gates `/ws/worker` only; integration tests assert worker token → 401 on `/api/credentials` + PUT. Duplicate-live-id `register` rejected (`id_in_use`), dead-incumbent reconnect accepted (liveness probe via `LIVE_WORKER_SOCKETS`). `registerWorkerWsRoute(app, pool, upgradeWebSocket)` takes no credential resolver — structural guarantee holds. AC3c tests cover both. |
| AC4 — No plaintext secret at rest | **PASS** | `server-config.ts`: `apiKey` encrypted at write (`encryptCredentialValue`), `resolveTierApiKey` decrypts at use only, `migrateServerConfigEncryption` idempotent (GCM auth-tag → `decrypt` null ⟺ not-ciphertext). AC4 tests assert ciphertext-not-in-blob, round-trip, twice-idempotent. |
| AC5 — Ownership/scope, not "any valid key" | **FAIL (CRITICAL)** | `POST /api/threads/:id/messages` (`threads.ts:752/770`) authorizes a **client-supplied** `senderId` (from `X-Identity`) against `participants`. **Reproduced live**: attacker A (not a participant) `X-Identity: partP` → 201, message persisted `senderId: partP` — forged write into an inaccessible thread. Inbox POST (`users.ts:371`) also derives sender from header. |
| AC6 — Default-deny chokepoint, undeclared fails closed | **PASS (with caveat)** | `requireBoundary` + `failClosedAssertion` (app.ts:347, throws dev/test). 127 declarations across 30 route files; flip executed. Caveat: declaring `principal-self` does NOT enforce self — `assistant.ts:181` and `coach.ts:167` declare `principal-self` but never compare to `c.get("userId")` (see CRITICAL-1). The declaration is satisfied while the boundary is violated. |
| AC7 — Three ESLint rules fail the build | **PASS (rules) / COMPROMISED (application)** | Plugin tests green (23/23), genuine RuleTester fixtures (not stubs). `no-raw-db-in-route-bypassing-policy` invalid fixture is exactly the message-POST shape. The rule **did fire** on `threads.ts` message-POST — and was silenced with `// eslint-disable-next-line authz/no-raw-db-in-route-bypassing-policy` (threads.ts:733) whose justification ("custom participant guard is the authz") is false: the guard checks a client-supplied id. |

---

## CRITICAL

### CRITICAL-1 — `GET /api/threads/assistant` IDOR via `X-Identity` (AC2 — live-exploited vuln class, NOT closed)
`packages/server/src/routes/assistant.ts:182` — `const userId = readSenderId(c);` where `readSenderId` (`:43-48`) returns `c.req.header("X-Identity") ?? c.get("userId")` — header takes precedence. The route then queries `threads WHERE hostKind="user" AND hostId=userId` and returns the full thread, all messages, and identities. Declared `requireBoundary({ kind: "principal-self" })` at `:181` but never compares `userId` to `c.get("userId")`.

**Proven live during this review:** attacker authenticated via API key (resolved principal = `atk-A`), request with header `X-Identity: vic-B` → response `thread.id = "thr-ast-vic-B"` (victim B's assistant thread). This is the identical spoof class the audit exploited to write `PWNED_BY_SPOOF` — the plan (Hole 2, architecture.md:146) explicitly mandated "switch its identity to `c.get('userId')`." The builder fixed the soul-prompt GET/PATCH but left the thread-resolve route on the header. AC2 is not met.

**`coach.ts:168` is the same hole** (`GET /api/threads/coach`, declared `principal-self`, `userId = readSenderId(c)`, mounted at `threads.ts:424`). Both must derive `userId = c.get("userId")` (drop `readSenderId` from these authz/scoping paths entirely).

### CRITICAL-2 — `POST /api/threads/:id/messages` authorizes a client-supplied sender (AC5 — write-path bypass)
`packages/server/src/routes/threads.ts:752` — `const senderId = readSenderId(c);` (header-preferred), then `:770` `if (!participants.includes(senderId)) → 403`. The authorization subject is **client input**, not the authenticated principal.

**Proven live during this review:** attacker A (resolved principal, NOT in thread `thr-private`'s participants) posts with `X-Identity: partP` → **201**, message persisted with `senderId: "partP"`. Result: forged message written into a thread A cannot access, attributed to another user (Tampering + Spoofing + Elevation of Privilege).

The fix is to derive the authz subject from `c.get("userId")` and require `c.get("userId") ∈ participants` (route through `authorizeWrite` with the loaded resource). `X-Identity` may at most pick an *attribution* sender that is itself a subset of `{principal}`, never the authz subject (concept P3, plan Q4).

### CRITICAL-3 — `eslint-disable` masks the static gate that catches CRITICAL-2
`packages/server/src/routes/threads.ts:733` — `// eslint-disable-next-line authz/no-raw-db-in-route-bypassing-policy -- custom participant guard … is the authz; authorizeRead not used because it's a message write`. The disabled rule is the **exact** static gate AC7 built to catch "raw DB in an enforced route bypassing the policy function" — and its RuleTester invalid fixture (`no-raw-db-in-route-bypassing-policy.test.ts:81`) is this route's shape (`enforced` + `db.insert` + no `authorize*`). The suppression's justification is materially false (the "custom participant guard" validates a client-supplied id). Removing the disable and routing through `authorizeWrite` fixes CRITICAL-2 and restores the gate. This is the WP's own regression gate being bypassed for the one route that most needed it.

---

## WARNING

### WARNING-1 — `POST /api/users/:id/inbox` derives senderId from `X-Identity`; comment contradicts code
`packages/server/src/routes/users.ts:369-371` — the comment says "derive senderId from the authenticated identity, never from the request body" but the code is `const senderId = c.req.header("X-Identity");`. A request header IS client-controlled input. An attacker authed as A can set `X-Identity: B` to send a DM attributed to B (`findOrCreateDirectThread(db, senderId, recipientId)`). My probe returned 400 on a body-shape mismatch (inconclusive on full exploitability), but the identity-from-header pattern is the same class as CRITICAL-1/2 and the comment is an Auditor-persona red flag (claim ≠ diff). Derive `senderId = c.get("userId")`.

### WARNING-2 — AC2 test coverage does not exercise the holes
`AF11-authz.integration.test.ts` AC2 block tests only the soul-prompt GET/PATCH (`/api/users/:userId/assistant`) — which are the routes that WERE fixed. There is no test for `GET /api/threads/assistant`, `GET /api/threads/coach`, `POST /:id/messages`, or inbox POST. The suite is green because it doesn't touch the open holes — "tests prove code behavior, not that the right thing was built." Add cross-principal IDOR tests for each header-derived-identity route (the two probes I ran during this review pass against the open holes and should be added inverted: assert 403 / own-thread, not the victim's).

---

## OBSERVATION (not blocking)

- **artifacts.ts `enforced` → `public-data` reclassification (check 2): CORRECT.** Plan rows 13-15 labeled artifacts `D`. Builder moved them to `public-data`. Artifacts are host-scoped on their producing `task`; `HOST_SCOPE.task = "host"` → `canRead` returns `true` for any authenticated principal regardless. Artifacts carry no participant list, so `enforced` and `public-data` are observably identical here — no participant-scoped visibility leaks. Not a default-deny hole. The label change is benign and arguably more honest (these routes never call `authorize*`).
- **Fail-closed assertion prod gap (check 4): as-designed (R1).** `failClosedAssertion()` throws in dev/test, logs in prod. The closed gate for new route files is the lint rule with a closed glob (`routes/**/*.ts`) + positive exempt enumeration — verified. The static gate genuinely fires on undeclared/raw-db routes (proven by the 23 passing RuleTester fixtures and by the fact CRITICAL-3 had to suppress it). The R1 posture holds — except where a developer *suppresses* the lint, which is exactly CRITICAL-3.
- **41-route retrofit (check 5): complete.** 127 `requireBoundary` calls across 30 route files; `npm run lint:eslint` exit 0; plugin tests 23/23 with real fixtures. The static gate is real, not stubbed.

---

## Re-review checklist (what must change to reach DONE)
1. `assistant.ts:182` + `coach.ts:168` — `userId = c.get("userId")`; drop `readSenderId` from these scoping paths. (CRITICAL-1)
2. `threads.ts:752/770` — authorize `c.get("userId") ∈ participants` via `authorizeWrite`; X-Identity may only attribute within the principal. (CRITICAL-2)
3. `threads.ts:733` — remove the `eslint-disable`; the route must pass the rule legitimately. (CRITICAL-3)
4. `users.ts:371` — `senderId = c.get("userId")`. (WARNING-1)
5. Add cross-principal IDOR integration tests for all four routes asserting 403 / own-resource (not the victim's). (WARNING-2)
6. Re-run `npm run verify` — it must stay green with NO new `eslint-disable authz/*`.
