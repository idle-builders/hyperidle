/**
 * AF8 — useNotificationMute hook.
 *
 * Fetches the list of muted notification type keys from GET /api/notifications/mute
 * and exposes a setMuted mutation for toggling individual type keys.
 *
 * @lore AF8: Factory-level mute defaults only until AF15, which will swap in
 * per-user persistence. The interface stays the same; AF15 updates the API
 * endpoint implementation without changing this hook's contract.
 */

import type { NotificationTypeKey } from "@hyperidle/domain-model";
import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "../services/api-fetch.js";

export interface UseNotificationMuteResult {
	mutedKeys: NotificationTypeKey[];
	setMuted: (key: NotificationTypeKey, muted: boolean) => Promise<void>;
	status: "loading" | "ready" | "error";
}

export function useNotificationMute(): UseNotificationMuteResult {
	const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
	const [mutedKeys, setMutedKeys] = useState<NotificationTypeKey[]>([]);

	useEffect(() => {
		let cancelled = false;
		apiFetch("/api/notifications/mute")
			.then((res) => {
				if (!res.ok) throw new Error(`HTTP ${res.status}`);
				return res.json() as Promise<{ muted: NotificationTypeKey[] }>;
			})
			.then((body) => {
				if (!cancelled) {
					// Fail-open: treat missing/unexpected muted field as empty list
					setMutedKeys(Array.isArray(body.muted) ? body.muted : []);
					setStatus("ready");
				}
			})
			.catch(() => {
				if (!cancelled) setStatus("error");
			});
		return (): void => {
			cancelled = true;
		};
	}, []);

	const setMuted = useCallback(async (key: NotificationTypeKey, muted: boolean): Promise<void> => {
		await apiFetch(`/api/notifications/mute/${key}`, {
			method: "PUT",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ muted }),
		});
		setMutedKeys((prev) =>
			muted ? [...prev.filter((k) => k !== key), key] : prev.filter((k) => k !== key),
		);
	}, []);

	return { mutedKeys, setMuted, status };
}
