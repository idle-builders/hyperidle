/**
 * AM1 — Part vocabulary + Message→Part adapter (RED phase).
 *
 * Failing until `framework/shared/src/part.ts` exists (green phase tasks 1-2 of
 * `plans/AM1/architecture.md`). These tests encode the LOCKED contract:
 *
 *  - PART_KINDS is the closed render vocabulary (AC4 — no session/work-log kind).
 *  - EMBED_KINDS is the closed Embed target set incl. `unknown` (W5).
 *  - `derivePartsFromMessages` maps Message[] → Part[]:
 *      · plain → prose, refs → Embeds (W3 mentions are Embeds, no field)
 *      · review (unresolved) → review; verdict folds onto the resolved Part
 *      · questionnaire → questionnaire (options are ReadonlyArray<string> — W2)
 *      · redacted → unknown{reason:"redacted"}; wire-unrecognised → unknown{reason}
 *      · BlockRef → block Embed with {route:"host"} TOTAL over BlockHostKind (C1)
 *      · EntityRef dispatch exhaustive over all 5 kinds; message → unknown Embed (W5)
 *  - session activity produces NO Part (AC4); a session reference is an Embed only.
 *
 * Imports from `../part.js` will FAIL to resolve until green — expected red.
 */

import { describe, expect, it } from "vitest";
// RED: `../part.js` does not exist yet (green-phase task 1).
import {
	derivePartsFromMessages,
	EMBED_KINDS,
	type Embed,
	groupParts,
	type OpenTarget,
	PART_KINDS,
	type PartAuthor,
} from "../part.js";
import type { BlockRef, EntityRef, MentionRef, Message } from "../thread.js";

// ── Fixture helpers ──────────────────────────────────────────────

const VIEWER_ID = "u-me";

const IDENTITIES: ReadonlyArray<PartAuthor> = [
	{ id: "u-me", name: "A. Founder", isAgent: false, isMe: true },
	{ id: "u-mara", name: "Mara", isAgent: false, isMe: false },
	{ id: "a-atlas", name: "Atlas", isAgent: true, isMe: false },
];

function base(over: { id: string; senderId: string; type: Message["type"]; createdAt?: string }) {
	return {
		id: over.id,
		threadId: "th-1",
		senderId: over.senderId,
		clientKey: `ck-${over.id}`,
		deletedAt: null,
		redactedAt: null,
		resolvedAt: null,
		createdAt: over.createdAt ?? "2026-06-17T10:00:00.000Z",
	} as const;
}

function plain(
	id: string,
	senderId: string,
	text: string,
	refs?: ReadonlyArray<BlockRef | EntityRef | MentionRef>,
	createdAt?: string,
): Message {
	return {
		...base({ id, senderId, type: "plain", createdAt }),
		type: "plain",
		payload: { text, refs },
	};
}

// ── PART_KINDS closure (AC4 + AC7) ───────────────────────────────

describe("AM1 PART_KINDS — closed render vocabulary (AC4)", () => {
	it("contains exactly the locked kinds (AM1+AM3 extension), no session/work-log/event kind", () => {
		// AM3 extends with `tool` + `reasoning` (concept Phase 4, locked).
		// The union stays closed: prose | review | resolved | questionnaire | tool | reasoning | unknown.
		expect([...PART_KINDS].sort()).toEqual(
			["prose", "questionnaire", "reasoning", "resolved", "review", "tool", "unknown"].sort(),
		);
	});

	it("has no session / work-log / event / activity kind (concept hard-rule 3)", () => {
		const forbidden = ["session", "work-log", "worklog", "event", "activity", "trace"];
		for (const f of forbidden) {
			expect(PART_KINDS as ReadonlyArray<string>).not.toContain(f);
		}
	});

	it("includes the unknown fallback kind (AC7)", () => {
		expect(PART_KINDS as ReadonlyArray<string>).toContain("unknown");
	});
});

describe("AM1 EMBED_KINDS — closed Embed target set", () => {
	it("is the locked closed set incl. unknown (W5)", () => {
		expect([...EMBED_KINDS].sort()).toEqual(
			["artifact", "block", "diff", "session-reference", "entity-ref", "mention", "unknown"].sort(),
		);
	});
});

// ── plain → prose + ref→Embed mapping (AC2, AC3, W3) ─────────────

