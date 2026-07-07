# AV2 — Architecture

## 1. Context

Settings is the app's least consistent surface. AV2 consolidates it onto the app's solved patterns
(`SplitView`, `Row`/`ItemList`, `EmptyState`) and adds one new control (the role combobox). It is
frontend-heavy with **zero required schema/DB change** (see §4) — the "light backend" the spec anticipated
dissolves once the role noun is pinned as an open string (requirements §5).

**One material backend addition (founder concept-review tweak):** the Settings model dropdown must offer
the models the harness *actually provides*, **discovered from the harness** — not the hardcoded
`MODEL_CATALOG` filtered by provider. This adds a real per-harness model-discovery layer (sub-area **(e)**,
§5) that populates `descriptor.models` at probe time: a new HTTP `/models` gateway client (builtin) + two
CLI parses (opencode `models --verbose`, `claude models` table); codex/cursor stay empty (no enumeration
surface). This is the one part of AV2 that is not pure frontend extraction.

## 2. Constraints (from the real code)

- **`PATCH /api/agents/:id` hard-rejects `systemPrompt` writes to `ast-*` ids** (`agents.ts:361-370`,
  `ASSISTANT_SOUL_EDIT_FORBIDDEN`). Non-persona fields ARE accepted for `ast-*`. → The shared editor must
  route the assistant persona save to `PATCH /api/users/:userId/assistant` (`assistant.ts:344`). Do NOT
  weaken the reject.
- **`role` is already an open string** (`users.role` text; `z.string().min(1).max(100)` in the route
  schemas — `agents.ts:49,62`). Custom roles need no schema change. `agentCategory` falls back to `"team"`
  for unknown roles (`agents.ts:289-291`).
- **`GET /api/agents` already returns the Assistant** (lists all non-system AI users; the exclusion is the
  UI filter at `SettingsAgents.tsx:753`).
- **Templates 404 gracefully** for a role with no `factorySettings` `system_template:<role>` row
  (`agents.ts:200`). The add form already tolerates this.
- **Model dropdown SOURCE = the descriptor's `models` field, DISCOVERED per harness (founder tweak).**
  The web dropdown reads `selectedHarnessDescriptor.models` (`HarnessCapabilityDescriptor.models`,
  `harness-capability-descriptor.ts:108`) from the already-loaded `GET /api/harnesses` payload — NOT
  `MODEL_CATALOG`. The seam already ships to the client (`harnesses.ts:82` returns
  `listCapabilityDescriptors()`, whose descriptors carry `models`). Today `descriptor.models` is
  `MODEL_CATALOG`-relabelled for builtin (`builtinModels()`, `harness-capability-descriptors.ts:74-85`)
  and `[]` for CLI harnesses (`cliModels()`, `:87-89`). Sub-area **(e)** replaces the builtin relabel with
  a real gateway `/models` fetch and populates the CLI descriptors from honest probe output. **The
  hardcoded catalog is never relabelled as "discovered"** — that is the anti-pattern the tweak removes.
- **`modelProviders` stays load-bearing only for the server validator + the on-switch reconcile** — it is
  no longer the dropdown option source. VERIFIED: `describeRegisteredHarness`
  (`harness-capability-descriptors.ts:144,164,179`) sets `modelProviders: meta.modelProviders`; the
  validator reads the same `meta` (`agents.ts:160` `pool.getRegistrationMetaByType(...).modelProviders`).
  **Real per-harness `modelProviders` values** (`adapter-pool.ts`): `claude-code`→`["anthropic"]` (`:627`,
  NON-empty, `@lore claude-cli-adapter`); `builtin`→`["anthropic","openrouter","openai-compatible"]`
  (`:638`); codex/opencode via `registerCliAdaptersIfAvailable`→`[]` (`:575`); missing families→`[]`
  (`harness-capability-descriptors.ts:208`). **Validator rule** (`agents.ts:159-171`): fires ONLY when
  `meta.modelProviders.length > 0 && !includes(effectiveProvider)`; an **empty** list is exempt
  (`.length > 0` guard) — a `modelProviders: []` harness with any provider set does not 422 (old
  empty-`Supported:` bug fixed, `@lore POLISH-060 B1`). → **The 422 risk this WP must prevent** (unchanged
  by the discovery tweak): a non-empty harness (`claude-code`) whose agent still carries a **stale**
  non-anthropic `modelProvider` after a switch — the editor reconciles on harness change (see §5(c)):
  `null` for an empty-`modelProviders` harness, a compatible value for a non-empty one. A discovered model
  the harness declares keeps the save 422-safe by construction.
