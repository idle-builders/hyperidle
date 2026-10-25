import type {
	AvailablePluginView,
	PluginContributionView,
	PluginView,
	UserRow,
} from "@hyperidle/domain-model";
import { describe, expect, it } from "vitest";
import { agoWords, pluginPage } from "./plugin-page";

const NOW = Date.parse("2026-10-21T12:00:00.000Z");
const daysAgo = (d: number) => new Date(NOW - d * 86_400_000).toISOString();

const user = (id: string, name: string, u: Partial<UserRow> = {}): UserRow => ({
	id,
	kind: "ai",
	name,
	role: "agent",
	status: "active",
	avatarUrl: null,
	createdAt: daysAgo(100),
	agentCategory: "team",
	ownerUserId: null,
	health: null,
	discipline: null,
	what: null,
	teams: [],
	edges: [],
	...u,
});

const part = (
	kind: PluginContributionView["kind"],
	entityId: string,
	label: string,
	p: Partial<PluginContributionView> = {},
): PluginContributionView => ({
	kind,
	entityId,
	label,
	key: entityId,
	manifestKey: entityId,
	slot: null,
	agentId: null,
	detachedAt: null,
	detachedBy: null,
	...p,
});

const habits = (p: Partial<PluginView> = {}): PluginView => ({
	id: "team-habits",
	name: "team-habits",
	version: "1.2.0",
	description: "An agent that keeps how the team works written down.",
	state: "enabled",
	scope: { kind: "factory", teamId: null },
	source: { kind: "folder", address: "/plugins/team-habits" },
	installedBy: "me",
	installedAt: daysAgo(98),
	updatedAt: daysAgo(98),
	disabledAt: null,
	contributions: [
		part("agent", "fa", "Facilitation"),
		part("subscription", "r1", "Every Friday at 16:00", { agentId: "fa" }),
		part("subscription", "r2", "A task finishes", { agentId: "fa" }),
		part("document", "id", "Facilitation — identity", {
			slot: "agent_file",
			agentId: "fa",
			detachedAt: daysAgo(14),
			detachedBy: "maya",
		}),
		part("document", "s1", "Read how a task went", { slot: "skill" }),
		part("document", "s2", "Propose a change", {
			slot: "skill",
			detachedAt: daysAgo(6),
			detachedBy: "me",
		}),
		part("document", "p1", "Every Friday at 16:00", { slot: "prompt", agentId: "fa" }),
	],
	...p,
});

const users = [
	user("fa", "Facilitation", { what: "Keeps how we work written down." }),
	user("maya", "Maya Chen", { kind: "human" }),
];
const ctx = { users, you: "me", team: { id: "t1", name: "Product" }, now: NOW };

describe("a plugin's page", () => {
	it("an installed plugin lists its agents, skills and reasons, and says what it added", () => {
		const page = pluginPage(habits(), ctx);
		expect(page.stand).toBe("On. It added 1 agent, 2 skills and 2 reasons to start.");
		expect(page.agents).toEqual([
			{
				id: "fa",
				name: "Facilitation",
				what: "Keeps how we work written down.",
				comes: "Instructions, 2 skills and 2 reasons to start",
			},
		]);
		expect(page.skills.map((s) => s.what)).toEqual(["Read how a task went", "Propose a change"]);
		expect(page.reasons).toEqual([
			{ what: "Every Friday at 16:00", why: "Starts Facilitation" },
			{ what: "A task finishes", why: "Starts Facilitation" },
		]);
	});

	it("lists what the team changed since, with who and when", () => {
		expect(pluginPage(habits(), ctx).changed).toEqual([
			{ key: "id", what: "Facilitation's instructions", why: "Maya edited them 2 weeks ago" },
			{ key: "s2", what: "Propose a change", why: "You edited this skill last week" },
		]);
	});

	it.each([
		[{ kind: "bundled", address: "roles" }, "Comes with HyperIdle"],
		[
			{ kind: "git", address: "https://github.com/northwind/notes" },
			"From github.com/northwind/notes",
		],
		[{ kind: "folder", address: "/plugins/team-habits" }, "From the folder /plugins/team-habits"],
		[{ kind: "zip", address: "/downloads/notes.zip" }, "From the zip file notes.zip"],
	] as const)("says where it came from: %o", (source, words) => {
		expect(pluginPage(habits({ source }), ctx).from).toBe(words);
	});

	it.each([
		[habits(), "For every team", "Installed 15 July by you"],
		[
			habits({ scope: { kind: "team", teamId: "t1" }, installedBy: "maya" }),
			"For the Product team",
			"Installed 15 July by Maya",
		],
	])("says who it is for and who installed it", (listing, forWhom, installed) => {
		const page = pluginPage(listing, ctx);
		expect([page.forWhom, page.installed]).toEqual([forWhom, installed]);
	});

	it("a switched-off plugin pauses its agents", () => {
		const page = pluginPage(habits({ state: "disabled" }), ctx);
		expect(page.stand).toBe("Off. What it added is paused, not gone.");
		expect(page.agents.map((a) => a.comes)).toEqual(["Paused with the plugin"]);
	});

	it("a bundled plugin not installed says what installing adds, for the team it is opened from", () => {
		const roles: AvailablePluginView = {
			id: "role-personas",
			name: "role-personas",
			version: "1.0.0",
			description: "A team of agents.",
			state: "available",
			installScope: "team",
			adds: [
				{ kind: "agent", slot: null, label: "Ops", agent: null, what: "Keeps deploys healthy." },
				{ kind: "document", slot: "agent_file", label: "Ops — identity", agent: "Ops", what: null },
				{ kind: "agent", slot: null, label: "QA", agent: null, what: null },
			],
		};
		const page = pluginPage(roles, ctx);
		expect(page.stand).toBe("Not installed. Installing adds 2 agents.");
		expect(page.agents).toEqual([
			{ id: null, name: "Ops", what: "Keeps deploys healthy.", comes: "Instructions" },
			{ id: null, name: "QA", what: null, comes: "" },
		]);
		expect([page.from, page.forWhom, page.installed]).toEqual([
			"Comes with HyperIdle",
			"For the Product team",
			null,
		]);
	});
});

describe("how long ago", () => {
	it.each([
		[0, "today"],
		[1, "yesterday"],
		[3, "3 days ago"],
		[6, "last week"],
		[14, "2 weeks ago"],
	])("%i days is %s", (days, words) => {
		expect(agoWords(daysAgo(days), NOW)).toBe(words);
	});
});
