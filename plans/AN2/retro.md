# Retro — AN2: Outbound tool brokering (hybrid)

Backend-only L workpackage. No `/concept` (nouns locked in `plans/AN/concept.md` + `plans/AL7/concept.md`), no `/design` (no rendered surface). The 6-phase pipeline collapsed cleanly to architecture → critique → TDD → review → docs → retro.

## What shipped
An outbound tool-brokering path: HyperIdle now connects OUT to external MCP servers, presents their tools to an agent session, and classifies each call — reversible (vetted source + idempotent annotation) runs direct; everything else (community sources, unannotated, irreversible) rides AL7's staged-operation gate. The credential is resolved server-side from a per-user `authSource="token"` Connection and attached at execution; it is never in the agent session, args, sandbox, or logs.

## Cost signals (for the A/B harness)
- **Critique revision rounds:** 1 (architecture critique 8/10 → 9/10; all 4 WARNINGs resolved).
- **Code-review rework rounds:** 0 (verdict DONE first pass; 1 WARNING + 2 NITs folded in as cheap polish, no AC re-review).
- **Green-phase passes:** 1 (all 6 build tasks committed at boundaries; one mid-phase debug cycle on the test fixture, no task-level rework).
- **Tests:** 27 unit + 47 integration AN2 tests green; protected AL7/AN1 suites green untouched; full `npm run verify` EXIT 0.
- **Net machinery added:** outbound MCP client + brokered-tool wrapper + JSON-Schema→zod converter + connector resolver + `resolveOwnerUserId` + `ownerUserId` threading. **No new table, no migration, no new gate** — rides AL7's `invoke` workflow.

## What went well (protect these)
1. **Producer/evaluator split caught a real security defect** the producer missed — the forged-`idempotentHint` gate-bypass. Resolved with a fail-closed trust-tier posture (community → annotations dropped → all-brokered; only vetted may downgrade to direct). Evidence the boundary pays off on backend WPs, not just UI. (CC-009)
2. **The load-bearing insight held under review** — "a brokered call is just a `RegisteredTool` with a server-side handler" genuinely rides AL7 unchanged; the `tool-registry.ts` diff was only the additive `ownerUserId` field. No kernel-executor reintroduced; reconciled the AN-concept credential wording with AL7's trust-first model. (CC-007)
3. **Live-proof met in-repo without network/secrets** — a real SDK `McpServer` over a real HTTP transport (ephemeral port) + a real stdio child-process server for the second-service-by-config proof. Sanity-break confirmed the credential-attach and trust-gate assertions go RED when reverted — not green-against-a-mock.
4. **TDD red-phase → first-pass-green** — zero rework rounds. (CC-010)

## Friction
- **MCP-SDK stateful-transport fixture clash:** one shared `McpServer` rejected a second client's `initialize` ("Server already initialized"). Fixed with a per-session `McpServer` pattern (routed by `mcp-session-id`). One extra green-phase debug cycle. Future MCP-server test fixtures should be per-session from the start. `@lore` captured.
- **Resource leak on the enumeration error path** (non-blocking review WARNING): the connector resolver connects out + closes to enumerate tools at provision time; a `listTools()` throw after a successful connect leaked the connection/child-process. One-round fix. Caught by the adversarial lens, not tests — error-path resource lifecycle is a recurring tests blind spot.

## Reusable patterns
- **In-repo real MCP server over a real transport** is a clean way to satisfy a live-proof gate inside `npm run verify` (no network, no secrets, genuinely over the wire — not a client stub).
- **Eager tool enumeration at provision time** (connect → list → close; handlers reconnect at call time) keeps the session's tool list fixed at start with no mid-session registry mutation. `@lore AN2` in `connector-resolver.ts`.
