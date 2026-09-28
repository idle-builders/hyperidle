import type { ChangeRow } from "@hyperidle/domain-model";
import { useCallback, useEffect, useState } from "react";
import { call } from "../services/call.js";
import { getWsClient } from "../services/ws-client.js";

export interface InboxItem {
	readonly change: ChangeRow;
	readonly seenAt: string | null;
	readonly readAt: string | null;
}

export interface UseNotificationsResult {
	unseenCount: number;
	rows: InboxItem[];
	status: "loading" | "ready" | "error";
	/** Re-fetch the inbox. Used by the error-state Retry button. */
	refetch: () => Promise<void>;
	markSeen: () => Promise<void>;
	markRead: (changeId: string) => Promise<void>;
}

export function useNotifications(): UseNotificationsResult {
	const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
	const [rows, setRows] = useState<InboxItem[]>([]);
	const [userId, setUserId] = useState<string | null>(null);

	const fetchInbox = useCallback(async (): Promise<void> => {
		setStatus("loading");
		try {
			const result = await call("open_user", {});
			if (!result.ok || result.data.user === null || result.data.inbox === null) {
				setStatus("error");
				return;
			}
			setUserId(result.data.user.id);
			setRows([...result.data.inbox]);
			setStatus("ready");
		} catch {
			setStatus("error");
		}
	}, []);

	useEffect(() => {
		void fetchInbox();
	}, [fetchInbox]);

	// Nudge subscription — a frame on `user:<id>` means the caller's inbox
	// may have changed; refetch rather than apply a partial update.
	useEffect(() => {
		if (!userId) return;
		const ws = getWsClient();
		const topic = `user:${userId}`;
		const unsubscribe = ws.subscribe(topic, (raw) => {
			if (typeof raw !== "object" || raw === null) return;
			const msg = raw as Record<string, unknown>;
			if (msg.type !== "update" || msg.topic !== topic) return;
			void fetchInbox();
		});
		return (): void => {
			unsubscribe();
		};
	}, [userId, fetchInbox]);

	const markSeen = useCallback(async (): Promise<void> => {
		if (!userId) return;
		try {
			const result = await call("edit_user", { id: userId, inbox: { seen: "all" } });
			if (!result.ok) return;
			const now = new Date().toISOString();
			setRows((prev) => prev.map((row) => (row.seenAt === null ? { ...row, seenAt: now } : row)));
		} catch {
			// Non-fatal — UI keeps the old seen state
		}
	}, [userId]);

	const markRead = useCallback(
		async (changeId: string): Promise<void> => {
			if (!userId) return;
			try {
				const result = await call("edit_user", { id: userId, inbox: { read: [changeId] } });
				if (!result.ok) return;
				setRows((prev) => prev.filter((row) => row.change.id !== changeId));
			} catch {
				// Non-fatal
			}
		},
		[userId],
	);

	const unseenCount = rows.filter((row) => row.seenAt === null).length;

	return { unseenCount, rows, status, refetch: fetchInbox, markSeen, markRead };
}
