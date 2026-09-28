# Audit B — developer guide, deployment, requirements

Base: origin/main 92178fb93. Every claim below was checked against code in this worktree. Paths are repo-relative.
Published on the website: `docs/guides/developer/*` and `docs/deployment/*` (applications/website/astro.config.ts:33-36; nav is hard-coded in applications/website/src/lib/docs-nav.ts:30-70; applications/website/src/__tests__/doc-links.test.ts:22-23 hard-codes `docs/deployment/laptop.md`). If you delete or rename a page, update docs-nav.ts and those tests in the same change.

## Cross-cutting facts (true now)

- Packages: 35 package.json under the four roots (not 33). framework/ has **10**: api-contract, db, design-system (**empty dir, only node_modules — no package**), diagnostics, domain-model, event-bus, harness-capability, harness-protocol, http-middleware, tool-protocol. applications/ has 4 (desktop, remote-server, remote-worker, website). tools/ has 7 (eslint-plugin-authz, eslint-plugin-design, eval, governance, repo-gates, setup, trace).
- `framework/host-process` is **deleted**. Profiles now live in `applications/remote-server/src/profiles.ts`, the startup key check in `applications/remote-server/src/validate-startup-env.ts`. `framework/toon-codec` is deleted (encoder inlined at layers/agent-orchestration/run-orchestration/src/context.ts:99-103).
- `npm run dev` runs **no agents**: remote-server boots with `topology: "disabled"` (applications/remote-server/src/index.ts:34) — empty harness pool, filled only by a remote worker. Only the desktop app runs local harnesses (`topology: "local"`, applications/desktop/src/boot-server.ts:38).
- Dev key: laptop profile defaults the server key to `hyperidle-dev-local` (validate-startup-env.ts:15) and the web dev build falls back to the same value (layers/core-ui/src/services/api-fetch.ts:31-32). No pairing needed unless you set your own key.
- SetupFlow asks for: a name, a harness to run the assistant on, one optional repo folder. No API key, no team form — team is created silently from the folder name or "My Team" (layers/core-ui/src/pages/SetupFlow.tsx:4-11, 28-30, 102-105).
- `npm run db:migrate` is `drizzle-kit migrate` against **Postgres** (`DATABASE_URL`, default localhost:5432; framework/db/drizzle.config.ts:68-80). It never touches PGlite. Laptop migrations come from `npm run setup` (tools/setup/src/setup-cli.ts:190-196) or desktop boot.
- `db:seed:pg` and `db:bootstrap:pg` do the same thing (factory bootstrap only; bootstrap adds `--demo`) — tools/setup/src/seed-pg-cli.ts vs bootstrap-pg.ts. One is redundant.
- Deploy files: `Dockerfile` (dev image, used by docker-compose), `Dockerfile.deploy` (prod image), `deploy/chart/` (not `chart/`), `deploy/bin/{service,setup,launchd}` (not `bin/`), `deploy/homebrew/Casks/hyperidle.rb`. Workflows: ci, deploy, desktop-release, e2e-nightly, release-guard, release.

## Code bugs found while checking docs (outside doc scope — flag, not fix)

1. `deploy/bin/launchd/com.hyperidle.server.plist:13` runs `__REPO_DIR__/packages/server/src/index.ts` — deleted path. `deploy/bin/service install` installs a service that cannot start.
2. VPS compose stack cannot boot: `server` gets `HYPERIDLE_PROFILE: vps` but no `HYPERIDLE_API_KEY` in its `environment:` (docker-compose.yml:41-56, no env_file), and vps requires it → `FATAL` exit (validate-startup-env.ts:12-13). `web` sets `VITE_API_URL` which nothing reads; its proxy targets `localhost:3001` inside the web container (layers/core-ui/vite.config.ts:38). docker-compose.yml:7 and setup-cli.ts:263 tell users to run `npm run db:migrate:pg`, which does not exist. docker-compose.yml:10 points at `docs/DEPLOYMENT.md` (missing); its @lore names deleted `@hyperidle/host-process`.
3. `npm run ds:inspect` → `framework/design-system/__scripts__/inspect-page.ts`, which does not exist.
4. `npm run test:e2e:ah1` matches `**/ah1-*.spec.ts` (layers/core-ui/playwright.ah1.config.ts:43); no such spec exists, and its test server targets deleted `/api/credentials/*` routes (layers/core-ui/__scripts__/ah1-test-server.ts:13-14). Leftovers `vite.ah6.config.ts`, `__scripts__/ah6-assert-budget.ts` belong to a lane that is gone.
5. Helm chart has no factory-bootstrap init container (deploy/chart/templates/deployment.yaml:29-35 is `migrate` only), and remote-server never calls `applyFactoryCoreState` (only desktop main.ts:420 does) → a cloud deploy never writes the `system:propagation` actor.
6. `require-stories-sibling` TARGET_DIRS still `framework/design-system/src/` + `components/` (tools/eslint-plugin-design/src/rules/require-stories-sibling.ts:20) — never fires in `layers/core-ui/src/ds`.

