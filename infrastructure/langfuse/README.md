# Local trace collector — observability for the pipeline

> Note: the directory is named `langfuse/` for historical reasons (we tried Langfuse and it didn't parse Claude Code's token attributes correctly). The current setup is a tiny custom OTLP-JSON receiver that dumps spans to SQLite for SQL-based A/B analysis. The Langfuse `docker-compose.yml` and `.env` files in this directory are unused at the moment but kept around for the MCP-server prompt-management use case.

## What's here

| part | what it is |
|---|---|
| `scripts/trace-collector.ts` | Bun HTTP server on port 4318, accepts OTLP/HTTP-JSON traces, appends one JSON line per span to `.pipeline/traces.jsonl`. |
| `scripts/trace-report.ts` | DuckDB-on-read against the JSONL via `read_json_auto`. Canned reports plus arbitrary SQL escape hatch. |
| `infrastructure/langfuse/otel.env` | SDK-side OTLP env vars + Claude Code telemetry flags. Source it in any shell you want traced. |
| `scripts/obs.ts` | Helpers around `otel.env` — `obs:env` prints export lines, `obs:ab` adds A/B tags. |
| `infrastructure/langfuse/docker-compose.yml` | Langfuse stack (legacy, still works for the MCP server but does not see your traces). |

## Quickstart

```sh
# Terminal A — keep running while you work:
bun run obs:collector

# Terminal B — any session you want traced:
source <(bun run obs:env)
claude        # or bin/pipeline L10 inside the dev container

# Terminal C — read the data, any time:
bun run obs:report                  # summary, last 24h
bun run obs:report sessions         # list sessions
bun run obs:report session <id>     # drill into one
bun run obs:report ab block-1       # arm-by-arm comparison
bun run obs:report tools            # tool-call rollup
bun run obs:report models           # per-model token totals
bun run obs:report sql "SELECT span_type, COUNT(*) FROM spans GROUP BY 1"
```

Trace data lives at `.pipeline/traces.jsonl` (gitignored). Append-only — the collector never holds an exclusive lock, so DuckDB can read while it writes. Inspect with `tail -f`, `jq`, or directly via the DuckDB CLI:

```sh
duckdb -c "SELECT span_type, COUNT(*) FROM read_json_auto('.pipeline/traces.jsonl') GROUP BY 1"
```

Schema is whatever DuckDB infers from the JSONL — see `scripts/trace-collector.ts` for the per-span shape we write.

## A/B tagging

Tag a shell once, then any traced process from that shell carries the tag.

```sh
# baseline arm (terminal):
source <(bun run obs:ab block-1 baseline)
claude     # do whatever you want measured

# variant arm (different terminal, possibly different worktree with the change):
source <(bun run obs:ab block-1 variant)
claude

# compare:
bun run obs:report ab block-1
```

A/B tags ride as `ab.test` and `ab.arm` resource attributes on every span.

## Pipeline path: run inside the dev container

`bin/pipeline` is a thin `bun packages/pipeline/src/index.tsx "$@"` wrapper. The runner (with `--dangerously-skip-permissions`) gates on `HYPERIDLE_DOCKER=1`, so in practice you run it inside the existing dev container:

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

The `--add-host` flag lets the in-container OTel exporter reach the collector on the host. Use `--in-container` on `obs:env` and `obs:ab` to get the same rewrite.

## Per-span shape

Each line in `traces.jsonl` is a flattened span like:

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
  "service_version": "2.1.126",
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
  "attributes": { …raw OTLP attributes… },
  "resource":   { …raw OTLP resource attrs… }
}
```

DuckDB infers `attributes` and `resource` as `STRUCT` columns, so they're navigable directly:

```sql
SELECT attributes.gen_ai.response.id, resource['ab.arm']
FROM spans
WHERE span_type = 'llm_request'
```

Anything Claude Code puts into the OTLP payload that we didn't pull out as a column is still queryable through those structs.

## MCP server (legacy Langfuse)

The Langfuse MCP server config in repo-root `.mcp.json` still works if you also bring up the Langfuse stack via `bun run obs:up`. It's only useful for Prompt Management at the moment; trace queries go through the SQLite DB and `obs:report`.

## Troubleshooting

- **`obs:report` says "no trace file"** — the collector hasn't been started yet. `bun run obs:collector` first.
- **No spans showing up despite collector running** — the shell that ran the traced process didn't `source obs:env`. Check `env | grep OTEL_`.
- **Inside dev container, no traces** — endpoint still says `localhost`; use `bun run obs:env --in-container` so it resolves to `host.docker.internal:4318`.
- **Claude Code session shows no traces** — `CLAUDE_CODE_ENABLE_TELEMETRY=1` only ships metrics + logs by default; traces are gated behind `CLAUDE_CODE_ENHANCED_TELEMETRY_BETA=1`. `otel.env` already sets it; if you exported manually, double-check.
- **Collector port collision** — set `HYPERIDLE_TRACE_PORT=4319` (and update `OTEL_EXPORTER_OTLP_ENDPOINT` to match).
- **Disk space** — `.pipeline/traces.jsonl` grows ~2KB per span. `rm .pipeline/traces.jsonl` to start fresh; the collector recreates on next ingest. Or `mv` it to archive.
