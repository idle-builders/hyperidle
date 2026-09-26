import type { AnchorRef } from "@hyperidle/domain-model";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Mock } from "vitest";
import { describe, expect, it, vi as vitest } from "vitest";
import type { BlockId } from "../../../block/types.js";
import { CodeDeltaRenderer } from "../../../ds";
import { MOCK_REVIEW_SUBJECT } from "../__fixtures__/review-subject.fixture.js";
import { getReviewCanvas } from "../canvas-registry.js";
import type { CodeDiffPayload, ReviewArtifact } from "../review-artifact.js";
import { lineBlockId, ReviewCanvasProvider } from "../review-canvas.js";
import type { ReviewComment } from "../review-composition.js";
import { assertNoFabrication, domText } from "./no-fabrication";

const artifact = MOCK_REVIEW_SUBJECT.artifacts.find(
	(a) => a.kind === "code_diff",
)! as ReviewArtifact<CodeDiffPayload>;

function renderCanvas() {
	const Canvas = getReviewCanvas(artifact.kind);
	return render(<Canvas artifact={artifact} />);
}

describe("ReviewCodeDiff canvas", () => {
	it("renders the artifact title and the PR summary", () => {
		renderCanvas();

		expect(screen.getByText(artifact.title)).toBeInTheDocument();
		expect(screen.getByText(artifact.payload.description)).toBeInTheDocument();
	});

	it("shows the tool logo and a safe source link back to the record", () => {
		renderCanvas();

		expect(screen.getByTitle(artifact.app)).toBeInTheDocument();
		const link = screen.getByRole("link", { name: `Open in ${artifact.app}` });
		expect(link).toHaveAttribute("href", artifact.sourceHref);
		expect(link.textContent).toContain("↗");
	});

	it("orders logic files before test files", () => {
		renderCanvas();

		const logicFile = screen.getByText(/promo-webhook\.ts/);
		const testFile = screen.getByText(/promo\.expired\.test\.ts/);
		expect(logicFile.compareDocumentPosition(testFile) & Node.DOCUMENT_POSITION_FOLLOWING).toBe(
			Node.DOCUMENT_POSITION_FOLLOWING,
		);
	});

	it("renders the CI checks row inline", () => {
		renderCanvas();

		// `checks` is `readonly string[]` — labels only, no pass/fail state, so
		// "All checks passed" would assert a status nothing here actually knows.
		// The row renders the check names the payload has.
		expect(screen.queryByText(/all checks passed/i)).not.toBeInTheDocument();
		for (const check of artifact.payload.checks) {
			expect(screen.getByText(check)).toBeInTheDocument();
		}
	});

	it("renders the total change badge from payload counts", () => {
		renderCanvas();

		// files: 28+19+44 added + trivia 49 = 140; removed: 6+2+0 + 23 = 31
		expect(screen.getByText("+140")).toBeInTheDocument();
		expect(screen.getByText("−31")).toBeInTheDocument();
	});

	it("collapses the minor/generated trivia band by default", () => {
		renderCanvas();

		const trivia = screen.getByRole("button", {
			name: /files · OpenAPI regen \+ lockfile \+ formatting/i,
		});
		expect(trivia).toHaveAttribute("aria-expanded", "false");
	});

	it("expands the top logic file and renders its hunks", () => {
		renderCanvas();

		expect(
			screen.getByText(/@@ -116,9 \+116,18 @@ export async function onPromoApplied/),
		).toBeInTheDocument();
		expect(screen.getByText(/const promo = await promos\.find\(evt\.code\);/)).toBeInTheDocument();
	});

	// Inverse-proof: ReviewCodeDiff composes the DS CodeDeltaRenderer slot seam.
	// This test verifies the wiring is real. It will fail if FileDiff reverts to its
	// own hand-rolled hunk/line DOM and stops using CodeDeltaRenderer.
	//
	// Proof strategy: CodeDeltaRenderer (the DS core) is what emits `data-diff-type`
	// attributes and the `aria-label="Code diff: <file>"` on the <pre> element.
	// If FileDiff stops composing the DS core these attributes vanish from the DOM.
	it("FileDiff delegates structure to DS CodeDeltaRenderer (diff-type attrs + aria-label present)", () => {
		// Confirm CodeDeltaRenderer is exported from the DS (import succeeds).
		expect(CodeDeltaRenderer).toBeDefined();

		const { container } = renderCanvas();

		// The DS CodeDeltaRenderer emits data-diff-type on each diff line div.
		// The review chrome's slot wiring is the only path that produces this in FileDiff.
		const addLines = container.querySelectorAll('[data-diff-type="add"]');
		const delLines = container.querySelectorAll('[data-diff-type="del"]');
		expect(addLines.length).toBeGreaterThan(0);
		expect(delLines.length).toBeGreaterThan(0);

		// CodeDeltaRenderer renders <pre aria-label="Code diff: <file>"> — the review
		// chrome's hand-rolled version used a plain <div>, not a labelled <pre>.
		// This label is structural proof that CodeDeltaRenderer owns the diff structure.
		const preDiff = container.querySelector('pre[aria-label^="Code diff:"]');
		expect(preDiff).not.toBeNull();
	});
});

