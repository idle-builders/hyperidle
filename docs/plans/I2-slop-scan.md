# I2 Slop Scan — AI Code Anti-Pattern Findings

Scope: 50 files changed in `feat/I2-security-hardening` vs `main`.
Read-only — no code modified.

---

## CRITICAL

### C1. Test variable rename breaks unused-var convention and shadows global `Event`
- **File:** `packages/server/src/harness/__tests__/claude-agent-sdk-adapter.test.ts:477`
- **Issue:** Biome auto-format (commit `226c7f6`) renamed `_event` to `Event` inside `for await (const Event of adapter.streamEvents(handle))`. The leading underscore was the explicit "intentionally unused" marker. The new name `Event` shadows the DOM/Bun global `Event` class — exactly the kind of footgun lint rules are meant to catch. This was an unrelated stylistic edit pulled into a security branch.
- **Fix:** Restore `_event`. Investigate why `lint:fix` stripped the underscore — Biome's `noUnusedVariables` should treat `_`-prefixed identifiers as intentional.

---

## WARNINGS

### W1. `try/catch {}` swallow on reader cancellation
- **File:** `packages/server/src/middleware/body-limit.ts:63-67`
- **Issue:** `await reader.cancel()` wrapped in `try { } catch { /* Ignore — already done */ }`. This swallows every error class (network EPIPE, AbortError, type errors). The comment claims "already done" but the catch is unconditional.
- **Fix:** Either drop the `await` (cancel returns a promise we don't need) or narrow the catch to the specific known-safe error and rethrow others. Better: just don't await — `reader.cancel()` is fire-and-forget here.

### W2. Hand-rolled body-limit re-implements `hono/body-limit`
- **File:** `packages/server/src/middleware/body-limit.ts:1-85`
- **Issue:** 85 LOC of streaming buffer + Request reconstruction to work around Hono's `bodyLimit` returning a non-JSON body. The header comment justifies it ("upstream-shape vs project-shape tradeoff") but the simpler fix is to wrap `hono/body-limit` and pass an `onError` that returns `c.json(response, 413)`. The current code re-buffers every request (defeats streaming) and constructs `new Request(raw, { body: buffer, duplex: "half" } as RequestInit)` with a cast — `duplex` is not in the standard `RequestInit` type.
- **Fix:** Either use `bodyLimit({ maxSize, onError: (c) => c.json(...) })` from `hono/body-limit`, or document the actual reason `onError` doesn't fit (the comment claims zValidator shadows BodyLimitError — verify before keeping the workaround).

### W3. "Defense in depth" comment masking duplicate validation in `_crypto-spy.ts`
- **File:** `packages/server/src/middleware/__tests__/_crypto-spy.ts:1-45` and `auth.timing-safe.test.ts:14-32`
- **Issue:** The exact same `vi.mock("node:crypto", ...)` factory is duplicated in both files. The helper file's mock is dead code: `auth.timing-safe.test.ts` re-declares the mock locally because "vi.mock must live in the test file." The helper exports only `actualTimingSafeEqualCalls` — its `vi.mock` block never executes (vitest hoists per-file).
- **Fix:** Delete the `vi.mock` block from `_crypto-spy.ts`. Keep only the shared `actualTimingSafeEqualCalls` array and a doc comment explaining why each test must declare its own `vi.mock`.

### W4. Test asserts on implementation detail, not behavior
- **File:** `packages/server/src/middleware/__tests__/auth.timing-safe.test.ts:42-58`
- **Issue:** `expect(actualTimingSafeEqualCalls.length).toBeGreaterThan(0)` tests that a specific function was called. Behavior is "comparison takes the same time regardless of input"; the call-count proxy will pass even if a future refactor calls `timingSafeEqual` once and then short-circuits on a length check. Better behavioral assertion: 401 status + no exception.
- **Fix:** Keep one mock-call assertion as a smoke test, but add a real timing test (or simply rely on the `node:crypto` API being correct and assert only behavior: 401, no throw, equal-length normalization).

### W5. Stale guidance in lore comment about "PROTECTED_KEY_PREFIX"
- **File:** `packages/server/src/routes/__tests__/status-settings-write.test.ts:62-66`
- **Issue:** Test accepts `body.code === API_ERROR_CODES.VALIDATION_ERROR || body.code === "PROTECTED_KEY_PREFIX"`. The implementation only ever returns `VALIDATION_ERROR`. The "PROTECTED_KEY_PREFIX" branch is a placeholder for an error code that was never added to `API_ERROR_CODES`. Tests should assert the actual contract, not a hypothetical alternative.
- **Fix:** Drop the OR clause. Assert `body.code === API_ERROR_CODES.VALIDATION_ERROR`.

### W6. `_crypto-spy.ts` filename uses leading underscore — non-standard for the codebase
- **File:** `packages/server/src/middleware/__tests__/_crypto-spy.ts`
- **Issue:** No other test file in the repo uses `_` prefix. The naming convention is per `typescript.md`: file names match their primary export. Since the module is effectively unused (see W3), the file should be deleted entirely.

---

## OBSERVATIONS

### O1. Duplicated parseLayer + invalidLayerResponse boilerplate at every handler
- **File:** `packages/server/src/routes/knowledge.ts` — repeated 7 times (lines 142-145, 192-195, 218-221, 254-257, 349-352, 443-446, 522-525, 573-576)
- **Issue:** Every layer route copies:
  ```
  const layer = parseLayer(c.req.param("layer"));
  if (!layer) { const { response, status } = invalidLayerResponse(); return c.json(response, status); }
  ```
  This is exactly the kind of repetition Hono middleware exists to remove. A single `app.use("/:layer/*", layerGuard)` would eliminate all 7 copies and guarantee no future handler forgets the check.
- **Fix:** Replace the 7 inline checks with a route-level middleware that validates `:layer` once and stashes the parsed value on `c.set("layer", ...)`.

### O2. `purgeExpired` is O(n) on every issue() and consume()
- **File:** `packages/server/src/services/upgrade-token-store.ts:47-53`
- **Issue:** `purgeExpired` walks the entire token map on every operation. With a 60s TTL and one-shot semantics the map stays tiny, so this is fine in practice — but the comment "no setInterval" suggests this was a deliberate choice to avoid timers. At higher issuance rates this becomes O(n²). Worth flagging if upgrade tokens become high-volume (auto-reconnect on every WS drop).

### O3. `consume()` deletes the record after a successful claim, making `purgeExpired` redundant for the success path
- **File:** `packages/server/src/services/upgrade-token-store.ts:79-83`
- **Issue:** On success, `record.consumed = true; tokens.delete(token);` — setting `consumed` is dead state because the record is immediately deleted. Either keep `consumed` for the race comment to mean something (don't delete in success), or drop the `consumed` field since `delete` makes a second `get()` return `undefined` ("unknown") anyway.
- **Fix:** Pick one model: TTL-based with a `consumed` flag, OR delete-on-claim. Currently it's both, which makes the contract unclear.

### O4. Excessive lore-comment chatter in production code
- **File:** Multiple — `auth.ts`, `body-limit.ts`, `rate-limit.ts`, `timing-safe.ts`, `upgrade-token-store.ts`, `like-escape.ts`, `tool-registry.ts`
- **Issue:** Every new module has an 8-15 line `@lore` block explaining the I2 story ID, the previous behavior, the test setup, and the workaround. While lore is encouraged by `CLAUDE.md`, several blocks restate the obvious ("on exceed: 429 + Retry-After"). The `@lore I2 S6` comment in `docker-workspace-adapter.ts:50-55` is good. The `@lore I2 V4` in `like-escape.ts:14-19` says the same thing twice.
- **Fix:** Trim lore to the *non-obvious* decisions only. "We hash before timingSafeEqual to avoid the length-leak" is lore. "On exceed return 429" is not.

### O5. Body-limit middleware mounted globally re-buffers every request
- **File:** `packages/server/src/app.ts:60-66`
- **Issue:** `api.use("*", createBodyLimit(...))` runs the streaming buffer for every request, even GETs (which have no body, so the early return kicks in). For POSTs without `Content-Length`, the entire body is read into memory before route dispatch — this loses Hono's streaming contract for any future SSE/upload routes.
- **Fix:** Only mount on routes that accept a body, or check `c.req.method` before reading.

### O6. Logging: `unsafeModeWarningEmitted` global flag
- **File:** `packages/server/src/harness/claude-agent-sdk-adapter.ts:23, 48-53`
- **Issue:** Module-scoped `let unsafeModeWarningEmitted = false;` mutated to dedupe a log message. This is hidden mutable global state. Across multiple adapter instances (or test runs) the dedup persists; tests that check the warning fires must reset this — but no `vi.resetModules()` is in place.
- **Fix:** Move the flag to instance state, or use a logger feature like sampling. If dedup matters less than the warning showing up on every restart, drop the flag.

### O7. Rate-limit identity hashing uses 16 hex chars
- **File:** `packages/server/src/middleware/rate-limit.ts:27`
- **Issue:** `createHash("sha256").update(raw).digest("hex").slice(0, 16)` — 64 bits. Birthday collision around 4 billion identities. With `MAX_BUCKETS = 10_000` this is fine, but the 16-char truncation is arbitrary; a comment should justify it (or just keep the full digest).

---

## VERDICT

**REVISE** — The critical issue (C1) is a stray Biome auto-format that must be reverted before merge. W1-W6 are real but not blockers. Most observations are quality-of-life. The implementation overall is competent; the noise comes from over-eager lore comments, copy-pasted handler guards, and one duplicated mock factory.
