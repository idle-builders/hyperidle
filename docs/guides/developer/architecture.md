## Architecture

Three-layer system with strict downward dependency:

```
Human Interface Layer (web)
        ↓
Meta Layer (server, fabric)
        ↓
Agent Runtime (harness adapters, workspaces)
```

No layer reaches past its neighbor. Read `docs/architecture/index.md` for the full picture.

### Key Architectural Concepts

- **Products, Bets, Tasks** — work hierarchy (portfolio > shaped bets > concrete tasks)
- **Agents** — AI identities with skills, inbox, memory
- **Teams** — persistent agent groups bound to a product
- **Sessions** — bounded agent runs on tasks
- **Knowledge (L0-L4)** — five layers from session ephemera to factory principles
- **Conversations** — unified threading for reviews and chat
