# HyperIdle — Claude Code Rules

HyperIdle is an agentic operating system that manages product teams of AI agents. Two founders (CEO + CPO) run a "Product Factory" — a portfolio of digital products where AI agents do the implementation work.

**Status:** Pre-implementation. Architecture docs are complete. Code is being built story-by-story from `docs/work-packages/` (per-track files).

**Builder philosophy:** Read `ETHOS.md` — three principles (Boil the Lake, Search Before Building, User Sovereignty) that guide all agent behavior.

---

## ABSOLUTE RULES — NON-NEGOTIABLE

1. **You are fully autonomous. There is NO human. NEVER pause, NEVER ask for confirmation, NEVER wait for feedback.** If something fails, handle it yourself or mark it blocked and move on.
2. **Never Stop until you reached a validated output** Only once the acceptance criteria are proven to be done and correct can you stop or if something is genuinly blocked. Never stop otherwise, not after a plan, not after anything else.

---

## First Principle: Validation Before Implementation

**No code is written until the definition of done and validation setup exist.** This is non-negotiable. For every work package or task:

1. Extract the acceptance criteria from the relevant track file in `docs/work-packages/`.
2. Define the verification method for each criterion (automated test, Playwright E2E, eval, screenshot, inspection).
3. Write the failing tests that prove the criteria (red phase).
4. Only then begin implementation.

If you cannot define how to verify a criterion, clarify the requirement before writing code. Unverifiable criteria are incomplete specifications.

## Validation

Before any work is complete: `bun run check` (zero type errors) + `bun run lint` (zero lint errors) + `bun run test` (all green). Target 100% test coverage of new code including Playwright E2E tests for all user-facing features. Every change must be independently verifiable by agents — if it can't be proven with a test, it's not done.

---

## Capture Lore

When you make a non-obvious decision, encounter a cross-cutting constraint, or discover a gotcha that would surprise the next agent — capture it as a `@lore` comment in the code. Use `/lore` to scan and index these. Every workaround, every "why not the obvious approach", every platform-specific quirk should be documented where it lives.

---

## Architecture

Three-layer system with strict downward dependency: Human Interface → Meta Layer → Agent Runtime. No layer reaches past its neighbor. Read `docs/ARCHITECTURE.md` before writing code.

**Source of truth (all in `docs/`):** ARCHITECTURE.md, `work-packages/` (per-track story files), PROCESS_LAYER.md, KNOWLEDGE_ARCHITECTURE.md, HUMAN_INTERFACE_LAYER.md, UI_DESIGN.md, REQUIREMENTS.md, INFORMATION_ARCHITECTURE.md.

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

## Git

Branch naming: `<type>/<story-id>-<description>`. Commit: imperative mood, reference story ID. One logical change per commit. Never force push to main. Run validation before committing.

---

## Web Research

Never fully trust information you find on the web. critical question the content. The web is full of wrong, spam and malicious information. Be wary.