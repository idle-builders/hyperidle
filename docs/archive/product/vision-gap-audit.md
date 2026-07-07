# Vision Gap Audit — HyperIdle

**Audit date:** 2026-06-05
**Last verified:** 2026-06-05
**Scope:** Product docs (`docs/product/`), `ETHOS.md`, architecture docs (`docs/architecture/`), process-layer docs (`docs/process-layer/`), agent-layer docs (`docs/agent-layer/`) cross-referenced against `packages/db/`, `packages/server/`, `packages/web/`, `packages/fabric/`, `packages/shared/`, `packages/desktop/`

---

## 1. Executive Summary

HyperIdle is in active development and most core primitives have working implementations. The schema, API layer, and knowledge fabric are substantially built. The desktop shell (Electron) exists and runs the embedded server. The product documentation accurately describes the vision and many core behaviors.

However, four categories of gaps exist:

1. **Terminology drift** — the implementation has renamed several core concepts (Product→Team, pitch→description, shaped/committed/shipped→draft/active/completed) but the product docs still use the old vocabulary. This creates a false picture for anyone reading docs alongside code.
2. **UI simplification gaps** — the factory UI has undergone significant architectural restructuring (the right sidebar was removed in U6, the Canvas view does not exist as a standalone surface, the left nav was replaced by a unified Sidebar) that the product docs do not acknowledge.
3. **Missing documented features** — several features described as working in the docs are not yet implemented (global search API, agent inbox routes, pitch expiry, autonomy-level UI management, weekly practice meetings UI, mobile form factor).
4. **Implemented features not mentioned** — git export, MCP bridge, policy engine, hint/onboarding system, and the PGlite migration are implemented but undocumented in the product story layer.

The product story documents (`docs/product/`) are written at an aspirational/design level and correctly acknowledged as describing "the product as designed" with "features landing continuously." The critical issues are the ones where the docs describe behavior that *actively contradicts* what users will experience.

---

## 2. Critical Findings

### C1 — Database technology contradicts architecture documentation

**What the docs say:** `docs/architecture/components.md` §2.1 states "SQLite by default. One database file per factory instance (`hyperidle.db`)." `docs/architecture/decisions.md` states "SQLite via `better-sqlite3`." `docs/architecture/technology-summary.md` says "better-sqlite3 for native SQLite."

**What the system does:** The implementation uses **PGlite** (`@electric-sql/pglite`) for the laptop/test profile and **postgres-js** for VPS/cloud. `packages/db/src/connection.ts` imports `PGlite` from `@electric-sql/pglite` and exposes a `HyperIdleDb` type covering both. The desktop uses `hyperidle-pg/` (a PGlite directory) not `hyperidle.db` (a SQLite file).

**Severity:** Critical — architecture docs and multiple decision records describe the wrong technology. Any developer reading the architecture to understand the storage layer will build wrong mental models.

**Recommended resolution:** Update `docs/architecture/components.md` §2.1, `docs/architecture/decisions.md`, and `docs/architecture/technology-summary.md` to reflect PGlite + postgres-js. Remove all `better-sqlite3` references.

---

### C2 — Core domain terminology mismatch: Product vs Team

**What the docs say:** Product docs (`what-is-hyperidle.md`, `how-work-flows.md`, `how-knowledge-compounds.md`) consistently use "product" as the core domain entity — "the Acme team works on Acme," "teams form per product," "product-bound agents." `docs/architecture/components.md` schema shows `products (id, name, phase, ...)` and `teams (id, product_id, members, ...)`.

**What the system does:** The implementation uses `teams` as the product entity and `team_members` as the agent-membership group. The schema has `teams` (formerly `products`) and `team_members` (formerly `teams`). The rename is documented in `@lore U1` comments throughout the codebase: "Team (formerly Product) is the domain entity. TeamMember (formerly Team) is the agent-membership group." Routes use `/api/teams` (not `/api/products`).

**Severity:** Critical — every `products` table reference in `docs/architecture/components.md` and every "team" vs "product" usage in process docs is semantically inverted relative to the codebase. A developer onboarding from the docs will immediately fail to find the `products` table.

**Recommended resolution:** Update `docs/architecture/components.md` schema section to use `teams`/`team_members`. Update any doc that refers to "product" as the DB entity to use "team." The product docs (`what-is-hyperidle.md`) use "product" correctly in the UX sense (e.g., "the Acme product") — those are fine.

---

### C3 — Bet status vocabulary mismatch

**What the docs say:** `docs/process-layer/the-five-primitives.md` §3.1 shows Bet status as `shaped | committed | in_progress | shipped | killed`. `docs/product/how-work-flows.md` uses "shaped pitches," "committed bets," and "ships."

