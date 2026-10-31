/**
 * Demo world data passes the domain schemas.
 *
 * Verifies: every seeded task parses against TaskSchema, every message payload
 * parses against its type's schema, every document has valid status/scopeKind,
 * and at least one changes row exists per object kind.
 */

import type { HyperIdleDb } from "@hyperidle/db";
import { describe, expect, test } from "@hyperidle/db/test-fixtures";
import {
	DOCUMENT_STATUSES,
	documentAnchorProblems,
	parseMessagePayload,
	pinProblems,
	plainPayloadSchema,
	reviewPayloadSchema,
	SCOPE_KINDS,
	sendMessageInvariants,
	TaskSchema,
} from "@hyperidle/domain-model";
import { sql } from "drizzle-orm";
import { seedDemoWorld } from "../demo-fixture.js";
import { runFactoryBootstrap } from "../factory-bootstrap-runner.js";

async function rows<T extends Record<string, unknown>>(db: HyperIdleDb, q: string): Promise<T[]> {
	const result = await db.execute(sql.raw(q));
	return (result as { rows: T[] }).rows;
}

async function seedWorld(db: HyperIdleDb): Promise<void> {
	await runFactoryBootstrap(db);
	await seedDemoWorld(db);
}

describe("demo world schema validation", () => {
	test("every seeded task row parses against TaskSchema", async ({ db }) => {
		await seedWorld(db);

		const taskRows = await rows<Record<string, unknown>>(
			db,
			`SELECT id, parent_task_id, team_id, owner_agent_id, title, description,
			        description_format, done_when, reasons, state, dependencies, thread_id, notes,
			        created_at, updated_at, outcome_verdict, outcome_summary,
			        outcome_recorded_at, outcome_recorded_by, tokens_actual_json,
			        source_document_id, completed_at, position, paused, started_by
			   FROM tasks`,
		);
		expect(taskRows.length).toBeGreaterThan(0);

		const failures: string[] = [];
		for (const row of taskRows) {
			const doneWhenParsed: unknown = (() => {
				try {
					return JSON.parse(row.done_when as string);
				} catch {
					return [];
				}
			})();
			const reasonsParsed: unknown = (() => {
				try {
					return JSON.parse(row.reasons as string);
				} catch {
					return [];
				}
			})();
			const result = TaskSchema.safeParse({
				id: row.id,
				parentTaskId: row.parent_task_id ?? null,
				teamId: row.team_id,
				ownerAgentId: row.owner_agent_id ?? null,
				title: row.title,
				description: row.description ?? null,
				descriptionFormat: row.description_format,
				doneWhen: doneWhenParsed,
				reasons: reasonsParsed,
				state: row.state,
				dependencies: row.dependencies ?? null,
				threadId: row.thread_id,
				notes: row.notes ?? null,
				createdAt: row.created_at,
				updatedAt: row.updated_at,
				outcomeVerdict: row.outcome_verdict ?? null,
				outcomeSummary: row.outcome_summary ?? null,
				outcomeRecordedAt: row.outcome_recorded_at ?? null,
				outcomeRecordedBy: row.outcome_recorded_by ?? null,
				tokensActualJson: row.tokens_actual_json ?? null,
				sourceDocumentId: row.source_document_id ?? null,
				completedAt: row.completed_at ?? null,
				position: Number(row.position ?? 0),
				paused: row.paused ?? null,
				startedBy: row.started_by ?? null,
			});
			if (!result.success) {
				failures.push(`task ${row.id as string}: ${result.error.message}`);
			}
		}
		expect(failures, failures.join("\n")).toHaveLength(0);
	});

	test("every message payload parses against its type schema", async ({ db }) => {
		await seedWorld(db);

		const msgRows = await rows<{ id: string; type: string; payload: string }>(
			db,
			"SELECT id, type, payload FROM messages WHERE type IN ('review','plain','questionnaire','verdict','answer')",
		);
		expect(msgRows.length).toBeGreaterThan(0);

		const failures: string[] = [];
		for (const row of msgRows) {
			const type = row.type as "plain" | "review" | "questionnaire" | "verdict" | "answer";
			try {
				const p = JSON.parse(row.payload) as unknown;
				parseMessagePayload(type, p);
			} catch (e) {
				failures.push(`message ${row.id} (${row.type}): ${String(e)}`);
			}
		}
		expect(failures, failures.join("\n")).toHaveLength(0);
	});

	test("every review holds together, and every comment's pin fits a review in its own thread", async ({
		db,
	}) => {
		await seedWorld(db);

		const msgRows = await rows<{ id: string; thread_id: string; type: string; payload: string }>(
			db,
			"SELECT id, thread_id, type, payload FROM messages WHERE type IN ('review', 'plain')",
		);
		const reviews = new Map(
			msgRows
				.filter((m) => m.type === "review")
				.map((m) => [
					m.id,
					{ threadId: m.thread_id, payload: reviewPayloadSchema.parse(JSON.parse(m.payload)) },
				]),
		);
		const failures: string[] = [];
		for (const [id, { payload }] of reviews) {
			const { taskId: _, ...review } = payload;
			for (const p of sendMessageInvariants({ threadId: "t", review }, { hasCallingThread: true }))
				failures.push(`review ${id}: ${p.code} at ${p.path}`);
		}
		const anchored = msgRows.flatMap((m) => {
			const anchor =
				m.type === "plain" ? plainPayloadSchema.parse(JSON.parse(m.payload)).anchor : undefined;
			return anchor?.review
				? [{ id: m.id, threadId: m.thread_id, anchor, review: anchor.review }]
				: [];
		});
		expect(anchored.length).toBeGreaterThan(0);
		for (const { id, threadId, anchor, review } of anchored) {
			const on = reviews.get(review);
			if (on?.threadId !== threadId)
				failures.push(`comment ${id}: its review is not in its thread`);
			for (const p of pinProblems(anchor, on?.payload.parts ?? []))
				failures.push(`comment ${id}: ${p.code}`);
		}
		const docs = new Map(
			(await rows<{ id: string; body: string }>(db, "SELECT id, body FROM documents")).map((d) => [
				d.id,
				d,
			]),
		);
		const onText = msgRows.flatMap((m) => {
			const anchor =
				m.type === "plain" ? plainPayloadSchema.parse(JSON.parse(m.payload)).anchor : undefined;
			return anchor && !anchor.review ? [{ id: m.id, anchor }] : [];
		});
		expect(onText.length).toBeGreaterThan(0);
		for (const { id, anchor } of onText)
			for (const p of documentAnchorProblems(anchor, docs.get(anchor.part) ?? { id: "", body: "" }))
				failures.push(`comment ${id}: ${p.code}`);
		expect(failures, failures.join("\n")).toEqual([]);
	});

	test("every seeded document has valid status and scopeKind", async ({ db }) => {
		await seedWorld(db);

		const docRows = await rows<{ id: string; status: string; scope_kind: string }>(
			db,
			"SELECT id, status, scope_kind FROM documents WHERE id LIKE 'demo-%'",
		);
		expect(docRows.length).toBeGreaterThan(0);

		const validStatuses = new Set<string>(DOCUMENT_STATUSES);
		const validScopeKinds = new Set<string>(SCOPE_KINDS);

		const failures: string[] = [];
		for (const row of docRows) {
			if (!validStatuses.has(row.status)) {
				failures.push(`document ${row.id}: invalid status "${row.status}"`);
			}
			if (!validScopeKinds.has(row.scope_kind)) {
				failures.push(`document ${row.id}: invalid scopeKind "${row.scope_kind}"`);
			}
		}
		expect(failures, failures.join("\n")).toHaveLength(0);
	});

	test("changes rows exist for each object kind", async ({ db }) => {
		await seedWorld(db);

		for (const obj of ["task", "thread", "document", "user"] as const) {
			const count = await rows<{ c: string }>(
				db,
				`SELECT COUNT(*) AS c FROM changes WHERE object = '${obj}'`,
			);
			expect(Number(count[0]?.c ?? 0), `changes rows for object='${obj}'`).toBeGreaterThan(0);
		}
	});
});
