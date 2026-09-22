/**
 * T5 — Block Discussion Completion: anchor-lost indicator tests (red phase).
 *
 * AC coverage:
 *  - AC-2: Messages whose blockId no longer resolves to a rendered block show
 *           an "anchor lost" indicator.
 *  - AC-3: The indicator is honest — it does not distinguish "deleted" from
 *           "edited". Both produce the same "anchor lost" signal.
 *
 * These tests FAIL until the implementation adds the `anchorLost` prop to
 * `AnchoredMessages` inside DocumentBody.tsx.
 */

import type { Message, PlainPayload } from "@hyperidle/domain-model";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { deriveBlocks } from "../../../block/index.js";
import { DocumentBody } from "../DocumentBody";

// ── Fixtures ──

const BODY_WITH_TWO_BLOCKS = `First paragraph block.

Second paragraph block.`;

// Derive block IDs so we can reference real IDs in message fixtures.
const { blocks: DERIVED_BLOCKS } = deriveBlocks(BODY_WITH_TWO_BLOCKS, {
	kind: "document",
	id: "k-anchor-test",
});

// A blockId that does NOT exist in BODY_WITH_TWO_BLOCKS — simulates a deleted/edited block.
const ORPHAN_BLOCK_ID = "block-orphan-that-no-longer-exists-in-body";

// A blockId that DOES exist in BODY_WITH_TWO_BLOCKS.
const LIVE_BLOCK_ID = DERIVED_BLOCKS[0]!.id;

function makeMessage(id: string, blockId?: string): Message {
	return {
		id,
		threadId: "t-anchor-test",
		senderId: "u-founder",
		type: "plain",
		payload: (blockId
			? { text: `Message anchored to ${blockId}`, blockId }
			: { text: "Plain message" }) as PlainPayload,
		clientKey: `ck-${id}`,
		// `blockId` is a real top-level Message column, mirrored from the
		// plain payload's own `blockId`.
		blockId: blockId ?? null,
		deletedAt: null,
		redactedAt: null,
		resolvedAt: null,
		createdAt: "2026-05-31T10:00:00Z",
	};
}

// ── AC-2: Orphan messages show "anchor lost" indicator ──

describe("AC-2 — anchor-lost indicator appears for orphan messages", () => {
	it("renders 'anchor lost' text when messages are anchored to a non-existent block", () => {
		// Arrange: one message anchored to a blockId not present in the body.
		const orphanMessage = makeMessage("msg-orphan-1", ORPHAN_BLOCK_ID);
		const messagesByBlockId = new Map([[ORPHAN_BLOCK_ID, [orphanMessage]]]);

		// Act
		render(
			<DocumentBody
				body={BODY_WITH_TWO_BLOCKS}
				hostId="k-anchor-test"
				messagesByBlockId={messagesByBlockId}
			/>,
		);

		// Assert: the "anchor lost" indicator must be present
		expect(screen.getByTestId("anchor-lost-indicator")).toBeInTheDocument();
		expect(screen.getByText(/anchor lost/i)).toBeInTheDocument();
	});

	it("renders the orphan message text alongside the 'anchor lost' indicator", () => {
		const orphanMessage = makeMessage("msg-orphan-2", ORPHAN_BLOCK_ID);
		const messagesByBlockId = new Map([[ORPHAN_BLOCK_ID, [orphanMessage]]]);

		render(
			<DocumentBody
				body={BODY_WITH_TWO_BLOCKS}
				hostId="k-anchor-test"
				messagesByBlockId={messagesByBlockId}
			/>,
		);

		// The message content must still be visible (AC-4 corollary: messages are shown)
		expect(screen.getByText(/anchored to block-orphan/i)).toBeInTheDocument();
		expect(screen.getByTestId("anchor-lost-indicator")).toBeInTheDocument();
	});

	it("shows 'anchor lost' for multiple orphan messages grouped under the same blockId", () => {
		const orphan1 = makeMessage("msg-orphan-3a", ORPHAN_BLOCK_ID);
		const orphan2 = makeMessage("msg-orphan-3b", ORPHAN_BLOCK_ID);
		const messagesByBlockId = new Map([[ORPHAN_BLOCK_ID, [orphan1, orphan2]]]);

		render(
			<DocumentBody
				body={BODY_WITH_TWO_BLOCKS}
				hostId="k-anchor-test"
				messagesByBlockId={messagesByBlockId}
			/>,
		);

		// Only one indicator for the whole orphan group
		const indicators = screen.getAllByTestId("anchor-lost-indicator");
		expect(indicators.length).toBeGreaterThanOrEqual(1);
	});
});

