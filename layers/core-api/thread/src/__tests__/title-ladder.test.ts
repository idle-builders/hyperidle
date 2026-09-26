/**
 * Unit coverage for rung 1/2 of `resolveThreadTitles` — ownership
 * (`users.ownerUserId`), not the `ast-<userId>` id prefix, decides whether a
 * participant is the viewer's own assistant agent. An id shaped like
 * `ast-ops` proves nothing on its own: it is a readable id, not a structural
 * marker.
 */

import type { Thread as DbThread, HyperIdleDb } from "@hyperidle/db";
import { describe, expect, test } from "vitest";
import type { ParticipantIdentity, TitleLadderDeps } from "../title-ladder.js";
import { resolveThreadTitles } from "../title-ladder.js";

const fakeDb = {} as HyperIdleDb;

function threadRow(
	overrides: Partial<DbThread> & Pick<DbThread, "id" | "hostKind" | "hostId" | "participants">,
): DbThread {
	return {
		initiatorId: overrides.hostId,
		pinned: false,
		resolvedAt: null,
		lastActiveAt: "2026-01-01T00:00:00.000Z",
		createdAt: "2026-01-01T00:00:00.000Z",
		directKey: null,
		title: null,
		deletedAt: null,
		...overrides,
	};
}

function depsFor(identities: Record<string, ParticipantIdentity>): TitleLadderDeps {
	return {
		listUserNames: async () => new Map(Object.entries(identities)),
		getDocumentTitles: async () => new Map(),
	};
}

describe("resolveThreadTitles — assistant rung is ownership, not id shape", () => {
	test("rung 2 fallback (no resolved name): ownerUserId match still titles 'Assistant'", async () => {
		const row = threadRow({
			id: "t3",
			hostKind: "agent",
			hostId: "agent-nova",
			participants: JSON.stringify(["u1", "agent-nova"]),
		});
		const titles = await resolveThreadTitles(
			fakeDb,
			[row],
			"u1",
			depsFor({ "agent-nova": { name: "", ownerUserId: "u1" } }),
		);
		expect(titles.get("t3")).toBe("Assistant");
	});

	test("rung 2 fallback (no resolved name): ownerUserId mismatch titles 'Unknown participant', never inferred from id shape", async () => {
		const row = threadRow({
			id: "t4",
			hostKind: "agent",
			hostId: "ast-ops",
			participants: JSON.stringify(["u1", "ast-ops"]),
		});
		const titles = await resolveThreadTitles(
			fakeDb,
			[row],
			"u1",
			depsFor({ "ast-ops": { name: "", ownerUserId: "someone-else" } }),
		);
		expect(titles.get("t4")).toBe("Unknown participant");
	});

	test("agent-hosted two-party thread (current production shape) titles 'Assistant' for the owner, even when the agent has a real name — the rung must fire before rung 2's name lookup", async () => {
		const row = threadRow({
			id: "t5",
			hostKind: "agent",
			hostId: "agent-nova",
			participants: JSON.stringify(["u1", "agent-nova"]),
		});
		const titles = await resolveThreadTitles(
			fakeDb,
			[row],
			"u1",
			depsFor({ "agent-nova": { name: "Nova", ownerUserId: "u1" } }),
		);
		expect(titles.get("t5")).toBe("Assistant");
	});

	test("agent-hosted two-party thread titles the agent's own name for a DIFFERENT user it also DMs — rung 1 requires ownership by the requesting user, not just any owner", async () => {
		const row = threadRow({
			id: "t6",
			hostKind: "agent",
			hostId: "agent-nova",
			participants: JSON.stringify(["u2", "agent-nova"]),
		});
		const titles = await resolveThreadTitles(
			fakeDb,
			[row],
			"u2",
			depsFor({ "agent-nova": { name: "Nova", ownerUserId: "u1" } }),
		);
		expect(titles.get("t6")).toBe("Nova");
	});
});

describe("resolveThreadTitles — rung 3 (document-hosted), batched title lookup", () => {
	test("N+1 guard: three document-hosted threads make exactly ONE getDocumentTitles call", async () => {
		const calls: (readonly string[])[] = [];
		const rows = [
			threadRow({ id: "d1", hostKind: "document", hostId: "doc-1", participants: "[]" }),
			threadRow({ id: "d2", hostKind: "document", hostId: "doc-2", participants: "[]" }),
			threadRow({ id: "d3", hostKind: "document", hostId: "doc-3", participants: "[]" }),
		];
		const deps: TitleLadderDeps = {
			listUserNames: async () => new Map(),
			getDocumentTitles: async (_db, ids) => {
				calls.push(ids);
				return new Map(ids.map((id) => [id, `Title for ${id}`]));
			},
		};
		const titles = await resolveThreadTitles(fakeDb, rows, "u1", deps);

		expect(calls.length).toBe(1);
		expect(titles.get("d1")).toBe("Title for doc-1");
		expect(titles.get("d2")).toBe("Title for doc-2");
		expect(titles.get("d3")).toBe("Title for doc-3");
	});

	test("a missing/invisible host document falls back to 'Deleted document', not an error", async () => {
		const row = threadRow({
			id: "d4",
			hostKind: "document",
			hostId: "doc-gone",
			participants: "[]",
		});
		const deps: TitleLadderDeps = {
			listUserNames: async () => new Map(),
			// The runner returned ok but the document simply has no entry — this
			// is what an invisible-to-the-actor OR truly deleted document looks
			// like from the ladder's side; both fall back identically.
			getDocumentTitles: async () => new Map(),
		};
		const titles = await resolveThreadTitles(fakeDb, [row], "u1", deps);
		expect(titles.get("d4")).toBe("Deleted document");
	});

	test("no document-hosted threads in the list makes zero getDocumentTitles calls", async () => {
		const calls: (readonly string[])[] = [];
		const row = threadRow({
			id: "u9",
			hostKind: "user",
			hostId: "u1",
			participants: JSON.stringify(["u1", "u2"]),
		});
		const deps: TitleLadderDeps = {
			listUserNames: async () => new Map([["u2", { name: "Bo", ownerUserId: null }]]),
			getDocumentTitles: async (_db, ids) => {
				calls.push(ids);
				return new Map();
			},
		};
		await resolveThreadTitles(fakeDb, [row], "u1", deps);
		expect(calls.length).toBe(0);
	});
});
