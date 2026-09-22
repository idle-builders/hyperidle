/**
 * useAutoSave — debounced auto-save hook, transport-agnostic.
 *
 * Manages the auto-save lifecycle:
 *   - Debounces save calls (default 1500ms)
 *   - Calls the caller-supplied `save(content)` door
 *   - Status state machine: idle -> saving -> saved -> idle (3s)
 *   - A `stale` problem (optimistic-concurrency conflict) surfaces as
 *     status=conflict and calls `onConflict`
 *   - Any other refusal or a thrown error surfaces as status=error
 *   - Cleans up timers on unmount
 *
 * @lore BC4 architecture.md §9: replaces the `{ endpoint, version, updatedBy }`
 * PATCH shape with a plain `save: (content) => Promise<ActionResult<O>>` door
 * — the caller closes over whatever `call("edit_document", …)` needs (id,
 * version, …), so this hook never has to know the action's own input shape.
 * Kept ahead of its own owning block (old B16) because `DocumentDetail`
 * cannot wire `edit_document` through `call()` without it — see the
 * architecture doc §16.1 boundary note on this file.
 *
 * @lore T2 F3: dirty-check in the save function — callers should skip
 * calling save() when content matches the initial/saved content to avoid
 * spurious saves on mount. See handleContentChange in DocumentDetail.
 */

import type { ActionResult, Problem } from "@hyperidle/domain-model";
import { useCallback, useEffect, useRef, useState } from "react";

export type AutoSaveStatus = "idle" | "saving" | "saved" | "error" | "conflict";

export interface UseAutoSaveOptions<O> {
	/** Issues the save itself — the caller closes over id/version/etc. */
	save: (content: string) => Promise<ActionResult<O>>;
	/** Debounce delay in ms. Default: 1500 */
	debounceMs?: number;
	/** Called when save succeeds, with the action's output. */
	onSaved?: (data: O) => void;
	/** Called when the save is refused because of a stale version. */
	onConflict?: (problems: readonly Problem[]) => void;
}

export interface UseAutoSaveResult {
	/** Current save status */
	status: AutoSaveStatus;
	/** Schedule a save with the given content. Debounced internally. */
	save: (content: string) => void;
	/** Reset the status to idle (e.g. when dismissing error state) */
	reset: () => void;
}

export function useAutoSave<O>({
	save: saveFn,
	debounceMs = 1500,
	onSaved,
	onConflict,
}: UseAutoSaveOptions<O>): UseAutoSaveResult {
	const [status, setStatus] = useState<AutoSaveStatus>("idle");

	// Refs to avoid stale closures in timers
	const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const unmountedRef = useRef(false);

	// Keep latest options in refs so the debounced callback uses current values
	const saveFnRef = useRef(saveFn);
	const onSavedRef = useRef(onSaved);
	const onConflictRef = useRef(onConflict);

	useEffect(() => {
		saveFnRef.current = saveFn;
	}, [saveFn]);

	useEffect(() => {
		onSavedRef.current = onSaved;
	}, [onSaved]);

	useEffect(() => {
		onConflictRef.current = onConflict;
	}, [onConflict]);

	// Cleanup on unmount.
	// @lore R9: React 18 StrictMode runs effect cleanup + re-run on first mount.
	// The cleanup sets unmountedRef.current = true but the re-run must reset it to
	// false, otherwise all debounce callbacks bail out immediately after StrictMode.
	// Setting unmountedRef.current = false in setup ensures the flag resets on remount.
	useEffect(() => {
		unmountedRef.current = false;
		return (): void => {
			unmountedRef.current = true;
			if (debounceTimerRef.current !== null) {
				clearTimeout(debounceTimerRef.current);
			}
			if (savedTimerRef.current !== null) {
				clearTimeout(savedTimerRef.current);
			}
		};
	}, []);

	const handleSaveResult = useCallback((result: ActionResult<O>): void => {
		if (unmountedRef.current) return;

		if (!result.ok) {
			const isStale = result.problems.some((p) => p.code === "stale");
			if (isStale) {
				setStatus("conflict");
				onConflictRef.current?.(result.problems);
				return;
			}
			setStatus("error");
			return;
		}

		setStatus("saved");
		onSavedRef.current?.(result.data);

		// Auto-clear "saved" status after 3 seconds
		if (savedTimerRef.current !== null) {
			clearTimeout(savedTimerRef.current);
		}
		savedTimerRef.current = setTimeout(() => {
			if (!unmountedRef.current) {
				setStatus("idle");
			}
		}, 3000);
	}, []);

	const save = useCallback(
		(content: string): void => {
			setStatus("saving");
			// Clear any pending debounce timer
			if (debounceTimerRef.current !== null) {
				clearTimeout(debounceTimerRef.current);
			}

			debounceTimerRef.current = setTimeout(() => {
				if (unmountedRef.current) return;
				saveFnRef
					.current(content)
					.then((result) => handleSaveResult(result))
					.catch(() => {
						if (!unmountedRef.current) {
							setStatus("error");
						}
					});
			}, debounceMs);
		},
		[debounceMs, handleSaveResult],
	);

	const reset = useCallback((): void => {
		setStatus("idle");
	}, []);

	return { status, save, reset };
}
