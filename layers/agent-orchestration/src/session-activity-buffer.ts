// In-memory ring buffer for session activity events.
// @lore: activity intentionally not persisted — dial-in view is a live observation aid, not a durable audit log

import type { ActivityEntry } from "@hyperidle/domain-model";
import type { EventBus, SessionEndedEvent, ToolCallRecordedEvent } from "@hyperidle/event-bus";

const MAX_PER_SESSION = 100;

// Eviction delay after session ends (ms). Entries are cleaned up after this window
// to allow late REST fetches to still see the final activity snapshot.
const EVICTION_DELAY_MS = 5 * 60 * 1000; // 5 minutes

export class SessionActivityBuffer {
	private readonly eventBus: EventBus;
	private readonly entries: Map<string, ActivityEntry[]> = new Map();
	private unsubscribers: Array<() => void> = [];
	private evictionTimers: Map<string, ReturnType<typeof setTimeout>> = new Map();

	constructor(eventBus: EventBus) {
		this.eventBus = eventBus;
	}

	/** Subscribe to the EventBus and begin collecting activity. */
	start(): void {
		if (this.unsubscribers.length > 0) return;

		const toolCallHandler = (event: ToolCallRecordedEvent): void => {
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
			if (bucket.length > MAX_PER_SESSION) {
				bucket.splice(0, bucket.length - MAX_PER_SESSION);
			}
		};

		// Schedule eviction 5 min after session ends to allow REST fetch to still see the final snapshot.
		const sessionEndedHandler = (event: SessionEndedEvent): void => {
			const { sessionId } = event;
			const existing = this.evictionTimers.get(sessionId);
			if (existing) clearTimeout(existing);
			const timer = setTimeout(() => {
				this.entries.delete(sessionId);
				this.evictionTimers.delete(sessionId);
			}, EVICTION_DELAY_MS);
			this.evictionTimers.set(sessionId, timer);
		};

		const unsubToolCall = this.eventBus.on("tool_call_recorded", toolCallHandler);
		const unsubSessionEnded = this.eventBus.on("session_ended", sessionEndedHandler);

		this.unsubscribers.push(unsubToolCall, unsubSessionEnded);
	}

	/** Unsubscribe from the EventBus and stop collecting. */
	stop(): void {
		for (const unsub of this.unsubscribers) {
			unsub();
		}
		this.unsubscribers = [];
		for (const timer of this.evictionTimers.values()) {
			clearTimeout(timer);
		}
		this.evictionTimers.clear();
	}

	// @lore: getActivity returns a defensive copy ([...bucket]) — callers cannot mutate the buffer
	getActivity(sessionId: string): ReadonlyArray<ActivityEntry> {
		const bucket = this.entries.get(sessionId);
		return bucket ? [...bucket] : [];
	}
}
