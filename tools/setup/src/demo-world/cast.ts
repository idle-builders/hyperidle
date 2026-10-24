/**
 * The demo world's people and agents. Finn Olsen founded the company and is in
 * Product and Support; Maya Chen runs support. Builder and Growth work for
 * Finn in Product, Designer for Maya in Support, and Facilitation comes from
 * the Team habits plugin and works for everyone. Finn is the FIRST human by
 * `created_at` — local-mode auth resolves the first human, so Finn is who
 * lands in the app.
 */

import { installPluginOutsideServer } from "@hyperidle/core-api";
import {
	agentRunConfig,
	documents,
	filesystemInjections,
	filesystems,
	type HyperIdleDb,
	orgEdges,
	pluginContributions,
	serviceConnections,
	serviceConnectionWithholds,
	subscriptions,
	users,
	userTeams,
} from "@hyperidle/db";
import { type HarnessType, PERSON_REASONS } from "@hyperidle/domain-model";
import { and, eq, isNotNull } from "drizzle-orm";
import {
	BUILDER_ID,
	DESIGNER_ID,
	FACILITATION_ID,
	FOUNDER_ID,
	GROWTH_ID,
	MAYA_ID,
	PRODUCT_TEAM_ID,
	SUPPORT_TEAM_ID,
	TEAM_HABITS_DIR,
} from "./ids.js";
import type { DemoClock } from "./time.js";

interface PersonSpec {
	readonly id: string;
	readonly name: string;
	readonly role: "founder" | "member";
	readonly discipline: string;
	readonly teams: readonly string[];
	readonly sinceDays: number;
	/** What they do, in a few words. */
	readonly what: string;
	/** What agents should know when they work with them. */
	readonly about: string;
}

interface AgentSpec {
	readonly id: string;
	readonly name: string;
	readonly owner: string;
	readonly team: string;
	readonly discipline: string;
	readonly harness: HarnessType;
	readonly sessions: number;
	readonly sinceDays: number;
	readonly what: string;
}

const PEOPLE: readonly PersonSpec[] = [
	{
		id: FOUNDER_ID,
		name: "Finn Olsen",
		role: "founder",
		discipline: "Product",
		teams: [PRODUCT_TEAM_ID, SUPPORT_TEAM_ID],
		sinceDays: 98,
		what: "Founder. Product and pricing.",
		about: `# About Finn

Founder. I decide what gets built and what customers see.

- Ask me before anything reaches customers: the words, the prices, the emails.
- Give me the date and the amount together, never the date alone.
- I answer questions within a few hours on weekdays.`,
	},
	{
		id: MAYA_ID,
		name: "Maya Chen",
		role: "member",
		discipline: "Support",
		teams: [SUPPORT_TEAM_ID],
		sinceDays: 97,
		what: "Support and ops.",
		about: `# About Maya

I run support and everything that goes out to customers.

- I send replies to customers myself; draft them, never send them.
- Tickets tagged trial-end are about billing after a trial.`,
	},
];

const AGENTS: readonly AgentSpec[] = [
	{
		id: BUILDER_ID,
		name: "Builder",
		what: "Builds and ships.",
		owner: FOUNDER_ID,
		team: PRODUCT_TEAM_ID,
		discipline: "Engineering",
		harness: "claude-code",
		sessions: 2,
		sinceDays: 98,
	},
	{
		id: GROWTH_ID,
		name: "Growth",
		what: "Trials and pricing: numbers and experiments.",
		owner: FOUNDER_ID,
		team: PRODUCT_TEAM_ID,
		discipline: "Growth",
		harness: "codex",
		sessions: 1,
		sinceDays: 87,
	},
	{
		id: DESIGNER_ID,
		name: "Designer",
		what: "Pages and copy.",
		owner: MAYA_ID,
		team: SUPPORT_TEAM_ID,
		discipline: "Design",
		harness: "claude-code",
		sessions: 1,
		sinceDays: 81,
	},
];

/** Folders each team registered, and the agent given each one. */
const FOLDERS = [
	{
		id: "demo-folder-northwind",
		team: PRODUCT_TEAM_ID,
		repo: "~/code/northwind",
		agent: BUILDER_ID,
	},
	{
		id: "demo-folder-northwind-site",
		team: SUPPORT_TEAM_ID,
		repo: "~/code/northwind-site",
		agent: DESIGNER_ID,
	},
] as const;

/**
 * The services each person connected, as MCP servers; every agent of theirs reaches them unless
 * kept from one. Builder does not get the payment or drive ones.
 */
