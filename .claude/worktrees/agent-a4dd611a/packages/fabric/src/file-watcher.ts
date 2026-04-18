import * as fs from "node:fs";
import * as path from "node:path";
import type { HyperIdleDb } from "@hyperidle/db";
import type { WritebackChange } from "./writeback.js";
import { getRelativePath, isWatchedPath, processWriteback } from "./writeback.js";

export interface FileWatcherConfig {
	db: HyperIdleDb;
	workspacePath: string;
	sessionId: string;
	manifestPath: string;
	debounceMs?: number;
}

export interface FileWatcher {
	stop(): void;
}

const DEFAULT_DEBOUNCE_MS = 500;

/** Start watching a materialized workspace for file changes. */
export function startWatcher(config: FileWatcherConfig): FileWatcher {
	const debounceMs = config.debounceMs ?? DEFAULT_DEBOUNCE_MS;
	const pendingChanges = new Map<string, WritebackChange>();
	let debounceTimer: ReturnType<typeof setTimeout> | null = null;
	let stopped = false;
	const watchers: fs.FSWatcher[] = [];

	const knowledgeDir = path.join(config.workspacePath, "knowledge");
	const workDir = path.join(config.workspacePath, "work");

	function flush(): void {
		if (pendingChanges.size === 0) return;

		const changes = Array.from(pendingChanges.values());
		pendingChanges.clear();

		processWriteback(
			{
				db: config.db,
				workspacePath: config.workspacePath,
				sessionId: config.sessionId,
				manifestPath: config.manifestPath,
			},
			changes,
		);
	}

	function scheduleFlush(): void {
		if (stopped) return;
		if (debounceTimer) {
			clearTimeout(debounceTimer);
		}
		debounceTimer = setTimeout(() => {
			if (!stopped) {
				flush();
			}
		}, debounceMs);
	}

	function handleChange(dir: string, _eventType: string, filename: string | null): void {
		if (stopped || !filename) return;

		const fullPath = path.join(dir, filename);
		const relativePath = getRelativePath(config.workspacePath, fullPath);

		if (!isWatchedPath(relativePath)) return;

		let changeType: WritebackChange["type"];
		if (fs.existsSync(fullPath)) {
			const stat = fs.statSync(fullPath);
			if (!stat.isFile()) return;

			// Check if it's in the manifest to distinguish create vs modify
			changeType = "modify"; // Will be refined in writeback
			// If file is new (not in manifest), writeback handleModify falls back to create
		} else {
			changeType = "delete";
		}

		pendingChanges.set(relativePath, {
			type: changeType,
			relativePath,
			fullPath,
		});

		scheduleFlush();
	}

	// Watch knowledge/ and work/ directories
	for (const dir of [knowledgeDir, workDir]) {
		if (fs.existsSync(dir)) {
			try {
				const watcher = fs.watch(dir, { recursive: true }, (eventType, filename) => {
					handleChange(dir, eventType, filename);
				});
				watchers.push(watcher);
			} catch {
				// fs.watch not supported, caller should use polling fallback
			}
		}
	}

	return {
		stop(): void {
			if (stopped) return;
			stopped = true;

			if (debounceTimer) {
				clearTimeout(debounceTimer);
				debounceTimer = null;
			}

			// Final pass: flush any pending changes
			flush();

			// Close all watchers
			for (const watcher of watchers) {
				watcher.close();
			}
		},
	};
}
