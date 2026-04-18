export class VersionConflictError extends Error {
	readonly currentVersion: number;

	constructor(itemId: string, currentVersion: number) {
		super(`Version conflict for knowledge item ${itemId}: current version is ${currentVersion}`);
		this.name = "VersionConflictError";
		this.currentVersion = currentVersion;
	}
}
