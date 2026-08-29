// BA2 T4e-a — ReviewActionOperation must render only what its payload supplies.
//
// Named in architecture.md §2.8.2 D: the "Approve refund" button renders on ANY
// operation, not only a refund. This file also names one the architecture's own
// sweep missed — `IrreversibleBadge` renders unconditionally regardless of
// `payload.irreversible`, contradicting the L3 reversibility text a few lines
// below it, which IS conditional on the same field. Flagged, not decided here.
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { getReviewCanvas } from "../canvas-registry";
import type { ActionOperationPayload, ReviewArtifact } from "../review-artifact";
import { assertNoFabrication, domText } from "./no-fabrication";

const Canvas = getReviewCanvas("action_operation");

const ENVELOPE = {
	id: "artifact:zx-action-1",
	tool: "zx-tool-action",
	app: "Zx App Action",
	sourceHref: "https://example.com/zx-action-record",
	title: "Zx Action Record Title",
} as const;

function artifactWith(payload: Partial<ActionOperationPayload>): ReviewArtifact<unknown> {
	return { ...ENVELOPE, kind: "action_operation", payload };
}

const SENTINEL_PAYLOAD: ActionOperationPayload = {
	verb: "Zx run the nightly export job",
	amountWire: { currency: "ZXC", units: 743, formatted: "ZXC 743" },
	irreversible: true,
	reversible: false,
	blastRadius: ["Zx blast radius alpha", "Zx blast radius beta"],
	receiptFields: [
		{ label: "Zx Field Label One", value: "Zx Field Value One" },
		{ label: "Zx Field Label Two", value: "Zx Field Value Two" },
	],
};

// Fixed interface chrome: labels a region, asserts nothing about this review.
const CHROME = [
	"Blast",
	"radius",
	"reversibility",
	"What",
	"this",
	"touches",
	"Reject",
	"Approve",
	"Open",
	"in",
	"Irreversible", // the fixed-vocabulary badge/section label, not this test's assertion target
	"Irreversible once submitted — confirm to proceed.".split(/\s+/), // mapper's own conditional text
].flat();

function domTextOf(container: HTMLElement): string {
	return domText(container);
}

describe("ReviewActionOperation — no fabrication (BA2 T4e-a)", () => {
	it('does not label the approve action "refund" for a non-refund operation', () => {
		render(<Canvas artifact={artifactWith(SENTINEL_PAYLOAD)} />);

		expect(screen.queryByRole("button", { name: /refund/i })).not.toBeInTheDocument();
	});

	it("does not claim irreversible for an operation the payload marks reversible", () => {
		render(
			<Canvas
				artifact={artifactWith({ ...SENTINEL_PAYLOAD, irreversible: false, reversible: true })}
			/>,
		);

		// IrreversibleBadge AND the L3 section title (ReviewActionOperation.tsx)
		// both render "Irreversible" unconditionally today — neither reads
		// `operation.irreversible`, unlike the reversibility paragraph inside
		// that same section, which does.
		expect(screen.queryAllByText(/^Irreversible$/i)).toHaveLength(0);
	});

	it("renders only what the payload supplies, chrome aside (L3 starts expanded by default)", () => {
		const { container } = render(<Canvas artifact={artifactWith(SENTINEL_PAYLOAD)} />);

		expect(screen.getAllByText(SENTINEL_PAYLOAD.verb).length).toBeGreaterThan(0);
		expect(screen.getByText(SENTINEL_PAYLOAD.amountWire.formatted)).toBeInTheDocument();
		expect(screen.getByText(SENTINEL_PAYLOAD.amountWire.currency)).toBeInTheDocument();
		for (const field of SENTINEL_PAYLOAD.receiptFields) {
			expect(screen.getByText(field.label)).toBeInTheDocument();
			expect(screen.getByText(field.value)).toBeInTheDocument();
		}
		for (const item of SENTINEL_PAYLOAD.blastRadius) {
			expect(screen.getByText(item)).toBeInTheDocument();
		}

		assertNoFabrication(domTextOf(container), {
			supplied: [
				ENVELOPE.app,
				ENVELOPE.title,
				SENTINEL_PAYLOAD.verb,
				SENTINEL_PAYLOAD.amountWire.formatted,
				SENTINEL_PAYLOAD.amountWire.currency,
				...SENTINEL_PAYLOAD.blastRadius,
				...SENTINEL_PAYLOAD.receiptFields.flatMap((f) => [f.label, f.value]),
			],
			chrome: CHROME,
			derived: ["Z"], // ToolLogo's neutral monogram for the unrecognized "zx-tool-action" id
		});
	});

	it("falls back to the safe unknown-canvas, not the REFUND fixture, on a malformed payload", () => {
		render(<Canvas artifact={artifactWith({})} />);

		expect(screen.getByTestId("review-unknown-canvas")).toBeInTheDocument();
		expect(screen.queryByText("$1,240.00")).not.toBeInTheDocument();
	});
});
