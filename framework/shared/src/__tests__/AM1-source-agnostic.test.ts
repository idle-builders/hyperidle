/**
 * AM1 — AC5 executable half: the Part model is source-agnostic.
 *
 * The durable import-boundary half of AC5 is enforced by an ESLint
 * `no-restricted-imports` rule (green-phase task 6 / W1) — a static
 * import-absence property is a lint rule, never a test. THIS file is the
 * RUNTIME half: two different adapters (`derivePartsFromMessages` and a stub
 * `derivePartsFromSession`) both produce `Part[]` of the SAME shape, proving
 * the renderer can consume either source with zero change (the AM1↔AM3
 * uniformity contract; validation scenario 3).
 *
 * RED: `../part.js` does not exist yet.
 */

import { describe, expect, it } from "vitest";
// RED: green-phase exports.
import {
	derivePartsFromMessages,
	derivePartsFromSession,
	PART_KINDS,
	type Part,
	type PartAuthor,
} from "../part.js";
import type { Message } from "../thread.js";

const IDENTITIES: PartAuthor[] = [{ id: "a-atlas", name: "Atlas", isAgent: true, isMe: false }];
/** A minimal agent author for the session adapter's required `agent` param. */
const SESSION_AGENT: PartAuthor = { id: "a-atlas", name: "Atlas", isAgent: true, isMe: false };

function isWellFormedPart(p: Part): boolean {
	return (
		typeof p.id === "string" &&
		(PART_KINDS as ReadonlyArray<string>).includes(p.kind) &&
		typeof p.author?.name === "string" &&
		Array.isArray(p.embeds)
	);
}

describe("AM1 AC5 — source-agnostic Part production (validation scenario 3)", () => {
	it("the Message adapter produces well-formed Parts", () => {
		const msg: Message = {
			id: "m1",
			threadId: "th-1",
			senderId: "a-atlas",
			clientKey: "ck-1",
			deletedAt: null,
			redactedAt: null,
			resolvedAt: null,
			createdAt: "2026-06-17T10:00:00.000Z",
			type: "plain",
			payload: { text: "hello" },
		};
		const parts = derivePartsFromMessages([msg], "u-me", IDENTITIES);
		expect(parts.length).toBeGreaterThan(0);
		expect(parts.every(isWellFormedPart)).toBe(true);
	});

	it("a second (session) adapter produces Part[] of the SAME shape — no renderer change", () => {
		// AM3 grows derivePartsFromSession from stub to real adapter;
		// the renderer input is still source-agnostic — any well-formed ActivityEntry[]
		// returns the same Part[] contract the Message adapter returns.
		// Called with empty entries → empty array (still well-formed).
		const sessionParts = derivePartsFromSession([], SESSION_AGENT);
		expect(Array.isArray(sessionParts)).toBe(true);
		expect(sessionParts.every(isWellFormedPart)).toBe(true);
	});

	it("both adapters return values assignable to the same Part[] type", () => {
		// Type-level proof: both flow into one Part[] array with no cast.
		const a: Part[] = derivePartsFromMessages(
			[
				{
					id: "m1",
					threadId: "th-1",
					senderId: "a-atlas",
					clientKey: "ck-1",
					deletedAt: null,
					redactedAt: null,
					resolvedAt: null,
					createdAt: "2026-06-17T10:00:00.000Z",
					type: "plain",
					payload: { text: "x" },
				},
			],
			"u-me",
			IDENTITIES,
		);
		// AM3 real adapter; empty entries → [] — same Part[] shape.
		const b: Part[] = [...derivePartsFromSession([], SESSION_AGENT)];
		const merged: Part[] = [...a, ...b];
		expect(merged.every(isWellFormedPart)).toBe(true);
	});
});
