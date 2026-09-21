import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { HyperIdleDb } from "@hyperidle/db";
import { EventBus } from "@hyperidle/event-bus";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createWritebackProcessor } from "../writeback-processor.js";

const writeback = createWritebackProcessor();
type KnowledgeWriter = Parameters<typeof writeback.subscribe>[0]["knowledge"];
type KnowledgeItem = Awaited<ReturnType<KnowledgeWriter["create"]>>;

function mkKnowledgeWriter(
	created: KnowledgeItem,
): KnowledgeWriter & { readonly createCalls: unknown[] } {
	const createCalls: unknown[] = [];
	return {
		createCalls,
		async create(_db, input) {
			createCalls.push(input);
			return created;
		},
		async update(_db, _id, _patch, _expectedVersion) {
			throw new Error("update should not be called in this test");
		},
		async reparentKnowledgeItem() {
			throw new Error("reparentKnowledgeItem should not be called in this test");
		},
	};
}

describe("registerCaptureWriteback (§10.3 filesystems ⚠ capture-writeback EventBus inversion)", () => {
	let tmpDir: string;
	let manifestPath: string;

	beforeEach(() => {
		tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "capture-writeback-test-"));
		fs.mkdirSync(path.join(tmpDir, "knowledge"), { recursive: true });
		manifestPath = path.join(tmpDir, "manifest.json");
		fs.writeFileSync(
			manifestPath,
			JSON.stringify({ session_id: "sess-1", assembled_at: new Date().toISOString(), items: {} }),
		);
	});

	afterEach(() => {
		fs.rmSync(tmpDir, { recursive: true, force: true });
	});

	it("drives processWriteback off sandbox_writeback_changes_detected, using the event's fields and the injected knowledge port", async () => {
		const bus = new EventBus();
		const created: KnowledgeItem = { id: "item-1", version: 1, format: "markdown" };
		const knowledge = mkKnowledgeWriter(created);
		const notePath = path.join(tmpDir, "knowledge", "note.md");
		fs.writeFileSync(notePath, "hello writeback");

		writeback.subscribe({ db: {} as HyperIdleDb, eventBus: bus, knowledge });

		bus.emit({
			type: "sandbox_writeback_changes_detected",
			streamId: "sess-1",
			sessionId: "sess-1",
			sandboxPath: tmpDir,
			manifestPath,
			changes: [{ type: "create", relativePath: "knowledge/note.md", fullPath: notePath }],
			timestamp: Date.now(),
		});

		// processWriteback is fire-and-forget (void ...catch) — wait a tick for it to settle.
		await new Promise((resolve) => setTimeout(resolve, 20));

		expect(knowledge.createCalls).toHaveLength(1);
		expect(knowledge.createCalls[0]).toMatchObject({
			title: "note",
			body: "hello writeback",
			updatedBy: "session:sess-1",
		});

		const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
		expect(manifest.items["item-1"]).toMatchObject({
			source_path: "knowledge/note.md",
			version: 1,
		});
	});

	it("stops driving processWriteback after dispose()", async () => {
		const bus = new EventBus();
		const created: KnowledgeItem = { id: "item-2", version: 1, format: "markdown" };
		const knowledge = mkKnowledgeWriter(created);
		const notePath = path.join(tmpDir, "knowledge", "note2.md");
		fs.writeFileSync(notePath, "goodbye writeback");

		const dispose = writeback.subscribe({ db: {} as HyperIdleDb, eventBus: bus, knowledge });
		dispose();

		bus.emit({
			type: "sandbox_writeback_changes_detected",
			streamId: "sess-1",
			sessionId: "sess-1",
			sandboxPath: tmpDir,
			manifestPath,
			changes: [{ type: "create", relativePath: "knowledge/note2.md", fullPath: notePath }],
			timestamp: Date.now(),
		});

		await new Promise((resolve) => setTimeout(resolve, 20));

		expect(knowledge.createCalls).toHaveLength(0);
	});

	it("updates tracked knowledge with the manifest version and advances the manifest", async () => {
		const notePath = path.join(tmpDir, "knowledge", "note.md");
		fs.writeFileSync(notePath, "revised body");
		fs.writeFileSync(
			manifestPath,
			JSON.stringify({
				session_id: "sess-1",
				assembled_at: new Date().toISOString(),
				items: { "item-1": { source_path: "knowledge/note.md", version: 4, format: "markdown" } },
			}),
		);
		const updateCalls: unknown[] = [];
		const knowledge: KnowledgeWriter = {
			async create() {
				throw new Error("create should not be called");
			},
			async update(_db, id, patch, expectedVersion) {
				updateCalls.push({ id, patch, expectedVersion });
				return { ok: true, item: { id, version: 5, format: "markdown" } };
			},
			async reparentKnowledgeItem() {
				throw new Error("reparentKnowledgeItem should not be called");
			},
		};

		const result = await writeback.process(
			{ db: {} as HyperIdleDb, sandboxPath: tmpDir, sessionId: "sess-1", manifestPath, knowledge },
			[{ type: "modify", relativePath: "knowledge/note.md", fullPath: notePath }],
		);

		expect(updateCalls).toEqual([
			{
				id: "item-1",
				patch: { body: "revised body", updatedBy: "session:sess-1" },
				expectedVersion: 4,
			},
		]);
		expect(result).toMatchObject({ processed: 1, updated: 1 });
		expect(JSON.parse(fs.readFileSync(manifestPath, "utf-8")).items["item-1"].version).toBe(5);
	});

	it("a stale write is refused: the agent's text is discarded and the manifest advances to the durable version (no conflict object — founder ruling)", async () => {
		const notePath = path.join(tmpDir, "knowledge", "note.md");
		fs.writeFileSync(notePath, "competing body");
		fs.writeFileSync(
			manifestPath,
			JSON.stringify({
				session_id: "sess-1",
				assembled_at: new Date().toISOString(),
				items: { "item-1": { source_path: "knowledge/note.md", version: 4, format: "markdown" } },
			}),
		);
		const updateCalls: unknown[] = [];
		const knowledge: KnowledgeWriter = {
			async create() {
				throw new Error("create should not be called");
			},
			async update(_db, id, patch, expectedVersion) {
				updateCalls.push({ id, patch, expectedVersion });
				return { ok: false, currentVersion: 7 };
			},
			async reparentKnowledgeItem() {
				throw new Error("reparentKnowledgeItem should not be called");
			},
		};

		const result = await writeback.process(
			{ db: {} as HyperIdleDb, sandboxPath: tmpDir, sessionId: "sess-1", manifestPath, knowledge },
			[{ type: "modify", relativePath: "knowledge/note.md", fullPath: notePath }],
		);

		// The agent's competing body was OFFERED to update() (the port owns the
		// refusal) but never landed — no port method commits it anywhere.
		expect(updateCalls).toEqual([
			{
				id: "item-1",
				patch: { body: "competing body", updatedBy: "session:sess-1" },
				expectedVersion: 4,
			},
		]);
		expect(result).toMatchObject({ processed: 1, updated: 1 });
		expect(JSON.parse(fs.readFileSync(manifestPath, "utf-8")).items["item-1"].version).toBe(7);
	});

	it("a deleted sandbox file drops the manifest entry and writes nothing", async () => {
		fs.writeFileSync(
			manifestPath,
			JSON.stringify({
				session_id: "sess-1",
				assembled_at: new Date().toISOString(),
				items: { "item-1": { source_path: "knowledge/note.md", version: 4, format: "markdown" } },
			}),
		);
		const knowledge: KnowledgeWriter = {
			async create() {
				throw new Error("create should not be called");
			},
			async update() {
				throw new Error("update should not be called");
			},
			async reparentKnowledgeItem() {
				throw new Error("reparentKnowledgeItem should not be called");
			},
		};

		const result = await writeback.process(
			{ db: {} as HyperIdleDb, sandboxPath: tmpDir, sessionId: "sess-1", manifestPath, knowledge },
			[
				{
					type: "delete",
					relativePath: "knowledge/note.md",
					fullPath: path.join(tmpDir, "knowledge", "note.md"),
				},
			],
		);

		expect(result).toMatchObject({ processed: 1, deleted: 1 });
		expect(JSON.parse(fs.readFileSync(manifestPath, "utf-8")).items["item-1"]).toBeUndefined();
	});
});