---

## docs/guides/developer/index.md (11 lines) — FIX
- False: ":5 repo map of the 33 workspace packages" → 35 (see above).
- False: ":11 work-packages.md — per-WP progress/retro files, pointer to skill-discovery.md" → neither exists.
- Trim: bullet descriptions restate page content; one line each is enough.
- Missing: nothing beyond matching the new page set.

## docs/guides/developer/getting-started.md (116 lines) — REWRITE (~50 lines)
- False: ":71-92 framework/ tree" — lists 20 packages; 10 do not exist (block-derivation, conversation-parts, credential-access, cron, filesystem-contract, host-process, presentation-format, query-escaping, toon-codec, work-intent-port), `design-system` is an empty dir, `domain-model` listed twice (:75, :82). tools/ omits repo-gates, setup, trace; applications/ omits website.
- False: ":51, :58 `framework/host-process/src/validate-env.ts:13`, `profiles.ts:33-40`" → applications/remote-server/src/validate-startup-env.ts, profiles.ts.
- False: ":60 Apply with `npm run db:migrate`" in the laptop flow → that command targets Postgres only (drizzle.config.ts:68-74). Laptop: re-run `npm run setup`.
- False: ":110 'the rule and the handful of recorded exceptions are stated in CLAUDE.md'" → CLAUDE.md says there are no exceptions; the ledger was deleted.
- False-ish: ":68 core-api … (changes, document, policy, settings, task, thread, user)" is right; ":69 'tool handlers'" is now only a registry. Fine to drop sub-lists entirely.
- Stale detail: ":17 'factory bootstrap'" — bootstrap writes one hidden system row only (layers/core-api/src/bootstrap/factory-state.ts). Fine to say "migrations".
- Trim: the whole project-structure tree (duplicates `ls` + tools/governance/architecture.json; CLAUDE.md says never work from a remembered list) → replace with one sentence per root folder. Drop env-var detail that restates laptop.md; drop the desktop-dev preload bug paragraph (:32) into a one-line known-issue or fix the bug.
- Missing: **`npm run dev` runs no agents** (remote-server topology disabled) — say how to get an agent running in dev (desktop build, or a remote worker). What the welcome screen asks (name + harness + optional folder) and that a harness must already be installed and logged in.

## docs/guides/developer/commands.md (107 lines) — FIX (~60 lines)
- False: ":37-38 `test:e2e:ah6`, `smoke:ah6`" — no such scripts (root package.json), no cassettes dir, no ah6-smoke-local.ts.
- False: ":36 `test:e2e:ah1`" — runs zero specs (see bug 4). Drop or fix the lane.
- False: ":81 `ds:inspect`" — script target missing (bug 3).
- Misleading: ":92 `db:migrate` 'Apply migrations'" → Postgres-only via drizzle-kit. ":93-94" bootstrap vs seed are the same thing.
- Stale: ":25 '(AT1)'" work-item id. ":47 'CI re-runs the full suite and e2e on the bump PR'" true (release-guard.yml:156-159) but runs `test:integration:service`, not all integration.
- Trim: governance table (:65-75) — just link tools/governance/README.md; `governance:new-cells` is an internal tool. `check:native` (no-op). Evals/docs:dev rows (docs:dev builds docs/product with VitePress while the real site is applications/website — two site builders; question keeping VitePress). Background-service pointer (service is broken).
- Missing: `test:integration:service`/`:harness`, `lint:design-css`, `lint:design-profiles`, `lint:governance:attacks` exist in package.json but aren't listed (or: stop listing every script and link package.json; keep only the ~12 a contributor uses).

