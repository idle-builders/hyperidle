# X4 Design Critique: Model Gateway Settings UI

**Reviewer:** Phase 2 design critique  
**Artifact:** `plans/X4/design/approved.md`

---

## Dimension Scores

### 1. Task alignment — 9/10

The design correctly identifies the user task: "for this tier, which provider and which model?" The 3-tier structure maps directly to the domain model. The "set-and-forget" framing is accurate -- this is configuration, not daily workflow. Auto-save is appropriate for this kind of control.

No issues.

### 2. Information architecture — 8/10

Placement between Agents and Appearance is well-reasoned (model config is closely related to agent config). The 3-tier grouping is the natural organization. The section title "Models" is correct -- users think in terms of models, not gateways.

**Finding:** The provider-specific fields section describes three different field sets per provider, which is correct. However, the collapsed state summary line ("Anthropic / claude-opus-4") provides good scanability -- this is well-designed.

### 3. Interaction model — 7/10

The collapse/expand per tier is reasonable. Auto-save on blur/change is appropriate. Provider change revealing different fields is clear.

**Finding F-IA-1 (minor):** The design says "Changes auto-save on blur/change (debounced)" but does not specify what happens when the user changes the provider dropdown. Changing provider may invalidate the current model field (e.g., switching from Anthropic to OpenRouter changes the model format entirely). The design should specify: does the model field clear on provider change? Does it keep the old value (which would be invalid)? The architecture says debounce 500ms, which is fine, but the provider-change interaction needs clarification: the builder needs to know whether to clear dependent fields on provider change.

**Finding F-IA-2 (minor):** Escape to collapse is specified, but there is no mention of what happens to unsaved changes on Escape. Since auto-save fires on blur/change, Escape-collapse would trigger blur, which would auto-save. This is probably fine, but should be stated explicitly so the builder does not add "discard on Escape" logic.

### 4. Visual hierarchy — 8/10

The collapsed tier rows with mono badge (tier name) and secondary text (provider/model summary) create a clear scannable list. The expanded state adds depth with form controls. The credential status dot is a nice touch -- small, non-intrusive.

No blocking issues.

### 5. Density and economy — 8/10

Three rows at most, each collapsible. No wasted space. The "why not a table" rationale is solid (polymorphic rows, only 3 items, expanded form needs vertical space).

No issues.

### 6. Consistency — 8/10

Follows the established Settings section pattern (section header, component body, same fetch/save pattern). The collapse/expand is consistent with SettingsAgents inline edit pattern. Uses DaisyUI primitives (select, input, badge).

**Finding F-CON-1 (informational):** The design references "DaisyUI `collapse`" as an option. SettingsAgents uses manual expand/collapse (button + hidden div), not the DaisyUI collapse component. The builder should follow the SettingsAgents pattern for consistency. The design allows this ("or manual expand/collapse"), so this is informational, not blocking.

### 7. Error handling — 7/10

Loading state (skeleton bars), error state (inline message), save feedback (toast) are all covered. The credential status indicators (green/yellow/gray dots) handle the three credential states.

**Finding F-ERR-1 (blocking):** The design says "Link text 'Configure in Credentials' -- navigates to the Credentials section (scrolls down)." However, SettingsPage.tsx does NOT have a Credentials section. The CredentialsTab component exists but it is an Electron-only component (uses `window.__HYPERIDLE__` bridge) and is NOT mounted in the SettingsPage. In browser/shared mode, there is no Credentials section to scroll to. The design must either (a) drop the "Configure in Credentials" link, (b) specify that the link only appears when running in Electron, or (c) accept that the link target does not exist in v1. The builder cannot implement "scrolls down to Credentials" because the target section does not exist. **Recommendation:** Change the credential status indicator to show the status only (dot + label) without a navigation link. The user knows where to configure credentials (they already set them up to get this far).

**Finding F-ERR-2 (minor):** The design does not specify what happens when the user enters an invalid base URL for the OpenAI-compatible provider (e.g., not a valid URL, or a URL without /v1). The architecture specifies Zod `.url()` validation, but the design should specify the inline error UX -- does the field show a red border? An error message below? The current design only covers section-level error ("Failed to load model configuration") and save feedback (toast), not field-level validation errors.

### 8. Accessibility — 7/10

Tab navigation, Enter/Space toggle, Escape to collapse -- the keyboard nav is specified. Focus management between collapsed and expanded states is implied.

**Finding F-A11Y-1 (minor):** The design does not specify ARIA attributes. The collapsible tier rows should use `aria-expanded`, `aria-controls`, and the panel should have `role="region"`. The credential status dots should have `aria-label` (e.g., "Anthropic API Key: Valid"). The provider dropdown and model input should have associated `<label>` elements or `aria-label`. These are standard requirements for disclosure patterns.

**Finding F-A11Y-2 (minor):** The status dots (green/yellow/gray) convey state through color alone. The text labels ("Valid", "Present", "Not set") are present, which satisfies color contrast requirements. However, the dots themselves should not be the only indicator -- the text must always be visible, not hidden behind a tooltip or hover. The design text implies both dot AND text are visible, which is correct.

### 9. Implementability — 8/10

The design is clear enough to implement. Component budget is zero (no new custom components). The pattern is well-established. The provider-specific field logic is described.

**Finding F-IMP-1 (minor, linked to F-IA-1):** The builder needs to know provider-change behavior for dependent fields (model, baseUrl, apiKey). The design should state: "When provider changes, reset model to the default for that provider (or empty for OpenRouter/OpenAI-compatible), clear baseUrl and apiKey."

---

## Summary

| Dimension | Score |
|---|---|
| Task alignment | 9 |
| Information architecture | 8 |
| Interaction model | 7 |
| Visual hierarchy | 8 |
| Density and economy | 8 |
| Consistency | 8 |
| Error handling | 7 |
| Accessibility | 7 |
| Implementability | 8 |
| **Average** | **7.8** |

**Verdict: PASS (7.8 >= 7.0)**

## Blocking Findings

1. **F-ERR-1:** The "Configure in Credentials" link targets a section that does not exist in SettingsPage. The CredentialsTab is Electron-only and is not mounted in the stacked settings page. The builder cannot implement this link. **Resolution:** Remove the navigation link. Show credential status (dot + label) without a link. The credential management surface is out of scope for X4.

## Non-Blocking Findings for Builder Awareness

2. **F-IA-1 / F-IMP-1:** Specify provider-change behavior for dependent fields (clear model/baseUrl/apiKey on provider change).
3. **F-IA-2:** Clarify that Escape-collapse triggers blur and therefore auto-save.
4. **F-ERR-2:** Add field-level validation error UX for invalid base URLs.
5. **F-A11Y-1:** Add ARIA attributes to the disclosure pattern (aria-expanded, aria-controls, aria-label on status indicators).
6. **F-CON-1:** Follow SettingsAgents manual expand/collapse pattern, not DaisyUI collapse component.
