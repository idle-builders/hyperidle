/**
 * AF8 — useNotifications hook.
 *
 * Fetches the in-app notification inbox from GET /api/notifications/inbox.
 * Exposes markSeen, markRead, and muteType mutations.
 *
 * @lore AF8: The hook is the sole data-access point for the NotificationPopover.
 * It does NOT import from @hyperidle/db — all data flows through the HTTP API
 * to respect the Human Interface → server boundary.
 */

import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "../services/api-fetch.js";

export interface NotificationRow {
	id: string;
	typeKey: string;
	urgency: "immediate" | "ambient";
	title: string;
	sourceLink: string;
	createdAt: string;
	seenAt: string | null;
	readAt: string | null;
}

export interface UseNotificationsResult {
	unseenCount: number;
	rows: NotificationRow[];
	status: "loading" | "ready" | "error";
	/** Re-fetch the inbox. Used by the error-state Retry button. */
	refetch: () => Promise<void>;
	markSeen: () => Promise<void>;
	markRead: (id: string) => Promise<void>;
	muteType: (typeKey: string) => Promise<void>;
}

export function useNotifications(): UseNotificationsResult {
	const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
	const [unseenCount, setUnseenCount] = useState(0);
	const [rows, setRows] = useState<NotificationRow[]>([]);

	const fetchInbox = useCallback(async (): Promise<void> => {
		setStatus("loading");
		try {
			const res = await apiFetch("/api/notifications/inbox");
			if (!res.ok) throw new Error(`HTTP ${res.status}`);
			const body = (await res.json()) as { unseenCount: number; rows: NotificationRow[] };
			setUnseenCount(body.unseenCount ?? 0);
			// @lore AI2: null-coalesce rows to [] to guard against malformed API responses
			// where the key is missing (e.g. stale mocks returning { notifications } not { rows }).
			setRows(body.rows ?? []);
			setStatus("ready");
		} catch {
			setStatus("error");
		}
	}, []);

	useEffect(() => {
		void fetchInbox();
	}, [fetchInbox]);

	const markSeen = useCallback(async (): Promise<void> => {
		try {
			await apiFetch("/api/notifications/seen", { method: "POST" });
			setUnseenCount(0);
		} catch {
			// Non-fatal — UI keeps the old count
		}
	}, []);

	const markRead = useCallback(async (id: string): Promise<void> => {
		try {
			await apiFetch(`/api/notifications/${id}/read`, { method: "POST" });
			setRows((prev) => prev.filter((r) => r.id !== id));
		} catch {
			// Non-fatal
		}
	}, []);

	const muteType = useCallback(async (typeKey: string): Promise<void> => {
		try {
			await apiFetch(`/api/notifications/mute/${typeKey}`, {
				method: "PUT",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ muted: true }),
			});
			// Remove all rows of this type from the list
			setRows((prev) => prev.filter((r) => r.typeKey !== typeKey));
		} catch {
			// Non-fatal
		}
	}, []);

	return { unseenCount, rows, status, refetch: fetchInbox, markSeen, markRead, muteType };
}