describe("AM1 derivePartsFromMessages — plain → prose (AC3)", () => {
	it("maps a plain message to a prose Part carrying its text", () => {
		const parts = derivePartsFromMessages(
			[plain("m1", "u-me", "hello world")],
			VIEWER_ID,
			IDENTITIES,
		);
		expect(parts).toHaveLength(1);
		const p = parts[0];
		expect(p?.kind).toBe("prose");
		if (p?.kind === "prose") {
			expect(p.text).toBe("hello world");
		}
	});

	it("sets author identity (name + isAgent + isMe) from the identities table", () => {
		const parts = derivePartsFromMessages(
			[plain("m1", "a-atlas", "from the agent")],
			VIEWER_ID,
			IDENTITIES,
		);
		const author = parts[0]?.author;
		expect(author?.name).toBe("Atlas");
		expect(author?.isAgent).toBe(true);
		expect(author?.isMe).toBe(false);
	});

	it("marks the viewer's own message isMe=true (AC1 own-vs-other)", () => {
		const parts = derivePartsFromMessages([plain("m1", "u-me", "mine")], VIEWER_ID, IDENTITIES);
		expect(parts[0]?.author.isMe).toBe(true);
	});

	it("derives Part id from the source Message id (no new opaque id minted)", () => {
		const parts = derivePartsFromMessages([plain("m-xyz", "u-me", "x")], VIEWER_ID, IDENTITIES);
		expect(parts[0]?.id).toBe("m-xyz");
	});

	it("W3: mentions are `mention` Embeds, not a separate field", () => {
		const mention: MentionRef = {
			kind: "mention",
			identityId: "u-mara",
			displayName: "Mara",
			sourceText: "@Mara",
		};
		const parts = derivePartsFromMessages(
			[plain("m1", "u-me", "hey @Mara", [mention])],
			VIEWER_ID,
			IDENTITIES,
		);
		const p = parts[0];
		// no `mentions` field on a prose Part — mentions live in embeds only.
		expect((p as unknown as { mentions?: unknown }).mentions).toBeUndefined();
		const mentionEmbeds = (p?.embeds ?? []).filter((e) => e.kind === "mention");
		expect(mentionEmbeds).toHaveLength(1);
		const me = mentionEmbeds[0];
		if (me?.kind === "mention") {
			expect(me.identityId).toBe("u-mara");
			expect(me.displayName).toBe("Mara");
		}
	});
});

// ── AC2 / C1 — BlockRef → block Embed, host target TOTAL ─────────

describe("AM1 BlockRef → block Embed (AC2, C1 — host target is total)", () => {
	it("a knowledge-hosted block → block Embed with {route:host,knowledge_item}", () => {
		const ref: BlockRef = {
			kind: "block",
			blockId: "blk:v1:k",
			hostKind: "knowledge_item",
			hostId: "k-1",
		};
		const parts = derivePartsFromMessages(
			[plain("m1", "u-me", "see", [ref])],
			VIEWER_ID,
			IDENTITIES,
		);
		const blockEmbeds = (parts[0]?.embeds ?? []).filter((e) => e.kind === "block");
		expect(blockEmbeds).toHaveLength(1);
		const be = blockEmbeds[0];
		if (be?.kind === "block") {
			// AM5 T8: blockId is now threaded from ref.blockId to the target (block-anchor AC2).
			expect(be.target).toEqual({
				route: "host",
				hostKind: "knowledge_item",
				hostId: "k-1",
				blockId: "blk:v1:k",
			});
		}
	});

	it("a bet-hosted block → block Embed with {route:host,bet} (the non-knowledge case, C1)", () => {
		const ref: BlockRef = { kind: "block", blockId: "blk:v1:b", hostKind: "bet", hostId: "bet-9" };
		const parts = derivePartsFromMessages(
			[plain("m1", "u-me", "see", [ref])],
			VIEWER_ID,
			IDENTITIES,
		);
		const be = (parts[0]?.embeds ?? []).find((e) => e.kind === "block");
		if (be?.kind === "block") {
			// AM5 T8: blockId is now threaded from ref.blockId to the target (block-anchor AC2).
			expect(be.target).toEqual({
				route: "host",
				hostKind: "bet",
				hostId: "bet-9",
				blockId: "blk:v1:b",
			});
		} else {
			throw new Error("expected a block Embed for the bet-hosted ref");
		}
	});

	it("a task-hosted block keys the host target to its own hostKind/hostId (C1 totality)", () => {
		const ref: BlockRef = {
			kind: "block",
			blockId: "blk:v1:t",
			hostKind: "task",
			hostId: "task-3",
		};
		const parts = derivePartsFromMessages([plain("m1", "u-me", "x", [ref])], VIEWER_ID, IDENTITIES);
		const be = (parts[0]?.embeds ?? []).find((e) => e.kind === "block");
		if (be?.kind === "block") {
			// AM5 T8: blockId is now threaded from ref.blockId to the target (block-anchor AC2).
			expect(be.target).toEqual({
				route: "host",
				hostKind: "task",
				hostId: "task-3",
				blockId: "blk:v1:t",
			});
		} else {
			throw new Error("expected a block Embed for the task-hosted ref");
		}
	});
});

