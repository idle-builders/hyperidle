/**
 * AM4 design — descriptor-driven presentation mapping.
 *
 * The ONLY place that interprets a descriptor for the UI. Maps purely off
 * `discovery.state` and `authAction.kind` — there is NO `type === "codex"`
 * branch anywhere. This is the hard AM4 contract embodied: every backend row
 * renders from these generic mappers regardless of family.
 *
 * Design artifact. Builder lifts this into the production surface (and the
 * readiness→Status half belongs with the design-system status-mapping family).
 */

import type { Status } from "@hyperidle/design-system";
import type {
	HarnessCapabilityDescriptor,
	HarnessReadinessState,
} from "@hyperidle/shared";

/** Readiness → StatusChip status + verbatim chip label. */
export function readinessToStatus(state: HarnessReadinessState): {
	status: Status | "unknown";
	label: string;
} {
	switch (state) {
		case "ready":
			return { status: "healthy", label: "Ready" };
		case "unauthenticated":
			return { status: "behind", label: "Sign in needed" };
		case "installed":
			return { status: "behind", label: "Auth unknown" };
		case "missing":
			return { status: "paused", label: "Not installed" };
		case "unavailable":
			return { status: "unknown", label: "Unavailable" };
		default:
			return { status: "unknown", label: "Unknown" };
	}
}

/** Access mode → human framing of how this backend authenticates. */
export function accessModeLabel(mode: HarnessCapabilityDescriptor["accessMode"]): string {
	switch (mode) {
		case "api-gateway":
			return "API key";
		case "provider-subscription-cli":
			return "CLI sign-in";
		case "external-byo":
			return "External";
		default:
			return mode;
	}
}

/**
 * Whether this descriptor has an actionable next step the user can take here.
 * `none` authAction and `unavailable`/`ready` states have no in-app CTA.
 */
export function hasActionableNextStep(d: HarnessCapabilityDescriptor): boolean {
	if (d.authAction.kind === "none") return false;
	return d.discovery.state === "unauthenticated" || d.discovery.state === "installed";
}

/**
 * Whether to render the non-interactive "Enabled" indication.
 *
 * Only `ready` backends are "enabled" — and the indication is non-interactive,
 * never a flippable switch: nothing in the runtime consumes an on/off flag
 * (`AdapterPool.select()` gates on capacity / modelProviders / harnessType only),
 * so a switch the user could flip would be a control nothing backs. Non-ready
 * states show no indication; their sole affordance is the auth CTA.
 *
 * @lore AM4: derived-from-readiness, NOT a persisted `harness.disabled` key.
 * A persisted disable would be dead state no runtime honors. B1 (persisted
 * per-harness enabled flag) is the follow-up only once a runtime consumer exists.
 * Do not re-add a persisted flag thinking this was an oversight.
 */
export function showsEnabledIndication(d: HarnessCapabilityDescriptor): boolean {
	return d.discovery.state === "ready";
}

/**
 * Whether the capabilities Fold renders at all. Descriptor-driven, in one place
 * (parity with the other predicates): a backend has caps to show if it declares
 * any model OR proves any runtime capability.
 */
export function hasCaps(d: HarnessCapabilityDescriptor): boolean {
	return d.models.length > 0 || provenCapabilities(d).length > 0;
}

/**
 * The PROVEN (true) runtime capabilities, as display labels. Production
 * discovery does NOT run the session probe (AM2 @lore), so real `ready`
 * backends return every runtime cap `false` and this is empty — callers then
 * fall back to `capabilitySummary` ("confirmed after first run") rather than
 * rendering a wall of "No". Only positive, confirmed capabilities are surfaced.
 */
export function provenCapabilities(d: HarnessCapabilityDescriptor): readonly string[] {
	const caps: string[] = [];
	if (d.runtime.fileEditing) caps.push("File editing");
	if (d.runtime.toolUse) caps.push("Tool use");
	if (d.runtime.mcpSupport) caps.push("MCP");
	if (d.runtime.subAgents) caps.push("Sub-agents");
	return caps;
}

/** Render the CLI command as a copyable string, when present. */
export function commandText(d: HarnessCapabilityDescriptor): string | null {
	const cmd = d.authAction.command;
	return cmd && cmd.length > 0 ? cmd.join(" ") : null;
}

/** Short, scannable capability summary line. Falls back to the honest
 * "confirmed after first run" framing when no runtime cap is proven yet (the
 * production shape, since discovery does not run the session probe). */
export function capabilitySummary(d: HarnessCapabilityDescriptor): string {
	const caps = provenCapabilities(d);
	return caps.length > 0 ? caps.join(" · ") : "Capabilities confirmed after first run";
}