- **Reuse only** `SplitView` + `useUiPreference` (`Conversations.tsx:461,285`), `Row`/`ItemList`,
  `EmptyState`. No new list/detail/empty primitive. The only net-new component is `RoleCombobox` (built).
  **Ratio persistence is container-owned:** `SplitView` is presentational — `surfaceKey` alone does nothing
  (`SplitView.tsx:45` `@lore AM5 T6`: "informational for the stories viewer only"). Each SplitView surface
  must wire `const [ratio, setRatio] = useUiPreference(key, default)` then
  `dividerRatio={ratio} onRatioChange={setRatio}`, exactly as Conversations does
  (`Conversations.tsx:285,461-465` `onRatioChange={setDialInRatio}`). Without `onRatioChange` the ratio
  never persists.
- **Worker already self-gates to shared mode** (`SettingsWorker.tsx:117`) and is filtered by AppShell
  `visibleSettingsSections`. Consolidation reuses that guard.

## 3. Plan reconciliation — named symbols verified

| Symbol / route | Location | Use |
|---|---|---|
| `SplitView`, `FoldMode`, `SplitViewProps` | `design-system/src/SplitView.tsx` (exported) | agent + backend detail panes |
| `SplitView` `dividerRatio` + `onRatioChange(ratio)` props | `SplitView.tsx:44` | ratio persistence (container wires to `useUiPreference` setter) |
| `useUiPreference(surfaceKey, default)` | `web/src/hooks/useUiPreference.ts:35` | ratio persistence store (`[ratio, setRatio]`) |
| `ItemList` / `Row` (`variant="flush"`, `as="li"`) | `design-system/src/{ItemList,Row}.tsx` | agents + backends lists |
| `RoleCombobox` (NEW) | `design-system/src/RoleCombobox.tsx` (added to index) | role control |
| `GET /api/agents`, `POST`, `PATCH /:id`, `DELETE /:id`, `GET /templates/:role` | `server/src/routes/agents.ts` | agent CRUD + template (all exist) |
| `PATCH /api/users/:userId/assistant` | `server/src/routes/assistant.ts:344` | assistant persona+triple save |
| `GET /api/harnesses` (descriptor `{type,name,models,modelProviders,...}[]`) | `server/src/routes/harnesses.ts:82` (`listCapabilityDescriptors`) | harness list + **discovered `descriptor.models`** (dropdown source) |
| `HarnessCapabilityDescriptor.models` (`HarnessModelDescriptor[]`) | `shared/src/harness/harness-capability-descriptor.ts:108,52` | dropdown option source (per-harness discovered set) |
| `HarnessDiscoveryInput.models` (already exists, unpopulated) | `server/src/harness/harness-discovery.ts:45` | probe → descriptor `models` carrier (missing-family path reads it at `harness-capability-descriptors.ts:206`) |
| probes `probeBuiltinGateway`/`probeOpenCodeCli`/`probeClaudeCodeCli`/`probeCodexCli`/`probeCursorAgentCli` | `server/src/harness/harness-discovery.ts:329,247,180,128,305` | populate `.models` per harness (sub-area (e)) |
| `describeRegisteredHarness` `builtinModels`/`cliModels` | `server/src/harness/harness-capability-descriptors.ts:74,87,142,162,177` | where `descriptor.models` is assembled (relabel today → discovered in (e)) |
| NEW gateway `/models` client | `server/src/harness/` alongside `model-gateway.ts`/`llm-client.ts` (`services/model-gateway.ts`, `harness/llm-client.ts`) | builtin discovered models (per-provider `/models` fetch) |
| `AdapterPool.refreshDiscoveries` / `discoverLocalHarnesses` | `adapter-pool.ts:112`, `harness-discovery.ts` | probe cadence (cache point for discovered models) |
| `MODEL_CATALOG` (`{id,label,provider}`) | `shared/src/model-gateway.ts:81` | **builtin-probe fallback ONLY** (not the dropdown source; never relabelled as "discovered") |
| `AGENT_ROLE_CATALOG`, `findRoleCatalogEntry` | `shared/src/agent-roles.ts` | catalog metadata for combobox |
| `SettingsModels` `TierRow`s, `CredentialsTab` | `web/src/settings/SettingsModels.tsx`, `web/src/components/CredentialsTab.tsx` | move into builtin-harness detail |
| `SETTINGS_SECTIONS` | `web/src/settings/settings-types.ts:48` | remove `worker`, `assistant` |
| `window.__HYPERIDLE__.backendMode` | used in `SettingsBackend.tsx:29`, `SettingsWorker.tsx:36` | backend-aware email hint + worker gate |

