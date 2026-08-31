/**
 * AM4 RED — harness-presentation.ts unit tests (Task 7, AC2/AC3/Contract)
 *
 * Tests all mappers in harness-presentation.ts:
 *  - statusLine(d) per readiness state
 *  - hasActionableNextStep(d) per state
 *  - showsToggle(d): true for ready/installed/unauthenticated, false for missing/unavailable
 *  - isEnabled(d): !discovery.disabled
 *  - provenCapabilities(d): only true runtime caps; empty when all-false
 *  - capabilitySummary(d): "confirmed after first run" when no proven caps
 *  - hasCaps(d): models.length > 0 OR proven caps; false when disabled
 *  - commandText(d): null when no command; joined string when present
 *
 * Two-descriptor structural-equality test (Contract):
 *  - Renders HarnessCard for two structurally-different ready descriptors;
 *    element/class structure is identical (one code path, no per-family branch).
 *
 * FAILS until:
 *  - layers/core-ui/src/settings/harness-presentation.ts is created
 *    (exact exports: statusLine, hasActionableNextStep, showsToggle, isEnabled,
 *     provenCapabilities, capabilitySummary, hasCaps, commandText, readinessToStatus,
 *     accessModeLabel, showsEnabledIndication)
 */

import type { HarnessCapabilityDescriptor } from "@hyperidle/harness-capability";
import { describe, expect, it } from "vitest";
import {
	capabilitySummary,
	commandText,
	hasActionableNextStep,
	hasCaps,
	isEnabled,
	provenCapabilities,
	showsToggle,
	statusLine,
} from "../harness-presentation.js";

// ── Test fixtures ─────────────────────────────────────────────────────────────

function makeDescriptor(
	overrides: Partial<HarnessCapabilityDescriptor> & {
		discoveryExtra?: { disabled?: boolean; authSummary?: string };
	},
): HarnessCapabilityDescriptor & { discovery: { disabled?: boolean; authSummary?: string } } {
	const discoveryExtra = overrides.discoveryExtra ?? {};
	const { discoveryExtra: _ignored, ...rest } = overrides;
	return {
		type: "claude-code",
		name: "Claude Code",
		kind: "local",
		authAction: {
			kind: "native_cli_login",
			label: "Log in to Claude Code",
			command: ["claude", "auth", "login"],
		},
		discovery: {
			state: "ready",
			version: "2.1.178",
			...discoveryExtra,
		},
		models: [
			{
				id: "claude-sonnet-4-6",
				label: "Claude Sonnet 4.6",
				provider: "anthropic",
				selectable: true,
				options: [],
			},
		],
		modelProviders: ["anthropic"],
		...rest,
	};
}

const READY_DESCRIPTOR = makeDescriptor({});

const READY_DISABLED_DESCRIPTOR = makeDescriptor({
	discoveryExtra: { disabled: true, authSummary: undefined },
	discovery: {
		state: "ready",
		version: "2.1.178",
		disabled: true,
		reason: "Turned off by user.",
	} as HarnessCapabilityDescriptor["discovery"] & { disabled?: boolean },
});

const UNAUTHENTICATED_DESCRIPTOR = makeDescriptor({
	discovery: { state: "unauthenticated" },
});

const INSTALLED_DESCRIPTOR = makeDescriptor({
	discovery: { state: "installed" },
});

const MISSING_DESCRIPTOR = makeDescriptor({
	discovery: { state: "missing", reason: "Not installed." },
	authAction: { kind: "native_cli_login", label: "Install", command: ["brew", "install", "codex"] },
});

const UNAVAILABLE_DESCRIPTOR = makeDescriptor({
	type: "cursor-agent",
	name: "Cursor Agent",
	discovery: {
		state: "unavailable",
		reason: "No documented headless CLI surface.",
	},
	authAction: { kind: "none", label: "Configured in Cursor app" },
});

/** A key-accepting harness: ready, no login command, several providers. */
const KEY_ACCEPTING_DESCRIPTOR = makeDescriptor({
	type: "opencode",
	name: "OpenCode",
	authAction: {
		kind: "enter_api_key",
		label: "Enter API key",
		credentialNames: ["openrouter_api_key"],
	},
	discovery: { state: "ready" },
	modelProviders: ["anthropic", "openrouter"],
});

// ── statusLine ────────────────────────────────────────────────────────────────

