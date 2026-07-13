export class VersionConflictError extends Error {
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
export class ItemDeletedError extends Error {
	readonly itemId: string;

	constructor(itemId: string) {
		super(`Knowledge item ${itemId} was deleted concurrently`);
		this.name = "ItemDeletedError";
		this.itemId = itemId;
	}
}
