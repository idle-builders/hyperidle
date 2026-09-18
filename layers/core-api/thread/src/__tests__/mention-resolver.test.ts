/**
 * Unit coverage for `resolveMentionsForMessage`'s two output sets — B2:
 * `mentionedIds` (every resolved mention minus the sender, used for wake)
 * must include an agent already a member, while `newParticipantIds` (used
 * only to grow membership) must not.
 */

import type { HyperIdleDb } from "@hyperidle/db";
import { describe, expect, test } from "vitest";
import type { MentionResolverDeps } from "../mention-resolver.js";
import { resolveMentionsForMessage } from "../mention-resolver.js";

const fakeDb = {} as HyperIdleDb;

function depsFor(
	rows: ReadonlyArray<{ id: string; name: string; teamId: string | null }>,
): MentionResolverDeps {
	return {
		listByIds: async () => rows,
		listByTeamIds: async () => rows,
	};
}

describe("resolveMentionsForMessage", () => {
	test("no @mentions in the text: both output sets are empty", async () => {
		const result = await resolveMentionsForMessage(
			fakeDb,
			"just plain text, no mentions",
			[],
			["human-1"],
			"human-1",
			depsFor([{ id: "human-1", name: "human-1", teamId: null }]),
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
				{ id: "human-1", name: "human-1", teamId: null },
				{ id: "agent-1", name: "agent-1", teamId: null },
			]),
		);
		expect(result.newParticipantIds).toEqual(["agent-1"]);
		expect(result.mentionedIds).toEqual(["agent-1"]);
	});

	test("a mention of an agent ALREADY a member appears in mentionedIds but NOT newParticipantIds (B2)", async () => {
		const result = await resolveMentionsForMessage(
			fakeDb,
			"hey @agent-1 already here",
			[],
			["human-1", "agent-1"],
			"human-1",
			depsFor([
				{ id: "human-1", name: "human-1", teamId: null },
				{ id: "agent-1", name: "agent-1", teamId: null },
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
			depsFor([{ id: "human-1", name: "human-1", teamId: null }]),
		);
		expect(result.newParticipantIds).toEqual([]);
		expect(result.mentionedIds).toEqual([]);
	});
});
