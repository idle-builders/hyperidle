/**
 * Q1 §6.1: In-memory ring buffer for session activity events.
 *
 * Subscribes to `tool_call_recorded` events from the EventBus and stores
 * a bounded number of activity entries per session. The buffer is ephemeral —
 * it is lost on server restart, which is acceptable for a desktop app.
 *
 * @lore Q1: Activity is intentionally not persisted. The dial-in view is a
 * live observation aid, not a durable audit log. A server restart is an
 * exceptional event and users re-opening the dial-in will see a fresh buffer.
 */

import type { EventBus, ToolCallRecordedEvent } from "@hyperidle/shared";

const MAX_PER_SESSION = 100;

export interface ActivityEntry {
	type: "tool_call";
	timestamp: number;
	data: Record<string, unknown>;
}

export class SessionActivityBuffer {
	private readonly eventBus: EventBus;
	private readonly entries: Map<string, ActivityEntry[]> = new Map();
	private unsubscribe: (() => void) | null = null;

	constructor(eventBus: EventBus) {
		this.eventBus = eventBus;
	}

	/** Subscribe to the EventBus and begin collecting activity. */
	start(): void {
		if (this.unsubscribe) return; // already started

		const handler = (event: ToolCallRecordedEvent): void => {
			const { sessionId, toolName, argsSummary, timestamp } = event;
			const entry: ActivityEntry = {
				type: "tool_call",
				timestamp,
				data: { toolName, argsSummary },
			};

			let bucket = this.entries.get(sessionId);
			if (!bucket) {
				bucket = [];
				this.entries.set(sessionId, bucket);
			}
			bucket.push(entry);
			// Evict oldest if over cap (FIFO ring)
			if (bucket.length > MAX_PER_SESSION) {
				bucket.splice(0, bucket.length - MAX_PER_SESSION);
			}
		};

		this.eventBus.on("tool_call_recorded", handler);
		this.unsubscribe = (): void => {
			this.eventBus.off("tool_call_recorded", handler);
		};
	}

	/** Unsubscribe from the EventBus and stop collecting. */
	stop(): void {
		if (this.unsubscribe) {
			this.unsubscribe();
			this.unsubscribe = null;
		}
	}

	/**
	 * Return activity entries for a session in insertion order (oldest first).
	 * Returns an empty array for unknown sessions.
	 */
	getActivity(sessionId: string): ActivityEntry[] {
		return this.entries.get(sessionId) ?? [];
	}
}