## docs/guides/developer/testing.md (118 lines) — REWRITE (~45 lines)
- False: ":72-102 AH6 lane" — whole section: `LLM_CASSETTE_MODE`, `callLlm` in `layers/agent-execution/harness-registry/src/llm-client.ts` (file gone; builtin harness removed), `playwright.ah6.config.ts` (gone), cassettes (gone), `OPENROUTER_API_KEY` refresh.
- False: ":110 AH6 ports 3098/5183" row.
- False: ":112-114 `AH3-assistant-responds.spec.ts`" — does not exist (ls layers/core-ui/__e2e__).
- False: ":5 'the ledger of production-path files that are really development'" — ledger deleted (CLAUDE.md).
- False: ":36 'E2E full, 8 shards'" — release-guard.yml has no shard matrix (:156-159).
- Stale/history: ":43 'as of 2026-08-09 the harness lane is red…'" dated note. ":54 '(R3 from AT1)'" ids. ":60 'went with it … attestation'" history.
- Trim: CI lane table duplicates CLAUDE.md's command table and .claude/rules/testing.md; keep one short "what runs where" table. Keep the `test:full -- <path>` gotcha (:25) and "don't start dev before e2e / port 5179" (:68) — both true (playwright.config.ts:12,38).
- Missing: nothing substantive.

## docs/guides/developer/mock-data-policy.md (97 lines) — FIX + TRIM (~30 lines). Path frozen: `POLICY_DOC_URL` (tools/eslint-plugin-design/src/mock-data-policy.ts:93).
- False: ":75 survivor `u-founder` in `layers/core-api/policy/src/lifecycle-propagation.ts`" → only in layers/core-api/src/middleware/auth.ts:86,95 (tools/repo-gates/mock-inventory/inventory.json).
- False: ":27 seed script `layers/core-api/src/bootstrap/factory-state.ts`" is not a seed of demo-like data any more; it writes one system row. Fine to drop.
- Restated lint (violates docs rule): ":33-39 permitted surface", ":49-53 forbidden prefixes + DEFAULT_* rule", ":67-69 literal ids" — the closed sets live in mock-data-policy.ts; link it instead of copying line numbers (`mock-data-policy.ts:62-80`, `:10-22`, `:83-87`, `:90`) which drift.
- History/ids: ":96 'block tagged L16 AC-3'".
- Off-topic: ":55-65 Nimmly/Acme naming" — Nimmly is a dead noun per memory; keep one line ("demo data uses the fictional name Acme") or drop.
- Keep: definition of mock data (3 properties), "removing a mock removes its fallback", how to run `mock-inventory`.

## docs/guides/developer/design-system.md (50 lines) — REWRITE (~20 lines) or MERGE→docs/ui-design/foundation.md
- False: ":28 example path `layers/core-ui/src/pages/WorkBetCreate.stories.tsx`" → WorkTaskCreate.stories.tsx, and that story does not use MockProviders (it wraps MemoryRouter itself and stubs a deleted `/api/teams` route).
- False: ":44 fixtures in `layers/core-ui/src/pages/__fixtures__/` or `layers/core-ui/src/fixtures/`" → neither directory exists.
- False: ":45 `eslint.config.ts:900`" → block is at :670-685.
- Stale/diary: ":7 lint-rule defect report ('18 of 74 ds/ files have no story', rules never fire)" — a bug report, not a guide. File it as a task (bug 6), delete from docs.
- Trim: ":9-17" pipeline-plugin viewer internals (`$CLAUDE_PLUGIN_ROOT/skills/design/viewer/launch.mjs`, `.pipeline/viewer.config.json`) — internal tooling on a public page. ":19" duplicates ui-design/foundation.md. ":46" `/pipeline:human-concept-review` internals.
- Keep: stories live beside components in `layers/core-ui/src/ds`; `__preview__/MockProviders` = MemoryRouter + AssistantContext for surfaces that need them; components tested with vitest + Testing Library.