const SERVICES = [
	{
		id: "demo-sc-zendesk",
		user: FOUNDER_ID,
		service: "Zendesk",
		url: "https://mcp.zendesk.com/mcp",
		keptFrom: [],
	},
	{
		id: "demo-sc-stripe",
		user: FOUNDER_ID,
		service: "Stripe",
		url: "https://mcp.stripe.com",
		keptFrom: [BUILDER_ID],
	},
	{
		id: "demo-sc-drive",
		user: FOUNDER_ID,
		service: "Google Drive",
		url: "https://drivemcp.googleapis.com/mcp",
		keptFrom: [BUILDER_ID],
	},
	{
		id: "demo-sc-figma",
		user: MAYA_ID,
		service: "Figma",
		url: "https://mcp.figma.com/mcp",
		keptFrom: [],
	},
] as const;

/** What a person edited after the plugin installed it, so a reinstall leaves it alone. */
const PLUGIN_EDITS = [
	{
		title: "Facilitation — identity",
		by: MAYA_ID,
		daysAgo: 14,
		add: "- Keep a proposal short enough to read in two minutes.",
	},
	{
		title: "Propose a change to How we work",
		by: FOUNDER_ID,
		daysAgo: 6,
		add: "Ask Maya before you propose a change to how reviews work.",
	},
] as const;

export async function seedCast(
	db: HyperIdleDb,
	clock: DemoClock,
	pluginsBaseDir?: string,
): Promise<void> {
	for (const person of PEOPLE) {
		await db
			.insert(users)
			.values({
				id: person.id,
				kind: "human",
				name: person.name,
				role: person.role,
				discipline: person.discipline,
				what: person.what,
				status: "active",
				createdAt: clock.daysAgo(person.sinceDays),
			})
			.onConflictDoNothing();
		for (const teamId of person.teams) {
			await db.insert(userTeams).values({ userId: person.id, teamId }).onConflictDoNothing();
			// The setup flow's team creation records the same edge for a real team.
			await db
				.insert(orgEdges)
				.values({
					id: `demo-org-edge-${person.id}-${teamId}`,
					fromUserId: person.id,
					mechanism: "team",
					target: teamId,
					createdAt: clock.daysAgo(person.sinceDays),
				})
				.onConflictDoNothing();
		}
		// What a person is told about: every reason, as every new person starts.
		for (const event of PERSON_REASONS) {
			await db
				.insert(subscriptions)
				.values({
					id: `demo-sub-${person.id}-${event.replace(".", "-")}`,
					userId: person.id,
					event,
					schedule: null,
					paused: false,
					nextRunAt: null,
					createdAt: clock.daysAgo(person.sinceDays),
					updatedAt: clock.daysAgo(person.sinceDays),
				})
				.onConflictDoNothing();
		}
	}

	for (const person of PEOPLE) {
		await db
			.insert(documents)
			.values({
				id: `demo-doc-about-${person.id}`,
				scopeKind: "user",
				scopeId: person.id,
				title: `About ${person.name}`,
				body: person.about,
				format: "markdown",
				status: "active",
				slot: "agent_file",
				parentKind: "agent",
				parentId: person.id,
				updatedBy: person.id,
				createdAt: clock.daysAgo(person.sinceDays),
				updatedAt: clock.daysAgo(30),
			})
			.onConflictDoNothing();
	}

	for (const service of SERVICES) {
		await db
			.insert(serviceConnections)
			.values({
				id: service.id,
				userId: service.user,
				service: service.service,
				authSource: "mcp",
				serverUrl: service.url,
				health: "working",
				createdAt: clock.daysAgo(60),
				updatedAt: clock.daysAgo(60),
			})
			.onConflictDoNothing();
	}

	for (const agent of AGENTS) {
		await db
			.insert(users)
			.values({
				id: agent.id,
				kind: "ai",
				name: agent.name,
				role: "agent",
				agentCategory: "individual",
				ownerUserId: agent.owner,
				discipline: agent.discipline,
				what: agent.what,
				status: "active",
				createdAt: clock.daysAgo(agent.sinceDays),
			})
			.onConflictDoNothing();
		await db
			.insert(userTeams)
			.values({ userId: agent.id, teamId: agent.team })
			.onConflictDoNothing();
		await setRunConfig(db, agent.id, agent.harness, agent.sessions);
	}

	for (const folder of FOLDERS) {
		await db
			.insert(filesystems)
			.values({
				id: folder.id,
				teamId: folder.team,
				source: "local",
				kind: "code",
				resourceRef: JSON.stringify({ kind: "code", repo: folder.repo, branch: "main" }),
				writeback: "git",
				state: "attached",
				createdAt: clock.daysAgo(90),
			})
			.onConflictDoNothing();
		await db
			.insert(filesystemInjections)
			.values({ agentUserId: folder.agent, filesystemId: folder.id, createdAt: clock.daysAgo(90) })
			.onConflictDoNothing();
	}

	for (const service of SERVICES)
		for (const agentUserId of service.keptFrom)
			await db
				.insert(serviceConnectionWithholds)
				.values({ connectionId: service.id, agentUserId, createdAt: clock.daysAgo(60) })
				.onConflictDoNothing();

	await seedGrowthsMonday(db, clock);
	await seedTeamHabits(db, clock, pluginsBaseDir);
}