// ---------------------------------------------------------------------------
// Anchored comments
// ---------------------------------------------------------------------------

const codeArtifact = MOCK_REVIEW_SUBJECT.artifacts.find(
	(a): a is ReviewArtifact<CodeDiffPayload> => a.kind === "code_diff",
)!;
const file = codeArtifact.payload.files[0]!;
const hunk = file.hunks![0]!;
const targetLine = hunk.lines.find((l) => /code: "promo_expired"/.test(l.text))!;
const targetBlockId = lineBlockId(codeArtifact.id, file.path, 0, targetLine);

function renderAnchoredCanvas({
	anchors = [],
	onAddAnchor = vitest.fn().mockResolvedValue(undefined),
	readOnly = false,
}: {
	anchors?: ReviewComment[];
	onAddAnchor?: Mock<(input: { anchor: AnchorRef; text: string }) => Promise<void>>;
	readOnly?: boolean;
}) {
	const Canvas = getReviewCanvas("code_diff");
	return {
		onAddAnchor,
		...render(
			<ReviewCanvasProvider
				value={{
					anchors: anchors as ReadonlyArray<ReviewComment>,
					readOnly,
					onAddAnchor,
					onJumpToAnchor: vitest.fn(),
				}}
			>
				<Canvas artifact={codeArtifact} />
			</ReviewCanvasProvider>,
		),
	};
}

