# AM3 dial-in — variant comparison

Screenshots: `a-side-panel/screenshot.png`, `b-inspector-route/screenshot.png`, `c-overlay-sheet/screenshot.png`. All three reuse `PartList` for activity and render controls declaratively from `FIXTURE_DESCRIPTOR` (AM2 shape) — the placement axis is what differs.

| Dimension | A — Side panel | B — Inspector route | C — Overlay sheet |
|---|---|---|---|
| Signature (one tell) | conversation never lost; docked companion | a session is a deep-linkable place | momentary; transient over a scrim |
| Component count | aside + header + Fold + controls + PartList | breadcrumb + header + rail + PartList | Dialog + header + Fold + controls + PartList |
| Density | conv+panel split halves activity width | both config & activity get a full column | compact sheet; inline config band |
| Primary action surface | config band atop the panel | persistent left rail | foldable header band |
| State strategy | one layout; Fold collapses config | one layout; rail persistent | one layout; Dialog owns container states |
| Motion budget | slide-in (translateX) | route cross-fade | Dialog scale+opacity |
| "Lower-level, not promoted" fit | strong — docked, dismissible, never inlined | medium — it's a *place* (risks feeling first-class) | strongest — transient overlay, resists lingering |
| Reuse cost | low — composition over DS + PartList | high — new route + param resolution + layout | low — DS `Dialog` shell + composition |
| Best at | steer while keeping conversation context | deep auditing of long sessions; deep-link | quick glance/steer then dismiss |
| Worst at | deep auditing (narrow); width contention | context-switch away from conversation; rail crowds pills | sustained reading; no deep-link; blocks conversation |

## In-session critique (9 dimensions, 0–10)

### A — Side panel
- Hierarchy 8 · Spacing 8 · Typography 8 · Color 8 (active pills accent, status chip) · Coherence 9 (mirrors ConversationHeader, reuses PartList) · States 7 (collapse handled; rest deferred) · A11y 7 (focus move on open/close needs build) · Anti-slop 9 · Polish 8. **Avg ≈ 8.0**
- Note: best "lower-level companion" story; width is the cost.

### B — Inspector route
- Hierarchy 8 · Spacing 7 (rail pills wrap, cramped) · Typography 8 · Color 8 · Coherence 8 (PartList reuse; breadcrumb orients) · States 6 (route 404 fallback needed) · A11y 8 (two clean tab groups) · Anti-slop 8 · Polish 7. **Avg ≈ 7.5**
- Note: best for auditing, but a route risks reading as "first-class session view", brushing the spec's lower-level constraint; heaviest reuse cost.

### C — Overlay sheet
- Hierarchy 8 · Spacing 8 (inline config reads cleanly) · Typography 8 · Color 8 · Coherence 9 (PartList reuse + DS Dialog) · States 8 (Dialog owns container states + mobile sheet free) · A11y 9 (Dialog focus-trap, scrim, Escape — all from DS) · Anti-slop 9 · Polish 8. **Avg ≈ 8.3**
- Note: strongest "momentary / not-promoted" fit + most free behavior from DS Dialog; weakest for sustained auditing.
