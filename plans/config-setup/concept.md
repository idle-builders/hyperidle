# Concept: Configuration, Setup & Onboarding

## Summary

Six primitives govern how HyperIdle boots, connects, identifies participants, and guides new users. Three are kernel infrastructure (BackendMode, AppConfig, Credential). One is kernel identity (User — unified human + AI). One is kernel org-structure (OrgChart — hierarchy for routing reviews/approvals). One is strategy (FirstTimeHints — embedded contextual guidance).

---

## Required reading for downstream skills

- `plans/kernel-seperation/concept.md` — kernel/strategy boundary definition
- `plans/kernel-seperation/architecture.md` — technical separation plan
- `docs/architecture/system-overview.md` — three-layer system overview
- `docs/process-layer/the-five-primitives.md` — Bet, Task, Session, Team, Routine
- `docs/human-interface-layer/one-app-two-form-factors.md` — desktop/mobile form factors
- `docs/deployment/laptop.md`, `docs/deployment/vps.md` — current deployment profiles
- `packages/desktop/src/main.ts` — current desktop boot sequence
- `packages/server/src/routes/settings.ts` — current settings API
- `packages/db/src/schema.ts` — current schema (agents table, factorySettings)

---

## Primitives

### 1. BackendMode (kernel / infrastructure)

**Definition.** A runtime configuration choice that determines which server instance the desktop client connects to.

**Essential properties.**
- `mode`: `local` | `shared` — the two variants
- `serverUrl`: where to send API requests (`127.0.0.1:<port>` for local, operator-provided URL for shared)
- `credential`: the API key used to authenticate (auto-generated for local, provided by operator for shared)
- `healthy`: boolean — the client has verified the backend is reachable and authenticated

**What it is not.**
- Not a deployment profile. Deployment profiles (laptop/VPS/cloud) are operator concerns for provisioning the shared backend. BackendMode is the client-side choice of which backend to use.
- Not a build variant. The same desktop binary supports both modes. No recompilation.
- Not a feature flag. It's infrastructure — the app cannot function without a resolved BackendMode.

**Composition.** BackendMode is the foundation that Credential, AppConfig, and User depend on. Local mode embeds the server and database. Shared mode connects to a remote server where those already exist.

**States.** `unset` → `selected` → `connected`. On first launch, BackendMode is unset and the SetupFlow prompts selection. Once selected and health-checked, it moves to connected. Switching modes later is possible via settings (requires restart for local↔shared).

**Authority.** The desktop client owns BackendMode selection. It's stored in a local config file in userData (not in the database — because the database might be remote).

**Contracts.**
- Cardinality: exactly one BackendMode per desktop installation at any time.
- Mutability: changeable via settings, but requires app restart to take effect.
- Identity: implicit singleton — stored as a config key, not an entity with an ID.
- Hard rule: the app must not render the main UI until BackendMode is `connected` (health-check passed).

---

### 2. AppConfig (kernel / infrastructure)

**Definition.** A structured configuration store that replaces environment variables for the desktop app and unifies runtime settings into a typed, validated record.

**Essential properties.**
- `location`: where the config is stored — local file (client-only config) or database (server-persisted config)
- `schema`: typed, validated, with defaults — not a string KV bag
- `scope`: client-local (window state, backend mode, appearance) vs server-shared (notifications, org settings)

**What it is not.**
- Not environment variables. Desktop apps don't read env vars. Env vars are for shared backend deployment only (the operator sets them before the server boots).
- Not secrets. Credentials have their own encrypted storage. AppConfig values are not sensitive.
- Not user preferences that belong in `localStorage` (theme, density stay in the browser).
- Not the `factorySettings` KV table as-is. The current KV bag has no schema, no types, no validation. AppConfig is the concept that factorySettings evolves into for structured server-side config.

**Composition.** 
- Client-local config: BackendMode selection, window state (bounds, maximized), last-used view. Stored in a JSON file in userData.
- Server-persisted config: notification preferences, org structure defaults, future observability (OTEL) settings. Stored in the database with a typed schema.

**Authority.**
- Client-local config: owned by the desktop process. Read on boot, written on state change.
- Server-persisted config: owned by the server. Read/written via API. Multiple clients sharing a backend see the same server config.

