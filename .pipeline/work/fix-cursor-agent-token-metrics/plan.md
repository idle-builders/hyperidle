# Fix: cursor-agent sessions always reported zero tokens

## What was wrong

`extractClaudeResultMetrics` in `layers/agent-execution/harness-registry/src/cli-harness-adapter.ts`
reads the terminal `result` line's `usage` object using Anthropic's snake_case keys:
`input_tokens`, `output_tokens`, `cache_read_input_tokens`, `cache_creation_input_tokens`.

`cursor-agent` is configured with the same `eventDialect: "claude-stream-json"` as claude (it
advertises a claude-compatible `--output-format stream-json`), and its `result` line does carry a
`usage` object — but with **camelCase** keys: `inputTokens`, `outputTokens`, `cacheReadTokens`,
`cacheWriteTokens`. None of those match the snake_case lookups, so every field resolved to
`undefined` and every cursor-agent session recorded zero input/output/cache tokens, no matter how
much was actually spent.

Captured from the installed `cursor-agent` binary (`2026.08.25-3e8eec8`):

```json
"usage":{"inputTokens":4,"outputTokens":759,"cacheReadTokens":61008,"cacheWriteTokens":9070}
```

## How long it had been wrong

Since cursor-agent was first wired up as a supported harness — the snake_case-only extraction
predates any camelCase handling, so this has been wrong for every cursor-agent session ever run.
Cost/usage accounting for that harness has never reflected real spend.

## The fix

`extractClaudeResultMetrics` now falls back to the camelCase key when the snake_case key is
absent, for all four fields (input, output, cache-read, cache-write):

```ts
inputTokens: finiteNonNegative(usage.input_tokens) ?? finiteNonNegative(usage.inputTokens),
outputTokens: finiteNonNegative(usage.output_tokens) ?? finiteNonNegative(usage.outputTokens),
cachedInputTokens:
  finiteNonNegative(usage.cache_read_input_tokens) ?? finiteNonNegative(usage.cacheReadTokens),
cacheCreationInputTokens:
  finiteNonNegative(usage.cache_creation_input_tokens) ?? finiteNonNegative(usage.cacheWriteTokens),
```

Claude's native snake_case keys are tried first and win when present, so claude/codex/opencode
behavior is unchanged — this only fills in the gap for the harness that uses the alternate casing.

## How it was proven

- Added a new case to `layers/agent-execution/harness-registry/src/__tests__/cli-native-metrics.test.ts`
  built from the real captured binary output above, asserting both the emitted `token_usage` event
  and the final `stopSession` metrics report the real non-zero numbers.
- Ran the full `cli-native-metrics.test.ts` file: all 4 cases (claude, cursor-agent, codex,
  opencode) pass.
- Proved the new test can fail: temporarily reverted the fallback to snake_case-only, re-ran the
  suite — the new cursor-agent case reddened (`expected undefined to match object ...`) while the
  claude/codex/opencode cases stayed green. Restored the fallback and confirmed the file was
  byte-identical to before, then re-ran to confirm all 4 pass again.
- Ran the full `harness-registry` unit suite (`npx vitest run --project=harness-registry`): 37
  files, 489 tests, all pass.
- `npm run check`: 0 errors across all 39 packages.
- `npm run lint`: exits 0; only pre-existing warnings unrelated to these two files.

## Scope

Only `cli-harness-adapter.ts` (the camelCase fallback in `extractClaudeResultMetrics`) and the new
test case in `cli-native-metrics.test.ts`. No action-gate, `/action-check`, hook, or shim changes —
those belong to other pieces of the parent work package and were not brought over.