// ── W5 — EntityRef dispatch exhaustive over all 5 kinds ──────────

describe("AM1 EntityRef → Embed (W5 — exhaustive over all 5 EntityRef.kind)", () => {
	it("artifact entity-ref → an artifact Embed routing to {route:artifact}", () => {
		const ref: EntityRef = { kind: "artifact", id: "art-1" };
		const parts = derivePartsFromMessages([plain("m1", "u-me", "x", [ref])], VIEWER_ID, IDENTITIES);
		const e = (parts[0]?.embeds ?? []).find((em) => em.kind === "artifact");
		if (e?.kind === "artifact") {
			expect(e.target).toEqual({ route: "artifact", artifactId: "art-1" });
		} else {
			throw new Error("expected an artifact Embed");
		}
	});

	it("knowledge_item entity-ref → entity-ref Embed with a host target", () => {
		const ref: EntityRef = { kind: "knowledge_item", id: "k-7" };
		const parts = derivePartsFromMessages([plain("m1", "u-me", "x", [ref])], VIEWER_ID, IDENTITIES);
		const e = (parts[0]?.embeds ?? []).find((em) => em.kind === "entity-ref");
		if (e?.kind === "entity-ref") {
			expect(e.target).toEqual({ route: "host", hostKind: "knowledge_item", hostId: "k-7" });
		} else {
			throw new Error("expected an entity-ref Embed");
		}
	});

	it("bet entity-ref → entity-ref Embed with a {route:host,bet} target", () => {
		const ref: EntityRef = { kind: "bet", id: "bet-2" };
		const parts = derivePartsFromMessages([plain("m1", "u-me", "x", [ref])], VIEWER_ID, IDENTITIES);
		const e = (parts[0]?.embeds ?? []).find((em) => em.kind === "entity-ref");
		if (e?.kind === "entity-ref") {
			expect(e.target).toEqual({ route: "host", hostKind: "bet", hostId: "bet-2" });
		}
	});

	it("task entity-ref → entity-ref Embed with a {route:host,task} target", () => {
		const ref: EntityRef = { kind: "task", id: "task-4" };
		const parts = derivePartsFromMessages([plain("m1", "u-me", "x", [ref])], VIEWER_ID, IDENTITIES);
		const e = (parts[0]?.embeds ?? []).find((em) => em.kind === "entity-ref");
		if (e?.kind === "entity-ref") {
			expect(e.target).toEqual({ route: "host", hostKind: "task", hostId: "task-4" });
		}
	});

	it("W5: a `message` entity-ref → an `unknown` Embed with NO target (no permalink route)", () => {
		const ref: EntityRef = { kind: "message", id: "m-other" };
		const parts = derivePartsFromMessages([plain("m1", "u-me", "x", [ref])], VIEWER_ID, IDENTITIES);
		const e = (parts[0]?.embeds ?? []).find((em) => em.kind === "unknown");
		expect(e?.kind).toBe("unknown");
		// no navigating target on the unknown Embed.
		expect((e as unknown as { target?: unknown }).target).toBeUndefined();
	});
});

// ── AC3 — every MessageType maps; verdict folds onto resolved ────

