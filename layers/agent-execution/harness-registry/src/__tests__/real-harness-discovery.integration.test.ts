import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { describe, expect, test } from "vitest";
import { discoverLocalHarnesses } from "../harness-discovery.js";
import { requireHarness } from "./require-harness.js";

const execFileAsync = promisify(execFile);

describe("real harness discovery", () => {
	describe("codex", () => {
		requireHarness("codex");
		test("codex CLI discovery reflects installed/authenticated state", async () => {
			const result = await discoverLocalHarnesses();

			expect(result.codex.state).not.toBe("missing");
			expect(result.codex.version).toMatch(/^codex-cli\s+[\d.]+/);
			expect(["ready", "unauthenticated", "installed"]).toContain(result.codex.state);
			// The real installed binary's auth state depends on the machine running
			// this test — "ready" only applies when the account is actually logged in.
			if (result.codex.state === "ready") {
				// eslint-disable-next-line vitest/no-conditional-expect
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

		test("a logged-in claude offers models, and every one is a name it accepts", async () => {
			const result = await discoverLocalHarnesses();
			if (result["claude-code"].state !== "ready") return;

			const models = result["claude-code"].models ?? [];
			expect(models.length).toBeGreaterThan(0);
			for (const model of models) {
				expect(model.id.trim()).toBe(model.id);
				expect(model.id.length).toBeGreaterThan(0);
				expect(model.id).not.toBe("default");
			}
		});

		test("asking claude what it can run costs nothing", async () => {
			// `/model` is answered locally. If a future build starts charging for it,
			// this is the test that says so before a discovery probe quietly starts
			// spending money on every run.
			const { stdout } = await execFileAsync(
				"claude",
				["-p", "/model", "--output-format", "json"],
				{ timeout: 60_000 },
			);
			const parsed = JSON.parse(stdout) as {
				total_cost_usd?: number;
				duration_api_ms?: number;
				modelUsage?: Record<string, unknown>;
			};
			expect(parsed.total_cost_usd).toBe(0);
			expect(parsed.duration_api_ms).toBe(0);
			expect(Object.keys(parsed.modelUsage ?? {})).toEqual([]);
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
			// The real installed binary's auth state depends on the machine running
			// this test — "ready" only applies when the account is actually logged in.
			if (result["cursor-agent"].state === "ready") {
				// eslint-disable-next-line vitest/no-conditional-expect
				expect(result["cursor-agent"].authAction?.kind).toBe("native_cli_login");
				// eslint-disable-next-line vitest/no-conditional-expect
				expect(result["cursor-agent"].version).toBeTruthy();
			}
		});

		test("a logged-in cursor-agent offers the models it lists for the account", async () => {
			const result = await discoverLocalHarnesses();
			if (result["cursor-agent"].state !== "ready") return;

			const models = result["cursor-agent"].models ?? [];
			expect(models.length).toBeGreaterThan(0);
			expect(models.map((model) => model.id)).not.toContain("auto");
			for (const model of models) {
				expect(model.label).not.toMatch(/\((current|default)\)/);
			}
		});
	});
});
