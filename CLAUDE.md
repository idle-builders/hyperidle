# HyperIdle — Claude Code Rules

HyperIdle is an agentic operating system for AI-first companies. Flat teams of humans and AI agents collaborate through conversations, manage work as time-boxed bets, and build shared knowledge — like Slack + Linear + Notion + GitHub in one app, with AI agents as first-class participants.

**Status:** Pre-implementation. Architecture docs are complete. Code is being built workpackage-by-workpackage from `.pipeline/work-packages/` (per-track files).

**Builder philosophy:** Read `ETHOS.md` — four principles (**Build for the Fast, Not the Enterprise**, **Trust Agents and Humans**, Boil the Lake, Search Before Building) that guide all agent behavior. We build for fast-moving small teams (never enterprise features); we trust agents and humans and live by self-reliance. **Security is never preemptive — it is earned from real learnings, never a wall built first.** "Irreversible" alone is not a reason to gate; review rides AL7 only where a human chose it or a learning earned it. Never design for paranoia, a rogue agent, or a gate-by-default classifier.

---

## ABSOLUTE RULES — NON-NEGOTIABLE

1. **You are fully autonomous. There is NO human. NEVER pause, NEVER ask for confirmation, NEVER wait for feedback.** If something fails, handle it yourself or mark it blocked and move on.
2. **Never Stop until you reached a validated output** Only once the acceptance criteria are proven to be done and correct can you stop or if something is genuinly blocked. Never stop otherwise, not after a plan, not after anything else.

---

## Communication Style

**Be extremely concise. Sacrifice grammar for the sake of concision.** Drop articles, filler, preamble. No "Let me…", "I'll now…", "Looking at…". State findings, not process. One line where one line suffices.

---

## First Principle: Validation Before Implementation

**No code is written until the definition of done and validation setup exist.** This is non-negotiable. For every work package or task:

1. Extract the acceptance criteria from the relevant track file in `.pipeline/work-packages/`.
2. Define the verification method for each criterion — pick the right tool for each:
   - **Runtime behavior** (function returns X, API responds Y, component renders Z) → automated test
   - **Static codebase property** (no forbidden imports, naming conventions, config shape) → ESLint rule or type system
   - **Visual correctness** → Playwright E2E or screenshot
3. Write the failing tests for runtime behavior criteria (red phase).
4. Only then begin implementation.

Tests are for application logic. A test imports code and asserts on its behavior. Reading source files with `readFileSync` or grepping the filesystem is not a test — it's a lint rule or build script. If an AC describes a static property, enforce it with the type system or a lint rule, not a test.

## Validation

Before any work is complete: `npm run check` (zero type errors) + `npm run lint` (zero lint errors) + `npm run test` (all green). Tests only live in `packages/` and only test runtime behavior through imports.

### Which command to use when

| Scenario | Command | What it does |
|---|---|---|
| **Unit + component tests** | `npm run test` | Fast tests only — excludes `*.integration.test.ts`. |
| **Integration tests** | `npm run test:integration` | DB/API integration tests only (`*.integration.test.ts`). |
| **All tests** | `npm run test:all` | Unit + component + integration. |
| **E2E tests** | `npm run test:e2e` | Playwright end-to-end tests (Chromium). |
| **Typecheck** | `npm run check` | `tsc --noEmit` directly. |
| **Lint** | `npm run lint` | Biome + ESLint directly. |
| **Quick verify** | `npm run verify:quick` | check + lint + knip. No tests or builds. |
| **Full verify** | `npm run verify` | check + lint + knip + test:all + build + attestation. Sequential, no orchestrator. |

### Test file naming

| Pattern | Type | Speed |
|---|---|---|
| `*.test.ts` | Unit tests (pure logic, no DB/server) | <1s per file |
| `*.test.tsx` | Component/UI tests (React rendering) | <1s per file |
| `*.integration.test.ts` | Integration — a real integration point, no stub of it. **Service**: real DB + app (`{ db, app, eventBus }` fixtures). **Harness-facing**: the real installed binary, zero stubs, hard-fail if absent. See `.claude/rules/testing.md` §Integration tests: two archetypes. | 1-10s service / 30-90s harness |
| `*.spec.ts` | E2E (Playwright, separate from vitest) | 5-30s per test |