**Contracts.**
- Closure: the config schema is closed. Adding a new config key requires a schema update (type definition + migration).
- Mutability: all config is mutable at runtime (some require restart to take effect).
- Identity: no entity identity — config is a singleton record per scope.
- Hard rule: the desktop app must NEVER require the user to edit a file or set an environment variable to use the app. All desktop configuration happens through the UI.

---

### 3. Credential (kernel / infrastructure)

**Definition.** A named secret required for an external service to function. Without it, the dependent capability is inert.

**Essential properties.**
- `name`: identifies the service ("anthropic_api_key", "openrouter_api_key", "shared_backend_key")
- `value`: the secret (encrypted at rest via OS keychain / Electron safeStorage)
- `required`: whether the system can function without it. The local API key is auto-generated and always present. Harness credentials (Anthropic) are required for agents to run but absent on fresh install.
- `testable`: whether the credential can be validated by calling the service (API key → test auth call)

**What it is not.**
- Not configuration. Configuration has defaults and the system works without user input. Credentials have no defaults — the service either works or it doesn't.
- Not a factorySettings entry. Credentials need encryption at rest. factorySettings is plaintext in SQLite.
- Not an environment variable (for desktop). Env vars are only for shared backend deployment where the operator provisions the server.

**Composition.** Credentials feed into the Agent Runtime layer (harness adapter needs API keys) and into BackendMode (shared backend needs a connection credential).

**States.** `absent` → `entered` → `validated` (optional, if testable). A credential transitions from absent to entered when the user provides it. If the credential is testable, a validation call confirms it works.

**Authority.** 
- Local mode: the desktop process owns credential storage (Electron safeStorage / OS keychain).
- Shared mode: the server owns credential storage (encrypted at rest in the database). The desktop client provides credentials via the SetupFlow; the server persists them.

