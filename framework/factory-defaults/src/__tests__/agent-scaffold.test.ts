/**
 * AU21 §9 Increment 8 (RED) — architecture.md §6 Decision F1's resolution of
 * the founder's `resolveScaffoldSpecs` flag: "not sure how much this is
 * selection but it seems this is similar to the task trigger — its a very
 * simple configuration part. Not sure if that's a service but if so its a
 * light one."
 *
 * Traced from source: `agent-selection/src/service.ts`'s `scaffoldSpecs()`
 * function (the body behind `AgentSelectionService.resolveScaffoldSpecs`) is
 * PURE — it never touches its own injected `AgentSelectionDeps`
 * (`users`/`teams`), and its own `ScaffoldRequest.db`/`teamId`/`teamMembersId`
 * fields are declared but never read either. It only needs
 * `@hyperidle/domain-model`'s role catalog (`AGENT_ROLE_CATALOG`/`defaultRoster`/
 * `findRoleCatalogEntry`) and `@hyperidle/db`'s
 * `readSystemPromptTemplateForRole` — both leaves every Service may import
 * directly (Mechanism C). So this is not a Service capability at all: it
 * folds into `@hyperidle/db` (which already owns `system-prompt-templates.ts`
 * and already depends on `@hyperidle/domain-model` for exactly this kind of role
 * lookup), as a plain exported pure function, eliminating the need for a
 * Service/DI-port indirection at its three real call sites
 * (`tool-handlers/tool-definitions.ts`'s `create_team`/`add_agent` tool
 * handlers, `dispatch/service.ts`'s `user_assistant` formation).
 *
 * The unused `db`/`teamId`/`teamMembersId` fields are dropped from the new
 * request shape — a genuine simplification, not a behavior change (the old
 * function never read them).
 *
 * Currently RED: `../agent-scaffold.js` does not exist yet — this import
 * fails to resolve, so every test below fails at collection/import time.
 */

import { describe, expect, test } from "vitest";
import { resolveAgentScaffoldSpecs } from "../agent-scaffold.js";

describe("resolveAgentScaffoldSpecs — pure agent-scaffold configuration", () => {
	test("team_scaffold: derives the default roster from team functions, prefixed with the team name", () => {
		const specs = resolveAgentScaffoldSpecs({
			trigger: "team_scaffold",
			teamName: "Growth Squad",
			functions: ["development"],
			role: null,
			name: null,
			ownerUserId: null,
			ownerUserName: null,
		});

		expect(specs.length).toBeGreaterThan(0);
		expect(specs.every((spec) => spec.name.startsWith("Growth Squad "))).toBe(true);
		expect(specs.every((spec) => spec.agentCategory === "team")).toBe(true);
	});

	test("team_scaffold: empty functions yields an empty roster", () => {
		expect(
			resolveAgentScaffoldSpecs({
				trigger: "team_scaffold",
				teamName: "Empty Team",
				functions: [],
				role: null,
				name: null,
				ownerUserId: null,
				ownerUserName: null,
			}),
		).toEqual([]);
	});

	test("agent_added: builds a single spec for the requested role and exact name", () => {
		const specs = resolveAgentScaffoldSpecs({
			trigger: "agent_added",
			teamName: "Growth Squad",
			functions: null,
			role: "builder",
			name: "Exact Name",
			ownerUserId: null,
			ownerUserName: null,
		});

		expect(specs).toMatchObject([{ role: "builder", name: "Exact Name", agentCategory: "team" }]);
	});

	test("agent_added: throws when role is null", () => {
		expect(() =>
			resolveAgentScaffoldSpecs({
				trigger: "agent_added",
				teamName: null,
				functions: null,
				role: null,
				name: null,
				ownerUserId: null,
				ownerUserName: null,
			}),
		).toThrow();
	});

	test("user_assistant: names the assistant after its owner and hints its id", () => {
		const specs = resolveAgentScaffoldSpecs({
			trigger: "user_assistant",
			teamName: null,
			functions: null,
			role: null,
			name: null,
			ownerUserId: "user-1",
			ownerUserName: "Ada",
		});

		expect(specs).toMatchObject([
			{
				role: "assistant",
				name: "Ada's Assistant",
				agentCategory: "individual",
				idHint: "ast-user-1",
			},
		]);
	});

	test("user_assistant: falls back to a generic name and no id hint when owner fields are absent", () => {
		const specs = resolveAgentScaffoldSpecs({
			trigger: "user_assistant",
			teamName: null,
			functions: null,
			role: null,
			name: null,
			ownerUserId: null,
			ownerUserName: null,
		});

		expect(specs).toMatchObject([
			{ role: "assistant", name: "Assistant", agentCategory: "individual" },
		]);
		expect(specs[0]?.idHint).toBeUndefined();
	});
});
