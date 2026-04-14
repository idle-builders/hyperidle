# HyperIdle — Claude Code Rules

HyperIdle is an agentic operating system that manages product teams of AI agents. Two founders (CEO + CPO) run a "Product Factory" — a portfolio of digital products where AI agents do the implementation work.

**Status:** Pre-implementation. Architecture docs are complete. Code is being built story-by-story from `WORK_PACKAGES.md`.

**Builder philosophy:** Read `ETHOS.md` — three principles (Boil the Lake, Search Before Building, User Sovereignty) that guide all agent behavior.

---

## Architecture (read before writing code)

Three-layer system with strict downward dependency:

```
Human Interface  →  Meta Layer  →  Agent Runtime
(React/Vite)        (Router,       (Workspace,
                     Scheduler,     Harness,
                     Fabric,        Observability
                     Store)         adapters)
```

No layer reaches past its neighbor. The Meta Layer does NOT call models. The Human Interface does NOT access the Primitive Store directly — it goes through the API layer.

**Source of truth documents:**
- `ARCHITECTURE.md` — System layering, components, data flow
- `WORK_PACKAGES.md` — Implementation stories with acceptance criteria
- `PROCESS_LAYER.md` — Bets, Tasks, Sessions, Teams, Routines
- `KNOWLEDGE_ARCHITECTURE.md` — Five knowledge layers (L0-L4)
- `HUMAN_INTERFACE_LAYER.md` — UI structure, views, interaction grammar
- `UI_DESIGN.md` — 19 custom components, theme, building order
- `REQUIREMENTS.md` — Functional and non-functional requirements

---

## Tech Stack

- **Runtime:** Bun
- **Backend:** TypeScript, Hono (HTTP + WebSocket), Drizzle ORM
- **Frontend:** React + Vite, Tailwind CSS + DaisyUI, factory-dark theme
- **Database:** better-sqlite3 (dev) / postgres.js (prod), Drizzle Kit migrations
- **Testing:** Vitest with workspace support
- **Linting:** Biome (lint + format)
- **Jobs:** BullMQ (Redis prod, in-memory dev)

---

## Monorepo Structure

```
packages/
  db/       — Drizzle schema, migrations, test utilities (createTestDb)
  server/   — Hono API routes, middleware, workers (createTestApp)
  web/      — React + Vite frontend, components, views
  fabric/   — Knowledge materialization, writeback, watcher
  shared/   — Shared types, constants, TOON codec
```

---

## Commands

```bash
bun install          # Install dependencies
bun dev              # Start server (3001) + web (5173) concurrently
bun test             # Run Vitest across all packages
bun run check        # TypeScript type check
bun run lint         # Biome lint + format check
bun run lint:fix     # Biome auto-fix
bun run db:generate  # Generate Drizzle migration
bun run db:migrate   # Apply migrations
```

---

## Coding Standards

### TypeScript
- Strict mode everywhere. No `any`, no `@ts-ignore`, no unsafe `as` casts.
- Explicit return types on all exported functions.
- Use workspace imports: `@hyperidle/db`, `@hyperidle/server`, `@hyperidle/shared`, etc.
- No barrel files except `packages/*/src/index.ts`.

### Naming
- `camelCase` for variables and functions
- `PascalCase` for types, interfaces, and React components
- `SCREAMING_SNAKE_CASE` for constants
- File names match their primary export

### Error Handling
- Use result types for expected errors (e.g., validation failures, not-found).
- Let unexpected errors propagate — don't swallow them with try-catch.
- Never use `console.log` for production code. Use the observability adapter.

### Database
- All queries through Drizzle ORM. Never raw SQL except in migration files.
- Use `createTestDb()` for test database instances.
- Schema defined in `packages/db/schema/`.

### API
- Hono routes in `packages/server/src/routes/`.
- Use `createTestApp()` for API integration tests.
- RESTful naming. Consistent error response format.

### Frontend
- Only the 19 custom components from `UI_DESIGN.md`. Use DaisyUI primitives directly — do not wrap them.
- Tailwind utility classes. factory-dark theme tokens.
- 8-12px padding default. Density over whitespace.
- Handle all states: empty, loading, error, populated.

### Testing
- Write tests first (TDD). Test file location: `packages/<pkg>/src/__tests__/<name>.test.ts`.
- Use `describe`/`it`/`expect` from Vitest.
- Test both success and error paths.
- Target: 80% unit coverage, integration tests for critical paths.

---

## Validation Checklist

Before considering any work complete, all three must pass:

1. `bun run check` — zero type errors
2. `bun run lint` — zero lint errors
3. `bun test` — all tests green

---

## Component Budget (UI)

**19 custom components only.** Any new component requires updating `UI_DESIGN.md` first.

- **Tier 1 (Primitives):** StatusChip, Tag, KeyValue, NavItem, SearchField
- **Tier 2 (Blocks):** ThreadRow, BetCard, PitchCard, TaskCard, KnowledgeRow, NotificationRow
- **Tier 3 (Regions):** IconRail, Submenu, Rail, ArtifactView, ReviewHeader, Canvas, Kanban, PitchSelector

---

## Workflow

The development loop:

1. **`/implement <story>`** — TDD workflow: understand → design (architect + adversary) → write tests → implement → validate → self-review
2. **`/simplify`** — Post-implementation cleanup: remove over-abstraction, dead code, AI slop
3. **`/slop-scan`** — Detect AI-specific code anti-patterns (verbose names, unnecessary comments, defensive over-engineering)
4. **`/review`** — Staff-level multi-perspective review (architect + designer + adversary + security-researcher). Auto-iterates on NEEDS WORK verdicts.
5. **`/ship`** — Stage, commit, push, create PR

Supporting skills:
- **`/verify`** — Quick validation (typecheck + lint + test) with auto-fix
- **`/threat-model`** — Security threat model for a feature or the full system
- **`/lore`** — Capture cross-cutting decisions as structured `@lore` comments

Work packages are defined in `WORK_PACKAGES.md`. Always read the acceptance criteria before starting a story.

---

## Git Conventions

- Branch naming: `<type>/<story-id>-<description>` (e.g., `feat/A1-project-scaffolding`)
- Commit messages: imperative mood, concise, reference story ID
- One logical change per commit
- Never force push to main
- Run validation checklist before committing
