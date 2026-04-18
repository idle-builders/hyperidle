/**
 * Debounce utility that collects file change events and fires after a quiet period.
 * Multiple events for the same path within the window are collapsed.
 */

export interface FileChangeEvent {
	path: string;
	type: "create" | "modify" | "delete";
}

export interface DebouncedBatch {
	/** Deduplicated changes (last event per path wins). */
	changes: FileChangeEvent[];
}

export type BatchHandler = (batch: DebouncedBatch) => void | Promise<void>;

export interface DebouncedWatcher {
	push(event: FileChangeEvent): void;
	flush(): Promise<void>;
	destroy(): void;
}

/**
 * Creates a debounced watcher that collects file change events and invokes
 * the handler after `quietMs` milliseconds of inactivity.
 *
 * Events for the same path are collapsed: only the last event type wins.
 */
export function createDebouncedWatcher(handler: BatchHandler, quietMs: number): DebouncedWatcher {
	const pending = new Map<string, FileChangeEvent>();
	let timer: ReturnType<typeof setTimeout> | null = null;
	let destroyed = false;

	function fireBatch(): Promise<void> {
		if (pending.size === 0) return Promise.resolve();
		const changes = Array.from(pending.values());
		pending.clear();
		const result = handler({ changes });
		return result instanceof Promise ? result : Promise.resolve();
	}

	function resetTimer(): void {
		if (timer !== null) {
			clearTimeout(timer);
		}
		timer = setTimeout(() => {
			timer = null;
			void fireBatch();
		}, quietMs);
	}

	return {
		push(event: FileChangeEvent): void {
			if (destroyed) return;
			pending.set(event.path, event);
			resetTimer();
		},

		async flush(): Promise<void> {
			if (timer !== null) {
				clearTimeout(timer);
				timer = null;
			}
			await fireBatch();
		},

		destroy(): void {
			destroyed = true;
			if (timer !== null) {
				clearTimeout(timer);
				timer = null;
			}
			pending.clear();
		},
	};
}
