import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MOCK_REVIEW_SUBJECT } from "../__fixtures__/review-subject.fixture";
import { getReviewCanvas } from "../canvas-registry";
import { ReviewActionOperation } from "../ReviewActionOperation";
import type { ActionOperationPayload, ReviewArtifact } from "../review-artifact";
import type { ProposedCallView, StagedOperationOutcomeView } from "../review-composition";

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

// AC10b (WARNING-2) — the review surface renders the REAL captured args, not fabricated data.
// The human approving must see the actual toolId + args the agent called (ETHOS §3 / AC10b).
describe("ReviewActionOperation — AC10b concrete captured args (not hardcoded REFUND data)", () => {
	it("renders the real toolId from proposedCall, not a hardcoded fixture value", () => {
		const proposedCall: ProposedCallView = {
			proposedCallId: "pc-test-123",
			toolId: "github_merge_pr",
			args: { pr: 42, repo: "hyperidle/core", merge_method: "squash" },
			status: "captured",
		};

		render(
			<ReviewActionOperation artifact={artifact} status="captured" proposedCall={proposedCall} />,
		);

		// The real tool id appears in the DOM
		expect(screen.getByTestId("proposed-call-tool-id")).toHaveTextContent("github_merge_pr");
	});

	it("renders each captured arg key-value pair in the DOM (verbatim, not a summary)", () => {
		const proposedCall: ProposedCallView = {
			proposedCallId: "pc-test-456",
			toolId: "commit_file",
			args: { path: "/workspace/proof.txt", content: "hello world" },
			status: "captured",
		};

		render(
			<ReviewActionOperation artifact={artifact} status="captured" proposedCall={proposedCall} />,
		);

		// Both arg keys and verbatim values must appear
		expect(screen.getByTestId("proposed-call-arg-path")).toHaveTextContent("/workspace/proof.txt");
		expect(screen.getByTestId("proposed-call-arg-content")).toHaveTextContent("hello world");
	});

	it("does NOT render the ProposedCallArgsPanel when proposedCall is absent (backward compat)", () => {
		// No proposedCall passed — the canvas renders as before (story fixture data)
		render(<ReviewActionOperation artifact={artifact} status="captured" />);

		expect(screen.queryByLabelText("Proposed call details")).not.toBeInTheDocument();
	});

	it("renders the REFUND hardcoded amount even with proposedCall present (no regression on standard canvas)", () => {
		const proposedCall: ProposedCallView = {
			proposedCallId: "pc-test-789",
			toolId: "stripe_refund",
			args: { charge_id: "ch_real_123", amount: 9999 },
			status: "captured",
		};

		render(
			<ReviewActionOperation artifact={artifact} status="captured" proposedCall={proposedCall} />,
		);

		// The standard operation card still renders (backward compat for artifact.payload)
		expect(screen.getAllByText(/Irreversible/i).length).toBeGreaterThan(0);
		// The real arg value also appears
		expect(screen.getByTestId("proposed-call-arg-charge_id")).toHaveTextContent("ch_real_123");
	});
});
