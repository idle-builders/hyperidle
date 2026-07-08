# AV2 — Definition of Done (ACs → verification methods)

Verification tools: **test** = Vitest component/unit test (imports code, asserts behavior);
**lint/type** = static property via ESLint/tsc; **visual** = `/designsystem` render (human review) or
`npx playwright screenshot` of the running app, read the PNG. Per CLAUDE.md: runtime behavior → test;
static property → lint/type; visual correctness → paint check. **Static properties are enforced by
deleting the file/branch so `tsc` fails on any reference — never by a manual review-grep** (a grep is not
a durable gate; the next edit reintroduces the thing and nothing catches it).

---

### AC-1 — Assistant is a row in the agents list; no separate section, no role exclusion
- **test (runtime):** `SettingsAgents` component test — render with a fixture list containing an
  `ast-<userId>` agent; assert a row for the Assistant appears (`getByText("Nova")` / the assistant name)
  and that clicking it opens the shared editor (destination pane visible).
- **type/lint (static — enforced by deletion, not grep):** `SettingsAssistant.tsx` (+ `.stories.tsx`) is
  DELETED → `tsc` fails if anything still imports it, and the DS story index no longer resolves it. The
  `role !== "assistant"` filter is REMOVED and the assistant row is asserted present by the runtime test
  above — so a re-added filter would make that test go red. There is no standalone "grep for the filter"
  gate; its absence is enforced by the component test rendering the assistant row. (`npm run check` +
  `npm run test`)
- **Proof of done:** `/designsystem` → `SettingsAgentsSplit` story shows the Assistant as a row +
  running-app screenshot of Settings → Agents with the Assistant present.

