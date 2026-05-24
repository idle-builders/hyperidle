# Track P: Configuration, Setup & Onboarding

Rework the entire configuration, setup, and onboarding flow. Unify human and AI participants into one `users` table, introduce an org chart for routing reviews/approvals, replace env vars with a typed config system for the desktop app, add local/shared backend selection, and build the first-run setup and settings UI properly.

**Concept:** `plans/config-setup/concept.md`

**Constraint:** After each work package merges to main, `bun dev` must work — the app runs in dev mode at every merge boundary. Schema migrations must be backwards-compatible (no data loss on existing installations).

---

### P1 — Purge Langfuse and dead observability code

**Workpackage.** As a developer, I want all Langfuse-specific code, types, adapters, tests, config keys, and documentation references removed from the codebase, so that the observability surface is clean for a future OpenTelemetry-based implementation. The observability adapter interface stays (it's a valid extension point) but the Langfuse implementation, its config UI/API surface, and all references are deleted.

**Depends on.** None.

**Complexity.** M

**Acceptance criteria.**
- The `langfuse-adapter.ts` file and its integration test are deleted.
- All `observability.langfuse_*` config keys, the `sanitizeLangfuseUrl` and `sanitizeLangfuseKey` functions, and the `LangfuseConfig` type are removed.
- The observability config API (`GET/PATCH /api/observability/config`) no longer exposes Langfuse fields. The adapter enum becomes `"console" | "noop"` (no `"langfuse"`).
- The `ObservabilityChannel` type and `ADAPTERS` set are updated to reflect only console and noop.
- All Langfuse references in docs (`docs/architecture/system-overview.md`, `docs/architecture/technology-summary.md`, `docs/architecture/components.md`, `docs/requirements/system-requirements.md`, `docs/architecture/deployment-architecture.md`) are removed or updated to say "OpenTelemetry (planned)."
- The `langfuse` npm dependency is removed from `package.json`.
- Any SSRF sanitizer code that exists solely for Langfuse URL validation is removed (keep the generic `sanitizeHttpUrl` if used elsewhere).
- `bun run check`, `bun run lint`, `bun run test` all pass.
- `bun dev` starts and the app works in the browser.

**Validation scenarios.**
- Given the purge is complete, when I `grep -ri "langfuse" packages/ docs/` then zero results are returned (excluding `plans/` and `node_modules/`).
- Given the observability config API, when I `PATCH /api/observability/config` with `{ "adapter": "langfuse" }`, then the server returns 400 (invalid adapter).
- Given the codebase, when I run `bun run verify`, then it passes with zero errors.

**Plan calls.** Skip /design step. Straightforward deletion — identify all references via grep, remove them, fix broken imports, update docs. No new code beyond tightening the adapter enum.

**Contracts / constraints.**
- The `ObservabilityAdapter` interface stays — it's the extension point for future OTEL work.
- The console adapter stays as the default.
- The `dispatcher.ts` service stays (it dispatches to whatever adapter is configured).
- No new observability features in this WP — this is purely a purge.

**Out of scope.**
- Building OpenTelemetry integration (separate future track).
- Removing the observability API surface entirely (console + noop adapters remain useful).
- Any changes to the `redact.ts` utility beyond removing Langfuse-specific redaction.

**Effort.** M (~3h)

---

### P2 — Unified User primitive and OrgChart

**Workpackage.** As a user of HyperIdle, I want all participants (human and AI) to live in one `users` table with a `kind` column, and I want an org chart that defines who is responsible for whom — so that the system has a single identity model and can route reviews, approvals, and escalations based on explicit hierarchy rather than hardcoded assumptions.

**Depends on.** None (works against current `main`).

**Complexity.** L

**Acceptance criteria.**
- The `agents` table is renamed to `users` via a migration that preserves all existing data. A `kind` column is added (`"human" | "ai"`, default `"ai"`, backfilled for existing rows).
- Human-specific nullable columns added: `email`, `avatarUrl`.
- The hardcoded `u-founder` identity and `factorySettings` keys `founder_name`, `founder_email` are eliminated. The human user is a row in the `users` table created during setup.
- All code references to `agents` (table name, type imports, route paths, test fixtures) are updated to `users`. The API resource name changes from `/api/agents` to `/api/users`.
- A new `org_edges` table is created: `fromUserId`, `mechanism` (`"direct" | "function" | "team"`), `target` (userId for direct, role string for function, teamId for team), with a composite unique constraint.
- API endpoints exist: `GET /api/org` (returns the full org chart), `PUT /api/org/edges` (set edges for a user), `DELETE /api/org/edges/:id`.
- The auth middleware resolves the authenticated user from the `users` table (by matching the API key to the installation's human user) instead of hardcoding `u-founder`.
- When no org chart edges exist, the system falls back to "all human users receive all reviews" — the OrgChart is optional, not required.
- Drizzle schema files for both SQLite and PostgreSQL are updated. `bun run db:generate` produces the migration.
- All existing tests pass after the rename. New tests cover: user CRUD, org edge CRUD, auth resolution from users table, fallback routing when no edges defined.
- `bun run verify` passes.

**Validation scenarios.**
- Given a fresh database after migration, when I run `bun run setup`, then a human user row is created in `users` with `kind = "human"` and the product-creation flow provisions AI users with `kind = "ai"` in the same table.
- Given an existing database with agents, when the migration runs, then all rows gain `kind = "ai"` and no data is lost. The app boots normally.
- Given org edges `[{ from: humanUser, mechanism: "team", target: teamA }]`, when a review is created for teamA, then only `humanUser` is routed the review (not all humans).
- Given no org edges defined, when a review is created, then all human users are routed the review (fallback behavior).

**Plan calls.** Multi-version exploration on the org edge schema (the three mechanisms — direct/function/team — need careful data modeling). Standard architecture pass for the migration strategy.

**Contracts / constraints.**
- Migration must be forward-only and non-destructive. Existing `agents` data is preserved verbatim.
- The API rename (`/api/agents` → `/api/users`) must be clean — no backwards-compat shim, no redirect. Downstream consumers (web frontend) update in the same PR.
- `kind` is closed: only `"human"` or `"ai"`. Adding a third kind requires a concept update.
- Org edge `mechanism` is closed: `"direct" | "function" | "team"`. Adding a fourth requires a concept update.
- The org chart is read by the strategy layer (routing/escalation) but owned by the kernel. No fabric imports in the org implementation.

**Out of scope.**
- Access control (who can see/do what based on org position) — later.
- Multi-user authentication (login screens, sessions, user switching) — later. For now, local mode has exactly one human user; shared mode may have multiple but auth is still API-key-based.
- UI for managing the org chart — that ships in P4.

**Effort.** L (~3d)

---

### P3 — App Infrastructure: BackendMode, AppConfig, and Credential

**Workpackage.** As a desktop app user, I want the app to manage all its configuration through the UI (never requiring me to edit files or set environment variables), support choosing between a local embedded backend or a shared remote backend, and store my API credentials securely and encrypted — so that installation is double-click-and-go with no terminal knowledge required.

**Depends on.** P2 (User table must exist — credentials are scoped to users, AppConfig references user IDs, BackendMode determines how users authenticate).

**Complexity.** L

**Acceptance criteria.**

_BackendMode:_
- A `backend-mode` key in the client-local config file (stored in Electron userData, not in the database) holds the current mode: `"local"` or `"shared"`.
- Local mode: the desktop app boots the embedded server (current behavior, formalized).
- Shared mode: the desktop app connects to a remote server URL (stored in client-local config) using a provided API key (stored as a Credential).
- Switching modes requires app restart. The UI communicates this clearly.
- A health check verifies connectivity before the app proceeds to the main UI regardless of mode.

_AppConfig:_
- Client-local config is a typed JSON file in userData (`config.json`): contains `backendMode`, `serverUrl` (for shared), `windowState`, `lastView`. Validated on read with a Zod schema; corrupt files fall back to defaults.
- Server-persisted config replaces the `factorySettings` KV bag for structured data: notification preferences get proper typed columns (or a typed JSON column) instead of string key-value pairs. The `factorySettings` table is either replaced with a typed `app_config` table or restructured with a validated schema layer on top.
- The desktop app never reads `process.env` for any user-facing configuration. Env vars are only used for shared backend deployment (operator sets them before server boot).

_Credential:_
- All credentials are stored encrypted via Electron safeStorage (local mode) or transmitted to the server for encrypted storage (shared mode).
- Credentials have a fixed catalog: `anthropic_api_key`, `openrouter_api_key`, `shared_backend_key`. The catalog is not user-extensible.
- Each credential is testable: providing a credential triggers a validation call to the service (e.g., Anthropic API auth check). The UI shows validated/invalid/untested state.
- Credentials are never included in API responses, logs, error messages, or client-side state beyond "present/absent/valid/invalid."
- The existing `CredentialsTab` in SettingsPanel is refactored to use this unified credential system instead of the raw safeStorage IPC.

_Integration:_
- The `VITE_HYPERIDLE_API_KEY` env var pattern is eliminated from the web frontend. In local mode, the Electron preload injects the key. In shared mode, the key comes from the Credential store. In dev mode, a single `.env` file still works (developer convenience, not user requirement).
- The desktop boot sequence is updated: read client-local config → resolve BackendMode → boot or connect → health check → render.

**Validation scenarios.**
- Given a fresh desktop install, when the app launches for the first time, then no config file exists yet, BackendMode defaults to unset, and the SetupFlow (P4) is triggered.
- Given BackendMode is "local" and all credentials are absent, when the app boots, then the main UI renders (agents are inert but the app is usable). A clear indicator shows "No API key configured — agents cannot run."
- Given BackendMode is "shared" with a valid server URL and credential, when the app boots, then it connects to the remote server, health-checks, and renders the main UI with remote data.
- Given a credential is entered, when the user saves it, then a validation call fires and the UI shows "Valid" or "Invalid — check your key."
- Given a corrupt `config.json` in userData, when the app launches, then it falls back to defaults and boots normally (no crash).

**Plan calls.** Standard architecture pass — focus on the client-local config schema, the credential validation protocol, and the BackendMode switching mechanism. The shared-mode connection flow needs careful design (auth handshake, error states, reconnection).

**Contracts / constraints.**
- Zero env vars required to use the desktop app. This is a hard rule.
- Credential values never leave encrypted storage except when transmitted to the target service (Anthropic API, remote server).
- The credential catalog is closed (3 named credentials). Adding a new one requires a code change.
- Client-local config is independent of the database — it must be readable before the database is available (because BackendMode determines which database to use).
- Backwards-compatible: existing desktop installations (with `secrets.json`) are migrated on first launch to the new credential system.

**Out of scope.**
- The SetupFlow UI (first-run wizard that collects BackendMode + credentials) — that's P4.
- Multi-user auth for shared mode (login screen, user sessions) — later.
- OpenTelemetry configuration — later, separate track.

**Effort.** L (~4d)

---

### P4 — SetupFlow and Settings redesign

**Workpackage.** As a new user launching HyperIdle for the first time, I want a clear multi-step setup that gets me from "app installed" to "agents doing useful work" — and as a returning user, I want a settings experience that actually persists my changes, looks good, and covers identity, org structure, credentials, and preferences in one cohesive surface.

**Depends on.** P2 (User table + OrgChart), P3 (BackendMode + AppConfig + Credential).

**Complexity.** L

**Acceptance criteria.**

_SetupFlow (first-run boot gate):_
- On first launch (no config file exists), the app shows the SetupFlow instead of the main UI.
- Step 1: BackendMode selection — "Run locally" (default, one click) or "Connect to shared backend" (requires URL + credential entry + health check).
- Step 2: User identity — name and email (creates the human user row in the users table).
- Step 3: First Product — name + optional repository path (same as today's onboarding, but in the multi-step context).
- Step 4: Credentials (optional, deferrable) — "Add your Anthropic API key so your team can start working." Clear explanation of what happens without it. Skip button.
- After completing step 3 (minimum), the main UI renders. Step 4 can be revisited in Settings.
- The old single-page `Onboarding.tsx` is replaced by this flow.
- The `FirstRunRedirect` component is updated to check for SetupFlow completion (config file exists + user row exists + at least one product exists).

_Settings redesign:_
- The current tab-based modal is replaced with a redesigned settings surface. No more tabbed modal — the specific layout is determined by `/design` but it must not be tabs-in-a-modal.
- Profile section: name and email edits persist via `PATCH /api/users/:id`. The "edits silently revert" bug is fixed.
- Org Chart section: visualize and manage responsibility edges. Add/remove direct, function, and team edges.
- Credentials section: unified credential management (from P3) with validation state per credential.
- Notifications section: quiet hours, alert toggles, muted products (current functionality, properly persisted).
- Appearance section: theme + density (density now persists to client-local config, not session-only).
- Products section: list products, toggle active/archived.
- BackendMode section: show current mode, option to switch (with restart warning).

_Persistence fixes:_
- All settings changes actually persist. Profile → server. Appearance → client-local config. Notifications → server. Credentials → encrypted store.
- Density preference persists across app restarts (stored in client-local config alongside theme).

**Validation scenarios.**
- Given a fresh install, when the app launches, then the SetupFlow appears (not the main UI). After completing steps 1-3, the main UI renders with the created product visible.
- Given a user skips credential entry in SetupFlow, when they later open Settings → Credentials, then they can add the key there and agents begin working.
- Given a user edits their name in Settings, when they close and reopen Settings, then the new name persists (not reverted).
- Given a user changes density to "compact" and restarts the app, then compact density is applied on next launch.
- Given a shared backend user, when they open Settings → BackendMode, then they see their current connection and can switch to local (with restart warning).

**Plan calls.** Requires `/design` for the SetupFlow steps and the Settings surface layout (replace tabs with something better). Standard architecture pass for the API changes (profile PATCH, density persistence, setup completion detection).

**Contracts / constraints.**
- SetupFlow is blocking — the main UI does not render until at least BackendMode + User + first Product are complete.
- Settings must be accessible from the same surface as today (avatar click / menu) — no new navigation paradigm.
- The settings surface must handle both local and shared mode gracefully (some sections are mode-specific: BackendMode switching, shared-backend URL).
- No AI-aesthetic patterns (AQ rules apply): no wizard progress dots, no oversized cards, no gradient backgrounds, no marketing copy. This is a work tool — the setup should feel like configuring a professional instrument.
- All state changes in settings are explicit (save button or immediate-apply with clear feedback) — no ambiguous draft state that silently reverts.

**Out of scope.**
- Multi-user login screen for shared mode (later — for now, shared mode uses one API key per client).
- Org chart visualization as a graphical tree diagram (a list/table of edges is sufficient for v1).
- Mobile form factor for settings (desktop-first for this WP).

**Effort.** L (~5d)

---

### P5 — FirstTimeHints

**Workpackage.** As a new user encountering HyperIdle features for the first time, I want subtle embedded guidance that helps me understand what to do next without being intrusive — so that I can learn the system organically through use rather than reading docs or watching tutorials.

**Depends on.** P4 (SetupFlow must exist — hints pick up where setup leaves off. Settings must work — hint progress is tied to the user.)

**Complexity.** M

**Acceptance criteria.**
- A `hint_progress` table (or equivalent storage) tracks which hints each user has seen. Schema: `userId`, `hintId`, `seenAt`.
- An initial catalog of hints is defined (minimum 5, covering the critical first-use path):
  1. After first product created: "Create a bet to give your team something to work on" (contextual on the empty product page).
  2. After first bet created: "Your team will pick this up. Add a credential in Settings if you haven't yet" (contextual on the bet detail).
  3. First time in Knowledge view with zero items: "Knowledge items are created by your team as they work. You can also add your own" (empty state enhancement).
  4. First review thread appears: brief context on the verdict actions available.
  5. First time opening the Rail: what the indicators mean.
- Hints render inline in the relevant view — never as modals, popovers, tooltips, or overlay flows.
- Hints are visually subtle: a highlighted button, a short inline text block, a gentle callout. They use existing design tokens and never introduce new visual patterns.
- Each hint fires at most once per user. After the user takes the action (or explicitly dismisses), the hint disappears permanently.
- Hints are non-blocking — the user can ignore them entirely and use the app normally.
- The hint system is extensible: adding a new hint requires only adding an entry to the catalog and a trigger condition (event or view state) — no new components or infrastructure.
- `bun run verify` passes. Playwright tests cover: hint appears on trigger, hint disappears after action, hint never reappears.

**Validation scenarios.**
- Given a new user who just completed SetupFlow and has one product, when they land on the product page with zero bets, then hint #1 appears inline suggesting bet creation.
- Given the user has seen hint #1 and created a bet, when they return to the product page, then hint #1 is gone. Hint #2 appears on the bet detail.
- Given a returning user with all hints seen, when they navigate the app, then no hints appear anywhere (clean UI).
- Given a second human user on a shared backend, when they use the app for the first time, then they get their own hint progression (not affected by the first user's progress).

**Plan calls.** Standard architecture pass — the hint storage schema is simple, the trigger mechanism needs design (event subscription vs view-state check). `/design` may be needed for the visual treatment of hints (inline callout styling) but this should be minimal — the goal is subtlety.

**Contracts / constraints.**
- Hints are strategy-layer code — they subscribe to kernel events but live in `packages/fabric` (or a new hints module within fabric).
- Hints must never feel like a product tour or a marketing funnel. No numbered steps, no progress indicators, no "3 of 7 complete" badges.
- Hint copy is concise — one sentence, action-oriented, no jargon.
- The hint catalog is open (new hints can be added freely) but the rendering mechanism is closed (always inline, never overlay).
- `createApp({ strategyBootstrap: undefined })` must still work — no hints appear when strategy is disabled.

**Out of scope.**
- Animated hint transitions or attention-grabbing animations.
- A "tips" or "help" section in settings where users can re-read dismissed hints.
- Hints for admin/operator features (deployment, observability).
- Contextual documentation links or "learn more" buttons.

**Effort.** M (~2d)
