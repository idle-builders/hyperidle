import { describe, expect, test } from "vitest";
import { discoverLocalHarnesses } from "../harness-discovery.js";
import { requireHarness } from "./require-harness.js";

describe("AM2 real harness discovery", () => {
	describe("codex", () => {
		requireHarness("codex");
		test("codex CLI discovery reflects installed/authenticated state", async () => {
			const result = await discoverLocalHarnesses();

			expect(result.codex.state).not.toBe("missing");
			expect(result.codex.version).toMatch(/^codex-cli\s+[\d.]+/);
			expect(["ready", "unauthenticated", "installed"]).toContain(result.codex.state);
			if (result.codex.state === "ready") {
				expect(result.codex.authAction?.kind).toBe("native_cli_login");
			}
		});
	});

	describe("claude", () => {
		requireHarness("claude");
		test("claude CLI discovery reflects installed/authenticated state", async () => {
			const result = await discoverLocalHarnesses();

			expect(result["claude-code"].state).not.toBe("missing");
			expect(result["claude-code"].version?.length).toBeGreaterThan(0);
			expect(["ready", "unauthenticated", "installed"]).toContain(result["claude-code"].state);
		});
	});

	describe("opencode", () => {
		requireHarness("opencode");
		test("opencode CLI discovery reflects installed/authenticated state", async () => {
			const result = await discoverLocalHarnesses();

			expect(result.opencode.state).not.toBe("missing");
			expect(result.opencode.version?.length).toBeGreaterThan(0);
			expect(["ready", "unauthenticated", "installed"]).toContain(result.opencode.state);
		});
	});

	describe("cursor-agent", () => {
		requireHarness("cursor-agent");
		test("cursor-agent discovery reports ready when binary is installed and logged in", async () => {
			const result = await discoverLocalHarnesses();

			expect(["ready", "unauthenticated", "installed"]).toContain(result["cursor-agent"].state);
			if (result["cursor-agent"].state === "ready") {
				expect(result["cursor-agent"].authAction?.kind).toBe("native_cli_login");
				expect(result["cursor-agent"].version).toBeTruthy();
			}
		});
	});

	describe("builtin", () => {
		requireHarness("builtin");
		test("builtin gateway discovery is ready when the builtin key is configured", async () => {
			const result = await discoverLocalHarnesses({ env: process.env });

			// Must be ready — not unauthenticated — because the builtin key IS present.
			expect(result.builtin.state).toBe("ready");
			expect(result.builtin.authAction?.kind).toBe("enter_api_key");

			// The matched credential name must be surfaced in the authAction.
			const credentialNames = result.builtin.authAction?.credentialNames ?? [];
			const recognizedNames = [
				"anthropic_api_key",
				"openai_compatible_api_key",
				"openrouter_api_key",
			];
			expect(credentialNames.some((n: string) => recognizedNames.includes(n))).toBe(true);
		});
	});
});
