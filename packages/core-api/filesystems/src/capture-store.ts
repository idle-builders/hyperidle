/**
 * AO2 — capture-store: write a filesystem_captures provenance row.
 *
 * Called by RegistryFilesystemMounter.captureBack after the adapter returns a
 * successful capture result. AO3 reads this to locate the durable artifact
 * (bundle / snapshot dir).
 *
 * @lore AO2: A capture is a filesystem op record, NOT an L3 Artifact. Kept
 * separate so AO3 can locate captures without touching the artifacts table.
 */

import { filesystemCaptures, type WriteExecutor } from "@hyperidle/db";

export interface FilesystemCaptureInput {
	readonly id: string;
	readonly sessionId: string;
	readonly filesystemId: string;
	readonly writeback: string;
	readonly capturePath: string;
	readonly commitSha?: string;
	readonly createdAt: string;
}

/**
 * Persist a filesystem capture row. Idempotent-by-id (duplicate insert will
 * fail loudly — never silently dropped).
 */
export async function writeFilesystemCapture(
	exec: WriteExecutor,
	input: FilesystemCaptureInput,
): Promise<void> {
	await exec.insert(filesystemCaptures).values({
		id: input.id,
		sessionId: input.sessionId,
		filesystemId: input.filesystemId,
		writeback: input.writeback,
		capturePath: input.capturePath,
		commitSha: input.commitSha,
		createdAt: input.createdAt,
	});
}
