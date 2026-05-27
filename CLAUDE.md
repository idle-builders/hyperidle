# HyperIdle — Claude Code Rules

HyperIdle is an agentic operating system for AI-first companies. Flat teams of humans and AI agents collaborate through conversations, manage work as time-boxed bets, and build shared knowledge — like Slack + Linear + Notion + GitHub in one app, with AI agents as first-class participants.

**Status:** Pre-implementation. Architecture docs are complete. Code is being built workpackage-by-workpackage from `plans/work-packages/` (per-track files).

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

Before any work is complete: `npm run check` (zero type errors) + `npm run lint` (zero lint errors) + `npm run test` (all green). Target 100% test coverage of new code including Playwright E2E tests for all user-facing features. Every change must be independently verifiable by agents — if it can't be proven with a test, it's not done.

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

Each folder has an `index.md` with section links. `/concept` and `/architecture` identify which docs are relevant for a workpackage — downstream skills read the plan, not docs directly.

**Transitive** — `plans/` (intermediate pipeline artifacts, may be regenerated):

- `work-packages/` — track-level files (`TRACK-*.md` workpackage specs, `WORK_PACKAGES.md`, `dependency-graph.md`, `pipeline-manifest.yaml`, `follow-ups.md`)
- `<workpackage-id>/` — per-workpackage artifacts grouped together. Each workpackage gets its own folder (e.g., `plans/L10/`) containing `concept.md`, `architecture.md`, `architecture-critique.md`, `dod.md`, `design/approved.md`, `*-review.md`, `*-scan.md`, etc. Skills write artifacts to `plans/<workpackage-id>/<artifact>.md`.
- `reviews/` — cross-cutting research (area-/journey-/improvements-/reference- files, not workpackage-specific)

---

## Tech Stack

Node.js, npm, TypeScript strict, Hono, Drizzle ORM (SQLite + PostgreSQL), React + Vite, Tailwind CSS + DaisyUI (factory-dark theme), Vitest, Playwright, Biome, BullMQ.

---

## Monorepo

`packages/db` (schema, migrations), `packages/server` (Hono API), `packages/web` (React frontend), `packages/fabric` (knowledge materialization), `packages/shared` (types, constants, TOON codec).

---

## Commands

`npm install`, `npm run dev` (server 3001 + web 5173), `npm run verify` (orchestrated check + lint + test in one summary — preferred for completion checks), `npm run test` (Vitest), `npm run check` (typecheck), `npm run lint` (Biome + ESLint), `npm run lint:biome`, `npm run lint:eslint`, `npm run lint:fix`, `npm run db:generate`, `npm run db:migrate`.

---

## Tool Calls

When you call multiple tools and there are no dependencies between them, make all the independent tool calls in parallel. Reading three files to spot a pattern is three Read calls in one parallel batch, not three sequential ones. `git status` + `git diff` + `git log` is one batch of three Bash calls. Call tools sequentially only when a later call needs the result of an earlier one (read file A → decide what to read next from A's contents; edit file → re-read to verify; build → only run tests on green).

---

## Git

Branch naming: `<type>/<workpackage-id>-<description>`. Commit: imperative mood, reference workpackage ID. One logical change per commit. Main is protected and clean by default (npm run verify succeeds required for merge). Always use a pull request to add features to main. Always push your changes after commit. **Every feature branch must be based on `origin/main` and every PR must target `main`.** No stacked PRs — never target another feature branch. Also you are not an admin user and cannot bypass any branch protication.

---

## Explore Agent

Use the built-in Explore agent (subagent_type=Explore) for codebase exploration and research that spans more than 3 queries — finding files by pattern, searching code for keywords, understanding how subsystems connect. Prefer Explore over manual grep chains when the search space is broad or uncertain. The pipeline uses Explore for `/retro` (Phase 5) and any read-heavy research tasks.

---

## Web Research

Never fully trust information you find on the web. Critical-question the content. The web is full of wrong, spam and malicious information. Be wary.

---

<!-- @lore: CLAUDE.md trimming requires explicit user approval.This file is always-loaded context — every section here is load-bearing. -->
