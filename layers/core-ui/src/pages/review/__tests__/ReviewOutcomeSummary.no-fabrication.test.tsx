// ReviewOutcomeSummary must render only what its payload supplies.
//
// Two things this file proves that a prop/type-level test cannot:
//   1. the guard-passing path (`isOutcomeSummaryPayload` never checks `tokens`)
//      used to render "0 tok" for an agent that reported no token count — a
//      fabricated fact, not an honest empty (deleting `?? 0` alone renders
//      "undefined tok" instead, because `TokensChip` takes `tokens: number`).
//      The fix is conditional rendering.
//   2. every other string the frame renders on a well-formed payload came from
//      that payload — checked as a token diff, not a banned-string list, so it
//      also catches a fabrication nobody has named yet.
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { MOCK_REVIEW_SUBJECT } from "../__fixtures__/review-subject.fixture";
import { getReviewCanvas } from "../canvas-registry";
import type { OutcomeSummaryPayload, ReviewArtifact } from "../review-artifact";
import { assertNoFabrication, domText } from "./no-fabrication";

const Canvas = getReviewCanvas("outcome_summary");

const ENVELOPE = {
	id: "artifact:zx-outcome-1",
	tool: "zx-tool-outcome",
	app: "Zx App Outcome",
	sourceHref: "https://example.com/zx-outcome-record",
	title: "Zx Outcome Record Title",
} as const;

function artifactWith(payload: Partial<OutcomeSummaryPayload>): ReviewArtifact<unknown> {
	return { ...ENVELOPE, kind: "outcome_summary", payload };
}

const SENTINEL_PAYLOAD: OutcomeSummaryPayload = {
	agentName: "Zx Agent Quillon",
	agentInitials: "ZQ",
	reviewerName: "Zx Reviewer Palomar",
	achieved: "Zx achieved sentence about migrating the widget catalog",
	tools: ["zx-tool-one", "zx-tool-two"],
	tokens: 5123,
	standing: "Blocking",
	doneConditions: [
		{ label: "Zx done condition alpha", met: true, jumpLabel: "Zx jump alpha" },
		{
			label: "Zx done condition beta",
			met: false,
			note: "Zx unmet note beta",
			jumpLabel: "Zx jump beta",
		},
	],
	needsYou: [
		{
			category: "compliance",
			severity: "error",
			detail: "Zx needs-you detail gamma",
			jumpLabel: "Zx jump gamma",
		},
	],
};

// Fixed interface chrome for this canvas: labels a region, asserts nothing about
// this review. Enumerated from ReviewOutcomeSummary.tsx's own static JSX text.
const CHROME = [
	"Done",
	"conditions",
	"of",
	"met",
	"collapsed",
	"condition",
	"Expand",
	"all",
	"Collapse",
	"Needs",
	"you",
	"Jump",
	"Awaiting",
	"Blocking", // fixed `standing` enum vocabulary, same status as an honest label
	"Compliance", // RISK_LABEL vocabulary for the "compliance" category the payload chose
	"Open",
	"in", // CanvasSourceHeader's "Open in {app}"
	"tok", // TokensChip's fixed unit suffix
];

// Derived, not invented: computed straight from the payload above.
const DERIVED = [
	1, // metCount (one done condition met)
	2, // total done conditions
	1, // needs-you count
	"5.1k", // TokensChip's own formatting of 5123 (>= 1000 divides by 1000, one decimal)
	"Z", // ToolLogo's neutral monogram for an unrecognized tool id — first letter of "zx-tool-outcome"
];

