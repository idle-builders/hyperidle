/**
 * useAutoSave — debounced PATCH auto-save hook for knowledge items.
 *
 * Manages the auto-save lifecycle:
 *   - Debounces save calls (default 1500ms)
 *   - Sends PATCH with { body, version, updatedBy }
 *   - Status state machine: idle -> saving -> saved -> idle (3s)
 *   - Handles 409 conflict: calls onConflict, status=conflict
 *   - Handles network/other errors: status=error
 *   - Cleans up timers on unmount
 *
 * @lore T2: Does NOT use useFetch — this is a mutation, not a query.
 * Uses useRef for the timer to avoid stale closure issues with debounce.
 * The "saved" -> "idle" auto-clear uses a separate 3s timeout ref.
 *
 * @lore T2 F3: dirty-check in the save function — callers should skip
 * calling save() when content matches the initial/saved content to avoid
 * spurious saves on mount. See handleContentChange in KnowledgeDetail.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { apiFetch } from "../services/api-fetch.js";

export type AutoSaveStatus = "idle" | "saving" | "saved" | "error" | "conflict";

export interface ConflictInfo {
	currentVersion: number;
}

export interface UseAutoSaveOptions {
	/** The API endpoint URL (e.g. `/api/knowledge/${id}`) */
	endpoint: string;
	/** Current version number for optimistic locking */
	version: number;
	/** User id for the updatedBy field */
	updatedBy: string;
	/** Debounce delay in ms. Default: 1500 */
	debounceMs?: number;
	/** Called when save succeeds with the new version number */
	onSaved?: (newVersion: number) => void;
	/** Called on 409 conflict */
	onConflict?: (info: ConflictInfo) => void;
}

export interface UseAutoSaveResult {
	/** Current save status */
	status: AutoSaveStatus;
	/** Schedule a save with the given content. Debounced internally. */
	save: (content: string) => void;
	/** Reset the status to idle (e.g. when dismissing error state) */
	reset: () => void;
}

function executePatch(
	endpoint: string,
	content: string,
	version: number,
	updatedBy: string,
): Promise<Response> {
	return apiFetch(endpoint, {
		method: "PATCH",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ body: content, version, updatedBy }),
	});
}

export function useAutoSave({
	endpoint,
	version,
	updatedBy,
	debounceMs = 1500,
	onSaved,
	onConflict,
}: UseAutoSaveOptions): UseAutoSaveResult {
	const [status, setStatus] = useState<AutoSaveStatus>("idle");

	// Refs to avoid stale closures in timers
	const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const unmountedRef = useRef(false);

	// Keep latest options in refs so the debounced callback uses current values
	const versionRef = useRef(version);
	const updatedByRef = useRef(updatedBy);
	const endpointRef = useRef(endpoint);
	const onSavedRef = useRef(onSaved);
	const onConflictRef = useRef(onConflict);

	useEffect(() => {
		versionRef.current = version;
	}, [version]);

	useEffect(() => {
		updatedByRef.current = updatedBy;
	}, [updatedBy]);

	useEffect(() => {
		endpointRef.current = endpoint;
	}, [endpoint]);

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

	const handleSaveResponse = useCallback(async (res: Response): Promise<void> => {
		if (unmountedRef.current) return;

		if (res.status === 409) {
			const data = (await res.json()) as { details?: { currentVersion?: number } };
			const currentVersion = data.details?.currentVersion ?? 0;
			setStatus("conflict");
			onConflictRef.current?.({ currentVersion });
			return;
		}

		if (!res.ok) {
			setStatus("error");
			return;
		}

		const data = (await res.json()) as { version?: number };
		const newVersion = data.version ?? versionRef.current;

		if (unmountedRef.current) return;

		setStatus("saved");
		onSavedRef.current?.(newVersion);

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
				executePatch(endpointRef.current, content, versionRef.current, updatedByRef.current)
					.then((res) => handleSaveResponse(res))
					.catch(() => {
						if (!unmountedRef.current) {
							setStatus("error");
						}
					});
			}, debounceMs);
		},
		[debounceMs, handleSaveResponse],
	);

	const reset = useCallback((): void => {
		setStatus("idle");
	}, []);

	return { status, save, reset };
}
