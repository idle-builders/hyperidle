# X4 Design: Model Gateway Settings UI

## Classification: Routine

Adding a new section to the stacked Settings page. The pattern is well-established (Profile, Org Chart, Agents, Appearance, Backend sections already exist). The interaction model is identical: a section with structured form controls, load/save against an API endpoint.

One variant explored because the interaction grammar is established and the data shape is constrained (3 tiers, each with provider + model).

---

## Variant A: Tier Card Stack (Selected)

### User Task

The founder configures which model provider and model each tier uses. This is a set-and-forget configuration: configure once, revisit when switching providers or updating models. The decision is "for this tier, which provider and which model?"

### Layout

A new "Models" section in SettingsPage, placed between "Agents" and "Appearance" (because model config is closely related to agent config -- agents have a modelTierPreference that references these tiers).

```
+----------------------------------------------------------+
| Models                                                    |
|                                                          |
| Three model tiers determine which LLM each agent uses.  |
| Agents select a tier; this page maps tiers to providers. |
|                                                          |
| ┌──────────────────────────────────────────────────────┐ |
| │ reasoning              Anthropic / claude-opus-4  [v]│ |
| │ ──────────────────────────────────────────────────── │ |
| │ Provider    [Anthropic (direct)        v]            │ |
| │ Model       [claude-opus-4-20250514    v]            │ |
| └──────────────────────────────────────────────────────┘ |
|                                                          |
| ┌──────────────────────────────────────────────────────┐ |
| │ workhorse              Anthropic / claude-sonnet-4[v]│ |
| │ ──────────────────────────────────────────────────── │ |
| │ Provider    [Anthropic (direct)        v]            │ |
| │ Model       [claude-sonnet-4-20250514  v]            │ |
| └──────────────────────────────────────────────────────┘ |
|                                                          |
| ┌──────────────────────────────────────────────────────┐ |
| │ fast                   Anthropic / claude-haiku-3 [v]│ |
| │ ──────────────────────────────────────────────────── │ |
| │ Provider    [Anthropic (direct)        v]            │ |
| │ Model       [claude-haiku-3-5-20241022 v]            │ |
| └──────────────────────────────────────────────────────┘ |
|                                                          |
+----------------------------------------------------------+
```

### Interaction Model

Each tier row has two states:

**Collapsed state (default):** Shows tier name (left, mono badge), current provider/model summary (right, secondary text), and a chevron toggle.

**Expanded state:** Shows two dropdowns:
- **Provider** dropdown: "Anthropic (direct)" | "OpenRouter" | "OpenAI-compatible"
- **Model** text input with datalist: When provider is "Anthropic (direct)", shows Anthropic model IDs. When provider is "OpenRouter", the user types the OpenRouter model path (e.g., `anthropic/claude-sonnet-4`). When provider is "OpenAI-compatible", shows a Base URL text field in addition to the model field.

Changes auto-save on blur/change (no explicit Save button needed for individual tier changes). This matches the "immediacy" of settings changes -- there's nothing to preview or stage.

### Provider-Specific Fields

**Anthropic (direct):**
- Model: dropdown with known Anthropic model IDs
- API key: uses `anthropic_api_key` from credential resolver (shown as status indicator, not editable here -- link to Credentials section)

**OpenRouter:**
- Model: text input (OpenRouter model paths like `anthropic/claude-sonnet-4`)
- API key: uses `openrouter_api_key` from credential resolver (status indicator)

**OpenAI-compatible:**
- Base URL: text input (e.g., `https://api.together.xyz/v1`)
- Model: text input
- API key: text input (stored per-tier in serverConfig, not in credential catalog -- because the catalog is fixed at 3 entries and we don't know how many OpenAI-compatible providers users might add)

### States

**Empty/default state:** All three tiers show Anthropic direct with the current hardcoded defaults from `MODEL_TIER_MAP`. This is pre-populated, not empty -- the system always has a model config.

**Loading state:** Skeleton bars (3 rows, matching the collapsed tier layout).

**Error state:** Inline error message below section header: "Failed to load model configuration."

**Save feedback:** Toast notification on successful save ("Model configuration saved"). Error toast on failure.

### Credential Status Indicators

Each tier row (in expanded state) shows a small status dot next to "API Key":
- Green dot + "Valid" -- credential exists and is validated
- Yellow dot + "Present" -- credential exists but untested
- Gray dot + "Not set" -- credential missing
- Link text "Configure in Credentials" -- navigates to the Credentials section (scrolls down)

This avoids duplicating credential management UI. The credential catalog is fixed and the existing CredentialsTab handles CRUD.

### Why NOT a table layout

The Agents section uses a table because it has many agents with uniform columns. Model config has exactly 3 rows with different field sets per provider. A card/accordion layout is more appropriate because:
1. Provider selection changes which fields appear (polymorphic rows)
2. Only 3 items -- no scrolling or pagination concern
3. The expanded form needs more vertical space than a table cell

### Component Budget

No new custom components required. This section uses:
- DaisyUI primitives: `select`, `input`, `badge`, `collapse` (or manual expand/collapse)
- Existing patterns from SettingsAgents (inline expand, save feedback via useToast)
- The section itself is a plain function component (`SettingsModels.tsx`) following the same pattern as `SettingsAgents.tsx`, `SettingsBackend.tsx`, etc.

### Keyboard & Focus

- Tab navigates between tier rows in collapsed state
- Enter/Space toggles expand/collapse on focused tier row
- Tab within expanded row moves through Provider dropdown, Model field, (Base URL if visible)
- Escape collapses the current tier row

### Section Title & Description

Title: "Models" (not "Model Gateway" -- users don't think in gateway terms)
Description: "Each model tier maps to a provider and model. Agents use tiers; this controls which LLM backs each tier."

---

## Self-Critique

**Strengths:**
- Follows established Settings section patterns (no new components, no new interaction grammar)
- The 3-tier structure maps directly to the domain model -- no UI-data translation needed
- Auto-save eliminates a "what if I forget to save" failure mode
- Credential status indicators connect this section to the existing Credentials UI without duplicating it

**Weaknesses / Watch Items:**
- Auto-save means no "revert" -- but model config is set-and-forget, and misconfiguration is caught at session start (clear error message per AC)
- The "OpenAI-compatible" provider stores API keys in serverConfig (not the credential catalog) because the catalog is fixed at 3 entries. This is a pragmatic trade-off: adding a dynamic credential catalog is scope creep for X4, but storing a key in plain JSON in serverConfig (even though it's a DB blob) is less secure than the encrypted server_credentials table. Architecture should address this.
- The datalist for Anthropic models is a hardcoded list on the client side. Adding new Anthropic models requires a code change. This is acceptable for v1 -- the alternative (fetching model lists from APIs) adds complexity and external dependencies.

**What was rejected:**
- Table layout (wrong for 3 polymorphic rows)
- Separate page (Settings is a single stacked page per W3)
- Per-agent provider overrides (explicitly out of scope per spec)
- Model testing/validation button (session start validates; adding a "test" button is scope creep)