## 4. Schema / type deltas

- **DB: none.** No `agent_roles` table, no migration. `users.role` already holds custom roles.
- **Shared types: none required.** `MODEL_CATALOG`/`AGENT_ROLE_CATALOG` reused as-is.
- **Web types:** new `AgentEditorDraft` shape (extract of the current `EditFormValues`,
  `SettingsAgents.tsx:69`) lifted to a shared editor module; `RoleOption` (already defined on
  `RoleCombobox`). A small `modelOptionsForHarness(harnessDescriptor)` pure helper (web util) — reads the
  **discovered** `descriptor.models` (founder tweak); testable in isolation. **Helper contract:**
  - Return `descriptor.models` mapped to `{ value: id, label }` options (+ the "system default" empty
    option). This is the harness's DISCOVERED set — NOT `MODEL_CATALOG`.
  - `descriptor.models` empty → return **no** selectable options and signal `hasModels: false` so the
    editor renders the affordance (codex; or a provider needing a missing key). **Never** fall back to
    `MODEL_CATALOG` — an empty discovered list is an affordance, not a catalog fallback.
  - The old provider-filter contract is REMOVED. `modelProviders` is not read here; it is used only by the
    editor's on-switch `modelProvider` reconcile (§5(c)) and the server validator.
- **Server types:** no shared-type change — `HarnessModelDescriptor` + `HarnessDiscoveryInput.models`
  already exist. Sub-area (e) only POPULATES them (see §5(e)).
- **DS index:** `RoleCombobox` export added (done).

## 5. Sub-area breakdown (ordered)

The spec anticipates a split into (a)-(d); the founder tweak adds a backend sub-area **(e)**. Ordered by
dependency — **(e) sequences before/with (c)** because (c)'s dropdown consumes the discovered
`descriptor.models` (e) populates. Overall build order: (a) → (b) → (e) → (c) → (d):

### (a) Assistant-as-agent unification + shared editor extraction
- **Files:** `web/src/settings/SettingsAgents.tsx` (remove `:753` filter; lift `renderEditForm` into a new
  `web/src/settings/AgentEditor.tsx`; add assistant save-routing), delete `web/src/settings/SettingsAssistant.tsx`
  + `.stories.tsx`, `web/src/pages/SettingsPage.tsx` (drop the Assistant section, `:129-139`),
  `settings-types.ts` (drop `assistant` if present in nav). New `AgentEditor` calls
  `PATCH /api/users/:userId/assistant` when `agent.id.startsWith("ast-")` (persona+triple), else
  `PATCH /api/agents/:id`.
- **Tasks:** 1) extract `AgentEditor` (pure editor, endpoint-agnostic props: `onSave(draft)`);
  2) implement save-routing in the container; 3) remove the role filter so the assistant row appears;
  4) delete SettingsAssistant.