describe("AM4 harness-presentation — statusLine()", () => {
	it("ready → tone: healthy", () => {
		const sl = statusLine(READY_DESCRIPTOR);
		expect(sl.tone).toBe("healthy");
	});

	it("ready+disabled → tone: unknown, text starts with 'Disabled'", () => {
		const sl = statusLine(READY_DISABLED_DESCRIPTOR);
		expect(sl.tone).toBe("unknown");
		expect(sl.text).toMatch(/^Disabled/i);
	});

	it("unauthenticated → tone: behind", () => {
		const sl = statusLine(UNAUTHENTICATED_DESCRIPTOR);
		expect(sl.tone).toBe("behind");
	});

	it("installed → tone: behind", () => {
		const sl = statusLine(INSTALLED_DESCRIPTOR);
		expect(sl.tone).toBe("behind");
	});

	it("missing → tone: paused", () => {
		const sl = statusLine(MISSING_DESCRIPTOR);
		expect(sl.tone).toBe("paused");
	});

	it("unavailable → tone: unknown", () => {
		const sl = statusLine(UNAVAILABLE_DESCRIPTOR);
		expect(sl.tone).toBe("unknown");
	});

	it("statusLine text is a non-empty string for all states", () => {
		const descriptors = [
			READY_DESCRIPTOR,
			READY_DISABLED_DESCRIPTOR,
			UNAUTHENTICATED_DESCRIPTOR,
			INSTALLED_DESCRIPTOR,
			MISSING_DESCRIPTOR,
			UNAVAILABLE_DESCRIPTOR,
		];
		for (const d of descriptors) {
			const sl = statusLine(d);
			expect(typeof sl.text).toBe("string");
			expect(sl.text.length).toBeGreaterThan(0);
		}
	});
});

// ── hasActionableNextStep ─────────────────────────────────────────────────────

describe("AM4 harness-presentation — hasActionableNextStep()", () => {
	it("true for unauthenticated with native_cli_login", () => {
		expect(hasActionableNextStep(UNAUTHENTICATED_DESCRIPTOR)).toBe(true);
	});

	it("true for installed with native_cli_login", () => {
		expect(hasActionableNextStep(INSTALLED_DESCRIPTOR)).toBe(true);
	});

	it("false for ready (already authenticated)", () => {
		expect(hasActionableNextStep(READY_DESCRIPTOR)).toBe(false);
	});

	it("false for disabled (enable first)", () => {
		expect(hasActionableNextStep(READY_DISABLED_DESCRIPTOR)).toBe(false);
	});

	it("false for unavailable (cursor-agent, kind='none')", () => {
		expect(hasActionableNextStep(UNAVAILABLE_DESCRIPTOR)).toBe(false);
	});

	it("false for missing (authAction.kind !== 'none' but state is 'missing')", () => {
		// missing → no in-app CTA
		expect(hasActionableNextStep(MISSING_DESCRIPTOR)).toBe(false);
	});
});

// ── showsToggle ───────────────────────────────────────────────────────────────

describe("AM4 harness-presentation — showsToggle() (AC2 key contract)", () => {
	it("true for ready", () => {
		expect(showsToggle(READY_DESCRIPTOR)).toBe(true);
	});

	it("true for unauthenticated", () => {
		expect(showsToggle(UNAUTHENTICATED_DESCRIPTOR)).toBe(true);
	});

	it("true for installed", () => {
		expect(showsToggle(INSTALLED_DESCRIPTOR)).toBe(true);
	});

	it("false for missing", () => {
		expect(showsToggle(MISSING_DESCRIPTOR)).toBe(false);
	});

	it("false for unavailable", () => {
		expect(showsToggle(UNAVAILABLE_DESCRIPTOR)).toBe(false);
	});

	// @lore The built-in harness was exempt here: it was the always-present
	// fallback, so disabling it would have left a session with nothing to run on.
	// Every harness is installed by the user now, and every one can be turned off —
	// including a key-accepting one, which has no special standing any more.
	it("true for a ready key-accepting harness (no exemptions left)", () => {
		expect(showsToggle(KEY_ACCEPTING_DESCRIPTOR)).toBe(true);
	});

	it("ready+disabled still shows toggle (toggle is off, but it's visible)", () => {
		// A disabled backend shows the toggle in OFF state — users can re-enable
		expect(showsToggle(READY_DISABLED_DESCRIPTOR)).toBe(true);
	});
});

// ── isEnabled ────────────────────────────────────────────────────────────────

describe("AM4 harness-presentation — isEnabled()", () => {
	it("true when discovery.disabled is absent/false", () => {
		expect(isEnabled(READY_DESCRIPTOR)).toBe(true);
	});

	it("false when discovery.disabled is true", () => {
		expect(isEnabled(READY_DISABLED_DESCRIPTOR)).toBe(false);
	});
});

// ── provenCapabilities ────────────────────────────────────────────────────────

describe("AM4 harness-presentation — provenCapabilities()", () => {
	it("returns empty array (runtime caps removed from descriptor)", () => {
		expect(provenCapabilities(READY_DESCRIPTOR)).toHaveLength(0);
		expect(provenCapabilities(KEY_ACCEPTING_DESCRIPTOR)).toHaveLength(0);
	});
});

// ── capabilitySummary ─────────────────────────────────────────────────────────