## docs/guides/developer/linting-and-formatting.md (66 lines) — REWRITE (~20 lines)
- False: ":54 `tools/governance/src/rules/pattern-live.ts`" — no such rule file (rules dir listing).
- False: ":62 'compose `pageTitleClassName` (from `@hyperidle/design-system`)'" → no such package; it's in layers/core-ui/src/ds/PageHeader.tsx.
- False: ":28 Drizzle rules on `layers/core-api/src/**`" — check scope; core-api services now live in `layers/core-api/*/src/` too.
- Restated lint (docs rule violation): ":46-54 production vs development" (CLAUDE.md + governance own it — this is the third copy), ":39-44 governance internals (census, DeadRuleError, severity)", ":56-66 individual eslint-plugin-design rules + class literals + exemptions". All owned by eslint.config.ts / tools/governance/README.md.
- History: ":42 'because the previous guard set contained scripts that scanned a directory deleted two tracks earlier'".
- Keep: the `npm run lint` chain (matches package.json exactly), Biome = format + main lint (tabs, width 100 — biome.json:142-143), ESLint = what Biome can't, zero warnings allowed, link to governance README.

## docs/guides/developer/work-packages.md (28 lines) — DELETE
- False: ":3 `.pipeline/progress/<id>.json`, `.pipeline/retro-log/<id>.jsonl`" → neither dir exists; retros are `.pipeline/work/<id>/retro.jsonl`. ":3 `/refine` adds requirements.md, `/design` adds design/…" — work dirs hold plan.md/retro.jsonl.
- False: ":5 `.claude/rules/skill-discovery.md`" — missing.
- Stale: ":13-28 `/pipeline:design`, `/pipeline:design-critique`, `/pipeline:human-concept-review`, DESIGN-CLASS/DOC-CLASS, park status" — the installed pipeline is now idle-skills (idle-skills:pipeline / design / review) with the idle task backend.
- Why delete: internal agent-pipeline process on a public website page; CLAUDE.md already says where work packages live. If anything is kept, one line in CLAUDE.md, not docs.
- Also update docs-nav.ts:69.

## docs/deployment/index.md (20 lines) — REWRITE (~20 lines)
- False: ":3 'SetupFlow collects your name, creates a first team (name derived from repo path), and requires an Anthropic API key before you can proceed'" → no key of any kind; a harness picker; team created silently (SetupFlow.tsx:4-11,28-30).
- False: ":13 link `architecture/run-unit-model`" — run-unit model has no code (truth sheet); "agents run on the host in every profile" is false for remote-server profiles: they run no agents at all (index.ts:34), agents run on desktop or a remote worker.
- False: ":17 'API-key pairing'" — defaults on both sides (see facts).
- Keep: desktop facts that hold — embedded Hono server, PGlite at `userData/hyperidle-pg` (main.ts:46-49), 256-bit key in `userData/secrets.json` (main.ts:90-110, 800), DMG + Homebrew tap (desktop-release.yml:83-87), Node ≥ 24.
- Duplicate: docs/guides/user/deployment.md (19 lines, out of scope) restates this page's profile table and cites deleted `framework/host-process/src/profiles.ts` and `bin/service`; MERGE it into this page (or make it a one-line link).
- Missing: desktop "shared mode" (Settings → Backend → server URL + key in OS keychain; main.ts:825-843, safe-credentials.ts:16) belongs here, one paragraph.

## docs/deployment/laptop.md (38 lines) — REWRITE (~15 lines) or MERGE→guides/developer/getting-started.md
- False: ":7 profile default in `framework/host-process/src/profiles.ts`" → applications/remote-server/src/profiles.ts:20. (`resolvePglitePath` in create-server.ts:204 is correct.)
- False: ":9 'The server does not auto-generate a key — it only warns and refuses credential writes when none is set'" → laptop defaults to `hyperidle-dev-local` (validate-startup-env.ts:15), so the warning at create-server.ts:264-275 never fires under `npm run dev`. Web falls back to the same key (api-fetch.ts:31-32).
- False: ":12-32 `bin/service …`" → `deploy/bin/service`; and the service is broken (plist runs deleted `packages/server/src/index.ts`, bug 1). It also runs remote-server, which runs no agents. Either fix the service or delete the section; do not document a broken tool.
- Keep: setup-before-dev (true: dev never migrates), repo-root-relative PGlite path, Node ≥ 24.
- Note: website test doc-links.test.ts:22-23 hard-codes this path — keep the file or update the test.

