/**
 * useBetDescriptionSave — purpose-built auto-save hook for bet description PATCH.
 *
 * Sends PATCH /api/bets/:id with { field: "description", value, reason: "Edited by user" }.
 * Status machine: idle -> saving -> saved -> idle (3s auto-clear of "saved").
 * No conflict handling — bets have no version column (unlike knowledge items).
 *
 * @lore T3: Separate from useAutoSave (T2) because the payload shape differs.
 * Bets use { field, value, reason } while knowledge uses { body, version, updatedBy }.
 * Bets also have no version/conflict handling. A general-purpose hook would add
 * complexity for two consumers; create a purpose-built hook instead.
 *
 * @lore T2 F3: dirty-check is handled by the caller (WorkBet handleDescriptionChange).
 * The hook itself does not skip on identical content — it debounces and sends whatever
 * content the caller provides.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { apiFetch } from "../services/api-fetch.js";

export type BetSaveStatus = "idle" | "saving" | "saved" | "error";

export interface UseBetDescriptionSaveOptions {
	betId: string;
	/** Debounce delay in ms. Default: 1500 */
	debounceMs?: number;
	/** Called on successful save */
	onSaved?: () => void;
}

export interface UseBetDescriptionSaveResult {
	status: BetSaveStatus;
	save: (content: string) => void;
}

export function useBetDescriptionSave({
	betId,
	debounceMs = 1500,
	onSaved,
}: UseBetDescriptionSaveOptions): UseBetDescriptionSaveResult {
	const [status, setStatus] = useState<BetSaveStatus>("idle");

	// Refs to avoid stale closures in timers
	const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const unmountedRef = useRef(false);

	// Keep latest options in refs so the debounced callback uses current values
	const betIdRef = useRef(betId);
	const onSavedRef = useRef(onSaved);

	useEffect(() => {
		betIdRef.current = betId;
	}, [betId]);

	useEffect(() => {
		onSavedRef.current = onSaved;
	}, [onSaved]);

	// Cleanup on unmount.
	// @lore R9: React 18 StrictMode runs effect cleanup + re-run on first mount.
	// The cleanup sets unmountedRef.current = true but the re-run must reset it to
	// false, otherwise all debounce callbacks bail out immediately after StrictMode.
	// Setting unmountedRef.current = false in the setup (not just cleanup) ensures
	// the flag is always reset when the effect is (re-)applied.
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

	const save = useCallback(
		(content: string): void => {
			// Clear any pending debounce timer
			if (debounceTimerRef.current !== null) {
				clearTimeout(debounceTimerRef.current);
			}

			debounceTimerRef.current = setTimeout(() => {
				if (unmountedRef.current) return;
				setStatus("saving");

				apiFetch(`/api/bets/${betIdRef.current}`, {
					method: "PATCH",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						field: "description",
						value: content,
						reason: "Edited by user",
					}),
				})
					.then((res: Response): void => {
						if (unmountedRef.current) return;

						if (!res.ok) {
							setStatus("error");
							return;
						}

						setStatus("saved");
						onSavedRef.current?.();

						// Auto-clear "saved" status after 3 seconds
						if (savedTimerRef.current !== null) {
							clearTimeout(savedTimerRef.current);
						}
						savedTimerRef.current = setTimeout(() => {
							if (!unmountedRef.current) {
								setStatus("idle");
							}
						}, 3000);
					})
					.catch((): void => {
						if (!unmountedRef.current) {
							setStatus("error");
						}
					});
			}, debounceMs);
		},
		[debounceMs],
	);

	return { status, save };
}
