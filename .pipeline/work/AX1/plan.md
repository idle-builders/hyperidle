# AX1 — Lived-in demo world seeded at database creation

## Work package

**Outcome.** A fresh HyperIdle instance — dev PGlite, desktop first-run, or Postgres — can be filled at creation time with a coherent, lived-in world: a small team (humans and agents) mid-flight on real work, with bets across their full lifecycle, threads carrying real reviews and verdicts, a knowledge corpus that grew out of completed work, sessions and routines with history, and notifications waiting. Anyone opening the app sees a product that has been used for weeks by a couple of people and agents — every major surface has something to look at and work with.

**Why this matters.** Founder, verbatim: *"Currently testing our application and improving the UI is really hard because there is nothing in there to see."* Every UI change today is judged against an empty shell — empty states everywhere, no reviews to act on, no knowledge to browse, no bet history to navigate — so UI iteration is slow and blind, and the product cannot be demoed at all. Beneficiaries: the founder and every agent doing UI/product work, plus anyone the product is shown to. Cost of not doing it: UI quality decisions keep being made against empty surfaces, and the product story stays untellable in the product itself.

**What exists today.** `tools/setup/src/demo-fixture.ts` seeds a skeleton behind `npm run setup -- --demo`: team Acme, human founder, the founder's assistant, a builder and a PM agent, one draft bet with one task, one silent routine. Zero conversations, zero knowledge beyond the single factory principle item, zero artifacts, zero sessions, zero notifications. Factory bootstrap (every boot) adds the five facilitators, the system agent, and one knowledge seed. `tools/eval/src/seeding.ts` has composable per-entity seed helpers (eval-only), and `layers/core-ui/src/fixtures/knowledge-data.ts` carries example knowledge content. Desktop first-run migrates + factory-bootstraps the embedded PGlite but has no demo path; AF17 lore forbids demo data on production boot paths.

**Missing delta.** Two gaps. (1) Content: the skeleton has no lived-in substance — no bet history, no threads/messages, no knowledge corpus, no sessions, no run history, no notifications. (2) Reach: demo seeding only happens via the dev setup CLI; a fresh desktop instance cannot opt into it at DB creation.

**Founder-settled decisions (2026-08-11, do not relitigate in later phases):**

- Trigger: dev `npm run setup -- --demo` AND desktop first-run opt-in. The AF17 bend is explicitly approved by the founder for this WP: opt-in flag at DB creation, never silent, never on a non-demo instance's normal boot.
- Fake active sessions are included (live dots with dead streams are acceptable for demo purposes).
- Full richness: roughly 40 knowledge items, ~15 threads / ~150 messages, 6–8 bets, ~30 tasks, ~50 sessions, routines with run history. Data lives in fixture files; the seeder stays thin.
- Extend the existing Acme world — keep the existing `demo-*` ids and entities, add around them.

**Depends on.** None.

**Complexity.** M — one substantial outcome; the volume is content authoring, not architecture.

**Engineering tier.** mvp — opt-in demo tooling; failure costs testing inconvenience, never user data. (`pipeline.config.yml` declares no project-level `engineering.tier`; this is a WP-level assignment.) Note the desktop hook lands in shipping code, so the opt-in gate itself carries production-grade rigor even though the data does not.

**Pre-build.** Architecture required. Three genuinely open questions the build must not improvise: (1) where the demo seed lives so both the setup CLI and the desktop first-run boot may legally call it, and how the AF17 bend is recorded so the constraint stays enforceable in both directions (demo never leaks into non-demo boots; the opt-in gate is explicit); (2) how a human gets into the demo world — the seeded founder vs. the setup wizard's first-run user creation, and how login works against a seeded identity; (3) data-file shape and idempotency strategy for ~2000 lines of content (fixture modules vs. generated data, re-run behavior, timestamp anchoring relative to seed time). Refinement not required — the outcome and the world's shape are settled above. Design not required — no new user-facing surface; the opt-in is a flag/env var, not UI.

**Constraints.**

