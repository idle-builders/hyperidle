# Local Langfuse — observability backend for the pipeline

Self-hosted Langfuse stack for local A/B testing of token-efficiency blocks. The pipeline emits OTLP traces that land here; you read cost/duration/tool-call deltas off the Langfuse UI.

## Quickstart

```sh
bun run pipeline:build              # one-time: build the dev image
bun run obs:up                      # boot the Langfuse stack
bun run obs:smoke                   # emit one span and verify it ingests
bun run obs:run -- bun pipeline L10 # run a story (auto-spawns dev container)
```

UI: <http://localhost:3000>. Login `dev@hyperidle.local` / `hyperidle-local-pw`. Project: `hyperidle-pipeline`.

`bun pipeline …` (defined in root `package.json`) routes through `bin/pipeline`. On the host it spawns the `hyperidle-dev` container via `infrastructure/pipeline/docker-compose.yml` so the Claude Agent SDK can run with `--dangerously-skip-permissions`. Inside the container (`HYPERIDLE_DOCKER=1`) it execs `bun packages/pipeline/src/index.tsx` directly. The OTLP endpoint's `localhost` is rewritten to `host.docker.internal` before being passed in, so traces from the container land in the Langfuse stack on the host.

Escape hatches:
- `HYPERIDLE_PIPELINE_LOCAL=1 bun pipeline L10` — run on the host without docker (you'll have to interactively approve every tool call).
- `bun run pipeline:shell` — open a bash inside the dev container with the same mounts.

## What gets created

`bun run obs:up` brings up six containers (`docker compose -f infrastructure/langfuse/docker-compose.yml`):

| service | host port | role |
|---|---|---|
| `langfuse-web` | 3000 | UI + OTLP ingest |
| `langfuse-worker` | — | trace processor |
| `postgres` | — | metadata |
| `clickhouse` | — | trace storage |
| `redis` | — | queue + cache |
| `minio` | 9090 / 9091 | event/media object store |

On first boot, Langfuse seeds an org (`hyperidle`), a project (`hyperidle-pipeline`), and a deterministic public/secret keypair from the `.env` file. The matching `Authorization: Basic …` header lives in `otel.env`.

## Env files

| file | purpose | who reads it |
|---|---|---|
| `.env` | server-side secrets (DB passwords, encryption key, bootstrap keypair) | docker compose |
| `otel.env` | SDK-side OTLP exporter config (endpoint + auth header) | the pipeline runner via `obs:run` or `source` |

These are local-only credentials — they only authenticate against your own machine's Langfuse instance. Replace the `.env` keys before exposing this stack on a network.

## Commands

| command | what it does |
|---|---|
| `bun run obs:up` | boot the stack, poll `/api/public/health` until green |
| `bun run obs:down` | stop the stack (volumes preserved — restart resumes) |
| `bun run obs:reset` | stop **and remove volumes** (nukes traces + project — bootstrap re-runs on next `up`) |
| `bun run obs:status` | `docker compose ps` |
| `bun run obs:logs [service]` | tail logs (optionally for one service) |
| `bun run obs:env` | print the SDK-side env vars (for `eval "$(bun run obs:env)"`) |
| `bun run obs:smoke` | emit one OTel span and confirm ingest |
| `bun run obs:run -- <cmd>` | exec a command with OTLP env vars set (e.g. `bun run obs:run -- bun pipeline L10`) |

## A/B-testing pattern

The validation framing in `plans/token-efficiency-blocks.md` is parallel A/B per block. With Langfuse running:

1. Spin two worktrees from the same SHA. Set `OTEL_RESOURCE_ATTRIBUTES` to include `pipeline.arm=baseline` in one and `pipeline.arm=variant` in the other.
2. Run the same story in both. Each persona spawn produces a `hyperidle.persona` span with the arm tag.
3. In Langfuse, group by `pipeline.arm` and compare totals: input/output tokens, duration, `hyperidle.tool_calls.actual`, retry count.
4. Ship rule (per the plan): ≥10% improvement on cost or wall-clock with no AC regression on at least 3 stories of mixed complexity.

## MCP server

The local Langfuse stack also exposes Langfuse's MCP server at `http://localhost:3000/api/public/mcp`. The repo root `.mcp.json` already wires Claude Code to it with the local keypair; restart Claude Code (or run `/mcp` to re-init) after `obs:up` and the `langfuse` MCP server appears in the tool list. Currently scoped to Prompt Management; trace querying lives behind the REST API (e.g. `curl -u pk-…:sk-… http://localhost:3000/api/public/traces`). Source: <https://langfuse.com/docs/api-and-data-platform/features/mcp-server>.

## Troubleshooting

- **`obs:up` hangs at "Waiting for langfuse-web…"** — first boot pulls images and runs migrations. Allow ~2 minutes; check `bun run obs:logs langfuse-worker`.
- **Smoke test 401 / 403** — the `.env` keypair was changed but `otel.env` wasn't rebuilt. Recompute `Authorization=Basic $(echo -n "PUB:SEC" | base64)` or run `bun run obs:reset` to start fresh.
- **Port 3000 collision** — Langfuse UI shares port 3000. Stop whatever else is on 3000 (the hyperidle dev server uses 3001) before `obs:up`.
- **Disk space** — ClickHouse + MinIO grow with trace volume. `bun run obs:reset` reclaims everything.
