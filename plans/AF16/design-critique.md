# Design Critique: AF16 — Display correctness & artifact rendering

DESIGN-CRITIQUE: variant=honest-zero+registry-dispatch  score=8/10  rounds=1  axes: H:8 S:8 T:9 C:9 Co:8 St:7 A:7 AS:9 PP:8

DESIGN-CLASS confirmed: routine. Two corrections inside existing components, Hearth tokens only, no new design-system shape. No mockup.html (corrections, not new surfaces) — scored against the spec.md treatments + the actual rendered code paths they replace. Every defect claim spot-checked against source: **all confirmed exactly as described.**

## Claim verification (load-bearing — all confirmed)

- **Treatment A defect** — `WorkBet.tsx:1222-1234`: guard is `bet.progress ? \`${Math.round((done/total)*100)}%\` : "0%"` and the bar renders `width: \`${...}%\`` inside `{bet.progress && (...)}`. With `total===0`, `0/0=NaN` → literal `"NaN%"` + `width:"NaN%"` (invalid CSS dropped → inner accent div at default block width → full green bar). The design's diagnosis is exact, including the misleading-bar mechanism (Z8-021).
- **Treatment B defect** — `ArtifactPreviewSurface.tsx`: `renderBody` calls `getKindDefinition(kind).summarize(preview)` for **every** kind (the AE6 `@lore` even documents replacing the switch with a single summarize lookup). An `image` artifact → its `summarize()` text ("400×300") for both sizes. `PlaceholderText` literally returns `"PREVIEW NOT YET RENDERED"` (full) / `"PREVIEW PENDING"` (gallery). Both confirmed (Z8-026/027/028).
- **Registry reuse** — `getRenderer(kind)` exists at `packages/web/src/kinds/renderer-registry.ts:45` with the full per-kind renderer set (`image/code/data/html/url/text/fallback`). The "single dispatch path" recommendation is sound.
- **Upward-dependency constraint** — `packages/design-system/package.json` has no `@hyperidle/web` dependency. The open question (registry must move, or be injected) is real, correctly raised, and correctly deferred to `/architecture`.

## Scoring rationale

- **Hierarchy (8)** — Treatment A keeps the three-up stat row aligned (Progress/Budget/Team), value 24px/600 tabular-nums over a 12px uppercase label — correct weight ladder. Empty-state value drops to 13px secondary, which reads as subordinate to the populated number; intentional and defensible.
- **Spacing (8)** — Reuses existing card padding (`p-[18px]`, `gap-[6px]`, `mt-[9px]`). The empty-state line uses `mt-[3px]` vs the populated bar's `mt-[9px]`; minor inconsistency but inside an either/or branch so never seen side-by-side.
- **Typography (9)** — On-scale (24/13/12px), weights 600/400, tabular-nums preserved on the numeric path. Artifact placeholder stays mono 11px uppercase. Clean.
- **Color (9)** — Tokens only (`--accent-primary`, `--surface-container`, `--text-secondary/tertiary`). No new color. Empty-state carries a non-color text signal ("No tasks yet"), so meaning is not color-borne.
- **Component coherence (9)** — Treatment B collapses two render paths into one (`getRenderer`), removing the second lying path — a structural coherence win, not just a patch. Treatment A reuses card chrome.
- **States (7)** — Treatment A enumerates four states (done>0, measured-zero `done=0/total=5`, zero-tasks, `progress` undefined). The `done=0,total=5` → "0% + empty track" distinction (legitimate measured zero keeps the bar; unscoped bet omits it) is exactly the right line and is the dimension's strongest call. **Gap:** neither treatment addresses the **loading** state of the bet stat card or the artifact surface, and the artifact surface has no **error** state for a renderer that throws (see WARNING).
- **Accessibility (7)** — Treatment B's image path must carry `alt` text; the design says "`<img>`" but does not specify `alt` (the dimension caption is not alt text). Flagged WARNING — the renderer dispatch inherits `ImageRenderer`'s a11y, which `/architecture` should confirm carries `alt`. Task 6 (a11y sweep) exists but is not tied to the image-render path.
- **Anti-slop (9)** — No AI tells. "No tasks yet" / "No preview available" is terse Hearth register. The rejected-directions list (no `0%` lie, no `—`, no card-hiding) shows real design judgment, not safe-default.
- **Premium polish (8)** — tabular-nums preserved; tokens correct. Mobile section correctly reasons that both treatments reflow inside existing responsive surfaces (AQ-005 N/A — no inputs added).

## CRITICAL
- None.

## WARNING
- [approved.md Treatment B / states] **No error/loading state for the artifact surface.** Dispatch to `getRenderer(kind)` can throw (malformed preview) or a renderer can fail to paint. The "No preview available" fallback is spec'd only for `preview == null`, not for a renderer that errors with a non-null preview. Add: a registered visual kind whose renderer cannot display the given preview also falls back to "No preview available" (the design text in §3 hints this — "**or** when a registered visual kind has a preview that the renderer itself can't display" — but the States table and Task 10/11 do not encode the error branch). `/architecture` Task 11 should make the fallback trigger include renderer failure, not only null preview.
- [approved.md Treatment B] **Image `alt` not specified.** The image render path must carry meaningful `alt` (e.g. the artifact title/kind), not rely on the dimension caption. Confirm `ImageRenderer` already sets `alt`; if not, this is an a11y regression introduced by routing the permalink through it. Pin in the Task 10 verification.

## SUGGESTION
- [approved.md Treatment A] The empty-state line uses `mt-[3px]` while the populated number path has no top margin and the bar uses `mt-[9px]`. Use the same vertical rhythm token the populated path uses so the card's baseline doesn't shift between states. Minor.
- [approved.md Treatment A states] Spell out the `progress` object present but `total>0, done>total` (over-100) guard — the `Math.min(100, ...)` clamp covers it, but list it as a state so the test asserts the clamp (a bet with corrected scope-down could momentarily report done>total).

## What's Working Well
- The measured-zero vs unscoped-zero distinction (`done=0/total=5` keeps the empty track; `total=0` omits the bar entirely) is the correct, honest line — it is the single best judgment in this design and directly satisfies the AC's "real value or clean empty-state, not a placeholder."
- Treatment B chooses to **delete the second render path** rather than patch the image case, which is the durable fix — the next visual kind won't re-break. The rejected-directions list names this exact failure mode ("leaves two render paths that drift").

**Verdict: APPROVED (8/10).** No CRITICAL, two WARNINGs that are encodable as additional verification assertions in `/architecture` (error-state fallback, image alt) rather than design rework. Score ≥7, no unresolved CRITICAL.
