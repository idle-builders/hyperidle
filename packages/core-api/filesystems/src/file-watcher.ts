import * as fs from "node:fs";
import * as path from "node:path";
import type { EventBus, SandboxWritebackChange } from "@hyperidle/shared";

export interface FileWatcherConfig {
	/**
	 * Absolute path to the agent's sandbox directory.
	 * @lore AK1: Renamed per harness-vocab plan (AK1).
	 */
	sandboxPath: string;
	sessionId: string;
	manifestPath: string;
	/**
	 * @lore AU19 Increment 3f: `capture-writeback`'s batch writeback processor
	 * used to be an injected `FilesystemsWritebackProcessor` port (§10.3
	 * against-grain, Increment 2b interim wiring). Per §10.3 line 517's
	 * pure-inversion ruling ("`file-watcher` already fires on sandbox change
	 * — emit that as an event; `capture-writeback` subscribes"), the debounced
	 * flush now emits `sandbox_writeback_changes_detected` on this `EventBus`
	 * instead — `@hyperidle/capture-writeback`'s `registerCaptureWriteback`
	 * subscriber drives `processWriteback` itself. Atomicity check: this
	 * watcher's change detection is a filesystem read, not a DB write, so
	 * there is no shared transaction an async handoff could split.
	 */
	eventBus: EventBus;
	debounceMs?: number;
}

export interface FileWatcher {
	stop(): void;
}

const DEFAULT_DEBOUNCE_MS = 500;

/**
 * Determine the relative path of a file within the sandbox.
 *
 * @lore AU19 Increment 2b: inlined from `capture-writeback`'s (future)
 * `writeback.ts` — a pure, stateless path helper with zero dependency on
 * `capture-writeback`'s own DB/knowledge state, so it is duplicated here
 * rather than ported as a DI edge (see `ports.ts`'s top `@lore`).
 */
function getRelativePath(sandboxPath: string, fullPath: string): string {
	return path.relative(sandboxPath, fullPath);
}

/**
 * Check if a path is in a watched zone (knowledge/ or work/).
 *
 * @lore AU19 Increment 2b: inlined alongside `getRelativePath` — same reasoning.
 */
function isWatchedPath(relativePath: string): boolean {
	return relativePath.startsWith("knowledge/") || relativePath.startsWith("work/");
}

/** Start watching a sandbox for file changes. */
export function startWatcher(config: FileWatcherConfig): FileWatcher {
	const debounceMs = config.debounceMs ?? DEFAULT_DEBOUNCE_MS;
	const pendingChanges = new Map<string, SandboxWritebackChange>();
	let debounceTimer: ReturnType<typeof setTimeout> | null = null;
	let stopped = false;
	const watchers: fs.FSWatcher[] = [];

	const knowledgeDir = path.join(config.sandboxPath, "knowledge");
	const workDir = path.join(config.sandboxPath, "work");

	/**
	 * @lore AU19 Increment 3f: publishes the debounced batch as a domain
	 * event instead of calling an injected writeback port (§10.3 line 517's
	 * pure-inversion ruling — see `FileWatcherConfig.eventBus`'s own `@lore`).
	 * `EventBus.emit` is synchronous and does not return the subscriber's
	 * promise, so this watcher can no longer learn synchronously whether
	 * processing hit ENOENT (sandbox torn down before the flush landed) —
	 * the pre-inversion code used that signal to proactively `watcher.close()`
	 * every `fs.watch` handle early. Dropped as an accepted, safe consequence:
	 * `session-lifecycle.ts` ALWAYS calls `context.ingestion.dispose()` (→
	 * `watcher.stop()`) at session end regardless, so the watcher is still
	 * guaranteed to be torn down — this only removes a redundant early-stop
	 * optimization for an edge case, not a correctness guarantee. ENOENT
	 * suppression itself is unaffected — it moved into
	 * `@hyperidle/capture-writeback`'s `writeback-subscriber.ts`, which is
	 * now the only place that sees the processing outcome.
	 */
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

		const fullPath = path.join(dir, filename);
		const relativePath = getRelativePath(config.sandboxPath, fullPath);

		if (!isWatchedPath(relativePath)) return;

		let changeType: SandboxWritebackChange["type"];
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
