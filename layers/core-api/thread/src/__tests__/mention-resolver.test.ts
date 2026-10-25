/**
 * Unit coverage for `resolveMentionsForMessage`'s two output sets:
 * `mentionedIds` (every resolved mention minus the sender, used for wake)
 * must include an agent already a member, while `newParticipantIds` (used
 * only to grow membership) must not. The pool is the whole organisation;
 * a current participant wins a name collision over a non-participant
 * sharing the same name.
 */

import type { HyperIdleDb } from "@hyperidle/db";
import { describe, expect, test } from "vitest";
import type { MentionResolverDeps } from "../mention-resolver.js";
import { resolveMentionsForMessage } from "../mention-resolver.js";

const fakeDb = {} as HyperIdleDb;

function depsFor(
	rows: ReadonlyArray<{ id: string; name: string; role?: string }>,
): MentionResolverDeps {
	return { listEveryone: async () => rows.map((r) => ({ role: "member", ...r })) };
}

describe("resolveMentionsForMessage", () => {
	test("no @mentions in the text: both output sets are empty", async () => {
		const result = await resolveMentionsForMessage(
			fakeDb,
			"just plain text, no mentions",
			[],
			["human-1"],
			"human-1",
			depsFor([{ id: "human-1", name: "human-1" }]),
		);
		expect(result.newParticipantIds).toEqual([]);
		expect(result.mentionedIds).toEqual([]);
	});

	test("a mention of someone not yet a member appears in BOTH newParticipantIds and mentionedIds", async () => {
		const result = await resolveMentionsForMessage(
			fakeDb,
			"cc @agent-1 please look",
			[],
			["human-1"],
			"human-1",
			depsFor([
				{ id: "human-1", name: "human-1" },
				{ id: "agent-1", name: "agent-1" },
			]),
		);
		expect(result.newParticipantIds).toEqual(["agent-1"]);
		expect(result.mentionedIds).toEqual(["agent-1"]);
	});

	test("a mention of an agent ALREADY a member appears in mentionedIds but NOT newParticipantIds", async () => {
		const result = await resolveMentionsForMessage(
			fakeDb,
			"hey @agent-1 already here",
			[],
			["human-1", "agent-1"],
			"human-1",
			depsFor([
				{ id: "human-1", name: "human-1" },
				{ id: "agent-1", name: "agent-1" },
			]),
		);
		expect(result.newParticipantIds).toEqual([]);
		expect(result.mentionedIds).toEqual(["agent-1"]);
	});

	test("a self-mention is excluded from both sets", async () => {
		const result = await resolveMentionsForMessage(
			fakeDb,
			"note to self @human-1",
			[],
			["human-1"],
			"human-1",
			depsFor([{ id: "human-1", name: "human-1" }]),
		);
		expect(result.newParticipantIds).toEqual([]);
		expect(result.mentionedIds).toEqual([]);
	});

	test("a name collision: a current participant wins over a non-participant sharing the name, even when the non-participant sorts first by id", async () => {
		const result = await resolveMentionsForMessage(
			fakeDb,
			"@nova please help",
			[],
			["human-1", "z-participant-nova"],
			"human-1",
			depsFor([
				{ id: "human-1", name: "human-1" },
				// Sorts before the participant by id, and would win under a
				// plain "sorted by id, first wins" rule — but the participant
				// must win the collision.
				{ id: "a-other-nova", name: "nova" },
				{ id: "z-participant-nova", name: "nova" },
			]),
		);
		expect(result.mentionedIds).toEqual(["z-participant-nova"]);
	});

	test("a multi-word name resolves and the mention ref carries the full sourceText", async () => {
		const result = await resolveMentionsForMessage(
			fakeDb,
			"cc @My Team Agent please look",
			[],
			["human-1"],
			"human-1",
			depsFor([
				{ id: "human-1", name: "human-1" },
				{ id: "agent-team", name: "My Team Agent" },
			]),
		);
		expect(result.newParticipantIds).toEqual(["agent-team"]);
		expect(result.mentionedIds).toEqual(["agent-team"]);
		expect(result.refs).toHaveLength(1);
		expect(result.refs[0]).toMatchObject({
			kind: "mention",
			identityId: "agent-team",
			sourceText: "@My Team Agent",
		});
	});

	test("anyone in the organisation is mentionable — no shared team, not in the thread", async () => {
		const result = await resolveMentionsForMessage(
			fakeDb,
			"@Maya can you look",
			[],
			["human-1"],
			"human-1",
			depsFor([
				{ id: "human-1", name: "human-1" },
				{ id: "maya", name: "Maya" },
			]),
		);
		expect(result.mentionedIds).toEqual(["maya"]);
	});

	test("the hidden system actor is never mentionable", async () => {
		const result = await resolveMentionsForMessage(
			fakeDb,
			"@Propagation System hello",
			[],
			["human-1"],
			"human-1",
			depsFor([
				{ id: "human-1", name: "human-1" },
				{ id: "system:propagation", name: "Propagation System", role: "system" },
			]),
		);
		expect(result.mentionedIds).toEqual([]);
	});
});
