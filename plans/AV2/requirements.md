# AV2 — Settings IA: rows, split-pane, assistant-as-agent, roles — REQUIREMENTS (refined)

**Track:** AV (First-Run Usability & Product Polish). **Frame:** *Consolidate onto the app's existing
solved patterns; do not invent.* The only genuinely new noun this WP owns is **agent role**.

## 1. Sharpened goal

Make Settings behave like the rest of the app. Four consolidations + one new capability:

1. **One agents list.** The Assistant becomes a row in the agents list, edited through the same panel
   as every other agent. Kill the bespoke `SettingsAssistant` section and the `role !== "assistant"`
   filter (`SettingsAgents.tsx:753`).
2. **Detail/edit in `SplitView`.** Agent detail/edit, built-in-harness config, and configurable-harness
   detail all open in the shared `SplitView` (the same primitive Conversations dial-in and review use),
   not inline `<tr>` cards, not a modal, not two disconnected stacked sections.
3. **Harness-DISCOVERED model dropdown.** The model select offers the models the selected harness
   *actually provides*, DISCOVERED from the harness (`descriptor.models` on `GET /api/harnesses`) — NOT
   the hardcoded `MODEL_CATALOG` filtered by provider (founder concept-review tweak). A harness with no
   enumerable models (codex; or a provider needing a missing key) shows an affordance, not the global
   catalog. Switching harness still reconciles a stale `modelProvider` so a save never surfaces
   INCOMPATIBLE_HARNESS_MODEL — see §5's model-dropdown note for the precise requirement + per-harness
   discovery source.
4. **Role template on edit.** The edit form loads the role's default system-prompt template (today only
   the *add* form fetches `/api/agents/templates/:role`).
5. **New capability: define a role.** Replace the closed `AGENT_ROLE_CATALOG` `<select>` with a
   catalog-plus-custom control — the user can pick a known role or type a new one.
6. **Backend/worker consolidation + email hint.** Fold the Worker section into Backend (shown only in
   shared-backend mode); fix `SettingsProfile.tsx:99` email hint that claims "notifications and login"
   even in local mode.

## 2. User value

Settings is where a user configures how their agents work. Today it is the least consistent surface in
the app: a dual-tracked Assistant, an inline-`<tr>` agent editor while everything else uses split-pane,
built-in-harness config scattered across two sections, a dead show/hide button, a model dropdown that can
offer an incompatible pair, and no way to name a role. Each is a papercut; together they read as
unfinished and undermine trust. Beneficiary: any user (and the founder demoing) who opens Settings.

## 3. Success — what "done" looks like

- The Assistant is a normal row in one agents list; clicking it opens the same split-pane editor as any
  other agent. No "Assistant" section, no role-exclusion filter anywhere.
- Agent / built-in-harness / configurable-harness detail all open in `SplitView` with a persisted ratio,
  matching Conversations/review exactly — the container wires
  `const [ratio, setRatio] = useUiPreference(surfaceKey, default)` and passes
  `dividerRatio={ratio} onRatioChange={setRatio}` to `SplitView` (the prop that actually persists;
  `surfaceKey` alone is presentational — `SplitView.tsx:45`).
- Opening the model dropdown on a harness shows that harness's DISCOVERED models (builtin = the gateway
  `/models` list; opencode = `opencode models`; claude-code = the `claude models` table); a harness with no
  enumerable models (codex) shows an affordance, not the global catalog. **Switching a harness reconciles
  the agent's stale `modelProvider`** so saving never 422s on INCOMPATIBLE_HARNESS_MODEL — a previously-set
  incompatible provider is reset on harness change (see §5).
- Editing an existing agent prepopulates the role's system-prompt template.
- A user can type a brand-new role string on an agent, save it, and it round-trips; known roles still show
  their friendly labels + descriptions.
- Worker controls live under Backend and appear only in shared-backend mode; the profile email hint reads
  correctly in local mode.

## 4. Out of scope (explicit)

- Onboarding harness/primary-harness selection — **AV1**.
- Any change to how agents actually *run* (harness/provider runtime) beyond the Cluster B validator.
- Multi-harness-per-agent, per-agent harness overrides.
- Cursor-agent authability, org-chart labels, connections empty state — all done in POLISH-060.
- Redesigning the model-gateway *tier* config semantics (SettingsModels tiers stay; they just move into
  the built-in-harness split-pane detail).
- A general role-management CRUD surface (list/edit/delete roles). This WP adds *define a role inline on
  an agent* only — the smallest additive step. A roles admin page is a possible future WP.

## 5. PINNED NOUN (a) — **agent role**: catalog-plus-custom (RECOMMENDED)

### The two shapes considered