- **Ratio wiring:** the Agents SplitView (added in (c)) uses
  `const [ratio, setRatio] = useUiPreference("settings.agents", 0.42)` +
  `<SplitView surfaceKey="settings.agents" dividerRatio={ratio} onRatioChange={setRatio} ...>`. The
  `onRatioChange` prop is REQUIRED for the persisted-ratio AC — `surfaceKey` alone is presentational.
- **Proof test:** component test — the editor, given an `ast-*` agent + a systemPrompt edit, calls the
  assistant route (mock apiFetch, assert URL). And: given a normal agent, calls `/api/agents/:id`.

### (b) Built-in-harness + harness section into SplitView
- **Files:** `web/src/settings/SettingsHarnesses.tsx` (list → `ItemList`/`Row`; detail → SplitView
  destination), `web/src/settings/HarnessCard.tsx` (row markup → `Row`; the fold/expand becomes the
  split-pane detail; gate any residual inline fold on `hasCaps(d) && d.models.length > 0`),
  `web/src/settings/SettingsModels.tsx` (its `TierRow`s render inside the builtin detail),
  `web/src/components/CredentialsTab.tsx` (LLM key status grouped in builtin detail),
  `SettingsPage.tsx` (Models section folds into Agent backends → builtin detail).
- **Tasks:** 1) backends `ItemList`/`Row`; 2) SplitView with `surfaceKey="settings.backends"` +
  `const [ratio, setRatio] = useUiPreference("settings.backends", 0.42)` +
  `dividerRatio={ratio} onRatioChange={setRatio}`; 3) builtin detail = tiers + credentials;
  4) show/hide gate on real content.
- **Proof test:** component test — `SettingsHarnesses` renders rows; selecting builtin shows the tier
  rows in the destination; selecting a **non-builtin** (configurable) harness also opens a destination
  pane; a harness with no caps/models renders no fold trigger.

### (e) Harness model discovery — populate `descriptor.models` per harness (NEW, sequence BEFORE/WITH (c))
The dropdown source (§2). Populate the DISCOVERED `descriptor.models` at PROBE time (cached at discovery
cadence — NOT per request), from an honest per-harness source. All probe functions live in
`server/src/harness/harness-discovery.ts` and share the injectable `run`/`env`/`cwd` deps (`:69-87`), which
makes both real-binary integration and stubbed-unit tests clean.

- **builtin** (`probeBuiltinGateway`, `harness-discovery.ts:329`): live-query the RESOLVED gateway
  `/models`, cached. NEW per-provider HTTP `/models` client (no such client exists today — new code
  alongside `services/model-gateway.ts` / `harness/llm-client.ts`):
  - OpenRouter `GET https://openrouter.ai/api/v1/models` (**no auth**) → `data[].{id,name,context_length}`.
  - Anthropic `GET https://api.anthropic.com/v1/models` (`x-api-key` + `anthropic-version: 2023-06-01`) →
    `data[].{id,display_name,max_input_tokens}`.
  - openai-compatible `GET {baseUrl}/v1/models` (bearer) → `data[].{id}`.
  - Map each to `HarnessModelDescriptor {id, label:name, contextWindow, provider, selectable:true,
    inheritedFromGateway:true, options:[]}`. Resolve the active provider the same way `probeBuiltinGateway`
    already picks a credential (`:337-352`). **If the provider needs a key and none is present → `models`
    is legitimately `[]`** (state stays `unauthenticated` as today) — NEVER fabricate. `probeBuiltinGateway`
    becomes async (it is sync today). `builtinModels()` (`harness-capability-descriptors.ts:74`) reads the
    discovered list; `MODEL_CATALOG` remains ONLY as a last-resort fallback shape, never labelled
    "discovered". ⚠️ UNVERIFIED endpoint response shapes — confirm each `/models` payload against the
    provider's current API docs at build time before parsing.
