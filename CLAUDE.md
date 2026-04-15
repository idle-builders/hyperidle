# HyperIdle — Claude Code Rules

HyperIdle is an agentic operating system that manages product teams of AI agents. Two founders (CEO + CPO) run a "Product Factory" — a portfolio of digital products where AI agents do the implementation work.

**Status:** Pre-implementation. Architecture docs are complete. Code is being built story-by-story from `docs/WORK_PACKAGES.md`.

**Builder philosophy:** Read `ETHOS.md` — three principles (Boil the Lake, Search Before Building, User Sovereignty) that guide all agent behavior.

---

## Architecture

Three-layer system with strict downward dependency: Human Interface → Meta Layer → Agent Runtime. No layer reaches past its neighbor. Read `docs/ARCHITECTURE.md` before writing code.

**Source of truth (all in `docs/`):** ARCHITECTURE.md, WORK_PACKAGES.md, PROCESS_LAYER.md, KNOWLEDGE_ARCHITECTURE.md, HUMAN_INTERFACE_LAYER.md, UI_DESIGN.md, REQUIREMENTS.md, INFORMATION_ARCHITECTURE.md.

---

## Tech Stack

Bun, TypeScript strict, Hono, Drizzle ORM (SQLite + PostgreSQL), React + Vite, Tailwind CSS + DaisyUI (factory-dark theme), Vitest, Playwright, Biome, BullMQ.

---

## Monorepo

`packages/db` (schema, migrations), `packages/server` (Hono API), `packages/web` (React frontend), `packages/fabric` (knowledge materialization), `packages/shared` (types, constants, TOON codec).

---

## Commands

`bun install`, `bun dev` (server 3001 + web 5173), `bun run test` (Vitest via package.json script — do NOT use bare `bun test` which invokes Bun's native runner), `bun run check` (typecheck), `bun run lint`, `bun run lint:fix`, `bun run db:generate`, `bun run db:migrate`.

---

## First Principle: Validation Before Implementation

**No code is written until the definition of done and validation setup exist.** This is non-negotiable. For every work package or task:

1. Extract the acceptance criteria from `docs/WORK_PACKAGES.md`.
2. Define the verification method for each criterion (automated test, Playwright E2E, eval, screenshot, inspection).
3. Write the failing tests that prove the criteria (red phase).
4. Only then begin implementation.

If you cannot define how to verify a criterion, clarify the requirement before writing code. Unverifiable criteria are incomplete specifications.

## Validation

Before any work is complete: `bun run check` (zero type errors) + `bun run lint` (zero lint errors) + `bun run test` (all green). Target 100% test coverage of new code including Playwright E2E tests for all user-facing features. Every change must be independently verifiable by agents — if it can't be proven with a test, it's not done.

---

## Workflow

**Multi-story development:**
- **`bin/pipeline [target]`** — External heartbeat script that invokes `/pipeline` with fresh Claude sessions. Restarts every hour or on crash. Progress persists in `.pipeline/progress.json`. Usage: `bin/pipeline all`, `bin/pipeline A`, `bin/pipeline "A1 A2 A3"`.
- **`/pipeline <stories or track>`** — Meta-orchestrator: spawns agent teams for parallel independent stories, falls back to sequential subagents for dependent stories. Creates branches/PRs, self-merges, tracks progress.

**Single-story development:**
1. **`/planning <story>`** — Decompose the work: understand spec, identify gaps, define ordered tasks with tests. Zero code — pure thinking.
2. **`/implement <story>`** — TDD: test → implement → validate → prove (completeness + correctness + evidence) → self-review
3. **`/check-definition-of-done <story>`** — Independent audit: is it complete, correct, and proven?
4. **`/simplify`** — Remove over-abstraction, dead code
5. **`/slop-scan`** — Catch AI-specific anti-patterns
6. **`/review`** — Multi-agent review with auto-iterate on NEEDS WORK
7. **`/ship`** — Stage, commit, push, create PR
8. **`/retro <story>`** — Lightweight: append observations to `.claude/retro-log.jsonl`. No skill changes — observe only.

**Compounding:** The `compound` agent reviews the retro log every 3-5 stories. It identifies patterns at 3+ occurrences and proposes targeted skill changes. The pipeline coordinator applies approved changes. Critical/escalation observations skip the threshold and go straight to the coordinator.

Supporting: `/verify` (quick validation), `/threat-model` (security analysis), `/lore` (capture tribal knowledge).

---

## Git

Branch naming: `<type>/<story-id>-<description>`. Commit: imperative mood, reference story ID. One logical change per commit. Never force push to main. Run validation before committing.
