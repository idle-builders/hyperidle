/**
 * The shared agent-identity helper (architecture.md §8.3, B11) — pure DI unit
 * tests over fake `search_documents`/`edit_document` runners. No database:
 * `createAgentIdentityPort` never reaches `@hyperidle/document` directly, so
 * what it does with the two injected runners is exactly what is under test
 * here; the real runners are exercised through the route integration tests.
 */

import type { HyperIdleDb } from "@hyperidle/db";
import type { ActionResult, DocumentRow, DocumentView } from "@hyperidle/domain-model";
import { EventBus } from "@hyperidle/event-bus";
import { describe, expect, it } from "vitest";
import { createAgentIdentityPort } from "../agent-identity.js";

const FAKE_DB = {} as HyperIdleDb;

function makeRow(overrides: Partial<DocumentRow> = {}): DocumentRow {
	return {
		id: "doc_af_agent-1",
		title: "Atlas — identity",
		body: "You are Atlas.",
		format: "markdown",
		status: "active",
		slot: "agent_file",
		scopeKind: "user",
		scopeId: "agent-1",
		parentKind: "agent",
		parentId: "agent-1",
		position: 0,
		version: 1,
		updatedBy: "agent-1",
		createdAt: "2026-01-01T00:00:00.000Z",
		updatedAt: "2026-01-01T00:00:00.000Z",
		readCount: 0,
		lastReadAt: null,
		sessionUseCount: 0,
		lastUsedAt: null,
		discipline: null,
		icon: null,
		as: "document",
		...overrides,
	};
}

describe("createAgentIdentityPort", () => {
	it("seeds a new agent's identity at the exact doc_af_<agentId> id", async () => {
		const editInputs: Array<{ readonly id?: string }> = [];
		const port = createAgentIdentityPort({
			eventBus: new EventBus(),
			searchDocuments: async (): Promise<ActionResult<readonly DocumentRow[]>> => ({
				ok: true,
				data: [],
			}),
			editDocument: async (_ctx, input): Promise<ActionResult<DocumentView>> => {
				editInputs.push(input);
				return {
					ok: true,
					data: {
						document: makeRow(),
						ancestors: [],
						children: [],
						siblings: [],
						scopeName: "",
						followers: 0,
					},
				};
			},
		});

		const id = await port.upsertAgentIdentity(FAKE_DB, {
			agentId: "agent-1",
			title: "Atlas — identity",
			body: "You are Atlas.",
			updatedBy: "u-founder",
		});

		expect(id).toBe("doc_af_agent-1");
		expect(editInputs).toEqual([expect.objectContaining({ id: "doc_af_agent-1" })]);
	});

	it("never overwrites a person-edited body — a second create returns the existing id and calls no edit", async () => {
		const existing = makeRow({ body: "A person rewrote this." });
		let editCallCount = 0;
		const port = createAgentIdentityPort({
			eventBus: new EventBus(),
			searchDocuments: async (): Promise<ActionResult<readonly DocumentRow[]>> => ({
				ok: true,
				data: [existing],
			}),
			editDocument: async (): Promise<ActionResult<DocumentView>> => {
				editCallCount++;
				throw new Error("must not be called — the identity already exists");
			},
		});

		const id = await port.upsertAgentIdentity(FAKE_DB, {
			agentId: "agent-1",
			title: "Atlas — identity",
			body: "A freshly re-seeded body that must be discarded.",
			updatedBy: "u-founder",
		});

		expect(id).toBe(existing.id);
		expect(editCallCount).toBe(0);
	});

	it("archives every document found under the agent's parent, and nothing else", async () => {
		const children = [
			makeRow({ id: "doc_af_agent-1" }),
			makeRow({ id: "doc_note_agent-1", slot: "ordinary" }),
		];
		const archived: string[] = [];
		const port = createAgentIdentityPort({
			eventBus: new EventBus(),
			searchDocuments: async (): Promise<ActionResult<readonly DocumentRow[]>> => ({
				ok: true,
				data: children,
			}),
			editDocument: async (_ctx, input): Promise<ActionResult<DocumentView>> => {
				const id = input.id ?? "";
				archived.push(id);
				const row = makeRow({ id, status: "archived" });
				return {
					ok: true,
					data: {
						document: row,
						ancestors: [],
						children: [],
						siblings: [],
						scopeName: "",
						followers: 0,
					},
				};
			},
		});

		await port.archiveChildren(FAKE_DB, "u-founder", "agent-1");

		expect(archived).toEqual(["doc_af_agent-1", "doc_note_agent-1"]);
	});
});
