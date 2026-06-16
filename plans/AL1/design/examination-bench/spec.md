# Variant B — The Examination Bench

**User workpackage:** A power reviewer going *deep* across a multi-artifact Subject — pivoting between artifacts, anchoring comments to exact spots, tracking which artifacts they've cleared — with examine and converse both on screen, persistent.

**Constraint:** optimise the *slow read*; density and traceability win; this is a workbench, not a document. **Thesis:** **examine and converse, side by side, always.** Navigation across N artifacts preserves comment context; the gutter is where examine↔converse join (click a line → anchor a comment); per-artifact reviewed-state makes large Subjects tractable.

**Signature (the one tell):** the **anchored-comment gutter** on the examination surface — line numbers, hover a line → a `+` to comment, lines with comments carry a dot, the comment lives in the right rail pinned to that line — *plus* the left-nav per-artifact reviewed checkmarks ("per-file tracking is the killer feature" — Reviewable, made native). No HyperIdle surface has a comment gutter yet; this is the net-new interaction.

---

## Information hierarchy (three panes, full viewport, no max-width)

**Left rail (~240px, `--surface-container`):**
1. Orientation mini: work identity (`--text-base`/600, truncates), author **Atlas**→reviewer **Robin** overlapping avatars (`AvatarGroup`, agent-distinct), standing pill, `ArtifactCostChip` compact.
2. `Intent` mini-checklist: the 4 items, 3 `--status-success` checks + 1 `--status-error` ✗; clicking jumps the center to the serving artifact. `3/4 met`.
3. `Artifacts · 4` list — each a `Row`: `ArtifactKindBadge` + path (mono, truncates) + a trailing **reviewed `Checkbox`** + a `RowDot` when the artifact carries a needs-attention item (amber/red). Active artifact = `--surface-elevated` + `--shadow-subtle` (the AQ-014 active-item treatment). 
4. `Needs attention · 3` jump list (gap/risk/comment), each row jumps center+rail to the anchor.
5. `Progress`: `1 of 4 reviewed` bar, bottom-pinned.

**Center (flex-1, `--surface-page`):** the **Examination surface**.
- Header strip: active artifact path (mono) + `ArtifactKindBadge` + result summary (secondary) + prev/next chevrons + a `Mark reviewed` `Checkbox`.
- Body: the **real renderer** for the active artifact via `getRenderer`. For the code artifact, wrap `CodeRenderer`'s output in a **gutter**: a left column of line numbers; on row hover a `+` affordance appears; lines that have an anchored comment show an `--accent-primary` dot; the riskily-flagged line (`:54`, partial refunds) shows an amber dot. Clicking a `+`/dot selects that anchor → the right rail scrolls to / opens the comment for it. Data/text/action artifacts render their renderer (action = a card: summary + `Consequence` + `Undo`), gutter degrades to block-level anchor dots.

**Right rail (~320px, `--surface-container`):** converse + reason, for the active context.
- Top: **Verdict** block — standing line + the 5 verdict buttons (compact pills, kbd hints) + `Blocking · 3 unresolved`. Always visible (rail header, not scrolled).
- A 2-tab switch `Thread · Rationale`:
  - **Thread** (default): the one conversation, **anchored comments for the active artifact/line first** (each `CommentRow` with its `inlineAnchor` label + replies + resolve), general comments below a divider. `Composer` pinned at the rail bottom; when an anchor is selected the composer shows `Commenting on refund-webhook.ts:54`.
  - **Rationale**: the decisions that touch the active artifact, each a card (decision · `instead of` · confidence meter · serves-intent chip). So *why* and *where* align in one rail.

## States
- **Populated / awaiting (default)** — code artifact active, gutter visible, a comment open on `:54`, verdict in the rail.
- **Loading** — three skeleton panes (`SkeletonList` left, `Skeleton` block center, `SkeletonList` right).
- **Error** — `ErrorState` fills the center; rails keep orientation.
- **Resolved** — verdict block shows `Approved · Robin · 2:38 PM`; gutter read-only.
- **Single-artifact Subject** — left rail collapses to just orientation+intent; center+rail unchanged (graceful).

## Behavior / motion / keyboard
- Artifact switch: center content cross-fades (`opacity`, `--motion-default`); rail re-filters to the new anchor set.
- Gutter `+`/dot: a small pop (`transform: scale`, `--motion-fast`, expressive easing).
- Keyboard: `j/k` next/prev line in gutter, `c` comment on focused line, `[`/`]` prev/next artifact, `A/C/R/E/X` verdicts, `Tab` toggles Thread/Rationale.

## Mobile (three-tab layout)
The three panes ARE the three mobile tabs: `Subject` (left) · `Examine` (center) · `Discuss` (right). Verdict → bottom sheet. Gutter comment affordance becomes tap-line → sheet.

## Trade-offs (what this is bad at)
- The fast-read reviewer who just wants to approve must parse three panes — heavier than a brief.
- Highest build cost: the gutter + rail-filter + per-artifact state are net-new shapes.
- Three columns are tight below ~1100px; leans on the mobile collapse earlier than the others.
- The "lead" is the artifact content — risks re-centering the diff the research says to demote (mitigated by intent+needs-attention in the left rail, but they're chrome here, not the spine).

---

## Agent build contract
- Files: `packages/web/src/pages/review/ReviewBench.tsx` + `ReviewBench.stories.tsx` (default `{ title: "Page: Review/B — Examination Bench" }`; named exports `Populated`, `RationaleTab`, `Loading`).
- Import `./review-fixtures`. Render real renderers via `getRenderer`. Build the gutter as a story-local wrapper around `CodeRenderer` (you may re-map `REVIEW_FIXTURE.artifacts[0].code.hunks` to add line numbers + dots; keep `CodeRenderer` for the diff body, OR hand-render diff lines with the same `add/del/ctx` token classes — `bg-[color-mix(in_oklab,var(--status-success)_10%,transparent)]` etc. — if the gutter needs per-line control). Use `Avatar`/`AvatarGroup`, `StatusChip`, `Tag`, `ArtifactKindBadge`, `ArtifactCostChip`, `Row`, `RowDot`, `Checkbox`, `TabBar`, `CommentRow`, `Composer`, `Button`, `Progress`, `SkeletonList`, `ErrorState`.
- Self-contained presentational: `useState` for active artifact, selected anchor, Thread/Rationale tab. No router/context → no `MockProviders` needed; wrap in `<div style={{height:'100vh', display:'flex'}}>`. `Populated` must screenshot with the code gutter showing comment dots + an open comment on `:54` + the verdict rail, proving the signature.
- Hard rules: Hearth tokens only, 6px grid, closed scales, pill buttons, agent-avatar distinct, realistic content, no centered body. NO tests/check/lint/bless — story-render only.
