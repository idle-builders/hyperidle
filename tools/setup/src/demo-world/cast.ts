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
	subscriptions,
	users,
	userTeams,
} from "@hyperidle/db";
import { type HarnessType, OBJECT_EVENTS } from "@hyperidle/domain-model";
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
}

const PEOPLE: readonly PersonSpec[] = [
	{
		id: FOUNDER_ID,
		name: "Finn Olsen",
		role: "founder",
		discipline: "Product",
		teams: [PRODUCT_TEAM_ID, SUPPORT_TEAM_ID],
		sinceDays: 98,
	},
	{
		id: MAYA_ID,
		name: "Maya Chen",
		role: "member",
		discipline: "Support",
		teams: [SUPPORT_TEAM_ID],
		sinceDays: 97,
	},
];

const AGENTS: readonly AgentSpec[] = [
	{
		id: BUILDER_ID,
		name: "Builder",
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

/** What a person edited after the plugin installed it, so a reinstall leaves it alone. */
const PLUGIN_EDITS = [
	{ title: "Facilitation — identity", by: MAYA_ID, daysAgo: 14 },
	{ title: "Propose a change to How we work", by: FOUNDER_ID, daysAgo: 6 },
] as const;

export async function seedCast(db: HyperIdleDb, clock: DemoClock): Promise<void> {
	for (const person of PEOPLE) {
		await db
			.insert(users)
			.values({
				id: person.id,
				kind: "human",
				name: person.name,
				role: person.role,
				discipline: person.discipline,
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
		// What a person is told about: the nine object events, as the welcome screen gives everyone.
		for (const event of OBJECT_EVENTS) {
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

	await seedGrowthsMonday(db, clock);
	await seedTeamHabits(db, clock);
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
async function seedTeamHabits(db: HyperIdleDb, clock: DemoClock): Promise<void> {
	const view = await installPluginOutsideServer(db, {
		source: { kind: "folder", path: TEAM_HABITS_DIR, scope: { kind: "factory", teamId: null } },
		actor: FOUNDER_ID,
		now: clock.daysAgo(98),
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
		await db
			.update(documents)
			.set({ updatedBy: edit.by, updatedAt: clock.daysAgo(edit.daysAgo), version: 2 })
			.where(eq(documents.id, contribution.entityId));
		await db
			.update(pluginContributions)
			.set({ detachedAt: clock.daysAgo(edit.daysAgo) })
			.where(
				and(
					eq(pluginContributions.pluginId, view.id),
					eq(pluginContributions.entityId, contribution.entityId),
				),
			);
	}
}