- **opencode** (`probeOpenCodeCli`, `harness-discovery.ts:247`): shell out `opencode models --verbose` via
  the probe `run` deps; parse per-model JSON → `HarnessModelDescriptor {id, label:name, contextWindow}`.
  Real list = only providers opencode is configured for + its shipped catalog (correct/honest).
- **claude-code** (`probeClaudeCodeCli`, `harness-discovery.ts:180`): run `claude models`, parse the
  Markdown table (columns Model / Model ID / Context / …) into descriptors. This is the harness's OWN
  bundled catalog — honest. `claude models --json` does NOT exist. Do NOT relabel `MODEL_CATALOG` as
  discovered.
- **codex** (`probeCodexCli`, `harness-discovery.ts:128`): NO enumeration surface → `models: []`. The
  editor renders a "this harness manages its own model" affordance (optionally read `~/.codex/config.toml`
  `model` read-only for display). Do NOT fabricate a codex model list.
- **cursor-agent** (`probeCursorAgentCli`, `harness-discovery.ts:305`): inert → `models: []`.

**Wiring the discovered list into the descriptor.** The probes write `HarnessDiscoveryInput.models`
(`harness-discovery.ts:45`, field already exists). Two consumer paths must both read it:
- **Missing/unregistered families** already read it — `missingKnownHarnessDescriptors` →
  `cliModelsFromInput(discoveryInput?.models)` (`harness-capability-descriptors.ts:206`). No change.
- **Registered CLI harnesses** currently read `cliModels(caps)` from `caps.descriptorModels`, NOT from
  `discoveries[type].models` (`harness-capability-descriptors.ts:162,177`). Fix: in
  `describeRegisteredHarness`, prefer `discoveries?.[type]?.models` over `cliModels(caps)` for the CLI +
  external branches (fallback `cliModels(caps)`), so a probe-discovered opencode/claude list reaches the
  descriptor. **builtin** branch reads the async-discovered list via `builtinModels(caps)` fed from the
  probe (or via the same `discoveries?.[type]?.models` merge). Keep the merge additive — do not drop
  `descriptorModels` for adapters that supply it.

**Caching / cadence.** Discovery runs at boot + `AdapterPool.refreshDiscoveries` cadence (rate-limited to
1/5s per identity, `harnesses.ts:75`). The `/models` fetch + CLI `models` parse happen INSIDE the probe, so
they inherit that cadence and are NOT re-run per `GET /api/harnesses`. Per-probe timeout: reuse the probe's
existing execFile timeout (`:104` 15s) / a bounded HTTP timeout for the gateway fetch. A slow/failed
`/models` fetch → `models: []` (degrade to affordance), never a hang, never a fabricated list.

- **Files:** `server/src/harness/harness-discovery.ts` (the 4 CLI/builtin probes; new `/models` client
  module alongside `model-gateway.ts`/`llm-client.ts`), `harness-capability-descriptors.ts` (registered-CLI
  `models` merge from discovery), `adapter-pool.ts` (async-probe plumbing if `probeBuiltinGateway` becomes
  async), `routes/harnesses.ts` (no shape change — already returns `descriptor.models`).
- **Tasks:** 1) new per-provider `/models` HTTP client + builtin-probe wiring (empty-on-no-key);
  2) `opencode models --verbose` parse in `probeOpenCodeCli`; 3) `claude models` table parse in
  `probeClaudeCodeCli`; 4) codex/cursor `models: []` + editor affordance contract; 5) registered-CLI
  descriptor merge from `discoveries[type].models`.
- **Proof tests:** unit — the builtin probe, given a stubbed `/models` payload, yields those model ids as
  `descriptor.models`; given no key, yields `[]`. Unit — the opencode/claude parsers turn a fixture of real
  `models --verbose` / `claude models` output into the expected descriptors. **Harness-facing integration
  (REAL binary, no stub)** — `requireHarness('opencode')`, run the real `opencode models --verbose` through
  the probe and assert the parse yields a non-empty `descriptor.models` (hard-fail if the binary is absent;
  never `skipIf`). See dod.md AC-2.

