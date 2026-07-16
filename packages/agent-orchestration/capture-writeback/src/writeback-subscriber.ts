/**
 * @lore AU19 Increment 3f: §10.3 against-grain inversion for
 * `filesystems ⚠ capture-writeback` (§10.3 line 517's pure-inversion
 * ruling: "`file-watcher` already fires on sandbox change — emit that as an
 * event; `capture-writeback` subscribes. Pure inversion, no
 * reclassification."). `@hyperidle/filesystems`' `file-watcher.ts` used to
 * call an injected `FilesystemsWritebackProcessor` port directly
 * (Increment 2b interim wiring); it now emits `sandbox_writeback_changes_detected`
 * on the `EventBus` instead, and this subscriber drives `processWriteback`
 * off that event.
 *
 * Atomicity check (§10.3 amendment, the same test applied to every
 * against-grain edge this increment): `file-watcher`'s change detection is a
 * filesystem read (`fs.watch`), not a DB write — there is no shared
 * transaction with `capture-writeback`'s own DB read/write for an
 * emit-after-commit split to endanger. This is the "common case" §10.3
 * describes, not the `policy ⚠ session-requests`/`review ⚠ session-requests`
 * same-transaction exception (those stayed permanent DI ports).
 *
 * Same fire-and-forget shape as `bet-decomposition-subscriber.ts`: the
 * subscriber's own async work must never throw synchronously into
 * `EventBus.emit` (`emit` does not await handlers) and must swallow the one
 * expected transient failure (ENOENT — the sandbox was torn down before the
 * debounced flush landed) exactly as `file-watcher.ts`'s pre-inversion
 * `.catch()` did; any other error re-throws as an unhandled rejection,
 * matching the prior behavior's own comment ("Re-throw non-ENOENT errors as
 * unhandled rejections").
 *
 * Dropped as an accepted consequence of the inversion: `file-watcher.ts`
 * used to proactively `watcher.close()` all its `fs.watch` handles the
 * moment an ENOENT surfaced from the (previously synchronously visible)
 * writeback call — a purely defensive optimization to avoid redundant
 * no-op flushes against a torn-down sandbox, not a correctness requirement.
 * After inversion, `capture-writeback` has no reference to filesystems'
 * watcher instance to signal back. This is safe: `session-lifecycle.ts`
 * ALWAYS calls `context.ingestion.dispose()` (→ `watcher.stop()`) at session
 * end, in both the normal-completion and error/cleanup paths — the watcher
 * is guaranteed to be torn down regardless of this optimization's removal.
 */
import type { EventBus } from "@hyperidle/shared";
import { processWriteback, type WritebackConfig } from "./writeback.js";

export interface CaptureWritebackSubscriberDeps {
	readonly db: WritebackConfig["db"];
	readonly eventBus: EventBus;
	readonly knowledge: WritebackConfig["knowledge"];
}

/**
 * Register the capture-writeback subscriber on the event bus.
 *
 * Listens for `sandbox_writeback_changes_detected` and fires
 * `processWriteback` for the batch. Returns a dispose function to
 * unsubscribe (for server shutdown).
 */
export function registerCaptureWriteback(deps: CaptureWritebackSubscriberDeps): () => void {
	const { db, eventBus, knowledge } = deps;

	const dispose = eventBus.on("sandbox_writeback_changes_detected", (event) => {
		// Fire-and-forget, matching file-watcher.ts's pre-inversion behavior
		// (that flush() was never awaited by its own caller either).
		void processWriteback(
			{
				db,
				sandboxPath: event.sandboxPath,
				sessionId: event.sessionId,
				manifestPath: event.manifestPath,
				knowledge,
			},
			[...event.changes],
		).catch((err: unknown) => {
			if (err !== null && typeof err === "object" && "code" in err && err.code === "ENOENT") {
				// Sandbox removed before processing (test cleanup, session end with
				// sandbox reaper) — no-op, matches prior file-watcher suppression.
				return;
			}
			// Re-throw non-ENOENT errors as unhandled rejections, matching prior behavior.
			throw err;
		});
	});

	return dispose;
}
