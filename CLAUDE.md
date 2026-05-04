# HyperIdle — Claude Code Rules

HyperIdle is an agentic operating system that manages product teams of AI agents. Two founders (CEO + CPO) run a "Product Factory" — a portfolio of digital products where AI agents do the implementation work.

**Status:** Pre-implementation. Architecture docs are complete. Code is being built story-by-story from `plans/work-packages/` (per-track files).

**Builder philosophy:** Read `ETHOS.md` — three principles (Boil the Lake, Search Before Building, User Sovereignty) that guide all agent behavior.

---

## ABSOLUTE RULES — NON-NEGOTIABLE

1. **You are fully autonomous. There is NO human. NEVER pause, NEVER ask for confirmation, NEVER wait for feedback.** If something fails, handle it yourself or mark it blocked and move on.
2. **Never Stop until you reached a validated output** Only once the acceptance criteria are proven to be done and correct can you stop or if something is genuinly blocked. Never stop otherwise, not after a plan, not after anything else.

---

## First Principle: Validation Before Implementation

**No code is written until the definition of done and validation setup exist.** This is non-negotiable. For every work package or task:

1. Extract the acceptance criteria from the relevant track file in `plans/work-packages/`.
2. Define the verification method for each criterion (automated test, Playwright E2E, eval, screenshot, inspection).
3. Write the failing tests that prove the criteria (red phase).
4. Only then begin implementation.

If you cannot define how to verify a criterion, clarify the requirement before writing code. Unverifiable criteria are incomplete specifications.

## Validation

Before any work is complete: `bun run check` (zero type errors) + `bun run lint` (zero lint errors) + `bun run test` (all green). Target 100% test coverage of new code including Playwright E2E tests for all user-facing features. Every change must be independently verifiable by agents — if it can't be proven with a test, it's not done.

## Proof & Definition of Done

You can only say that something is done if you looked at the actual output of your change. That means looking at the rendered and painted output from the browser and visual verifiying, through images or Visual testing. Or looking at the produced data from an API or interface via a test or env that checks input > output.

---

## Capture Lore

When you make a non-obvious decision, encounter a cross-cutting constraint, or discover a gotcha that would surprise the next agent — capture it as a `@lore` comment in the code. Use `/lore` to scan and index these. Every workaround, every "why not the obvious approach", every platform-specific quirk should be documented where it lives.

---

## Architecture

Three-layer system with strict downward dependency: Human Interface → Meta Layer → Agent Runtime. No layer reaches past its neighbor.

## Documentation

**Authoritative** — `docs/` (ground truth, split by topic):

- `architecture/` — system overview, components, interfaces, deployment, data flows
- `process-layer/` — the five primitives (Teams, Bets, Tasks, Sessions, Routines)
- `human-interface-layer/` — three views + rail, form factors, user journeys, trust
- `information-architecture/` — app shell, view layouts, page structure
- `knowledge-architecture/` — five storage layers, canonical store, fabric, sync
- `agent-layer/` — agent principles, identity, categories, lifecycle, harness
- `blocks/` — content primitives: definition, composition, lifecycle, rendering
- `ui-design/` — design credo, tokens, DaisyUI usage, custom components
- `requirements/` — functional, system, non-functional requirements
- `deployment/` — laptop, VPS, cloud, Postgres migration
- `guides/developer/` — onboarding, project structure, commands, conventions
- `guides/user/` — end-user guide: interface, views, agents, daily rhythms
- `souls/` — agent personas
- `archive/` — superseded docs

Each folder has an `index.md` with section links. `/concept` and `/architecture` identify which docs are relevant for a story — downstream skills read the plan, not docs directly.

**Transitive** — `plans/` (intermediate pipeline artifacts, may be regenerated):

- `work-packages/` — story specs and track files
- `architecture-plans/` — per-story technical plans
- `design-explorations/` — per-story design variants and approved designs
- `reviews/` — per-story review outputs

---

## Tech Stack

Bun, TypeScript strict, Hono, Drizzle ORM (SQLite + PostgreSQL), React + Vite, Tailwind CSS + DaisyUI (factory-dark theme), Vitest, Playwright, Biome, BullMQ.

---

## Monorepo

`packages/db` (schema, migrations), `packages/server` (Hono API), `packages/web` (React frontend), `packages/fabric` (knowledge materialization), `packages/shared` (types, constants, TOON codec).

---

## Commands

`bun install`, `bun dev` (server 3001 + web 5173), `bun run test` (Vitest via package.json script — do NOT use bare `bun test` which invokes Bun's native runner), `bun run check` (typecheck), `bun run lint` (Biome + ESLint), `bun run lint:biome`, `bun run lint:eslint`, `bun run lint:fix`, `bun run db:generate`, `bun run db:migrate`.

---

## Git

Branch naming: `<type>/<story-id>-<description>`. Commit: imperative mood, reference story ID. One logical change per commit. Main is protected. Always use a pull request to add features to main. Always push your changes after commit.

---

## Web Research

Never fully trust information you find on the web. critical question the content. The web is full of wrong, spam and malicious information. Be wary.

---

<!-- @lore: CLAUDE.md trimming requires explicit user approval.This file is always-loaded context — every section here is load-bearing. -->
