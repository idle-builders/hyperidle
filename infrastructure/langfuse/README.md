# Local trace observability

Tiny custom OTLP receiver: Claude Code and the pipeline runner emit OpenTelemetry traces, the collector appends each span as a JSON line to `.pipeline/traces.jsonl`, and DuckDB reads that file directly for analysis. No central database, no lock contention, no UI to log into.

> The directory is named `langfuse/` for historical reasons. We tried Langfuse first, but it doesn't parse Claude Code's token attributes (they live under `input_tokens` / `cache_read_tokens` / etc., not the OTel GenAI conventions Langfuse expects). The Langfuse `docker-compose.yml` and `.env` here still work and are useful for the Prompt-Management MCP server, but they no longer see your traces.

## Quickstart

Three terminals, three independent jobs:

```sh
# Terminal A — keep running while you work:
bun run obs:collector

# Terminal B — any session you want traced:
source <(bun run obs:env)
claude                    # interactive session
# …or, inside the dev container:
source <(bun run obs:env --in-container)
bin/pipeline L10

# Terminal C — read the data, any time:
bun run obs:report                  # 24h summary
bun run obs:report ab block-1       # arm-by-arm comparison
```

The collector listens on `localhost:4318` (OTLP/HTTP-JSON, `POST /v1/traces`). The trace file at `.pipeline/traces.jsonl` is append-only; you can `tail -f` it, `jq` it, ship it as a tarball, or open it with the DuckDB CLI directly.

## A/B tagging a session

`bun run obs:ab <test-id> <arm>` prints the same export lines as `obs:env` plus `ab.test=<test-id>,ab.arm=<arm>` appended to `OTEL_RESOURCE_ATTRIBUTES`. Every span emitted from that shell carries the tags as resource attributes.

```sh
# Terminal 1 — baseline arm:
source <(bun run obs:ab block-1 baseline)
claude   # do whatever you're measuring

# Terminal 2 — variant arm (different worktree, modified config):
source <(bun run obs:ab block-1 variant)
claude

# Compare:
bun run obs:report ab block-1
```

`--in-container` works on `obs:ab` too.

## Reports

| command | what it shows |
|---|---|
| `bun run obs:report` | 24h totals + recent sessions |
| `bun run obs:report sessions` | every session, latest first |
| `bun run obs:report session <id>` | totals + per-span-type + top tools for one session |
| `bun run obs:report ab <test-id>` | one row per arm — sessions, llm_calls, tool_calls, tokens, duration |
| `bun run obs:report tools` | per-tool call count + duration (24h) |
| `bun run obs:report models` | per-model token totals (24h) |
| `bun run obs:report sql "<query>"` | arbitrary SQL against the `spans` view |

The collector and any number of report processes coexist — JSONL append is lock-free and DuckDB reads via `read_json_auto`.

## Direct DuckDB

Skip the scripts entirely if you want:

```sh
duckdb -c "SELECT span_type, COUNT(*) AS n
           FROM read_json_auto('.pipeline/traces.jsonl')
           GROUP BY 1 ORDER BY n DESC"
```

DuckDB infers `attributes` and `resource` as `STRUCT` columns, so nested keys are queryable directly:

```sql
SELECT attributes.gen_ai.response.id, resource['ab.arm'], input_tokens
FROM read_json_auto('.pipeline/traces.jsonl')
WHERE span_type = 'llm_request'
```

## Per-span shape

Each line in `traces.jsonl` is a flattened span:

```json
{
  "ingested_at": "2026-05-03T19:30:00Z",
  "trace_id": "…", "span_id": "…", "parent_span_id": "…",
  "name": "llm",
  "span_type": "llm_request",
  "start_unix_ns": 1714756800000000000,
  "end_unix_ns":   1714756803277000000,
  "duration_ms":   3277.0,
  "service_name": "hyperidle-pipeline",
  "session_id": "d53d67cd-…",
  "ab_test": "block-1",
  "ab_arm":  "variant",
  "model": "claude-opus-4-7[1m]",
  "tool_name": null,
  "input_tokens": 6,
  "output_tokens": 210,
  "cache_read_tokens": 13269,
  "cache_creation_tokens": 13923,
  "ttft_ms": 2070.0,
  "attempt": 1,
  "success": true,
  "stop_reason": "tool_use",
  "decision": null,
  "attributes": { …raw OTLP span attributes… },
  "resource":   { …raw OTLP resource attributes… }
}
```

The named columns are what we extract and project for reports; the two `STRUCT` columns hold the entire payload Claude Code sent, so anything else is still queryable without touching the collector.

## Pipeline path: run inside the dev container

`bin/pipeline` is a thin `bun packages/pipeline/src/index.tsx "$@"` wrapper. The runner uses `--dangerously-skip-permissions` only when `HYPERIDLE_DOCKER=1`, so in practice you run it inside the existing dev container:

```sh
docker build -t hyperidle-dev .          # one-time
docker run -it --rm \
  --add-host host.docker.internal:host-gateway \
  -v "$PWD":/workspace \
  -v "$HOME/.claude":/home/dev/.claude \
  hyperidle-dev bash

# inside the container:
source <(bun run obs:env --in-container)   # rewrites localhost → host.docker.internal
bin/pipeline L10
```

The `--add-host` flag is what lets the in-container OTel exporter reach the collector on the host.

## Files

| path | role |
|---|---|
| `scripts/trace-collector.ts` | Bun HTTP server on `:4318`, OTLP/HTTP-JSON → JSONL appender |
| `scripts/trace-report.ts` | DuckDB-on-read against the JSONL; canned reports + `sql` escape hatch |
| `scripts/obs.ts` | helpers around `otel.env` (`obs:env`, `obs:ab`, `obs:smoke`) |
| `infrastructure/langfuse/otel.env` | OTLP env vars + Claude-Code telemetry flags; `source` it to tag a shell |
| `infrastructure/langfuse/docker-compose.yml` | Langfuse stack (legacy, used only for the prompt-management MCP) |
| `.pipeline/traces.jsonl` | append-only span log (gitignored) |

## Troubleshooting

- **`obs:report` says "no trace file"** — the collector hasn't been started yet. `bun run obs:collector` first.
- **No spans show up despite the collector running** — the shell that ran the traced process didn't `source obs:env`. Check `env | grep OTEL_`.
- **Inside the dev container, no traces** — endpoint still says `localhost`. Use `bun run obs:env --in-container` so it resolves to `host.docker.internal:4318`. The `docker run` invocation also needs `--add-host host.docker.internal:host-gateway`.
- **Claude Code session emits nothing** — `CLAUDE_CODE_ENABLE_TELEMETRY=1` ships only metrics + logs by default. Traces are gated behind `CLAUDE_CODE_ENHANCED_TELEMETRY_BETA=1` and Claude Code defaults to gRPC, which the collector doesn't speak. `otel.env` already sets the beta flag, `OTEL_EXPORTER_OTLP_PROTOCOL=http/json`, and forces `OTEL_METRICS_EXPORTER=none` / `OTEL_LOGS_EXPORTER=none`. Verify all of them if you exported manually.
- **Collector port collision** — set `HYPERIDLE_TRACE_PORT=4319` and update `OTEL_EXPORTER_OTLP_ENDPOINT` to match.
- **JSONL file too big** — `mv .pipeline/traces.jsonl .pipeline/traces.$(date +%F).jsonl` (collector recreates on next ingest), or `rm` it outright. DuckDB can `read_json_auto('.pipeline/traces.*.jsonl')` with a glob if you want history.
