# Architecture Critique: AJ7

ARCHITECTURE-SCORE: 8/10  rounds=1  score-line: SA:8 LI:9 AC:8 DM:9 N:9 MD:8 FMC:7 S:8 V:7

**Verdict:** Buildable as-is. The plan correctly identifies and kills the founder-rejected frozen-box drift
(engine stores `HTMLElement` refs, never `Rect`; `useElementRect` live-tracks via scroll-capture + resize +
rAF), resolves every prior design-critique CRITICAL and WARNING, and keeps the persisted contract additive.
The gaps are at the edges: a few failure-modes the live-track introduces are unspecified, the snapshot-net
task targets the wrong axis, and one AJ5 limitation (`activeVariant` = `variants[0]`) is silently inherited.
None block the build; all are cheap to close in the plan.

---

### CRITICAL

(none)

---

### WARNING

- **[§5 + §8 task 1, AC1] `activeVariant` is hardcoded to `variants[0]` and the plan never touches it.**
  `main.tsx:454` derives `activeVariant = activeModule?.variants[0]?.name`. The POST payload's `variant`
  field (AJ5 `handleSave`, `annotation-overlay.tsx:244`) is therefore decoupled from whatever variant the
  founder actually inspected — every note is recorded against the *first* variant regardless of which
  section's element was clicked. AJ7's whole point is per-element devtools picking; recording the wrong
  variant on save is a real data-correctness bug in the new loop, not cosmetic. The plan's wiring fix (§5)
  addresses only `storyRoot`. → **Fix:** either (a) add a task to derive the variant from the clicked
  element's enclosing `.demo-section` (the selected `el` already walks to `storyRoot`; the section title is
  on the path), or (b) explicitly scope it OUT in §12 with a one-line rationale (e.g. "AJ7 collapses to one
  lead variant, so `variants[0]` is correct for the inspected story"). Right now it is neither fixed nor
  acknowledged — a silent inheritance of an AJ5 limitation that the new feature makes load-bearing.

- **[§8 task 10 + §11] Snapshot-net task targets variant count; the guards count modules.** Task 10 and the
  risk note worry that "collapsing three prototype variants to one … changes the enumerated count" and may
  trip the `≥58`/`≥59` guards. But `discoverStories` enumerates **modules** (story files), not variants —
  confirmed against `catalog-snapshot.test.tsx:73` (`≥59`) and `:223` (`≥58`), both asserting
  `modules.length`. Collapsing 3 variants inside one `AnnotatorV2.stories.tsx` file leaves the module count
  unchanged, so the guards will NOT trip from that. The guards trip only if a story *file* is added/removed.
  The real snapshot churn is the per-variant `.snap` entries for `AnnotatorV2` (the net snapshots every
  variant). → **Fix:** correct task 10 to say "the `.snap` entries for the changed `AnnotatorV2` variants
  churn; re-bless after reading the diff. Touch the `≥58`/`≥59` module guards ONLY if a story *file* is
  added or removed — collapsing variants within one file does not change module count." As written, the
  builder may waste effort adjusting a guard that should not move, or mis-attribute a real module-count
  regression to the intended variant collapse.

- **[§2.2 + §3 + §10 + AC2/AC7] Live-track failure modes are under-enumerated.** The plan nails the two the
  critique named (scroll, resize), but the founder's "never lies" bar implies several more that the plan does
  not specify a behavior for:
  1. **Element unmounts while held.** `useElementRect` holds an `HTMLElement` that React detaches when the
     story re-renders (or the founder navigates variant). `getBoundingClientRect()` on a detached node returns
     all-zeros — the box collapses to a 0×0 dot at the origin rather than disappearing. The plan says the
     engine "holds element refs," but never says *when the held ref is invalidated*. → **Fix:** specify that
     `useElementRect` (or the overlay) treats a detached element (`!el.isConnected`) as null → renders nothing,
     and the picker clears `selected`/`reHighlightEl` when its held element is no longer `isConnected`. Add an
     AC: "a held selection whose element unmounts clears the box (no 0×0 ghost)."
  2. **Layout shift from the rail itself.** Collapsing/expanding the rail (decision 1, AC12) reflows the
     canvas and moves every inspected element — but a CSS-driven width change does not fire a window `scroll`
     or `resize` event, so `useElementRect` will NOT re-measure and the held/hover box will drift until the
     next scroll. This is the *exact* drift class the founder rejected, re-introduced by the plan's own new
     collapsible-rail feature. → **Fix:** specify that toggling `collapsed` triggers a re-measure (e.g. the
     overlay re-measures on the same state change, or the rail width transition's `transitionend` dispatches
     a synthetic resize, or `useElementRect` also observes via `ResizeObserver` on `document.body`). Name the
     mechanism; do not leave it to the builder to discover live.
  3. **Nested scroll containers + transform/zoom.** §11 claims capture-phase `scroll` "fires for scroll
     inside any nested scroll container" — correct. But `getBoundingClientRect()` is already viewport-relative,
     so nested scroll is fine. The unhandled case is a CSS `transform`/`zoom` on an ancestor: `gBCR` accounts
     for transforms, so the box stays correct, but `position:fixed` boxes do NOT inherit the transform — so a
     transformed ancestor (rare in stories but possible) makes the fixed overlay and the element disagree.
     Low frequency for a dev tool; → **Fix:** one risk-note line in §11 ("transformed-ancestor stories are an
     accepted blind spot") rather than code. Acknowledge it so it is a decision, not an omission.

- **[§9 AC4] AC4's static verification is described as "lint/grep" but the project rules forbid grep-as-test.**
  AC4 ("inspector NEVER adds/removes a class on the inspected element") proposes "Static lint/grep over
  `annotations/*.tsx` for `classList` mutation." CLAUDE.md is explicit: "Reading source files with
  `readFileSync` or grepping the filesystem is not a test — it's a lint rule or build script." A grep in a
  `*.test.ts` would be rejected at review. The *runtime* half of AC4 ("inspected element's `className`
  unchanged after hover+select+save") is the correct, jsdom-testable assertion and fully covers the hard rule
  behaviorally. → **Fix:** drop the grep half; make AC4 purely the runtime assertion (mount overlay, simulate
  hover→select→save against a story element, assert its `className` is byte-identical before/after). If a
  static guard is still wanted, phrase it as an ESLint rule, not a "lint/grep" test.

---

### SUGGESTION

- **[§2.4 + §6 + AC9] `Picker` owns `disarm()` but `AnnotationOverlay` owns the fetch/save/error state — the
  listener-cleanup contract across the two is unstated.** AJ5's overlay centralizes listener cleanup in one
  `listenerCleanupRef` + an unmount effect (`annotation-overlay.tsx:125,190`). The plan splits the engine
  (`use-picker`) from the chrome (`annotation-overlay`), which is the right module split, but does not state
  *which* of the two owns the unmount cleanup of the picker's one-shot click + the `useElementRect` listeners.
  The critique's whole concern in CC-class findings is leaked cleanup. → **Fix:** one line in §2.4: "`usePicker`
  owns all listener lifecycle (attach on `arm`, detach on select/disarm/unmount via its own effect); the
  overlay never touches story-root listeners." This is implied but should be explicit so the builder doesn't
  duplicate or orphan cleanup.

- **[§5 + AC1] StrictMode double-invoke of the callback ref is unaddressed.** The fix swaps `useRef` for a
  callback-ref→`setState`. Under React 19 StrictMode (dev), refs are attached, detached, and re-attached —
  the callback fires `setStoryRoot(node)`, then `setStoryRoot(null)`, then `setStoryRoot(node)` again. The
  overlay will mount, unmount, remount. With `usePicker` holding listeners this is the exact place a
  double-attach or orphaned listener hides. → **Fix:** confirm the viewer runs StrictMode (check
  `main.tsx` mount), and if so add a one-line note that `usePicker`'s cleanup effect must be idempotent
  across the StrictMode detach/reattach cycle, with AC2's "removes listeners on unmount" assertion covering it.

- **[§4 / AC8] Breadcrumb dedupe rule has an unspecified collapse-vs-relabel branch.** §4 says a duplicate
  component crumb is *either* relabeled to its element descriptor *OR* "collapse[d] out entirely … when even
  the descriptor is uninformative." "Uninformative" is undefined — the builder needs a rule. → **Fix:** make
  it deterministic: "relabel to element descriptor; only collapse when the descriptor is byte-identical to the
  previous kept crumb's descriptor." Otherwise AC8 ("no two consecutive crumbs render the identical label")
  is testable but the implementation has a judgment call the test can't pin.

- **[Spec Alignment] AJ7 is not registered in `pipeline-manifest.yaml` or `TRACK-AJ.md`.** `grep AJ7`
  returns nothing in `.pipeline/work-packages/`. The plan's 15 ACs are self-authored against the concept +
  approved design rather than traced to an upstream workpackage spec. This is acceptable for a designer-driven
  dev-tool follow-up, but it means there is no external AC source for the critique to reconcile against (CC-007
  cannot run). → **Fix (process, not plan):** register AJ7 in the manifest so downstream `/review` and `/retro`
  can find it; or note in §12 that AJ7's spec IS the concept+approved-design pair by design.

---

### What's Working Well

- **The structural kill of the drift bug is exactly right.** Storing `HTMLElement` in the engine and computing
  rects only in `useElementRect` (§2.4 note "there is no rect in the engine to go stale") is the correct
  architecture — it makes the founder-rejected frozen-box *unrepresentable*, not merely avoided. That is a
  genuine "make the bad state impossible" design, and the **SUPERSEDES PROTOTYPE** annotations make the
  intent auditable against the prototype's `{ target, rect }`.
- **Reuse is correctly scoped and verified.** `validateBody` (`request-handler.ts:35`) extends additively;
  `appendAnnotation` spreads `input.target` (`annotation-store.ts:84`) so the optional `anchor` persists with
  zero store change; `AnnotationInput` carries it transitively. The "AJ5 annotations without anchor → not
  visible, never error" back-compat (hard-rule #5) is honored end-to-end. No breaking change to AJ5 persisted
  data or tests — confirmed against the actual AJ5 source.
- **The off-screen vs not-in-DOM split is well-defined (§3).** `resolveAnchor → null` = not-in-DOM = "not
  visible"; `resolved + isRectOffscreen → scrollIntoView({block:"center", behavior:"auto"})` then draw. The
  `behavior:"auto"` choice (§11) correctly avoids the smooth-scroll measure race. This resolves design-critique
  CRITICAL #2 cleanly.
- **Live-proof DoD (§10/AC15) is honest about jsdom's blind spot.** It names exactly what jsdom cannot prove
  (layout, `getBoundingClientRect`=0, `scrollIntoView` no-op) and routes those to the `:8098` run, while
  AC1–AC14 gate the logic. This is the correct division and matches the project's visual-regression rules.

---

## Prior design-critique resolution — explicit yes/no

- design-critique **CRITICAL #1** (held box freezes / drift on scroll-resize): **YES.** §2.4 engine holds
  refs not rects; `useElementRect` scroll-capture + resize + rAF (§2.2, AC2/AC3). *Caveat:* the rail-collapse
  reflow case is a new gap (WARNING above) — the resolution is correct for scroll/resize but incomplete for
  the plan's own new collapsible-rail layout shift.
- design-critique **CRITICAL #2** (off-screen vs not-in-DOM under-specified): **YES.** §3 + AC7 split is clean.
- design-critique **WARNING** (a11y, mouse-only): **YES.** Note rows are focusable `<button>`s, re-highlight
  on focus AND hover, Esc→focus-return-to-arm (§2.5 `armButtonRef`, AC10) — matches AJ5's real Esc handler
  (`annotation-overlay.tsx:269-289`).
- design-critique **WARNING** (no save/error state): **YES.** §6 + AC9 restore `Saving…`/`.anno-error`, verbatim
  AJ5 parity — confirmed the AJ5 source already has both.
- design-critique **WARNING** (rail eats 320px on wide stories): **YES.** Collapsible rail, decision 1, AC12.
- design-critique **WARNING** (duplicate-crumb fiber issue): **YES** (with the collapse-rule SUGGESTION above
  to make it fully deterministic). §4 + AC8.
- design-critique **NICE-TO-HAVE** (label collision / clamp, 20-note overflow): **YES.** §7 viewport clamp;
  §6 + AC11 `max-height`+scroll.

All prior CRITICAL and WARNING items are resolved in the plan.
