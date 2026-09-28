import { createLogger } from "@hyperidle/diagnostics";
import type {
	DomainEvent,
	EventByType,
	EventHandler,
	EventType,
	WildcardHandler,
} from "./events.js";

/**
 * Module-scoped logger used to surface handler failures. Captured via
 * `vi.mock("@hyperidle/diagnostics", ...)` in tests — vitest hoists vi.mock
 * calls before module initialization, so the mock is in place when this runs.
 */
const logger = createLogger({ pkg: "event-bus" });

/**
 * In-process pub/sub event bus with per-stream ordering and type-safe subscriptions.
 *
 * Events are delivered synchronously — emit() returns only after all handlers
 * have been called. This guarantees at-least-once delivery when emit() is called
 * after database write durability.
 *
 * @lore: one throwing handler must not abort delivery — a bad subscriber silently breaks every handler after it; try/catch+log limits blast radius
 */
export class EventBus {
	private readonly handlers = new Map<EventType, Set<EventHandler<EventType>>>();
	private readonly wildcardHandlers = new Set<WildcardHandler>();

	/**
	 * Subscribe to a specific event type or wildcard ('*').
	 * Returns an unsubscribe function for convenience.
	 */
	on<T extends EventType>(type: T, handler: EventHandler<T>): () => void;
	on(type: "*", handler: WildcardHandler): () => void;
	on(type: EventType | "*", handler: EventHandler<EventType> | WildcardHandler): () => void {
		if (type === "*") {
			this.wildcardHandlers.add(handler as WildcardHandler);
			return () => this.off("*", handler as WildcardHandler);
		}

		let set = this.handlers.get(type);
		if (!set) {
			set = new Set();
			this.handlers.set(type, set);
		}
		set.add(handler as EventHandler<EventType>);
		return () => this.off(type, handler as EventHandler<EventType>);
	}

	/**
	 * Unsubscribe a handler from a specific event type or wildcard.
	 * Internal helper — callers use the unsubscribe function returned by `on`.
	 */
	private off<T extends EventType>(type: T, handler: EventHandler<T>): void;
	private off(type: "*", handler: WildcardHandler): void;
	private off(type: EventType | "*", handler: EventHandler<EventType> | WildcardHandler): void {
		if (type === "*") {
			this.wildcardHandlers.delete(handler as WildcardHandler);
			return;
		}

		const set = this.handlers.get(type);
		if (set) {
			set.delete(handler as EventHandler<EventType>);
			if (set.size === 0) {
				this.handlers.delete(type);
			}
		}
	}

	/**
	 * Emit an event synchronously to all matching subscribers.
	 *
	 * Delivery order: type-specific handlers first (insertion order),
	 * then wildcard handlers (insertion order).
	 *
	 * This method is synchronous to support at-least-once delivery semantics:
	 * call emit() after database write durability to guarantee delivery.
	 */
	emit<T extends EventType>(event: EventByType<T>): void {
		const set = this.handlers.get(event.type);
		if (set) {
			for (const handler of set) {
				try {
					// Handlers stored as EventHandler<EventType> — map must hold a uniform type. Safe to call with
					// `event as DomainEvent`: the handler accepts DomainEvent. Casting event (not handler) avoids
					// the overlap check failure that casting to EventHandler<T> would trigger.
					(handler as (e: DomainEvent) => void)(event as DomainEvent);
				} catch (err) {
					logger.error("event handler threw", {
						type: event.type,
						error: err instanceof Error ? err.message : String(err),
					});
				}
			}
		}

		for (const handler of this.wildcardHandlers) {
			try {
				handler(event);
			} catch (err) {
				logger.error("wildcard event handler threw", {
					type: event.type,
					error: err instanceof Error ? err.message : String(err),
				});
			}
		}
	}
}
