/**
 * The writeback processor exercised against the REAL `edit_document`/
 * `search_documents` actions (`@hyperidle/document`'s `createDocumentActions`,
 * reached through `run-orchestration-test-runtime.ts`'s
 * `realDocumentWritebackPort`), never a hand-rolled Drizzle stub — bypassing
 * the real write path lets a real production defect (scope inheritance, an
 * invariant that never runs) ship behind an assertion that can't fail.
 *
 * This file lives in `core-api`'s own test directory, not
 * `run-orchestration`'s, because it needs BOTH `createWritebackProcessor`
 * (public, `run-orchestration/src/index.ts`) AND the real composed document
 * actions, and `run-orchestration` may not import `core-api` (governance
 * forbids the agent-orchestration -> core-api edge). `core-api` is the one
 * place both are legal.
 *
 * A second describe block drives the REAL `startWatcher` (real `fs.watch`)
 * end to end. It is gated behind `HYPERIDLE_REAL_FS_WATCH_TESTS=1` and
 * skipped by default, per `.claude/rules/testing.md`: "Prefer a polling
 * watcher over fs.watch in tests — fs.watch flakes. Gate any real fs.watch
 * test behind an env flag, excluded from the default run."
 */
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { listChanges } from "@hyperidle/changes";
import { documents, type HyperIdleDb, sessions, teams, users } from "@hyperidle/db";
import { EventBus } from "@hyperidle/event-bus";
import { createWritebackProcessor, startWatcher } from "@hyperidle/run-orchestration";
import { eq } from "drizzle-orm";
import { describe, expect, test, vi } from "../__testing__/test-fixtures.js";
import { realDocumentWritebackPort, seedDocument } from "./run-orchestration-test-runtime.js";

const NOW = "2026-09-21T00:00:00.000Z";
const TEAM_ID = "team-dwe";
const AGENT_ID = "agent-dwe";

function makeSandbox(): { readonly root: string; readonly manifestPath: string } {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), "document-writeback-e2e-"));
	fs.mkdirSync(path.join(root, "knowledge"), { recursive: true });
	const manifestPath = path.join(root, "manifest.json");
	fs.writeFileSync(
		manifestPath,
		JSON.stringify({ session_id: "sess-e2e", assembled_at: new Date().toISOString(), items: {} }),
	);
	return { root, manifestPath };
}

/** Seeds the team + agent every test writes back as. */
async function seedAgent(db: HyperIdleDb): Promise<void> {
	await db.insert(teams).values({ id: TEAM_ID, name: "T", createdAt: NOW });
	await db.insert(users).values({
		id: AGENT_ID,
		kind: "ai",
		name: "Writeback Agent",
		role: "builder",
		status: "active",
		teamId: TEAM_ID,
		createdAt: NOW,
	});
}

const writeback = createWritebackProcessor();

