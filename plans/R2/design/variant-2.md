# R2 Design Variant 2: Product Name Visible, API Key Optional

## Design Classification: Routine

Same scope as Variant 1 but explores a different trade-off on the setup flow: keep API key optional (with "skip" affordance), and show product name as an optional pre-filled field so the user sees what they are creating.

---

## Surface 1: SetupFlow -- "Transparent Defaults"

### Proposed State (2 required + 2 optional fields, single section)

**Required fields:**
- Name (text input, autoFocus)
- API Key (password input)

**Optional fields (visible, pre-filled or empty):**
- Product name (text input, placeholder "My Product", pre-filled if repo path is given)
- Repo path (text input with folder picker, optional)

**Key difference from Variant 1:** Product name is visible as an optional field with a default placeholder. The user can see and override the default. This makes the product creation visible rather than silent.

**Another difference:** API key is still marked as required in the UI but a "Skip for now" link appears below the API key field (not as a footer button). Text: "Skip for now -- your agents won't be able to run until you add a key in Settings." This preserves the browsing flow for users who want to see the interface before committing a key.

**Start button gated on:** name only. API key absence is tolerated with a skip path.

**Section headings:** None. All fields in a single flat list under "HyperIdle Setup" title.

**Removed (same as V1):**
- Backend Mode section
- Email field

**Post-submit behavior:** Same as V1 -- create user, create product (using visible product name field or "My Product" default), optionally store API key, navigate to /work/portfolio.

---

## Surface 2: WorkPortfolio Empty State

**Same as Variant 1.** No design divergence on this surface.

The enhanced empty state with "Ready to shape your first bet" + Create bet action button in the EmptyState action slot is the right pattern regardless of setup variant.

---

## Surface 3: BetCreateDialog

**Same as Variant 1.** Product picker hidden when single product; pitch-only field.

One minor difference: since V2 allows skipping the API key, the user might try to create a bet without a key. The bet creation will still work (it creates a bet in the DB), but no agents can process it. This is acceptable -- the bet just sits in "shaped" status. The user gets nudged to add a key via Settings.

---

## Self-Critique

**Strengths:**
- Product creation is visible, not magic -- user sees what they are creating
- "Skip" path allows browsing the UI before committing an API key
- More discoverable: user can name their product during setup

**Risks:**
- Four visible fields is more than two. The spec says "two required fields" -- this variant meets that but adds visual noise with the optional fields.
- "Skip for now" creates a degraded state (no API key) that persists until the user manually goes to Settings. This might confuse users who expect agents to work.
- Showing product name as optional might make users think they MUST fill it, increasing cognitive load.

**Comparison to Variant 1:**
| Dimension | V1 (Minimal Strip) | V2 (Transparent Defaults) |
|-----------|--------------------|-----------------------------|
| Field count visible | 2-3 | 4 |
| Product creation | Silent | Visible with default |
| API key | Required | Required + skip affordance |
| Time to "Start" | Faster (fewer fields) | Same required, more optional |
| Discoverability | Lower (magic product) | Higher (visible product name) |
| Spec alignment | Exact match | Slight stretch (4 visible fields) |

**Score (self-assessed):**
- Hierarchy: 7 (more fields = more visual competition)
- Spacing: 8 (same layout)
- Typography: 8 (same system)
- Color: 7 (skip link adds a secondary action that competes with primary)
- Coherence: 7 (mixed required/optional signals on a "get started" page)
- States: 8 (skip path is well-defined, all states handled)
- A11y: 8 (same as V1)
- Anti-slop: 8 (no decorative additions, but more elements)
- Premium polish: 7 (functional, slightly busier)
