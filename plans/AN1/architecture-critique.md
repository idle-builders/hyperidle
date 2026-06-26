# Architecture Critique: AN1 — Connect a service once

ARCHITECTURE-SCORE: 8/10  rounds=1  score-line: SA:9 LI:8 AC:8 DM:9 N:9 MD:8 FMC:7 S:8 V:8

Reviewer: cold evaluation of `plans/AN1/architecture.md` against `concept.md`, `design/approved.md`, and `.pipeline/work-packages/TRACK-AN.md` (AN1). Reconciliation claims spot-checked against `origin/main` codebase reality.

---

## Verdict: APPROVED (overall 8/10, no CRITICAL)

The plan conforms to the locked concept and ETHOS on every load-bearing axis. Findings below are WARNING/SUGGESTION — apply before `/write-tests` but none block.

---

## Concept / ETHOS conformance (load-bearing — all PASS)

- **No trust tier** — `§1` types export only the two closed sets; explicit "No `TRUST_TIERS`, no `trustTier`." `§2` schema strips `trustTier` from the #353 recovery. `§4` routes "remove `trustTier` from inserts/views." Verified `schema.ts` on main has no `trust_tier` (clean slate).
- **No OAuth dance / no per-service OAuth app** — AC6 verification greps for absence of authorization-code exchange / client registration / consent-screen / redirect-URI handling. mcp POST stores only a `serverUrl` (+ optional bearer); no 3-legged flow. Verified no OAuth primitive leaks from existing code into the Connection path.
- **No broker/gate** — `§4` removes "any AF11/broker comment framing"; held tools run direct (AN2 seam, not AN1). No reversible/irreversible classifier anywhere.
- **Secret handling correct in BOTH directions** — `§3` resolver is the ONLY plaintext path, wired to sandbox injection (AN2), explicitly NOT to a route response or logger (returns plaintext for owner — not withheld from the agent, per ETHOS §2 / concept hard-rule 2). `§4` `rowToView` never includes `encryptedToken`; AC4 asserts GET/POST responses contain no plaintext. Both leak-directions covered.
- **Held vs inherited split** — `§Phase-0 #1` "Inherited is never a DB row," projected live; schema comment "inherited NEVER stored"; `§6` token-safety invariant (no `env`/`command`/keychain copied); descriptor type `§5` has no secret field by construction. Concept hard-rule 4 enforced by the type, not just convention.
- **Closed sets w/ concept-doc gate** — `§1` both sets `as const` with "CLOSED set (concept Phase 4)" comments; spec note that a fourth requires a concept-doc update.
- **Per-user isolation** — `§2` `uniqueIndex(userId, service, authSource)`; `§3` resolver scoped `and(eq(id), eq(userId))` → cross-user `null`; `§4` DELETE cross-user → `404` (never leaks existence). AC5 integration verifies two-user isolation. Verified `userId` is set on context by auth middleware.
- **Closed infra catalog stays closed** — `§2` separate `service_connections` table; AC8 asserts `CREDENTIAL_NAMES` unchanged, no Connection write into `serverCredentials`. Reuses encryption primitive only.
- **Resolver reuses crypto** — `§3` "reuses `decryptCredentialValue` (no forked crypto)"; protectedTests freezes `credential-encryption`. Verified exports exist.
- **LIVE inherited group, not placeholder** — `§6` populates `inheritedTools` from real probes (`claude mcp list`, `codex mcp list`/config.toml, `gh auth status --json`); `§7` projects them into GET. This delivers the founder's pull-forward, not an empty seam. Verified `listCapabilityDescriptors()` cache accessor exists for the GET wiring.

---

## CRITICAL
- None.

## WARNING

- **[§4 route boundary kind]** Plan specifies `requireBoundary({kind:"enforced"})` + `authorizeRead/authorizeWrite`. The mirrored `credentials.ts` route uses `requireBoundary({kind:"public-data"})` and NO per-resource `authorize*` — it relies on `userId` context scoping in the query. Connection has a stronger per-user contract than infra credentials (which are team-global). `"enforced"` is the right call here (it sets the AF11 boundary-pending flag), but the plan must confirm: (a) `authorizeRead/authorizeWrite` accept the self-access shape `{hostKind:"user", hostId:userId, participants:[userId]}` the plan asserts — `authorize.ts` exports them but the plan never verifies the `AuthorizableResource` shape supports a bare user host; (b) every one of the four routes (GET/POST/DELETE/validate) carries the guard, not just POST. Add an explicit route × middleware matrix to `§4` (route-checklist; CC re: L7) so the builder can't drop the guard on GET.