describe("document writeback end-to-end: real files, real sandbox, real database, REAL edit_document/search_documents", () => {
	test("a stale writeback: the server's body is unchanged and the manifest holds the server's version", async ({
		db,
	}) => {
		await seedAgent(db);
		const { root, manifestPath } = makeSandbox();
		const document = realDocumentWritebackPort(db, new EventBus());

		const created = await seedDocument(db, {
			title: "racing note",
			body: "Original body.",
			format: "markdown",
			status: "proposed",
			updatedBy: "test-seed",
			scopeKind: "factory",
		});

		const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as {
			items: Record<string, unknown>;
		};
		manifest.items[created.id] = {
			version: created.version,
			source_path: "knowledge/racing-note.md",
			format: "markdown",
			scopeKind: "factory",
		};
		fs.writeFileSync(manifestPath, JSON.stringify(manifest));

		// A different writer already landed first, real CAS and all — this
		// session's manifest (the original version) is now stale.
		const otherWrite = await document.editDocument(
			{ actor: AGENT_ID, sessionId: "sess-other", taskId: null, threadId: null },
			{
				id: created.id,
				body: "The durable body, written by someone else first.",
				version: created.version,
			},
		);
		expect(otherWrite.ok).toBe(true);

		const filePath = path.join(root, "knowledge", "racing-note.md");
		fs.writeFileSync(filePath, "This agent's competing edit.");

		const result = await writeback.process(
			{ db, sandboxPath: root, sessionId: "sess-e2e", manifestPath, document, actor: AGENT_ID },
			[{ type: "modify", relativePath: "knowledge/racing-note.md", fullPath: filePath }],
		);
		expect(result.updated).toBe(1);

		// The agent's competing text was NEVER applied — the server's body is
		// unchanged from the other writer's.
		const [row] = await db.select().from(documents).where(eq(documents.id, created.id));
		expect(row?.body).toBe("The durable body, written by someone else first.");
		if (!otherWrite.ok) throw new Error("setup failed");
		expect(row?.version).toBe(otherWrite.data.document.version);
		// Never a read: a writeback re-read is not a person reading a document.
		expect(row?.readCount).toBe(0);

		// The manifest carries the server's (durable) version.
		const advanced = JSON.parse(fs.readFileSync(manifestPath, "utf-8")) as {
			items: Record<string, { version: number }>;
		};
		expect(advanced.items[created.id]?.version).toBe(otherWrite.data.document.version);
	});

	test("a fresh-version writeback applies the text and writes exactly one changes row authored by the agent; readCount stays 0", async ({
		db,
	}) => {
		await seedAgent(db);
		const { root, manifestPath } = makeSandbox();
		const document = realDocumentWritebackPort(db, new EventBus());

		const created = await seedDocument(db, {
			title: "fresh note",
			body: "Original body.",
			format: "markdown",
			status: "proposed",
			updatedBy: "test-seed",
			scopeKind: "factory",
		});
		const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as {
			items: Record<string, unknown>;
		};
		manifest.items[created.id] = {
			version: created.version,
			source_path: "knowledge/fresh-note.md",
			format: "markdown",
			scopeKind: "factory",
		};
		fs.writeFileSync(manifestPath, JSON.stringify(manifest));

		const filePath = path.join(root, "knowledge", "fresh-note.md");
		fs.writeFileSync(filePath, "The agent's real edit.");

		const before = new Date().toISOString();
		const result = await writeback.process(
			{ db, sandboxPath: root, sessionId: "sess-e2e", manifestPath, document, actor: AGENT_ID },
			[{ type: "modify", relativePath: "knowledge/fresh-note.md", fullPath: filePath }],
		);
		expect(result.updated).toBe(1);

		const [row] = await db.select().from(documents).where(eq(documents.id, created.id));
		expect(row?.body).toBe("The agent's real edit.");
		expect(row?.readCount).toBe(0);

		const rows = await listChanges(db, { object: "document", objectId: created.id });
		const writebackRows = rows.filter((c) => c.at >= before);
		expect(writebackRows).toHaveLength(1);
		expect(writebackRows[0]?.actor).toBe(AGENT_ID);
	});

	test("a new file creates a document under the right parent, with the agent's own team scope — never readCount", async ({
		db,
	}) => {
		await seedAgent(db);
		const { root, manifestPath } = makeSandbox();
		const document = realDocumentWritebackPort(db, new EventBus());

		// The wrapping directory is TEAM-scoped, seeded through the real
		// repository — a created item must inherit the parent's real scope,
		// not a hardcoded "factory" fallback.
		const teamFolder = await seedDocument(db, {
			title: "pricing",
			body: "",
			format: "markdown",
			status: "proposed",
			updatedBy: "test-seed",
			scopeKind: "team",
			scopeId: TEAM_ID,
		});
		const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as {
			items: Record<string, unknown>;
		};
		manifest.items[teamFolder.id] = {
			version: teamFolder.version,
			source_path: "knowledge/pricing",
			format: "markdown",
			scopeKind: "team",
		};
		fs.mkdirSync(path.join(root, "knowledge", "pricing"), { recursive: true });
		fs.writeFileSync(manifestPath, JSON.stringify(manifest));

		const filePath = path.join(root, "knowledge", "pricing", "objections.md");
		fs.writeFileSync(filePath, "Lead with value, not discount.");

		const result = await writeback.process(
			{ db, sandboxPath: root, sessionId: "sess-e2e", manifestPath, document, actor: AGENT_ID },
			[{ type: "create", relativePath: "knowledge/pricing/objections.md", fullPath: filePath }],
		);
		expect(result.created).toBe(1);

		const childItem = await db.select().from(documents).where(eq(documents.title, "objections"));
		expect(childItem).toHaveLength(1);
		expect(childItem[0]?.parentKind).toBe("document");
		expect(childItem[0]?.parentId).toBe(teamFolder.id);
		expect(childItem[0]?.scopeKind).toBe("team");
		expect(childItem[0]?.scopeId).toBe(TEAM_ID);
		expect(childItem[0]?.readCount).toBe(0);

		// A root-level file (no wrapping directory) gets the agent's OWN team —
		// the team's own default-scope derivation, never a hardcoded "factory" —
		// because the writeback omits `scopeKind` entirely rather than guessing.
		const rootFilePath = path.join(root, "knowledge", "root-note.md");
		fs.writeFileSync(rootFilePath, "A root-level note.");
		const rootResult = await writeback.process(
			{ db, sandboxPath: root, sessionId: "sess-e2e", manifestPath, document, actor: AGENT_ID },
			[{ type: "create", relativePath: "knowledge/root-note.md", fullPath: rootFilePath }],
		);
		expect(rootResult.created).toBe(1);
		const rootRow = await db.select().from(documents).where(eq(documents.title, "root note"));
		expect(rootRow).toHaveLength(1);
		expect(rootRow[0]?.scopeKind).toBe("team");
		expect(rootRow[0]?.scopeId).toBe(TEAM_ID);
		expect(rootRow[0]?.readCount).toBe(0);
	});

	test("a deleted sandbox file drops the manifest entry and writes nothing — the document row is untouched, readCount stays 0", async ({
		db,
	}) => {
		await seedAgent(db);
		const { root, manifestPath } = makeSandbox();
		const document = realDocumentWritebackPort(db, new EventBus());

		const filePath = path.join(root, "knowledge", "deleted-note.md");
		fs.writeFileSync(filePath, "Body before the sandbox file is removed.");

		await writeback.process(
			{ db, sandboxPath: root, sessionId: "sess-e2e", manifestPath, document, actor: AGENT_ID },
			[{ type: "create", relativePath: "knowledge/deleted-note.md", fullPath: filePath }],
		);

		const [before] = await db.select().from(documents).where(eq(documents.title, "deleted note"));
		expect(before).toBeDefined();

		fs.rmSync(filePath);
		const result = await writeback.process(
			{ db, sandboxPath: root, sessionId: "sess-e2e", manifestPath, document, actor: AGENT_ID },
			[{ type: "delete", relativePath: "knowledge/deleted-note.md", fullPath: filePath }],
		);
		expect(result.deleted).toBe(1);

		// The document row is byte-identical — a deleted sandbox file is not a
		// document deletion, and nothing was written to it.
		const [after] = await db
			.select()
			.from(documents)
			.where(eq(documents.id, before?.id ?? ""));
		expect(after).toEqual(before);
		expect(after?.readCount).toBe(0);

		const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8")) as {
			items: Record<string, unknown>;
		};
		expect(manifest.items[before?.id ?? ""]).toBeUndefined();
	});

	test("moving a real materialised file changes its parent through a real edit_document call — body untouched, readCount stays 0", async ({
		db,
	}) => {
		await seedAgent(db);
		const { root, manifestPath } = makeSandbox();
		const document = realDocumentWritebackPort(db, new EventBus());

		fs.mkdirSync(path.join(root, "knowledge", "old-home"), { recursive: true });
		fs.mkdirSync(path.join(root, "knowledge", "new-home"), { recursive: true });
		const originalPath = path.join(root, "knowledge", "old-home", "note_a1b2c3d4.md");
		fs.writeFileSync(originalPath, "The original body.");

		await writeback.process(
			{ db, sandboxPath: root, sessionId: "sess-e2e", manifestPath, document, actor: AGENT_ID },
			[
				{
					type: "create",
					relativePath: "knowledge/old-home/note_a1b2c3d4.md",
					fullPath: originalPath,
				},
			],
		);

		const beforeMove = await db
			.select()
			.from(documents)
			.where(eq(documents.title, "note a1b2c3d4"));
		expect(beforeMove).toHaveLength(1);
		const itemId = beforeMove[0]?.id;

		fs.rmSync(originalPath);
		const movedPath = path.join(root, "knowledge", "new-home", "note_a1b2c3d4.md");
		fs.writeFileSync(movedPath, "The original body.");

		await writeback.process(
			{ db, sandboxPath: root, sessionId: "sess-e2e", manifestPath, document, actor: AGENT_ID },
			[
				{
					type: "delete",
					relativePath: "knowledge/old-home/note_a1b2c3d4.md",
					fullPath: originalPath,
				},
				{
					type: "create",
					relativePath: "knowledge/new-home/note_a1b2c3d4.md",
					fullPath: movedPath,
				},
			],
		);

		const allWithTitle = await db
			.select()
			.from(documents)
			.where(eq(documents.title, "note a1b2c3d4"));
		expect(allWithTitle).toHaveLength(1);

		const afterMove = await db
			.select()
			.from(documents)
			.where(eq(documents.id, itemId ?? ""));
		expect(afterMove).toHaveLength(1);
		expect(afterMove[0]?.body).toBe("The original body.");
		expect(afterMove[0]?.readCount).toBe(0);

		const newHomeFolder = await db.select().from(documents).where(eq(documents.title, "new-home"));
		expect(newHomeFolder.length).toBeGreaterThan(0);
		expect(afterMove[0]?.parentId).toBe(newHomeFolder[0]?.id);
	});
});

