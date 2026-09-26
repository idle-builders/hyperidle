import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { MOCK_REVIEW_SUBJECT } from "../__fixtures__/review-subject.fixture";
import { getReviewCanvas } from "../canvas-registry";
import type { FieldChangeSetPayload, ReviewArtifact } from "../review-artifact";
import { assertNoFabrication, domText } from "./no-fabrication";

const artifact = MOCK_REVIEW_SUBJECT.artifacts.find(
	(a) => a.kind === "field_change_set",
)! as ReviewArtifact<FieldChangeSetPayload>;

function renderCanvas() {
	const Canvas = getReviewCanvas(artifact.kind);
	return render(<Canvas artifact={artifact} />);
}

describe("ReviewFieldChangeSet canvas", () => {
	it("renders the artifact record label", () => {
		renderCanvas();

		expect(screen.getByText(artifact.payload.recordLabel)).toBeInTheDocument();
	});

	it("shows the tool logo and a safe source link back to the record", () => {
		renderCanvas();

		expect(screen.getByTitle(artifact.app)).toBeInTheDocument();
		const link = screen.getByRole("link", { name: `Open in ${artifact.app}` });
		expect(link).toHaveAttribute("href", artifact.sourceHref);
		expect(link.textContent).toContain("↗");
	});

	it("renders the changed field rows", () => {
		renderCanvas();

		for (const field of artifact.payload.fields) {
			expect(screen.getByText(field.label)).toBeInTheDocument();
		}
	});

	it("floats the needs-you field to the top of the grid", () => {
		renderCanvas();

		const labels = screen.getAllByText(/Amount|Stage|Close date|Next step|Contact/);
		expect(labels[0]?.textContent).toBe("Amount");
		expect(screen.getByText(/needs you/i)).toBeInTheDocument();
	});

	it("exposes per-field source provenance", () => {
		renderCanvas();

		expect(screen.getAllByRole("button", { name: /Source/i }).length).toBeGreaterThan(0);
	});
});

// ---------------------------------------------------------------------------
// No fabrication — renders only what the payload supplies
// ---------------------------------------------------------------------------
//
// Both fabrications this file names sit behind disclosures and were invisible
// to a first-paint dump: `FieldRow` used to hardcode a Salesforce mark on
// every field's "Source" disclosure, and the "+N unchanged" line used to
// always name five specific field labels no payload ever supplied. The
// unchanged line is a static count now, not a disclosure — the payload
// carries no field-level detail behind it to expand into.

const Canvas = getReviewCanvas("field_change_set");

const ENVELOPE = {
	id: "artifact:zx-field-1",
	tool: "zx-tool-field",
	app: "Zx App Field",
	sourceHref: "https://example.com/zx-field-record",
	title: "Zx Field Record Title",
} as const;

function artifactWith(payload: Partial<FieldChangeSetPayload>): ReviewArtifact<unknown> {
	return { ...ENVELOPE, kind: "field_change_set", payload };
}

const SENTINEL_PAYLOAD: FieldChangeSetPayload = {
	recordLabel: "Zx Record Label Corvid",
	fields: [
		{
			label: "Zx Field Alpha",
			old: "Zx Old Value Alpha",
			new: "Zx New Value Alpha",
			provenance: "Zx provenance sentence alpha",
			needsYou: "Zx needs-you note alpha",
		},
		{
			label: "Zx Field Beta",
			old: null,
			new: "Zx New Value Beta",
			provenance: "Zx provenance sentence beta",
		},
	],
	unchangedCount: 7,
};

// Fixed interface chrome: labels a region, asserts nothing about this review.
const CHROME = [
	"record",
	"fields",
	"changed",
	"needs",
	"you",
	"Source",
	"source", // "Hide source" toggle label (lowercase form)
	"Hide",
	"added",
	"unchanged",
	"Open",
	"in",
];