## docs/deployment/self-hosting.md (80 lines) — REWRITE (~25 lines, cloud only) — or DELETE the VPS half
- False (whole VPS section :7-38): the stack does not boot (bug 2: no HYPERIDLE_API_KEY passed to `server`; web proxy points at itself). ":22 `npm run setup -- --profile vps`" only prints hints, does nothing (setup-cli.ts:254-270).
- False: ":3, :30 `framework/host-process/src/profiles.ts`" and "`requiresDockerCompose` in profiles.ts" → moved and that field dropped (applications/remote-server/src/profiles.ts:5-7).
- False: ":5 'Agents run on the host in every profile — see run-unit-model'" → remote-server runs no agents.
- False: ":52 `createPgDb`" → `createPostgresDb` (framework/db/src/connection.ts:71). Pool default 10 / `PG_POOL_SIZE` is correct.
- Misleading: ":58 'There is no db:migrate:pg script — use npx tsx migrate-pg.ts'" is right about the name, but `npm run db:migrate` (drizzle-kit) also migrates Postgres — two migration runners; say which to use. ":47 `npm run setup -- --profile cloud`" only validates a URL exists and prints (setup-cli.ts:273-285) — pointless step. ":49 `db:seed:pg`" = bootstrap (duplicate).
- Missing: a server profile needs `HYPERIDLE_API_KEY` or it exits (validate-startup-env.ts:12-13) — the one fact every self-hoster hits. Agents must come from a remote worker or desktop clients.

## docs/deployment/shared-backend.md (128 lines) — REWRITE (~50 lines); question publishing it
- False: ":10-11 `validateSharedBackendKey`, `applications/desktop/src/credential-validator.ts`" → neither exists. Shared-mode key is `shared_backend_key` in safeStorage (safe-credentials.ts:16), used for the worker (main.ts:672). `GET /api/health/auth` exists (layers/core-api/src/routes/health.ts:19).
- False: ":18 `framework/host-process/src/validate-env.ts`" → applications/remote-server/src/validate-startup-env.ts.
- False: ":3 'Hono API + fabric'" — "fabric" is not a code concept (truth sheet).
- False: ":77 'team and its agent roster are created by onboarding / edit_user, provisioned per-team with an ownerRole resolved from the team roster at provision time'" → team creation makes no agent (layers/core-api/user/src/user-actions.ts:875-884); there is no roster/ownerRole provisioning.
- False: ":84-86 `chart/`" → `deploy/chart/`.
- Still true: ":71-73 gap — bootstrap-pg not wired into Helm" (deployment.yaml:29-35). State it as a known gap (bug 5), one line.
- Trim: ":59 'Factory bootstrap (AF17)'" work id; ":61-80" long explanation of what bootstrap does not do (one row). ":31-44" duplicates releases.md. ":111-116 Postgres TLS note" is infra-internal. ":126" and ":5" publish a private local path `/Users/tg/Development/infra` on the public site.
- Suggest: this is internal ops for one private cluster — move it out of the published set (e.g. keep in repo but drop from astro content glob / docs-nav), or trim to "how a desktop connects to a shared server".

## docs/deployment/releases.md (84 lines) — FIX (~50 lines)
- False: ":17 'enforced by the Release Guard via `scripts/check-version-sync.ts`'" → no such file; the check is inline in .github/workflows/release-guard.yml:53-90.
- False: ":22 `chart/Chart.yaml`" → `deploy/chart/Chart.yaml` (release.sh:74).
- True: flow, draft release, manifest sha256, workflows table, secrets (release.sh:1-26; desktop-release.yml:58,86).
- Trim: ":56-67 'Why this shape'" is rationale — keep two lines max. Version example `0.5.0` equals the current version; use `<version>`.
- Missing: release-guard also runs `test:full`, service integration and full e2e on the bump PR (release-guard.yml:144-159) — one line.

