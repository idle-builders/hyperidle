# AU20 feasibility amendment — AN1 Claude MCP discovery

## Verdict

**GO.** The defect is narrow and reproducible. Claude 2.1.202 supports project
`.mcp.json`; only discovery timing and output parsing are unstable.

## Evidence

- Five isolated `claude mcp list` runs: 4.84s, 4.81s, 4.94s, 2.66s, 5.45s.
- Existing code has competing 5s and 15s deadlines; the shorter result is lossy and
  does not cancel the command.
- Current help explicitly documents project `.mcp.json` and pending-approval listing.
- A current isolated `.mcp.json` server appeared as `⏸ Pending approval`.
- The focused real-harness test can pass when the command finishes before the race,
  confirming a timing-dependent regression rather than removed Claude capability.
- Abort POC using Node's promisified `execFile` with an `AbortController`: a child
  scheduled to emit `LATE` after 1,000ms was aborted after 100ms; result was
  `AbortError:ABORT_ERR` at 104ms, `signal.aborted === true`, and no late stdout after
  waiting beyond the original emission time. This validates the default-runner
  cancellation substrate.

## Risk and bounds

- Reading only `mcpServers` keys preserves AN1's identity-only security contract.
- Malformed/unreadable config degrades to CLI-only discovery.
- Failed CLI health cannot invent readiness; fallback health stays `unknown`.
- One executor-owned 15s timer plus `AbortSignal` bounds latency and terminates the
  default child. Injected runners receive the same signal; the executor's abort race
  still terminalizes if a test runner ignores it, while late settlement is discarded.
- `finally` cleanup of the only timer/listener is directly unit-testable through the
  injected runner context; no exported production seam is needed.
- Effective cwd is exactly `resolve(d?.cwd ?? process.cwd())`. Readable regular-file
  symlinks follow normal filesystem semantics; absent, unreadable, directory, broken
  symlink, and malformed inputs degrade to CLI-only discovery.
- No schema, API, UI, provisioning, transport, or service-surface changes.
- No real-API E2E changes or execution; those remain AU23-owned.

No external prerequisite is required beyond the existing release-gated Claude binary
for the real-harness integration. Unit/red coverage remains deterministic without it.
