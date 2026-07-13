import { describe, expect, it } from "vitest";
import { harnessCapabilities } from "./harness-capabilities.js";

describe("harness-registry capabilities (agent-execution, db-free)", () => {
	it("names the supported harness set", () => {
		const names = harnessCapabilities().map((h) => h.name);
		expect(names).toEqual(["builtin", "claude-code", "codex", "opencode", "cursor-agent"]);
	});

	it("marks builtin as the only non-CLI-spawning harness", () => {
		const nonCli = harnessCapabilities().filter((h) => !h.spawnsCli);
		expect(nonCli.map((h) => h.name)).toEqual(["builtin"]);
	});
});
