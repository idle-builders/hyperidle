# AM3 Session view — synthesis (content-rendering axis)

**No `approved.md` is written here.** This is a `novel` DESIGN-CLASS → the founder picks the winner in `/human-design-review` by annotating the rendered variants in the viewer. This synthesis is the designer's recommendation + the rejection list, not a lock.

**The axis is the rendering vocabulary of the session content — NOT placement.** Placement is settled (concept Phase 4: the session view IS a `ConversationSurface` reached via the `session` `OpenTarget`). The three variants are three rendering languages for displaying tool calls and the session's aspects.

## Strongest base: 1 · Calm Transcript
The calmest, most reference-faithful default — content first, activity a fold away, every calm-rendering principle at maximum. It is the safest default for the everyday session (long agent prose punctuated by tool runs). Best on hierarchy, spacing, anti-slop.

## What to pull in from siblings
- **From 2 (Glanceable):** the **inline I/O preview** is genuinely better *on the rows that carry decision-weight* — a failed command, an edit's intent, an MCP result. The synthesis the founder may want: **1's calm spine, with 2's inline preview shown only on failures + edits + MCP** (the rest stay bare). The shared `preview` field already supports this — it's a per-kind display choice, not a structural fork.
- **From 2:** the **destructive-rule failure treatment** reads better than 1's bare ✗-then-expand. Recommendation: adopt 2's inline-error-on-failure in the chosen default regardless of base — a failure should never need a click.
- **From 3 (Timeline):** the **side reveal panel** is the right answer *specifically for code-heavy sessions* — keeping a diff open beside the stream while edits land. Recommendation: 3's reveal is a **mode** the default can adopt ("open diff beside" toggles the panel) rather than a permanent two-pane, keeping the calm single column as the default and earning the panel on demand.

## The real decision for the founder (human review)
**How much each tool call reveals at rest, and how I/O & diffs surface** — a genuine taste/usage call:
1. **Disclosure at rest** — bare (1) vs inline-preview (2) vs node-on-a-rail (3). How much does the founder want to read without clicking?
2. **I/O & diff reveal** — fold-inline (1) vs always-inline (2) vs side-panel (3). Where does detail live?
3. **Aggregation** — hard fold (1) vs soft header-with-rows-visible (2) vs single node (3). How aggressively does a tool run collapse?

These compose — "1's calm spine + 2's failure/edit previews + 3's diff-beside mode" is a coherent founder synthesis to express by annotating in the viewer.

## Explicitly rejected (do not re-litigate)
1. **Placement as a design fork** — dead (founder, 2026-06-22). Entry/placement is settled; the axis is content rendering.
2. **Config band / activity-log framing** — dead (concept rejection 1). Controls are composer pills.
3. **Prose-only activity** — dead. Tool/reasoning are distinct render kinds (concept rejection 2; the new Part kinds).
4. **A new diff renderer** — dead. Every diff surface (chip / inline hunk / side panel) reuses `ReviewCodeDiff` (concept rejection 5).
5. **Stop-only running composer** — dead. Composer stays usable; Send queues (concept rejection 6).
6. **Interrupt-on-send** — dead. A queued message starts the *next* turn (concept rejection 8).
7. **Per-line avatars/labels** — dead. Bubble vs full-width carries authorship.
8. **Failure buried in collapsed output** — every variant surfaces a failure glanceably (✗ glyph + destructive tone; 2 & 3 show the error without a click).