### (c) Agent-edit SplitView + harness-DISCOVERED models + role combobox (consumes (e))
- **Files:** `web/src/settings/SettingsAgents.tsx` (list → `ItemList`/`Row`; editor → SplitView
  destination via the `AgentEditor` from (a); wire `useUiPreference("settings.agents", 0.42)` +
  `onRatioChange`), `AgentEditor.tsx` (swap the role `<Select>` for `RoleCombobox`; source the model
  `<Select>` from the selected harness's **discovered** `descriptor.models` via a new
  `modelOptionsForHarness` helper — NOT `MODEL_CATALOG`; render the empty-models affordance when the
  harness exposes none; fetch the role template on edit-open, not just add — call
  `GET /api/agents/templates/:role`), new `web/src/settings/model-options-for-harness.ts` (pure helper
  reading `descriptor.models`). **Remove the `MODEL_CATALOG` import from the agent-edit dropdown path**
  (`SettingsAgents.tsx:37,579`) — its deletion is the durable gate that the dropdown no longer maps the
  hardcoded catalog (dod AC-2 static check).
- **Tasks:** 1) list+SplitView `surfaceKey="settings.agents"` with `onRatioChange`;
  2) `modelOptionsForHarness(descriptor)` reads **discovered** `descriptor.models` (from the loaded
  `/api/harnesses` payload) + wire the model `<Select>`; when `descriptor.models` is empty render the
  affordance ("this harness manages its own model" / "no selectable models"), NOT an empty select and NOT a
  `MODEL_CATALOG` fallback; 3) role combobox; 4) edit-open template fetch;
  5) **harness-change `modelProvider` reconciliation** — on harness change reset a stale `modelId`: for a
  non-empty-`modelProviders` harness reset to a discovered/compatible entry; for an
  empty-`modelProviders` (provider-agnostic CLI) harness send `modelProvider: null`. This is the guard that
  makes AC-2's "save → no 422" true in production, not just in the dropdown-source test. It reads
  `modelProviders` (validator's field), independent of the discovered `models` list.
- **Proof tests:** unit test `modelOptionsForHarness` (descriptor with a discovered `models` list →
  those ids as options; `descriptor.models` empty → no options + `hasModels:false` for the affordance;
  NEVER returns `MODEL_CATALOG`). Component test — the `AgentEditor` model `<Select>` options equal the
  selected descriptor's discovered `models`; selecting a harness with empty `models` (codex) renders the
  affordance instead of a select. Save-payload test (the anti-422 guard) — for an empty-`modelProviders`
  harness the save sends `modelProvider: null` (NOT a stale provider); for a `claude-code`
  (`["anthropic"]`) harness selected while the draft still holds an `openrouter` model, the harness-change
  reconcile resets `modelId` so the save carries no incompatible provider. Component test — editing an agent
  with a known role prepopulates the template (mock template route). Component test — RoleCombobox commits a
  custom string via `onChange`.

### (d) Backend/worker consolidation + email hint
- **Files:** `web/src/settings/SettingsBackend.tsx` (render Worker inline when shared),
  `SettingsPage.tsx` (drop the Worker section, `:171-179`), `settings-types.ts` (remove `worker` from
  `SETTINGS_SECTIONS` + `SettingsSectionId`), `web/src/settings/SettingsProfile.tsx:99` (backend-aware
  hint), and the AppShell `visibleSettingsSections` filter (worker no longer a top-level section).
- **Tasks:** 1) move Worker body under Backend behind the shared-mode guard; 2) remove Worker section
  entry; 3) email hint helper keyed on `backendMode`.
- **Proof tests:** component test — `SettingsProfile` in local mode renders a hint without "login".
  Component test — Backend section shows Worker controls only in shared mode.

## 6. One PR vs separate WPs — RECOMMENDATION (re-assessed after the founder discovery tweak)

