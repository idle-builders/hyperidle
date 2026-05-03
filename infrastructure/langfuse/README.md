# Local Langfuse — observability backend for the pipeline

Self-hosted Langfuse stack for tracing pipeline runs and Claude Code sessions locally. Built as a small set of independent parts so you can opt into whichever you need.

## What's here

| part | what it is |
|---|---|
| `docker-compose.yml` | the Langfuse stack itself (web + worker + Postgres + ClickHouse + Redis + MinIO). Standalone — has no relation to the repo-root `docker-compose.yml` (which deploys hyperidle to a VPS). |
| `.env` | server-side bootstrap secrets for the Langfuse containers. Local-only credentials. |
| `otel.env` | SDK-side OTLP env vars (endpoint + auth header) plus `CLAUDE_CODE_ENABLE_TELEMETRY=1`. Source this in any terminal session you want traced. |
| `scripts/obs.ts` | thin CLI: `up`/`down`/`status`/`logs`/`smoke`/`env`/`ab`. Nothing magical. |

## 1. Start the stack

```sh
bun run obs:up      # boots Langfuse, polls /api/public/health
bun run obs:smoke   # emit one OTel span and confirm it ingests
bun run obs:status  # docker compose ps
bun run obs:logs    # tail logs
bun run obs:down    # stop (volumes preserved)
bun run obs:reset   # stop AND remove volumes
```

UI at <http://localhost:3000>. Project `hyperidle-pipeline`.

### Default account

| field | value |
|---|---|
| email | `dev@hyperidle.local` |
| password | `hyperidle-local-pw` |

Seeded by `LANGFUSE_INIT_USER_*` in `.env` on first boot. Signup is disabled (`AUTH_DISABLE_SIGNUP=true`), so this is the only login. Log in once — the NextAuth session cookie persists across `obs:down` / `obs:up` cycles (it's stored in your browser, not the stack). Only `obs:reset` invalidates the user record.

## 2. Tag a terminal session for tracing

`bun run obs:env` prints `export …` lines you can `source`. Once exported, anything you launch from that shell that supports OTLP will trace to Langfuse — Claude Code interactive sessions (via `CLAUDE_CODE_ENABLE_TELEMETRY=1`) and `bin/pipeline` (via the runner's OTel module) both work.

```sh
source <(bun run obs:env)         # tag this shell — host processes
claude                            # interactive session, traced
```

For shells **inside** the dev container, use `--in-container` so the OTLP endpoint resolves through the docker host gateway:

```sh
# inside `docker run -it … hyperidle-dev bash`:
source <(bun run obs:env --in-container)
bin/pipeline L10
```

## 3. Layer A/B tags on the same shell

`bun run obs:ab <test-id> <arm>` does the same as `obs:env` but appends `ab.test=<test-id>,ab.arm=<arm>` to `OTEL_RESOURCE_ATTRIBUTES`. Langfuse stores these as resource attributes on every trace produced from that shell — group by them in the UI to compare arms.

```sh
# baseline arm in one terminal:
source <(bun run obs:ab block-1 baseline)
bin/pipeline L10

# variant arm in another terminal (different worktree, modified config):
source <(bun run obs:ab block-1 variant)
bin/pipeline L10
```

`--in-container` works on `obs:ab` too.

## Pipeline path: run inside the dev container

`bin/pipeline` is a thin `bun packages/pipeline/src/index.tsx "$@"` wrapper that the runner (with `--dangerously-skip-permissions`) gates on `HYPERIDLE_DOCKER=1`. So in practice you run it inside the existing dev container:

```sh
docker build -t hyperidle-dev .          # one-time
docker run -it --rm \
  --add-host host.docker.internal:host-gateway \
  -v "$PWD":/workspace \
  -v "$HOME/.claude":/home/dev/.claude \
  hyperidle-dev bash

# inside the container:
source <(bun run obs:env --in-container)
bin/pipeline L10
```

The `--add-host` flag is what lets the in-container OTLP exporter reach Langfuse on the host. `bun pipeline L10` (root npm script → `bin/pipeline L10`) works the same way.

## MCP server

`.mcp.json` at the repo root wires Claude Code to Langfuse's MCP server at `http://localhost:3000/api/public/mcp` with the local keypair. Restart Claude Code (or run `/mcp`) after `obs:up` to pick it up. Currently scoped to Prompt Management; trace querying still uses the REST API:

```sh
curl -u "pk-lf-hyperidle-local-pub:sk-lf-hyperidle-local-secret" \
  "http://localhost:3000/api/public/traces?limit=5"
```

Source: <https://langfuse.com/docs/api-and-data-platform/features/mcp-server>.

## Troubleshooting

- **`obs:up` hangs at "Waiting for langfuse-web…"** — first boot pulls images and runs migrations. Allow ~2 minutes; check `bun run obs:logs langfuse-worker`.
- **`obs:smoke` 500 with "Failed to upload JSON to S3"** — the MinIO `langfuse` bucket didn't get created. `bun run obs:reset && bun run obs:up` re-runs the bootstrap.
- **No traces in UI but smoke works** — Claude Code or pipeline running in a shell that didn't `source obs:env`. Or, in the container, the endpoint still says `localhost` — use `--in-container`.
- **Claude Code shows nothing in Langfuse** — Claude Code's `CLAUDE_CODE_ENABLE_TELEMETRY=1` ships metrics + logs by default; traces are gated behind `CLAUDE_CODE_ENHANCED_TELEMETRY_BETA=1`. And it defaults to gRPC, while Langfuse only accepts OTLP/HTTP. `otel.env` already sets both flags plus `OTEL_EXPORTER_OTLP_PROTOCOL=http/protobuf`; if you exported env vars manually, double-check those three.
- **Port 3000 collision** — Langfuse UI binds 3000 (the hyperidle dev server uses 3001).
- **Disk space** — ClickHouse + MinIO grow with trace volume. `bun run obs:reset` reclaims everything.