## docs/requirements/index.md (8 lines) — DELETE (with folder)
- False: ":6 'requirements for … items, sessions, and notifications'" (items gone), ":8 'three-view shell, notification digest, approval-rate trust'" — all gone or not true.

## docs/requirements/functional-requirements.md (116 lines) — DELETE
Every section already says "depth lives in <layer doc>"; each item either restates that doc or is false. False/stale items:
- F-1.3 "every human gets exactly one assistant at registration" → only the welcome screen's second `edit_user` makes one (SetupFlow.tsx:8-11); creating a human elsewhere makes none.
- F-1.4 "Creating a team creates exactly one agent" → creates none (user-actions.ts:875-884).
- F-2.2 session states `active | paused | done | crashed` → `active, done, stopped, crashed` (framework/domain-model/src/actions/session.ts:38). "The session ends before context compaction" → no such mechanism (`preCompactionTrigger: false`, cli-harness-adapter.ts:1471).
- F-2.4 "Reach is company-wide, the subscriber's team, or own" — unverified duplicate of subscriptions doc.
- F-3.7, F-6.1 — pure history ("deleted in AU26", "AU21 §6 Decision L3").
- F-6.3 "Review gating is trust-based: approval rate × item risk tier" → riskTier deleted (framework/db/src/schema.ts:228); approval rate is display-only on the agent profile (layers/core-api/src/actions/compose.ts:392-394); no gating.
- F-6.4 "Responsibility routing uses org_edges" → org_edges are only stored/edited/listed via edit_user/open_user (user-actions.ts:294, 887, 1145); nothing routes by them.
- F-1.7, F-9.x — restate agent-model / wip docs. Numbering gaps (F-4.3, F-5.1, F-8.2, F-9.1 missing) show it's a leftover.
True and worth keeping somewhere (already in layer docs): task states + dependency hold, document lifecycle + plugin curation subscriptions, 500ms writeback (file-watcher.ts:32), assembly ranked by tag/recency/confidence (session-documents.ts:54-65), maxConcurrentSessions default 1 (schema.ts:115).

## docs/requirements/system-requirements.md (81 lines) — DELETE (move 2–3 standing decisions to docs/architecture/decisions.md)
- False: S-2.3 "codec at `framework/toon-codec/src/toon-codec.ts`" → package deleted, inlined (context.ts:100).
- False: S-2.2 history ("deleted in AU26 … since AU19").
- False: S-5.1 "Review routing flows through org_edges" (see F-6.4).
- False: S-7.1 "one observability adapter … `framework/diagnostics/src/observability/events.ts`, traceId" → diagnostics has only logger.ts, redact.ts, index.ts; no adapter.
- False: S-9.3 "review requirements come from approval-rate × riskTier" (see F-6.3).
- False: NF-2 "AgentAddDialog/AgentEditDialog against `framework/domain-model/src/agent-roles.ts`" → both dialogs and the role registry are gone (role is free text).
- False: S-3.2 "sandboxing is opt-in" — only local/disabled sandbox adapters exist; say "agents run as host processes".
- Code dependency: S-9.2 is cited by id in applications/desktop/src/boot-server.ts:22, create-server.ts:16, applications/remote-server/src/create-server.ts:89,489, applications/desktop/__tests__/boot-server.test.ts:30, remote-server server-bind-address.integration.test.ts:6. When deleting, reword those comments to state the rule in words ("desktop binds to 127.0.0.1 only").
- Keep (move to architecture/decisions.md if not already there): scheduler in-process `setInterval`, no external workflow frameworks, desktop loopback-only bind.

## docs/requirements/usability-requirements.md (71 lines) — DELETE (owners: information-architecture/, human-interface-layer/)
- False: UX-1.3 "contextual hints (`framework/domain-model/src/hint.ts`)" → file gone, no hint system.
- False: UX-1.2 "no global toast stream" → layers/core-ui/src/shell/ToastRegion.tsx exists (single transient toast).
- False: UX-2.4/UX-6.1 "Every thread item can carry visible `reasoning` (schema.ts)" → no reasoning column in schema.
- False: UX-4.1 `WorkTask.tsx` → `WorkTaskPage.tsx`.
- False: UX-6.2 "(AD4 …)" id; approval rate is shown, fine, but "Trust is earned" framing is the deleted gating model.
- False: UX-6.3 "per-session token chips" — not found in SessionView/WorkTaskPage.
- True but duplicate: sidebar 276px / 300px drawer (Sidebar.tsx:3), ⌘K, ⌘[ ⌘], ⌘1/2/3 (useNavShortcuts.ts:34,66-76), stacked Settings, inbox 30-day reaper (service-bootstrap.ts:72, inbox-reaper.ts), Triage/Curated tabs (DocumentList.tsx:2).

