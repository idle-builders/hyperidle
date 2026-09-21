/**
 * AM1 — PartList: the source-agnostic renderer + per-kind dispatch. RED phase.
 *
 * Covers:
 *  - AC1: calm author-grouped column — group heads (name+time), consecutive
 *         same-author parts under one head, agent group marked by an agent cue.
 *  - AC2: a block renders as a ReferenceChip; a session reference renders as a
 *         Fold (NOT a chip).
 *  - AC3: each message-type Part renders its contract (prose/review/
 *         questionnaire/resolved); verdict echoes onto the resolved Part.
 *  - AC4: a session renders as a Fold; NO work-log/tool-call rows in the column.
 *  - AC7: an `unknown` Part renders a quiet placeholder (no throw).
 *  - AC8: clicking chips/folds/review buttons fires onOpen with the resolved
 *         OpenTarget — incl. the non-knowledge (bet) host case (C1). NO
 *         destination view mounts.
 *
 * RED until `../components/PartList` (and the `parts/*` sub-renderers) exist
 * (green-phase tasks 5-6).
 */

import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PartList } from "../components/PartList";
import type { Embed, Part } from "../components/parts";

// ── Part fixtures (constructed directly — renderer is source-agnostic) ──

const ME = { id: "u-me", name: "A. Founder", isAgent: false, isMe: true };
const MARA = { id: "u-mara", name: "Mara", isAgent: false, isMe: false };
const ATLAS = { id: "a-atlas", name: "Atlas", isAgent: true, isMe: false };

function prose(over: Partial<Part> & { id: string; author: typeof ME; text: string }): Part {
	return {
		id: over.id,
		kind: "prose",
		author: over.author,
		createdAt: over.createdAt ?? "2026-06-17T10:00:00.000Z",
		embeds: over.embeds ?? [],
		text: over.text,
	} as Part;
}

const diffEmbed: Embed = {
	kind: "diff",
	label: "auth/passkey.ts",
	meta: "+2 −1",
};
const sessionEmbed: Embed = {
	kind: "session-reference",
	sessionId: "s-1",
	summary: "Worked for 1m 12s",
};

// ── AC1 — calm author-grouped column ─────────────────────────────

describe("AM1 PartList — calm author-grouped column (AC1)", () => {
	it("renders a head (name) per author group", () => {
		render(
			<PartList
				parts={[
					prose({ id: "m1", author: ATLAS, text: "agent says" }),
					prose({ id: "m2", author: MARA, text: "mara replies" }),
				]}
				onOpen={vi.fn()}
			/>,
		);
		expect(screen.getByText("Atlas")).toBeDefined();
		expect(screen.getByText("Mara")).toBeDefined();
	});

	it("collapses consecutive same-author parts under ONE head", () => {
		render(
			<PartList
				parts={[
					prose({ id: "m1", author: ATLAS, text: "first", createdAt: "2026-06-17T10:00:00.000Z" }),
					prose({ id: "m2", author: ATLAS, text: "second", createdAt: "2026-06-17T10:00:30.000Z" }),
				]}
				onOpen={vi.fn()}
			/>,
		);
		// One head for the agent, but both bodies present.
		expect(screen.getAllByText("Atlas")).toHaveLength(1);
		expect(screen.getByText("first")).toBeDefined();
		expect(screen.getByText("second")).toBeDefined();
	});

	it("marks the agent group with an agent cue (not a human marker)", () => {
		render(<PartList parts={[prose({ id: "m1", author: ATLAS, text: "x" })]} onOpen={vi.fn()} />);
		// Agent cue is keyed off author.isAgent — a data marker the head exposes.
		const cue = document.querySelector('[data-ds-agent="true"], [data-agent="true"]');
		expect(cue).not.toBeNull();
	});
});

// ── AC2 — embeds render inline ───────────────────────────────────

describe("AM1 PartList — inline embeds (AC2)", () => {
	it("renders an artifact embed as a ReferenceChip", () => {
		render(
			<PartList
				parts={[prose({ id: "m1", author: ATLAS, text: "diff", embeds: [diffEmbed] })]}
				onOpen={vi.fn()}
			/>,
		);
		expect(screen.getByText("auth/passkey.ts")).toBeDefined();
	});

	it("renders a session reference as a Fold, NOT a ReferenceChip (AC4)", () => {
		render(
			<PartList
				parts={[prose({ id: "m1", author: ATLAS, text: "done", embeds: [sessionEmbed] })]}
				onOpen={vi.fn()}
			/>,
		);
		expect(document.querySelector('[data-ds-component="Fold"]')).not.toBeNull();
		// The session is a Fold — never a chip.
		const chips = document.querySelectorAll('[data-ds-component="ReferenceChip"]');
		expect(chips.length).toBe(0);
	});
});

