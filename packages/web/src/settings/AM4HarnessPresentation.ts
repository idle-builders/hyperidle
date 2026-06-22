/**
 * AM4 design — descriptor-driven presentation mapping.
 *
 * The ONLY place that interprets a descriptor for the UI. Maps purely off
 * `discovery.state`, `discovery.disabled`, and `authAction.kind` — there is NO
 * `type === "codex"` branch anywhere. Every backend row renders from these
 * generic mappers regardless of family.
 *
 * Design artifact. Builder lifts this into the production surface (and the
 * readiness→status half belongs with the design-system status-mapping family).
 */

import type { Status } from "@hyperidle/design-system";
import type {
	HarnessCapabilityDescriptor,
	HarnessReadinessState,
} from "@hyperidle/shared";

/**
 * The persisted per-harness disable flag.
 *
 * NOTE (design, AM4 R1 reversal): the AM2 descriptor type does not yet carry a
 * `disabled` field. This local shape models the AM4 scope addition (founder
 * review + AC2): a persisted `harness.disabled` setting that `AdapterPool.select()`
 * honors. The builder adds `disabled?: boolean` to the descriptor (or reads the
 * settings key alongside the descriptor); the mappers below read it through this
 * accessor so the story renders the real shape today.
 */
function isDisabled(d: HarnessCapabilityDescriptor): boolean {
	return (d as { discovery: { disabled?: boolean } }).discovery.disabled === true;
}

/**
 * Calm, t3code-aligned status presentation: a tiny status DOT color + a single
 * quiet line of muted sub-text. NOT the loud uppercase StatusChip pill — the
 * reference reads status as calm sub-text, never a shouting chip.
 *
 * `tone` selects the dot color from the same --status-* family StatusChip uses.
 * `text` is the one-line status sentence rendered muted under the name.
 */
export function statusLine(d: HarnessCapabilityDescriptor): {
	tone: Status | "unknown";
	text: string;
} {
	if (isDisabled(d)) {
		return { tone: "unknown", text: `Disabled${disableReason(d)}` };
	}
	switch (d.discovery.state) {
		case "ready":
			return { tone: "healthy", text: authSummary(d) };
		case "unauthenticated":
			return { tone: "behind", text: "Present on this machine — not signed in yet." };
		case "installed":
			return { tone: "behind", text: "Installed — auth status not yet confirmed." };
		case "missing":
			return { tone: "paused", text: d.discovery.reason ?? "Not installed." };
		case "unavailable":
			return { tone: "unknown", text: d.discovery.reason ?? "Unavailable." };
		default:
			return { tone: "unknown", text: "Status unknown." };
	}
}

/** The muted "Authenticated as … · …" line for ready backends, t3code-style. */
function authSummary(d: HarnessCapabilityDescriptor): string {
	const auth = (
		d as { discovery: { authSummary?: string } }
	).discovery.authSummary;
	if (auth && auth.length > 0) return auth;
	return d.discovery.reason ?? "Authenticated.";
}

/** Trailing " — <reason>" for a disabled backend, mirroring the reference copy. */
function disableReason(d: HarnessCapabilityDescriptor): string {
	const reason = d.discovery.reason;
	return reason && reason.length > 0 ? ` — ${reason}` : "";
}

/** Readiness → StatusChip status + verbatim chip label. Retained for any
 * surface that still wants the chip; the row uses `statusLine` instead. */
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
 * `none` authAction and `unavailable`/`ready` states have no in-app CTA. A
 * disabled backend shows no auth CTA — enable it first.
 */
export function hasActionableNextStep(d: HarnessCapabilityDescriptor): boolean {
	if (isDisabled(d)) return false;
	if (d.authAction.kind === "none") return false;
	return d.discovery.state === "unauthenticated" || d.discovery.state === "installed";
}

/**
 * Whether to render the per-row enable/disable Toggle.
 *
 * Descriptor-driven, computed from `discovery.state` — NOT a per-family table.
 * The toggle is shown only for backends that can MEANINGFULLY be enabled or
 * disabled: present-and-runnable families (`ready` / `installed` /
 * `unauthenticated`). A `missing` or `unavailable` backend shows no toggle —
 * there is nothing to disable.
 *
 * @lore AM4 R1 reversal (founder review + AC2): the prior round removed the
 * toggle as dead state. Restored as a REAL control backed by a persisted
 * `harness.disabled` setting that `AdapterPool.select()` honors (a disabled
 * backend is not selected and renders as "Disabled — …"). The flag is not the
 * AM2 descriptor's existing field set — the architecture notes the scope
 * addition (persisted setting + select() honoring it + the POST to set it).
 */
export function showsToggle(d: HarnessCapabilityDescriptor): boolean {
	return (
		d.discovery.state === "ready" ||
		d.discovery.state === "installed" ||
		d.discovery.state === "unauthenticated"
	);
}

/** Whether the toggle reads as ON. A toggleable backend is on unless disabled. */
export function isEnabled(d: HarnessCapabilityDescriptor): boolean {
	return !isDisabled(d);
}

/**
 * @deprecated Variant A only. Superseded by `showsToggle` + `isEnabled` (R1
 * reversal restored a real toggle). Kept so the legacy variant-A scaffold still
 * compiles until the builder deletes A/B per architecture.md task 8.
 */
export function showsEnabledIndication(d: HarnessCapabilityDescriptor): boolean {
	return d.discovery.state === "ready" && isEnabled(d);
}

/**
 * Whether the capabilities Fold renders at all. Descriptor-driven, in one place
 * (parity with the other predicates): a backend has caps to show if it declares
 * any model OR proves any runtime capability. A disabled backend hides the fold
 * (nothing runs while disabled).
 */
export function hasCaps(d: HarnessCapabilityDescriptor): boolean {
	if (isDisabled(d)) return false;
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
