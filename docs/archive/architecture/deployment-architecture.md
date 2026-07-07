## 6. Deployment Architecture

### 6.1 Laptop Profile

Everything runs on one machine. Single process for the API + Scheduler. Agent sessions run in per-session host working directories (no container). SQLite for all storage.

```
MacBook / Linux laptop
├── hyperidle (Node.js process)
│   ├── Hono API server (localhost:3001)
│   ├── Scheduler (in-process)
│   ├── Event Bus (in-process)
│   └── SQLite database
│       └── hyperidle.db (primitives + knowledge_items)
├── /tmp/hyperidle-workspaces/ (agent session working dirs — host filesystem)
│   ├── session-42/ (acme-builder session, rm -rf on destroy)
│   └── session-43/ (acme-growth session, rm -rf on destroy)
├── Git repo (markdown artifacts)
│   ├── factory/ (PRINCIPLES.md, FOCUS.md, ...)
│   └── products/acme/ (BRIEF.md, ARCHITECTURE.md, ...)
└── Browser → http://localhost:5173 (the Factory)
```

Install: `npm install && npm run db:migrate && npm run dev`

### 6.2 VPS Profile

Same architecture, but the VPS is always on. Tailscale for secure remote access. Optional: OpenTelemetry collector for observability (planned).

```
VPS (Ubuntu, 4+ cores, 8+ GB RAM)
├── hyperidle (systemd service)
├── /tmp/hyperidle-workspaces/ (agent session working dirs — host filesystem)
├── Tailscale (network access)
├── OpenTelemetry collector (optional, planned)
└── Nginx reverse proxy (for HTTPS)
```

The Factory app is accessed via `https://factory.tailscale-hostname:443` from any device.

### 6.3 Cloud Profile

The process layer runs on a small VM or container. Postgres replaces SQLite for the Primitive Store. Agent sessions run host-local on the VM by default; remote isolated workspaces (E2B/Daytona) are planned for AQ2+.

```
Cloud (AWS/GCP/Hetzner)
├── VM: hyperidle (API + Scheduler)
├── Postgres (Primitive Store + Knowledge)
├── /tmp/hyperidle-workspaces/ (agent session working dirs — host filesystem, AQ1)
├── Redis or NATS (Event Bus — cloud profile only, not used on laptop/VPS)
└── Managed observability (OpenTelemetry planned)
```

---
