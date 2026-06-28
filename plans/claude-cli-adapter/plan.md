# Replace Claude Agent SDK with `claude` CLI subprocess (product runtime)

## Why
`claude-code` harnessType was wired to `@anthropic-ai/claude-agent-sdk` (`ClaudeAgentSdkAdapter`)
— a programmatic SDK, NOT the user's installed `claude` CLI. codex/opencode are real CLI
subprocesses with full native tools + inherited auth + HyperIdle MCP layered on top; claude was the
odd one out (tool-restricted via `toolsForRole`, API-key auth, no native tools). This makes claude
uniform with codex/opencode: a real `claude` subprocess.

## Scope
- IN: product runtime (`packages/server` harness) + the `@anthropic-ai/claude-agent-sdk` dependency
  in `packages/server`.
- OUT: `packages/pipeline` (internal `/pipeline` build-tool uses the SDK for orchestration — separate concern).
- OUT: clone-per-agent/session cwd (separate story; sandbox cwd unchanged).

## Design (final)
- `claude-code` → `CliHarnessAdapter(CLAUDE_CLI_CONFIG)`, binary `claude`, registered iff binary on PATH.
  id `local-claude-code`, type `claude-code`, modelProviders `["anthropic"]`.
- args: `-p {{prompt}} --output-format stream-json --verbose --model {{model}} --mcp-config .mcp.json --strict-mcp-config --permission-mode bypassPermissions --settings .claude/settings.json`
- auth: inherited login via forwarded HOME — NO ANTHROPIC_API_KEY injection (use the installed harness as configured).
- returnEnforcementChannel: `settings-claude` (provisionReturnHook already implements it).
- MCP: the generic `.mcp.json` session-provisioning already writes (claude-native `mcpServers`/`type:http`,
  token in URL path) — loaded via `--mcp-config`. No per-binary dialect writer needed.
- event translation: claude `stream-json` lines (`assistant`/`result`/`system`) pre-mapped to canonical
  HarnessEvents (cost still captured from the `result` line `total_cost_usd`), applied ONLY for claude
  (new `eventDialect: "claude-stream-json"` flag) so codex/opencode are untouched.

## Acceptance
- `@anthropic-ai/claude-agent-sdk` removed from `packages/server/package.json`; `claude-agent-sdk-adapter.ts` deleted.
- `npm run check` + `npm run lint` + `npm run test` green in the worktree.
- A real `claude` session spawns through `CliHarnessAdapter`, reaches the MCP bridge, and the
  `settings-claude` Stop hook fires (live-proof — owner-run, not in this builder).
