/**
 * AV1 — resolveTeamAgentHarness unit tests
 *
 * AC2: Primary harness persists as team default; every creation path consumes it.
 * Covers the resolver logic (explicit wins; team default used when no explicit;
 * undefined when both unset so builtin fallback in persistScaffoldedAgents applies).
 */

import { resolveTeamAgentHarness } from "@hyperidle/core-app";
import type { PrimaryHarnessConfig } from "@hyperidle/shared";
import { describe, expect, it } from "vitest";

const TEAM_WITH_DEFAULT = {
	defaultHarnessType: "claude-code",
	defaultModelId: "claude-sonnet-4-5",
	defaultModelProvider: "anthropic",
};

const TEAM_NO_DEFAULT = {
	defaultHarnessType: null,
	defaultModelId: null,
	defaultModelProvider: null,
};

const EXPLICIT: PrimaryHarnessConfig = {
	harnessType: "codex",
	modelId: "gpt-5.4-mini",
	modelProvider: "openai",
};

describe("resolveTeamAgentHarness", () => {
	it("returns explicit harness when provided (explicit wins over team default)", () => {
		const result = resolveTeamAgentHarness(EXPLICIT, TEAM_WITH_DEFAULT);
		expect(result).toEqual(EXPLICIT);
	});

	it("returns team default when no explicit harness supplied", () => {
		const result = resolveTeamAgentHarness(undefined, TEAM_WITH_DEFAULT);
		expect(result).toEqual({
			harnessType: "claude-code",
			modelId: "claude-sonnet-4-5",
			modelProvider: "anthropic",
		});
	});

	it("fills modelId fallback when team default has null modelId", () => {
		const result = resolveTeamAgentHarness(undefined, {
			defaultHarnessType: "opencode",
			defaultModelId: null,
			defaultModelProvider: null,
		});
		expect(result).toEqual({
			harnessType: "opencode",
			modelId: "claude-sonnet-4-6",
			modelProvider: "anthropic",
		});
	});

	it("returns undefined when both explicit and team default are unset (defers to builtin fallback)", () => {
		const result = resolveTeamAgentHarness(undefined, TEAM_NO_DEFAULT);
		expect(result).toBeUndefined();
	});

	it("explicit overrides even when team default is set", () => {
		const result = resolveTeamAgentHarness(EXPLICIT, TEAM_WITH_DEFAULT);
		expect(result?.harnessType).toBe("codex");
		expect(result?.modelId).toBe("gpt-5.4-mini");
	});
});
