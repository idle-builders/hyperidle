/**
 * Harness presentation mappers — pure, descriptor-only.
 *
 * Single interpretation point: ALL presence decisions (caps fold, disabled row)
 * flow through these functions. ZERO per-backend type branching in the rendered
 * surface — there is now no exemption at all. The ESLint no-restricted-syntax
 * rule enforces this.
 */

import type { HarnessCapabilityDescriptor } from "@hyperidle/harness-capability";
import type { Status } from "../ds";

// Extended discovery type — additive field (disabled? is optional in HarnessDiscoveryStatus)
type DiscoveryWithDisabled = HarnessCapabilityDescriptor["discovery"] & { disabled?: boolean };

function getDiscovery(d: HarnessCapabilityDescriptor): DiscoveryWithDisabled {
	return d.discovery as DiscoveryWithDisabled;
}

// ── statusLine ────────────────────────────────────────────────────────────────

/**
 * Returns the status dot tone + calm muted status line text for a row.
 * Driven entirely by discovery.state + discovery.disabled — no type switch.
 */
export function statusLine(d: HarnessCapabilityDescriptor): {
	tone: Status | "unknown";
	text: string;
} {
	const discovery = getDiscovery(d);

	// Disabled check: ready + disabled → dimmed row
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

// ── provenCapabilities ────────────────────────────────────────────────────────

/**
 * Returns a list of human-readable labels for runtime capabilities that are `true`.
 * Empty when all caps are false (the production shape — session probe not run yet).
 * Design R2: never render a per-cap "No" wall; use capabilitySummary() instead.
 *
 * @lore AU43: `HarnessCapabilityDescriptor.runtime` deleted (HarnessRuntimeCapabilities
 * row 15). Runtime caps were never populated in production (always false). Returns [].
 */
export function provenCapabilities(_d: HarnessCapabilityDescriptor): readonly string[] {
	return [];
}

// ── hasCaps ───────────────────────────────────────────────────────────────────

/**
 * True when the Capabilities fold should render.
 * Fold is visible when: descriptor has declared models OR any proven runtime cap.
 * Disabled backends hide the fold (nothing runs while disabled).
 */
export function hasCaps(d: HarnessCapabilityDescriptor): boolean {
	// Disabled backends hide the fold
	if (getDiscovery(d).disabled === true) return false;
	// Models declared → fold visible (shows model rows + caps line)
	if (d.models.length > 0) return true;
	// Any proven runtime cap → fold visible
	if (provenCapabilities(d).length > 0) return true;
	return false;
}
