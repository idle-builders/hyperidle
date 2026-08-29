// ReviewCodeDiff must render only what its payload supplies.
//
// `coverage +0.4%` (CiRow) used to render on every diff as a figure
// `CodeDiffPayload` has no field for, alongside a fixed "Minor / generated &
// formatting — safe to skip" framing. `checks: readonly string[]` carries
// labels only, no pass/fail state, yet CiRow used to always render "All
// checks passed" with a checkmark next to every one of them; and the
// expanded trivia band used to hardcode three literal filenames —
// "openapi/schema.gen.ts", "package-lock.json", "src/checkout/styles.css" —
// regardless of what the payload's trivia actually touched.
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { getReviewCanvas } from "../canvas-registry";
import type { CodeDiffPayload, ReviewArtifact } from "../review-artifact";
import { assertNoFabrication, domText } from "./no-fabrication";

const Canvas = getReviewCanvas("code_diff");

const ENVELOPE = {
	id: "artifact:zx-code-1",
	tool: "zx-tool-code",
	app: "Zx App Code",
	sourceHref: "https://example.com/zx-code-record",
	title: "Zx Code Record Title",
} as const;

function artifactWith(payload: Partial<CodeDiffPayload>): ReviewArtifact<unknown> {
	return { ...ENVELOPE, kind: "code_diff", payload };
}

const SENTINEL_PAYLOAD: CodeDiffPayload = {
	prTitle: "Zx PR Title About A Fix",
	description: "Zx description sentence about the change",
	checks: ["zx-check-alpha"],
	files: [
		{
			path: "zx/path/to/file.ts",
			band: "logic",
			rationale: "Zx rationale sentence for this file",
			added: 7,
			removed: 3,
			hunks: [
				{
					header: "Zx hunk header @@ -1,1 +1,1 @@",
					lines: [{ kind: "add", oldNo: null, newNo: 1, text: "Zx added line text" }],
				},
			],
		},
	],
	triviaSummary: "Zx trivia summary sentence",
};

const CHROME = [
	"checks",
	"files",
	"changed",
	"relevance",
	"ranked",
	"Expand",
	"Collapse",
	"Minor",
	"generated",
	"formatting",
	"Logic",
	"Open",
	"in",
];

describe("ReviewCodeDiff — no fabrication", () => {
	it("does not invent a coverage figure the payload has no field for", () => {
		render(<Canvas artifact={artifactWith(SENTINEL_PAYLOAD)} />);

		expect(screen.queryByText(/coverage/i)).not.toBeInTheDocument();
		expect(screen.queryByText(/\+0\.4%/)).not.toBeInTheDocument();
	});

	it('does not claim every check "passed" when the payload carries no pass/fail state', () => {
		render(<Canvas artifact={artifactWith(SENTINEL_PAYLOAD)} />);

		// `CodeDiffPayload.checks` is `readonly string[]` — labels only. CiRow
		// asserts a status ("All checks passed") the payload never supplied.
		expect(screen.queryByText(/all checks passed/i)).not.toBeInTheDocument();
	});

	it("does not frame the minor band with wording no payload field backs", () => {
		render(<Canvas artifact={artifactWith(SENTINEL_PAYLOAD)} />);

		expect(screen.queryByText(/safe to skip/i)).not.toBeInTheDocument();
	});

	it("renders only what the payload supplies, chrome aside, once the file disclosure is open", () => {
		// SENTINEL_PAYLOAD supplies no `trivia` object, so the Minor band never
		// renders at all (see the dedicated absence test below) — nothing to
		// click open here beyond the file, which starts expanded by default.
		const { container } = render(<Canvas artifact={artifactWith(SENTINEL_PAYLOAD)} />);

		expect(screen.getByText(SENTINEL_PAYLOAD.description)).toBeInTheDocument();
		expect(screen.getByText(SENTINEL_PAYLOAD.checks[0]!)).toBeInTheDocument();
		expect(screen.getByText(SENTINEL_PAYLOAD.files[0]!.rationale!)).toBeInTheDocument();
		expect(screen.getByText(SENTINEL_PAYLOAD.files[0]!.hunks![0]!.header)).toBeInTheDocument();
		expect(
			screen.getByText(SENTINEL_PAYLOAD.files[0]!.hunks![0]!.lines[0]!.text.trim()),
		).toBeInTheDocument();

		assertNoFabrication(domText(container), {
			supplied: [
				ENVELOPE.app,
				ENVELOPE.title,
				SENTINEL_PAYLOAD.description,
				SENTINEL_PAYLOAD.checks[0]!,
				SENTINEL_PAYLOAD.files[0]!.path,
				SENTINEL_PAYLOAD.files[0]!.rationale!,
				SENTINEL_PAYLOAD.files[0]!.added!,
				SENTINEL_PAYLOAD.files[0]!.removed!,
				SENTINEL_PAYLOAD.files[0]!.hunks![0]!.header,
				SENTINEL_PAYLOAD.files[0]!.hunks![0]!.lines[0]!.text,
			],
			chrome: CHROME,
			derived: [
				1, // files.length (1) + trivia.count (no trivia object supplied, so 0) — "1 files changed"
				SENTINEL_PAYLOAD.files[0]!.added!, // total added badge (one file, no trivia added)
				SENTINEL_PAYLOAD.files[0]!.removed!, // total removed badge
				"Z", // ToolLogo's neutral monogram for the unrecognized "zx-tool-code" id
			],
		});
	});

	it("does not render the Minor/trivia band at all when the payload supplies no trivia object", () => {
		// `mapCodeDiffPayload` used to default an absent `trivia` to
		// `{count: 0, ...}`, and the band rendered that "0" unconditionally —
		// the same trap the token chip fix closed elsewhere. The fix here is
		// the same shape: no `trivia` object, no band, not a fabricated "0".
		render(<Canvas artifact={artifactWith(SENTINEL_PAYLOAD)} />);

		expect(screen.queryByText("Minor")).not.toBeInTheDocument();
		expect(screen.queryByText(/generated & formatting/i)).not.toBeInTheDocument();
		expect(screen.queryByText(new RegExp(SENTINEL_PAYLOAD.triviaSummary))).not.toBeInTheDocument();
	});

	it("falls back to the safe unknown-canvas, not the promo-fix PR fixture, on a malformed payload", () => {
		render(<Canvas artifact={artifactWith({})} />);

		expect(screen.getByTestId("review-unknown-canvas")).toBeInTheDocument();
		expect(screen.queryByText(/coverage/i)).not.toBeInTheDocument();
	});
});