**What the system does:** `packages/shared/src/types.ts` defines `BET_STATUSES = ["draft", "active", "completed", "killed"]`. The `@lore U1` comment explains: "shaped→draft, committed|in_progress|behind|blocked|paused|review→active, shipped→completed." The API endpoints use `draft`, `active`, `completed`.

**Severity:** Critical — the five-primitives doc and product docs describe a six-state lifecycle that the codebase collapses into four states. The transition `commit` (draft→active) is the API's actual behavior. The "Canvas shows shaped pitches" terminology describes `draft` status bets.

**Recommended resolution:** Update `docs/process-layer/the-five-primitives.md` §3.1 Bet struct to reflect the actual four-state enum. Add a note that shaped=draft, committed/in_progress=active, shipped=completed.

---

## 3. Major Findings

### M1 — Right sidebar ambient panel does not exist in the UI ✓ RESOLVED (AE1)

**What the docs said:** Multiple docs described a persistent right sidebar showing ambient factory state (active bets, blockers, cost burn) as a core feature.

**What the system does:** Work package U6 replaced the old quad-column layout (left icons + submenu + main + right sidebar) with a single 200px left Sidebar. The `@lore U6` comment in `packages/web/src/shell/Sidebar.tsx` confirms the replacement. There is no right-sidebar ambient panel component in the UI. The `/api/rail` endpoint still exists and returns cost/blocker data, but there is no UI consumer rendering it as a panel.

**Resolution (AE1):** All non-archive docs updated to describe the current layout. Ambient awareness is now documented as: Conversations filter chips (triage state), WorkTeam AgentRow health indicators (agent status), Sidebar triage badge (unread count), and WorkTeam burn-vs-cap section (cost burn).

---

### M2 — Global search API endpoint does not exist

**What the system does:** `packages/web/src/hooks/useGlobalSearch.ts` calls `/api/search?q=...`. No such route is registered in `packages/server/src/app.ts`. The only search endpoint is `/api/knowledge/search` (FTS on knowledge items). The global Cmd+K search panel (`GlobalSearchPanel.tsx`) will get a 404 for every query.

**Severity:** Major — a built UI feature (Cmd+K global search) is silently broken because the backend endpoint it depends on was never implemented.

**Recommended resolution:** Either implement `GET /api/search` (cross-entity FTS across threads, bets, and knowledge) or change `useGlobalSearch` to call `/api/knowledge/search` with an appropriate scope.

---

### M3 — Agent inbox routes described in architecture are at wrong path

**What the docs say:** `docs/architecture/components.md` §2.5 specifies `POST /agents/:id/inbox` and `GET /agents/:id/inbox` as internal agent endpoints for harness adapters.

**What the system does:** The inbox is implemented at `GET /api/users/:id/inbox` and `POST /api/users/:id/inbox` in `packages/server/src/routes/users.ts`. The `/api/agents/` routes (in `packages/server/src/routes/agents.ts`) are the agent management CRUD API and do not expose an inbox endpoint.

**Severity:** Major — architecture documentation describes routes that would 404 in the running system. Any harness adapter attempting to use the documented path would fail.

**Recommended resolution:** Update `docs/architecture/components.md` §2.5 to show the correct agent inbox path (`/api/users/:id/inbox`).

---

### M4 — Bet appetite is money, not duration, but process docs show both

**What the docs say:** `docs/product/how-work-flows.md` says "The appetite is a Money cap (and optionally a TokenUsage cap), never a wall-clock-time cap." But the process doc `docs/process-layer/the-five-primitives.md` §3.1 shows `cost_appetite # Money — cap on total spend` — this is correct.

**What the system does:** The schema has `costAppetiteMinor` + `costAppetiteCurrency` (money in minor units). The old `appetite` duration-string column is deprecated (`@lore L17` — see `packages/db/src/schema.ts`). The `createBetSchema` in routes rejects the old `appetite` field with a strict Zod schema.

**Severity:** Major — the system actively rejects the old appetite string format with a 400, but the `docs/architecture/components.md` §2.1 schema still shows `appetite TEXT` in the `bets` table definition. Any developer copying that schema will build with the wrong field.

**Recommended resolution:** Update `docs/architecture/components.md` §2.1 bets schema to use `cost_appetite_minor INTEGER, cost_appetite_currency TEXT`. Remove `appetite TEXT` from the schema example.

---

### M5 — The "Canvas" view is described as a bet planning surface but does not exist as a standalone UI

**What the docs say:** `docs/product/what-is-hyperidle.md` says "The Canvas shows shaped pitches and committed bets." `docs/architecture/components.md` §2.5 lists `GET /bets/canvas` as an API endpoint.

