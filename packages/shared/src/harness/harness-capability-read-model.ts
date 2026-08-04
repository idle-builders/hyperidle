/**
 * AU16 — harness/worker capability read-model.
 *
 * Agent-owned boundary module (sits in `services/`, the established home for
 * AU9/AU11 agent-owned files) exposing the exact 6 read-only queries core
 * routes perform against the harness adapter pool: registered-adapter count,
 * worker connection list, per-type capabilities, per-type registration
 * metadata, capability descriptors, and discovery refresh. No execution,
 * selection, or registration surface — see `HarnessCapabilityReader` below.
 *
 * @lore AU16: replaces the hand-verified DESCRIPTOR_READ_ALLOWLIST originally
 * in `scripts/au11-runtime-ownership-guard.ts` (retired AU19 Increment 5 item
 * 4: vacuous once `packages/server` was dissolved — the guard's own scan root
 * no longer existed). Two independent facts now hold: (1) the import boundary
 * is enforced by `scripts/execution-boundary-guard.ts` (Mechanism B) — no
 * `core-api` file imports `harness-registry`/`mcp-provider` raw (this file is
 * the only sanctioned core→agent edge for capability reads); (2)
 * `HarnessCapabilityReader` is a `Pick`-narrowed view of `AdapterPool` that
 * structurally omits every execution/selection/registration/lifecycle
 * method — a route holding this handle type cannot name
 * `select()`/`register()`/`unregister()`/etc. regardless of how many
 * forwarders exist.
 *
 * @lore AU19 Increment 4 (§6 finding resolution): architecture.md §6 flagged
 * "if it reads a DB table it violates zero-DB-execution → then it splits:
 * the projection storage is core-api, the capability descriptors are
 * execution." Verified at migration: this file has ZERO `@hyperidle/db`
 * import — its only state is the in-memory `AdapterPool` (agent-execution,
 * `harness-registry`), which itself has zero DB access. The conditional
 * split therefore does not fire; no split needed. This file stays exactly
 * where it was (core-api-side composition, `packages/server/src/services/`)
 * as the sanctioned core→agent-execution capability-READ boundary — routes
 * never import `@hyperidle/harness-registry` directly, only this narrow,
 * `Pick`-derived reader (AU16's own guarantee, unchanged). `AdapterPool`'s
 * concrete instance is still Application-injected (`app.ts`'s
 * `options.adapterPool`), same as before this migration.
 */

import type { AdapterInfo, AdapterMeta, HarnessCapabilities } from "./harness-adapter.js";
import type { HarnessCapabilityDescriptor } from "./harness-capability-descriptor.js";

/**
 * @lore AU26 A2: moved from `packages/core-api/src/services/`. Its readers land on
 * BOTH sides of the boundary after this WP (`routes/connections.ts` follows
 * connections to the orchestration app; `agent-profile`/`teams-routes`/`agents`/
 * `users` stay core), and Mechanism B forbids the orchestration side importing a
 * core-api module. Six stateless forwarders over an injected handle — no table, no
 * lifecycle, no domain — so `shared` is where it belongs.
 *
 * @lore AU26 A2: `HarnessCapabilityReader` is now declared STRUCTURALLY rather than
 * as `Pick<AdapterPool, …>`: `shared` cannot import `@hyperidle/harness-registry`
 * (harness-registry depends on shared — that is the cycle). The anti-drift guarantee
 * the `Pick` provided did not move into the type; it moved into the ASSERTION
 * `const reader: HarnessCapabilityReader = pool` in
 * `core-api/src/services/__tests__/harness-capability-read-model.test.ts`, which
 * still holds a REAL `AdapterPool`. Do not delete that assertion — without it,
 * this interface could silently drift away from the pool it is a view of.
 */

/**
 * Read-only handle over the harness adapter pool. Exactly the
 * capability / registration / worker-connection queries core routes perform —
 * no execution, selection, registration, or lifecycle surface. AdapterPool
 * satisfies this structurally, so app.ts passes the concrete pool unchanged.
 *
 * @lore AU16 (amended AU26 A2): this interface names exactly four members, so it
 * cannot silently grow an execution method — widening it requires editing this
 * declaration, a visible reviewable act. THAT narrowing IS the structural guarantee
 * which replaced the hand-verified DESCRIPTOR_READ_ALLOWLIST: a route whose pool
 * handle is typed `HarnessCapabilityReader` cannot name `select()`/`register()`/
 * `execute()` regardless of how many forwarders exist. It was written as
 * `Pick<AdapterPool, …>` until AU26 A2 moved the module into `shared`, which may not
 * import `harness-registry`; the compile-time link to the real pool now lives in the
 * `const reader: HarnessCapabilityReader = pool` assertion in core-api's test.
 */
export interface HarnessCapabilityFilter {
	readonly type?: string;
	readonly kind?: "local" | "remote";
	readonly includeKnownMissing?: boolean;
}

export interface HarnessCapabilityReader {
	readonly size: number;
	list(): AdapterInfo[];
	describe(options?: HarnessCapabilityFilter): HarnessCapabilityDescriptor[];
	refresh(): Promise<void>;
}

/** Number of registered adapters. Used by resolveHarnessAvailable (agent-profile.ts). */
export function registeredHarnessCount(reader: HarnessCapabilityReader): number {
	return reader.size;
}

/** All registered adapters as AdapterInfo. Used by GET /api/workers. */
export function workerConnections(reader: HarnessCapabilityReader): AdapterInfo[] {
	return reader.list();
}

/**
 * Capabilities for the first adapter matching harnessType (or any adapter when
 * harnessType is null). Optional reader: the only caller that passes a
 * possibly-undefined pool is agent-profile.ts (today
 * `adapterPool?.getCapabilitiesByType(x) ?? null`) — folding the fallback in
 * here keeps one signature per logical read. Renamed from `harnessCapabilities`
 * to avoid colliding with the local `const harnessCapabilities` response key
 * in agent-profile.ts (AC-4 forbids renaming that response shape).
 */
export function harnessCapabilitiesForType(
	reader: HarnessCapabilityReader | undefined,
	harnessType: string | null,
): HarnessCapabilities | null {
	const descriptor = reader?.describe({
		type: harnessType ?? undefined,
		includeKnownMissing: false,
	})[0];
	return descriptor
		? { ...descriptor.runtime, returnEnforcement: descriptor.returnEnforcement ?? "none" }
		: null;
}

/** Registration metadata for the first adapter matching harnessType. */
export function harnessRegistrationMeta(
	reader: HarnessCapabilityReader,
	harnessType: string,
): AdapterMeta | null {
	const descriptor = reader.describe({ type: harnessType, includeKnownMissing: false })[0];
	return descriptor
		? {
				name: descriptor.name,
				kind: descriptor.kind,
				type: descriptor.type,
				modelProviders: descriptor.modelProviders,
				maxConcurrent: 1,
			}
		: null;
}

/**
 * Capability descriptors for all registered harness types (plus known-missing
 * descriptors, per options). Optional reader: the only caller that passes a
 * possibly-undefined pool is connections.ts (today
 * `adapterPool?.listCapabilityDescriptors() ?? []`) — same one-signature
 * rationale as harnessCapabilitiesForType.
 */
export function harnessCapabilityDescriptors(
	reader: HarnessCapabilityReader | undefined,
	options?: { readonly includeKnownMissing?: boolean },
): HarnessCapabilityDescriptor[] {
	return reader?.describe(options) ?? [];
}

/** Re-run local harness discovery and replace the discovery snapshot. */
export function refreshHarnessDiscoveries(reader: HarnessCapabilityReader): Promise<void> {
	return reader.refresh();
}
