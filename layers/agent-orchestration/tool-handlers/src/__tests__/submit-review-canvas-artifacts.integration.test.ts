/**
 * BA2 T4d (RED) — `submit_review`'s canvas-envelope channel: an agent
 * attaches inline canvas payloads directly, with no stored artifact or
 * `create_artifact` producer required. `.pipeline/work/BA2/architecture.md`
 * §2.8.2 B2 — the decided trade: `submit_review` validates the envelope
 * (`id`, `tool`, `app`, `sourceHref`, `title`, `kind` against the nine
 * `REVIEW_CANVAS_KINDS`) strictly, and treats `payload` as opaque. Submit
 * cannot tell an agent its payload is malformed for its kind — that is
 * discovered at render, by the honest `ReviewUnknownCanvas` fallback
 * (T4e-a, untouched here).
 *
 * This is the PRIMARY channel per ruling 13 — it is how an agent's work
 * reaches a rendered canvas at all. `submit-review-artifact-ref.integration.
 * test.ts` covers the secondary (stored-artifact) channel.
 *
 * Today `submitReviewInputSchema` has no `artifacts` field at all, and the
 * handler's branch is `if (input.artifactRef) { review } else { plain }` —
 * so an `artifacts`-only call takes the PLAIN-message branch, silently
 * dropping the array (the same class of silent drop
 * `review-artifacts-envelope-write-arm.integration.test.ts` proves one layer
 * further down, at the core-api route). Both tests below are red for that
 * reason, checked against the actual persisted row rather than only the
 * handler's return value, since a weak `result.success` check would not
 * distinguish "created a review with artifacts" from "created a plain
 * message and silently ignored artifacts" — both currently return
 * `success: true`.
 */

import * as os from "node:os";
import * as path from "node:path";
import { bets, type HyperIdleDb, messages, tasks, teams, threads, users } from "@hyperidle/db";
import { createTestDb, type TestDbHandle } from "@hyperidle/db/testing";
import { EventBus } from "@hyperidle/event-bus";
import type { ToolContext } from "@hyperidle/harness-protocol";
import * as work from "@hyperidle/work";
import { and, eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ToolHandlersPorts } from "../ports.js";
import { buildToolDefinitions } from "../tool-definitions.js";
import { STUB_TOOL_HANDLERS_PORTS } from "./stub-ports.js";

const NOW = "2026-08-28T00:00:00.000Z";

let sharedDb: HyperIdleDb;

const ports: ToolHandlersPorts = {
	...STUB_TOOL_HANDLERS_PORTS,
	coreApi: {
		...STUB_TOOL_HANDLERS_PORTS.coreApi,
		getTaskById: async (id: string) => {
			const row = await work.get(sharedDb, "task", id);
			return row ? { betId: row.betId, teamId: row.teamId, notes: row.notes ?? null } : undefined;
		},
		// BA2 T4 — the handler's create-thread branch now seeds the human via
		// this seam (see `submit-review-task-anchor.integration.test.ts`); this
		// file's own tests are about the canvas-envelope channel, not
		// participants, so `undefined` (no human found) keeps the create branch
		// deterministic without pulling in a scenario this file doesn't
		// otherwise seed.
		findSoleHumanUser: async () => undefined,
		getFirstThreadByHost: async (hostKind: string, hostId: string) => {
			const [row] = await sharedDb
				.select()
				.from(threads)
				.where(and(eq(threads.hostKind, hostKind as never), eq(threads.hostId, hostId)));
			return row
				? { id: row.id, participants: JSON.parse(row.participants) as string[] }
				: undefined;
		},
		insertThread: async (input) => {
			const id = crypto.randomUUID();
			await sharedDb.insert(threads).values({
				id,
				hostKind: input.hostKind as never,
				hostId: input.hostId,
				initiatorId: input.participants[0] ?? "agent-builder",
				participants: JSON.stringify(input.participants),
				lastActiveAt: NOW,
				createdAt: NOW,
			});
			return { id };
		},
		updateThread: async (id, updates) => {
			await sharedDb
				.update(threads)
				.set({
					...(updates.participants ? { participants: JSON.stringify(updates.participants) } : {}),
					...(updates.lastActiveAt ? { lastActiveAt: updates.lastActiveAt } : {}),
				})
				.where(eq(threads.id, id));
		},
		insertMessage: async (input, actorId) => {
			const id = crypto.randomUUID();
			await sharedDb.insert(messages).values({
				id,
				senderId: actorId,
				threadId: input.threadId,
				type: input.type,
				payload: JSON.stringify(input.payload),
				clientKey: input.clientKey,
				createdAt: NOW,
			});
			return { id };
		},
	},
};

const submitReviewTool = buildToolDefinitions(ports).find((t) => t.name === "submit_review")!;