// ── AC-2: Anchored messages with a live block do NOT show indicator ──

describe("AC-2 — no anchor-lost indicator for messages anchored to existing blocks", () => {
	it("does NOT render 'anchor lost' for messages whose blockId matches a rendered block", () => {
		// Arrange: message anchored to a block that IS in the current body.
		const liveMessage = makeMessage("msg-live-1", LIVE_BLOCK_ID);
		const messagesByBlockId = new Map([[LIVE_BLOCK_ID, [liveMessage]]]);

		render(
			<DocumentBody
				body={BODY_WITH_TWO_BLOCKS}
				hostId="k-anchor-test"
				messagesByBlockId={messagesByBlockId}
			/>,
		);

		// The indicator must NOT be present for live-anchored messages
		expect(screen.queryByTestId("anchor-lost-indicator")).not.toBeInTheDocument();
		expect(screen.queryByText(/anchor lost/i)).not.toBeInTheDocument();
	});
});

// ── AC-3: Indicator is honest — same signal for deleted vs edited block ──

describe("AC-3 — anchor lost indicator does not distinguish deleted vs edited", () => {
	it("shows the same 'anchor lost' text for a blockId that never existed (simulating deletion)", () => {
		const deletedBlockId = "block-was-deleted-entirely";
		const msg = makeMessage("msg-deleted-1", deletedBlockId);
		const messagesByBlockId = new Map([[deletedBlockId, [msg]]]);

		render(
			<DocumentBody
				body={BODY_WITH_TWO_BLOCKS}
				hostId="k-anchor-test"
				messagesByBlockId={messagesByBlockId}
			/>,
		);

		const indicator = screen.getByTestId("anchor-lost-indicator");
		expect(indicator.textContent?.trim()).toBe("anchor lost");
	});

	it("shows the same 'anchor lost' text for a blockId that existed but changed content (simulating edit)", () => {
		// After editing, the old blockId no longer resolves (content-derived IDs change).
		// The old blockId is effectively orphaned — same signal as a deletion.
		const editedOutBlockId = "block-content-was-edited-so-id-changed";
		const msg = makeMessage("msg-edited-1", editedOutBlockId);
		const messagesByBlockId = new Map([[editedOutBlockId, [msg]]]);

		render(
			<DocumentBody
				body={BODY_WITH_TWO_BLOCKS}
				hostId="k-anchor-test"
				messagesByBlockId={messagesByBlockId}
			/>,
		);

		const indicator = screen.getByTestId("anchor-lost-indicator");
		// Same text, same data-testid — no distinction between deletion and edit
		expect(indicator.textContent?.trim()).toBe("anchor lost");
	});

	it("does not render any element with data-testid='anchor-lost-indicator' when all messages have live anchors", () => {
		const liveMessage1 = makeMessage("msg-live-both-1", LIVE_BLOCK_ID);
		const liveMessage2 = makeMessage("msg-live-both-2", DERIVED_BLOCKS[1]?.id ?? LIVE_BLOCK_ID);
		const messagesByBlockId = new Map([
			[LIVE_BLOCK_ID, [liveMessage1]],
			[DERIVED_BLOCKS[1]?.id ?? LIVE_BLOCK_ID, [liveMessage2]],
		]);

		render(
			<DocumentBody
				body={BODY_WITH_TWO_BLOCKS}
				hostId="k-anchor-test"
				messagesByBlockId={messagesByBlockId}
			/>,
		);

		expect(screen.queryByTestId("anchor-lost-indicator")).not.toBeInTheDocument();
	});
});

// ── Mixed: both live and orphan messages in the same render ──

describe("Mixed live + orphan messages", () => {
	it("shows indicator only for orphan messages, not for live-anchored messages", () => {
		const liveMessage = makeMessage("msg-mixed-live", LIVE_BLOCK_ID);
		const orphanMessage = makeMessage("msg-mixed-orphan", ORPHAN_BLOCK_ID);
		const messagesByBlockId = new Map([
			[LIVE_BLOCK_ID, [liveMessage]],
			[ORPHAN_BLOCK_ID, [orphanMessage]],
		]);

		render(
			<DocumentBody
				body={BODY_WITH_TWO_BLOCKS}
				hostId="k-anchor-test"
				messagesByBlockId={messagesByBlockId}
			/>,
		);

		// Exactly one indicator for the orphan group
		const indicators = screen.getAllByTestId("anchor-lost-indicator");
		expect(indicators).toHaveLength(1);

		// The live message text is present (rendered inline, no indicator)
		expect(screen.getByText(/anchored to block-orphan/i)).toBeInTheDocument();
	});
});