**What the system does:** `GET /api/bets/canvas` exists and returns `{ draft: [...], active: [...], capacity: {...} }`. However, `packages/web/src/pages/WorkPortfolio.tsx` (the Work view entry point) was restructured in U9 to a "flat 2-column BetCard grid." The `@lore U9` comment explicitly states "Canvas and Kanban views removed." Tests confirm `expect(screen.queryByTestId("canvas-board")).not.toBeInTheDocument()`.

**Severity:** Major — the Canvas as a spatial planning surface is central to the product narrative about shaped pitches. The underlying API endpoint works, but the UI does not render a Canvas view.

**Recommended resolution:** Update product docs to describe the WorkPortfolio as a bet grid (not a Canvas). Either defer the Canvas view to a future work package or mark it as planned-not-yet-built.

---

### M6 — Snooze and Escalate verdict actions are documented but not implemented

**What the docs say:** `docs/product/human-ai-collaboration.md` lists "Non-binding actions: comment, inline comment, reply, snooze, escalate."

**What the system does:** `packages/shared/src/thread.ts` defines `VERDICT_DECISIONS = ["approve", "approve-with-comments", "request-changes", "edit", "reject"]`. Neither `snooze` nor `escalate` appear in the verdict decision enum or anywhere in the server/web code.

**Severity:** Major — users seeing the documentation's list of available verdict actions will look for snooze and escalate affordances that do not exist.

**Recommended resolution:** Either implement snooze and escalate as new message actions, or update the docs to remove them from the current feature list and note they are planned.

---

### M7 — Autonomy levels (L1-L4) have no management UI

**What the docs say:** `docs/product/human-ai-collaboration.md` describes a detailed L1-L4 autonomy system with per-agent per-skill trust levels, and states "Autonomy changes are review items. The assistant proposes an increase; the founder approves or declines."

**What the system does:** The `user_skills` table exists with `autonomy_level` and related fields. The `PATCH /api/users/:id` and `/api/agents` routes handle user/agent config. However, there is no UI surface for viewing or managing autonomy levels. No route exists for the assistant autonomy-change proposal flow. The `AssistantOverlay` (rebuilt from CocOverlay in AD8b) provides the assistant conversation, but no autonomy management page exists in the web app.

**Severity:** Major — autonomy-level management is described as a core human oversight mechanism. Without a UI, founders cannot adjust trust levels.

**Recommended resolution:** Document this as a planned feature not yet built. Consider a minimal agent detail page showing current autonomy levels per skill as a near-term build target.

---

## 4. Minor Findings

### N1 — Product docs use "pitch" terminology but the schema uses "description"

**What the docs say:** `docs/product/how-work-flows.md` says "The Product Manager writes a pitch: the problem, what success looks like, rough scope..." The doc uses "pitch" throughout.

**What the system does:** `@lore U1`: "`description` was formerly `pitch`. Renamed in migration 0021." The API uses `description`, the schema has `description`. The `createBetSchema` rejects an `pitch` field.

**Severity:** Minor — product story language ("pitch") still works as a concept name even if the DB column is renamed. But developers following the API docs will be confused by the mismatch.

**Recommended resolution:** Add a note in architecture docs that "pitch" is the product concept for what is stored as `description` in the schema.

---

### N2 — "No backlog" rule is not enforced by the system

**What the docs say:** `docs/product/how-work-flows.md` says "No backlog. Shaped pitches not committed in two cycles expire."

**What the system does:** No expiry logic exists in the codebase. `draft`-status bets persist indefinitely. There is no background job, scheduled routine, or API logic that expires old pitches.

**Severity:** Minor — this is a design principle the system does not enforce. The WorkPortfolio shows all draft bets regardless of age.

**Recommended resolution:** Either implement pitch expiry as a scheduled routine or mark this as a planned feature. Update docs to reflect that expiry is aspirational for now.

---

### N3 — L4 factory knowledge described as four specific markdown files but implemented as knowledge_items rows

**What the docs say:** `docs/product/how-knowledge-compounds.md` describes "Four files: `PRINCIPLES.md`, `FOCUS.md`, `PORTFOLIO.md`, `REFLECTIONS/`." The git export feature (`packages/fabric/src/services/git-export.ts`) does export L4 items as `factory/PRINCIPLES.md` etc.

**What the system does:** L4 content is stored as rows in `knowledge_items` with `scopeKind = "factory"`. The git export assembles context them as markdown files. The product doc implies these are the *primary* storage format; the implementation uses them as export projections.

**Severity:** Minor — the system works correctly but the mental model differs. The docs suggest file-first storage; the implementation is DB-first with file export.

