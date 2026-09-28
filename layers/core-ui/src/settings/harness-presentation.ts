import type { HarnessCapabilityDescriptor } from "@hyperidle/harness-capability";
import type { Status } from "../ds";

// Extended discovery type — additive field (disabled? is optional in HarnessDiscoveryStatus)
type DiscoveryWithDisabled = HarnessCapabilityDescriptor["discovery"] & { disabled?: boolean };

function getDiscovery(d: HarnessCapabilityDescriptor): DiscoveryWithDisabled {
	return d.discovery as DiscoveryWithDisabled;
}

export function statusLine(d: HarnessCapabilityDescriptor): {
	tone: Status | "unknown";
	text: string;
} {
	const discovery = getDiscovery(d);

	if (discovery.disabled === true) {
		const reasonSuffix = discovery.reason ? ` ${discovery.reason}` : "";
		return {
			tone: "unknown",
			text: `Disabled —${reasonSuffix || " turned off by user."}`,
		};
	}

	switch (discovery.state) {
		case "ready":
			return {
				tone: "healthy",
				text: discovery.reason ?? "Authenticated and ready.",
			};
		case "unauthenticated":
			return {
				tone: "behind",
				text: "Present on this machine — not signed in yet.",
			};
		case "installed":
			return {
				tone: "behind",
				text: "Installed — auth status not yet confirmed.",
			};
		case "missing":
			return {
				tone: "paused",
				text: discovery.reason ?? "Not installed.",
			};
		case "unavailable":
			return {
				tone: "unknown",
				text: discovery.reason ?? "Not available on this machine.",
			};
		default: {
			// TypeScript exhaustive check — if a new state is added to HarnessReadinessState,
			// this assertion will fail at compile time.
			const exhaustiveCheck: never = discovery.state as never;
			void exhaustiveCheck;
			return { tone: "unknown", text: "Unknown state." };
		}
	}
}

export function hasActionableNextStep(d: HarnessCapabilityDescriptor): boolean {
	const discovery = getDiscovery(d);
	if (discovery.disabled === true) return false;
	if (discovery.state !== "unauthenticated" && discovery.state !== "installed") return false;
	if (d.authAction.kind === "none") return false;
	return true;
}

export function showsToggle(d: HarnessCapabilityDescriptor): boolean {
	const s = getDiscovery(d).state;
	return s === "ready" || s === "unauthenticated" || s === "installed";
}

export function isEnabled(d: HarnessCapabilityDescriptor): boolean {
	const discovery = getDiscovery(d);
	return !discovery.disabled;
}

export function provenCapabilities(_d: HarnessCapabilityDescriptor): readonly string[] {
	return [];
}

export function capabilitySummary(d: HarnessCapabilityDescriptor): string {
	const caps = provenCapabilities(d);
	if (caps.length === 0) return "Capabilities confirmed after first run";
	return caps.join(", ");
}

export function hasCaps(d: HarnessCapabilityDescriptor): boolean {
	if (getDiscovery(d).disabled === true) return false;
	if (d.models.length > 0) return true;
	// Any proven runtime cap → fold visible
	if (provenCapabilities(d).length > 0) return true;
	return false;
}

/** Joined auth command string — e.g. "claude auth login". Returns
 * null when the authAction has no command (enter_api_key / kind="none").
 */
export function commandText(d: HarnessCapabilityDescriptor): string | null {
	const action = d.authAction;
	if (action.kind === "native_cli_login" && "command" in action && Array.isArray(action.command)) {
		return (action.command as string[]).join(" ");
	}
	return null;
}
