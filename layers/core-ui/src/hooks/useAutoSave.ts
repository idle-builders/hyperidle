import type { ActionResult, Problem } from "@hyperidle/domain-model";
import { useCallback, useEffect, useRef, useState } from "react";

export type AutoSaveStatus = "idle" | "saving" | "saved" | "error" | "conflict";

export interface UseAutoSaveOptions<O> {
	save: (content: string) => Promise<ActionResult<O>>;
	debounceMs?: number;
	onSaved?: (data: O) => void;
	onConflict?: (problems: readonly Problem[]) => void;
}

export interface UseAutoSaveResult {
	status: AutoSaveStatus;
	save: (content: string) => void;
	reset: () => void;
}

export function useAutoSave<O>({
	save: saveFn,
	debounceMs = 1500,
	onSaved,
	onConflict,
}: UseAutoSaveOptions<O>): UseAutoSaveResult {
	const [status, setStatus] = useState<AutoSaveStatus>("idle");

	const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const unmountedRef = useRef(false);

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

	// @lore: StrictMode runs cleanup+re-run on first mount; unmountedRef.current must reset to false on remount or all debounce callbacks bail out immediately
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
