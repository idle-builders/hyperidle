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

/** A backend can be enabled/toggled only once it is ready. */
export function isEnableable(d: HarnessCapabilityDescriptor): boolean {
	return d.discovery.state === "ready";
}

/** Install/unavailable backends offer no toggle at all. */
export function showsToggle(d: HarnessCapabilityDescriptor): boolean {
	return d.discovery.state === "ready" || d.discovery.state === "unauthenticated";
}

/** Render the CLI command as a copyable string, when present. */
export function commandText(d: HarnessCapabilityDescriptor): string | null {
	const cmd = d.authAction.command;
	return cmd && cmd.length > 0 ? cmd.join(" ") : null;
}

/** Short, scannable capability summary line from the runtime caps (reference). */
export function capabilitySummary(d: HarnessCapabilityDescriptor): string {
	const caps: string[] = [];
	if (d.runtime.fileEditing) caps.push("File editing");
	if (d.runtime.toolUse) caps.push("Tool use");
	if (d.runtime.mcpSupport) caps.push("MCP");
	if (d.runtime.subAgents) caps.push("Sub-agents");
	return caps.length > 0 ? caps.join(" · ") : "Capabilities confirmed after first run";
}