- **[§6 / FMC — probe failure & timeout]** Discovery probes spawn child processes (`claude mcp list`, `gh auth status`). The plan says "on non-zero exit or empty → `[]`" but specifies no **timeout** on the spawn. A hung `claude mcp list` (network MCP server probe) would stall descriptor construction and, transitively, GET `/api/connections`. Specify a per-probe timeout (the AM2 discovery harness likely already has one — `§6` must name it and the fallback-to-`[]` on timeout). External-call timeout is a Dimension-7 requirement.

- **[§7 / GET wiring perf]** `§Risks` flags it but `§7` leaves it soft: GET must read **cached** descriptors via `listCapabilityDescriptors()`, never re-probe per request. Verified the accessor is sync + DB-free. Promote this from a risk note to a hard task constraint in `§7` with the exact accessor name, and add a verification (the integration test asserts GET issues no child-process spawn). Otherwise a builder may wire `harness-discovery` (which spawns) directly into the request path.

- **[§4 validate SSRF — partial-by-design]** `§4`/`§Security` correctly flag that AN1 only stores/validates `https://` and defers the private-IP/DNS-rebinding block to AN2's outbound client. This is honest, but the `validate` endpoint **does** make an outbound `HEAD/initialize` to a user-supplied `serverUrl` in AN1 — that is a live SSRF surface NOW, not in AN2. Either: (a) drop the live reachability probe from AN1 `validate` (token-presence/decrypt-OK only; mcp → `unknown`/`needs-attention` without a network call), or (b) add a minimal private-IP/loopback/link-local block to the AN1 validate probe. Shipping an unguarded outbound fetch to an arbitrary user URL is a real finding even with `https://`-only (https://169.254.169.254 resolves). Resolve before build.

## SUGGESTION

- **[§5 shared dependency direction]** `§Risks` notes `connection.ts` must stay dependency-free so `@hyperidle/shared` stays leaf, and the descriptor imports `ConnectionHealth` from `../connection.js`. Good. Confirm `harness-capability-descriptor.ts` importing from `connection.ts` does not create a within-package cycle (both in `@hyperidle/shared`) — add a one-line note that `connection.ts` imports nothing from `harness/`.

- **[§4 mcp `service` derivation]** "derive `service` from `serverUrl` host when omitted" — specify the derivation (e.g. hostname, strip leading `mcp.`) so two builders don't pick different rules; it affects the unique constraint `(userId, service, authSource)` and dedup.

- **[§7 dedup rule]** "Dedupe by `(service)` across harnesses, first wins" — `first` is order-dependent on descriptor enumeration order, which `listCapabilityDescriptors` dedupes "by type, first descriptor." Name the ordering so the dedup is deterministic (otherwise a two-harness GitHub inherited tool flickers between harness attributions across requests).

- **[§Verifiability]** `protectedTests` is populated (credential-encryption + credentials integration) — good (CC-008). Consider adding the `harnesses` integration test (`AM4-harnesses.integration.test.ts`) to protectedTests, since `§5/§6` extend the descriptor and `inheritedTools: []` defaults must not break existing descriptor-shape assertions.

---

## What's Working Well

- **Reconciliation section is honest and accurate.** Every "reality on main" claim spot-checked true: `credential-encryption.ts` exports, `requireBoundary`/`createRateLimiter`/`authorize*` middleware, `listCapabilityDescriptors()` cache accessor, clean schema, descriptor `mcpSupport`-only shape. No CC-007 spec/codebase drift — the plan reads the codebase, doesn't hallucinate it.
- **Type-enforced invariants over convention.** The "inherited stores nothing" and "no secret in the descriptor" rules are enforced by the absence of a field in the type (`InheritedToolDescriptor`, `ServiceConnectionView`), not by a reviewer's vigilance. That's the right place to put a hard rule — the compiler holds it.
- **AC → verification table is concrete** (AC1–AC8 each name a test + assertion, not "write a test"), and design-it-twice on schema shape (wide table vs two tables) and descriptor placement (top-level vs nested) is genuine, not theatre — the rejected option has a real cost stated.