**Recommended resolution:** Update `docs/product/how-knowledge-compounds.md` §L4 to clarify that factory principles are stored in the canonical knowledge store and can be exported to/synced with markdown files via git export.

---

### N4 — Knowledge lifecycle has 6 states in docs but 7 states in implementation

**What the docs say:** `docs/product/how-knowledge-compounds.md` lists six lifecycle states: Captured, Provisional, Validated, Active, Stale, Archived.

**What the system does:** `packages/shared/src/types.ts` defines `KERNEL_KNOWLEDGE_STATUSES = ["draft", "active", "archived", "needs_human"]`. The fabric layer (`packages/fabric/src/__tests__/types.test.ts`) shows `captured`, `provisional`, `validated` plus the kernel states. The fabric uses a 7-state model (adding `needs_human` as a separate state), with the kernel limiting to 3 (`draft`, `active`, `archived`).

**Severity:** Minor — the lifecycle is more nuanced than the docs describe. The `needs_human` state exists in the kernel but is not mentioned in the product knowledge lifecycle description.

**Recommended resolution:** Update `docs/product/how-knowledge-compounds.md` to add `needs_human` as a lifecycle state. Clarify that `draft`/`captured`/`provisional` map to the same lifecycle phase.

---

### N5 — Weekly practice meetings are described as a workflow but have no UI or structured API

**What the docs say:** `docs/product/how-knowledge-compounds.md` describes a "Weekly practice meetings" workflow with Propose/React/Synthesize steps.

**What the system does:** `packages/fabric/src/services/practice-meeting.ts` exists as a service. The routine scheduler can fire practice meeting routines. However, there is no dedicated UI for the practice meeting flow in the web app.

**Severity:** Minor — the backend machinery exists; the UI surface does not. Users would need to interact with practice meetings through threads, which is less discoverable.

**Recommended resolution:** Document the practice meeting workflow as agent-facing (not human-facing UI). Human oversight of practice meetings happens via the Knowledge view curation queue.

---

### N6 — The architecture describes an agent/product roster that does not match the schema

**What the docs say:** `docs/architecture/components.md` §2.1 schema shows `agents (id, name, system_prompt_path, team_id, ...)` and `products (id, name, phase, ...)` as separate tables.

**What the system does:** There is no separate `agents` table. Agents are rows in the `users` table with `kind = "ai"`. There is no `products` table (renamed to `teams`). The `users` table uses `systemPromptPath` (column renamed in AK1).

**Severity:** Minor — the architecture doc schema is a simplified illustration, but it's close enough to mislead. A developer building a migration or a new integration would look for an `agents` table that does not exist.

**Recommended resolution:** Update `docs/architecture/components.md` to note that agents are `users` rows with `kind = "ai"`, and that `products` is now `teams`.

---

### N7 — "File leases" described in architecture schema do not exist

**What the docs say:** `docs/architecture/components.md` §2.1 includes `file_leases (id, agent_id, file_path, acquired_at, released_at)` in the schema.

**What the system does:** The `file_leases` table was dropped in earlier migrations. Test comments confirm: "file_leases was dropped in older migrations." No file lease logic exists in the active codebase.

**Severity:** Minor — this is stale architecture documentation about a feature that was designed but not built (or removed).

**Recommended resolution:** Remove `file_leases` from the architecture schema documentation.

---

### N8 — Auth described as "API keys + Tailscale" but implementation is token-based with login sessions

**What the docs say:** `docs/architecture/components.md` §2.5 says "Auth. For the initial deployment: API keys per human identity, passed in headers. Tailscale handles network-level access control. OAuth or passkey auth is a v2 concern."

**What the system does:** The auth implementation (`packages/server/src/middleware/auth.ts`) supports: (1) `HYPERIDLE_API_KEY` environment variable (desktop mode), and (2) Bearer token auth via `login_sessions` table (shared mode). The `login_sessions`, `invite_codes` tables exist. There is no Tailscale integration in the code.

**Severity:** Minor — the docs describe Tailscale as a component but it's not integrated; network security is left to deployment configuration. The token/session system is more sophisticated than the docs describe.

**Recommended resolution:** Update auth description in architecture docs to describe the actual dual-mode auth (API key for desktop, login session tokens for shared mode).

---

### N9 — Desktop delivery described as `brew install --cask hyperidle` but no Homebrew tap exists

**What the docs say:** `docs/human-interface-layer/one-app-two-form-factors.md` §3.2 says "Installation: `brew install --cask hyperidle` or download the signed/notarized DMG."

**What the system does:** The Electron desktop package exists at `packages/desktop/` with `electron-builder.yml`. No Homebrew cask or notarization infrastructure is configured in the repository.

