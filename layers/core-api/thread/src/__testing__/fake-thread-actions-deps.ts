import { and, eq, inArray } from "drizzle-orm";
import { changes, teams, users, type NewChange, type WriteExecutor } from "@hyperidle/db";
import { vi } from "vitest";
import type { ReviewVerdictOutcome } from "@hyperidle/domain-model";
import type { ThreadActionsDeps } from "../thread-actions.js";

/**
 * `thread-actions.ts` reaches every sibling Service (users, org, settings,
 * agents, document search) through an injected port, never a direct
 * dependency - `@hyperidle/thread`'s own `package.json` names none of them.
 * Its tests can't build the real ones either, so this is a hand-rolled
 * stand-in: real reads against the shared schema for the parts thread's own
 * rules actually branch on, spies for the two recorders and the review-gate
 * link (their real effects belong to agent-orchestration, not thread).
 */
export function fakeThreadActionsDeps(overrides: Partial<ThreadActionsDeps> = {}): ThreadActionsDeps {
	return {
		changes: {
			appendChange: async (exec, row) => {
				await exec.insert(changes).values(row as NewChange);
			},
		},
		users: {
			getUserById: async (exec, id) => (await exec.select().from(users).where(eq(users.id, id)))[0],
			listByIds: async (exec, ids) =>
				ids.length ? exec.select().from(users).where(inArray(users.id, [...ids])) : [],
			listByTeamIds: async (exec, teamIds) =>
				teamIds.length ? exec.select().from(users).where(inArray(users.teamId, [...teamIds])) : [],
			listOwnedBy: async (exec, ownerId) =>
				exec.select().from(users).where(eq(users.ownerUserId, ownerId)),
			soleHumanForAgent: (exec, agentId) => soleHumanForAgent(exec, agentId),
		},
		// A real cross-module document lookup is the layer's job (the ONE door
		// onto `document`, per thread-actions.ts's own deps comment) - tests
		// that need a real answer here stay layer-side; this fake never sees one.
		searchDocuments: async () => ({ ok: true, data: [] }),
		org: { getTeam: async (exec, q) => (await exec.select().from(teams).where(eq(teams.id, q.id)))[0] },
		settings: { readServerConfig: async () => ({ harnessDisabled: [] }) },
		agents: {
			requireRunnableAgent: async (db, agentId) => {
				const [row] = await db.select().from(users).where(eq(users.id, agentId));
				if (!row || row.kind !== "ai" || !["active", "idle"].includes(row.status)) {
					throw new Error(`Agent ${agentId} is not a runnable AI agent`);
				}
				return row;
			},
			getAgentIdentity: async () => null,
		},
		// Real work-intent submission and review-gate linking belong to
		// agent-orchestration - these spies let a thread test prove it CALLED
		// the port correctly without asserting on that other module's tables.
		agentWorkIntentRecorder: vi.fn(async (input) => ({ id: "fake", idempotencyKey: input.idempotencyKey })),
		reviewVerdictRecorder: vi.fn(
			async (): Promise<ReviewVerdictOutcome> => ({
				status: "not_resumable",
				reason: "fake reviewVerdictRecorder: no agent-orchestration gate in this test",
			}),
		),
		linkReviewToSession: vi.fn(async () => undefined),
		...overrides,
	};
}

/** Team-then-any-human ladder, first by `(createdAt, id)` - mirrors compose.ts's real rule. */
async function soleHumanForAgent(exec: WriteExecutor, agentId: string) {
	const byCreated = (a: { createdAt: string; id: string }, b: { createdAt: string; id: string }) =>
		a.createdAt === b.createdAt ? a.id.localeCompare(b.id) : a.createdAt.localeCompare(b.createdAt);
	const [agent] = await exec.select().from(users).where(eq(users.id, agentId));
	if (agent?.teamId) {
		const teamHumans = await exec
			.select()
			.from(users)
			.where(and(eq(users.kind, "human"), eq(users.teamId, agent.teamId)));
		if (teamHumans.length > 0) return [...teamHumans].sort(byCreated)[0];
	}
	const anyHumans = await exec.select().from(users).where(eq(users.kind, "human"));
	return [...anyHumans].sort(byCreated)[0];
}
