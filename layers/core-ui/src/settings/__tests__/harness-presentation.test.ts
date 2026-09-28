/**
 * Harness presentation mappers — unit tests.
 *
 * Tests the live mappers in harness-presentation.ts:
 *  - statusLine(d) per readiness state
 *  - provenCapabilities(d): always empty (runtime caps removed from descriptor)
 *  - hasCaps(d): models.length > 0 OR proven caps; false when disabled
 *
 * Two-descriptor structural-equality test (Contract):
 *  - Same state → same output structure regardless of harness type.
 */

import type { HarnessCapabilityDescriptor } from "@hyperidle/harness-capability";
import { describe, expect, it } from "vitest";
import { hasCaps, provenCapabilities, statusLine } from "../harness-presentation.js";

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

describe("harness-presentation — statusLine()", () => {
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

// ── provenCapabilities ────────────────────────────────────────────────────────

describe("harness-presentation — provenCapabilities()", () => {
	it("returns empty array (runtime caps removed from descriptor)", () => {
		expect(provenCapabilities(READY_DESCRIPTOR)).toHaveLength(0);
		expect(provenCapabilities(KEY_ACCEPTING_DESCRIPTOR)).toHaveLength(0);
	});
});

// ── hasCaps ───────────────────────────────────────────────────────────────────

describe("harness-presentation — hasCaps()", () => {
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

// ── Contract: descriptor-driven, no per-family branching ─────────────────────

describe("Contract — descriptor-driven / no per-backend branching (two-descriptor structural test)", () => {
	/**
	 * Two structurally-different `ready` descriptors (a key-accepting harness vs a login-only CLI).
	 * The mapper functions produce the same OUTPUT STRUCTURE from the same INPUT SHAPE —
	 * proving one code path handles both without branching on family type.
	 */
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