- Opt-in only, never silent: a fresh DB with no demo flag contains zero demo rows; the flag seeds the full world.
- Idempotent: seeding twice changes nothing and errors on nothing.
- The existing Acme skeleton survives intact: `demo-team-acme`, `demo-founder`, `ast-demo-founder`, `demo-agent-builder`, `demo-agent-pm`, `demo-bet-daily-digest`, `demo-task-daily-digest`, `demo-routine-daily_digest` keep their ids and remain recognizable; the new world extends them.
- All demo rows carry `demo-*` (or existing seed-*) id prefixes so demo data is identifiable and distinguishable from factory bootstrap rows.
- The world respects the product model as documented in `docs/process-layer/`: no cost/money data anywhere, tasks are agent-owned, conversations live in host-scoped threads (no channels), bet lifecycle is draft/active/completed/killed with outcome verdicts on closed bets, knowledge statuses/scopes/kinds come from the closed vocabularies in `framework/domain-model`.
- No writes to encrypted-credential tables (`server_credentials`, `service_connections`) or orchestration queue tables (`agent_session_requests`, `agent_work_intents`, `explicit_session_starts`, `agent_lifecycle_inbox`, `task_dispatch_attempts`); those tolerate emptiness.
- Timestamps are anchored relative to seed time and spread over ~6 weeks of history, never hardcoded absolute dates.
- No new UI surface in this WP — the desktop opt-in is a flag/env var read at DB creation.

**Out of scope.**

- Resetting or re-seeding an already-used instance (a fresh DB creation is the reset path).
- A setup-wizard checkbox or any UI for choosing demo mode (candidate follow-up WP if the founder wants it).
- Real agent activity behind seeded active sessions — the streams are dead by design.
- Multi-team demo worlds (one team is the documented small-team shape and keeps the Work overview honest).
- Seeding `plugins`, `filesystems`, `proposed_calls`/AL7 tables, `invite_codes`.
- Changing the eval seeding library or UI-only fixtures beyond reusing them as references.

## Acceptance criteria

- After `npm run setup -- --demo` on a fresh database, the Conversations view shows a populated thread list containing at least: one blocking thread with an unresolved review, one resolved review whose verdict echo is visible, one agent-initiated DM with a human, and the founder's pinned assistant thread with multi-turn history.
- After the same seed, the Work view shows team Acme with bets in all four statuses (at least one active with tasks in mixed states including `in_progress` and `review`, at least one draft, at least one completed with an outcome verdict, at least one killed), tasks across all eight states somewhere in the world, artifacts on at least one bet, and routines with run history.
- After the same seed, the Knowledge view shows items in both the Curated and Triage tabs, spanning multiple scopes, kinds, and statuses, with at least one item carrying a provenance link from a completed bet's retro and at least one conflict or stale item.
- After the same seed, the notifications surface shows at least one review-request and one blocker notification, and at least one seeded session is `active` (renders a live indicator) while the rest are terminal records with notes/outcomes.
- Every seeded review message resolves through `GET /api/reviews/:id` to a renderable review subject (its artifact exists and the review page can open it).
- A fresh desktop first-run with the demo opt-in set produces the same world before the user interacts; a fresh desktop first-run without it contains zero `demo-*` rows beyond none (factory bootstrap rows unaffected either way).
- Running the seed a second time over an already-seeded database changes no row count and produces no error.
- The seeded world is referentially coherent: every thread host resolves to its entity, every message sender to an identity, every task to its bet and owner, every knowledge edit/access log to its item — a walk of the foreign keys finds no dangling reference.
- A human can get into the demo instance and lands as the founder (the architecture phase decides the mechanism; the criterion is that the daily check-in journey — notifications, blocking review, assistant thread — is walkable without creating a new user).

## Validation scenarios

- Given a fresh PGlite database, when `npm run setup -- --demo` runs and the app boots, then none of the three views shows its top-level empty state, and the sidebar shows thread, team, and knowledge fast-nav entries.
- Given a seeded database, when the seed runs again, then per-table row counts for all demo-touched tables are identical before and after.
- Given a fresh desktop first-run with the demo opt-in flag, when boot completes, then `demo-team-acme` exists with its bets, threads, and knowledge; given the same boot without the flag, then no `demo-*` row exists.
- Given the seeded world, when the founder opens the blocking review thread and follows the review affordance, then the review page renders the referenced artifact and the five verdict actions are available.
- Given the seeded world, when the founder opens the completed bet, then its outcome verdict, summary, and the retro-born knowledge item's provenance link all resolve.
