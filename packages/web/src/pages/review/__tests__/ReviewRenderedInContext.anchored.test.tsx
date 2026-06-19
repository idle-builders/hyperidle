import type { AnchorRef } from "@hyperidle/shared";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Mock } from "vitest";
import { describe, expect, it, vi as vitest } from "vitest";
import { MOCK_REVIEW_SUBJECT } from "../__fixtures__/review-subject.fixture.js";
import { getReviewCanvas } from "../canvas-registry.js";
import type { RenderedInContextPayload, ReviewArtifact } from "../review-artifact.js";
import { deriveProseBlocks, ReviewCanvasProvider } from "../review-canvas.js";
import type { ReviewComment } from "../review-composition.js";

const proseArtifact = MOCK_REVIEW_SUBJECT.artifacts.find(
	(a): a is ReviewArtifact<RenderedInContextPayload> => a.kind === "rendered_in_context",
)!;

const subject = proseArtifact.payload.inboxRow.subject;
const firstBlock = deriveProseBlocks(proseArtifact.id, proseArtifact.payload.body)[0]!;

function renderCanvas({
	anchors = [],
	onAddAnchor = vitest.fn().mockResolvedValue(undefined),
	readOnly = false,
}: {
	anchors?: ReviewComment[];
	onAddAnchor?: Mock<(input: { anchor: AnchorRef; text: string }) => Promise<void>>;
	readOnly?: boolean;
}) {
	const Canvas = getReviewCanvas("rendered_in_context");
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
				<Canvas artifact={proseArtifact} />
			</ReviewCanvasProvider>,
		),
	};
}

describe("ReviewRenderedInContext — anchored comments", () => {
	it("opens an inline composer for the first paragraph and calls onAddAnchor", async () => {
		const { onAddAnchor } = renderCanvas({});

		const toggle = screen.getByRole("button", { name: /comment on body/i });
		await userEvent.click(toggle);

		const textarea = screen.getByTestId("composer-textarea");
		await userEvent.type(textarea, "This line feels too promotional.");

		const send = screen.getByRole("button", { name: /^Send$/ });
		await userEvent.click(send);

		await waitFor(() => {
			expect(onAddAnchor).toHaveBeenCalledTimes(1);
		});

		const call = onAddAnchor.mock.calls[0]![0];
		expect(call.anchor.artifactId).toBe(proseArtifact.id);
		expect(call.anchor.blockId).toBe(firstBlock.id);
		expect(call.anchor.spotLabel).toBe(subject);
		expect(call.text).toBe("This line feels too promotional.");
	});

	it("hides the comment button in read-only mode", () => {
		renderCanvas({ readOnly: true });
		expect(screen.queryByRole("button", { name: /comment on body/i })).not.toBeInTheDocument();
	});
});
