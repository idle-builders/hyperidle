# Design Critique: AG7 — Settings Consistency Pass

DESIGN-CRITIQUE: variant=approved.md score=8/10  rounds=1  axes: H:8 S:7 T:8 C:8 Co:9 St:9 A:8 AS:9 PP:7

This is a routine consistency/presentation pass. There is no rendered variant — `approved.md` is a per-section mapping from today's divergent construction onto one shared set of primitives, plus the unified header/label/hint/spacing spec and the card-vs-flat rule. The critique scores the *contract*: when applied faithfully, does the page become coherent, and are the per-section mappings correct against the actual source and the actual primitive APIs.

Verified the design's load-bearing primitive-API claims against source: Input className→wrapper div (Input.tsx:63) ✓; Toggle role="switch" (Toggle.tsx:41) ✓; Skeleton no `.skeleton` class, role="status" (Skeleton.tsx:60-63) ✓; StatusChip Status union has no "connecting" (StatusChip.tsx:4) ✓; Appearance ring uses hardcoded `rgba(22,118,79,0.1)` = AQ-008 (SettingsAppearance.tsx:88) ✓.

---

### CRITICAL
- None. The design contract is sound and faithfully grounded in the real source files and real primitive APIs.

### WARNING

- **[approved.md §1.9 + §reconciliation] StatusChip color semantics break the design's own "color = meaning" intent for warning states.** The design maps Worker "Connecting" → `paused` and Agents "Harness unavailable" → `paused`/`blocked` "warning". But `paused` resolves to `--status-info` (#2e7dba blue), not warning amber (StatusChip.tsx:77, tokens.css:180). The *only* amber-rendering Status is `behind`. So "Connecting" (a transitional/attention state) and "Harness unavailable" (a degraded state) would render BLUE, while "Disconnected" → `behind` renders AMBER. That inverts the intended hierarchy: the soft transitional state looks more alarming than the connecting state, and a genuine config problem (harness unavailable) reads as informational. Fix: pin the status→color mapping explicitly in the plan. Suggested: Connected→`healthy`(green), Connecting→`behind`(amber) or accept `paused`(blue) as "in progress", Disconnected→neutral, Harness-unavailable→`behind`(amber) or `error`(red). The architecture's "map to paused" is a build instruction that produces the wrong color — the design must specify the color outcome, not the union member.

- **[approved.md §1.2 / §3 Models] Field-label size will REGRESS, not unify, if Select/Input `label` prop is adopted for the dense Models tier rows.** Today Models tier sub-labels are 12px ("Provider"/"Model"/"Base URL"/"API Key" at `text-[12px]`, SettingsModels.tsx:130,145,188,203). The primitive `label` prop emits 13px/500 (Input.tsx:65, Select.tsx:79). The design says "all field labels read at one size" via the primitive — but it does not acknowledge that this *enlarges* every Models/Agents sub-label from 12px→13px inside already-dense control clusters. That is the intended unification (one label size page-wide), but the design should state it explicitly as a deliberate density change for the dense forms, and confirm the dense tier rows still fit at 13px labels. As written a reader could mistake the 12px→13px shift for an accident.

- **[approved.md §2 / §4 — card-vs-flat rule has an unresolved internal contradiction the design flags but does not close].** The "one documented rule" (AC-5) is stated as "list/table data → card; form fields → flat." But the design then carves three exceptions in the same section: (a) Credentials rows are list data yet stay flush/not-carded; (b) Models tiers are "list data" yet carded because they are "mini-forms"; (c) Agents table is list data yet flat. The real operative rule is "a row that *contains a form* gets a card; a pure display/single-reveal row stays flush." That is a defensible rule, but it is NOT the rule stated in the one-sentence summary (§2 first line), which keys on "list/table data." AC-5 asks for ONE rule "rather than varying section to section without reason" — the reasons here are sound but the headline rule and the applied rule disagree. Fix: rewrite the §2 headline to the real rule ("a row containing an inline form/mini-form gets a card; pure display rows stay flush; direct form-field sections are flat") so the documented rule and the per-section table actually match.

### SUGGESTION

- **[approved.md §1.5] The spacing target keeps both `gap-[12px]` and `gap-[18px]` as field-stack values across sections** (Models tiers use 12px, Profile/Worker use 18px). This is on-grid and defensible (dense vs. roomy), but "same spacing scale" (AC-1) reads more strongly if the design names *which* sections are dense-12 vs roomy-18 as a rule, not case-by-case. Minor — the values are all on-grid.

- **[approved.md §3 Appearance] The swatch active-ring fix replaces `rgba(22,118,79,0.1)` with `--accent-primary-dim`.** Confirm `--accent-primary-dim` is the 0.1-alpha green tint (it is the same token Input/Select use for the focus ring), so the visual weight of the active swatch ring stays equivalent. Good reuse; just verify the alpha matches so the swatch selection affordance does not get heavier/lighter.

- **[approved.md §1.7] EmptyState compact and Skeleton/SkeletonList both render `role="status"`** (EmptyState.tsx:62, Skeleton.tsx:60,86). These are mutually-exclusive render states per section so there is no runtime collision, but the design/test approach should assert empty via the `empty-state` testid (not `role="status"`) to avoid a brittle selector. The architecture already does this — noted for consistency.

### What's Working Well
- **Component-reuse discipline is exemplary (Coherence 9).** The design refuses to invent a `SettingsField`/`SettingsRow` wrapper (rejected list), reuses StatusChip from CredentialsTab's in-page precedent, and maps every control to an existing Tier-0/Tier-2 primitive. This is exactly the "reuse over inline reimplementation" the rubric rewards, and it is the single biggest driver of the consistency win.
- **States completeness (States 9).** The design names loading/error/empty for every async section and correctly separates *pane-level* load failure (ErrorState compact) from *field-level* validation (`role="alert"` inline) — a distinction most consistency passes miss. The rejected-directions list explicitly defends not conflating them.
