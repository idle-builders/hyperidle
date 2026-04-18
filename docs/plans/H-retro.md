# H-Pipeline Retro — H1–H4

**Date:** 2026-04-18
**Scope:** H1 (Git Export Routine), H2 (Notification Adapter), H3 (Observability Adapter), H4 (Deployment Profiles + PostgreSQL Adapter)
**Commits reviewed:** `a2968b3` (H1 merge) → `569fce7` (H4 merge)
**Artifacts reviewed:** `docs/plans/H[1-4]-*.md` (23 files, 3842 lines of plan/review/DoD evidence)

---

## 1. What worked

- **Review-pass caught real, production-breaking bugs in every single story.** Not theoretical; actual CRITICAL findings that would have shipped if only TDD + DoD ran:
  - H1: `registerGitExportHandler` called with no runner in `app.ts:80` → AC1 dead in production. Plus path-traversal via `scopeId`/`topic` and arbitrary-write via `/etc` repoPath.
  - H2: `routine_fired` event never emitted by `routine-scheduler.ts` → AC6 (daily digest) dead wiring. Only the integration test's manual `bus.emit(...)` made it look alive.
  - H3: `tool_call` consumed in `session-provisioning.ts:332` but never emitted as `ObservabilityEvent` → AC4 "tool calls logged" silently zero in prod.
  - H4: AC4 "SQLite → Postgres is a config change" contradicted by 871 sync `.run()/.get()/.all()` call sites across the server.
- **Honest-incomplete reporting held the line on H4.** Rather than marking AC4 PASS, H4 shipped with AC4 labeled "HONESTLY INCOMPLETE", guarded by `pg-call-site-audit.test.ts` that pins the 871 count ±50 and fails loudly on drift, with a DEPLOYMENT.md §"Switching SQLite → Postgres" explicitly warning that flipping `DATABASE_URL` today will crash on first query. This is the correct behavior for a hard-blocked AC — disclose, guard, defer.
- **TDD red→green produced first-pass-green on H2/H3/H4 core suites** (H2 56/56, H3 62/62, H4 89/89 db-project tests). Where the tests were honest they worked. Total suite grew 1301 → 1557 green across the four stories.
- **Multi-agent review (architect + adversary + security + slop/simplify) found non-overlapping classes of bug.** Example: on H1, architect found the dead event handler; adversary found the deletion-propagation gap; security found 3 criticals (path-traversal, userinfo leak, debug-log of PATs); simplify found 6 dead interface methods on `GitRunner`. Each reviewer has a distinct attack surface; removing any one would have shipped a bug.
- **Dependency drift on H1 was recovered cleanly.** G1 was merged to main mid-flight; merging main back into H1 resolved it. Downstream cost: a trivial `app.ts` merge conflict on H3.

---

## 2. What didn't

- **Review caught bugs that TDD + DoD should have caught, three stories in a row.** In every H story the first code to pass `bun run test` green was architecturally broken in ways the ACs explicitly required — not the tests' fault per se, but the tests were checking the thing-the-implementer-built rather than the thing-the-AC-specified. Examples with file:line:
  - H1 `app.ts:80` — unit tests all passed because they injected a FakeGitRunner; production wiring had no runner at all. The DoD check (`H1-dod-check.md`) later added `git-export.test.ts:1116-1155` as a remediation-test for "createApp → git-export wiring", but that was an after-the-fact fix driven by the adversary review, not an original TDD artifact.
  - H2 `dispatcher.ts:636-654` subscribes to `routine_fired`; `routine-scheduler.ts` never emits it. Integration test `dispatcher.integration.test.ts:133` fakes the emission and passes. AC6 was checked green before the adversary reviewer grep'd for producers.
  - H3 `harness/claude-agent-sdk-adapter.ts:132` yields `tool_call`; nothing turns it into an `ObservabilityEvent`. The test asserted the translator handled the kind, never that anything emitted it.
  - Root pattern: **tests asserted the module works; they did not assert the module is wired and fires end-to-end from a real event.** The phrase "production path" appears exactly twice in the DoD checks — after review fixes landed.
