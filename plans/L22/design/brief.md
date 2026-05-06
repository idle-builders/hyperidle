# L22 Design Brief

DESIGN-CLASS: routine  ref=KnowledgeRow  pattern=KnowledgeRow.html

## User task

A founder scanning the Knowledge list decides which items to attend to. They need to see at a glance how fresh an item is, how popular it is, and whether citation data exists yet. They want to sort by different signals to surface what matters now.

## Current state

KnowledgeRow shows: title, layer tag, kind tag, status chip, timestamp, and an optional caption (currently used for the opaque `whyNow` reason string). The Triage tab sorts by the opaque `attentionScore` descending. No signal breakdown is visible. No sort controls exist.

## What L22 changes

1. **Signal values on each row.** Three signal indicators replace the opaque whyNow caption: recency (time since last activity), frequency (access count in 30d window), and impact/citation (staged as dash until citation ships). Absent signals render dash, never fake numbers.

2. **Sort controls on the Triage tab.** A small sort-selection control above the list lets the user sort by: relevance (composite, default), recency, or frequency. The active sort is reflected in URL search params so the state is shareable and survives navigation.

3. **relevanceScore replaces attentionScore** as the sort key for the Triage tab. The whyNow caption is removed (it was a template-based string from the opaque attention engine; the three signals now speak for themselves).

## Design constraints

- KnowledgeRow is a Tier 2 DS component. Extending its props is fine; changing its layout shape requires updating the HTML reference.
- The 19-component budget: no new custom component needed. Sort controls use DaisyUI `btn` primitives directly.
- Density tokens: signal values must use `--density-text` or the 12px caption size. Row height driven by `--density-pad-y`.
- Absent signals: dash character, never 0 or a fake number. Per L5 anti-pattern rule.
- URL state: sort param in search params (e.g., `?sort=recency`). Default is `relevance` (composite score).
- No customizable saved views (founder cut from scope rules).

## States

- **Populated (common):** Rows with mixed signal availability. Some rows have all signals, some have only recency, some have none yet.
- **All signals absent:** A brand-new item with no access log and no edits since import. All three signals show dash.
- **Loading:** SkeletonList (existing pattern).
- **Error:** ErrorState (existing pattern).
- **Empty:** EmptyState (existing pattern, already implemented).
