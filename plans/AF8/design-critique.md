# Design Critique: AF8 — Notification popover (Variant B) + Settings type-list

Reviewer persona, cold read. Screenshotted all three mockups (popover A, popover B, settings). Read both variant specs, brief, comparison, synthesis, approved.md, the locked concept + primitive, AESTHETICS/AQ rules, and verified every referenced token + DS primitive exists.

DESIGN-CRITIQUE: variant=popover-b-purpose score=8/10 rounds=0 axes: H:9 S:8 T:8 C:9 Co:8 St:8 A:7 AS:9 PP:7
DESIGN-CRITIQUE: variant=settings-typelist score=8/10 rounds=0 axes: H:8 S:8 T:8 C:8 Co:9 St:7 A:8 AS:9 PP:7

**Overall (design): 8.0/10. Verdict: APPROVED.** No CRITICAL. Contracts honored. Below are WARNING/NIT items for the builder + architect to resolve at implementation.

---

## Contract compliance (the locked-concept checks the prompt asked for)

| Locked contract | Honored? | Evidence |
|---|---|---|
| Ephemeral popover, never the rail | YES | `CocOverlay` idiom, `fixed bottom-16 left-4`, zero footprint until opened; anchored at sidebar bottom by avatar (`Sidebar.tsx:374`). |
| Row = title + source-link jump + relative time + per-row mute + dismiss | YES | All five present; row anatomy spec lines 8-13; screenshot confirms title-dominant single line. |
| Unread affordance (dot, not number) | YES | 6px `--accent-primary` dot, `unseenCount>0`; explicitly NOT a number (number = §4.2 triage grammar). Correct distinction. |
| Popover reads the notification store | YES | `useNotifications` polls `/notifications/inbox`; not thread-derived. |
| §4.2 triage badge kept DISTINCT | YES | Brief line 17 + synthesis rejected-item #4 + dot-not-number rule. Hard rule #7 respected. |
| Settings list registry-driven, supersedes 3 AF15 toggles | YES | Renders over `NOTIFICATION_TYPES`; removes hardcoded `NOTIFICATION_SETTINGS`, `SERVER_KEY_MAP`, `email-digests` row, AD3 solo-filter. Screenshot shows exactly 3 registry toggles, no digest row. |
| One mute state, two surfaces | YES | Popover mute shortcut + Settings toggle write the same store. |
| 360px-truncation evidence for choosing B | SOUND | A truncates titles to ~6-9 chars ("Revie…", "Agent …") — StatusChip + icon circle + colored border + Tag eat the row before the title. B truncates at ~22 chars, title still communicates. A notification that can't show its title fails its only job. Evidence is honest and decisive. |

---

## Popover Variant B (8/10)

### WARNING
- `popover-b-purpose/spec.md:13` / `approved.md:31` — **Hover-reveal mute/dismiss are invisible at rest on desktop.** The whole-row jump is the discoverable action, but the two destructive/important verbs (mute, dismiss) only appear on `group-hover`/`focus-within`. A first-time user does not know dismiss exists until they hover. Mitigated by always-visible-on-touch + focus-within, but on desktop this is a discoverability cost on the primary triage verbs. Accept for v1 (Linear/GitHub use the same idiom) but flag: if the popover's job is "dismissal queue" (brief Probe 1), hiding the dismiss verb at rest is in mild tension with that job. SUGGESTION: consider `opacity-60` at rest rising to `opacity-100` on hover, rather than `opacity-0`.
- `approved.md:24` — **Whole-row click vs. inner `<button>`s — nested interactive elements.** The row is a jump target AND contains two trailing `<button>`s (mute, dismiss). The spec says "a real `<button>` wrapping the content, or row `onClick` + keyboard handler." A `<button>` cannot legally contain `<button>` children (invalid HTML, breaks AT). The builder MUST use the row-`onClick`+keyboard-handler form (not a wrapping `<button>`), with the row as a `role`-less clickable `<div>` carrying `onClick`/`onKeyDown`/`tabIndex`, OR restructure so the jump target is the title `<button>` and the trailing buttons are siblings. Architect/builder must pin this — the "or" in the spec leaves an invalid option on the table. (This is the kind of thing that ships as a nested-button a11y bug.)

