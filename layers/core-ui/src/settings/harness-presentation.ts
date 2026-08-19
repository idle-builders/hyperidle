/**
 * AM4: Harness presentation mappers — pure, descriptor-only.
 *
 * Single interpretation point: ALL presence decisions (toggle, auth zone, caps fold,
 * disabled row) flow through these functions. ZERO per-backend type branching in the
 * rendered surface — the only allowed type check is the intentional `builtin` exemption
 * in showsToggle (founder rule: built-in is NOT disableable) and the matching guard in
 * select() (CHANGE 2). The ESLint no-restricted-syntax rule (task 12) enforces this.
 *
 * @lore AM4: showsToggle/isEnabled are real persisted controls backed by
 * server_config.harnessDisabled + the caller-supplied select() disabledTypes gate
 * (AM4 R1 reversal, founder review + AC2). The sole type check is the builtin
 * exemption — intentional, not per-family branching. The ESLint contract rule
 * allows the single "builtin" literal and bans the rest (codex, claude-code, etc.).
 */

import type { Status } from "@hyperidle/design-system";
import type { HarnessCapabilityDescriptor } from "@hyperidle/harness-capability";

// Extended discovery type — AM4 additive field (disabled? is optional in HarnessDiscoveryStatus)
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
			const _: never = discovery.state as never;
			void _;
			return { tone: "unknown", text: "Unknown state." };
		}
	}
}

// ── hasActionableNextStep ─────────────────────────────────────────────────────

/**
 * True when a CTA (auth zone with button + command) should render.
 * Only for unauthenticated/installed states with a non-"none" auth action.
 * Disabled backends suppress the CTA (enable first).
 */
export function hasActionableNextStep(d: HarnessCapabilityDescriptor): boolean {
	const discovery = getDiscovery(d);
	// Disabled: no CTA — enable first
	if (discovery.disabled === true) return false;
	// Only unauthenticated and installed states have actionable CTAs
	if (discovery.state !== "unauthenticated" && discovery.state !== "installed") return false;
	// authAction.kind must be actionable (not "none")
	if (d.authAction.kind === "none") return false;
	return true;
}

// ── showsToggle ───────────────────────────────────────────────────────────────

/**
 * True when an interactive enable/disable Toggle should render on the row.
 * Driven by discovery.state — ready/installed/unauthenticated get a toggle.
 * missing/unavailable show NO toggle (nothing to disable — no ambiguity).
 *
 * The sole type check: "builtin" is NOT disableable (founder rule).
 * This is intentional, not per-family branching — paired with the select()
 * hard-exemption back-stop (CHANGE 2, AM4 architecture Seam 2).
 *
 * @lore AM4: Real persisted control backed by server_config.harnessDisabled +
 * caller-supplied select() disabledTypes gate (R1 reversal, founder review + AC2).
 * The ESLint no-restricted-syntax rule (task 12) allows this one "builtin" literal
 * and bans all other harness-type string comparisons in presentation files.
 */
export function showsToggle(d: HarnessCapabilityDescriptor): boolean {
	// builtin is NOT disableable — the always-present fallback (founder rule)
	if (d.type === "builtin") return false;
	// Only ready, unauthenticated, and installed states have a meaningful toggle
	const s = getDiscovery(d).state;
	return s === "ready" || s === "unauthenticated" || s === "installed";
}

// ── isEnabled ────────────────────────────────────────────────────────────────

/**
 * True when discovery.disabled is absent or false (the enabled state).
 * Controls the Toggle's checked state.
 */
export function isEnabled(d: HarnessCapabilityDescriptor): boolean {
	const discovery = getDiscovery(d);
	return !discovery.disabled;
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

// ── capabilitySummary ─────────────────────────────────────────────────────────

/**
 * Single-line summary for the Capabilities line in the fold.
 * "Capabilities confirmed after first run" when no caps are proven (production shape).
 * Design R2: avoids the "File editing: No / MCP: No" wall-of-no.
 */
export function capabilitySummary(d: HarnessCapabilityDescriptor): string {
	const caps = provenCapabilities(d);
	if (caps.length === 0) return "Capabilities confirmed after first run";
	return caps.join(", ");
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

// ── commandText ───────────────────────────────────────────────────────────────

/**
 * Returns the CLI command text to display in the auth zone.
 * null when the authAction has no command (enter_api_key / kind="none").
 */
export function commandText(d: HarnessCapabilityDescriptor): string | null {
	const action = d.authAction;
	if (action.kind === "native_cli_login" && "command" in action && Array.isArray(action.command)) {
		return (action.command as string[]).join(" ");
	}
	return null;
}
