import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MOCK_REVIEW_SUBJECT } from "../__fixtures__/review-subject.fixture";
import { getReviewCanvas } from "../canvas-registry";
import { ReviewActionOperation } from "../ReviewActionOperation";
import type { ActionOperationPayload, ReviewArtifact } from "../review-artifact";
import type { StagedOperationOutcomeView } from "../review-composition";

const artifact = MOCK_REVIEW_SUBJECT.artifacts.find(
	(a) => a.kind === "action_operation",
)! as ReviewArtifact<ActionOperationPayload>;

function renderCanvas() {
	const Canvas = getReviewCanvas(artifact.kind);
	return render(<Canvas artifact={artifact} />);
}

describe("ReviewActionOperation canvas", () => {
	it("renders the artifact title (L1)", () => {
		renderCanvas();

		expect(screen.getByText(artifact.title)).toBeInTheDocument();
	});

	it("shows the tool logo and a safe source link back to the record", () => {
		renderCanvas();

		expect(screen.getByTitle(artifact.app)).toBeInTheDocument();
		const link = screen.getByRole("link", { name: `Open in ${artifact.app}` });
		expect(link).toHaveAttribute("href", artifact.sourceHref);
		expect(link.textContent).toContain("↗");
	});

	it("renders the amount and irreversible marker (L1)", () => {
		renderCanvas();

		expect(screen.getByText(artifact.payload.amountWire.formatted)).toBeInTheDocument();
		expect(screen.getAllByText(/Irreversible/i).length).toBeGreaterThan(0);
	});

	it("renders the receipt fields (L2)", () => {
		renderCanvas();

		for (const field of artifact.payload.receiptFields) {
			expect(screen.getByText(field.label)).toBeInTheDocument();
			expect(screen.getByText(field.value)).toBeInTheDocument();
		}
	});

	it("exposes blast radius and reversibility detail (L3)", () => {
		renderCanvas();

		expect(screen.getByRole("button", { name: /Blast radius/i })).toBeInTheDocument();
		expect(screen.getByText(/What this touches/i)).toBeInTheDocument();
	});
});

// AL7 — Outcome band tests
describe("ReviewActionOperation — AL7 execution outcome band", () => {
	it("renders the executed outcome band with receipt and executedAt", () => {
		const outcome: StagedOperationOutcomeView = {
			status: "ok",
			receipt: "re_3Qsq1aJ2a7kLmN0p · refunded",
			executedAt: "2 min ago",
		};

		render(<ReviewActionOperation artifact={artifact} status="executed" outcome={outcome} />);

		// "Executed" label appears as uppercase span; SVG title also has "executed" (case-insensitive)
		// Use getAllByText — the assertion just checks it's present somewhere.
		expect(screen.getAllByText(/executed/i).length).toBeGreaterThan(0);
		expect(screen.getByText(outcome.receipt!)).toBeInTheDocument();
		expect(screen.getByText(outcome.executedAt)).toBeInTheDocument();
	});

	it("renders the failed outcome band with verbatim multi-line error", () => {
		const verbatimError =
			"Stripe error: card_declined\nYour card was declined.\nCode: card_declined\nRequest-ID: req_abc123";
		const outcome: StagedOperationOutcomeView = {
			status: "failed",
			error: verbatimError,
			executedAt: "just now",
		};

		render(<ReviewActionOperation artifact={artifact} status="failed" outcome={outcome} />);

		expect(screen.getByText(/Execution failed/i)).toBeInTheDocument();
		// Error must be verbatim — whitespace-pre-wrap renders newlines visually;
		// the DOM node's textContent is the full raw string (rule #8: never clipped).
		const errorEl = screen.getByText((content) => content.includes("card_declined"));
		expect(errorEl.textContent).toBe(verbatimError);
	});

	it("renders the executing transient band (spinner label) when status is granted", () => {
		render(<ReviewActionOperation artifact={artifact} status="granted" />);

		expect(screen.getByLabelText("executing")).toBeInTheDocument();
		expect(screen.getByText(/Executing…/i)).toBeInTheDocument();
	});

	it("does not render outcome band when status is captured", () => {
		render(<ReviewActionOperation artifact={artifact} status="captured" />);

		expect(screen.queryByText(/Executed/i)).not.toBeInTheDocument();
		expect(screen.queryByText(/Execution failed/i)).not.toBeInTheDocument();
		expect(screen.queryByLabelText("executing")).not.toBeInTheDocument();
	});
});

// AC10b (WARNING-2) described `ProposedCallArgsPanel` + the `proposedCall`
// prop path as the fix for an approver seeing fake Stripe ids/amounts. BA2
// T4e-a deletes that panel and prop: `artifact.proposedCall` is populated
// only by a real `proposed_calls` row (`findProposedCall` in the reviews
// loader), and nothing in production ever writes one — architecture.md §1
// "The AL7 capture machinery is production-dead" (the workflow router's
// `sessionWorkflow` has no producer; the one durable-session call site,
// `run-orchestration/src/start-runtime.ts`, passes none). So this describe
// block's four tests exercised a prop path reachable only from this test
// file, never from a real render — test-only-reachable code, deleted with
// the code it covered rather than preserved.
