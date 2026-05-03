# Local trace collector — observability for the pipeline

> Note: the directory is named `langfuse/` for historical reasons (we tried Langfuse and it didn't parse Claude Code's token attributes correctly). The current setup is a tiny custom OTLP-JSON receiver that dumps spans to SQLite for SQL-based A/B analysis. The Langfuse `docker-compose.yml` and `.env` files in this directory are unused at the moment but kept around for the MCP-server prompt-management use case.

## What's here

| part | what it is |
|---|---|
| `scripts/trace-collector.ts` | Bun HTTP server on port 4318, accepts OTLP/HTTP-JSON traces, writes one row per span to `.pipeline/traces.db` (SQLite, WAL mode). |
| `scripts/trace-report.ts` | Canned SQL reports (summary / sessions / session / ab / tools / models / sql) plus arbitrary SQL escape hatch. |
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

DB lives at `.pipeline/traces.db` (gitignored). Open it in any SQLite client. Schema in `scripts/trace-collector.ts`.

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

## Schema

```sql
CREATE TABLE spans (
  ingested_at TEXT,         -- when we wrote the row
  trace_id TEXT,
  span_id TEXT PRIMARY KEY,
  parent_span_id TEXT,
  name TEXT,
  span_type TEXT,           -- 'llm_request' | 'tool' | 'tool.execution' | 'tool.blocked_on_user' | …
  start_unix_ns INTEGER,
  end_unix_ns INTEGER,
  duration_ms REAL,
  service_name TEXT,        -- 'hyperidle-pipeline'
  service_version TEXT,
  session_id TEXT,          -- Claude Code session id
  ab_test TEXT,             -- from OTEL_RESOURCE_ATTRIBUTES via obs:ab
  ab_arm TEXT,
  model TEXT,               -- e.g. 'claude-opus-4-7[1m]'
  tool_name TEXT,           -- 'Bash', 'Read', …
  input_tokens INTEGER,
  output_tokens INTEGER,
  cache_read_tokens INTEGER,
  cache_creation_tokens INTEGER,
  ttft_ms REAL,
  attempt INTEGER,
  success INTEGER,          -- 0/1, NULL if absent
  stop_reason TEXT,
  decision TEXT,            -- for tool.blocked_on_user
  attributes TEXT,          -- raw span attributes as JSON
  resource TEXT             -- raw resource attributes as JSON
);
```

The two JSON columns hold everything the collector saw, so any attribute we didn't extract as a column is still queryable via SQLite's `json_extract`.

## MCP server (legacy Langfuse)

The Langfuse MCP server config in repo-root `.mcp.json` still works if you also bring up the Langfuse stack via `bun run obs:up`. It's only useful for Prompt Management at the moment; trace queries go through the SQLite DB and `obs:report`.

## Troubleshooting

- **`obs:report` says "no trace database"** — the collector hasn't been started yet. `bun run obs:collector` first.
- **No spans showing up despite collector running** — the shell that ran the traced process didn't `source obs:env`. Check `env | grep OTEL_`.
- **Inside dev container, no traces** — endpoint still says `localhost`; use `bun run obs:env --in-container` so it resolves to `host.docker.internal:3000`.
- **Claude Code session shows no traces** — `CLAUDE_CODE_ENABLE_TELEMETRY=1` only ships metrics + logs by default; traces are gated behind `CLAUDE_CODE_ENHANCED_TELEMETRY_BETA=1`. `otel.env` already sets it; if you exported manually, double-check.
- **Collector port collision** — set `HYPERIDLE_TRACE_PORT=4319` (and update `OTEL_EXPORTER_OTLP_ENDPOINT` to match).
- **Disk space** — `.pipeline/traces.db` grows roughly 1KB per span. `rm .pipeline/traces.db*` to start fresh; the collector recreates on next boot.
