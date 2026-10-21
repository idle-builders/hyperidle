/**
 * Brownfield migration test for 0103 (a review is made of parts; a comment points with an anchor).
 *
 * Seeds reviews carrying the nine old canvas kinds and plain messages carrying block anchors at
 * 0102, with their thread-history rows, runs 0103, and checks what each became.
 */

import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { afterAll, describe, expect, it } from "vitest";

const DIRNAME = fileURLToPath(new URL(".", import.meta.url));
const DRIZZLE_FOLDER = resolve(DIRNAME, "../../drizzle");
const NOW = "2026-01-01T00:00:00.000Z";

function migrationsUpTo(idx: number): string {
	const tmpDir = mkdtempSync(join(tmpdir(), "drizzle-brownfield-0103-"));
	cpSync(DRIZZLE_FOLDER, tmpDir, { recursive: true });
	const journal = JSON.parse(readFileSync(join(DRIZZLE_FOLDER, "meta/_journal.json"), "utf-8")) as {
		entries: Array<{ idx: number }>;
	};
	journal.entries = journal.entries.filter((e) => e.idx <= idx);
	writeFileSync(join(tmpDir, "meta/_journal.json"), JSON.stringify(journal, null, 2));
	return tmpDir;
}

type Db = ReturnType<typeof drizzle>;

const artifact = (id: string, kind: string, payload: unknown) => ({
	id,
	tool: "github",
	app: "GitHub",
	sourceHref: "https://example.test",
	title: `The ${id}`,
	kind,
	payload,
});

const OLD_REVIEW = {
	title: "Old review",
	reasoning: ["It works."],
	artifacts: [
		artifact("page", "browser_preview", {
			url: "https://example.test/p",
			title: "P",
			previewBody: "b",
		}),
		artifact("diff", "code_diff", {
			prTitle: "Fix",
			description: "d",
			checks: [],
			files: [
				{
					path: "a.ts",
					hunks: [
						{
							header: "@@",
							lines: [
								{ kind: "ctx", oldNo: 1, newNo: 1, text: "a" },
								{ kind: "del", oldNo: 2, newNo: null, text: "b" },
								{ kind: "add", oldNo: null, newNo: 2, text: "c" },
							],
						},
					],
				},
			],
		}),
		artifact("money", "metrics_moved", {
			period: "Q1",
			headlines: [
				{ label: "MRR", prior: 10, current: 12 },
				{ label: "Churn", prior: 5, current: 3 },
				{ label: "Seats", current: 7 },
			],
			rows: [],
			tieOut: {},
			exceptions: [],
		}),
		artifact("mail", "rendered_in_context", {
			inboxRow: { sender: "Us", subject: "Your trial", preview: "p" },
			body: "Hi Sam.",
			flags: [],
		}),
		artifact("sum", "outcome_summary", { achieved: "Shipped the fix." }),
		artifact("fields", "field_change_set", { recordLabel: "Acme", fields: [], unchangedCount: 2 }),
		artifact("refund", "action_operation", { verb: "Refund" }),
		artifact("shots", "visual_diff", {}),
		artifact("tickets", "batch", { rollup: { total: 3 } }),
	],
	reviewer: "user-0103",
};

const EXPECTED_PARTS = [
	{
		id: "page",
		title: "The page",
		kind: "preview",
		label: "Live preview",
		url: "https://example.test/p",
	},
	{
		id: "diff",
		title: "The diff",
		kind: "code",
		label: "Code",
		files: [
			{
				path: "a.ts",
				hunks: [
					{
						lines: [
							{ op: "same", n: 1, text: "a" },
							{ op: "del", n: 2, text: "b" },
							{ op: "add", n: 2, text: "c" },
						],
					},
				],
			},
		],
	},
	{
		id: "money",
		title: "The money",
		kind: "numbers",
		label: "Numbers",
		figures: [
			{ label: "MRR", value: "12", change: "+2" },
			{ label: "Churn", value: "3", change: "-2" },
			{ label: "Seats", value: "7" },
		],
	},
	{
		id: "mail",
		title: "The mail",
		kind: "text",
		label: "Email",
		subject: "Your trial",
		body: "Hi Sam.",
	},
	{ id: "sum", title: "The sum", kind: "text", label: "Outcome Summary", body: "Shipped the fix." },
	{
		id: "fields",
		title: "The fields",
		kind: "text",
		label: "Field Change Set",
		body: expect.stringContaining('"recordLabel": "Acme"'),
	},
	{
		id: "refund",
		title: "The refund",
		kind: "text",
		label: "Action Operation",
		body: expect.stringContaining('"verb": "Refund"'),
	},
	{
		id: "shots",
		title: "The shots",
		kind: "text",
		label: "Visual Diff",
		body: "Nothing was stored with this part.",
	},
	{
		id: "tickets",
		title: "The tickets",
		kind: "text",
		label: "Batch",
		body: expect.stringContaining('"total": 3'),
	},
];

