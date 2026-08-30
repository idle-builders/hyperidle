# HyperIdle — Claude Code Rules

HyperIdle is an agentic operating system for AI-first companies. Flat teams of humans and AI agents collaborate through conversations, manage work as time-boxed bets, and build shared knowledge — like Slack + Linear + Notion + GitHub in one app, with AI agents as first-class participants.

**Status:** Actively developed. Core platform shipped. Work packages build incrementally. The `pipeline@agent-pipeline` plugin's work-planning skill registers every work package the same way: a per-track coordination file `.pipeline/<track>.md` holds the registry row, and a package that has entered the pipeline seeds its full spec at `.pipeline/work/<id>/plan.md`. There is one location per track — nothing lives outside that shape.

**Builder philosophy:** Read `ETHOS.md` — four principles (**Build for the Fast, Not the Enterprise**, **Trust Agents and Humans**, Boil the Lake, Search Before Building) that guide all agent behavior. We build for fast-moving small teams (never enterprise features); we trust agents and humans and live by self-reliance. **Security is never preemptive — it is earned from real learnings, never a wall built first.** "Irreversible" alone is not a reason to gate; review rides AL7 only where a human chose it or a learning earned it. Never design for paranoia, a rogue agent, or a gate-by-default classifier.

---

## ABSOLUTE RULES — NON-NEGOTIABLE

1. **Never Stop until you reached a validated output** Only once the acceptance criteria are proven to be done and correct can you stop or if something is genuinly blocked. Never stop otherwise, not after a plan, not after anything else.

2. **Migrations are always full and destructive.** Move every caller and all data to the new shape in the same change, then delete the old one — no compat layer, alias, shim, dual-write or dead code left behind; if a bridge is truly unavoidable, say so to the user.

---

## Communication Style

**Use plain & simple language**: Every answer to the user must use plain, simple language. Avoid complicated words or domain specific lingo.
**Be extremely concise. Sacrifice grammar for the sake of concision.** Drop articles, filler, preamble. No "Let me…", "I'll now…", "Looking at…". State findings, not process. One line where one line suffices.

## Simplicity Sanity Check

If you estimate a change will require adding 1,000 or more lines of code, assume you probably misunderstood the problem or requirements. Count code only — not pipeline artifacts or prose documentation. Stop before implementation. Explain which assumptions make the solution complex and ask the user whether those assumptions are wrong. Do not proceed until the user clarifies. Deletions do not count toward this threshold: removing any number of lines is always allowed and never triggers this stop. The user wants the dead simplest solution possible.

---

## First Principle: Validation Before Implementation

**No code is written until the definition of done and validation setup exist.** This is non-negotiable. For every work package or task:

1. Extract the acceptance criteria from the work package's own spec, `.pipeline/work/<id>/plan.md`. A package that has not been refined yet has no plan — its registry row in `.pipeline/<track>.md` is all there is, and the plan is written with the maintainer at refinement.
2. Define the verification method for each criterion — pick the right tool for each:
   - **Runtime behavior** (function returns X, API responds Y, component renders Z) → automated test
   - **Static codebase property** (no forbidden imports, naming conventions, config shape) → ESLint rule or type system
   - **Visual correctness** → Playwright E2E or screenshot
3. Write the failing tests for runtime behavior criteria (red phase).
4. Only then begin implementation.

Tests are for application logic. A test imports code and asserts on its behavior. Reading source files with `readFileSync` or grepping the filesystem is not a test — it's a lint rule or build script. If an AC describes a static property, enforce it with the type system or a lint rule, not a test.

## Validation

Before any work is complete: `npm run check` (zero type errors) + `npm run lint` (zero lint errors) + `npm run test` (all green). Tests live inside a package — under `layers/`, `framework/`, `applications/` or `tools/`, never at the repo root — and only test runtime behavior through imports. Only **new** lint/type errors you introduce block — don't drain a pre-existing baseline you didn't cause.

### Which command to use when