- **Pre-existing lint errors in unrelated packages blocked verify repeatedly.** `pipeline/runner.ts`, `fabric/*`, `web/designsystem` produced errors (H1 `bun run lint` = 4 errors, 61 warnings, all unrelated). Commit `e0ebaff chore: fix pre-existing lint errors` on H1 shows the story cleaning someone else's house to pass the gate. H3's DoD notes `0 errors, 69 biome warnings + 1 eslint warning, none new to H3` — same pattern; H3 just didn't have to fix them because they happened to be at warning level. Biome doesn't differentiate new from pre-existing; story authors are forced into janitorial work.
- **Debounce / in-memory rate limits were not identified as ACs during planning.** H1 plan §3.9 designed the debounce; security review found there was no rate limit on `POST /run` (cost amplification). H2 plan §4 had no rate-limit; security review found `/test` is an unrated SMTP/ntfy relay. H3 plan had no DNS-rebind guard; security review found the TOCTOU between `assertUrlNotSSRF` and the subsequent `fetch`. **Classic pattern: ACs describe happy path; reviewers invent the abuse cases.** The fixes landed, but the class of finding is highly repeatable.
- **Architecture / CRITICAL findings on H2 required a second review cycle after fix.** H2 adversary review called out 3 criticals (dead digest wiring, silence-punch-through via flush, at-least-twice delivery). All three had to be fixed in a follow-up commit before ship. Same for H3 (3 criticals: tool_call dead, O(n²) drop-oldest, flush race), same for H4 (AC4 false, AC5 false, compose `DATABASE_URL` defaulting away from `POSTGRES_PASSWORD`, port 5432 published on 0.0.0.0). Each of these is a second full iteration — planning-as-stated did not surface them.
- **Dependency drift created churn that the pipeline did not flag.** H1 planned assuming G1 absent; G1 merged mid-flight; resolving the merge created the H3 `app.ts` conflict. No tooling alerted the story that upstream had moved.
- **Developer agent "report" sections are verbose and not actionable.** Representative observation: the "NOTICED BUT NOT TOUCHING" list with 8 items is signal-noise. A tighter handoff contract would help the next agent prioritize.

---

## 3. Proposed changes

Only proposals with evidence from this pipeline. Coordinator applies; human approves CLAUDE.md or new-skill edits.

### A. Skill edit: `.claude/skills/plan/*` — require a "production wiring test" AC (CONFIRMED, 3 occurrences)

- **Evidence:** H1 `app.ts:80`, H2 `routine_fired` not emitted, H3 `tool_call` not emitted. All three are "the module works in isolation; it does not fire end-to-end in prod." All three were caught by review, not by tests or DoD.
- **Proposed change:** `/plan` must output at least one AC of the form *"The production entrypoint (createApp) fires this feature end-to-end when a real event is emitted on the real bus — no test-injected emit"*, and TDD red phase must produce the failing test for that AC before any code is written.
- **Rationale:** Every story this pipeline had a test-vs-wiring gap. This is a structural blind spot in how ACs get translated into tests, not a reviewer-laziness issue.
- **Risk:** Could be over-applied to stories that genuinely have no runtime wiring (pure utility packages). Escape hatch: the test is required when the module touches `registerX(db, eventBus, ...)` or is added to a route mount.

### B. Rule edit: `.claude/rules/testing.md` — forbid "faked-bus" integration tests (CONFIRMED, 2 occurrences + 1 near-miss)

- **Evidence:** H2 `dispatcher.integration.test.ts:133` fakes the `routine_fired` event instead of driving the real scheduler. H3 `trace-correlation.test.ts:104` constructs the resolver inline rather than reading from the real DB path.
- **Proposed change:** Add bullet: *"Integration tests must drive events through the same path production does (real scheduler → real bus). Tests that manually call `bus.emit(...)` to simulate a producer are unit tests, not integration tests, and must be named `.unit.test.ts` / live in `__tests__/` only — not `*.integration.test.ts`."*
- **Risk:** Some integration tests legitimately need to simulate rare events (e.g., a cost cap breach). Carve-out: if the producer is external to HyperIdle (e.g., SMTP reply, ntfy webhook), manual emit is fine.

### C. Skill edit: `.claude/skills/plan/*` — add "abuse cases" section (CONFIRMED, 4 occurrences in one pipeline)

- **Evidence:** H1 path-traversal + rate-limit-missing; H2 SMTP relay / CRLF-in-creds + SSRF on ntfy base URL; H3 DNS rebinding + short-key scrub gap; H4 compose `DATABASE_URL` default bypassing `POSTGRES_PASSWORD` + port 5432 on 0.0.0.0. All discovered by security review, none in the plan.
- **Proposed change:** Add a required "§ Abuse Cases" subsection to the plan skill output covering: (a) rate-limit / cost-amplification on every route, (b) SSRF / cloud-metadata on every outbound URL, (c) CRLF / header-injection on every string flowing to a network protocol, (d) secret-leakage on every GET that echoes config, (e) for new infrastructure components, an explicit "operator-follows-docs-literally" threat.
- **Rationale:** This exact checklist would have caught 8+ review findings in this pipeline.
- **Risk:** Plans get longer. Acceptable — the alternative is rediscovering the same classes in every review.

### D. Pipeline change: Treat pre-existing lint errors separately (CONFIRMED, recurring)