### NIT
- `approved.md:29` — Type label "COST"/"REVIEW"/"BLOCKER" uppercase mono with `tracking-caps-sm` (0.06em). AQ-007 says StatusChip/Tag uppercase labels carry `--tracking-caps` (0.08em); the *smaller* subtitle variant uses `--tracking-caps-sm` (0.06em). An 11px inline type label is the small case — `tracking-caps-sm` is correct. No change; noting the rule was applied right.
- `approved.md:46` — Dismiss fade "opacity + 4px translateY, honor `prefers-reduced-motion` → opacity only" with `motion-fast` (120ms). Compliant with AQ-013/AQ-014 (animates only opacity+transform). Good.
- Empty-state copy "All caught up" is a near-universal AI default (Linear, GitHub, Slack all use it). Not slop per se, but unremarkable. Optional: a copy with more HyperIdle voice. Not blocking.

### What's Working Well
- **Single color signal.** One urgency dot (`--status-error` for immediate, `--border-strong` for ambient) vs. A's three competing signals (StatusChip + colored border + icon circle). Red-only-for-danger is the Lucid discipline; correctly applied.
- **Rejecting the DS `NotificationRow` was right, and the rejection is grounded.** AQ-113 ("list-row primitives must accept `icon` as optional and not render a placeholder when omitted") names exactly A's failure — the empty decorative icon circle. B's purpose-built inline row dodges it. The reuse-vs-purpose-built decision is the one real design question and it was settled with screenshot evidence, not taste.
- **Component budget = 0 new DS primitives, honestly.** EmptyState, Toast, Toggle, ErrorState all verified to exist. The row is a single-consumer Tier-3 composition — promoting it to a DS primitive would violate the 2+-context rule. Correct call.

---

## Settings type-list (8/10)

### WARNING
- `settings-typelist/spec.md:18-19` — **Fail-open loading/error = all toggles render ON.** If the mute-read fails, every type shows enabled. For a *mute* control this is the safe direction (you keep getting notified rather than silently losing alerts), and it matches today's behavior — defensible. But it means a transient read failure visually lies: a type the user muted shows as ON. Low-stakes (the write still reflects truth on next load) but flag for the builder to ensure the optimistic-flip path (`spec.md:23`) reverts correctly on write failure so the UI never persists a false ON.

### NIT
- The three rejected directions (urgency grouping, channel matrix, per-type urgency override, mute-all) are each rejected with a concept-grounded reason (premature chrome / advertises dormant channels / closed urgency / duplicates factory silence). Disciplined scoping; no creep. Good.
- Section intro copy (`approved.md:60`) is clear and teaches the model ("Each type below is a real notification source"). Good — this is the concept's "no invented buckets" made legible.

### What's Working Well
- **The registry IS the UI.** Adding a type in code auto-adds a Settings row; no hand-maintained toggle list to drift. This is the structurally-correct expression of the locked "code-defined registry" contract.
- Screenshot confirms exactly the locked model: 3 registry toggles, Cost shown muted (off), NO email-digests row. The supersession of the 3 AF15 toggles is visually proven, not just asserted.

---

## Cross-cutting

- **Tokens:** every value referenced (`--r-subtle`, `--shadow-elevated`, `--status-error`, `--border-strong`, `--accent-primary`, `--motion-fast`, `--tracking-caps-sm`) verified present in `tokens.css`. No hardcoded hex, no off-grid spacing in the specs.
- **States:** all four (default/loading/error/empty/populated) specified for the popover; settings handles loading/error via fail-open. Complete.
- **A11y:** `role="dialog"` `aria-modal="false"`, Escape closes, focus-moves-on-open, per-affordance `aria-label`s, urgency dot `aria-hidden`. Strong — the one gap is the nested-button risk (WARNING above).
- **Mobile:** bell+dot in mobile header → full-width bottom sheet; rows `min-h-[44px]` at mobile (AQ-015 touch target met). Addressed.
- **Halation:** uses `--surface-overlay`, not `#000`. AQ-009 clean.

**Both surfaces APPROVED. Builder must resolve the nested-button structure (popover WARNING #2) before/during implementation — it is the only finding that can ship as a real defect.**
