/**
 * S2: AdapterPool — registry of HarnessAdapter instances (local and remote).
 *
 * Maintains a map of adapter entries keyed by stable ID. select() returns the
 * least-loaded eligible adapter and increments its active session count.
 * release() decrements the count when a session ends.
 */

import type { HarnessAdapter } from "@hyperidle/shared";
import { ClaudeAgentSdkAdapter } from "./claude-agent-sdk-adapter.js";

/** Descriptor for a registered adapter. */
export interface AdapterMeta {
	readonly name: string;
	readonly kind: "local" | "remote";
	readonly modelProviders: readonly string[];
	readonly maxConcurrent: number;
}

/** Public view of a pool entry (used by GET /api/workers). */
export interface AdapterInfo {
	readonly id: string;
	readonly name: string;
	readonly kind: "local" | "remote";
	readonly modelProviders: readonly string[];
	readonly currentLoad: number;
	readonly maxConcurrent: number;
	readonly connectedSince: string;
	/** S4: true when the worker has sent a pause message — skipped by select(). */
	readonly paused: boolean;
}

/** Internal pool entry. */
interface PoolEntry {
	readonly adapter: HarnessAdapter;
	readonly meta: AdapterMeta;
	currentLoad: number;
	/** S4: marks this entry as paused — select() skips paused entries. */
	paused: boolean;
	readonly connectedSince: string;
}

/** Optional requirements for adapter selection. */
export interface SelectRequirements {
	/** If present, only adapters supporting ALL listed providers are eligible. */
	readonly modelProviders?: readonly string[];
}

/** A selected adapter entry (returned from select()). */
export interface SelectedEntry {
	readonly id: string;
	readonly adapter: HarnessAdapter;
	readonly meta: AdapterMeta;
}

export class AdapterPool {
	private readonly entries = new Map<string, PoolEntry>();

	/** Number of registered adapters. */
	get size(): number {
		return this.entries.size;
	}

	/**
	 * Register an adapter with a stable ID and metadata.
	 * Replaces any existing entry with the same ID.
	 */
	register(id: string, adapter: HarnessAdapter, meta: AdapterMeta): void {
		this.entries.set(id, {
			adapter,
			meta,
			currentLoad: 0,
			paused: false,
			connectedSince: new Date().toISOString(),
		});
	}

	/** Remove an adapter from the pool. No-op if ID is unknown. */
	unregister(id: string): void {
		this.entries.delete(id);
	}

	/** List all registered adapters as AdapterInfo (snapshot). */
	list(): AdapterInfo[] {
		return Array.from(this.entries.entries()).map(([id, entry]) => ({
			id,
			name: entry.meta.name,
			kind: entry.meta.kind,
			modelProviders: entry.meta.modelProviders,
			currentLoad: entry.currentLoad,
			maxConcurrent: entry.meta.maxConcurrent,
			connectedSince: entry.connectedSince,
			paused: entry.paused,
		}));
	}

	/**
	 * S4: Mark an adapter as paused — select() will skip it.
	 * No-op if the ID is unknown.
	 */
	pause(id: string): void {
		const entry = this.entries.get(id);
		if (entry) {
			entry.paused = true;
		}
	}

	/**
	 * S4: Clear the paused flag — select() will consider it again.
	 * No-op if the ID is unknown.
	 */
	resume(id: string): void {
		const entry = this.entries.get(id);
		if (entry) {
			entry.paused = false;
		}
	}

	/**
	 * Select the least-loaded eligible adapter and increment its active session count.
	 * Returns null if no eligible adapter with remaining capacity exists.
	 *
	 * @lore S2: "least-loaded" means lowest ratio of currentLoad/maxConcurrent.
	 * Filtering happens first (capacity + modelProviders), then min-load selection.
	 */
	select(requirements?: SelectRequirements): SelectedEntry | null {
		let best: { id: string; entry: PoolEntry } | null = null;

		for (const [id, entry] of this.entries) {
			// S4: skip paused adapters
			if (entry.paused) continue;

			// Capacity filter
			if (entry.currentLoad >= entry.meta.maxConcurrent) continue;

			// modelProviders filter — ALL required providers must be in adapter's list
			if (requirements?.modelProviders) {
				const adapterProviders = entry.meta.modelProviders;
				const allMatch = requirements.modelProviders.every((p) => adapterProviders.includes(p));
				if (!allMatch) continue;
			}

			// Least-loaded selection
			if (best === null || entry.currentLoad < best.entry.currentLoad) {
				best = { id, entry };
			}
		}

		if (best === null) return null;

		best.entry.currentLoad++;
		return { id: best.id, adapter: best.entry.adapter, meta: best.entry.meta };
	}

	/**
	 * Release one session slot for the given adapter ID.
	 * No-op if ID is unknown or load is already 0.
	 */
	release(id: string): void {
		const entry = this.entries.get(id);
		if (!entry) return;
		if (entry.currentLoad > 0) {
			entry.currentLoad--;
		}
	}
}

/**
 * Create an AdapterPool pre-loaded with the local ClaudeAgentSdkAdapter.
 *
 * Used by server-factory to register the server's own execution capability.
 * The pool ID is "local" and kind is "local".
 *
 * @lore S2 AC4: this factory keeps server-factory.ts clean — it just calls
 * createLocalAdapterPool() instead of knowing about ClaudeAgentSdkAdapter
 * internals. Tests can import this helper directly to verify self-registration.
 */
export function createLocalAdapterPool(): AdapterPool {
	const pool = new AdapterPool();
	const adapter = new ClaudeAgentSdkAdapter();
	pool.register("local", adapter, {
		name: "local",
		kind: "local",
		modelProviders: ["anthropic"],
		maxConcurrent: Number.parseInt(process.env.HYPERIDLE_LOCAL_MAX_CONCURRENT ?? "4", 10),
	});
	return pool;
}
