# U8 Architecture Critique: Tier 2 Composites Restyle

**Reviewer:** Phase 2 critique
**Artifact reviewed:** `plans/U8/architecture.md`
**Classification:** Routine restyle (bar >= 7)
**Date:** 2026-05-31

---

## Rubric Scores

### 1. Scope Fidelity — 9/10

The plan covers every component listed in the AC: BetCard, ThreadRow, TaskCard, KnowledgeRow, CommentRow, Composer, RichMessageCard, NotificationRow, ThreadHostBanner, ThreadShell, Block and all payloads, all eight Artifact family components, plus body editor components and BlockActionsPopover. PitchCard deletion is included. HTML reference files, stories, and tests are all scoped. The plan does not add scope beyond the AC (no behavioral changes, no prop changes, no new components). One observation: the AC lists "Artifact family" generically but the plan correctly enumerates all eight sub-components. The body editor (floating-toolbar, slash-menu) and BlockActionsPopover are not explicitly named in the AC but are part of the Block/Tier 2 composite surface and correctly included.

### 2. Completeness — 8/10

Every token replacement is specified per-file with old-value -> new-value pairs. Structural additions (shadows, borders, hover lifts, unread dots, severity borders, icon circles) are documented. The verification checklist is thorough including a grep pattern for old token detection.

Gaps:
- The `DividerPayload.tsx` is not listed in Group 5 payloads. The design variant mentions "Divider" in the "Other payloads" catch-all but the architecture plan does not enumerate its token replacements. If DividerPayload uses any Lucid tokens, it will be missed.
- The `inline.tsx` file is listed in the architecture plan but the design variant does not mention it. The architecture plan adds it correctly (strong text, inline code, links). This is a completeness win for the plan over the design.

### 3. Task Ordering — 9/10

The 16-task ordering is well-reasoned. Leaf components first (payloads, artifact sub-primitives), then composites, then the largest component (RichMessageCard), then the composed shell (ThreadShell). HTML after TSX. Stories after components. Tests last. This maintains a compilable state throughout since no task depends on a later task's output.

One minor concern: Task 1 deletes PitchCard and updates `index.ts`. If any other file in the codebase imports PitchCard, deletion will break compilation until those imports are removed. The plan says "Verify no remaining imports across the codebase" in the design variant but the architecture plan's Group 9 only mentions updating `index.ts` exports. The builder should grep for PitchCard imports across all packages before deleting.

### 4. Risk Identification — 9/10

Five risks are identified with mitigations: `--surface-ghost` replacement, `--warn` token, `font-heading` removal, `--float` shadow, unqualified `--text` token, and border width (`border-l-2` vs `--bw-strong`). All mitigations are concrete and verifiable.

Missing risk: the visual-parity rule in `.claude/rules/visual-parity.md` says "NEVER change the styling of HTML files." The architecture plan (Group 10) says "The HTML files are the design reference (per .claude/rules/visual-parity.md), so the TSX must match the HTML pixel-for-pixel" and then proceeds to update the HTML files. This is a rule tension: the plan cites the visual-parity rule as justification but then contradicts it. The AC explicitly requires "HTML reference files updated for all Tier 2 components" and U7's precedent established "HTML reference files are updated IN THIS WORKPACKAGE." The AC overrides the rule, but the plan should acknowledge this tension rather than misquoting the rule. The builder will encounter this rule and may hesitate. **Advisory: add a note that the visual-parity rule is overridden by the AC for Hearth restyle workpackages (U7, U8).**

### 5. File Coverage — 8/10

All TSX source files are enumerated. HTML files are listed as a batch in Group 10. Story files are listed as a batch in Group 11. Test files are enumerated in Group 12 with specific assertions that may need updating.

Gaps:
- `BlockHandle.tsx` is mentioned in Group 10 ("if it has old tokens") and Group 11 (stories) and Group 12 (tests) but not in any source group for TSX token replacements. If BlockHandle uses Lucid tokens, its TSX changes are unplanned.
- `html/BlockHandle.html` is listed with a conditional ("if it has old tokens") which is vague. The builder should check definitively.

### 6. Token Accuracy — 10/10