function makeContext(
	db: HyperIdleDb,
	eventBus: EventBus,
	taskId: string,
): ToolContext<HyperIdleDb> {
	return {
		db,
		eventBus,
		agentId: "agent-builder",
		sessionId: "session-t4d-canvas",
		taskId,
		sandboxPath: path.join(os.tmpdir(), `hi-t4d-canvas-${Date.now()}`),
		ingestion: { dispose: (): void => {} },
	};
}

async function seedTeamBetTask(
	db: HyperIdleDb,
	idPrefix: string,
): Promise<{ teamId: string; betId: string; taskId: string }> {
	const teamId = `${idPrefix}-team`;
	const betId = `${idPrefix}-bet`;
	const taskId = `${idPrefix}-task`;
	await db.insert(teams).values({ id: teamId, name: teamId, phase: "build", createdAt: NOW });
	await db.insert(bets).values({
		id: betId,
		teamId,
		description: "d",
		appetite: "small",
		status: "active",
		createdAt: NOW,
	});
	await db.insert(tasks).values({
		id: taskId,
		betId,
		teamId,
		title: "T",
		state: "in_progress",
		createdAt: NOW,
		updatedAt: NOW,
	});
	return { teamId, betId, taskId };
}

async function reviewMessagesInDb(
	db: HyperIdleDb,
): Promise<ReadonlyArray<Record<string, unknown>>> {
	const rows = await db.select().from(messages);
	return rows.map((r) => ({ ...r, payload: JSON.parse(r.payload) as unknown }));
}

describe("submit_review — the canvas-envelope channel (BA2 T4d, §2.8.2 B2)", () => {
	let handle: TestDbHandle;
	let db: HyperIdleDb;
	let eventBus: EventBus;

	beforeEach(async () => {
		handle = await createTestDb();
		db = handle.db;
		sharedDb = db;
		eventBus = new EventBus();
		// `makeContext`'s `ctx.agentId` ("agent-builder") is the `insertMessage`
		// fake's `senderId` — a real row is required by the FK.
		await db.insert(users).values({
			id: "agent-builder",
			kind: "ai",
			name: "Builder",
			role: "builder",
			status: "active",
			createdAt: NOW,
		});
	});

	afterEach(async () => {
		await handle.close();
	});

	it("attaches an inline canvas payload to a real review message — not silently dropped onto a plain message", async () => {
		const { taskId } = await seedTeamBetTask(db, "t4d-canvas-happy");
		const canvasArtifact = {
			id: "t4d-canvas-happy-art",
			tool: "github",
			app: "GitHub",
			sourceHref: "https://github.example/pr/1",
			title: "The diff",
			kind: "code_diff",
			// Deliberately unusual/arbitrary payload shape — the envelope must
			// not reject it, per §2.8.2 B2's opaque-payload trade.
			payload: { anything: "goes", nested: { nope: 1 }, list: [1, 2, 3] },
		};

		const result = await submitReviewTool.handler(
			{
				title: "Please approve",
				reasoning: ["done"],
				artifacts: [canvasArtifact],
			},
			makeContext(db, eventBus, taskId),
		);

		expect(result.success).toBe(true);

		// RED today: nothing declares `artifacts` on `submitReviewInputSchema`
		// and the branch is `artifactRef`-only, so this call today creates a
		// `type:"plain"` message with the array silently gone — checked against
		// the ACTUAL persisted row, not just `result.success` (which is `true`
		// either way, so it alone would not catch the regression).
		const written = await reviewMessagesInDb(db);
		expect(written).toHaveLength(1);
		expect(written[0]?.type).toBe("review");
		const payload = written[0]?.payload as { artifacts?: unknown[] };
		expect(payload.artifacts).toEqual([canvasArtifact]);
	});

	it("refuses an envelope whose kind is not one of the nine review canvas kinds", async () => {
		const { taskId } = await seedTeamBetTask(db, "t4d-canvas-badkind");
		const badArtifact = {
			id: "t4d-canvas-badkind-art",
			tool: "github",
			app: "GitHub",
			sourceHref: "https://github.example/pr/2",
			title: "Not a canvas",
			kind: "not_a_real_canvas_kind",
			payload: { anything: "goes" },
		};

		// RED today: there is no envelope validation for `artifacts` at all —
		// the array is silently dropped (see the happy-path test above) and the
		// call falls through to the plain-message branch, succeeding instead
		// of refusing. `success: true` here is the wrong outcome, not the
		// right one for a different reason.
		const result = await submitReviewTool.handler(
			{
				title: "Please approve",
				reasoning: ["done"],
				artifacts: [badArtifact],
			},
			makeContext(db, eventBus, taskId),
		);

		expect(result.success).toBe(false);

		const written = await reviewMessagesInDb(db);
		expect(written.filter((m) => m.type === "review")).toHaveLength(0);
	});
});