## docs/requirements/users-and-their-modes-of-engagement.md (29 lines) — DELETE (MERGE one paragraph → docs/agent-layer/agent-model.md or docs/product/)
- False: ":19 'Session dial-in … (D key, Conversations.tsx) … filter tabs All | Tools | Reasoning'" → no D key, no such tabs (SessionView.tsx, Conversations.tsx).
- False: ":11 link 'the three views'" — the three-views framing is gone (sidebar is Conversations/Work/Knowledge plus Settings; truth sheet).
- False: ":29 'review routing (via org_edges)'".
- Aspirational, not fact: time budgets ("15-second decidability", "fifteen minutes once a week", "deliberately engaged monthly") — design intent, not behavior.
- Keep one fact: humans and agents are rows in one `users` table, `kind` human|ai, default `ai` — already in agent-model/schema.

---

## Proposed target structure (this scope)

guides/developer/ (published)
| Page | Purpose | Lines before → after |
|---|---|---|
| index.md | Four links, one line each | 11 → 8 |
| getting-started.md | Clone → setup → dev; what the welcome screen asks; that dev runs no agents and how to get one; one-line map of the four roots; link to CLAUDE.md for the production/development rule | 116 → 50 |
| commands.md | The ~15 scripts a contributor uses; link package.json for the rest | 107 → 50 |
| testing.md | Which command when, what CI runs vs release vs local, `test:full -- <path>` gotcha, e2e port note; rules link to .claude/rules/testing.md | 118 → 45 |
| mock-data-policy.md (path frozen) | What counts as mock data, the fallback rule, how to regenerate the inventory; link mock-data-policy.ts for the closed sets | 97 → 30 |
| design-system.md → merge into linting page or ui-design/foundation.md | Stories beside components in `ds/`, MockProviders for routed surfaces | 50 → 15 (or 0) |
| linting-and-formatting.md | The lint chain, Biome vs ESLint split, zero warnings, link governance README | 66 → 20 |
| work-packages.md | DELETE | 28 → 0 |
Subtotal ≈ 593 → ~220.

deployment/ (published)
| Page | Purpose | Lines before → after |
|---|---|---|
| index.md | Desktop app install (DMG/Homebrew), what first run asks, local vs shared mode, where data lives; table of the other ways to run it | 20 → 25 |
| laptop.md | Keep only if the service is fixed; else fold its 3 facts into getting-started (keep file or update doc-links.test.ts) | 38 → 10 |
| self-hosting.md | Running remote-server on your own Postgres: required env (`HYPERIDLE_API_KEY`, `DATABASE_URL`, `HYPERIDLE_PROFILE=cloud`), migrate, bootstrap, health check, agents come from workers/desktops. VPS compose section deleted until it boots | 80 → 30 |
| shared-backend.md | Unpublish or trim to the tenant chart/workflow facts; no local paths | 128 → 45 |
| releases.md | Version bump flow, workflows, secrets | 84 → 50 |
Also: merge docs/guides/user/deployment.md into deployment/index.md. Subtotal ≈ 350 → ~160.

requirements/ — DELETE the folder (≈305 → 0). It is a second copy of the layer docs (every section already names its owner), a third of its items are false after Track BC, and it carries work ids and history. Before deleting: move the 3 standing decisions to docs/architecture/decisions.md; reword the six S-9.2 code comments; fix inbound links (docs/architecture/{decisions,index,system-overview}.md, docs/human-interface-layer/{overview,the-three-views}.md, docs/ui-design/index.md, docs/agent-layer/harness-coverage-enforcement.md); drop `requirements/` from .claude/rules/docs.md and CLAUDE.md's doc list.

Total for scope: ≈ 1,248 → ~380 lines.
