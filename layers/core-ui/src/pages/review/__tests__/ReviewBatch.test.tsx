import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { MOCK_REVIEW_SUBJECT } from "../__fixtures__/review-subject.fixture";
import { getReviewCanvas } from "../canvas-registry";
import type { BatchPayload, ReviewArtifact } from "../review-artifact";
import { assertNoFabrication, domText } from "./no-fabrication";

const artifact = MOCK_REVIEW_SUBJECT.artifacts.find(
	(a) => a.kind === "batch",
)! as ReviewArtifact<BatchPayload>;

function renderCanvas() {
	const Canvas = getReviewCanvas(artifact.kind);
	return render(<Canvas artifact={artifact} />);
}

describe("ReviewBatch canvas", () => {
	it("renders the artifact title", () => {
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

	it("pins flagged items before collapsed routine groups", () => {
		renderCanvas();

		const flagged = screen.getAllByText(/Churn threat on/i)[0]!;
		const routine = screen.getByText(/18 auto-resolved/i);
		expect(flagged.compareDocumentPosition(routine) & Node.DOCUMENT_POSITION_FOLLOWING).toBe(
			Node.DOCUMENT_POSITION_FOLLOWING,
		);
	});

	it("renders the rollup counts", () => {
		renderCanvas();

		expect(screen.getByText(String(artifact.payload.rollup.total))).toBeInTheDocument();
		expect(screen.getByText(String(artifact.payload.rollup.needYou))).toBeInTheDocument();
	});
});

// ---------------------------------------------------------------------------
// No fabrication — renders only what the payload supplies
// ---------------------------------------------------------------------------
//
// `BatchPayload.flagged` items carry only `{id, ref, reason}` — no sentiment,
// no flag category, no drafted reply. An earlier `mapBatchPayload` hardcoded
// every flagged item as `flag: "churn"` (rendering "CHURN THREAT" on any kind
// of flagged item) and `sentiment: "neutral"`, and the view's win-line metric
// ("Median first response would drop...") had no payload field behind it at
// all — `BatchPayload` declares no `metric` shape.

const Canvas = getReviewCanvas("batch");

const ENVELOPE = {
	id: "artifact:zx-batch-1",
	tool: "zx-tool-batch",
	app: "Zx App Batch",
	sourceHref: "https://example.com/zx-batch-record",
	title: "Zx Batch Record Title",
} as const;

function artifactWith(payload: Partial<BatchPayload>): ReviewArtifact<unknown> {
	return { ...ENVELOPE, kind: "batch", payload };
}

const SENTINEL_PAYLOAD: BatchPayload = {
	rollup: { total: 41, needYou: 1, autoResolved: 18, drafted: 22 },
	flagged: [{ id: "zx-flag-1", ref: "Zx Ref Corvid", reason: "Zx Reason Corvid detail" }],
	auto: [{ id: "zx-auto-1", label: "Zx Auto Group Label", count: 18 }],
	drafted: [{ id: "zx-drafted-1", label: "Zx Drafted Group Label", count: 22 }],
};

const CHROME = [
	"NEED",
	"YOU",
	"tickets",
	"need",
	"you",
	"triaged",
	"auto",
	"resolved",
	"drafted",
	"once",
	"the",
	"send",
	"flagged",
	"routine",
	"Held",
	"for",
	"your",
	"review",
	"why",
	"Hide",
	"more",
	"open",
	"full",
	"list",
	"to",
	"spot",
	"check",
	"Open",
	"in",
];

describe("ReviewBatch — no fabrication", () => {
	it("does not classify every flagged item as a churn threat regardless of the real reason", () => {
		render(<Canvas artifact={artifactWith(SENTINEL_PAYLOAD)} />);

		expect(screen.queryByText("CHURN THREAT")).not.toBeInTheDocument();
	});

	it("does not invent a sentiment ('neutral') the payload never supplied", () => {
		render(<Canvas artifact={artifactWith(SENTINEL_PAYLOAD)} />);

		expect(screen.queryByText(/neutral/i)).not.toBeInTheDocument();
	});

	it("does not invent a 'Median first response' metric the payload has no field for", () => {
		render(<Canvas artifact={artifactWith(SENTINEL_PAYLOAD)} />);

		expect(screen.queryByText(/median first response/i)).not.toBeInTheDocument();
	});

	it("does not claim a policy routed the item to you when no draft field exists at all", () => {
		// The sole flagged item starts expanded by default, derived from the
		// payload's own first flagged item, so the L3 panel this assertion
		// reads is already open — no click needed.
		render(<Canvas artifact={artifactWith(SENTINEL_PAYLOAD)} />);

		expect(screen.queryByText(/policy routes this straight to you/i)).not.toBeInTheDocument();
	});

	it("renders only what the payload supplies, chrome aside, once every disclosure is open", async () => {
		const user = userEvent.setup();
		const { container } = render(<Canvas artifact={artifactWith(SENTINEL_PAYLOAD)} />);

		// The sole flagged item is already expanded by default (see above) —
		// only the two routine groups still start collapsed.
		await user.click(screen.getByRole("button", { name: /Zx Auto Group Label/i }));
		await user.click(screen.getByRole("button", { name: /Zx Drafted Group Label/i }));

		expect(screen.getAllByText(SENTINEL_PAYLOAD.flagged[0]!.ref).length).toBeGreaterThan(0);
		expect(screen.getAllByText(SENTINEL_PAYLOAD.flagged[0]!.reason).length).toBeGreaterThan(0);
		expect(screen.getByText(new RegExp(SENTINEL_PAYLOAD.auto[0]!.label, "i"))).toBeInTheDocument();
		expect(
			screen.getByText(new RegExp(SENTINEL_PAYLOAD.drafted[0]!.label, "i")),
		).toBeInTheDocument();

		assertNoFabrication(domText(container), {
			supplied: [
				ENVELOPE.app,
				ENVELOPE.title,
				SENTINEL_PAYLOAD.rollup.total,
				SENTINEL_PAYLOAD.rollup.needYou,
				SENTINEL_PAYLOAD.rollup.autoResolved,
				SENTINEL_PAYLOAD.rollup.drafted,
				SENTINEL_PAYLOAD.flagged[0]!.ref,
				SENTINEL_PAYLOAD.flagged[0]!.reason,
				SENTINEL_PAYLOAD.auto[0]!.label,
				SENTINEL_PAYLOAD.auto[0]!.count,
				SENTINEL_PAYLOAD.drafted[0]!.label,
				SENTINEL_PAYLOAD.drafted[0]!.count,
			],
			chrome: CHROME,
			derived: [
				18 + 22, // routineCount (autoResolved + drafted)
				1, // priority index badge on the sole flagged row ("1")
				"Z", // CanvasSourceHeader's ToolLogo — the neutral monogram for the
				// unrecognized "zx-tool-batch" id (ReviewBatch has no other ToolLogo call)
			],
		});
	});

	it("falls back to the safe unknown-canvas, not the Zendesk triage fixture, on a malformed payload", () => {
		render(<Canvas artifact={artifactWith({})} />);

		expect(screen.getByTestId("review-unknown-canvas")).toBeInTheDocument();
		expect(screen.queryByText("CHURN THREAT")).not.toBeInTheDocument();
	});
});
