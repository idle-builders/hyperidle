/**
 * Harness capability reader — the narrow read-only view core-api routes hold over
 * the harness adapter pool.
 *
 * Moved from `@hyperidle/harness-protocol` (AU44 b5): this module's every namer
 * is core-api. The four one-line forwarders (registeredHarnessCount, workerConnections,
 * harnessCapabilityDescriptors, refreshHarnessDiscoveries) had zero callers and are
 * deleted outright. The two live functions (harnessCapabilitiesForType,
 * harnessRegistrationMeta) are retained here — each has exactly one calling file in
 * core-api.
 *
 * @lore AU26 A2: HarnessCapabilityReader is declared STRUCTURALLY so core-api never
 * imports harness-registry (execution layer). The pool satisfies it by structural
 * subtyping — harness-capability-read-model.test.ts holds the anti-drift assertion.
 */

import type { HarnessCapabilityDescriptor } from "@hyperidle/harness-capability";
import type { AdapterMeta, HarnessCapabilities } from "@hyperidle/harness-protocol";

export interface HarnessCapabilityFilter {
	readonly type?: string;
	readonly kind?: "local" | "remote";
	readonly includeKnownMissing?: boolean;
}

/**
 * Read-only handle over the harness adapter pool. Core-api routes type their pool
 * parameter as this interface so they structurally cannot name execution/selection
 * methods regardless of what the concrete AdapterPool exposes.
 */
export interface HarnessCapabilityReader {
	readonly size: number;
	describe(options?: HarnessCapabilityFilter): HarnessCapabilityDescriptor[];
	refresh(): Promise<void>;
}

/**
 * Capabilities for the first adapter matching harnessType. Returns null when the
 * type is not registered. Single caller: agent-profile.ts.
 */
export function harnessCapabilitiesForType(
	reader: HarnessCapabilityReader | undefined,
	harnessType: string | null,
): HarnessCapabilities | null {
	const descriptor = reader?.describe({
		type: harnessType ?? undefined,
		includeKnownMissing: false,
	})[0];
	if (!descriptor) return null;
	return {
		preCompactionTrigger: false,
		subAgents: false,
		mcpSupport: false,
		modelProviders: [],
		returnEnforcement: descriptor.returnEnforcement ?? "none",
	};
}

/** Registration metadata for the first adapter matching harnessType. Single caller: validate-agent-config.ts. */
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
