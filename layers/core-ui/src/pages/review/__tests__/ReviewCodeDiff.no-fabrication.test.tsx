// BA2 T4e-a — ReviewCodeDiff must render only what its payload supplies.
//
// architecture.md §2.8.2 D names `coverage +0.4%` (CiRow, ReviewCodeDiff.tsx:335-336)
// as a figure `CodeDiffPayload` has no field for, rendered on every diff — and
// the fixed "Minor / generated & formatting — safe to skip" framing (:751-753).
// This file also names two neither critique caught: `checks: readonly
// string[]` carries labels only, no pass/fail state, yet CiRow always renders
// "All checks passed" with a checkmark next to every one of them; and the
// expanded trivia band hardcodes three literal filenames — "openapi/schema.gen.ts",
// "package-lock.json", "src/checkout/styles.css" — regardless of what the
// payload's trivia actually touched.
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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
	"safe",
	"to",
	"skip",
	"Logic",
	"Open",
	"in",
];

describe("ReviewCodeDiff — no fabrication (BA2 T4e-a)", () => {
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

	it("renders only what the payload supplies, chrome aside, once the file and trivia disclosures are open", async () => {
		const user = userEvent.setup();
		const { container } = render(<Canvas artifact={artifactWith(SENTINEL_PAYLOAD)} />);

		// BA2 T4e-a: the top (most-relevant) file now starts expanded by default,
		// derived from the payload's own first file — previously this only ever
		// happened to be true for the deleted CODE_DIFF_FIXTURE's own first path,
		// so a sentinel payload with a different path needed an explicit click.
		// SENTINEL_PAYLOAD's one file IS the default now; clicking its toggle
		// here would collapse it instead of opening it.
		await user.click(
			screen.getByRole("button", { name: new RegExp(SENTINEL_PAYLOAD.triviaSummary) }),
		);

		expect(screen.getByText(SENTINEL_PAYLOAD.description)).toBeInTheDocument();
		expect(screen.getByText(SENTINEL_PAYLOAD.checks[0]!)).toBeInTheDocument();
		expect(screen.getByText(SENTINEL_PAYLOAD.files[0]!.rationale!)).toBeInTheDocument();
		expect(screen.getByText(SENTINEL_PAYLOAD.files[0]!.hunks![0]!.header)).toBeInTheDocument();
		expect(
			screen.getByText(SENTINEL_PAYLOAD.files[0]!.hunks![0]!.lines[0]!.text.trim()),
		).toBeInTheDocument();
		expect(screen.getByText(new RegExp(SENTINEL_PAYLOAD.triviaSummary))).toBeInTheDocument();

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
				SENTINEL_PAYLOAD.triviaSummary,
			],
			chrome: CHROME,
			derived: [
				1, // files.length + trivia.count (0) — "1 files changed"
				SENTINEL_PAYLOAD.files[0]!.added!, // total added badge (one file, no trivia added)
				SENTINEL_PAYLOAD.files[0]!.removed!, // total removed badge
				0, // trivia.count — no `trivia` object supplied, mapper defaults it to 0
				"Z", // ToolLogo's neutral monogram for the unrecognized "zx-tool-code" id
			],
		});
	});

	it("falls back to the safe unknown-canvas, not the promo-fix PR fixture, on a malformed payload", () => {
		render(<Canvas artifact={artifactWith({})} />);

		expect(screen.getByTestId("review-unknown-canvas")).toBeInTheDocument();
		expect(screen.queryByText(/coverage/i)).not.toBeInTheDocument();
	});
});