describe("ReviewCodeDiff — anchored comments", () => {
	it("opens an inline composer at the gutter and calls onAddAnchor with block identity", async () => {
		const { onAddAnchor } = renderAnchoredCanvas({});

		// The + affordance is hidden until the line is hovered; fire the click
		// directly using the accessible label so we exercise the wiring.
		const lineText = screen.getByText((content) => content.includes('code: "promo_expired"'));
		const line = lineText.closest("[data-diff-type]") as HTMLElement;
		const plus = within(line).getByRole("button", { name: "Add inline comment", hidden: true });
		fireEvent.click(plus);

		const textarea = screen.getByTestId("composer-textarea");
		await userEvent.type(textarea, "This looks fragile.");

		const send = screen.getByRole("button", { name: /^Send$/ });
		await userEvent.click(send);

		await waitFor(() => {
			expect(onAddAnchor).toHaveBeenCalledTimes(1);
		});

		const call = onAddAnchor.mock.calls[0]![0];
		expect(call.anchor.artifactId).toBe(codeArtifact.id);
		expect(call.anchor.blockId).toBe(targetBlockId);
		expect(call.anchor.spotLabel).toBe(`${file.path}:${targetLine.newNo}`);
		expect(call.text).toBe("This looks fragile.");
	});

	it("renders a threaded anchored comment next to its line and supports a reply", async () => {
		const onReply = vitest.fn().mockResolvedValue(undefined);
		const anchored: ReviewComment = {
			id: "c-1",
			author: "Founder",
			authorIsAgent: false,
			body: "This error code needs a namespace prefix.",
			ago: "1 min ago",
			anchor: {
				artifactId: codeArtifact.id,
				blockId: targetBlockId,
				spotLabel: `${file.path}:${targetLine.newNo}`,
			},
		};

		renderAnchoredCanvas({ anchors: [anchored], onAddAnchor: onReply });

		expect(screen.getByText(anchored.body)).toBeInTheDocument();

		const replyToggle = screen.getByRole("button", { name: /reply/i });
		await userEvent.click(replyToggle);

		const textarea = screen.getByTestId("composer-textarea");
		await userEvent.type(textarea, "Agreed — will fix.");

		const send = screen.getByRole("button", { name: /^Send$/ });
		await userEvent.click(send);

		await waitFor(() => {
			expect(onReply).toHaveBeenCalledTimes(1);
		});

		const call = onReply.mock.calls[0]![0];
		expect(call.anchor.blockId).toBe(targetBlockId);
		expect(call.text).toBe("Agreed — will fix.");
	});

	it("keeps the anchored comment attached when surrounding lines change", async () => {
		const onAddAnchor = vitest.fn().mockResolvedValue(undefined);
		// Mutate only the surrounding context line text; keep the target line intact.
		const mutatedPayload: CodeDiffPayload = {
			...codeArtifact.payload,
			files: codeArtifact.payload.files.map((f) => ({
				...f,
				hunks: f.hunks!.map((h) => ({
					...h,
					lines: h.lines.map((l) =>
						l.text === "  const promo = await promos.find(evt.code);"
							? { ...l, text: "  const promo = await promos.find(evt.code, { cache: false });" }
							: l,
					),
				})),
			})),
		};
		const mutatedArtifact: ReviewArtifact<CodeDiffPayload> = {
			...codeArtifact,
			payload: mutatedPayload,
		};
		const Canvas = getReviewCanvas("code_diff");
		const anchored: ReviewComment = {
			id: "c-stable",
			author: "Founder",
			authorIsAgent: false,
			body: "Stable anchor.",
			ago: "1 min ago",
			anchor: {
				artifactId: codeArtifact.id,
				blockId: targetBlockId,
				spotLabel: `${file.path}:${targetLine.newNo}`,
			},
		};
		render(
			<ReviewCanvasProvider
				value={{
					anchors: [anchored],
					readOnly: false,
					onAddAnchor,
					onJumpToAnchor: vitest.fn(),
				}}
			>
				<Canvas artifact={mutatedArtifact} />
			</ReviewCanvasProvider>,
		);

		expect(screen.getByText("Stable anchor.")).toBeInTheDocument();
	});

	it("renders orphaned anchored comments in an orphan band when the line is gone", () => {
		const onAddAnchor = vitest.fn().mockResolvedValue(undefined);
		const anchored: ReviewComment = {
			id: "c-orphan",
			author: "Founder",
			authorIsAgent: false,
			body: "Orphan comment.",
			ago: "1 min ago",
			anchor: {
				artifactId: codeArtifact.id,
				blockId: "blockIdThatNoLongerExists" as BlockId,
				spotLabel: `${file.path}:999`,
			},
		};

		renderAnchoredCanvas({ anchors: [anchored], onAddAnchor });

		expect(screen.getByText("Orphan comment.")).toBeInTheDocument();
		expect(screen.getByText("source changed")).toBeInTheDocument();
	});
});

// ---------------------------------------------------------------------------
// No fabrication — renders only what the payload supplies
// ---------------------------------------------------------------------------
//
// `coverage +0.4%` (CiRow) used to render on every diff as a figure
// `CodeDiffPayload` has no field for, alongside a fixed "Minor / generated &
// formatting — safe to skip" framing. `checks: readonly string[]` carries
// labels only, no pass/fail state, yet CiRow used to always render "All
// checks passed" with a checkmark next to every one of them; and the
// expanded trivia band used to hardcode three literal filenames —
// "openapi/schema.gen.ts", "package-lock.json", "src/checkout/styles.css" —
// regardless of what the payload's trivia actually touched.

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
