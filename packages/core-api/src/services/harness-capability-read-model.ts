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
 * @lore AU16: replaces the hand-verified DESCRIPTOR_READ_ALLOWLIST in
 * scripts/au11-runtime-ownership-guard.ts. Two independent facts now hold:
 * (1) the guard enforces the import boundary — no core route imports
 * `harness/`/`mcp/` (this file is the only sanctioned core→agent edge for
 * capability reads); (2) `HarnessCapabilityReader` is a `Pick`-narrowed view
 * of `AdapterPool` that structurally omits every execution/selection/
 * registration/lifecycle method — a route holding this handle type cannot
 * name `select()`/`register()`/`unregister()`/etc. regardless of how many
 * forwarders exist. See scripts/au11-runtime-ownership-guard.ts's AU16 doc
 * comment for the guard-side half of this guarantee.
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

import type { AdapterInfo, AdapterMeta, AdapterPool } from "@hyperidle/harness-registry";
import type { HarnessCapabilities, HarnessCapabilityDescriptor } from "@hyperidle/shared";

/**
 * Read-only handle over the harness adapter pool. Exactly the
 * capability / registration / worker-connection queries core routes perform —
 * no execution, selection, registration, or lifecycle surface. AdapterPool
 * satisfies this structurally, so app.ts passes the concrete pool unchanged.
 *
 * @lore AU16: derived from AdapterPool via Pick so it cannot silently drift to
 * include an execution method — widening the surface requires editing this key
 * list, a visible reviewable act. THIS Pick narrowing IS the structural
 * guarantee that replaces the hand-verified DESCRIPTOR_READ_ALLOWLIST: a route
 * whose pool handle is typed HarnessCapabilityReader cannot name select()/
 * register()/execute() regardless of how many forwarders exist.
 */
export type HarnessCapabilityReader = Pick<
	AdapterPool,
	| "size"
	| "list"
	| "getCapabilitiesByType"
	| "getRegistrationMetaByType"
	| "listCapabilityDescriptors"
	| "refreshDiscoveries"
>;

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
	return reader?.getCapabilitiesByType(harnessType) ?? null;
}

/** Registration metadata for the first adapter matching harnessType. */
export function harnessRegistrationMeta(
	reader: HarnessCapabilityReader,
	harnessType: string,
): AdapterMeta | null {
	return reader.getRegistrationMetaByType(harnessType);
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
	return reader?.listCapabilityDescriptors(options) ?? [];
}

/** Re-run local harness discovery and replace the discovery snapshot. */
export function refreshHarnessDiscoveries(reader: HarnessCapabilityReader): Promise<void> {
	return reader.refreshDiscoveries();
}