// ---------------------------------------------------------------------------
// Gated: the REAL file watcher (real fs.watch), end to end.
// ---------------------------------------------------------------------------

const REAL_FS_WATCH = process.env.HYPERIDLE_REAL_FS_WATCH_TESTS === "1";

describe.skipIf(!REAL_FS_WATCH)(
	"document writeback end-to-end: the REAL watcher (fs.watch) — gated, HYPERIDLE_REAL_FS_WATCH_TESTS=1",
	() => {
		test("writing a file under knowledge/ is detected by the real watcher and lands in the real database", async ({
			db,
			eventBus,
		}) => {
			await seedAgent(db);
			await db.insert(sessions).values({
				id: "sess-real-watch",
				agentId: AGENT_ID,
				modelTier: "small",
				state: "running",
				startedAt: NOW,
			});
			const { root, manifestPath } = makeSandbox();
			const document = realDocumentWritebackPort(db, eventBus);

			const dispose = writeback.subscribe({ db, eventBus, document });
			const watcher = startWatcher({
				sandboxPath: root,
				sessionId: "sess-real-watch",
				manifestPath,
				eventBus,
				debounceMs: 50,
				onError: (err) => {
					throw err;
				},
			});

			try {
				const filePath = path.join(root, "knowledge", "objections.md");
				fs.writeFileSync(filePath, "Lead with value, not discount.");

				// The debounce + real fs event delivery is not instantaneous —
				// poll for the real row instead of a fixed sleep.
				await vi.waitFor(
					async () => {
						const rows = await db.select().from(documents).where(eq(documents.title, "objections"));
						expect(rows.length).toBeGreaterThan(0);
					},
					{ timeout: 10_000 },
				);
			} finally {
				watcher.stop();
				dispose();
			}
		});
	},
);