describe("ReviewOutcomeSummary — no fabrication", () => {
	it("renders no token count at all when the payload omits tokens (guard-passing path)", () => {
		// isOutcomeSummaryPayload (ReviewOutcomeSummary.tsx:342-353) never checks
		// `tokens` — a well-formed payload missing it PASSES the guard. Today
		// `payload.tokens ?? 0` renders "0 tok", which a reader cannot tell apart
		// from "this run used zero tokens". The fix is that no chip renders at all.
		const { tokens: _omit, ...withoutTokens } = SENTINEL_PAYLOAD;
		render(<Canvas artifact={artifactWith(withoutTokens)} />);

		expect(screen.queryByText(/tok\b/i)).not.toBeInTheDocument();
		expect(screen.queryByText(/0 tok/i)).not.toBeInTheDocument();
		expect(screen.queryByText(/undefined tok/i)).not.toBeInTheDocument();
	});

	it("renders only what the payload supplies, chrome aside, once every disclosure is open", async () => {
		const user = userEvent.setup();
		const { container } = render(<Canvas artifact={artifactWith(SENTINEL_PAYLOAD)} />);

		// The default DOM is not the whole DOM. Expand the done-conditions
		// disclosure so the met condition (floated out of the default
		// unmet-only view) is checked too.
		await user.click(screen.getByRole("button", { name: /expand all/i }));

		// positive: every payload-supplied value the frame owns actually appears —
		// an absence-only check would go green on a canvas that renders nothing.
		expect(screen.getByText(SENTINEL_PAYLOAD.agentName)).toBeInTheDocument();
		expect(screen.getByText(SENTINEL_PAYLOAD.agentInitials)).toBeInTheDocument();
		expect(screen.getByText(SENTINEL_PAYLOAD.reviewerName)).toBeInTheDocument();
		expect(screen.getByText(SENTINEL_PAYLOAD.achieved)).toBeInTheDocument();
		for (const tool of SENTINEL_PAYLOAD.tools) {
			expect(screen.getByText(tool)).toBeInTheDocument();
		}
		expect(screen.getByText(SENTINEL_PAYLOAD.doneConditions[0]!.label)).toBeInTheDocument();
		expect(screen.getByText(SENTINEL_PAYLOAD.doneConditions[1]!.label)).toBeInTheDocument();
		expect(screen.getByText(SENTINEL_PAYLOAD.doneConditions[1]!.note!)).toBeInTheDocument();
		expect(screen.getByText(SENTINEL_PAYLOAD.needsYou[0]!.detail)).toBeInTheDocument();

		assertNoFabrication(domText(container), {
			supplied: [
				ENVELOPE.app,
				ENVELOPE.title,
				...Object.values(SENTINEL_PAYLOAD.tools),
				SENTINEL_PAYLOAD.agentName,
				SENTINEL_PAYLOAD.agentInitials,
				SENTINEL_PAYLOAD.reviewerName,
				SENTINEL_PAYLOAD.achieved,
				SENTINEL_PAYLOAD.doneConditions[0]!.label,
				SENTINEL_PAYLOAD.doneConditions[1]!.label,
				SENTINEL_PAYLOAD.doneConditions[1]!.note!,
				SENTINEL_PAYLOAD.needsYou[0]!.detail,
			],
			chrome: CHROME,
			derived: DERIVED,
		});
	});

	it("falls back to the safe unknown-canvas, not a fabricated frame, on a malformed payload", () => {
		render(<Canvas artifact={artifactWith({})} />);

		expect(screen.getByTestId("review-unknown-canvas")).toBeInTheDocument();
	});
});

describe("ReviewOutcomeSummary canvas — fixture-driven ordering", () => {
	const fixtureArtifact = MOCK_REVIEW_SUBJECT.artifacts.find(
		(a) => a.kind === "outcome_summary",
	)! as ReviewArtifact<OutcomeSummaryPayload>;

	function renderFixture() {
		return render(<Canvas artifact={fixtureArtifact} />);
	}

	it("floats unmet conditions and needs-you items above met ones", () => {
		renderFixture();

		const unmet = screen.getByText(/Exceptions routed to human/i);
		const needsYou = screen.getByText(/9,840 wire lacks source documentation/i);
		expect(unmet.compareDocumentPosition(needsYou) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
	});

	it("exposes a jump affordance on every needs-you row", () => {
		renderFixture();

		expect(screen.getAllByText(/Jump ↓/i).length).toBeGreaterThanOrEqual(
			fixtureArtifact.payload.needsYou.length,
		);
	});
});
