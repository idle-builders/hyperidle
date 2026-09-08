class VersionConflictError extends Error {
	readonly currentVersion: number;

	constructor(itemId: string, currentVersion: number) {
		super(`Version conflict for knowledge item ${itemId}: current version is ${currentVersion}`);
		this.name = "VersionConflictError";
		this.currentVersion = currentVersion;
	}
}

/**
 * @lore I3 review W1: distinguishes "row was deleted between SELECT and
 * UPDATE" from a normal version conflict. Pre-fix, the second SELECT
 * returning nothing was masked as a VersionConflictError with the caller's
 * `expectedVersion` (`current?.version ?? expectedVersion`) — silently
 * misleading. Callers that catch one without the other now have a way
 * to react: a delete is unrecoverable, a conflict can be retried with
 * the latest version.
 */
class ItemDeletedError extends Error {
	readonly itemId: string;

	constructor(itemId: string) {
		super(`Knowledge item ${itemId} was deleted concurrently`);
		this.name = "ItemDeletedError";
		this.itemId = itemId;
	}
}

/**
 * @lore nested-knowledge-items architecture.md §3 (review.md B12): the three
 * tree invariants — no cycle, scope no wider than the parent's, depth ≤ 32 —
 * plus the polymorphic parent's existence check, all thrown from
 * `assertParentInvariants`. Before this type existed they were plain
 * `Error`s the route's `catch` block never recognised, so a caller naming an
 * illegal move got a 500 "Internal server error" instead of the 4xx
 * architecture §3 promises ("refused with a 4xx naming the rule").
 * `rule` is the stable, switchable discriminant; `message` stays the
 * detailed human-readable string already in the thrown text.
 */
class InvalidReparentError extends Error {
	readonly rule: "cycle" | "scope-too-wide" | "depth-exceeded" | "parent-not-found";

	constructor(rule: InvalidReparentError["rule"], message: string) {
		super(message);
		this.name = "InvalidReparentError";
		this.rule = rule;
	}
}

export { InvalidReparentError, ItemDeletedError, VersionConflictError };
