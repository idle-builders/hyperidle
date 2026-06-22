# AM3 Session view — synthesis

**No `approved.md` is written here.** This is a `novel` DESIGN-CLASS → the founder picks the winner in `/human-design-review` by annotating the rendered variants in the viewer. This synthesis is the designer's recommendation + the rejection list, not a lock.

## Strongest base: A · Focused Route (8.4)
A is the calmest and most reference-faithful — one centered column with the whole screen around it, exactly the t3code/Claude-desktop "studio" feel the founder pointed at. It scores highest on hierarchy, spacing, and anti-slop, and it resolves every open question cleanly.

## What to pull in from siblings
- **From B:** the **inline diff chip on edit rows** (B's Q5 fork) is genuinely better than A's separate panel for *single* edits — a load-bearing edit deserves an in-line `+9/−2` chip, not a click. The shared stream already renders this (a diff-bearing tool never folds into the aggregate). Recommendation: A keeps the per-turn CHANGED FILES panel *and* shows inline chips on standalone edits — both, as rendered.
- **From B:** the **kept entry mechanism** (open over a still-mounted conversation, Escape-close) is the founder's locked entry contract. If the founder prefers A's full-page calm but wants to not-leave, the synthesis is "A's column inside B's dock at the widest the layout allows" — a fork the founder can call in human review.
- **From C:** the **persistent diff rail** is the right answer *specifically for code-heavy sessions*. Recommendation: C's rail is a **mode** A can adopt ("Changes" toggles a rail open) rather than a separate variant — keeps A's calm default, earns C's power on demand.

## The real decision for the founder (human review)
The fork is **placement + diff affordance**, and it's genuinely a taste/usage call:
1. **Route vs dock** — does dialing into a session take over the screen (A/C) or sit beside the conversation (B)? MEMORY (`project_am1_conversation_full_surface`) says a session is a full chat surface; all three honor that. The entry contract (concept §Entry/exit) kept the slide-over mechanism — B is the most literal continuation of it; A/C are the "it needs more room" answer.
2. **Diff: panel vs inline chip vs persistent rail** — A=panel, B=inline, C=rail. Build will reuse `ReviewCodeDiff` for all three; the affordance is the choice.

## Explicitly rejected (do not re-litigate)
1. **Config band / activity-log framing** — dead (concept rejection 1). Controls are composer pills.
2. **Prose-only activity** — dead. Tool/reasoning are distinct render kinds (concept rejection 2; the new Part kinds).
3. **A new diff renderer** — dead. All diff surfaces reuse `ReviewCodeDiff` (concept rejection 5).
4. **460px slide-over** — too narrow; every variant is ≥620px reading width.
5. **Stop-only running composer** — dead. Composer stays usable; Send queues (concept rejection 6).
6. **Interrupt-on-send** — dead. A queued message starts the *next* turn (concept rejection 8).
7. **Per-line avatars/labels** — dead. Bubble vs full-width carries authorship.
8. **Aggregation as a Part kind** — dead. It's a renderer grouping beside `groupParts`.

## Autonomous-mode note
A novel design in an autonomous run **parks** for the founder rather than auto-shipping. The three stories are rendered and screenshotted; the orchestrator surfaces the three viewer links for `/human-design-review`.