const MESSAGES: ReadonlyArray<{
	readonly id: string;
	readonly type: string;
	readonly payload: Record<string, unknown>;
	readonly expected: Record<string, unknown>;
}> = [
	{
		id: "m-review",
		type: "review",
		payload: OLD_REVIEW,
		expected: {
			title: "Old review",
			reasoning: ["It works."],
			reviewer: "user-0103",
			parts: EXPECTED_PARTS,
		},
	},
	{
		id: "m-review-empty",
		type: "review",
		payload: { title: "Words only", reasoning: ["Yes."], artifacts: [] },
		expected: { title: "Words only", reasoning: ["Yes."] },
	},
	{
		id: "m-block",
		type: "plain",
		payload: { text: "Why 13?", blockId: "what-we-know", spotLabel: "Day 13." },
		expected: {
			text: "Why 13?",
			anchor: { id: "m-block", part: "what-we-know", label: "Day 13." },
		},
	},
	{
		id: "m-block-bare",
		type: "plain",
		payload: { text: "Hm.", blockId: "intro" },
		expected: { text: "Hm.", anchor: { id: "m-block-bare", part: "intro", label: "intro" } },
	},
	{
		id: "m-spot",
		type: "plain",
		payload: { text: "Both dates?", spotLabel: "the heading" },
		expected: { text: "On the heading: Both dates?" },
	},
	{
		id: "m-refs",
		type: "plain",
		payload: {
			text: "See it",
			refs: [
				{ kind: "artifact", id: "page" },
				{ kind: "document", id: "d1" },
			],
		},
		expected: { text: "See it", refs: [{ kind: "document", id: "d1" }] },
	},
	{
		id: "m-refs-only-canvas",
		type: "plain",
		payload: { text: "See it", refs: [{ kind: "artifact", id: "page" }] },
		expected: { text: "See it" },
	},
	{
		id: "m-plain",
		type: "plain",
		payload: { text: "Untouched." },
		expected: { text: "Untouched." },
	},
	{
		id: "m-redacted",
		type: "review",
		payload: { redacted: true, redactedBy: "user-0103", redactedAt: NOW, reason: "oops" },
		expected: { redacted: true, redactedBy: "user-0103", redactedAt: NOW, reason: "oops" },
	},
];

describe("migration 0103: a review is made of parts; a comment points with an anchor — brownfield", () => {
	const clients: PGlite[] = [];
	const tempDirs: string[] = [];

	afterAll(async () => {
		await Promise.allSettled(clients.map((c) => c.close()));
		for (const d of tempDirs) rmSync(d, { recursive: true, force: true });
	});

	async function migrateTo(db: Db, idx: number): Promise<void> {
		const folder = migrationsUpTo(idx);
		tempDirs.push(folder);
		await migrate(db, { migrationsFolder: folder });
	}

	async function seedAt0102(rows: typeof MESSAGES): Promise<Db> {
		const client = new PGlite();
		clients.push(client);
		await client.waitReady;
		const db = drizzle(client);
		await migrateTo(db, 102);
		await db.execute(
			sql`INSERT INTO users (id, name, role, status, created_at) VALUES ('user-0103', 'Seeder', 'founder', 'active', ${NOW})`,
		);
		await db.execute(
			sql`INSERT INTO threads (id, host_kind, host_id, initiator_id, participants, last_active_at, created_at)
				VALUES ('thr-0103', 'user', 'user-0103', 'user-0103', '["user-0103"]', ${NOW}, ${NOW})`,
		);
		for (const m of rows) {
			const blockId = typeof m.payload.blockId === "string" ? m.payload.blockId : null;
			const message = { messageId: m.id, type: m.type, payload: m.payload };
			await db.execute(
				sql`INSERT INTO messages (id, sender_id, thread_id, type, payload, client_key, block_id, created_at)
					VALUES (${m.id}, 'user-0103', 'thr-0103', ${m.type}, ${JSON.stringify(m.payload)}, ${`ck-${m.id}`}, ${blockId}, ${NOW})`,
			);
			await db.execute(
				sql`INSERT INTO changes (id, object, object_id, kind, actor, before, after, at)
					VALUES (${`ch-${m.id}`}, 'thread', 'thr-0103', 'message', 'user-0103', ${JSON.stringify(message)},
						${JSON.stringify({ ...message, blockId, clientKey: `ck-${m.id}` })}, ${NOW})`,
			);
		}
		return db;
	}

	async function rowOf(db: Db, query: ReturnType<typeof sql>): Promise<Record<string, string>> {
		const result = (await db.execute(query)) as { rows: Array<Record<string, string>> };
		const row = result.rows[0];
		if (row === undefined) throw new Error("no row");
		return row;
	}

	it.each(MESSAGES)("$id: the message and its history land on the new shape", async (m) => {
		const db = await seedAt0102(MESSAGES);
		await migrateTo(db, 103);

		const stored = await rowOf(db, sql`SELECT payload FROM messages WHERE id = ${m.id}`);
		const history = await rowOf(
			db,
			sql`SELECT before, after FROM changes WHERE id = ${`ch-${m.id}`}`,
		);
		const after = JSON.parse(history.after ?? "{}");

		expect(JSON.parse(stored.payload ?? "{}")).toEqual(m.expected);
		expect(after.payload).toEqual(m.expected);
		expect(after).not.toHaveProperty("blockId");
		expect(JSON.parse(history.before ?? "{}").payload).toEqual(m.expected);
	});

	it("the block anchor column is gone", async () => {
		const db = await seedAt0102([]);
		await migrateTo(db, 103);

		const columns = (await db.execute(
			sql`SELECT column_name FROM information_schema.columns WHERE table_name = 'messages'`,
		)) as { rows: Array<{ column_name: string }> };
		expect(columns.rows.map((r) => r.column_name)).not.toContain("block_id");
	});

	it("a review whose canvases cannot be read at all stops the migration", async () => {
		const db = await seedAt0102([
			{
				id: "m-broken",
				type: "review",
				payload: { title: "Broken", reasoning: [], artifacts: "not a list" },
				expected: {},
			},
		]);
		await expect(migrateTo(db, 103)).rejects.toThrow(/still carry a review canvas/);
	});
});
