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
		getKnowledgeItemTitle: async () => null,
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
