import type { EventByType, EventHandler, EventType, WildcardHandler } from "./events.js";

/**
 * In-process pub/sub event bus with per-stream ordering and type-safe subscriptions.
 *
 * Events are delivered synchronously — emit() returns only after all handlers
 * have been called. This guarantees at-least-once delivery when emit() is called
 * after database write durability.
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
	 */
	off<T extends EventType>(type: T, handler: EventHandler<T>): void;
	off(type: "*", handler: WildcardHandler): void;
	off(type: EventType | "*", handler: EventHandler<EventType> | WildcardHandler): void {
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
	 * Subscribe to exactly one occurrence of an event type, then auto-unsubscribe.
	 */
	once<T extends EventType>(type: T, handler: EventHandler<T>): () => void {
		const wrappedHandler = ((event: EventByType<T>): void => {
			this.off(type, wrappedHandler as EventHandler<T>);
			handler(event);
		}) as EventHandler<T>;

		return this.on(type, wrappedHandler);
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
				(handler as EventHandler<T>)(event);
			}
		}

		for (const handler of this.wildcardHandlers) {
			handler(event);
		}
	}
}
