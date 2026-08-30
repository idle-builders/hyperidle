/**
 * useTaskPatch — issues PATCH /api/tasks/:id.
 *
 * The one edit door for a task. No role gate, no actor check — the same
 * call works for human and agent (AC7).
 *
 * Status machine: idle → saving → saved → idle (3s auto-clear of "saved")
 * or idle → saving → error.
 *
 * @lore BB1: replaces useBetDescriptionSave with a general-purpose field
 * patcher for any subset of task fields.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { apiFetch } from "../services/api-fetch.js";
import type { TaskPatchBody } from "../types/task.js";

export type TaskPatchStatus = "idle" | "saving" | "saved" | "error";

export interface UseTaskPatchResult {
	status: TaskPatchStatus;
	patch: (taskId: string, body: TaskPatchBody) => void;
}

export function useTaskPatch(onSaved?: () => void): UseTaskPatchResult {
	const [status, setStatus] = useState<TaskPatchStatus>("idle");
	const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const unmountedRef = useRef(false);
	const onSavedRef = useRef(onSaved);

	useEffect(() => {
		onSavedRef.current = onSaved;
	}, [onSaved]);

	useEffect(() => {
		unmountedRef.current = false;
		return (): void => {
			unmountedRef.current = true;
			if (savedTimerRef.current !== null) clearTimeout(savedTimerRef.current);
		};
	}, []);

	const patch = useCallback((taskId: string, body: TaskPatchBody): void => {
		if (unmountedRef.current) return;
		setStatus("saving");

		apiFetch(`/api/tasks/${encodeURIComponent(taskId)}`, {
			method: "PATCH",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(body),
		})
			.then((res: Response): void => {
				if (unmountedRef.current) return;
				if (!res.ok) {
					setStatus("error");
					return;
				}
				setStatus("saved");
				onSavedRef.current?.();

				if (savedTimerRef.current !== null) clearTimeout(savedTimerRef.current);
				savedTimerRef.current = setTimeout(() => {
					if (!unmountedRef.current) setStatus("idle");
				}, 3000);
			})
			.catch((): void => {
				if (!unmountedRef.current) setStatus("error");
			});
	}, []);

	return { status, patch };
}