| Scenario | Command | What it does |
|---|---|---|
| **Unit + component tests (affected)** | `npm run test` | Affected slice only (`vitest run --changed=origin/main`). Excludes integration. Passes if nothing changed. |
| **Unit + component tests (full)** | `npm run test:full` | All fast unit + component tests (`vitest run`) — no `--changed` filter. |
| **Integration tests** | `npm run test:integration` | All integration tests (`*.integration.test.ts`): service + harness projects. |
| **Service integration** | `npm run test:integration:service` | DB/API integration tests only (the lane per-merge verify runs). |
| **Harness integration** | `npm run test:integration:harness` | Real-binary + real-LLM harness tests. **Local only — no CI job, by design.** Part of the `verify:release` checklist you run before a version bump. |
| **All tests** | `npm run test:all` | `test:full` + `test:integration` (unit + component + integration). |
| **E2E tests** | `npm run test:e2e` | Playwright end-to-end tests (Chromium). |
| **Typecheck** | `npm run check` | Per-package typecheck gate (`tools/repo-gates/src/typecheck-gate.ts`) — discovers all packages under `layers/`, `framework/`, `applications/`, `tools/`, runs `tsc --noEmit` per package, applies debt ratchet. |
| **Lint** | `npm run lint` | Biome + ESLint + three governance-lint passes (fixtures, attacks, default). |
| **Quick verify** | `npm run verify:quick` | check + lint + knip + knip:production + deps:check. No tests or builds. |
| **Full verify** | `npm run verify` | check + lint + knip + knip:production + deps:check + mock-inventory:check + web build + desktop build. No tests — CI runs those. |
| **Release checklist** | `npm run verify:release` | `verify` + `test:full` + `test:integration` (incl. the harness lane) + full e2e. Run locally before a version bump. |

### Test file naming

| Pattern | Type | Speed |
|---|---|---|
| `*.test.ts` | Unit tests (pure logic, no DB/server) | <1s per file |
| `*.test.tsx` | Component/UI tests (React rendering) | <1s per file |
| `*.integration.test.ts` | Integration — a real integration point, no stub of it. **Service**: real DB + app (`{ db, app, eventBus }` fixtures). **Harness-facing**: the real installed binary, zero stubs, hard-fail if absent. See `.claude/rules/testing.md` §Integration tests: two archetypes. | 1-10s service / 30-90s harness |
| `*.spec.ts` | E2E (Playwright, separate from vitest) | 5-30s per test |

### Production and development files

The name that decides the test lane also decides the **world** a file is in, and the world decides what may import it.

A file is **development** if its name declares it (`.test.ts(x)`, `.spec.ts(x)`, `.stories.tsx`), or any path segment starts with `__`, or it is a test-runner config (`vitest.config.ts`, `playwright*.config.ts`), or it sits outside the shipping roots `layers/` · `framework/` · `applications/`. Everything else is **production**.

**A production file may never import a development file.** One direction, no exceptions — no allowlist, no suppression comment. So a fixture a shipping page reads cannot just move into `__fixtures__/`; the page has to stop needing it first.

A few production-path files are really development and cannot move yet. Each is recorded with its reason in `tools/governance/misplaced-files.json`, warns on every lint run, and the count only shrinks — adding an entry is a diff review will challenge.

