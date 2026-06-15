/**
 * AJ3 — design-review gate-decision helper.
 *
 * The pure stakes mapping a `/design` `DESIGN-CLASS` to the
 * `/human-design-review` action. This is the single importable, unit-tested
 * source of truth for the gate rule, so it cannot silently drift between the
 * pipeline doc and any future caller.
 *
 * `park` is NOT a return value here — it is the pipeline orchestrator's
 * mode-conditioned outcome of `run` in an autonomous / no-tool run. Folding
 * park into this pure function would lie about where the decision lives: park
 * is a property of (novel AND no founder/tool), not of the design class alone.
 * See plans/AJ3/architecture.md §5.5.
 */

/** The greppable classification `/design` emits on its `DESIGN-CLASS:` line. */
export type DesignClass = "novel" | "routine" | "routine-low-conf";

/** The stakes half of the human-design-review gate. */
export type DesignReviewDecision = "run" | "skip";

/**
 * Maps a `/design` `DESIGN-CLASS` to the human-design-review stakes action.
 *
 * - `run`  → novel design; human review/loop applies (the caller decides
 *   loop-vs-park by mode + tool presence).
 * - `skip` → routine or routine-low-conf; proceed straight to build.
 */
export function designReviewDecision(designClass: DesignClass): DesignReviewDecision {
	return designClass === "novel" ? "run" : "skip";
}
