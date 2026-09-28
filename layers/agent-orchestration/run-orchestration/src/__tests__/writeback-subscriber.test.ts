import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { HyperIdleDb } from "@hyperidle/db";
import type { ActionResult, DocumentRow, DocumentView } from "@hyperidle/domain-model";
import { EventBus } from "@hyperidle/event-bus";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createWritebackProcessor } from "../writeback-processor.js";

const writeback = createWritebackProcessor();
type DocumentPort = Parameters<typeof writeback.subscribe>[0]["document"];

function ok(
	document: Partial<DocumentRow> & { readonly id: string; readonly version: number },
): ActionResult<DocumentView> {
	return {
		ok: true,
		data: {
			document,
			ancestors: [],
			children: [],
			siblings: [],
			scopeName: "Factory",
		} as DocumentView,
	};
}

describe("registerCaptureWriteback (filesystems ⚠ capture-writeback EventBus inversion)", () => {
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

	it("stops driving processWriteback after dispose()", async () => {
		const bus = new EventBus();
		const editCalls: unknown[] = [];
		const document: DocumentPort = {
			async editDocument(_caller, input) {
				editCalls.push(input);
				return ok({ id: "item-2", version: 1, format: "markdown" });
			},
			async searchDocuments() {
				throw new Error("searchDocuments should not be called in this test");
			},
		};
		const notePath = path.join(tmpDir, "knowledge", "note2.md");
		fs.writeFileSync(notePath, "goodbye writeback");

		const dispose = writeback.subscribe({ db: {} as HyperIdleDb, eventBus: bus, document });
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

		expect(editCalls).toHaveLength(0);
	});

	it("a fresh-version modify applies the text and advances the manifest to the returned version", async () => {
		const notePath = path.join(tmpDir, "knowledge", "note.md");
		fs.writeFileSync(notePath, "revised body");
		fs.writeFileSync(
			manifestPath,
			JSON.stringify({
				session_id: "sess-1",
				assembled_at: new Date().toISOString(),
				items: {
					"item-1": {
						source_path: "knowledge/note.md",
						version: 4,
						format: "markdown",
						scopeKind: "factory",
					},
				},
			}),
		);
		const editCalls: unknown[] = [];
		const document: DocumentPort = {
			async editDocument(_caller, input) {
				editCalls.push(input);
				return ok({ id: "item-1", version: 5, format: "markdown" });
			},
			async searchDocuments() {
				throw new Error("searchDocuments should not be called in this test");
			},
		};

		const result = await writeback.process(
			{
				db: {} as HyperIdleDb,
				sandboxPath: tmpDir,
				sessionId: "sess-1",
				manifestPath,
				document,
				actor: "agent-1",
			},
			[{ type: "modify", relativePath: "knowledge/note.md", fullPath: notePath }],
		);

		expect(editCalls).toEqual([{ id: "item-1", body: "revised body", version: 4 }]);
		expect(result).toMatchObject({ processed: 1, updated: 1 });
		expect(JSON.parse(fs.readFileSync(manifestPath, "utf-8")).items["item-1"].version).toBe(5);
	});

	it("a stale write is refused: the agent's text is discarded and the manifest advances to the durable version read via searchDocuments — no conflict object (founder ruling)", async () => {
		const notePath = path.join(tmpDir, "knowledge", "note.md");
		fs.writeFileSync(notePath, "competing body");
		fs.writeFileSync(
			manifestPath,
			JSON.stringify({
				session_id: "sess-1",
				assembled_at: new Date().toISOString(),
				items: {
					"item-1": {
						source_path: "knowledge/note.md",
						version: 4,
						format: "markdown",
						scopeKind: "factory",
					},
				},
			}),
		);
		const editCalls: unknown[] = [];
		const searchCalls: unknown[] = [];
		const document: DocumentPort = {
			async editDocument(_caller, input) {
				editCalls.push(input);
				return {
					ok: false,
					problems: [{ code: "stale", message: "The document changed since you read it." }],
				};
			},
			async searchDocuments(caller, input) {
				searchCalls.push({ caller, input });
				return { ok: true, data: [{ id: "item-1", version: 7 } as DocumentRow] };
			},
		};

		const result = await writeback.process(
			{
				db: {} as HyperIdleDb,
				sandboxPath: tmpDir,
				sessionId: "sess-1",
				manifestPath,
				document,
				actor: "agent-1",
			},
			[{ type: "modify", relativePath: "knowledge/note.md", fullPath: notePath }],
		);

		// The agent's competing body was OFFERED to editDocument() (the port owns
		// the refusal) but never landed — no port method commits it anywhere.
		expect(editCalls).toEqual([{ id: "item-1", body: "competing body", version: 4 }]);
		expect(searchCalls).toEqual([{ caller: { actor: "agent-1" }, input: { ids: ["item-1"] } }]);
		expect(result).toMatchObject({ processed: 1, updated: 1 });
		expect(JSON.parse(fs.readFileSync(manifestPath, "utf-8")).items["item-1"].version).toBe(7);
	});

	it("a deleted sandbox file drops the manifest entry and writes nothing", async () => {
		fs.writeFileSync(
			manifestPath,
			JSON.stringify({
				session_id: "sess-1",
				assembled_at: new Date().toISOString(),
				items: {
					"item-1": {
						source_path: "knowledge/note.md",
						version: 4,
						format: "markdown",
						scopeKind: "factory",
					},
				},
			}),
		);
		const document: DocumentPort = {
			async editDocument() {
				throw new Error("editDocument should not be called");
			},
			async searchDocuments() {
				throw new Error("searchDocuments should not be called");
			},
		};

		const result = await writeback.process(
			{
				db: {} as HyperIdleDb,
				sandboxPath: tmpDir,
				sessionId: "sess-1",
				manifestPath,
				document,
				actor: "agent-1",
			},
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
