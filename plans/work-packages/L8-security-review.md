# L8 — Security Review

**Worktree:** `/workspace/.worktrees/L8` · **Branch:** `feat/L8-conversations-submenu-threads`
**Reviewer:** security-researcher (read-only)
**Method:** STRIDE on the new surface — `GET /api/threads` aggregation, `useConversationsThreads`, submenu render. L7 retro guard ("wired but not instantiated" auth checks).

---

## Surface inventory

| Component | File | New / changed in L8 |
|---|---|---|
| List endpoint aggregation | `packages/server/src/routes/threads.ts:211-240` | NEW — batched messages query, `hasUnresolvedReview` per row |
| Hook | `packages/web/src/hooks/useConversationsThreads.ts` | NEW |
| Submenu render | `packages/web/src/components/ThreadSections.tsx` | rewritten classifier + render |
| Shell wiring | `packages/web/src/layouts/AppShell.tsx:378, 393-396, 472-483` | NEW (live data + lifted state) |
| Row props | `packages/design-system/src/ThreadRow.tsx:25-36, 53-117` | NEW (`selected`, `pinned`, `hostTag`) |

Auth pre-condition (verified): `authMiddleware` mounted at `packages/server/src/app.ts:245` covers `/api/*`. `createThreadRoutes` is registered at `:269`. So all `GET /api/threads` traffic passes the API-key check. **No "wired but not instantiated" auth gap on the L8 surface.**

---

## STRIDE results

### Spoofing
- The list endpoint accepts `participant_id` as a **client-supplied query parameter** with no cross-check against the API-key bearer or `X-Identity` header. This is the L1a inheritance the plan §8 acknowledged. L8 does NOT widen this gap, but it does begin **routine client-driven** use of the parameter (the Submenu fires `participant_id=u-founder` on every mount), so the gap is now exercised on the hot path. See HIGH-1 below.

### Tampering
- The new `hasUnresolvedReview` flag is server-computed from a single batched query — no client trust. ✓
- The thread row is parsed through `rowToThread`'s Zod participants schema; malformed JSON cannot poison the aggregation. ✓

### Repudiation
- Read-only endpoint. No new audit-trail surface.

### Information Disclosure
- `hasUnresolvedReview` is a **derived signal** that implicitly leaks message-state across an authz boundary if the caller is not actually entitled to the thread (see HIGH-1). Anyone with a valid API key can today probe `/api/threads?participant_id=<other-id>` and learn whether the target has unresolved reviews even without reading message bodies.
- Title/snippet on the wire: minimised (plan Option B). Submenu title is `"${capitalize(hostKind)} thread ${id.slice(0,8)}"` — host-kind enum + opaque id prefix. **Zero agent-authored content reaches the row's text node in L8.** Future title enrichment will reopen the XSS surface; flag for the follow-up story.

### Denial of Service
- `inArray(messages.threadId, threadIds)` over up to 50 ids. Bounded ✓.
- The filter `inArray(messages.type, ["review", "questionnaire"])` + `IS NULL` is unindexed. Acceptable at current scale; flagged MED-2.
- The hook's `tick`-driven refetch can be invoked repeatedly via `retry()`. Each call aborts the prior request, so amplification is bounded by render. No client rate-limit, but the route's existing rate limiter applies.

### Elevation of Privilege
- See HIGH-1.

---

## Findings

### HIGH-1 — IDOR via `participant_id` on `GET /api/threads`
**File:** `packages/server/src/routes/threads.ts:182-209` (no L8 change here, but L8 is the **first hot-path consumer** that sends the parameter from a UI surface).
**Tier:** ALWAYS — *Authorization on every data access*.
**Issue:** The list handler trusts the client-supplied `participant_id` as the authorization scope. Any holder of `HYPERIDLE_API_KEY` can list another user's threads by changing the query string. With the L8 hook, every browser session now sends `participant_id=u-founder` from the client — the moment a second user exists, swapping the value enumerates them.
**STRIDE:** Spoofing + Information Disclosure + Elevation of Privilege.
**Exploit:**
```
curl -H 'X-API-Key: $KEY' '/api/threads?participant_id=u-someone-else'
# Returns the other identity's threads, including hasUnresolvedReview signal.
```
**Impact:** High — multi-tenant boundary not enforced at the data layer. Plan §8 explicitly defers this to "L-track auth-middleware story". L8 inherits the exposure.
**Likelihood:** High once a second identity exists; the Submenu currently hardcodes `u-founder`, so single-tenant demo is unaffected.
**Fix (developer):** Cross-check `participant_id` against the authenticated identity in the route handler. Until the auth-middleware lands, derive the participant id server-side from the API-key bearer (or `X-Identity` if you accept that as advisory). Reject any mismatch with 403. Add a regression test: `participant_id=<other>` returns 403, not 200 with that user's rows.

