// @lore: HarnessCapabilityReader structural — core-api never imports harness-registry; pool satisfies by structural subtyping; anti-drift: read-model.test.ts

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