- **Free-form string.** Role is just a text input; `AGENT_ROLE_CATALOG` deleted from the UI.
- **Catalog-plus-custom.** A combobox: the known catalog entries (friendly labels + descriptions) *plus*
  an "add a new role…" affordance that accepts an arbitrary string. The catalog stays as metadata.

### Decision: **catalog-plus-custom.**

### Justification (grounded in the real code)

- **The data model already treats role as an open string.** `users.role` is a free `text` column; the
  route schemas validate `role: z.string().min(1).max(100)` (`agents.ts:49,62`) — *not* an enum. The
  catalog is metadata, not a constraint (`agent-roles.ts:35` header: "Open vocabulary — agents can have
  roles not in this catalog"). So **no DB or schema change is needed** for a custom role — it is already
  additive and back-compatible. This is decisive: catalog-plus-custom costs nothing at the data layer.
- **The catalog carries load-bearing metadata that free-form would throw away.** `findRoleCatalogEntry`
  drives `agentCategory` derivation on create (`agents.ts:289-291`), `community`, `teamFunctions`, and the
  friendly `label`. A pure free-form input would degrade the known-role UX (raw `product_manager` instead
  of "Product Manager", no category inference). Catalog-plus-custom keeps the good known-role UX *and*
  adds the escape hatch.
- **Templates already degrade gracefully for unknown roles.** `/api/agents/templates/:role` returns 404
  for a role with no `factorySettings` `system_template:<role>` row (`agents.ts:200`); the add form
  already tolerates a missing template (leaves the prompt empty). So a custom role with no template is a
  solved case — no new backend behavior required.
- **Back-compat:** every existing agent row keeps its role string untouched; the combobox pre-selects the
  catalog entry when the role is known and shows the raw string as a custom entry when it is not.

### Model dropdown source — HARNESS-DISCOVERED models (founder concept-review tweak, BLOCKING)

**The dropdown offers the harness's DISCOVERED models, not the hardcoded `MODEL_CATALOG` filtered by
provider.** Each harness exposes its own selectable model set; the dropdown reflects *that discovered set*,
per harness. The seam already exists: `HarnessModelDescriptor.models` on the descriptor delivered by
`GET /api/harnesses` (`harness-capability-descriptor.ts:108`, `HarnessCapabilityDescriptor.models`). Today
the web dropdown IGNORES `descriptor.models` and maps `MODEL_CATALOG` directly
(`SettingsAgents.tsx:579`) — that is the anti-pattern this tweak removes.

The precise requirement:

- **Source = `descriptor.models` for the selected harness** (from the already-loaded `/api/harnesses`
  payload). The old "filter `MODEL_CATALOG` by `modelProviders`" invariant is REPLACED. `modelProviders`
  stays load-bearing only for the *server validator* and for the on-switch reconcile below — it is no
  longer the option source.
- **`descriptor.models` is populated per harness at PROBE time (cached), from an honest per-harness source
  — never from `MODEL_CATALOG` relabelled as "discovered":**
  - **builtin** → the resolved model-gateway `/models` list (OpenRouter `GET /api/v1/models` no-auth;
    Anthropic `GET /v1/models` with `x-api-key`; openai-compatible `GET {baseUrl}/v1/models` bearer).
  - **opencode** → `opencode models --verbose` parsed into descriptors.
  - **claude-code** → the `claude models` Markdown table parsed into descriptors (the harness's own
    bundled catalog — NOT `MODEL_CATALOG` relabelled).
  - **codex** → NO enumeration surface → `models: []` + an editor affordance ("this harness manages its
    own model"; optionally show the configured `~/.codex/config.toml` `model` read-only). Do NOT fabricate
    a codex model list.
  - **cursor-agent** → inert → `models: []`.
- **Empty is legitimate, and it is an AFFORDANCE — never a fallback to the global catalog.** When
  `descriptor.models` is empty (codex; or a provider that needs a key and none is present → the list is
  legitimately empty, never fabricated), the editor renders an affordance ("this harness manages its own
  model" / "no selectable models") instead of an empty `<select>`. It does **not** silently fall back to
  `MODEL_CATALOG`. **Anti-pattern (explicitly forbidden):** hardcoded `MODEL_CATALOG` relabelled as
  "discovered", or an empty discovered list falling back to the global catalog — both violate the
  requirement.
- **The stale-`modelProvider` reconcile still holds** (still 422-relevant, `agents.ts:159-171`). The
  validator fires only when `modelProviders.length > 0 && !includes(provider)`; an empty `modelProviders`
  is **exempt** (`.length > 0` guard) — a provider-agnostic CLI harness (codex/opencode register
  `modelProviders: []`) does not 422. On harness change the editor still reconciles the agent's stale
  `modelProvider`: send `null` for an empty-`modelProviders` (provider-agnostic) harness, or a compatible
  value for a non-empty one. The genuine 422 risk (a non-empty `claude-code`=`["anthropic"]` harness
  carrying a stale non-anthropic `modelProvider` after a switch) is guarded by this reconcile, unchanged by
  the discovery tweak. Selecting a *discovered* model whose provider the harness declares keeps this
  save-safe by construction.

> Scope note: this grows AV2's backend materially — a real per-harness `/models` discovery layer (new HTTP
> `/models` client + two CLI parses). See architecture §5(e) and the one-PR-vs-split recommendation in §6.

### What "role" IS / ISN'T (rejection list)

- IS: an open string label on an agent (`users.role`) that (a) picks a friendly label + category when it
  matches the catalog and (b) keys a system-prompt template lookup.
- IS NOT: a new DB table, a new entity with a lifecycle, a permissions/scope primitive, or a
  team-membership construct. **No `agent_roles` table.** No role CRUD API. No persistence beyond the
  already-persisted `users.role` string.
- IS NOT: a replacement for `agentCategory` (team/strategy/individual) — that stays derived.

### Consequence for persistence (the "light backend" question)

**No backend/schema change is required for the role noun.** The "light backend for role definition" the
spec anticipates reduces to: *nothing new server-side* — the existing `POST/PATCH /api/agents` already
accept an arbitrary role string, and the template route already 404s gracefully. The only optional
server touch is a convenience: have `POST /api/agents` tolerate a role with no catalog entry (it already
does — `agentCategory` falls back to `"team"` at `agents.ts:289-291`). **Recommendation: zero backend
change for roles.** This meaningfully shrinks sub-area (c).

## 6. PINNED NOUN (b) — **assistant-unification**: shared-panel, split write-routing (RECOMMENDED)

### The constraint that shapes everything

The Assistant is a real agent row (`role:"assistant"`, id `ast-<userId>`) — it already appears in
`GET /api/agents` (that route lists all non-system AI users; the `role !== "assistant"` exclusion is a
**UI-only** filter at `SettingsAgents.tsx:753`, not a data fork). **But** `PATCH /api/agents/:id`
*hard-rejects* any `systemPrompt` write to an `ast-*` id (`agents.ts:361-370`, code
`ASSISTANT_SOUL_EDIT_FORBIDDEN`). The canonical persona writer is `PATCH /api/users/:userId/assistant`
(`assistant.ts:344`). Non-persona fields (harness, model, name, role, maxSessions) *are* accepted by
`PATCH /api/agents/:id` for `ast-*`.

### Decision: **one shared edit panel; the panel routes the persona (systemPrompt) write to the assistant
route and everything else to `/api/agents/:id`.**

Concretely, the shared editor detects `agent.id.startsWith("ast-")` (or `agent.role === "assistant"`) and:

- **Persona field** (`systemPrompt`) → `PATCH /api/users/:userId/assistant` (where `userId` = the id with
  the `ast-` prefix stripped). This route also accepts harness/model, so for the assistant we send the
  whole triple there.
- **Non-assistant agents** → `PATCH /api/agents/:id` exactly as today.

This is **UI/flow only** — it forks *which endpoint the save calls*, never the data model. Both endpoints
already exist and are already validated by the shared `validateAgentConfig`.

### Why not the alternatives

- *Relax the `ast-*` reject in `/api/agents`* → rejected: that reject is a deliberate security boundary
  (a raw API call could otherwise bypass the assistant self-edit guard — `agents.ts:361-370`). Do not
  weaken it. Route around it in the UI instead.
- *Keep a separate assistant editor but hide it* → rejected: that is the dual-track we are killing.

### What assistant-unification IS / ISN'T

- IS: the Assistant rendered as one row among agents, edited in the shared split-pane panel; the panel
  branches only on *save routing*.
- IS NOT: a data-model change, a new "assistant is special" flag on the agent record, or a merge of the
  two routes. The two routes stay; the panel picks the right one.
- IS NOT: making the assistant deletable or role-editable in a way that breaks the `ast-` invariant — the
  role stays `assistant`; the role combobox for the assistant row should not offer to change it away from
  `assistant` (it stays one-per-user, created at registration).

## 7. Classification

- **DESIGN-CLASS: novel.** This is a multi-section IA restructure of a core surface (stacked page →
  rows + split-pane) plus a genuinely new control (the role combobox). Multi-variant `/design` + human
  review required.
- **DOC-CLASS: significant.** The end-user "how you configure your team in Settings" story changes
  materially (one agents list incl. Assistant, split-pane editing, define-a-role). The dev guide gains
  the role noun's shape + the assistant save-routing rule. Founder review of the guide draft is warranted.

Because DESIGN-CLASS=novel **and** DOC-CLASS=significant, `/pipeline:human-concept-review` runs (in an
autonomous run this parks for the founder).
