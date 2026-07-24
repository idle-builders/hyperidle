# AU20 architecture amendment — AN1 Claude MCP discovery

## Scope and finding

This amendment owns only Claude inherited-MCP discovery in:

- `packages/agent-execution/harness-registry/src/harness-discovery.ts`
- its focused unit tests and
  `AN1-real-harness-inherited.integration.test.ts`

It does not change connection provisioning, MCP transport, harness sessions, product
UI, or real-API E2E. Real-API E2E remains exclusively AU23-owned.

Claude Code 2.1.202 still discovers project servers from `.mcp.json`, but `claude mcp
list` performs health checks for every project and account server before emitting its
table. Five isolated observations took 4.84s, 4.81s, 4.94s, 2.66s, and 5.45s.
`inspectClaudeTools` races that command against 5,000ms while `runCommand` separately
owns a 15,000ms timeout. When the shorter timer wins it fabricates an empty failed
result, returns `[]`, and does not cancel the live child. A configured project identity
therefore disappears based on unrelated server latency.

Current output also uses `✔ Connected`, `✘ Failed`, `! Needs authentication`, and
`⏸ Pending approval`. The parser recognizes older glyphs and only part of this wording,
so some completed probes report incorrect `unknown` health.

Classification:

- primary: product-code regression — lossy dual-deadline discovery;
- secondary: stale parser/test assumptions about exact CLI health output;
- external CLI behavior: observed input, not a prerequisite or blocker.

## Corrected contract

### Identity source

Define `effectiveCwd = resolve(d?.cwd ?? process.cwd())` once and use it for both the
CLI process and config lookup. Read `resolve(effectiveCwd, ".mcp.json")` before the CLI
probe. Parse only the top-level
`mcpServers` object and retain only valid, non-empty server-name keys. Never project,
log, or return server values, commands, URLs, headers, environment variables, or
tokens. Each local identity initially has:

```ts
{ name, kind: "mcp-server", harness: "claude-code", health: "unknown" }
```

Absent, malformed, non-object, unreadable, directory, and broken-symlink paths
contribute no identity and never throw. A symlink to a readable regular file is
accepted using normal `readFile` semantics: Claude also consumes user-owned project
configuration through filesystem resolution, and only server-name keys leave this
boundary. No directory traversal or recursive config search occurs.

### One command, one deadline

Run `claude mcp list` once through a single command executor. Remove
`inspectClaudeTools`' private 5-second race. The executor owns exactly one
`AbortController`, one 15-second timer, and one terminal result.

Extend the injected runner compatibly:

```ts
type HarnessCommandContext = {
  cwd: string;
  env: NodeJS.ProcessEnv;
  signal: AbortSignal;
};
run?: (args: readonly string[], context: HarnessCommandContext) => Promise<CommandResult>;
```

Existing injected functions may ignore the second argument. `runCommand` resolves the
effective cwd/environment, starts the runner and one abort promise, and races those two
settlements. The default runner passes `signal` to `execFile`, so abort terminates the
child. The abort branch returns the ordinary failed `CommandResult`. A late injected
runner settlement is observed but ignored—never emitted, thrown, or used to mutate
discovery. A `finally` block clears the timer and removes the abort listener on success,
failure, and timeout. There is no timeout inside `inspectClaudeTools`; the executor is
the sole lifetime owner. Unit tests exercise this through the injected runner/context,
so no new public export is required.

The executor need not register an `AbortSignal` event listener of its own: a direct
timer race may call `controller.abort()` and settle the timeout branch. If an
implementation does register one, it must remove it in `finally`. The invariant is
zero net executor-owned listeners after every terminal path; zero added and zero
removed is valid.

On success, parse the emitted identities and health. On timeout, non-zero exit, empty
output, or unusable output, retain `.mcp.json` identities as `unknown`; never replace
a known project identity with `[]`. Account/global identities that exist only in CLI
output are honestly unavailable when the CLI probe fails.

### Parser and merge

Parse health only from the final status suffix: find the last literal `" - "` in the
line, and inspect only the trimmed substring after it. The command/URL portion between
the first name colon and the final delimiter is never searched for status words or
glyphs. Lines without a name colon remain ignored; lines with a name but no final
status delimiter retain `unknown`.

Map current and retained historical suffix forms:

- connected (`✔`, `✓`, or `connected`) → `working`;
- failed/rejected/pending/needs authentication (`✘`, `✗`, `⏸`, `!`, or matching
  wording) → `needs-attention`;
- otherwise → `unknown`.

Merge config and CLI results by exact name. Aggregate duplicate CLI rows conservatively
with explicit precedence `needs-attention > working > unknown`; then that aggregate
overrides the config fallback's `unknown`. This makes ordering irrelevant and prevents
one healthy duplicate from masking a failed/pending row. Return one descriptor per name
in deterministic name order. Output remains the closed identity-only shape.

## Validation contract

Write tests before implementation:

1. A temp `cwd/.mcp.json` plus delayed, timed-out, non-zero, empty, and malformed CLI
   results retains the exact project identity with `unknown` health.
2. Captured Claude 2.1.202 lines pin `✔`, `✘`, `! Needs authentication`, and `⏸ Pending
   approval`, while retained `✓`/`✗` forms remain covered. Adversarial command/URL
   segments containing `connected`, `failed`, and status glyphs prove only the final
   suffix controls health.
3. Successful CLI output merges project and global identities, deduplicates by name,
   applies `needs-attention > working > unknown`, overrides fallback health, and sorts
   deterministically.
4. Missing/malformed/unreadable/directory/broken-symlink `.mcp.json` plus failed CLI
   yields `[]`; a symlink to a readable regular config yields its identity.
5. Every result has exactly `name`, `kind`, `harness`, and `health`; fixtures containing
   command, URL, header, env, and token sentinels prove none escape.
6. Command-lifetime tests use the injected runner's `AbortSignal` to prove exactly one
   invocation, one timeout result, signal abortion, timer/listener cleanup on every
   branch, and that a deliberately late resolution produces no output, rejection,
   mutation, or second completion.
7. The real-Claude integration keeps the exact `an1-claude` identity assertion. Its
   health is `needs-attention` when the CLI reports pending/failed and `unknown` when
   fallback supplies identity; timing is not an assertion.

Red must demonstrate the current implementation returns `[]` for a known project
server when the CLI exceeds five seconds and misclassifies current status forms. Green
must pass the focused unit tests, the isolated AN1 real-harness integration, the
harness integration lane, `npm run check`, `npm run lint`, `npm run test`, and the
surface census unchanged at 23 services / 231 methods / 181 types / 412 total.

## Ordered implementation

1. Write and independently review the red contract.
2. Add the identity-only `.mcp.json` reader and current-output parser.
3. Remove the inner race; use the single command deadline.
4. Merge/dedupe/sort config and CLI identities.
5. Run focused and repository gates.
6. Default-reject implementation review, then one isolated green commit.
