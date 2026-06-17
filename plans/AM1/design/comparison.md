# AM1 Conversation Experience — Variant Comparison

Three variants render the SAME canonical fixture (brief §"Canonical fixture") so they compare on shape, not content. Screenshots (full-page, states stacked) read after the embodiment fixes:

- A — `plans/AM1/design/quiet-stream/screenshot.png`
- B — `plans/AM1/design/two-pane/screenshot.png`
- C — `plans/AM1/design/calm-document/screenshot.png`

The right-edge "Inspect" rail in each shot is the viewer's annotation tool, not part of the design.

| | A — "Quiet Stream" | B — "Two-Pane" | C — "Calm Document" |
|---|---|---|---|
| **Signature (one tell)** | One calm ~720px column where every reference is a small in-flow card; "today's product, calmer." | Terse scannable column + addressable tabbed contextual panel; chip→panel pulls substance to the side. | Generous ~760px reading document; embeds render full-bleed inline with their real kind-renderer; the "Worked for 1m 12s" Fold is first-class. |
| **Component count (new shapes)** | 2 small (`Fold`, `SessionReferenceEmbed`) + thin Part wrapper; diff reuses `ArtifactEmbed` compact. Lowest. | 3 small (`Fold`, `ReferenceChip`, `SessionReferenceEmbed`) + panel chrome (`TabBar` + `<aside>`). Medium + a second region. | 4 document-grade (`DiffEmbedPart`, `BlockEmbedPart`, standalone `Fold`, `SessionReferenceEmbed`) + Part wrapper. Highest. |
| **Density** | Medium — sender-grouped rows, compact embeds. | High — terse one-line Parts, maximum messages-per-screen. | Low / generous — document leading (15px/1.7), tall full-bleed embeds. |
| **Primary action surface** | The one elevated review/verdict card; embeds are open-elsewhere affordances. | The contextual panel (Diff/Plan/Session tabs) + verdict bar. | Inline embeds + the elevated review card with accent left-rule + verdict bar, all in-column. |
| **Embed-open strategy** | Compact inline → opening routes OFF-column (detail / item / AM3). | Compact chip → opens FULL preview in the right tabbed panel (side surface). | Full-bleed INLINE — the diff/block/session read in place; no click-away to judge. |
| **State strategy** | Empty / Loading / Error / Populated; Loading = 3 sender-grouped skeleton rows (fixed: was near-blank). | Best coverage: Empty / Loading / Error all panel-closed + Populated panel-open default + implied panel-closed. Loading reads as rows. | Empty / Loading / Error / Populated; Loading = 3 sender-turn skeletons (fixed: was faint circles). `order` now Populated-first (fixed). |
| **Motion budget** | `--motion-fast` color/transform only (hover border, fold chevron). Minimal. | `--motion-default` panel slide-in + `--motion-fast` hover/fold; tabs swap instant. Largest. | `--motion-default` fold expand + `--motion-fast` hover; transform/opacity only. Medium. |
| **Best at** | Reuse + lowest risk; the calmest, cleanest reuse story; proves the style ships at near-zero new shapes. | Interaction design + state coverage + the most rigorous a11y/focus contract; power-density scanning. | Embedding richness + typography + Part-model factoring + the strongest Fold; delivers the founder's literal "embed beautifully" ask. |
| **Worst at** | Distinctiveness + embed richness — chips you must click away to read under-deliver "embed beautifully." | Calm — column is a terse index, not a calm reading column; panel is conversation-specific (not AM3-reusable); most state to keep in sync; weakest mobile story. | Tall column (discipline-dependent calm); most new rendering code; (was: mid-thread composer + faint skeleton — both now fixed). |
| **Phase-2 critique score** | **7.7 / 10** | **7.8 / 10** | **7.4 / 10** (the coherence-5 drag was the now-fixed mid-thread composer; structurally the strongest base) |

**Read of the scores:** B's 7.8 and A's 7.7 lead C's 7.4 on raw mean, but C's gap is almost entirely the composer embodiment bug (coherence 5) — a fixable rendering defect, not a design-model flaw. On the two dimensions AM1 exists to win — embedding richness (C > B > A) and Part-model reuse factoring (C ≈ A > B) — C leads. The synthesis bases on C and grafts B's interaction rigor + A's reuse discipline.