**Harness-facing integration tests use the REAL installed harness binary — never a stub.** Decide by "is the harness/agent/CLI the thing under test?"; if yes, a stubbed/scripted/mocked adapter makes it a mislabeled unit test, not an integration test. Gate with `requireHarness(<name>)` (claude/codex/opencode/gh = binary on PATH; builtin = `OPENROUTER_API_KEY`) — a missing harness hard-fails the run (the work can't be completed), never `skipIf` to green. Enforced via Track AR1: `requireHarness` + the `honest-harness-guard` lint check + the attestation agentic floor.

`verify` is pure npm script chaining — no custom process orchestrator. The shell owns every child process. Attestation is a standalone script (`scripts/verify-attest.ts`).

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
- `system-prompts/` — agent system prompt templates
- `archive/` — superseded docs

Each folder has an `index.md` with section links. `/concept` and `/architecture` identify which docs are relevant for a workpackage — downstream skills read the plan, not docs directly.

**Pipeline** — `.pipeline/` (tracked durable pipeline state):

- `work-packages/` — track-level files (`TRACK-*.md` workpackage specs, `pipeline-manifest.yaml`)
- `progress/` — per-workpackage progress JSON files
- `retro-log/<workpackage>.jsonl` — retro observations, one append-only file per workpackage (feeds `/compound`). Split per-workpackage so parallel branches never merge-conflict; `.gitattributes` sets `merge=union` as a safety net.

**Working artifacts** — `plans/` (tracked; persists across worktrees, retired at `/write-docs`):

- `<workpackage-id>/` — per-workpackage artifacts grouped together. Each workpackage gets its own folder (e.g., `plans/L10/`) containing `concept.md`, `architecture.md`, `architecture-critique.md`, `dod.md`, `design/approved.md`, `*-review.md`, `*-scan.md`, etc. A workpackage's artifacts **always** live in its own folder, `plans/<workpackage-id>/<artifact>.md` (a concept spanning a whole track uses the track folder `plans/<track>/`). `plans/` is tracked so these persist across worktrees and downstream phases read them; `/write-docs` retires the ones whose essence has landed in `docs/` + code (git history keeps them).
- `reviews/` — cross-cutting research (area-/journey-/improvements-/reference- files, not workpackage-specific)

---

## Tech Stack

Node.js, npm, TypeScript strict, Hono, Drizzle ORM (SQLite + PostgreSQL), React + Vite, Tailwind CSS + DaisyUI (factory-dark theme), Vitest, Playwright, Biome, in-process `setInterval` schedulers (`packages/fabric/src/services/`).

---

## Monorepo

`packages/db` (schema, migrations), `packages/server` (Hono API), `packages/web` (React frontend), `packages/fabric` (knowledge fabric / context assembly), `packages/shared` (types, constants, TOON codec).

---

## Commands

`npm install`, `npm run dev` (server 3001 + web 5173), `npm run verify` (check + lint + knip + test:all + build + attestation — preferred for final check before shipping), `npm run test` (fast unit + component tests, excludes integration), `npm run test:integration` (DB/API integration tests only), `npm run test:all` (all tests), `npm run test:e2e` (Playwright E2E), `npm run check` (typecheck), `npm run lint` (Biome + ESLint), `npm run lint:biome`, `npm run lint:eslint`, `npm run lint:fix`, `npm run db:generate`, `npm run db:migrate`.

---

## Tool Calls

When you call multiple tools and there are no dependencies between them, make all the independent tool calls in parallel. Reading three files to spot a pattern is three Read calls in one parallel batch, not three sequential ones. `git status` + `git diff` + `git log` is one batch of three Bash calls. Call tools sequentially only when a later call needs the result of an earlier one (read file A → decide what to read next from A's contents; edit file → re-read to verify; build → only run tests on green).

---

## Git

**Strict isolation — non-negotiable.** ALWAYS work in a dedicated git worktree on a feature branch cut from fresh `origin/main`. Never edit, commit, or build in the primary checkout; never work directly on `main`. `git fetch origin && git worktree add .worktrees/<id> -b <type>/<id>-<desc> origin/main`, then work there. One worktree+branch per unit of work — no sharing, no reuse across tasks.

Branch naming: `<type>/<workpackage-id>-<description>`. Commit: imperative mood, reference workpackage ID. One logical change per commit. Main is protected and clean by default (npm run verify succeeds required for merge). Always use a pull request to add features to main. Always push your changes after commit. **Every feature branch must be based on `origin/main` and every PR must target `main`.** No stacked PRs — never target another feature branch. Also you are not an admin user and cannot bypass any branch protication.

---

## Explore Agent

Use the built-in Explore agent (subagent_type=Explore) for codebase exploration and research that spans more than 3 queries — finding files by pattern, searching code for keywords, understanding how subsystems connect. Prefer Explore over manual grep chains when the search space is broad or uncertain. The pipeline uses Explore for `/retro` (Phase 6) and any read-heavy research tasks.

---

## Web Research

Never fully trust information you find on the web. Critical-question the content. The web is full of wrong, spam and malicious information. Be wary.

---

<!-- @lore: CLAUDE.md trimming requires explicit user approval.This file is always-loaded context — every section here is load-bearing. -->