**Severity:** Minor — this is forward-looking documentation for a distribution mechanism not yet set up.

**Recommended resolution:** Mark the Homebrew and DMG distribution as planned. Current installation is via `npm run dev` or direct Electron build.

---

### N10 — Architecture describes responses table; it was dropped

**What the docs say:** `docs/architecture/components.md` §2.1 schema shows `responses (id, item_id, decision, inline_anchor, edits, feedback, approver_id, view, responded_at)`.

**What the system does:** A code comment at line 302 of `packages/db/src/schema.ts` states "L1a: `responses` table dropped — verdicts now project as `verdict`-typed `messages` rows." The responses table was removed and replaced with verdict-type messages in the threads system.

**Severity:** Minor — the schema in the architecture doc is out of date.

**Recommended resolution:** Update `docs/architecture/components.md` to remove the `responses` table and note that verdicts are `verdict`-typed message rows in the `messages` table.

---

### N11 — Facilitator routines DO run and organize knowledge, but lack a dedicated UI surface (Validation Scenario 1)

**What the docs say:** `docs/product/how-knowledge-compounds.md` describes facilitator agents that automatically organize knowledge through practice meetings, attention scoring, and promotion pipelines. The claim is that knowledge is continuously surfaced and organized without manual curation.

**What the system does:**

- `packages/fabric/src/services/builtin-routines.ts` registers `builtin:practice-meeting` as an event-driven and scheduled routine. The facilitator fires on knowledge events and on the heartbeat schedule.
- Knowledge decay/attention scoring is implemented in the fabric layer and drives promotion pipeline decisions.
- Promotion pipelines produce knowledge items visible in the Knowledge triage view (`packages/web/src/pages/knowledge/`). Curation suggestion cards surface in the UI (`CurationSuggestionCard.tsx`).
- There is no dedicated "facilitator activity" surface or timeline. Users observe facilitator outcomes through the Knowledge triage view rather than through a first-class facilitator panel.

**Assessment:** Facilitator routines DO run and DO organize knowledge. The automated organization claim is substantiated by the implementation. The gap identified in N5 (no dedicated practice meeting UI) remains, but does not negate the claim that the facilitator system works — human oversight flows through the Knowledge triage view.

**Severity:** Minor — the docs imply a dedicated facilitator visibility surface that does not exist. The underlying behavior is correct.

**Recommended resolution:** Update `docs/product/how-knowledge-compounds.md` to clarify that facilitator activity is visible through the Knowledge triage view and curation suggestions, not through a dedicated facilitator panel.

---

### N12 — User Sovereignty: partially upheld; autonomy management and automated routine actions are gaps (Validation Scenario 2)

**What the docs say:** `ETHOS.md` states "User Sovereignty — AI recommends, humans decide" and "Never make irreversible decisions without human approval." `docs/product/human-ai-collaboration.md` describes the verdict system and L1-L4 autonomy levels as the implementation of this principle.

**What the system does (PASS):**

- Thread verdicts (`approve`, `approve-with-comments`, `request-changes`, `edit`, `reject`) provide explicit human override points at every agent work result. Before agent output becomes canonical, it passes through the thread/verdict model. This is correctly implemented.
- Agent work results are presented in threads for human review before being acted on — the thread model enforces the "AI recommends, humans decide" loop.
- The `VERDICT_DECISIONS` enum in `packages/shared/src/thread.ts` covers the full set of human override responses documented in the product docs (excluding snooze/escalate, tracked in M6).

**What the system does (PARTIAL / GAP):**

- **Autonomy level management (M7):** The `user_skills` schema captures per-agent per-skill trust levels (`autonomy_level`), but there is no UI for founders to view or adjust these levels. Humans cannot exercise the sovereignty mechanism the docs describe — trust level changes require direct DB access.
- **Automated routine actions:** The cost sentinel (`builtin:cost-sentinel`) and post-bet retro (`builtin:post-bet-retro`) fire autonomously on their triggers. While neither makes irreversible decisions (they create threads or knowledge items, not destructive mutations), their autonomous firing is not surfaced to founders before execution. There is no pre-execution approval step for these routines.

**Overall assessment:** The verdict/review system respects User Sovereignty for all thread-level decisions — this is the primary flow and it is correctly implemented. The sovereignty gap is concentrated in two areas: (1) founders cannot adjust agent autonomy levels without UI, and (2) built-in scheduled routines act without a pre-flight human check. Neither gap involves irreversible actions in the current implementation.

**Severity:** Minor — core sovereignty (thread verdicts) works. The gaps are in the management layer (autonomy UI) and in transparency of routine execution, not in reversibility of decisions.

