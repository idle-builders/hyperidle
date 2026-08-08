/**
 * Shared test helpers for G1 facilitator tool suites. Each tool test only
 * seeds the rows it needs beyond the common base; the base helpers stay
 * deliberately minimal so assertions remain local to their test file.
 *
 * @lore AU19 Increment 4: a near-identical copy of `@hyperidle/tool-handlers`'s
 * own `src/__tests__/_helpers.ts` lives here too — these integration tests
 * (real `{db}` fixture, `packages/server`'s composition-root-wired tools via
 * `@hyperidle/tool-handlers`'s factories + `toolHandlersPorts`) are a
 * different test surface than tool-handlers' own unit tests, and a test-only
 * helper file isn't worth a shared `@hyperidle/test-utils` package for two
 * call sites (memory: tests/stories never knip entry points — this file is
 * exempt from the "no duplication" ideal the same way).
 */

import * as os from "node:os";
import * as path from "node:path";
// @lore U1: `products` renamed to `teams`; old `teams` (membership) renamed to `teamMembers`.
import {
	type HyperIdleDb,
	knowledgeAppProjection,
	knowledgeItems,
	teamMembers,
	teams,
	threads,
	users,
} from "@hyperidle/db";
import { EventBus, type ToolContext } from "@hyperidle/shared";

export const NOW = "2026-04-18T00:00:00.000Z";

export interface MakeContextOverrides {
	readonly agentId?: string;
	readonly label?: string;
}

/**
 * Build a ToolContext whose sandboxPath points at a unique tmp dir so
 * parallel suites never clash. The watcher is a no-op — none of the G1
 * tools use it.
 */
export function makeContext(
	db: HyperIdleDb,
	overrides: MakeContextOverrides = {},
): ToolContext<HyperIdleDb> {
	const label = overrides.label ?? "g1";
	return {
		db,
		eventBus: new EventBus(),
		agentId: overrides.agentId ?? "agent-fac",
		sessionId: "session-1",
		taskId: "task-1",
		sandboxPath: path.join(os.tmpdir(), `hi-${label}-${Date.now()}`),
		ingestion: {
			dispose: (): void => {
				/* no-op */
			},
		},
	};
}

/**
 * Seed the minimum domain needed by every G1 facilitator tool suite:
 * product, team, an active facilitator agent, and an item thread.
 */
export async function seedBase(db: HyperIdleDb): Promise<void> {
	// @lore U1: teams is the domain entity (formerly products); teamMembers is the membership group.
	await db.insert(teams).values({ id: "p1", name: "Test", phase: "build", createdAt: NOW });
	await db
		.insert(teamMembers)
		.values({ id: "t1", teamId: "p1", capacity: 5, activeBets: 0, formedAt: NOW });

	// @lore AD8c: role renamed from practice_facilitator to facilitator
	await db.insert(users).values({
		id: "agent-fac",
		name: "Facilitator",
		role: "facilitator",
		status: "active",
		createdAt: NOW,
	});

	await db.insert(threads).values({
		id: "th1",
		hostKind: "task",
		hostId: "task-1",
		initiatorId: "agent-fac",
		participants: JSON.stringify(["agent-fac"]),
		lastActiveAt: NOW,
		createdAt: NOW,
	});
}

export interface SeedTeamOptions {
	readonly id?: string;
	readonly name?: string;
	readonly phase?: string;
	readonly functions?: string | null;
	readonly factoryDbPath?: string | null;
	readonly createdAt?: string;
	readonly teamMembersId?: string;
	readonly capacity?: number;
	readonly activeBets?: number;
	readonly formedAt?: string;
}

/**
 * Seed a `teams` row with its `teamMembers` companion in one call — mirrors the owner's writer,
 * `createTeam` (`layers/core-api/org/src/team-lookup.ts:230-259`), which always inserts both rows
 * together. Defaults match the owner's own: capacity 5, activeBets 0, formedAt = createdAt.
 */
export async function seedTeam(
	db: HyperIdleDb,
	options: SeedTeamOptions = {},
): Promise<{ id: string; teamMembersId: string }> {
	const id = options.id ?? "p1";
	const createdAt = options.createdAt ?? NOW;
	const teamMembersId = options.teamMembersId ?? `${id}-members`;
	await db.insert(teams).values({
		id,
		name: options.name ?? "Test",
		phase: options.phase ?? "build",
		functions: options.functions,
		factoryDbPath: options.factoryDbPath,
		createdAt,
	});
	await db.insert(teamMembers).values({
		id: teamMembersId,
		teamId: id,
		capacity: options.capacity ?? 5,
		activeBets: options.activeBets ?? 0,
		formedAt: options.formedAt ?? createdAt,
	});
	return { id, teamMembersId };
}

export interface SeedKnowledgeItemOptions {
	readonly id?: string;
	readonly scopeKind?: string;
	readonly scopeId?: string | null;
	readonly topic?: string | null;
	readonly title?: string;
	readonly body?: string;
	readonly format?: string;
	readonly status?: string;
	readonly version?: number;
	readonly updatedBy?: string;
	readonly createdAt?: string;
	readonly updatedAt?: string;
	readonly projectionId?: string;
	readonly layer?: string | null;
	readonly kind?: string | null;
	readonly attentionScore?: string | null;
	readonly confidence?: string | null;
	readonly meta?: string | null;
}

/**
 * Seed a `knowledgeItems` row with its `knowledgeAppProjection` companion — mirrors the owner's
 * writer, `create` (`layers/core-api/knowledge/src/knowledge-repository.ts:254-301`), which always
 * inserts both rows together. Projection fields pass through when given; everything else the owner
 * would compute from a full write (edit log, event emission) is out of scope for a fixture.
 */
export async function seedKnowledgeItem(
	db: HyperIdleDb,
	options: SeedKnowledgeItemOptions = {},
): Promise<{ id: string; projectionId: string }> {
	const id = options.id ?? "ki-1";
	const createdAt = options.createdAt ?? NOW;
	const updatedAt = options.updatedAt ?? createdAt;
	const projectionId = options.projectionId ?? `${id}-projection`;
	await db.insert(knowledgeItems).values({
		id,
		scopeKind: options.scopeKind ?? "factory",
		scopeId: options.scopeId ?? null,
		topic: options.topic ?? null,
		title: options.title ?? "T",
		body: options.body ?? "B",
		format: options.format ?? "markdown",
		status: options.status ?? "captured",
		version: options.version ?? 1,
		updatedBy: options.updatedBy ?? "agent-fac",
		createdAt,
		updatedAt,
	});
	await db.insert(knowledgeAppProjection).values({
		id: projectionId,
		knowledgeItemId: id,
		layer: options.layer ?? null,
		scopeId: options.scopeId ?? null,
		kind: options.kind ?? null,
		attentionScore: options.attentionScore ?? null,
		confidence: options.confidence ?? null,
		meta: options.meta ?? null,
	});
	return { id, projectionId };
}
