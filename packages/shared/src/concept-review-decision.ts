/**
 * Concept-review gate-decision helper.
 *
 * The pure stakes mapping from a workpackage's two load-bearing pre-build
 * signals to the `/human-concept-review` action:
 *   - `DESIGN-CLASS` (from `/design`)  — is this a significant redesign?
 *   - `DOC-CLASS`    (from `/refine`)  — does this significantly rewrite the
 *                                        user/dev guides?
 * Human concept review fires when EITHER is high-stakes — a novel design OR a
 * significant guide rewrite. This is the single importable, unit-tested source
 * of truth for the gate rule, so it cannot silently drift between the pipeline
 * doc and any caller.
 *
 * `park` is NOT a return value here — it is the pipeline orchestrator's
 * mode-conditioned outcome of `run` in an autonomous / no-tool run. Folding
 * park into this pure function would lie about where the decision lives: park
 * is a property of (run AND no founder/tool), not of the input classes alone.
 */

/** The greppable classification `/design` emits on its `DESIGN-CLASS:` line. */
export type DesignClass = "novel" | "routine" | "routine-low-conf";

/** The greppable classification `/refine` emits on its `DOC-CLASS:` line. */
export type DocClass = "significant" | "minor" | "none";

/** The stakes half of the human-concept-review gate. */
export type ConceptReviewDecision = "run" | "skip";

/**
 * Maps a workpackage's design + doc impact to the human-concept-review action.
 *
 * - `run`  → novel design OR significant guide rewrite; human review/loop
 *   applies (the caller decides loop-vs-park by mode + tool presence).
 * - `skip` → neither rises to high stakes; proceed straight to build.
 */
export function conceptReviewDecision(
	designClass: DesignClass,
	docClass: DocClass,
): ConceptReviewDecision {
	return designClass === "novel" || docClass === "significant" ? "run" : "skip";
}