**Recommended resolution:** Track the autonomy management UI as a near-term build target (see M7). For built-in routine actions, add a "recent routine activity" log visible to founders so autonomous actions are transparent even when not pre-approved.

---

## 5. Documented but Not Implemented

| Feature | Doc reference | Status |
|---------|--------------|--------|
| **Letta harness adapter** | `docs/architecture/components.md` §2.7 "Letta (planned)" | Not implemented. Only `claude-agent-sdk`, `cli`, `builtin`, `isolated`, and `remote` adapters exist. |
| **OpenHands harness adapter** | `docs/architecture/components.md` §2.7 "OpenHands (planned)" | Not implemented. |
| **E2B Desktop Sandbox workspace** | `docs/architecture/components.md` §2.8 "E2B Desktop Sandbox (managed cloud)" | Not implemented. Only `LocalSandboxAdapter` (host working directory) exists. `DockerSandboxAdapter` removed in AQ1. Opt-in isolation planned for AQ2. |
| **Daytona workspace adapter** | `docs/architecture/components.md` §2.8 "Daytona (self-hosted cloud)" | Not implemented. |
| **APNs/Firebase push notifications** | `docs/architecture/components.md` §2.9 "APNs / Firebase (when native mobile wrapper ships)" | Not implemented. ntfy.sh and SMTP adapters are built. |
| **OpenTelemetry observability** | `docs/architecture/components.md` §2.10 "OpenTelemetry (planned)" | Not implemented. Console and no-op adapters exist. |
| **Snooze action** | `docs/product/human-ai-collaboration.md` non-binding actions | No implementation in thread model or UI. |
| **Escalate action** | `docs/product/human-ai-collaboration.md` non-binding actions | No implementation in thread model or UI. |
| **Inline comments on diff lines** | `docs/product/human-ai-collaboration.md` "Inline comments work at the level of a specific diff line" | ThreadShell supports inline references (BlockRef), but line-level diff comments are not wired. |
| **Autonomy level management UI** | `docs/product/human-ai-collaboration.md` L1-L4 autonomy management | Schema exists; no UI for founder to view/adjust per-agent per-skill autonomy. |
| **Pitch expiry ("no backlog")** | `docs/product/how-work-flows.md` "Shaped pitches not committed in two cycles expire" | No expiry logic in scheduler or any background job. |
| **Canvas spatial planning view** | `docs/product/what-is-hyperidle.md`, `docs/architecture/the-human-interface-the-factory.md` | API endpoint exists (`GET /bets/canvas`); UI was removed in work package U9. |
| **Weekly practice meetings UI** | `docs/product/how-knowledge-compounds.md` Propose/React/Synthesize | Service exists (`practice-meeting.ts`); no UI surface. |
| **pgvector semantic search** | `docs/architecture/components.md` §2.4 "Postgres + pgvector" | Only FTS (full-text search) is implemented via `fts.ts`. No vector embeddings. |
| **Global cross-entity search API** | Implied by GlobalSearchPanel component calling `/api/search` | The hook calls `/api/search` which does not exist. Only `/api/knowledge/search` is implemented. |
| **TOON workspace projection** | `docs/product/how-knowledge-compounds.md` "Formatted in TOON (uses ~40% fewer tokens than JSON)" | TOON codec exists in `packages/shared/src/toon-codec.ts` and works for encoding/decoding. However, workspace context assembly and git-export produce markdown files, not TOON-encoded packs. |
| **Model tier selection by task risk** | `docs/architecture/components.md` §2.3 Scheduler model tier selector | `packages/server/src/services/model-gateway.ts` exists; not clear if risk-based automatic tier selection is wired end-to-end. |
| **Ambient awareness right sidebar** | `docs/product/what-is-hyperidle.md` previously described a right sidebar | Removed in U6. API endpoint works; no UI consumer. ✓ Docs updated in AE1 to describe current ambient surfaces. |

---

## 6. Implemented but Not Documented

