import * as fs from "node:fs";
import * as path from "node:path";
import type { FileWatcher, FileWatcherConfig } from "./file-watcher.js";
import type { WritebackChange } from "./writeback.js";
import { getRelativePath, isWatchedPath, processWriteback } from "./writeback.js";

const DEFAULT_POLL_INTERVAL_MS = 1500;

interface FileSnapshot {
	mtime: number;
	size: number;
}

/** Recursively collect file stats for a directory. */
function scanDirectory(dir: string): Map<string, FileSnapshot> {
	const result = new Map<string, FileSnapshot>();

	if (!fs.existsSync(dir)) return result;

	function walk(currentDir: string): void {
		const entries = fs.readdirSync(currentDir, { withFileTypes: true });
		for (const entry of entries) {
			const fullPath = path.join(currentDir, entry.name);
			if (entry.isDirectory()) {
				walk(fullPath);
			} else if (entry.isFile()) {
				const stat = fs.statSync(fullPath);
				result.set(fullPath, {
					mtime: stat.mtimeMs,
					size: stat.size,
				});
			}
		}
	}

	walk(dir);
	return result;
}

/** Start polling-based watcher as fallback for environments without native fs.watch. */
export function startPollingWatcher(config: FileWatcherConfig): FileWatcher {
	const pollIntervalMs = config.debounceMs ?? DEFAULT_POLL_INTERVAL_MS;
	let stopped = false;
	let pollTimer: ReturnType<typeof setInterval> | null = null;

	const knowledgeDir = path.join(config.sandboxPath, "knowledge");
	const workDir = path.join(config.sandboxPath, "work");

	// Take initial snapshot
	let previousSnapshot = new Map<string, FileSnapshot>();
	const mergeSnapshots = (): Map<string, FileSnapshot> => {
		const result = new Map<string, FileSnapshot>();
		for (const [k, v] of scanDirectory(knowledgeDir)) result.set(k, v);
		for (const [k, v] of scanDirectory(workDir)) result.set(k, v);
		return result;
	};

	previousSnapshot = mergeSnapshots();

	function poll(): void {
		if (stopped) return;

		const currentSnapshot = mergeSnapshots();
		const changes: WritebackChange[] = [];

		// Detect new and modified files
		for (const [fullPath, currentStats] of currentSnapshot) {
			const relativePath = getRelativePath(config.sandboxPath, fullPath);
			if (!isWatchedPath(relativePath)) continue;

			const previous = previousSnapshot.get(fullPath);
			if (!previous) {
				// New file
				changes.push({ type: "create", relativePath, fullPath });
			} else if (previous.mtime !== currentStats.mtime || previous.size !== currentStats.size) {
				// Modified file
				changes.push({ type: "modify", relativePath, fullPath });
			}
		}

		// Detect deleted files
		for (const [fullPath] of previousSnapshot) {
			if (!currentSnapshot.has(fullPath)) {
				const relativePath = getRelativePath(config.sandboxPath, fullPath);
				if (!isWatchedPath(relativePath)) continue;
				changes.push({ type: "delete", relativePath, fullPath });
			}
		}

		previousSnapshot = currentSnapshot;

		if (changes.length > 0) {
			processWriteback(
				{
					db: config.db,
					sandboxPath: config.sandboxPath,
					sessionId: config.sessionId,
					manifestPath: config.manifestPath,
				},
				changes,
			);
		}
	}

	pollTimer = setInterval(poll, pollIntervalMs);

	return {
		stop(): void {
			if (stopped) return;

			if (pollTimer) {
				clearInterval(pollTimer);
				pollTimer = null;
			}

			// Final poll to catch any last changes — must run before
			// setting stopped=true since poll() guards on that flag.
			poll();
			stopped = true;
		},
	};
}