**Harness-facing integration tests use the REAL installed harness binary — never a stub.** Decide by "is the harness/agent/CLI the thing under test?"; if yes, a stubbed/scripted/mocked adapter makes it a mislabeled unit test, not an integration test. Gate with `requireHarness(<name>)` (claude/codex/opencode/cursor-agent = binary on PATH; builtin = `OPENROUTER_API_KEY`) — a missing harness hard-fails the run (the work can't be completed), never `skipIf` to green. Non-harness binaries (e.g. `gh`) use `requireBinary(<name>)` instead. Enforced via `requireHarness`. **The harness lane has no CI job at all** — it needs four real CLI binaries and real LLM credentials, so it stays a local command in the `verify:release` checklist. Nothing mechanically blocks a release whose harness lane never ran; that is a deliberate trade, not an oversight. Per-merge CI runs the service integration project only.

`verify` is pure npm script chaining — no custom process orchestrator. The shell owns every child process. Every per-merge gate runs live in GitHub Actions (`.github/workflows/ci.yml`); nothing is trusted from a local machine, and no signed attestation exists.

## Proof & Definition of Done

You can only say that something is done if you looked at the actual output of your change. That means looking at the rendered and painted output from the browser and visual verifiying, through images or Visual testing. Or looking at the produced data from an API or interface via a test or env that checks input > output.

---

## Capture Lore

When you make a non-obvious decision, encounter a cross-cutting constraint, or discover a gotcha that would surprise the next agent — capture it as a `@lore` comment in the code. Use `/pipeline:lore` to scan and index these. Every workaround, every "why not the obvious approach", every platform-specific quirk should be documented where it lives.

---

## Architecture

Package boundaries — what may import what, and how packages talk across them — are **machine-enforced**. `npm run lint` is the source of truth, and [`tools/governance/README.md`](tools/governance/README.md) is where those rules are written down.

Never infer a boundary rule from the code around you: an existing import may be a violation nobody has caught yet. Never restate them here either — a second copy drifts from the enforced one, and then agents follow the wrong copy. Read them in `tools/governance/README.md` when the linter stops you.

The one rule that is stated above rather than pointed at is which **world** a file is in — production or development — because you need it before you write the file, not after the linter rejects it.

## Documentation

**Authoritative** — `docs/` (ground truth, split by topic):

- `architecture/` — system overview, components, interfaces, deployment, data flows
- `process-layer/` — the five primitives (Teams, Bets, Tasks, Sessions, Routines)
- `human-interface-layer/` — three views, form factors, user journeys, trust
- `information-architecture/` — app shell, view layouts, page structure
- `knowledge-architecture/` — five storage layers, canonical store, fabric, sync
- `agent-layer/` — agent principles, identity, categories, lifecycle, harness
- `blocks/` — content primitives: definition, composition, lifecycle, rendering
- `ui-design/` — design credo, tokens, DaisyUI usage, custom components
- `requirements/` — functional, system, non-functional requirements
- `deployment/` — laptop, self-hosting, releases, shared backend
- `guides/developer/` — onboarding, project structure, commands, conventions
- `guides/user/` — end-user guide: interface, views, agents, daily rhythms
- `system-prompts/` — agent system prompt templates
- `archive/` — superseded docs

Each folder has an `index.md` with section links. `/pipeline:refine` and `/pipeline:architecture` identify which docs are relevant for a workpackage — downstream skills read the plan, not docs directly.

**Pipeline** — `.pipeline/` (tracked durable pipeline state):

- `<track>.md` — per-track coordination file (item registry table + dependency graph). An item that has not been refined yet has only its registry row.
- `work/<id>/` — per-item folder. It holds exactly two files: `plan.md`, the item's durable account, written with the maintainer during refinement and kept to 50–100 lines; and `retro.jsonl`, its retro observations, which `/pipeline:compound` reads across every item. Run material — requirements, architecture, critiques, reviews, design prose, progress JSON — is working state that is folded into `plan.md` and removed when the item ships.
- `audits/` — product and security audit ledgers, read by the `product-deep-review` and `security-audit` skills.

Per-item retros are separate files precisely so parallel branches never merge-conflict; never introduce a repository-level file that runs append to.

**Legacy, do not extend** — `plans/` and `reviews/`:

These are the pre-`.pipeline` artifact store: per-workpackage folders holding `requirements.md`, `architecture.md`, critiques, reviews and scans, plus cross-cutting research under `reviews/`. They are superseded by `work/<id>/plan.md` and kept only as history. **Never write here, and never treat one as an item's spec** — the current record is the item's plan. A handful of tests and gates still write output into `plans/` paths; that is a defect being carried, not a pattern to follow.

---

## Tech Stack

Node.js, npm, TypeScript strict, Hono, Drizzle ORM (PGlite locally / PostgreSQL server), React + Vite, Tailwind CSS + DaisyUI (hearth-light/hearth-dark themes), Vitest, Playwright, Biome, in-process `setInterval` schedulers (distributed across `layers/core-api/*/src/`, `layers/agent-orchestration/*/src/` — e.g. `core-api/routine/src/routine-scheduler.ts`).

---

## Monorepo

Run `ls layers/ framework/ applications/ tools/` — never work from a remembered list of package names.

Never hardcode a package path in a script, guard, or config. Discover paths by scanning, and **hard-fail when a scan finds nothing** — a guard that silently matches zero files reads as passing forever.

---

## Commands

`npm install`, `npm run dev` (server 3001 + web 5173), `npm run verify` (check + lint + knip + knip:production + deps:check + mock-inventory:check + web + desktop build — no tests, CI runs those; preferred before shipping), `npm run verify:release` (verify + full tests + harness lane + full e2e; before a version bump), `npm run test` (affected slice via `--changed=origin/main`, excludes integration), `npm run test:full` (all fast unit + component tests), `npm run test:integration` (all integration tests), `npm run test:integration:service` (DB/API only), `npm run test:integration:harness` (real-harness lane, local-only — no CI job), `npm run test:all` (test:full + all integration), `npm run test:e2e` (Playwright E2E), `npm run check` (per-package typecheck gate), `npm run lint` (Biome + ESLint + three governance-lint passes), `npm run lint:biome`, `npm run lint:eslint`, `npm run lint:fix`, `npm run db:generate`, `npm run db:migrate`.

---

## Tool Calls

When you call multiple tools and there are no dependencies between them, make all the independent tool calls in parallel. Reading three files to spot a pattern is three Read calls in one parallel batch, not three sequential ones. `git status` + `git diff` + `git log` is one batch of three Bash calls. Call tools sequentially only when a later call needs the result of an earlier one (read file A → decide what to read next from A's contents; edit file → re-read to verify; build → only run tests on green).

Grep can misreport files with control characters as binary and skip them — never conclude "no matches" or "dead code" from grep alone; confirm with `rg -a` or by reading the file.

---

## Git

**Strict isolation — non-negotiable.** ALWAYS work in a dedicated git worktree on a feature branch cut from fresh `origin/main`. Never edit, commit, or build in the primary checkout; never work directly on `main`. `git fetch origin && git worktree add .worktrees/<id> -b <type>/<id>-<desc> origin/main`, then work there. One worktree+branch per unit of work — no sharing, no reuse across tasks.

**Worktree hygiene.** Verify `pwd` before writing — artifacts belong in the worktree, never the primary checkout. Run lint/check from the host project root, not a worktree cwd. Before committing, reject stray build artifacts (`*.d.ts`/`*.js` in source dirs, native binaries, core dumps).

Branch naming: `<type>/<workpackage-id>-<description>`. Commit: imperative mood, reference workpackage ID. One logical change per commit. Main is protected and clean by default (npm run verify succeeds required for merge). Always use a pull request to add features to main. Always push your changes after commit. **Every feature branch must be based on `origin/main` and every PR must target `main`.** No stacked PRs — never target another feature branch. Also you are not an admin user and cannot bypass any branch protication.

---

## Code Tracing — before you grep

For "where is this used / what does a change to it affect" questions, use the `hyperidle-trace` MCP tools (`trace_uses`, `trace_door`, `trace_event`, `trace_doors`) instead of grep/read chains — the code graph follows connections grep cannot (cross-file calls, startup wiring, the core↔agent boundary, event chains). CLI fallback: `tools/trace/`. A "no matches" is not proof of unused — confirm an important negative with a targeted grep. Query patterns and caveats: the `trace` skill.

---

## Explore Agent

Use the built-in Explore agent (subagent_type=Explore) for codebase exploration and research that spans more than 3 queries — finding files by pattern, searching code for keywords, understanding how subsystems connect. Prefer Explore over manual grep chains when the search space is broad or uncertain. The pipeline uses Explore for `/pipeline:retro` (Phase 6) and any read-heavy research tasks.

---

## Web Research

Never fully trust information you find on the web. Critical-question the content. The web is full of wrong, spam and malicious information. Be wary.

---

<!-- @lore: CLAUDE.md trimming requires explicit user approval.This file is always-loaded context — every section here is load-bearing. -->