**Recommend: still ONE PR for this pipeline session, built in the (a)→(b)→(e)→(c)→(d) order above.**
Sub-area (e) — harness model discovery — grows the backend materially (a real `/models` client + two CLI
parses), so this recommendation was re-examined rather than carried over. It holds, for these reasons:

- **(e) is (c)'s data source — they are one seam.** The founder tied the discovery explicitly to the AV2
  Settings dropdown; (c)'s dropdown is meaningless without (e)'s `descriptor.models`, and (e) has no
  user-visible surface without (c). Splitting them creates a stacked (e→c) dependency the repo forbids
  (no stacked PRs), or an (e) PR that ships dead code with nothing consuming it. The `descriptor.models`
  seam is shared — one PR keeps producer + consumer reviewable together.
- **Shared blast surface (unchanged).** (a) extracts `AgentEditor`→(c); (b)+(c) both convert a section to
  `ItemList`+`SplitView` and both touch `SettingsPage.tsx`. Four/five split PRs = repeated hot-file rebases
  + forbidden stacking.
- **Coherent reviewable unit.** "Settings feels like one app" + "the dropdown shows the real per-harness
  models" read naturally as one review; the DoD ACs are cross-cutting.
- **Size honesty.** The frontend is still ~90% extraction; (e) is the one genuinely new backend layer
  (~a per-provider `/models` client + two parsers + a descriptor merge), bounded and independently
  testable. This is now **L-and-slightly-deep** (was L-but-shallow) — but still one coherent PR, not two
  WPs.

**Split trigger (flagged, not taken):** the ONLY condition that would justify carving (e) into its own WP
is if the `/models` discovery layer balloons — e.g. per-provider auth/paging/caching semantics turn out to
warrant their own design pass, or a provider `/models` shape proves materially harder than the grounded
facts assume. In that case, register a small backend WP for (e) that lands the discovered `descriptor.models`
FIRST, then AV2's (c) consumes it (topological order per `feedback_workplanning_dependency_order`). Default
recommendation remains one PR; escalate to a split only if (e) exceeds a bounded probe+parse+merge during
the build.

**Guardrail:** if the green-phase builder exceeds one session, resume per `feedback_builder_green_phase_timeout`
at a sub-area boundary — (e) and (c) are independently testable ((e) via probe/parse unit tests + the real
`opencode` integration test; (c) via component tests against a fixture descriptor). Do NOT split into
separate PRs mid-flight — finish on one branch.

## 7. Trade-offs & open questions

- **Models section disappears as a top-level section** (folds into the builtin-harness detail). This is
  the intended consolidation, but it's a discoverability change — surfaced for the human review.
- **Assistant row is not deletable / not re-roleable.** The RoleCombobox is `disabled` for `ast-*`
  (role stays `assistant`); the delete action should be hidden for the assistant row (one-per-user
  invariant). Confirm in review.
- **Discovered-models empty state** (codex; a provider needing a missing key; a failed/slow `/models`
  fetch). Resolved by policy: an empty `descriptor.models` renders an AFFORDANCE, never a `MODEL_CATALOG`
  fallback (§2, §4, §5(e)). The helper signals `hasModels:false`; the editor shows "this harness manages its
  own model". This is distinct from the `modelProvider` reconcile (which reads `modelProviders`, not
  `models`) — the two are independent: `models` drives the option list, `modelProviders` drives the 422
  save-guard.
- **Gateway `/models` response shapes are ⚠️ UNVERIFIED** against training data — the builder MUST confirm
  each provider's `/models` payload (OpenRouter / Anthropic / openai-compatible) against current API docs
  before writing the parser, per source-driven-development. The grounded facts in §5(e) are the founder's
  real probes (2026-07-06) but the exact JSON field names should be re-checked at build time.
- **SplitView in a section that also has a left section-nav** (AppShell settings overlay) → nested split
  columns. The design (IA-B) puts the SplitView as the section *body*, to the right of the section nav —
  matches how Conversations sits right of the sidebar. Verify no double-scroll in the painted review.
