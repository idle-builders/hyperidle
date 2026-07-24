# AU20 AN1 Claude MCP discovery — architecture critique R2

**VERDICT: accept — 11/11**

Reviewed:

- `.pipeline/work/AU20/architecture-amendments/an1-claude-mcp-discovery.md`
  (`a54e5dccec1fb8215a0c3465978a31c2923b5402a8480c44960cb1d4c6c47e92`)
- `.pipeline/work/AU20/feasibility-amendments/an1-claude-mcp-discovery.md`
  (`6aa384fc3b676f44f9cad77e9c35eceb59d8be416de56cbb96ffde923b821b5e`)

All prior findings are closed:

1. One executor-owned `AbortController`, timer, and terminal result cover default and
   injected runners. The injected context carries cwd, environment, and signal
   compatibly. Late settlement and timer/listener cleanup are explicit and tested.
2. Feasibility includes a real `execFile` abort POC proving child termination and no
   late output.
3. Claude health parsing is confined to the final `" - "` suffix. Adversarial
   command/URL fixtures prevent status words or glyphs from forging health.
4. Duplicate CLI identities reduce deterministically with
   `needs-attention > working > unknown`, then override config fallback and sort by
   exact name.
5. Effective cwd and absent, malformed, unreadable, directory, broken-symlink, and
   readable-symlink behavior are exact.
6. Identity-only fallback and secret sentinels prove commands, URLs, headers,
   environment values, and tokens never cross the discovery boundary.
7. Real-Claude integration permits honest `unknown` fallback without timing
   assertions. Real-API E2E remains explicitly AU23-owned.

Implementation watch, not a blocker: `runCommand` is shared beyond Claude. Preserve
existing successful-result and 15-second semantics for every caller and run their
focused tests.

Architecture is accepted. Unlock write-tests only; write-code remains locked pending
independent red-proof review.
