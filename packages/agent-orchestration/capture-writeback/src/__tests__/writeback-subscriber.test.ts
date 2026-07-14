/**
 * AU19 Increment 3f: the §10.3 EventBus inversion for `filesystems ⚠
 * capture-writeback`. `writeback.ts`'s `processWriteback` itself is a
 * behavior-preserving move (previously untested in `packages/server`) — this
 * test covers the genuinely NEW code this migration introduced: the
 * `sandbox_writeback_changes_detected` subscriber wiring.
 */
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { EventBus } from "@hyperidle/shared";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { CaptureWritebackKnowledgeItem, CaptureWritebackKnowledgeWriter } from "../ports.js";
import { registerCaptureWriteback } from "../writeback-subscriber.js";

function mkKnowledgeWriter(
	created: CaptureWritebackKnowledgeItem,
): CaptureWritebackKnowledgeWriter & { readonly createCalls: unknown[] } {
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
		async recordConflict() {
			throw new Error("recordConflict should not be called in this test");
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
		const created: CaptureWritebackKnowledgeItem = { id: "item-1", version: 1, format: "markdown" };
		const knowledge = mkKnowledgeWriter(created);
		const notePath = path.join(tmpDir, "knowledge", "note.md");
		fs.writeFileSync(notePath, "hello writeback");

		registerCaptureWriteback({ db: {} as never, eventBus: bus, knowledge });

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
		const created: CaptureWritebackKnowledgeItem = { id: "item-2", version: 1, format: "markdown" };
		const knowledge = mkKnowledgeWriter(created);
		const notePath = path.join(tmpDir, "knowledge", "note2.md");
		fs.writeFileSync(notePath, "goodbye writeback");

		const dispose = registerCaptureWriteback({ db: {} as never, eventBus: bus, knowledge });
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
});