| Feature | Location | Notes |
|---------|----------|-------|
| **Git export** | `packages/fabric/src/services/git-export.ts`, `packages/server/src/routes/git-export-routes.ts` | Exports knowledge items to a git repo as markdown files. Not mentioned in product docs. |
| **MCP bridge (X2)** | `packages/server/src/mcp/` | Exposes HyperIdle tools to external harnesses via Model Context Protocol. Not in product docs. |
| **PGlite embedded database** | `packages/db/src/connection.ts` | The laptop profile uses PGlite (WASM PostgreSQL) instead of SQLite. Architecture docs still say SQLite/better-sqlite3. |
| **Invite code / login session auth** | `packages/db/src/schema.ts`, `packages/server/src/routes/auth.ts` | Login session tokens and invite codes support multi-user shared mode. Architecture docs only mention API keys. |
| **Org chart edges (P2)** | `packages/db/src/schema.ts` `orgEdges`, `packages/server/src/routes/org.ts` | Review routing via founder-to-agent relationships. Not described in product docs. |
| **Session activity dial-in (Q1)** | `packages/web/src/pages/Conversations.tsx`, `packages/server/src/services/session-activity-buffer.ts` | Founders can dial into live agent sessions and watch real-time tool calls. Not in product docs. |
| **Hint/first-run progress** | `packages/db/src/schema.ts` `hintProgress`, `packages/server/src/routes/hints.ts` | First-run hints dismissed per-user. Not in product docs. |
| **Server credential encryption** | `packages/db/src/schema.ts` `serverCredentials`, `packages/server/src/services/credential-encryption.ts` | AES-256-GCM encrypted credential storage for shared mode. Not in product docs. |
| **Policy engine** | `packages/fabric/src/services/policy-engine.ts` | Governs autonomous agent action approvals. Not described in product docs. |
| **Block primitive (L2)** | `packages/shared/src/blocks/` | Content blocks with stable IDs, payload types, and anchor references. Partially documented in `docs/blocks/` but not in product story docs. |
| **Artifact permalink** | `packages/web/src/pages/ArtifactPermalink.tsx`, `/artifacts/:id` route | Artifacts have stable permalink URLs. Not mentioned in product docs. |
| **Knowledge triage view** | `packages/web/src/pages/knowledge/` | Knowledge items have a triage view for curation. Partially aligned with attention scoring docs. |
| **Curation suggestion cards** | `packages/web/src/components/CurationSuggestionCard.tsx` | Automated knowledge curation suggestions surface in the UI. Not in product docs. |
| **Notification queue** | `packages/db/src/schema.ts` `notificationQueue`, `packages/fabric/src/services/notifications/` | Full notification dispatch infrastructure with SMTP, ntfy adapters, and a queue. Not in product docs. |
| **Daily digest notifications** | `packages/fabric/src/services/daily-digest.ts` | Daily digest emails/pushes for founder async catch-up. Not in product docs. |
| **Kernel/strategy separation (O2)** | `packages/db/src/schema.ts` extension tables, `packages/fabric/` | Strategy fields moved to extension tables (`knowledgeStrategyFabric`, `taskStrategyFabric`). Significant architectural refinement not reflected in any doc. |
| **Propagation log** | `packages/db/src/schema.ts` `propagationLog` | Audit log for all lifecycle propagation events (session→task→bet→team). Not documented. |
| **Knowledge access log** | `packages/db/src/schema.ts` `knowledgeAccessLog` | Records every knowledge item view for frequency/recency scoring. Not in product docs. |
| **Setup flow (P4)** | `packages/web/src/pages/SetupFlow.tsx` | Guided first-run setup at `/setup`. Partially described in architecture doc §3.2 but not in product docs. |

---

## 7. Prioritized Punch List

Items ordered by user-facing impact. Each item is self-contained enough for a developer to act on without further investigation.

---

### P1 — Fix the global search API endpoint (BROKEN FEATURE — user-visible)

**Status:** open

**Impact:** Every Cmd+K search returns a network error. The UI component exists but silently fails.

**What to fix:** Implement `GET /api/search?q=:query` in the server that queries across threads, bets, and knowledge items, OR change `packages/web/src/hooks/useGlobalSearch.ts` to call `/api/knowledge/search?q=:query` as an interim solution.

**Files:**
- `packages/web/src/hooks/useGlobalSearch.ts` — change the API call path
- `packages/server/src/routes/` — add search route if implementing cross-entity search
- `packages/server/src/app.ts` — register the new route

---

### P2 — Update architecture docs to reflect PGlite (not SQLite/better-sqlite3)

**Status:** open

**Impact:** Developer onboarding failure. Every new contributor will read "SQLite via better-sqlite3" and look for a `.db` file that does not exist.

**What to fix:** Replace SQLite/better-sqlite3 language with PGlite (laptop) / postgres-js (VPS/cloud) throughout:

**Files:**
- `docs/architecture/components.md` §2.1 — update schema context and technology note
- `docs/architecture/decisions.md` — update the desktop shell decision
- `docs/architecture/technology-summary.md` — replace "better-sqlite3" column with "PGlite / postgres-js"

---

### P3 — Update architecture docs to reflect teams/team_members schema (not products/teams)

**Status:** open

**Impact:** Developer onboarding failure. Schema references in `docs/architecture/components.md` use table names that do not exist.

