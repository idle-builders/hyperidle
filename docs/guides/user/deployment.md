## Deployment

Three profiles for different environments:

| Profile | Database | Best For |
|---------|----------|----------|
| **Laptop** | SQLite | Local development, trying things out |
| **VPS** | PostgreSQL (Docker Compose) | Self-hosted, single server |
| **Cloud** | Managed PostgreSQL | Production, scalable |

### Laptop Setup

```bash
bun install
bun run setup --profile laptop
export HYPERIDLE_API_KEY=your-secret-key
bun dev                              # development mode (terminal stays open)
```

#### Running as a Background Service (macOS)

To keep HyperIdle running after you close the terminal — and across reboots:

```bash
export HYPERIDLE_API_KEY=your-secret-key
bin/service install
```

This builds the frontend, installs a macOS LaunchAgent, and starts the server. HyperIdle will be available at [http://localhost:3001](http://localhost:3001) and will restart automatically on login.

| Command | What it does |
|---------|-------------|
| `bin/service install` | Build, install, and start the service |
| `bin/service stop` | Stop the server |
| `bin/service start` | Start the server |
| `bin/service restart` | Stop, rebuild if needed, and start |
| `bin/service status` | Check if the server is running |
| `bin/service logs` | Tail the server log |
| `bin/service uninstall` | Stop and remove the service |
| `bin/service rebuild` | Rebuild the frontend after code changes |

### VPS Setup

```bash
cp .env.example .env
# Edit .env — set POSTGRES_PASSWORD at minimum
bun run setup --profile vps
docker compose up -d
bun run db:migrate:pg
bun run db:seed:pg
```

### Cloud Setup

```bash
export DATABASE_URL=postgres://user:pass@host:5432/hyperidle
bun run setup --profile cloud
bun run db:migrate:pg
bun run db:seed:pg
```

See `docs/deployment/index.md` for full details.