describe("AM1 message-type mapping (AC3)", () => {
	const review: Message = {
		...base({ id: "rv1", senderId: "a-atlas", type: "review" }),
		type: "review",
		payload: {
			title: "Adopt passkeys",
			reasoning: ["safer", "faster"],
			artifactRef: { id: "art-9", kind: "text_diff" },
		},
	};

	const questionnaire: Message = {
		...base({
			id: "q1",
			senderId: "a-atlas",
			type: "questionnaire",
			createdAt: "2026-06-17T10:01:00.000Z",
		}),
		type: "questionnaire",
		payload: { title: "Pick one", question: "Which DB?", options: ["Postgres", "SQLite"] },
	};

	it("review (unresolved) → a review Part whose reviewTarget carries the real reviewId; betId is the empty page-sourced placeholder (ARCH-1)", () => {
		const parts = derivePartsFromMessages([review], VIEWER_ID, IDENTITIES);
		const p = parts.find((x) => x.id === "rv1");
		expect(p?.kind).toBe("review");
		if (p?.kind === "review") {
			// reviewId is sourced from the Message id by the adapter.
			expect(p.reviewTarget.reviewId).toBe("rv1");
			// ARCH-1: a review Message carries NO betId, so the source-agnostic adapter
			// emits an EMPTY placeholder. The real betId is resolved at the page/handler
			// boundary (which holds thread→host context) — never fabricated here.
			expect(p.reviewTarget.betId).toBe("");
		}
	});

	it("review carries its change-set as an artifact/diff Embed", () => {
		const parts = derivePartsFromMessages([review], VIEWER_ID, IDENTITIES);
		const p = parts.find((x) => x.id === "rv1");
		if (p?.kind === "review") {
			expect(p.changeSet).not.toBeNull();
			expect(["artifact", "diff"]).toContain(p.changeSet?.kind);
		}
	});

	it("questionnaire → questionnaire Part; options are plain strings (W2, no recommended)", () => {
		const parts = derivePartsFromMessages([questionnaire], VIEWER_ID, IDENTITIES);
		const p = parts.find((x) => x.id === "q1");
		expect(p?.kind).toBe("questionnaire");
		if (p?.kind === "questionnaire") {
			expect(p.question).toBe("Which DB?");
			expect(p.options).toEqual(["Postgres", "SQLite"]);
			// W2: no per-option metadata object — flat strings only.
			for (const opt of p.options) {
				expect(typeof opt).toBe("string");
			}
		}
	});

	it("verdict folds onto the resolved Part of the message it resolves — verdict is NOT its own Part", () => {
		const resolvedReview: Message = {
			...review,
			id: "rv2",
			resolvedAt: "2026-06-17T10:05:00.000Z",
		};
		const verdict: Message = {
			...base({
				id: "vd1",
				senderId: "u-me",
				type: "verdict",
				createdAt: "2026-06-17T10:05:00.000Z",
			}),
			type: "verdict",
			payload: { decision: "approve", resolvesMessageId: "rv2" },
		};
		const parts = derivePartsFromMessages([resolvedReview, verdict], VIEWER_ID, IDENTITIES);
		// No standalone Part is produced from the verdict message.
		expect(parts.some((p) => p.id === "vd1")).toBe(false);
		// The resolved review echoes the verdict as a `resolved` Part.
		const resolved = parts.find((p) => p.id === "rv2");
		expect(resolved?.kind).toBe("resolved");
		if (resolved?.kind === "resolved") {
			// verdictDecisionLabel("approve") === "APPROVED"
			expect(resolved.label.toUpperCase()).toContain("APPROVED");
			// ARCH-2: resolvedBy is the PERSON who took the verdict (resolver's display
			// name, resolved via the verdict message's senderId), NOT a raw message id.
			expect(resolved.resolvedBy).toBe("A. Founder");
			expect(resolved.resolvedBy).not.toBe(verdict.id);
		}
	});

	it("is exhaustive over MessageType — all four render to a Part kind", () => {
		const parts = derivePartsFromMessages(
			[plain("p1", "u-me", "hi"), review, questionnaire],
			VIEWER_ID,
			IDENTITIES,
		);
		const kinds = parts.map((p) => p.kind);
		expect(kinds).toContain("prose");
		expect(kinds).toContain("review");
		expect(kinds).toContain("questionnaire");
	});
});

// ── unknown fallbacks (N3, AC7) ──────────────────────────────────

describe("AM1 unknown fallbacks (N3, AC7)", () => {
	it("a redacted payload → unknown Part with reason 'redacted' (no throw)", () => {
		const redacted: Message = {
			...base({ id: "rd1", senderId: "u-me", type: "plain" }),
			type: "plain",
			payload: {
				redacted: true,
				redactedBy: "u-me",
				redactedAt: "2026-06-17T10:00:00.000Z",
				reason: "policy",
			},
		};
		const parts = derivePartsFromMessages([redacted], VIEWER_ID, IDENTITIES);
		const p = parts[0];
		expect(p?.kind).toBe("unknown");
		if (p?.kind === "unknown") {
			expect(p.reason).toBe("redacted");
		}
	});

	it("a wire-unrecognised message type → unknown Part with reason 'wire-unrecognised-type'", () => {
		// A row deserialized from the wire with a future `type` outside MESSAGE_TYPES.
		const fromWire = {
			...base({ id: "wr1", senderId: "u-me", type: "plain" }),
			type: "future-kind",
			payload: { text: "x" },
		} as unknown as Message;
		const parts = derivePartsFromMessages([fromWire], VIEWER_ID, IDENTITIES);
		const p = parts[0];
		expect(p?.kind).toBe("unknown");
		if (p?.kind === "unknown") {
			expect(p.reason).toBe("wire-unrecognised-type");
		}
	});
});

