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

function depsFor(identities: Record<string, string | ParticipantIdentity>): TitleLadderDeps {
	return {
		listUserNames: async () => new Map(Object.entries(identities)),
		getKnowledgeItemTitle: async () => null,
	};
}

describe("resolveThreadTitles — assistant rung is ownership, not id shape", () => {
	test("a counterpart owned by the viewer (ownerUserId === requestingUserId) titles 'Assistant', whatever its id looks like", async () => {
		const row = threadRow({
			id: "t1",
			hostKind: "user",
			hostId: "u1",
			participants: JSON.stringify(["u1", "agent-nova"]),
		});
		const titles = await resolveThreadTitles(
			fakeDb,
			[row],
			"u1",
			depsFor({ "agent-nova": { name: "Nova", ownerUserId: "u1" } }),
		);
		expect(titles.get("t1")).toBe("Assistant");
	});

	test("a counterpart shaped like an assistant id but NOT owned by the viewer (ownerUserId: null) titles by its ordinary name, never 'Assistant'", async () => {
		const row = threadRow({
			id: "t2",
			hostKind: "user",
			hostId: "u1",
			participants: JSON.stringify(["u1", "ast-ops"]),
		});
		const titles = await resolveThreadTitles(
			fakeDb,
			[row],
			"u1",
			depsFor({ "ast-ops": { name: "Ops Agent", ownerUserId: null } }),
		);
		expect(titles.get("t2")).toBe("Ops Agent");
	});

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

	test("a caller that only returns bare names (no ownership info) still resolves an ordinary DM title", async () => {
		const row = threadRow({
			id: "t5",
			hostKind: "user",
			hostId: "u1",
			participants: JSON.stringify(["u1", "human-2"]),
		});
		const titles = await resolveThreadTitles(fakeDb, [row], "u1", depsFor({ "human-2": "Riley" }));
		expect(titles.get("t5")).toBe("Riley");
	});
});
