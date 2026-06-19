import { execSync } from "node:child_process";
import { describe, expect, test } from "vitest";
import { discoverLocalHarnesses } from "../harness-discovery.js";

function commandExists(cmd: string): boolean {
	try {
		execSync(`which ${cmd}`, { stdio: "ignore" });
		return true;
	} catch {
		return false;
	}
}

const codexInstalled = commandExists("codex");
const claudeInstalled = commandExists("claude");
const opencodeInstalled = commandExists("opencode");
const cursorInstalled = commandExists("cursor-agent") || commandExists("cursor");
const gatewayKeyConfigured = Boolean(
	process.env.ANTHROPIC_API_KEY ?? process.env.OPENROUTER_API_KEY,
);

describe("AM2 real harness discovery", () => {
	test.skipIf(!codexInstalled)(
		"codex CLI discovery reflects installed/authenticated state",
		async () => {
			const result = await discoverLocalHarnesses();

			expect(result.codex.state).not.toBe("missing");
			expect(result.codex.version).toMatch(/^codex-cli\s+[\d.]+/);
			expect(["ready", "unauthenticated", "installed"]).toContain(result.codex.state);
			if (result.codex.state === "ready") {
				expect(result.codex.authAction?.kind).toBe("native_cli_login");
				expect(result.codex.runtime?.fileEditing).toBe(true);
			}
		},
	);

	test.skipIf(!claudeInstalled)(
		"claude CLI discovery reflects installed/authenticated state",
		async () => {
			const result = await discoverLocalHarnesses();

			expect(result["claude-code"].state).not.toBe("missing");
			expect(result["claude-code"].version?.length).toBeGreaterThan(0);
			expect(["ready", "unauthenticated", "installed"]).toContain(result["claude-code"].state);
		},
	);

	test.skipIf(!opencodeInstalled)(
		"opencode CLI discovery reflects installed/authenticated state",
		async () => {
			const result = await discoverLocalHarnesses();

			expect(result.opencode.state).not.toBe("missing");
			expect(result.opencode.version?.length).toBeGreaterThan(0);
			expect(["ready", "unauthenticated", "installed"]).toContain(result.opencode.state);
		},
	);

	test.skipIf(cursorInstalled)(
		"cursor-agent is unavailable when neither cursor-agent nor cursor CLI is present",
		async () => {
			const result = await discoverLocalHarnesses();

			expect(result["cursor-agent"].state).toBe("unavailable");
			expect(result["cursor-agent"].reason).toMatch(/no documented headless local CLI surface/i);
		},
	);

	test.skipIf(!gatewayKeyConfigured)(
		"builtin gateway discovery is ready only when the configured provider key is present",
		async () => {
			const result = await discoverLocalHarnesses({ env: process.env });

			expect(result.builtin.state).toBe("ready");
			expect(result.builtin.authAction?.kind).toBe("enter_api_key");
		},
	);
});