Every token replacement was verified against `packages/design-system/src/tokens.css`. All target tokens exist: `--surface-page`, `--surface-container`, `--surface-elevated`, `--text-primary`, `--text-secondary`, `--text-tertiary`, `--text-placeholder`, `--text-on-accent`, `--accent-primary`, `--accent-primary-dim`, `--accent-primary-hover`, `--status-success`, `--status-warning`, `--status-error`, `--status-info`, `--r-none`, `--r-subtle`, `--r-default`, `--r-pill`, `--motion-fast`, `--motion-default`, `--motion-slow`, `--motion-ease`, `--shadow-subtle`, `--shadow-default`, `--shadow-elevated`, `--border-subtle`, `--border-default`, `--border-strong`, `--bw-thin`, `--bw-default`, `--bw-strong`. The plan's RichMessageCard section replaces `text-[var(--surface-0)]` (primary button text) with `text-[var(--text-on-accent)]` which is the correct semantic token.

### 7. Test Strategy — 8/10

The plan identifies specific test files that may break and gives the correct strategy: "Fix failures caused by old token references in assertions. Do NOT change test behavioral assertions -- only token/class references." Visual regression baselines need re-capture. The `html-components.test.ts` check is noted.

Gap: the plan does not specify whether new tests should be added for the structural additions (ThreadRow unread dot, NotificationRow colored border, NotificationRow icon circle, RichMessageCard action toolbar tint). These are new DOM elements that should have test coverage. The AC says "Component unit tests updated" which could mean "update existing" or "add new where structural changes occur." The builder should add tests for new DOM elements.

### 8. Consistency with Design — 9/10

The architecture plan faithfully translates the design variant's token migration map into per-file replacement lists. Cross-cutting patterns (card lift, row tint, ghost replacement, focus ring) from the design are applied consistently across all relevant files. The plan does not deviate from or reinterpret the design.

One discrepancy: the design variant specifies ThreadRow selected state as `bg-[var(--surface-elevated)]` with `shadow-[var(--shadow-subtle)]`, but the architecture plan for ThreadRow only mentions `bg-[var(--surface-elevated)]` for selected state and `shadow-[var(--shadow-subtle)]` is not listed. The builder should check whether the selected state shadow is in the plan's token replacement list.

### 9. Verification Rigor — 9/10

The verification checklist includes type checking, linting, unit tests, full test suite, a comprehensive grep pattern for old tokens, PitchCard deletion verification, HTML updates, story rendering, both theme modes, and the full verify pipeline. The grep pattern covers the major Lucid tokens. One observation: the grep pattern includes `--accent\b[^-]` to catch bare `--accent` but not `--accent-on`. Wait -- it does include `--accent-on`. Good. The pattern also includes `--primary-dim` which is the Lucid alias for the accent dim color.

---

## Aggregate Score: 8.8 / 10

**Verdict: APPROVED.** The architecture plan exceeds the 7.0 bar.

## Findings for the Builder

### Must-address (blocking advancement to Phase 3)

None. The plan is sufficient for implementation.

### Should-address (advisory, apply during build)

1. **Visual-parity rule tension.** The `.claude/rules/visual-parity.md` says "NEVER change the styling of HTML files." The AC explicitly overrides this for U8. When updating HTML files (Group 10), the builder is acting under AC authority, not violating the rule. Add a `@lore` comment in a relevant file documenting that Hearth restyle workpackages (U7, U8) are authorized to update HTML reference files, overriding the visual-parity rule's normal prohibition.

2. **DividerPayload.** Not enumerated in the architecture plan's file list. Check if `packages/design-system/src/block/DividerPayload.tsx` exists and uses Lucid tokens. If so, apply the standard token migration.

3. **BlockHandle.tsx.** Listed conditionally in Group 10 but absent from source TSX groups. Definitively check for Lucid tokens and include or exclude.

4. **ThreadRow selected state shadow.** The design specifies `shadow-[var(--shadow-subtle)]` for the selected state. Verify this is included in the ThreadRow implementation.

5. **New structural elements need tests.** The ThreadRow unread dot, NotificationRow colored left border, NotificationRow icon circle, and RichMessageCard action toolbar tint are new DOM elements. Add test assertions for their presence and correct styling.

6. **PitchCard import check.** Before deleting PitchCard files, grep across all packages for imports. The `index.ts` export removal is planned, but consumer files (e.g., in `packages/web`) may also import PitchCard and need cleanup.
