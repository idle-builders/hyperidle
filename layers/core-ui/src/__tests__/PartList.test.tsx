/**
 * PartList: the source-agnostic renderer + per-kind dispatch.
 *
 * Covers: a calm author-grouped column — group heads (name+time),
 * consecutive same-author parts under one head, agent groups marked by an
 * agent cue; a block renders as a ReferenceChip while a session reference
 * renders as a Fold (NOT a chip); each message-type Part renders its own
 * contract (prose/review/questionnaire/resolved), and a verdict echoes onto
 * the resolved Part; a session renders as a Fold with no work-log/tool-call
 * rows in the column; an `unknown` Part renders a quiet placeholder (no
 * throw); clicking chips/folds/review buttons fires onOpen with the
 * resolved OpenTarget — including the non-document (task) host case — and
 * no destination view mounts.
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

// ── calm author-grouped column ─────────────────────────────

describe("PartList — calm author-grouped column", () => {
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

// ── embeds render inline ───────────────────────────────────

describe("PartList — inline embeds", () => {
	it("renders an artifact embed as a ReferenceChip", () => {
		render(
			<PartList
				parts={[prose({ id: "m1", author: ATLAS, text: "diff", embeds: [diffEmbed] })]}
				onOpen={vi.fn()}
			/>,
		);
		expect(screen.getByText("auth/passkey.ts")).toBeDefined();
	});

	it("renders a session reference as a Fold, NOT a ReferenceChip", () => {
		render(
			<PartList
				parts={[prose({ id: "m1", author: ATLAS, text: "done", embeds: [sessionEmbed] })]}
				onOpen={vi.fn()}
			/>,
		);
		expect(screen.getByRole("button", { name: /show/i })).toBeInTheDocument();
		// The session is a Fold — never a chip.
		const chips = document.querySelectorAll('[data-ds-component="ReferenceChip"]');
		expect(chips.length).toBe(0);
	});
});

// ── every message-type Part renders its contract ───────────

describe("PartList — message-type Parts", () => {
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

	it("questionnaire Part: question + neutral option buttons, no biased/recommended tag", () => {
		render(<PartList parts={[questionnairePart]} onOpen={vi.fn()} />);
		expect(screen.getByText("Which DB?")).toBeDefined();
		expect(screen.getByText("Postgres")).toBeDefined();
		expect(screen.getByText("SQLite")).toBeDefined();
		// no "Recommended" tag rendered.
		expect(screen.queryByText(/recommended/i)).toBeNull();
	});

	it("resolved Part: verdict echo via the label vocabulary + quiet View review, no buttons", () => {
		render(<PartList parts={[resolvedPart]} onOpen={vi.fn()} />);
		expect(screen.getByText(/approved/i)).toBeDefined();
		expect(screen.getByText(/inspect review/i)).toBeDefined();
		expect(screen.queryByText(/open review/i)).toBeNull();
	});
});

// ── no work-log content in the column ──────────────────────

describe("PartList — session is referenced, never inlined", () => {
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

// ── unknown fallback renders quietly, no throw ─────────────

describe("PartList — unknown fallback", () => {
	it("renders a quiet placeholder for an unknown Part without throwing", () => {
		const unknownPart = {
			id: "u1",
			kind: "unknown",
			author: ATLAS,
			createdAt: "2026-06-17T10:00:00.000Z",
			embeds: [],
			reason: "wire-unrecognised-type",
		} as Part;
		render(<PartList parts={[unknownPart]} onOpen={vi.fn()} />);
		expect(screen.getByText("Unsupported message")).toBeInTheDocument();
	});
});

// ── AC8 — routing seam: onOpen fires with the resolved OpenTarget ─

describe("PartList — onOpen routing seam", () => {
	it("clicking a file-diff chip does not fire onOpen (no destination to navigate to)", () => {
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

// ── day separators ──────────────────────────────────────

describe("PartList — day separators", () => {
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