- **Evidence:** H1 commit `e0ebaff` cleans unrelated packages to pass lint. H3 DoD line 26 notes "0 errors, 69 biome warnings + 1 eslint warning, none new to H3." Commit log shows H1 authors fixed `pipeline/runner.ts`, `fabric/*`, `web/designsystem` just to unblock.
- **Proposed change:** `/verify` should baseline lint state at story-start (e.g., `bun run lint --reporter json > .pipeline/lint-baseline.json`) and compare new-only at story-end. Ship-gate = zero *new* errors; baseline drift tracked separately in a "debt" ticket.
- **Rationale:** Stories should not be janitors for unrelated packages. Janitorial commits should be explicit "chore: lint cleanup" PRs.
- **Risk:** Baseline drift goes undiagnosed. Mitigation: run a weekly `/simplify lint-baseline` story off the accumulated baseline.

### E. Rule edit: `.claude/rules/skill-discovery.md` — add "honest-incomplete" protocol (EMERGING, 1 strong occurrence)

- **Evidence:** H4 AC4 shipped HONESTLY-INCOMPLETE with a pinned snapshot test and DEPLOYMENT.md disclosure — this worked well. H3 shipped with a partial tool_call audit (router-level scrubbing gap deferred); the honest-scoping mechanism was ad-hoc.
- **Proposed change:** Codify the pattern: *"If an AC is blocked by work that exceeds the current story's scope, it may ship as HONESTLY-INCOMPLETE iff: (1) the gap is documented in the AC's DoD verdict, (2) a regression-pinning test is added that fails when the gap grows (e.g., call-site count ±tolerance), (3) user-facing docs warn about the gap, (4) a follow-up story is created in the next track plan."*
- **Rationale:** H4 proves the pattern. Without a codified contract, future agents may use "honestly incomplete" as a dodge.
- **Risk:** Becomes a graduation-too-easy escape hatch. Mitigation: coordinator must count HONESTLY-INCOMPLETE ACs per pipeline; >2 per 4 stories triggers escalation.

### F. Skill edit: `.claude/skills/apply-review/*` — enforce tight report format (EMERGING, 2 occurrences)

- **Evidence:** Verbose "NOTICED BUT NOT TOUCHING" lists noted by the coordinator. No specific quote available in the artifacts reviewed, but the pattern shows up in repeated manual observation.
- **Proposed change:** Require developer reports to conform to a 4-line max format: `FIXED: …`, `DEFERRED (reason): …`, `INTRODUCED FOLLOWUP: …`, `OPEN QUESTION: …`. Anything longer goes into a linked `H<n>-followups.md`.
- **Risk:** Hides useful context. Escape valve: the `followups.md` file.

---

## 4. Follow-up stories

- **H5: Convert server sync `.run/.get/.all` to async for Postgres support.** 871 call sites (pinned by `pg-call-site-audit.test.ts`). Single biggest deferred item; unblocks AC4 of H4 and makes the VPS/cloud profiles real.
- **H6: Wire `registerObservabilityDispatcher` to `tool_call` emissions.** H3 AC4 completion — add a `tool_call_recorded` domain-event emit in `session-provisioning.ts:332` and subscribe the dispatcher. Extend `summarizeToolArgs` scrub patterns to cover AWS `AKIA…`, Slack `xox…`, Google `AIza…`, JWTs, Stripe live keys, PEM bodies. Pair with a branded `ArgsSummary` type so raw args cannot reach the Langfuse adapter.
- **H7: Routine-scheduler emits `routine_fired` on successful fire.** H2 AC6 completion. Two lines in `routine-scheduler.ts:checkAndFireRoutine`, plus a real integration test that exercises scheduler → bus → digest → adapter without manual emit.
- **H8: Debug-log credential redaction in git-export-runner.** Security HIGH from H1: `git-export-runner.ts:62` logs full argv on every git spawn; `remote add <url-with-PAT>` leaks tokens at `LOG_LEVEL=debug`. Introduce an argv redactor in `@hyperidle/shared/redact`.
- **H9: DNS-rebind guard for outbound HTTP.** H3 HIGH finding. Resolve-once-and-pin dispatcher for `fetch` in `langfuse-adapter.ts`, reusable in any future outbound adapter.
- **H10: Rate-limit policy across all `/api/*` routes.** Driven by H1 and H2 security findings. Token-bucket middleware at the Hono level; per-route overrides for `/notifications/test`, `/git-export/run`, `/observability/flush`.
- **H11: Adapter lifecycle on PATCH /config.** H3 MEDIUM finding (M-3). Rebuild dispatcher+adapter on successful config PATCH; also applies to notification adapters (H2) and git runner (H1).
- **H12: Fix the three "pre-existing" flaky tests and lint-debt sweep.** Converts the baseline into zero, then makes the lint gate strict. Addresses the recurring `file-watcher.test.ts` flake flagged 3 times (A2, D4, D5) and the ongoing pre-existing lint debt in `pipeline`, `fabric`, `web/designsystem`.
- **H13: Per-DB export mutex keying.** H1 architecture review flagged process-global `exportMutex`; move to `Map<repoPath, Promise>` to unblock multi-tenant / parallel-suite execution.

---

**End of retro.**
