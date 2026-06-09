## 6. Deployment Architecture

### 6.1 Laptop Profile

Everything runs on one machine. Single process for the API + Scheduler. Docker containers for agent workspaces. SQLite for all storage.

```
MacBook / Linux laptop
├── hyperidle (Node.js process)
│   ├── Hono API server (localhost:3001)
│   ├── Scheduler (in-process)
│   ├── Event Bus (in-process)
│   └── SQLite database
│       └── hyperidle.db (primitives + knowledge_items)
├── Docker (agent workspaces)
│   ├── container: nimmly-builder-session-42
│   └── container: nimmly-growth-session-43
├── Git repo (markdown artifacts)
│   ├── factory/ (PRINCIPLES.md, FOCUS.md, ...)
│   └── products/nimmly/ (BRIEF.md, ARCHITECTURE.md, ...)
└── Browser → http://localhost:5173 (the Factory)
```

Install: `npm install && npm run db:migrate && npm run dev`

### 6.2 VPS Profile

Same architecture, but the VPS is always on. Tailscale for secure remote access. Optional: OpenTelemetry collector for observability (planned).

```
VPS (Ubuntu, 4+ cores, 8+ GB RAM)
├── hyperidle (systemd service)
├── Docker (agent workspaces)
├── Tailscale (network access)
├── OpenTelemetry collector (optional, planned)
└── Nginx reverse proxy (for HTTPS)
```

The Factory app is accessed via `https://factory.tailscale-hostname:443` from any device.

### 6.3 Cloud Profile

Workspaces run on E2B or Daytona. The process layer runs on a small VM or container. Postgres replaces SQLite for the Primitive Store.

```
Cloud (AWS/GCP/Hetzner)
├── VM: hyperidle (API + Scheduler)
├── Postgres (Primitive Store + Knowledge)
├── E2B / Daytona (agent workspaces)
├── Redis (Event Bus, optional)
└── Managed observability (OpenTelemetry planned)
```

---