**What to fix:** Update the schema example in `docs/architecture/components.md` §2.1 to:
- Rename `products` → `teams`
- Rename `teams` → `team_members`
- Rename `agents` → note it is `users WHERE kind = 'ai'`
- Remove `responses` table (dropped, replaced by verdict-typed messages)
- Remove `file_leases` table (dropped)
- Update `bets` to show `cost_appetite_minor`/`cost_appetite_currency` (not `appetite TEXT`)
- Update `sessions` to remove `cost` column (moved to strategy layer)

**File:** `docs/architecture/components.md` §2.1

---

### P4 — Acknowledge the ambient sidebar removal in product documentation

**Status:** ✓ RESOLVED (AE1)

**What was fixed:** Updated ~30 non-archive doc files to replace old sidebar/nav references with current ambient surfaces (Conversations filter chips, WorkTeam AgentRow health indicators, Sidebar triage badge, WorkTeam burn-vs-cap section). All docs now describe the current two-zone layout (Sidebar | Main content).

---

### P5 — Document the Canvas removal and current WorkPortfolio layout

**Status:** open

**Impact:** Product story describes a spatial Canvas planning view that was removed. Users and contributors will expect it.

**What to fix:** Update `docs/product/what-is-hyperidle.md` "Work" description to say the Work view shows a bet grid (not a Canvas). Mark the spatial Canvas as a planned future view.

**Files:**
- `docs/product/what-is-hyperidle.md` — Work view description
- `docs/architecture/the-human-interface-the-factory.md` §3.1 — Work view description

---

### P6 — Clarify bet terminology (draft/active/completed vs shaped/committed/shipped)

**Status:** open

**Impact:** Product docs and process docs use vocabulary that does not match API responses or UI labels, confusing both users and developers.

**What to fix:** Add a terminology note to `docs/process-layer/the-five-primitives.md` §3.1 stating that the implementation uses `draft` (not "shaped"), `active` (not "committed" or "in_progress"), and `completed` (not "shipped"). Update the `status` field in the Bet struct definition.

**File:** `docs/process-layer/the-five-primitives.md` §3.1

---

### P7 — Document or remove the snooze and escalate verdicts from human-ai-collaboration.md

**Status:** open

**Impact:** The doc lists non-binding actions including snooze and escalate. Users will look for these affordances that do not exist.

**What to fix:** Either mark snooze/escalate as planned-not-built, or remove them from the current feature table in `docs/product/human-ai-collaboration.md` until they are implemented.

**File:** `docs/product/human-ai-collaboration.md` — non-binding actions section

---

### P8 — Fix the agent inbox route path in architecture documentation

**Status:** open

**Impact:** Any harness adapter developer following the architecture doc will call `/api/agents/:id/inbox` (which 404s) instead of `/api/users/:id/inbox` (which exists).

**What to fix:** Update `docs/architecture/components.md` §2.5 "Key endpoints" section. Change:
- `POST /agents/:id/inbox → deliver a message to an agent's inbox`
- `GET /agents/:id/inbox → read an agent's inbox`
to:
- `POST /users/:id/inbox → deliver a message to an agent/user inbox`
- `GET /users/:id/inbox → read an agent/user inbox`

**File:** `docs/architecture/components.md` §2.5

---

### P9 — Document the kernel/strategy separation and extension tables

**Status:** open

**Impact:** The O2 architectural refinement (moving strategy fields to extension tables `knowledgeStrategyFabric`, `taskStrategyFabric`) is a significant design decision that would surprise any developer reading the schema documentation.

**What to fix:** Add a section to `docs/architecture/components.md` or a new `docs/architecture/kernel-strategy-split.md` explaining the kernel/strategy separation: what lives in the kernel tables vs. the extension tables, why the split exists, and how the fabric layer computes strategy signals.

**Files:**
- `docs/architecture/components.md` — add kernel/strategy note to §2.1 and §2.4

---

### P10 — Document implemented features not in the product story layer

**Status:** open

**Impact:** Git export, MCP bridge, policy engine, and the notification system are built and working but invisible to anyone reading the product docs. These are potentially high-value features that could be highlighted.

**What to fix:** Add brief mentions in the appropriate product docs:
- `docs/product/how-knowledge-compounds.md` — add a note about git export (knowledge can be synced to a git repository)
- `docs/product/human-ai-collaboration.md` — mention the session dial-in feature (founders can observe live agent sessions)
- `docs/architecture/what-this-architecture-does-not-include.md` — note that MCP servers are included via the X2 bridge (this is already partially there: "Exception: X2 MCP Bridge exposes HyperIdle's tools TO external harnesses via MCP")

**Files:**
- `docs/product/how-knowledge-compounds.md`
- `docs/product/human-ai-collaboration.md`