async function setRunConfig(
	db: HyperIdleDb,
	agentId: string,
	harnessType: HarnessType,
	maxConcurrentSessions: number,
): Promise<void> {
	await db
		.insert(agentRunConfig)
		.values({ agentUserId: agentId, harnessType, maxConcurrentSessions })
		.onConflictDoUpdate({
			target: agentRunConfig.agentUserId,
			set: { harnessType, maxConcurrentSessions },
		});
}

/** Growth's reason to start: every Monday at 07:00 it reads last week's support tickets. */
async function seedGrowthsMonday(db: HyperIdleDb, clock: DemoClock): Promise<void> {
	const id = "demo-sub-growth-weekly-themes";
	await db
		.insert(subscriptions)
		.values({
			id,
			userId: GROWTH_ID,
			event: null,
			schedule: "0 7 * * 1",
			paused: false,
			nextRunAt: clock.at(clock.daysSinceMonday - 7, "07:00"),
			createdAt: clock.daysAgo(84),
			updatedAt: clock.daysAgo(84),
		})
		.onConflictDoNothing();
	await db
		.insert(documents)
		.values({
			id: `demo-doc-prompt-${id}`,
			scopeKind: "team",
			scopeId: PRODUCT_TEAM_ID,
			title: "Support themes, weekly",
			body: "Read last week's support tickets and say what people struggled with most: the number of tickets, the top theme, and anything new. Each run is a part of the task “Support themes, weekly”.",
			format: "markdown",
			status: "active",
			slot: "prompt",
			parentKind: "subscription",
			parentId: id,
			updatedBy: FOUNDER_ID,
			createdAt: clock.daysAgo(84),
			updatedAt: clock.daysAgo(84),
		})
		.onConflictDoNothing();
}

/**
 * Team habits, installed for everyone through the real install path the day
 * the company started; Facilitation runs on Claude Code. Two of its documents
 * were edited by a person since, which detaches them from the plugin.
 */
async function seedTeamHabits(
	db: HyperIdleDb,
	clock: DemoClock,
	pluginsBaseDir: string | undefined,
): Promise<void> {
	const view = await installPluginOutsideServer(db, {
		source: { kind: "folder", path: TEAM_HABITS_DIR, scope: { kind: "factory", teamId: null } },
		actor: FOUNDER_ID,
		now: clock.daysAgo(98),
		...(pluginsBaseDir ? { pluginsBaseDir } : {}),
	});
	await setRunConfig(db, FACILITATION_ID, "claude-code", 1);
	// The install counts the next Friday from its own date, long past; the
	// Fridays since then have run, so the next one is still to come.
	const daysToFriday = (4 - clock.daysSinceMonday + 7) % 7 || 7;
	await db
		.update(subscriptions)
		.set({ nextRunAt: clock.at(-daysToFriday, "16:00") })
		.where(and(eq(subscriptions.userId, FACILITATION_ID), isNotNull(subscriptions.schedule)));

	for (const edit of PLUGIN_EDITS) {
		const contribution = view.contributions.find(
			(c) => c.kind === "document" && c.label === edit.title,
		);
		if (!contribution) throw new Error(`Team habits did not contribute "${edit.title}"`);
		const [doc] = await db
			.select({ body: documents.body })
			.from(documents)
			.where(eq(documents.id, contribution.entityId));
		await db
			.update(documents)
			.set({
				body: `${doc?.body.trimEnd() ?? ""}\n${edit.add}\n`,
				updatedBy: edit.by,
				updatedAt: clock.daysAgo(edit.daysAgo),
				version: 2,
			})
			.where(eq(documents.id, contribution.entityId));
		await db
			.update(pluginContributions)
			.set({ detachedAt: clock.daysAgo(edit.daysAgo), detachedBy: edit.by })
			.where(
				and(
					eq(pluginContributions.pluginId, view.id),
					eq(pluginContributions.entityId, contribution.entityId),
				),
			);
	}
}