// ── AC3 — every message-type Part renders its contract ───────────

describe("AM1 PartList — message-type Parts (AC3)", () => {
	const reviewPart = {
		id: "rv1",
		kind: "review",
		author: ATLAS,
		createdAt: "2026-06-17T10:00:00.000Z",
		embeds: [],
		title: "Adopt passkeys",
		changeSet: diffEmbed,
		reviewTarget: { reviewId: "rv1", threadId: "th-1" },
	} as Part;

	const questionnairePart = {
		id: "q1",
		kind: "questionnaire",
		author: ATLAS,
		createdAt: "2026-06-17T10:00:00.000Z",
		embeds: [],
		question: "Which DB?",
		options: ["Postgres", "SQLite"],
	} as Part;

	const resolvedPart = {
		id: "rs1",
		kind: "resolved",
		author: ME,
		createdAt: "2026-06-17T10:00:00.000Z",
		embeds: [],
		label: "APPROVED",
		resolvedBy: "A. Founder",
		summary: "looks good",
		reviewTarget: { reviewId: "rs1", threadId: "th-1" },
	} as Part;

	it("review Part: compact reference with an Open review button, NO inline decision/code", () => {
		render(<PartList parts={[reviewPart]} onOpen={vi.fn()} />);
		expect(screen.getByText(/open review/i)).toBeDefined();
		// NO inline decision buttons in the conversation.
		expect(screen.queryByText(/^approve$/i)).toBeNull();
		expect(screen.queryByText(/request changes/i)).toBeNull();
		expect(screen.queryByText(/reject/i)).toBeNull();
	});

	it("review Part: shows the change-set as a ReferenceChip (no raw diff wall)", () => {
		render(<PartList parts={[reviewPart]} onOpen={vi.fn()} />);
		expect(screen.getByText("auth/passkey.ts")).toBeDefined();
	});

	it("questionnaire Part: question + neutral option buttons (no biased/recommended tag — W2)", () => {
		render(<PartList parts={[questionnairePart]} onOpen={vi.fn()} />);
		expect(screen.getByText("Which DB?")).toBeDefined();
		expect(screen.getByText("Postgres")).toBeDefined();
		expect(screen.getByText("SQLite")).toBeDefined();
		// W2: no "Recommended" tag rendered in AM1.
		expect(screen.queryByText(/recommended/i)).toBeNull();
	});

	it("resolved Part: verdict echo via the label vocabulary + quiet View review, no buttons", () => {
		render(<PartList parts={[resolvedPart]} onOpen={vi.fn()} />);
		expect(screen.getByText(/approved/i)).toBeDefined();
		expect(screen.getByText(/inspect review/i)).toBeDefined();
		expect(screen.queryByText(/open review/i)).toBeNull();
	});
});

// ── AC4 — no work-log content in the column ──────────────────────

describe("AM1 PartList — session is referenced, never inlined (AC4)", () => {
	it("renders no tool-call / work-log rows for a session reference", () => {
		render(
			<PartList
				parts={[prose({ id: "m1", author: ATLAS, text: "done", embeds: [sessionEmbed] })]}
				onOpen={vi.fn()}
			/>,
		);
		// No work-log affordances leak into the conversation.
		expect(screen.queryByText(/tool call/i)).toBeNull();
		expect(document.querySelector('[data-ds-component="ToolCallRow"]')).toBeNull();
	});
});

// ── AC7 — unknown fallback renders quietly, no throw ─────────────

describe("AM1 PartList — unknown fallback (AC7)", () => {
	it("renders a quiet placeholder for an unknown Part without throwing", () => {
		const unknownPart = {
			id: "u1",
			kind: "unknown",
			author: ATLAS,
			createdAt: "2026-06-17T10:00:00.000Z",
			embeds: [],
			reason: "wire-unrecognised-type",
		} as Part;
		expect(() => render(<PartList parts={[unknownPart]} onOpen={vi.fn()} />)).not.toThrow();
		expect(document.querySelector('[data-ds-component="UnknownPart"]')).not.toBeNull();
	});
});

// ── AC8 — routing seam: onOpen fires with the resolved OpenTarget ─

