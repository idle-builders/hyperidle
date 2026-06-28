import { describe, expect, test } from "vitest";
import { discoverLocalHarnesses } from "../harness-discovery.js";
import { requireHarness } from "./require-harness.js";

describe("AM2 real harness discovery", () => {
	describe("codex CLI", () => {
		requireHarness("codex");
		test("codex CLI discovery reflects installed/authenticated state", async () => {
			const result = await discoverLocalHarnesses();

			expect(result.codex.state).not.toBe("missing");
			expect(result.codex.version).toMatch(/^codex-cli\s+[\d.]+/);
			expect(["ready", "unauthenticated", "installed"]).toContain(result.codex.state);
			if (result.codex.state === "ready") {
				expect(result.codex.authAction?.kind).toBe("native_cli_login");
				expect(result.codex.runtime?.fileEditing).toBe(true);
			}
		});
	});

	describe("claude CLI", () => {
		requireHarness("claude");
		test("claude CLI discovery reflects installed/authenticated state", async () => {
			const result = await discoverLocalHarnesses();

			expect(result["claude-code"].state).not.toBe("missing");
			expect(result["claude-code"].version?.length).toBeGreaterThan(0);
			expect(["ready", "unauthenticated", "installed"]).toContain(result["claude-code"].state);
		});
	});

	describe("opencode CLI", () => {
		requireHarness("opencode");
		test("opencode CLI discovery reflects installed/authenticated state", async () => {
			const result = await discoverLocalHarnesses();

			expect(result.opencode.state).not.toBe("missing");
			expect(result.opencode.version?.length).toBeGreaterThan(0);
			expect(["ready", "unauthenticated", "installed"]).toContain(result.opencode.state);
		});
	});

	// cursor-agent: inverse assertion — this asserts cursor is non-spawnable/unavailable.
	// Per AR1 plan: convert to plain test (not a requireHarness — it's an assertion-shaped
	// skip, asserting cursor is absent, not gating on cursor presence).
	test(
		"cursor-agent is unavailable when neither cursor-agent nor cursor CLI is present",
		async () => {
			const result = await discoverLocalHarnesses();

			expect(result["cursor-agent"].state).toBe("unavailable");
			expect(result["cursor-agent"].reason).toMatch(/no documented headless local CLI surface/i);
		},
	);

	describe("builtin gateway", () => {
		requireHarness("any-gateway-key");
		test(
			"builtin gateway discovery is ready when any gateway-usable key is present (OPENAI_API_KEY, ANTHROPIC_API_KEY, or OPENROUTER_API_KEY)",
			async () => {
				const result = await discoverLocalHarnesses({ env: process.env });

				// Must be ready — not unauthenticated — because a key IS present
				expect(result.builtin.state).toBe("ready");
				expect(result.builtin.authAction?.kind).toBe("enter_api_key");

				// The matched credential name must be surfaced in the authAction
				// (covers the "openai_compatible_api_key" / OPENAI_API_KEY path)
				const credentialNames = result.builtin.authAction?.credentialNames ?? [];
				// At least one of the recognized credential names is listed
				const recognizedNames = [
					"anthropic_api_key",
					"openai_compatible_api_key",
					"openrouter_api_key",
				];
				expect(credentialNames.some((n) => recognizedNames.includes(n))).toBe(true);
			},
		);
	});
});