describe("AM4 harness-presentation — capabilitySummary() (AC2-production-shape)", () => {
	it("returns 'confirmed after first run' when no caps proven (production shape)", () => {
		// This is the AC2-production-shape requirement (WARNING 4)
		const summary = capabilitySummary(READY_DESCRIPTOR);
		expect(summary).toMatch(/confirmed after first run/i);
	});

	it("always returns 'confirmed after first run' (runtime caps removed from descriptor)", () => {
		// provenCapabilities() always returns [] now — capabilitySummary always uses fallback
		const summary = capabilitySummary(KEY_ACCEPTING_DESCRIPTOR);
		expect(summary).toMatch(/confirmed after first run/i);
	});
});

// ── hasCaps ───────────────────────────────────────────────────────────────────

describe("AM4 harness-presentation — hasCaps()", () => {
	it("true when descriptor has models (even with all-false runtime caps)", () => {
		// Production shape: models declared, caps all-false → fold still visible
		expect(hasCaps(READY_DESCRIPTOR)).toBe(true);
	});

	it("false when disabled (fold hidden while disabled)", () => {
		expect(hasCaps(READY_DISABLED_DESCRIPTOR)).toBe(false);
	});

	it("false when no models (proven caps are always empty now)", () => {
		const noModelDescriptor = makeDescriptor({
			models: [],
		});
		expect(hasCaps(noModelDescriptor)).toBe(false);
	});
});

// ── commandText ───────────────────────────────────────────────────────────────

describe("AM4 harness-presentation — commandText()", () => {
	it("returns joined command string for CLI harnesses", () => {
		const text = commandText(READY_DESCRIPTOR);
		expect(text).toBe("claude auth login");
	});

	it("returns null for enter_api_key auth (no command)", () => {
		expect(commandText(KEY_ACCEPTING_DESCRIPTOR)).toBeNull();
	});

	it("returns null for authAction.kind='none'", () => {
		expect(commandText(UNAVAILABLE_DESCRIPTOR)).toBeNull();
	});
});

// ── Contract: descriptor-driven, no per-family branching ─────────────────────

describe("AM4 Contract — descriptor-driven / no per-backend branching (two-descriptor structural test)", () => {
	/**
	 * Two structurally-different `ready` descriptors (a key-accepting harness vs a login-only CLI).
	 * The mapper functions produce the same OUTPUT STRUCTURE from the same INPUT SHAPE —
	 * proving one code path handles both without branching on family type.
	 *
	 * Concretely: both have discovery.state="ready", discovery.disabled=false, authAction.kind≠"none"
	 * → showsToggle and hasActionableNextStep must return the same boolean values
	 *   (both driven from state/disabled/kind, not from type === "codex" etc.)
	 *
	 * The ESLint no-restricted-syntax rule (task 12) guards the code; this test guards the runtime.
	 */
	it("showsToggle returns the same boolean for two structurally different ready descriptors", () => {
		const claudeCodeReady = makeDescriptor({ type: "claude-code" });
		const codexReady = makeDescriptor({
			type: "codex",
			name: "Codex",
			authAction: {
				kind: "native_cli_login",
				label: "Log in to Codex",
				command: ["codex", "login"],
			},
		});

		// Both are ready → showsToggle must be the same for both
		expect(showsToggle(claudeCodeReady)).toBe(showsToggle(codexReady));
	});

	it("hasActionableNextStep returns same boolean for two ready descriptors", () => {
		const claudeCodeReady = makeDescriptor({ type: "claude-code" });
		const codexReady = makeDescriptor({
			type: "codex",
			name: "Codex",
			authAction: {
				kind: "native_cli_login",
				label: "Log in to Codex",
				command: ["codex", "login"],
			},
		});

		// Both ready → same hasActionableNextStep
		expect(hasActionableNextStep(claudeCodeReady)).toBe(hasActionableNextStep(codexReady));
	});

	it("capabilitySummary returns same result for two ready all-caps-false descriptors", () => {
		const claudeCodeReady = makeDescriptor({ type: "claude-code" });
		const opencodeReady = makeDescriptor({
			type: "opencode",
			name: "OpenCode",
			authAction: {
				kind: "native_cli_login",
				label: "Log in to OpenCode",
				command: ["opencode", "providers", "login"],
			},
		});

		// Both all-caps-false → "confirmed after first run" for both
		expect(capabilitySummary(claudeCodeReady)).toBe(capabilitySummary(opencodeReady));
	});

	it("statusLine.tone follows discovery.state not type (same state → same tone)", () => {
		const claudeCodeUnauth = makeDescriptor({
			type: "claude-code",
			discovery: { state: "unauthenticated" },
		});
		const codexUnauth = makeDescriptor({
			type: "codex",
			name: "Codex",
			discovery: { state: "unauthenticated" },
			authAction: {
				kind: "native_cli_login",
				label: "Log in to Codex",
				command: ["codex", "login"],
			},
		});

		// Same state → same tone regardless of type
		expect(statusLine(claudeCodeUnauth).tone).toBe(statusLine(codexUnauth).tone);
	});
});