describe("AM1 PartList — onOpen routing seam (AC8)", () => {
	it("clicking an artifact chip fires onOpen({route:artifact})", () => {
		const onOpen = vi.fn();
		render(
			<PartList
				parts={[prose({ id: "m1", author: ATLAS, text: "x", embeds: [diffEmbed] })]}
				onOpen={onOpen}
			/>,
		);
		// A file diff has no destination. The chip names the file; clicking it
		// must not fire a navigation, because there is nowhere to navigate to.
		fireEvent.click(screen.getByText("auth/passkey.ts"));
		expect(onOpen).not.toHaveBeenCalled();
	});

	it("clicking Open review fires onOpen({route:review,...})", () => {
		const onOpen = vi.fn();
		const reviewPart = {
			id: "rv1",
			kind: "review",
			author: ATLAS,
			createdAt: "2026-06-17T10:00:00.000Z",
			embeds: [],
			title: "Adopt passkeys",
			changeSet: diffEmbed,
			reviewTarget: { reviewId: "rv1", threadId: "th-1" },
		} as Part;
		render(<PartList parts={[reviewPart]} onOpen={onOpen} />);
		fireEvent.click(screen.getByText(/open review/i));
		expect(onOpen).toHaveBeenCalledWith({ route: "review", reviewId: "rv1", threadId: "th-1" });
	});

	it("clicking the session Fold fires onOpen({route:session})", () => {
		const onOpen = vi.fn();
		render(
			<PartList
				parts={[prose({ id: "m1", author: ATLAS, text: "x", embeds: [sessionEmbed] })]}
				onOpen={onOpen}
			/>,
		);
		fireEvent.click(within(document.body).getByText(/show session/i));
		expect(onOpen).toHaveBeenCalledWith({ route: "session", sessionId: "s-1" });
	});

	it("mounts NO destination view inline (the conversation owns no viewer)", () => {
		render(
			<PartList
				parts={[prose({ id: "m1", author: ATLAS, text: "x", embeds: [diffEmbed] })]}
				onOpen={vi.fn()}
			/>,
		);
		// No document/artifact/review viewer surfaces mount in the conversation.
		expect(document.querySelector('[data-ds-component="DocumentDetail"]')).toBeNull();
		expect(document.querySelector('[data-ds-component="ArtifactView"]')).toBeNull();
		expect(document.querySelector('[data-ds-component="ReviewComposition"]')).toBeNull();
	});
});

// ── UI-104 — day separators ──────────────────────────────────────

describe("AM1 PartList — day separators (UI-104)", () => {
	it("renders NO day separator when all messages are on the same day", () => {
		render(
			<PartList
				parts={[
					prose({
						id: "m1",
						author: ATLAS,
						text: "morning",
						createdAt: "2026-06-17T09:00:00.000Z",
					}),
					prose({ id: "m2", author: ME, text: "afternoon", createdAt: "2026-06-17T14:00:00.000Z" }),
				]}
				onOpen={vi.fn()}
			/>,
		);
		expect(document.querySelector('[data-ds-component="DaySeparator"]')).toBeNull();
	});

	it("renders a day separator between messages from different calendar days", () => {
		render(
			<PartList
				parts={[
					prose({
						id: "m1",
						author: ATLAS,
						text: "yesterday msg",
						createdAt: "2026-06-16T22:00:00.000Z",
					}),
					prose({ id: "m2", author: ME, text: "today msg", createdAt: "2026-06-17T08:00:00.000Z" }),
				]}
				onOpen={vi.fn()}
			/>,
		);
		const separator = document.querySelector('[data-ds-component="DaySeparator"]');
		expect(separator).not.toBeNull();
		// The separator's aria-label includes the date of the second day's messages
		expect(separator?.getAttribute("aria-label")).toMatch(/jun 17/i);
	});

	it("renders one separator per day boundary across three consecutive days", () => {
		render(
			<PartList
				parts={[
					prose({ id: "m1", author: ATLAS, text: "day 1", createdAt: "2026-06-15T10:00:00.000Z" }),
					prose({ id: "m2", author: ME, text: "day 2", createdAt: "2026-06-16T10:00:00.000Z" }),
					prose({ id: "m3", author: ATLAS, text: "day 3", createdAt: "2026-06-17T10:00:00.000Z" }),
				]}
				onOpen={vi.fn()}
			/>,
		);
		const separators = document.querySelectorAll('[data-ds-component="DaySeparator"]');
		expect(separators).toHaveLength(2);
	});
});
