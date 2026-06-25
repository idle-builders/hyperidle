# AN2 — Outbound tool brokering (hybrid) · Code Review (Phase 4)

**Verdict: DONE**

Reviewed live diff `git diff origin/main...HEAD` against the approved plan (`plans/AN2/architecture.md`, round-2 APPROVED) and the 5 ACs in `.pipeline/work-packages/TRACK-AN.md`. All 6 lenses + AC completeness. Sanity-break performed on two load-bearing assertions (credential-attach, trust-gate) — both go RED when reverted. No CRITICAL findings. One WARNING (resource-leak edge), two NITs — none blocking.

---

## AC table (AC → proving test → result)

| # | AC | Proving test | Pass |
|---|---|---|---|
| AC1 | Reversible external op runs direct, no human gate | `AN2-broker-live` › "vetted-source read_value … result, no proposed_calls row" — real fixture call over HTTP, `result.success`, 0 captured rows. Companion: community `read_value` → `AWAITING_REVIEW` (forged hint dropped). | ✅ |
| AC2 | Irreversible staged, not performed; executes once on binding approval; AL7 at-most-once + outcome | `AN2-broker-live` › 3 steps: session-1 `write_value` → `AWAITING_REVIEW`, `writeCallCount=0`, captured row; session-2 grant-bearing → executes once (`writeCallCount=1`), `operationOutcomes` row, pc=`executed`, grant `consumed=true`; second invoke → grant consumed → `success=false`, `writeCallCount` stays 1. Rides AL7 router unchanged. | ✅ |
| AC3 | Credential attached at execution, never in agent session | `AN2-broker-live` AC3a: `whoami` records `Authorization: Bearer <ACME_TOKEN>`, cross-referenced to `resolver.resolve()` return (non-vacuous, token>8 chars). AC3b: token absent from name/description/inputSchema JSON. AC3c: cross-user → `resolve→null` → `NO_CREDENTIAL`, fixture not called. Unit `AN2-classify` T5/T6 mirror. | ✅ |
| AC4 | Works for >1 service; ≥1 real; second by config | `AN2-second-service-config` (Beta/stdio) lists+calls real spawned `_fixture-stdio-server.mjs`; `get_token` echoes env-injected `BETA_API_TOKEN`; structural test proves the only delta vs Acme (http) is the `ConnectorSpec`. Same `wrapBrokeredTool`/`connectOutbound`. | ✅ |
| AC5 | Unknown/ambiguous reversibility → gated, never direct | `AN2-broker-live` `mystery` (no annotations, even vetted) → `AWAITING_REVIEW` + captured. Unit `AN2-classify` T2 (no-annotation→irreversible both tiers), T3 (forged `idempotentHint` community→dropped→irreversible). | ✅ |

Static props: `ownerUserId` additive-optional (`npm run check` PASS, 13 pkgs); no migration (no schema diff); `CONNECTOR_TOOL_PREFIX` namespacing asserted in T1. Full run: AN2 unit 27/27, integration 47/47 incl. protected AL7-two-session / AL7-tailored-grant / AN1-connections untouched-green.

---

## Sanity-break (mandatory for live-proof WP)

Confirmed two load-bearing assertions are NOT green-against-a-mock (probe edits reverted, tree clean):

1. **Credential-attach (AC3a).** Replaced `Bearer ${authToken}` → `Bearer PROBE-BROKEN` in `outbound-mcp-client.ts`. AC3a went RED (`hasBearer` false). The fixture genuinely records the real header over the wire and cross-checks against the resolved plaintext — the credential path is exercised end-to-end, not faked.
2. **Trust-gate (gate-bypass guard).** Removed the `trustTier === "vetted" &&` condition in `brokered-tool.ts` so community annotations pass through. The `AN2-broker-live` community companion AND `AN2-classify` T3 (forged-hint) both went RED — a forged `idempotentHint:true` from a community source would reach direct execution, and the tests catch it. The guard is real.

---

## Lens findings

### Credential containment (load-bearing) — PASS
Traced the secret AN1-resolver → handler → outbound call. The token is resolved **inside** `wrapBrokeredTool`'s handler (`resolver.resolve(ownerUserId, connectionId)`), attached only at `connectOutbound` time as an HTTP `Authorization` header (http) or process `env` var (stdio). It is never in: tool args, `inputSchema`, `registry.definitions`, the `ProposedCall.args` row, the returned `OutboundConnection` surface, or `ToolContext`. `connectOutbound` redacts the token from both connect-time and call-time thrown errors via `replaceAll(authToken, "[REDACTED]")`. No `console.log` of the token anywhere. Containment holds by construction (handler runs server-side, never in sandbox).

### trustTier gate-bypass guard — PASS
Community source (default `trustTier="community"`, schema default verified) → annotations DROPPED before `classifyReversibility` → no signal → fail-closed irreversible. Only `vetted` passes `destructiveHint`/`idempotentHint` through. `classifyReversibility` (tool-registry.ts:228, unchanged) fail-closes on no signal. The agent cannot influence `trustTier` (read from the stored Connection row) or annotations (from the external server, server-side). Fail-closed default confirmed. A forged community `idempotentHint` cannot reach the direct path.

