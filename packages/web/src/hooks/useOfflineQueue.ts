import type { VerdictAction } from "@hyperidle/shared";
import { useCallback, useEffect, useRef, useState } from "react";

/**
 * L5 — Offline queue for verdict commits. When `navigator.onLine` is false
 * (or a fetch rejects with a network error), the verdict is appended to
 * an in-memory FIFO and the UI shows the offline banner. On reconnect
 * (`online` event), the queue is drained sequentially and the consumer
 * is notified via `syncedCount` so a single "Synced N items" toast can
 * fire.
 *
 * @lore L5 ADV-03: spec calls for a single toast per replay batch — we
 * accumulate `syncedCount` per drain pass and reset to `null` once the
 * consumer dismisses the toast. We do NOT persist the queue across page
 * reloads; the spec reads "queue and replay on reconnect" which is a
 * same-session contract. localStorage persistence would re-introduce a
 * stale-write window we'd then have to invalidate against the server's
 * latest version.
 */

export interface QueuedVerdict {
	itemId: string;
	threadId: string;
	decision: VerdictAction;
	/** Optional payload passed to the commit API (summary, inline_comments). */
	payload?: Record<string, unknown>;
	queuedAt: number;
}

export interface UseOfflineQueueOptions {
	/** Function invoked per queued item on drain. Should resolve when synced. */
	commit: (q: QueuedVerdict) => Promise<void>;
}

export interface UseOfflineQueue {
	offline: boolean;
	queueLength: number;
	/** Counter of items just synced; null when there's nothing to announce. */
	syncedCount: number | null;
	enqueue: (q: Omit<QueuedVerdict, "queuedAt">) => void;
	dismissSyncedToast: () => void;
}

function readOnline(): boolean {
	if (typeof navigator === "undefined") return true;
	if (typeof navigator.onLine !== "boolean") return true;
	return navigator.onLine;
}

export function useOfflineQueue(opts: UseOfflineQueueOptions): UseOfflineQueue {
	const [offline, setOffline] = useState<boolean>(() => !readOnline());
	const [queueLength, setQueueLength] = useState(0);
	const [syncedCount, setSyncedCount] = useState<number | null>(null);
	// @lore L5: keep the queue in a ref so the drain coroutine reads/writes
	// the live array without re-binding from React state — the drain runs
	// once on `online` and shouldn't restart on every re-render.
	const queueRef = useRef<QueuedVerdict[]>([]);
	const drainingRef = useRef<boolean>(false);
	const commitRef = useRef(opts.commit);
	useEffect(() => {
		commitRef.current = opts.commit;
	}, [opts.commit]);

	const drain = useCallback(async (): Promise<void> => {
		if (drainingRef.current) return;
		drainingRef.current = true;
		let synced = 0;
		try {
			while (queueRef.current.length > 0) {
				const next = queueRef.current[0];
				try {
					await commitRef.current(next);
					queueRef.current.shift();
					synced += 1;
					setQueueLength(queueRef.current.length);
				} catch {
					// Stop draining on the first failure so order is preserved
					// and we don't burn API attempts while still flaky.
					break;
				}
			}
		} finally {
			drainingRef.current = false;
			if (synced > 0) {
				setSyncedCount(synced);
			}
		}
	}, []);

	useEffect(() => {
		const handleOnline = (): void => {
			setOffline(false);
			void drain();
		};
		const handleOffline = (): void => {
			setOffline(true);
		};
		window.addEventListener("online", handleOnline);
		window.addEventListener("offline", handleOffline);
		return () => {
			window.removeEventListener("online", handleOnline);
			window.removeEventListener("offline", handleOffline);
		};
	}, [drain]);

	const enqueue = useCallback(
		(q: Omit<QueuedVerdict, "queuedAt">): void => {
			queueRef.current.push({ ...q, queuedAt: Date.now() });
			setQueueLength(queueRef.current.length);
			if (!offline && readOnline()) {
				void drain();
			}
		},
		[offline, drain],
	);

	const dismissSyncedToast = useCallback((): void => {
		setSyncedCount(null);
	}, []);

	return { offline, queueLength, syncedCount, enqueue, dismissSyncedToast };
}