### HIGH-2 — `hasUnresolvedReview` IDOR-amplifies the same exposure
**File:** `packages/server/src/routes/threads.ts:211-240`.
**Tier:** ALWAYS.
**Issue:** Even if HIGH-1 were partially mitigated by hostKind/hostId scoping, the new `hasUnresolvedReview` flag now exposes message-state metadata over the list endpoint. An attacker who can list a thread (e.g. via `host_kind`/`host_id` enumeration) learns whether unresolved reviews exist without needing read access to the messages themselves. Today, that signal is otherwise gated by `GET /api/threads/:id` (which currently has no per-thread authz check either — see MED-1).
**Impact:** High when combined with HIGH-1; even alone, lowers the cost of probing thread state across product/host boundaries. STRIDE: Information Disclosure.
**Fix:** Same authz check as HIGH-1; additionally consider scoping the messages-aggregation query to threads the caller is a participant of (defence in depth, so a future authz bug in the row scope can't leak the metadata).

### MED-1 — `GET /api/threads/:id` has no participant authz check
**File:** `packages/server/src/routes/threads.ts:243-268`.
**Tier:** ALWAYS.
**Issue:** Inherited from L1a; surfaced because L8's row-click navigates the user into `ConversationsReview` which fetches the detail. The detail endpoint reads any thread by id with no participant verification. The list endpoint at minimum filters on `participant_id` (modulo HIGH-1). The detail endpoint has zero check.
**Impact:** Medium — id is a UUID so direct enumeration is hard, but ids leak through the list endpoint, link sharing, observability, and L8's submenu render.
**Fix:** Reject when the caller's identity is not in `participants`. Add the same regression test the auth-middleware story will eventually own. L8 doesn't introduce this, but **it becomes the primary consumer**, so flagging here is fair game.

### MED-2 — Aggregation query has no index coverage
**File:** `packages/server/src/routes/threads.ts:217-227`.
**Tier:** ASK FIRST.
**Issue:** The new `messages` scan filters on `(threadId IN (...), type IN (...), resolvedAt IS NULL)`. None of those columns are individually indexed for this query shape. With 50 threads × N messages each, this is a full-table scan over messages within the matched threads. At demo scale, fine. At production scale, this is a per-page-load scan of the messages table on the hot path. Plan §8 acknowledged this.
**Impact:** Medium — DoS amplification surface as the messages table grows. Cost amplification: every Submenu mount triggers it.
**Fix:** Add a composite index on `(thread_id, type, resolved_at)` in a follow-up migration. Or denormalise `headMessageId` / `unresolvedReviewCount` onto the thread row.

### LOW-1 — Title-stub trust boundary is structural, not enforced
**File:** `packages/web/src/hooks/useConversationsThreads.ts:80-99`.
**Tier:** Informational.
**Issue:** L8 chose Option B precisely to avoid putting agent-authored title/snippet text in the Submenu (zero XSS surface). The protection is structural — the wire shape doesn't carry a title. **There is no test that asserts the title field, if it were ever added back to the response, would be sanitised before render.** A follow-up story extending the wire shape could silently reopen the XSS surface without breaking any L8 test.
**Fix:** Add a regression test: feed the hook a malicious payload (`<script>` in `hostKind`, control chars in `id`) and assert the rendered DOM contains the literal text, not a script execution. Today the `HOST_KIND_SET` filter rejects unknown `hostKind` values (`useConversationsThreads.ts:50-61`) — good — but the `id` field is interpolated into the title via `id.slice(0,8)` with no character class check. React text-node escaping handles HTML; but a malformed id with unicode-control characters could still display oddly. Cheap test to lock in.

### LOW-2 — Filter chip not wired (count-truth divergence risk)
**File:** `packages/web/src/layouts/AppShell.tsx:388-389, 461`.
**Tier:** ASK FIRST.
**Issue:** Plan §2.2 says L8 wires `submenuFilter` into the threads list. The shipped code reads `submenuFilter` from state but never passes it to `ThreadSections`; the title-bar count is `conversationsThreads.threads.length` (full unfiltered list), and the section counts derive from the full list too. If the filter chip ever appears active to the user, the count badge "lies" relative to what's filtered. The protected test in `AppShell.threads.test.tsx` §7.1 asserts counts equal rendered rows — that holds for "all" but is silent about other filter values.
**STRIDE:** N/A directly; this is correctness/spec divergence. Flagging because count-poisoning was the stated hard rule in §8.
**Fix:** Either wire the filter through (close part of L10's work as plan §2 already permits) or hide the filter chip until L10 owns it. Add a test that the count badge equals the *visible* row count for every filter value.

### LOW-3 — Avatar URL is a fixed `data:` SVG (informational)
**File:** `packages/web/src/hooks/useConversationsThreads.ts:36-37, 92`.
**Tier:** Informational.
**Issue:** Hardcoded `FALLBACK_AVATAR` is a `data:image/svg+xml` URI. This is safe — it's a constant, not user-controlled — but worth a quick note: when the follow-up story replaces this with a real `avatarUrl` from the server, the source must be validated (no `javascript:` schemes, no SSRF via `<img>` tag triggering internal fetches). Browsers don't execute scripts in `<img src>` for `javascript:`, but a malicious external URL could still beacon the user's IP or attempt SSRF if proxied.
**Fix (preventive):** Lock down avatar URLs to a known origin or `data:image/*` allowlist when the field becomes server-supplied.

### INFO — L7 retro guard
The plan §1.7 flagged that no `docs/retros/L7*` exists. I confirmed: no L7 retro file. The "wired but not instantiated auth checks" guard, applied to the L8 surface, returns clean — `authMiddleware` is mounted on `/api/*` and `createThreadRoutes` sits behind it. No new route bypasses the middleware. The two outstanding issues (HIGH-1 / HIGH-2) are *participant-level* authz, not API-key auth — they are correctly classified as L1a inheritance, not an L8 wiring defect.

---

## Three-tier classification summary

| Tier | Findings |
|---|---|
| **ALWAYS (CRITICAL)** | HIGH-1, HIGH-2, MED-1 (all are missing authz on data access). |
| **ASK FIRST (WARN)** | MED-2 (index/DoS budget), LOW-2 (count truthfulness vs. filter wiring). |
| **NEVER (BLOCK)** | None encountered. |

The L8 plan correctly identified HIGH-1 in §8 and §12.5 and explicitly deferred it. From a security-research standpoint that is **acceptable for L8 to ship single-tenant demo**, but the deferral should be tracked as a release-blocker for any deployment that hosts more than one identity. HIGH-2 is the L8-introduced amplifier of the same gap.

---

## Recommendations to the developer

1. **HIGH-1 / HIGH-2 / MED-1** — file a single auth-middleware follow-up story owning all three; do not ship to a multi-identity environment until closed. Add the regression tests now (red), implement when the auth story lands.
2. **MED-2** — open a database-index migration ticket; add a perf budget assertion to `threads.routes.test.ts` (e.g. `expect(driver.queryCount).toBe(2)` to lock in single-batch behaviour).
3. **LOW-1** — add the malicious-payload XSS regression test in `useConversationsThreads.test.tsx` even though the wire shape currently can't carry it. Cheap insurance against future field additions.
4. **LOW-2** — decide: wire the filter through now, or hide the chips. Either is fine; the silent middle ground is what trips users.
5. **LOW-3** — when avatarUrl becomes server-supplied, validate origin/scheme.

End of review.
