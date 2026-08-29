// BA2 T4e-a — ReviewMetricsMoved must render only what its payload supplies.
//
// architecture.md §2.8.2 D names the whole L1 narrative as invented ("...from
// April. The period ties to bank; biggest open item is a $0.00 wire with no
// source."), the fixed `Apr`/`May` column heads, and `usd()`/`usdCents()`
// forcing every number into USD even though `MetricsMovedPayload` carries no
// currency field at all — and separately, that the payload's OWN `period`
// field never renders anywhere.
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { getReviewCanvas } from "../canvas-registry";
import type { MetricsMovedPayload, ReviewArtifact } from "../review-artifact";
import { assertNoFabrication, domText } from "./no-fabrication";

const Canvas = getReviewCanvas("metrics_moved");

const ENVELOPE = {
	id: "artifact:zx-metrics-1",
	tool: "zx-tool-metrics",
	app: "Zx App Metrics",
	sourceHref: "https://example.com/zx-metrics-record",
	title: "Zx Metrics Record Title",
} as const;

function artifactWith(payload: Partial<MetricsMovedPayload>): ReviewArtifact<unknown> {
	return { ...ENVELOPE, kind: "metrics_moved", payload };
}

// Values deliberately < 1000 (no thousands separator) so a raw payload number
// is a plain substring match regardless of any surrounding currency formatting
// the view may still apply — the point under test is the SURROUNDING claim
// ("$", "ties to bank", "April"), not incidental digit grouping.
// `MetricsMovedPayload.rows` is typed `readonly unknown[]` at the contract
// level (the mapper narrows it with its own `isRollForwardRow` guard), so the
// sentinel row is declared with its concrete shape once and reused.
const SENTINEL_ROW = {
	id: "row-1",
	label: "Zx Row Label One",
	opening: 101,
	activity: 202,
	closing: 303,
};

const SENTINEL_PAYLOAD: MetricsMovedPayload = {
	period: "Zx Period Quarter Nine",
	headlines: [{ label: "Zx Headline Widgets Shipped", prior: 311, current: 524 }],
	rows: [SENTINEL_ROW],
	tieOut: { opening: 101, activity: 202, closing: 303, ties: true },
	exceptions: [{ amount: 419, title: "Zx Exception Title One", detail: "Zx exception detail one" }],
};

const CHROME = [
	"Roll",
	"forward",
	"reconciliation",
	"Account",
	"Opening",
	"Activity",
	"Closing",
	"Show",
	"Hide",
	"items",
	"less",
	"than",
	"net",
	"ties",
	"to",
	"bank", // NOTE: kept as chrome only in the sense the tie-out strip always
	// shows this phrase when `tieOut.ties` is true — flagged as ambiguous
	// below; see the dedicated negative test for the narrative sentence.
	"Exceptions",
	"by",
	"amount",
	"Where",
	"from?",
	"Hide source",
	"Open",
	"in",
];

describe("ReviewMetricsMoved — no fabrication (BA2 T4e-a)", () => {
	it("renders the payload's own period instead of a fixed month name", () => {
		render(<Canvas artifact={artifactWith(SENTINEL_PAYLOAD)} />);

		expect(screen.getByText(new RegExp(SENTINEL_PAYLOAD.period))).toBeInTheDocument();
		expect(screen.queryByText(/\bApril\b/)).not.toBeInTheDocument();
		expect(screen.queryByText(/\bApr\b/)).not.toBeInTheDocument();
		expect(screen.queryByText(/\bMay\b/)).not.toBeInTheDocument();
	});

	it("does not assert the period ties to a bank the payload never named", () => {
		render(<Canvas artifact={artifactWith(SENTINEL_PAYLOAD)} />);

		// appears twice today: the L1 narrative AND the tie-out strip footer.
		expect(screen.queryAllByText(/ties to bank/i)).toHaveLength(0);
		expect(screen.queryByText(/no source/i)).not.toBeInTheDocument();
	});

	it("does not force a USD currency reading onto payload numbers with no currency field", () => {
		const { container } = render(<Canvas artifact={artifactWith(SENTINEL_PAYLOAD)} />);

		expect(domText(container)).not.toContain("$");
	});

	it("does not invent a QuickBooks provenance for a figure the payload never sourced", async () => {
		const user = userEvent.setup();
		render(<Canvas artifact={artifactWith(SENTINEL_PAYLOAD)} />);

		await user.click(screen.getByRole("button", { name: /where from/i }));

		expect(screen.queryByText(/quickbooks/i)).not.toBeInTheDocument();
		expect(screen.queryAllByText(/^qb$/i)).toHaveLength(0);
	});

	it("renders only what the payload supplies, chrome aside, once every disclosure is open", async () => {
		const user = userEvent.setup();
		const { container } = render(<Canvas artifact={artifactWith(SENTINEL_PAYLOAD)} />);

		await user.click(screen.getByRole("button", { name: /where from/i }));
		await user.click(screen.getByRole("button", { name: /items/i }));

		expect(screen.getByText(SENTINEL_PAYLOAD.headlines[0]!.label)).toBeInTheDocument();
		expect(domText(container)).toContain(String(SENTINEL_PAYLOAD.headlines[0]!.current));
		expect(domText(container)).toContain(String(SENTINEL_PAYLOAD.headlines[0]!.prior));
		expect(screen.getByText(SENTINEL_PAYLOAD.exceptions[0]!.title)).toBeInTheDocument();
		expect(screen.getByText(SENTINEL_PAYLOAD.exceptions[0]!.detail)).toBeInTheDocument();

		assertNoFabrication(domText(container), {
			supplied: [
				ENVELOPE.app,
				ENVELOPE.title,
				SENTINEL_PAYLOAD.period,
				SENTINEL_PAYLOAD.headlines[0]!.label,
				SENTINEL_PAYLOAD.headlines[0]!.prior,
				SENTINEL_PAYLOAD.headlines[0]!.current,
				SENTINEL_ROW.label,
				SENTINEL_ROW.opening,
				SENTINEL_ROW.activity,
				SENTINEL_ROW.closing,
				SENTINEL_PAYLOAD.exceptions[0]!.amount,
				SENTINEL_PAYLOAD.exceptions[0]!.title,
				SENTINEL_PAYLOAD.exceptions[0]!.detail,
			],
			chrome: CHROME,
			derived: [
				1, // exceptions.length ("1, by amount")
				524 - 311, // the rendered delta pill (current - prior)
				0, // mapMetricsPayload always sets trivia {count:0, net:0} — the payload
				// carries no trivia concept at all, so zero is honest, not invented.
				"Z", // ToolLogo's neutral monogram for the unrecognized "zx-tool-metrics" id
			],
		});
	});

	it("falls back to the safe unknown-canvas, not the May-close fixture, on a malformed payload", () => {
		render(<Canvas artifact={artifactWith({})} />);

		expect(screen.getByTestId("review-unknown-canvas")).toBeInTheDocument();
		expect(screen.queryByText(/quickbooks/i)).not.toBeInTheDocument();
	});
});
