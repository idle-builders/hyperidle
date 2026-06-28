/**
 * AO2 — Adapter 3: LocalFolderAdapter.
 *
 * Local doc_set filesystem: mount by symlinking the folder into sandboxPath (or
 * working in-place). Capture-back: snapshot the changed subtree to a durable
 * path (timestamped copy). Last-write-wins, no merge (hard rule 5).
 *
 * Selection rule (W4·5): doc_set + local/obsidian/non-cloud source → this adapter.
 *
 * @lore AO2 §5 adapter-3: Work in place — with no isolation boundary (AQ1) a copy
 * buys nothing and severs Obsidian's live-reload. Concurrency on same vault =
 * last-write-wins (same risk as two editors); per-session copy is a future localized
 * change behind the registry interface, not a contract change.
 *
 * @lore AO2 §5 adapter-3 snapshot: The snapshot is the AO3-portable artifact.
 * It is a timestamped copy (`cp -R`), not a git bundle. No merge; provenance lives
 * in the filesystem_captures row.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import type { MountResult } from "@hyperidle/shared";
import type {
	AdapterCaptureResult,
	CaptureContext,
	MountAdapter,
	MountContext,
} from "./mount-adapter.js";
import type { AdapterDeps } from "./mounter-registry.js";

export class LocalFolderAdapter implements MountAdapter {
	readonly id = "local-folder";

	constructor(private readonly _deps: AdapterDeps) {}

	async mount(ctx: MountContext): Promise<MountResult> {
		const { filesystem, sandboxPath } = ctx;

		if (filesystem.resourceRef.kind !== "doc_set") {
			return {
				success: false,
				sandboxPath,
				error: `LocalFolderAdapter: expected doc_set resourceRef, got '${filesystem.resourceRef.kind}'`,
			};
		}

		const folderPath = filesystem.resourceRef.folder;

		if (!fs.existsSync(folderPath)) {
			return {
				success: false,
				sandboxPath,
				error: `LocalFolderAdapter: folder does not exist: '${folderPath}'`,
			};
		}

		try {
			// Symlink the vault folder into the sandbox at its basename.
			const basename = path.basename(folderPath);
			const linkPath = path.join(sandboxPath, basename);

			if (!fs.existsSync(linkPath)) {
				fs.symlinkSync(folderPath, linkPath);
			}

			return { success: true, sandboxPath };
		} catch (err) {
			return {
				success: false,
				sandboxPath,
				error: `LocalFolderAdapter.mount failed: ${err instanceof Error ? err.message : String(err)}`,
			};
		}
	}

	async captureBack(ctx: CaptureContext): Promise<AdapterCaptureResult> {
		const { filesystem, sessionId } = ctx;

		if (filesystem.resourceRef.kind !== "doc_set") {
			return {
				success: false,
				captured: false,
				error: "LocalFolderAdapter: expected doc_set resourceRef",
			};
		}

		const folderPath = filesystem.resourceRef.folder;

		if (!fs.existsSync(folderPath)) {
			return {
				success: false,
				captured: false,
				error: `LocalFolderAdapter: folder does not exist at capture time: '${folderPath}'`,
			};
		}

		try {
			// Snapshot the folder to a durable path for AO3 provenance.
			const snapshotDir = path.join(this._deps.capturesDir, `${sessionId}-snapshot`);
			fs.mkdirSync(snapshotDir, { recursive: true });
			copyDirRecursive(folderPath, snapshotDir);

			return { success: true, captured: true, capturePath: snapshotDir };
		} catch (err) {
			return {
				success: false,
				captured: false,
				error: `LocalFolderAdapter.captureBack failed: ${err instanceof Error ? err.message : String(err)}`,
			};
		}
	}
}

/** Recursively copy directory contents from src into dst. */
function copyDirRecursive(src: string, dst: string): void {
	const entries = fs.readdirSync(src, { withFileTypes: true });
	for (const entry of entries) {
		const srcPath = path.join(src, entry.name);
		const dstPath = path.join(dst, entry.name);
		if (entry.isDirectory()) {
			fs.mkdirSync(dstPath, { recursive: true });
			copyDirRecursive(srcPath, dstPath);
		} else if (entry.isFile()) {
			fs.copyFileSync(srcPath, dstPath);
		}
		// Skip symlinks to avoid loops.
	}
}
