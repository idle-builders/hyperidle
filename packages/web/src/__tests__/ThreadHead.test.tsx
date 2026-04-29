/**
 * L1a — `ThreadHead` rendering tests.
 *
 * Approved-design contract: `docs/design-explorations/L1/approved.md` §2.2.
 * Plan §7.2.
 */

import { ThreadHead } from "@hyperidle/design-system";
import type { Message } from "@hyperidle/shared";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

const reviewMessage: Message = {
	id: "m-rev",
	threadId: "t-1",
	senderId: "agent-1",
	clientKey: "k-rev",
	deletedAt: null,
	redactedAt: null,
	resolvedAt: null,
	createdAt: "2026-04-19T12:00:00.000Z",
	type: "review",
	payload: {
		title: "Pricing overhaul",
		reasoning: ["Reduces churn", "Aligns with Q3 roadmap"],
		artifactRef: { id: "art-1", kind: "text_diff" },
	},
};

const questionnaireMessage: Message = {
	id: "m-q",
	threadId: "t-1",
	senderId: "agent-1",
	clientKey: "k-q",
	deletedAt: null,
	redactedAt: null,
	resolvedAt: null,
	createdAt: "2026-04-19T12:00:00.000Z",
	type: "questionnaire",
	payload: {
		title: "Should we ship?",
		question: "Pick one",
		options: ["Yes", "No"],
	},
};

describe("ThreadHead (approved.md §2.2)", () => {
	it("renders the review title in the head", () => {
		render(<ThreadHead message={reviewMessage} />);
		expect(screen.getByText("Pricing overhaul")).toBeInTheDocument();
	});

	it("renders the REASONING block with numbered items", () => {
		render(<ThreadHead message={reviewMessage} />);
		expect(screen.getByText(/reasoning/i)).toBeInTheDocument();
		expect(screen.getByText("Reduces churn")).toBeInTheDocument();
		expect(screen.getByText("Aligns with Q3 roadmap")).toBeInTheDocument();
	});

	it("renders the artifact slot (passed via prop)", () => {
		render(
			<ThreadHead
				message={reviewMessage}
				artifactSlot={<div data-testid="art-stub">artifact-stub</div>}
			/>,
		);
		expect(screen.getByTestId("art-stub")).toBeInTheDocument();
	});

	it("renders questionnaire body when message type is questionnaire", () => {
		render(<ThreadHead message={questionnaireMessage} />);
		expect(screen.getByText("Should we ship?")).toBeInTheDocument();
		expect(screen.getByText(/pick one/i)).toBeInTheDocument();
	});
});
