# AU20 AN1 Claude MCP discovery — combined architecture and red-proof review R3

**VERDICT: accept — 11/11**

Reviewed:

- architecture
  `.pipeline/work/AU20/architecture-amendments/an1-claude-mcp-discovery.md`
  (`6b80424a5f76dcbde4ad22185c7e50bf26750f0ae47b484e37ab5619ea01dbbd`)
- feasibility
  `.pipeline/work/AU20/feasibility-amendments/an1-claude-mcp-discovery.md`
  (`6aa384fc3b676f44f9cad77e9c35eceb59d8be416de56cbb96ffde923b821b5e`)
- unit red contract
  `packages/agent-execution/harness-registry/src/__tests__/harness-discovery.test.ts`
  (`35fca3c18ceca36a697d0c821ad0254a1c4e796bfdba97d029475ccdf337b803`)
- real-harness integration contract
  `packages/agent-execution/harness-registry/src/__tests__/AN1-real-harness-inherited.integration.test.ts`
  (`5e822e2dae8fb5b4816dfeba9b5e2aea95eada01490355e2ccdd27348b2c9bb7`)

The post-review clarification is accepted: the executor invariant is zero net
executor-owned `AbortSignal` listeners after every terminal path. An implementation
that adds zero and removes zero listeners is valid.

The red contract is complete:

1. Configured identity survives delayed, timed-out, non-zero, successful-empty, and
   successful-unusable Claude output.
2. Current and historical status suffixes, adversarial command/URL text, exact-name
   dedupe, conservative health precedence, config/CLI merge, deterministic sorting,
   closed descriptor shape, and secret exclusion are pinned.
3. Absent, malformed, missing/non-object/array `mcpServers`, empty/whitespace names,
   unreadable regular files, directories, broken symlinks, and readable symlinks are
   covered.
4. Success, failure, and timeout prove one invocation, signal delivery/abortion,
   command-timer cleanup, and zero residual executor listeners.
5. Late resolve and late reject after timeout prove one terminal result, no result
   mutation, and no unhandled rejection.
6. Real-Claude integration retains exact project identity while allowing honest
   `needs-attention` or fallback `unknown` health without timing assertions.

Focused unit execution produced 5 passing baseline tests and 12 intended failures in
476ms. Biome passed. Failures are attributable to missing production behavior;
production and AU23 E2E remained untouched. The 331-line unit addition is proportionate
to the accepted runtime/state matrix and uses fake timers, so it adds no five- or
fifteen-second wall-clock delay.

Architecture clarification and red proof are accepted. Unlock write-code; subsequent
implementation remains subject to default-reject review and full gates.