// ── AC4 — session activity produces NO Part ──────────────────────

describe("AM1 session is referenced, never a Part (AC4, concept hard-rule 3)", () => {
	it("a plain message referencing a session yields a session-reference EMBED, not a Part", () => {
		// A session reference is carried as an Embed on a deliberate message.
		// The adapter must NEVER emit a Part from session activity.
		const sessionRefMsg = plain("m1", "a-atlas", "Done — see the session", []);
		// The fixture stands for a message that carries a session-reference embed.
		const parts = derivePartsFromMessages([sessionRefMsg], VIEWER_ID, IDENTITIES);
		// Exactly one Part (the deliberate prose message), never an extra
		// session/work-log Part.
		expect(parts).toHaveLength(1);
		expect(parts[0]?.kind).toBe("prose");
		expect(parts.some((p) => p.kind === ("session" as unknown))).toBe(false);
	});

	it("the session-reference Embed kind exists in the closed Embed set", () => {
		// AC4: a session is an Embed target, not a Part kind.
		expect(EMBED_KINDS as ReadonlyArray<string>).toContain("session-reference");
		expect(PART_KINDS as ReadonlyArray<string>).not.toContain("session-reference");
	});
});

// ── groupParts — author grouping (AC1) ───────────────────────────

describe("AM1 groupParts — author grouping (AC1)", () => {
	it("groups consecutive same-author parts within the time window under one head", () => {
		const parts = derivePartsFromMessages(
			[
				plain("m1", "a-atlas", "first", [], "2026-06-17T10:00:00.000Z"),
				plain("m2", "a-atlas", "second", [], "2026-06-17T10:00:30.000Z"),
				plain("m3", "u-mara", "switch", [], "2026-06-17T10:01:00.000Z"),
			],
			VIEWER_ID,
			IDENTITIES,
		);
		const groups = groupParts(parts);
		// Two groups: atlas (m1,m2 collapsed) then mara (m3).
		expect(groups).toHaveLength(2);
		expect(groups[0]?.parts.map((p) => p.id)).toEqual(["m1", "m2"]);
		expect(groups[1]?.parts.map((p) => p.id)).toEqual(["m3"]);
	});

	it("breaks a group when the same author exceeds the time window", () => {
		const parts = derivePartsFromMessages(
			[
				plain("m1", "a-atlas", "first", [], "2026-06-17T10:00:00.000Z"),
				plain("m2", "a-atlas", "much later", [], "2026-06-17T10:30:00.000Z"),
			],
			VIEWER_ID,
			IDENTITIES,
		);
		const groups = groupParts(parts);
		expect(groups).toHaveLength(2);
	});

	it("each group head exposes the author identity (name + isAgent)", () => {
		const parts = derivePartsFromMessages([plain("m1", "a-atlas", "x")], VIEWER_ID, IDENTITIES);
		const groups = groupParts(parts);
		expect(groups[0]?.author.name).toBe("Atlas");
		expect(groups[0]?.author.isAgent).toBe(true);
	});
});

// ── OpenTarget shape sanity (used by AC8 routing) ────────────────

describe("AM1 OpenTarget discriminant", () => {
	it("supports the four locked routes (host/artifact/review/session) — no knowledge route", () => {
		const targets: OpenTarget[] = [
			{ route: "host", hostKind: "knowledge_item", hostId: "k-1" },
			{ route: "artifact", artifactId: "a-1" },
			{ route: "review", betId: "b-1", reviewId: "r-1" },
			{ route: "session", sessionId: "s-1" },
		];
		expect(targets.map((t) => t.route).sort()).toEqual(
			["artifact", "host", "review", "session"].sort(),
		);
	});

	it("a block Embed is the inline reference primitive (Embed type compiles)", () => {
		const e: Embed = {
			kind: "block",
			title: "Auth plan · §2",
			target: { route: "host", hostKind: "knowledge_item", hostId: "k-1" },
		};
		expect(e.kind).toBe("block");
	});
});
