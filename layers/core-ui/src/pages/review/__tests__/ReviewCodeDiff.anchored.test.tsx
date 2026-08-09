import type { AnchorRef, BlockId } from "@hyperidle/domain-model";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Mock } from "vitest";
import { describe, expect, it, vi as vitest } from "vitest";
import { MOCK_REVIEW_SUBJECT } from "../__fixtures__/review-subject.fixture.js";
import { getReviewCanvas } from "../canvas-registry.js";
import type { CodeDiffPayload, ReviewArtifact } from "../review-artifact.js";
import { lineBlockId, ReviewCanvasProvider } from "../review-canvas.js";
import type { ReviewComment } from "../review-composition.js";

const codeArtifact = MOCK_REVIEW_SUBJECT.artifacts.find(
	(a): a is ReviewArtifact<CodeDiffPayload> => a.kind === "code_diff",
)!;
const file = codeArtifact.payload.files[0]!;
const hunk = file.hunks![0]!;
const targetLine = hunk.lines.find((l) => /code: "promo_expired"/.test(l.text))!;
const targetBlockId = lineBlockId(codeArtifact.id, file.path, 0, targetLine);

function renderCanvas({
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
		const { onAddAnchor } = renderCanvas({});

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

		renderCanvas({ anchors: [anchored], onAddAnchor: onReply });

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

		renderCanvas({ anchors: [anchored], onAddAnchor });

		expect(screen.getByText("Orphan comment.")).toBeInTheDocument();
		expect(screen.getByText("source changed")).toBeInTheDocument();
	});
});
