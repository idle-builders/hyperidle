/**
 * The four review canvases that had no demo data (`field_change_set`,
 * `rendered_in_context`, `batch`, `action_operation`) get real seeded rows —
 * founder ruling: no demo data in production CODE, but prefilled demo ROWS
 * are fine.
 *
 * The nine canvas renderers all already work; four of the nine had never had
 * anything to render. This proves the SEEDED DATA exists and is well-formed
 * against each kind's documented payload shape (`review-artifact.ts`'s
 * `FieldChangeSetPayload`/`RenderedInContextPayload`/`BatchPayload`/
 * `ActionOperationPayload`) — not a component render with a hand-fed
 * fixture, which the existing per-canvas `.test.tsx` files already cover.
 * `tools/setup` cannot import `layers/core-ui`'s types (governance layer
 * boundary), so the shape checks below are structural field-name checks, not
 * a type-guard import.
 */

import type { HyperIdleDb } from "@hyperidle/db";
import { describe, expect, test } from "@hyperidle/db/test-fixtures";
import { sql } from "drizzle-orm";
import { seedDemoWorld } from "../demo-fixture.js";
import { runFactoryBootstrap } from "../factory-bootstrap-runner.js";

interface ReviewArtifactRow {
	readonly kind?: unknown;
	readonly payload?: unknown;
}

async function seedWorld(db: HyperIdleDb): Promise<void> {
	await runFactoryBootstrap(db);
	await seedDemoWorld(db);
}

/** Every canvas-shaped artifact of the given `kind`, across every review message. */
async function artifactsOfKind(
	db: HyperIdleDb,
	kind: string,
): Promise<ReadonlyArray<Record<string, unknown>>> {
	const result = await db.execute(sql.raw("SELECT payload FROM messages WHERE type = 'review'"));
	const rows = (result as { rows: ReadonlyArray<{ payload: string }> }).rows;
	return rows
		.map((r) => JSON.parse(r.payload) as { artifacts?: ReadonlyArray<ReviewArtifactRow> })
		.flatMap((p) => p.artifacts ?? [])
		.filter((a): a is ReviewArtifactRow & { payload: Record<string, unknown> } => a.kind === kind)
		.map((a) => a.payload as Record<string, unknown>);
}

describe("the four unexercised review canvases get real demo rows", () => {
	test("field_change_set: at least one seeded artifact, shaped like FieldChangeSetPayload", async ({
		db,
	}) => {
		await seedWorld(db);

		const payloads = await artifactsOfKind(db, "field_change_set");
		expect(payloads.length, "at least one field_change_set artifact seeded").toBeGreaterThanOrEqual(
			1,
		);

		const payload = payloads[0]!;
		expect(typeof payload.recordLabel).toBe("string");
		expect((payload.recordLabel as string).length).toBeGreaterThan(0);
		expect(Array.isArray(payload.fields)).toBe(true);
		expect((payload.fields as unknown[]).length).toBeGreaterThan(0);
		expect(typeof payload.unchangedCount).toBe("number");
	});

	test("rendered_in_context: at least one seeded artifact, shaped like RenderedInContextPayload", async ({
		db,
	}) => {
		await seedWorld(db);

		const payloads = await artifactsOfKind(db, "rendered_in_context");
		expect(
			payloads.length,
			"at least one rendered_in_context artifact seeded",
		).toBeGreaterThanOrEqual(1);

		const payload = payloads[0]!;
		const inboxRow = payload.inboxRow as Record<string, unknown> | undefined;
		expect(inboxRow, "inboxRow present").toBeDefined();
		expect(typeof inboxRow?.sender).toBe("string");
		expect(typeof inboxRow?.subject).toBe("string");
		expect(typeof payload.body).toBe("string");
		expect((payload.body as string).length).toBeGreaterThan(0);
		expect(Array.isArray(payload.flags)).toBe(true);
	});

	test("batch: at least one seeded artifact, shaped like BatchPayload", async ({ db }) => {
		await seedWorld(db);

		const payloads = await artifactsOfKind(db, "batch");
		expect(payloads.length, "at least one batch artifact seeded").toBeGreaterThanOrEqual(1);

		const payload = payloads[0]!;
		const rollup = payload.rollup as Record<string, unknown> | undefined;
		expect(rollup, "rollup present").toBeDefined();
		expect(typeof rollup?.total).toBe("number");
		expect(Array.isArray(payload.flagged)).toBe(true);
		expect(Array.isArray(payload.auto)).toBe(true);
		expect(Array.isArray(payload.drafted)).toBe(true);
	});

	test("action_operation: at least one seeded artifact, shaped like ActionOperationPayload", async ({
		db,
	}) => {
		await seedWorld(db);

		const payloads = await artifactsOfKind(db, "action_operation");
		expect(payloads.length, "at least one action_operation artifact seeded").toBeGreaterThanOrEqual(
			1,
		);

		const payload = payloads[0]!;
		expect(typeof payload.verb).toBe("string");
		const amountWire = payload.amountWire as Record<string, unknown> | undefined;
		expect(amountWire, "amountWire present").toBeDefined();
		expect(typeof amountWire?.formatted).toBe("string");
		expect(Array.isArray(payload.blastRadius)).toBe(true);
		expect(Array.isArray(payload.receiptFields)).toBe(true);
	});
});