### AC-2 — Detail/edit opens in SplitView (persisted ratio); model dropdown offers HARNESS-DISCOVERED models; save never 422s
**Founder concept-review tweak (BLOCKING):** the dropdown for a selected harness offers **that harness's
DISCOVERED models** (builtin = the gateway `/models` list; opencode = `opencode models`; claude-code =
`claude models` table) — **NOT the hardcoded `MODEL_CATALOG`.** A harness with no enumerable models shows
the affordance, **not** the global catalog.
- **test (runtime):**
  - **Discovery — builtin (unit):** the builtin probe, given a stubbed `/models` payload (via the probe's
    injectable `run`/fetch dep), yields those model ids as `descriptor.models`; given no key present →
    `descriptor.models === []` (never fabricated, never `MODEL_CATALOG`).
  - **Discovery — opencode (harness-facing INTEGRATION, REAL binary, no stub):**
    `*.integration.test.ts` gated by `requireHarness('opencode')` — run the real `opencode models --verbose`
    through `probeOpenCodeCli` and assert the parse yields a non-empty `descriptor.models` with
    `{id,label,contextWindow}` shape. **Hard-fail if the binary is absent — never `skipIf` to green**
    (honest-harness rule). This is the honest per-harness proof: no stub of the harness under test.
  - **Discovery — claude-code (unit):** `probeClaudeCodeCli` parsing a fixture of real `claude models`
    Markdown-table output yields the expected descriptors (harness's own bundled catalog, not `MODEL_CATALOG`).
  - **Dropdown source (`modelOptionsForHarness` unit):** a descriptor with a discovered `models` list →
    those ids as options; `descriptor.models === []` → no options + `hasModels:false` (the affordance
    signal); the helper NEVER returns `MODEL_CATALOG`.
  - **`AgentEditor` component test:** the model `<Select>` options equal the selected descriptor's
    discovered `models`; switching to a harness with empty `models` (codex) renders the **affordance**
    ("this harness manages its own model") instead of an empty select or a catalog fallback.
  - **`AgentEditor` save-payload test (the anti-422 guard — REQUIRED, reads `modelProviders` not `models`):**
    (i) selecting an empty-`modelProviders` harness (provider-agnostic CLI, e.g. codex/opencode) and saving
    sends `modelProvider: null` (not a stale provider) — assert the mocked apiFetch body;
    (ii) starting from a draft whose model provider is `openrouter`, switching to `claude-code`
    (`modelProviders:["anthropic"]`) reconciles `modelId` so the save body carries no anthropic-incompatible
    provider.
  - **`validateAgentConfig` route test** (`packages/server`) — a save for a harness registered with
    `modelProviders: []` and a set provider does NOT return 422 INCOMPATIBLE_HARNESS_MODEL (locks the
    validator's empty-list exemption the reconcile relies on). Keep the empty-`modelProviders` no-422 test.
  - **ratio persistence (component test):** the Agents SplitView passes `onRatioChange`; assert the
    SplitView receives a non-undefined `onRatioChange` wired to the `useUiPreference` setter (or: driving
    `onRatioChange(0.5)` updates the persisted preference). `surfaceKey` alone does not persist.
- **type/lint (static — enforced by deletion, not grep):**
  - **No `MODEL_CATALOG` in the agent-edit dropdown path.** The `MODEL_CATALOG` import is removed from the
    agent-edit dropdown code (`SettingsAgents.tsx`/`AgentEditor.tsx`) — the dropdown maps `descriptor.models`
    only. Enforced by deletion + `tsc`: the `modelOptionsForHarness` helper does not import `MODEL_CATALOG`,
    and the component test asserting "options equal `descriptor.models`" goes red if the catalog map is
    reintroduced. (An eslint `no-restricted-imports` rule banning `MODEL_CATALOG` in the agent-edit path is
    an acceptable additional durable gate.) No review-grep.
  - the inline `<tr>` edit-row markup is DELETED when the editor moves into the SplitView destination; the
    "editor renders inside `SplitView` (destination pane / `data-fold-mode` present)" component test goes
    red if the inline `<tr>` editor is reintroduced. No `<tr>` review-grep. (`npm run check` + `npm run test`)
- **Proof of done:** running-app screenshot: open an agent → editor in the right pane; open the model
  dropdown on a harness → its **discovered** models (e.g. the real `opencode`/`claude` set), NOT the global
  catalog; select codex → the empty-models affordance; save → no 422; resize the divider, reload → ratio
  restored. (Discovered-models proof for builtin/opencode/claude also carried by the runtime + real-binary
  integration tests above — the paint check confirms the affordance + list render.)

### AC-3 — Can set a new/different role; editing loads the role's system-prompt template
- **test (runtime):**
  - `RoleCombobox` component test — typing a non-catalog string surfaces "Use new role: X" and Enter/click
    calls `onChange("X")`; selecting a catalog row calls `onChange(role)`.
  - `AgentEditor` component test — opening an agent with role `builder` fetches
    `/api/agents/templates/builder` (mock apiFetch) and prefills the system prompt textarea; a custom role
    with a 404 template leaves the prompt as-is (no crash).
- **type/lint:** `RoleCombobox` exported from `design-system/src/index.ts` (present); `tsc` green.
- **Proof of done:** `/designsystem` → `RoleCombobox` story (`OpenWithCustomAffordance`) painted +
  running-app screenshot of the combobox on an agent.

### AC-4 — Built-in harness models + credentials grouped; configurable harness opens in split-pane; show/hide only when foldable
- **test (runtime):** `SettingsHarnesses` component test —
  - selecting the **builtin** row renders the tier rows (`Reasoning`/`Workhorse`/`Fast`) + credential
    status in the destination pane;
  - selecting a **non-builtin (configurable)** harness row ALSO opens a destination pane (so "configurable
    harness in split-pane" is proven, not just the builtin path);
  - a descriptor with `hasCaps===false && models.length===0` renders no fold/show-hide trigger.
- **type/lint (static — enforced by deletion, not grep):** the `Models` top-level section is DELETED from
  `SettingsPage.tsx` (and from `SETTINGS_SECTIONS` if listed) → `tsc` / the section-render component test
  fails if a dangling `Models` section reference remains. `HarnessCard` uses `Row` — enforced by the
  runtime test above asserting the harness rows render as `Row` (matching list markup), not by grepping for
  a hand-rolled container. (`npm run check` + `npm run test`)
- **Proof of done:** running-app screenshot: Agent backends list + builtin detail showing tiers +
  credentials together; a configurable harness selected showing its detail pane.

### AC-5 — Worker consolidated under Backend (shared mode only); email hint not "notifications and login" in local mode
- **test (runtime):**
  - `SettingsProfile` component test — with `window.__HYPERIDLE__.backendMode` unset/`"local"`, the email
    `Input` hint does not contain "login"; with `"shared"`/web it does.
  - `SettingsBackend` component test — Worker controls render only when `backendMode==="shared"`.
- **type/lint (static):** `worker` removed from `SettingsSectionId` union + `SETTINGS_SECTIONS`
  (`settings-types.ts`) → `tsc` catches any dangling `"worker"` reference. (`npm run check`)
- **Proof of done:** running-app screenshot (local mode): no top-level Worker section; profile email hint
  correct; (shared mode) Worker controls under Backend.

---

## Global gates (per CLAUDE.md)
- `npm run check` — zero NEW type errors.
- `npm run lint` — zero NEW lint errors (incl. `eslint-plugin-design`: no off-grid spacing, no hardcoded
  colors, no AI-aesthetic tells in `RoleCombobox` + all edited settings files).
- `npm run test` — all component/unit tests above green (incl. the AC-2 discovery unit tests, the
  `modelOptionsForHarness`/affordance tests, the save-payload anti-422 guard, and the `validateAgentConfig`
  empty-`modelProviders` route test).
- `npm run test:integration` (local) — the harness-facing **real-`opencode`** discovery test
  (`requireHarness('opencode')`, no stub, hard-fail if absent) proving `opencode models --verbose` parses
  into `descriptor.models`. Per the harness-integration rule this is a local lane whose result rides the
  attestation, not a CI job.
- Every custom component has a `.stories.tsx` — `RoleCombobox.stories.tsx` present (design artifact).
- Visual: the two `/designsystem` stories reviewed in `/pipeline:human-concept-review` (DESIGN-CLASS
  novel + DOC-CLASS significant → human review runs), plus running-app paint check in `/pipeline:review`.