### AL7 reuse fidelity — PASS
The brokered tool is a plain `RegisteredTool` in `extraTools`; it rides the existing `invoke` router verbatim (classify → capture → CAS-consume grant → execute → recordOutcome). The `tool-registry.ts` diff is **only** the additive `ownerUserId` field — the router, `classifyReversibility`, `captureProposedCall`, `recordOutcome`, and the CAS-consume are byte-unchanged. CAS-consume (lines 637-648) is a genuine single-statement atomic `UPDATE tailoredGrants SET consumed=true WHERE … consumed=false RETURNING` — no TOCTOU (the `WHERE consumed=false` + `.returning()` is the compare-and-swap; a lost race returns no row → falls through to re-review). At-most-once proven by the second-invoke test. No kernel-executor reintroduced (protected AL7-no-kernel-executor stays green).

### Live-proof genuineness — PASS
`_fixture-mcp-server.ts` is a real `McpServer` over `StreamableHTTPServerTransport` on an ephemeral 127.0.0.1 port; the outbound `Client` really negotiates `initialize`/`tools/list`/`tools/call` over HTTP. The per-session McpServer fix (fresh server+transport per `initialize`, routed by `mcp-session-id`) is correct and did NOT weaken assertions — it solves the SDK's stateful multi-session clash. The AC3a `capturedAuthHeaders.length = 0` pre-clear before invoke does NOT hide anything: it clears headers captured during the *prior* `listTools` enumeration so the post-invoke assertion observes only the `whoami` call's header — the assertion still requires the real `Bearer <ACME_TOKEN>` to be present (proven RED on break). stdio second service spawns a real child process. Not vacuous.

### Architecture — PASS
Layer integrity respected (outbound client mirrors inbound mcp-bridge; broker lives in server process). No new table, no migration, no route. `ProvisionSessionParams` untouched; `ownerUserId` resolved internally via `resolveOwnerUserId` (exact `auth.ts` single-human-user pattern). Diff delivers exactly the 4 planned additions + wiring — nothing more.

### Security (STRIDE) — PASS
SSRF: `spec.url` from operator-defined `resolveConnectorSpec` seam, never agent input. Tool-name spoofing: `conn__<service>__` namespace prevents internal-tool shadowing. Malicious input schema: `jsonSchemaToZod` does no eval/$ref-fetch, degrades to `z.unknown()`/loose object. No new POST route → rate-limit N/A (calls bounded by session budget; irreversible gated by AL7). Per-user isolation: resolver scopes on `id AND userId` (AC3c proves cross-user→null).

### Simplification / Slop — mostly clean
The builder-flagged `connector-resolver.ts` pre-resolve (line 83) is **not** redundant — the resolved token is needed to `connectOutbound` for enumeration `listTools`; the handler's second resolve at execution is correct (honors revocation between provision and call). `session-provisioning.ts` is large but pre-existing; AN2's addition is a tight ~18-line block. `@lore` comments are substantive, not filler. No dead code, no AI tells, no value-free wrappers. `defaultResolveConnectorSpec` returns null for all services today (registry deferred to AN4) — correct AN2 scope, exercised via injected `resolveSpec` in tests.

---

## CRITICAL
None.

## WARNING
- **`connector-resolver.ts:92-99` — connection leak if `listTools()` throws after a successful connect.** `outbound = await connectOutbound(...)` then `await outbound.listTools()` then `await outbound.close()` are in one `try`; the `catch` `continue`s without closing. If `connect` succeeds but `listTools` throws (slow/misbehaving server), the `Client` (and, for stdio, the spawned child process) is never closed — leaked per provisioning of that connection. Low blast radius (enumeration is once per session; failing servers are rare), but it's a real resource-cleanup gap. Fix: wrap in `try { … } finally { await outbound?.close().catch(()=>{}); }` with the catch handling list/connect failures. Not blocking — the leak is bounded and fail-quiet still degrades gracefully.

## NIT
- **`connector-resolver.ts:90` inline `import("@hyperidle/shared").ConnectorToolDescriptor` type annotation** — the type is already importable at module top (`ConnectorSpec` is imported there). Use a top-level `import type { ConnectorToolDescriptor }` for consistency. Cosmetic.
- **`outbound-mcp-client.ts:107 / :151` redaction uses `replaceAll(authToken, …)`** — correct for the token substring, but if the SDK ever base64/url-encodes the header in an error, the raw token wouldn't match and redaction would miss. Today the SDK surfaces the header verbatim so it works; worth a `@lore` note that redaction assumes verbatim-substring error text. Cosmetic.

---

## Re-review readiness
Verdict is DONE; the WARNING and NITs are non-blocking and can ship as-is or be folded in. If the builder addresses the connection-leak WARNING, no re-review of the AC proofs is needed — the change is localized to the enumeration cleanup path and covered by the existing fail-quiet integration behavior.