**Contracts.**
- Cardinality: one value per named credential. No versioning (rotation = overwrite).
- Mutability: the user can update/rotate credentials at any time via settings.
- Identity: identified by `name` (a fixed, known set — not user-extensible).
- Hard rule: credential values are NEVER included in API responses, logs, or error messages. Only presence/absence is surfaced.
- Hard rule: on fresh install, the app must clearly communicate which credentials are needed and what happens without them (agents can't run), without blocking the user from exploring the UI.

---

### 4. User (kernel / identity)

**Definition.** A participant in the system — human or AI. One entity type, one table, no distinction at the structural level. What differs is capabilities (humans authenticate, AI users bind to harnesses) and properties (humans have emails, AI users have soul prompts).

**Essential properties.**
- `id`: unique identifier
- `kind`: `human` | `ai` — the only structural distinction
- `name`: display name
- `role`: their function in the system (builder, product_manager, growth, etc. — humans get roles too)
- `status`: active | paused | deactivated
- `teamId`: which team they belong to (nullable — some users are cross-team)

Human-specific (nullable for AI):
- `email`: contact address
- `avatarUrl`: visual identity

AI-specific (nullable for humans):
- `soulPromptPath`: persona definition
- `skills`: capability list
- `maxConcurrentSessions`: concurrency limit
- `costCapMinor` / `costCapCurrency`: spending limits

**What it is not.**
- Not two separate tables. There is no `agents` table and `users` table. There is one `users` table. The current `agents` table is renamed.
- Not an auth principal. Authentication is handled by Credential (API key). User identity is about "who you are in the org" not "how you prove your identity to the server."
- Not an access-control subject (yet). Access management is a later concern. For now, the hierarchy determines routing, not permissions.

**Composition.** Users belong to Teams. Users are connected to other Users via the OrgChart. Users own Sessions (AI users), create Bets (human users), and participate in Threads (both).

**Authority.** The server owns the users table. Human user profiles are created during SetupFlow (first-run) and editable in settings. AI users are provisioned when a Product/Team is created.

**Contracts.**
- Cardinality: many users per installation. In local mode, typically one human + N AI users. In shared mode, multiple humans + N AI users.
- Closure: `kind` is closed (`human` | `ai`). `role` is open (new roles can be added without schema change).
- Mutability: name, email, avatarUrl, status, teamId are mutable. `id` and `kind` are immutable.
- Identity: opaque string ID (prefixed: `u-` for human, `a-` for AI — preserves current agent ID convention while adding humans).
- Hard rule: the current hardcoded `u-founder` identity and `factorySettings.founder_name`/`founder_email` are eliminated. The human user is a row in the users table like every other participant.

---

### 5. OrgChart (kernel / org-structure)

**Definition.** A directed hierarchy between Users that determines who reviews, approves, and escalates to whom. Like a company org chart — it defines reporting lines and responsibility.

**Essential properties.**
- `edges`: directed relationships between users (superior → subordinate)
- `definition mechanism`: how an edge is established — three ways:
  1. **Direct**: User A is responsible for User B (1:1 explicit edge)
  2. **Function**: User A is responsible for all users with role X ("all devs report to the engineering lead")
  3. **Team/Product**: User A is responsible for Product P's team (= product lead for that team)
- `purpose`: routing — when a review/approval/escalation is needed, the OrgChart determines who gets it

**What it is not.**
- Not access control. The OrgChart doesn't gate what you can see or do. It routes attention: who should review this? who should approve that? who gets escalated to?
- Not team membership. Team membership (user.teamId) says who's on the team. OrgChart says who the team reports to.
- Not a workflow engine. The OrgChart doesn't define sequences. It defines relationships that routing logic queries.
- Not a feature of the human interface layer. It's kernel data that strategy (routing, attention, reviews) consumes.

**Composition.** OrgChart sits on top of Users and Teams. The strategy layer (policy engine, review routing, escalation logic) reads the OrgChart to make routing decisions.

**Definition mechanisms in detail:**
- **Direct edge**: `{ from: userId, to: userId }` — A is responsible for B
- **Function edge**: `{ from: userId, role: "builder" }` — A is responsible for all users with role "builder"  
- **Team edge**: `{ from: userId, teamId: teamId }` — A is responsible for this team (product lead)

These compose freely. A human user might be directly responsible for the Chief of Staff (direct), responsible for all builders (function), and the product lead for Ambrovia (team). The routing logic unions all applicable edges.

**Authority.** Defined by human users during setup or via settings. Stored in the database. The OrgChart is explicit — it doesn't infer relationships from other data.

**Contracts.**
- Cardinality: a user can have zero or many responsibility edges. A user can report to zero or many superiors (matrix).
- Closure: the three definition mechanisms (direct, function, team) are closed. Adding a fourth requires a concept update.
- Mutability: edges are freely added/removed at any time.
- Identity: edges are identified by their (from, mechanism, target) tuple — no separate edge ID needed.
- Hard rule: if no OrgChart is defined, routing falls back to "all human users see all reviews." The system works without an OrgChart — it just routes broadly.

---

### 6. FirstTimeHints (strategy / experience)

**Definition.** Embedded contextual guidance that surfaces when a user encounters a capability for the first time. Subtle, non-blocking, disappears after the moment.

**Essential properties.**
- `trigger`: what causes the hint to appear (first bet creation, first review, first knowledge item, empty state in a view)
- `content`: the extra information or visual emphasis (highlighted button, inline explanation, subtle callout)
- `dismissal`: automatic (after the action is taken) or explicit (user dismisses). Once dismissed, never returns.
- `progress`: which hints have fired, stored per-user

**What it is not.**
- Not a wizard or modal flow. Hints are embedded in the existing UI, not overlaid on it.
- Not tooltips or popovers triggered by hover. They appear contextually when the moment arrives.
- Not a checklist or progress tracker visible in the UI. There's no "onboarding progress" widget.
- Not blocking. The user can ignore hints and proceed normally. Hints enhance, they don't gate.
- Not a tutorial. They don't explain the UI — they provide context for why you'd want to do something ("You created a product. Create a bet to give your team something to work on.").

**Composition.** FirstTimeHints subscribe to kernel events (ProductCreated, BetCreated, etc.) to know when to trigger. They read the User's hint-progress to know what's already been seen. They render inline in the relevant view.

**Authority.** The strategy layer owns hint definitions (what triggers, what content, where it renders). The kernel provides the events. Hint progress is stored per-user in the database (a simple set of "seen hint IDs").

**Contracts.**
- Cardinality: many hints defined in the system. Each fires at most once per user.
- Closure: the hint catalog is open — new hints can be added without schema change (they're just strategy config, not kernel entities).
- Mutability: hint content is mutable (strategy can update copy). Hint progress (per-user) is append-only (once seen, stays seen).
- Identity: each hint has a stable string ID (e.g., `"first-bet"`, `"first-review"`).
- Hard rule: hints must be subtle. No modals, no blocking overlays, no step-by-step forced flows. They're embedded in the view where the action is happening. If removing the hint from the UI wouldn't break anything, it's the right level of subtlety.

---

## Kernel/Strategy Classification

| Primitive | Layer | Rationale |
|---|---|---|
| BackendMode | Kernel (infrastructure) | Determines where data lives. Below the entity layer. |
| AppConfig | Kernel (infrastructure) | Configuration storage is foundational. Strategy can add config keys via the schema. |
| Credential | Kernel (infrastructure) | Agent Runtime needs credentials to function. No strategy dependency. |
| User | Kernel (identity) | "Users: agents and humans, with roles and team membership" — explicitly kernel per concept doc. |
| OrgChart | Kernel (org-structure) | The graph connecting users. Strategy reads it for routing but doesn't own it. |
| FirstTimeHints | Strategy (experience) | Attention-routing for new users. The kernel functions without hints. |

---

## SetupFlow (kernel infrastructure — the boot gate)

The SetupFlow is not a separate primitive — it's the **sequence** in which the infrastructure primitives are resolved on first launch. It's a UI over BackendMode + User + Credential, not a concept in its own right.

**Steps (first launch, desktop):**

1. **BackendMode selection** — "Run locally" or "Connect to shared backend"
   - Local: no further backend config needed (embedded server boots automatically)
   - Shared: enter server URL + credential → health check → proceed

2. **User creation** — name + email (human user row in users table)
   - Local: creates the user in the local database
   - Shared: registers the user with the remote server

3. **First Product** — name + optional repo path
   - Creates product, team, provisions default AI users (builder, pm)

4. **Credential entry** (optional, can be deferred)
   - "Add your Anthropic API key so agents can start working"
   - Clearly communicates: without this, agents are inert
   - Can be skipped — the user can explore the UI without agents running

5. **Done** — main app loads. FirstTimeHints take over from here.

The SetupFlow is blocking — the main UI doesn't render until at least steps 1-3 are complete. Step 4 is deferrable.

---

## What gets purged

- All Langfuse code, types, adapters, config keys, tests, and documentation references. Observability will be rebuilt on OpenTelemetry later as a separate workpackage.
- The `factorySettings` keys `founder_name` and `founder_email` — replaced by the human user's row in the users table.
- The hardcoded `u-founder` ID in the auth middleware — replaced by a proper user lookup.
- The `VITE_HYPERIDLE_API_KEY` env var pattern for the web frontend — replaced by the desktop preload injection (local) or a session-based approach (shared).
- The current Onboarding page (`packages/web/src/pages/Onboarding.tsx`) — replaced by the multi-step SetupFlow.

---

## What gets renamed

- `agents` table → `users` table (migration: rename + add `kind` column, backfill existing rows with `kind = 'ai'`)
- `factorySettings` table → evolves into typed AppConfig schema (server-persisted config gets proper columns instead of KV strings)

---

## Vocabulary lock

| Term | Definition | Aliases NOT to use |
|---|---|---|
| **User** | A participant in the system — human or AI. | agent, member, participant, actor, person, founder |
| **OrgChart** | Directed hierarchy between users. Determines routing. | responsibility graph, reporting structure, team assignment, permissions |
| **BackendMode** | Client-side choice: local or shared server. | deployment profile, environment, instance type |
| **AppConfig** | Typed configuration store (client-local + server-persisted). | settings, preferences, env vars, factory settings |
| **Credential** | Named secret for an external service. | API key (too specific), secret, token, config |
| **FirstTimeHints** | Subtle embedded guidance on first encounter. | onboarding, wizard, tutorial, walkthrough, tooltips |
| **SetupFlow** | The blocking first-launch sequence. | onboarding journey, welcome flow, getting started |

---

## Rationale

The current system has identity, config, and credentials scattered across four mechanisms (env vars, factorySettings KV, secrets.json, Electron safeStorage) with no coherent model. The "founder" is a hack — a human stored differently from every other participant. The onboarding drops users into a product without explaining how to make agents work.

This concept unifies: one table for all participants (User), one model for org hierarchy (OrgChart), one encrypted store for secrets (Credential), one typed config per scope (AppConfig), one infrastructure choice (BackendMode), and one subtle guidance system (FirstTimeHints). Each primitive has a clear owner, a clear boundary, and a clear reason for existing.

The kernel/strategy split is clean: the system boots and functions without FirstTimeHints. The OrgChart has a sensible fallback (route broadly). Credentials can be deferred. The only hard gates are BackendMode, User creation, and first Product — the minimum for the kernel to have something to work with.