describe("ReviewFieldChangeSet — no fabrication", () => {
	it("does not mark every field's provenance Salesforce regardless of the real source tool", async () => {
		const user = userEvent.setup();
		render(<Canvas artifact={artifactWith(SENTINEL_PAYLOAD)} />);

		for (const button of screen.getAllByRole("button", { name: /source/i })) {
			await user.click(button);
		}

		// The full word "Salesforce" never renders (ToolLogo's `label=""` suppresses
		// it) — the actual manifestation is the brand's "sf" monogram mark, which is
		// what a payload-honest render must not show for an unrecognized tool.
		expect(screen.queryAllByText(/^sf$/)).toHaveLength(0);
	});

	it("does not name five specific unchanged fields no payload supplied", () => {
		render(<Canvas artifact={artifactWith(SENTINEL_PAYLOAD)} />);

		expect(screen.queryByText(/Owner/)).not.toBeInTheDocument();
		expect(screen.queryByText(/Lead source/)).not.toBeInTheDocument();
		expect(screen.queryByText(/Probability/)).not.toBeInTheDocument();
		expect(screen.queryByText(/left as-is/)).not.toBeInTheDocument();
	});

	const SUPPLIED = [
		ENVELOPE.app,
		ENVELOPE.title,
		...SENTINEL_PAYLOAD.fields.flatMap((f) => [
			f.label,
			f.old ?? "",
			f.new,
			f.provenance ?? "",
			f.needsYou ?? "",
		]),
	];
	const DERIVED = [
		1, // "1 record" — this canvas is structurally always exactly one record
		2, // fields.length
		1, // needsYouCount (one field carries needsYou)
		SENTINEL_PAYLOAD.unchangedCount,
		"Z", // ToolLogo's neutral monogram for the unrecognized "zx-tool-field" id
	];

	// `expanded` is a single id, not a set (ReviewFieldChangeSet.tsx) — opening
	// one field's "Source" disclosure closes any other. Each row's disclosure is
	// therefore checked in its own state rather than assumed to coexist.
	//
	// Row alpha is the sole needs-you field, so it is the top-relevance row
	// expanded by default — derived from the real payload. No click needed to
	// open it; clicking its own "Source" toggle here would close it instead.
	it("row alpha's disclosure renders only what the payload supplies, chrome aside", () => {
		const { container } = render(<Canvas artifact={artifactWith(SENTINEL_PAYLOAD)} />);

		expect(screen.getByText(SENTINEL_PAYLOAD.fields[0]!.label)).toBeInTheDocument();
		expect(screen.getByText(SENTINEL_PAYLOAD.fields[0]!.old!)).toBeInTheDocument();
		expect(screen.getByText(SENTINEL_PAYLOAD.fields[0]!.new)).toBeInTheDocument();
		expect(screen.getByText(SENTINEL_PAYLOAD.fields[0]!.provenance!)).toBeInTheDocument();
		expect(screen.getByText(SENTINEL_PAYLOAD.fields[0]!.needsYou!)).toBeInTheDocument();

		assertNoFabrication(domText(container), {
			supplied: SUPPLIED,
			chrome: CHROME,
			derived: DERIVED,
		});
	});

	it("row beta's disclosure renders only what the payload supplies, chrome aside", async () => {
		const user = userEvent.setup();
		const { container } = render(<Canvas artifact={artifactWith(SENTINEL_PAYLOAD)} />);

		await user.click(screen.getAllByRole("button", { name: /source/i })[1]!);

		expect(screen.getByText(SENTINEL_PAYLOAD.fields[1]!.label)).toBeInTheDocument();
		expect(screen.getByText(SENTINEL_PAYLOAD.fields[1]!.new)).toBeInTheDocument();
		expect(screen.getByText(SENTINEL_PAYLOAD.fields[1]!.provenance!)).toBeInTheDocument();

		assertNoFabrication(domText(container), {
			supplied: SUPPLIED,
			chrome: CHROME,
			derived: DERIVED,
		});
	});

	it("the unchanged count line renders only what the payload supplies, chrome aside", () => {
		const { container } = render(<Canvas artifact={artifactWith(SENTINEL_PAYLOAD)} />);

		assertNoFabrication(domText(container), {
			supplied: SUPPLIED,
			chrome: CHROME,
			derived: DERIVED,
		});
	});

	it("falls back to the safe unknown-canvas, not the Salesforce fixture, on a malformed payload", () => {
		render(<Canvas artifact={artifactWith({})} />);

		expect(screen.getByTestId("review-unknown-canvas")).toBeInTheDocument();
		expect(screen.queryByText(/salesforce/i)).not.toBeInTheDocument();
	});
});
