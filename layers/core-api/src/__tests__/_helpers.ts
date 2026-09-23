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
// @lore U1: `products` renamed to `teams`; `teamMembers` dissolved into `teams` (AU44 B1).
import { documents, type HyperIdleDb, teams, threads, users } from "@hyperidle/db";
import { EventBus } from "@hyperidle/event-bus";
import type { ToolContext } from "@hyperidle/harness-protocol";

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
	await db.insert(teams).values({ id: "p1", name: "Test",createdAt: NOW });

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
	readonly createdAt?: string;
	readonly teamMembersId?: string;
}

/**
 * Seed a `teams` row — mirrors the owner's writer, `createTeam`
 * (`layers/core-api/user/src/team-lookup.ts`).
 *
 * @lore BC5 T11: a team is an id and a name now (D-e3zm2j, migration 0090)
 * — `phase`/`factoryDbPath`/`capacity`/`formedAt` are gone with the columns
 * that carried them.
 * @lore AU44 B1: team_members dissolved into teams. teamMembersId is now
 * always equal to id (the team's own id). Returned for caller backward compat.
 */
export async function seedTeam(
	db: HyperIdleDb,
	options: SeedTeamOptions = {},
): Promise<{ id: string; teamMembersId: string }> {
	const id = options.id ?? "p1";
	const createdAt = options.createdAt ?? NOW;
	await db.insert(teams).values({
		id,
		name: options.name ?? "Test",
		createdAt,
	});
	// teamMembersId = id after the fold — kept in return for caller backward compat.
	return { id, teamMembersId: id };
}

export interface SeedDocumentOptions {
	readonly id?: string;
	readonly scopeKind?: string;
	readonly scopeId?: string | null;
	readonly title?: string;
	readonly body?: string;
	readonly format?: string;
	readonly status?: string;
	readonly version?: number;
	readonly updatedBy?: string;
	readonly createdAt?: string;
	readonly updatedAt?: string;
	readonly confidence?: string | null;
	readonly meta?: string | null;
}

/**
 * Seed a `documents` row — mirrors the owner's writer, `create`
 * (`layers/core-api/knowledge/src/knowledge-repository.ts:254-301`). `confidence`/`meta` are columns
 * on `documents` itself (migration 0086 folded the projection in); everything else the owner would
 * compute from a full write (change log, event emission) is out of scope for a fixture.
 */
export async function seedDocument(
	db: HyperIdleDb,
	options: SeedDocumentOptions = {},
): Promise<{ id: string }> {
	const id = options.id ?? "ki-1";
	const createdAt = options.createdAt ?? NOW;
	const updatedAt = options.updatedAt ?? createdAt;
	await db.insert(documents).values({
		id,
		scopeKind: options.scopeKind ?? "factory",
		scopeId: options.scopeId ?? null,
		title: options.title ?? "T",
		body: options.body ?? "B",
		format: options.format ?? "markdown",
		status: options.status ?? "proposed",
		version: options.version ?? 1,
		confidence: options.confidence ?? null,
		meta: options.meta ?? null,
		updatedBy: options.updatedBy ?? "agent-fac",
		createdAt,
		updatedAt,
	});
	return { id };
}
