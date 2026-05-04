## Dev Server

```bash
bun dev
```

This runs two processes in parallel via `concurrently`:

| Service | Port | What |
|---------|------|------|
| **Server** | 3001 | Hono API + WebSocket |
| **Web** | 5173 | Vite dev server (React) |

The Vite dev server proxies `/api/*` requests to `localhost:3001`.

### Environment Variables

Set `HYPERIDLE_API_KEY` before starting the server — it will exit if this is missing. This is a shared secret you choose yourself (any string). Every API request must include it as an `X-API-Key` header. There is no default — pick something and set it.

```bash
export HYPERIDLE_API_KEY=my-local-dev-key
bun dev
```

Key variables:

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `HYPERIDLE_API_KEY` | Yes | — | Shared secret for API auth (you choose the value) |
| `HYPERIDLE_PROFILE` | No | `laptop` | Deployment profile (`laptop`, `vps`, `cloud`) |
| `PORT` | No | `3001` | Server port |
| `DATABASE_URL` | VPS/Cloud | — | PostgreSQL connection string |
