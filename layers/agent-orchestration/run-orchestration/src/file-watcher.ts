/**
 * AU21 §9 Increment 8, Decision F2: relocated WHOLESALE from
 * `layers/core-api/filesystems/src/file-watcher.ts` — `startWatcher` has
 * ZERO database coupling (only `fs`/`EventBus`, given a `sandboxPath`/
 * `sessionId`/`manifestPath` directly). It was only ever called at
 * session-launch time (`context.ts`, via the composition-bundle's
 * pass-through `filesystems: { startWatcher }` binding), so there is no
 * "record" for it to read via `CoreApiPort` — it moves wholesale, unchanged,
 * rather than growing a seam method (an agent-orchestration package may not
 * import a core-api Service directly per Mechanism B / composition-boundary-
 * guard, which is exactly the edge this move closes).
 */
import * as fs from "node:fs";
import * as path from "node:path";
import type { SandboxWritebackChange } from "@hyperidle/domain-model";
import type { EventBus } from "@hyperidle/event-bus";

// @lore AU44 batch6: FileWatcherConfig made file-local — no cross-package consumer.
interface FileWatcherConfig {
	sandboxPath: string;
	sessionId: string;
	manifestPath: string;
	eventBus: EventBus;
	debounceMs?: number;
	onError(error: Error): void;
}

// @lore AU44 batch6: FileWatcher made file-local — no cross-package consumer.
interface FileWatcher {
	stop(): void;
}

const DEFAULT_DEBOUNCE_MS = 500;

function getRelativePath(sandboxPath: string, fullPath: string): string {
	return path.relative(sandboxPath, fullPath);
}

function isWatchedPath(relativePath: string): boolean {
	return relativePath.startsWith("knowledge/") || relativePath.startsWith("work/");
}

export function startWatcher(config: FileWatcherConfig): FileWatcher {
	const debounceMs = config.debounceMs ?? DEFAULT_DEBOUNCE_MS;
	const pendingChanges = new Map<string, SandboxWritebackChange>();
	let debounceTimer: ReturnType<typeof setTimeout> | null = null;
	let stopped = false;
	const watchers: fs.FSWatcher[] = [];

	const knowledgeDir = path.join(config.sandboxPath, "knowledge");
	const workDir = path.join(config.sandboxPath, "work");

	function closeWatchers(): void {
		for (const watcher of watchers) {
			try {
				watcher.close();
			} catch (closeError) {
				void closeError;
			}
		}
	}

	function cancelPending(): void {
		if (debounceTimer) {
			clearTimeout(debounceTimer);
			debounceTimer = null;
		}
		pendingChanges.clear();
	}

	function flush(): void {
		if (pendingChanges.size === 0) return;

		const changes = Array.from(pendingChanges.values());
		pendingChanges.clear();

		config.eventBus.emit({
			type: "sandbox_writeback_changes_detected",
			streamId: config.sessionId,
			sessionId: config.sessionId,
			sandboxPath: config.sandboxPath,
			manifestPath: config.manifestPath,
			changes,
			timestamp: Date.now(),
		});
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

		const fullPath = path.resolve(dir, filename);
		const sandboxRoot = path.resolve(config.sandboxPath);
		if (fullPath !== sandboxRoot && !fullPath.startsWith(`${sandboxRoot}${path.sep}`)) return;
		const relativePath = getRelativePath(config.sandboxPath, fullPath);
		if (relativePath.startsWith("..") || path.isAbsolute(relativePath)) return;

		if (!isWatchedPath(relativePath)) return;

		let changeType: SandboxWritebackChange["type"];
		if (fs.existsSync(fullPath)) {
			const stat = fs.lstatSync(fullPath);
			if (stat.isSymbolicLink()) return;
			if (!stat.isFile()) return;

			changeType = "modify"; // Will be refined in writeback
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

	function handleError(error: Error): void {
		if (stopped) return;
		stopped = true;
		cancelPending();
		closeWatchers();
		config.onError(error);
	}

	try {
		for (const dir of [knowledgeDir, workDir]) {
			if (fs.existsSync(dir)) {
				const watcher = fs.watch(dir, { recursive: true }, (eventType, filename) => {
					handleChange(dir, eventType, filename);
				});
				watcher.on("error", handleError);
				watchers.push(watcher);
			}
		}
	} catch (error) {
		stopped = true;
		cancelPending();
		closeWatchers();
		throw error;
	}

	return {
		stop(): void {
			if (stopped) return;
			stopped = true;

			if (debounceTimer) {
				clearTimeout(debounceTimer);
				debounceTimer = null;
			}

			flush();
			closeWatchers();
		},
	};
}
