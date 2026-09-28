/**
 * Demo world data passes the domain schemas.
 *
 * Verifies: every seeded task parses against TaskSchema, every message payload
 * parses against its type's schema, every document has valid status/scopeKind,
 * and at least one changes row exists per object kind.
 *
 * RED on current code: root-task outcomeVerdict uses old vocabulary
 * (validated/partial/refuted) and no changes rows are seeded.
 */

import type { HyperIdleDb } from "@hyperidle/db";
import { describe, expect, test } from "@hyperidle/db/test-fixtures";
import {
	DOCUMENT_STATUSES,
	parseMessagePayload,
	SCOPE_KINDS,
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
			        done_condition, state, dependencies, thread_id, notes,
			        created_at, updated_at, outcome_verdict, outcome_summary,
			        outcome_recorded_at, outcome_recorded_by, tokens_actual_json,
			        source_document_id, completed_at, position, needs_review
			   FROM tasks`,
		);
		expect(taskRows.length).toBeGreaterThan(0);

		const failures: string[] = [];
		for (const row of taskRows) {
			const result = TaskSchema.safeParse({
				id: row.id,
				parentTaskId: row.parent_task_id ?? null,
				teamId: row.team_id,
				ownerAgentId: row.owner_agent_id ?? null,
				title: row.title,
				description: row.description ?? null,
				doneCondition: row.done_condition ?? null,
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
				needsReview: Boolean(row.needs_review),
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
			"SELECT id, type, payload FROM messages WHERE type IN ('review','plain','questionnaire','verdict')",
		);
		expect(msgRows.length).toBeGreaterThan(0);

		const failures: string[] = [];
		for (const row of msgRows) {
			const type = row.type as "plain" | "review" | "questionnaire" | "verdict";
			try {
				const p = JSON.parse(row.payload) as unknown;
				parseMessagePayload(type, p);
			} catch (e) {
				failures.push(`message ${row.id} (${row.type}): ${String(e)}`);
			}
		}
		expect(failures, failures.join("\n")).toHaveLength(0);
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
