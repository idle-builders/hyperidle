import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { REVIEW_COMPOSITION_SUBJECT } from "../__fixtures__/review-composition.fixture.js";
import { getReviewCanvas } from "../canvas-registry.js";
import { ReviewComposition } from "../ReviewComposition.js";
import type { CodeDiffPayload, ReviewArtifact, ReviewCanvasKind } from "../review-artifact.js";

describe("ReviewComposition", () => {
	function renderComposition(props?: Partial<Parameters<typeof ReviewComposition>[0]>) {
		const onSubmitVerdict = vi.fn();
		return {
			onSubmitVerdict,
			...render(
				<ReviewComposition
					subject={REVIEW_COMPOSITION_SUBJECT}
					onSubmitVerdict={onSubmitVerdict}
					{...props}
				/>,
			),
		};
	}

	it("AC1: renders the bet/task breadcrumb, prompt, outcome, KPIs and visible proof", () => {
		renderComposition();

		expect(screen.getByText(`Bet: ${REVIEW_COMPOSITION_SUBJECT.betTitle}`)).toBeInTheDocument();
		expect(screen.getByText(`“${REVIEW_COMPOSITION_SUBJECT.prompt}”`)).toBeInTheDocument();
		expect(screen.getByText(REVIEW_COMPOSITION_SUBJECT.outcome)).toBeInTheDocument();
		for (const kpi of REVIEW_COMPOSITION_SUBJECT.resultKpis) {
			expect(screen.getByText(kpi.label)).toBeInTheDocument();
			expect(screen.getByText(kpi.value)).toBeInTheDocument();
		}
		expect(screen.getByText("Before")).toBeInTheDocument();
		expect(screen.getByText("After")).toBeInTheDocument();
	});

	it("AC2: surfaces derived needs with jump links", () => {
		renderComposition();

		for (const need of REVIEW_COMPOSITION_SUBJECT.needs) {
			expect(screen.getByText(need.label)).toBeInTheDocument();
			expect(screen.getByText(need.detail)).toBeInTheDocument();
		}
	});

	it("AC3: clicking a need opens the linked artifact in the right pane", async () => {
		const user = userEvent.setup();
		const linkedNeed = REVIEW_COMPOSITION_SUBJECT.needs.find((n) => n.artifactId);
		const target = REVIEW_COMPOSITION_SUBJECT.artifacts.find(
			(a) => a.id === linkedNeed?.artifactId,
		);
		expect(target).toBeDefined();

		renderComposition();
		await user.click(screen.getByText(linkedNeed!.label));

		const pane = screen.getByRole("complementary");
		expect(within(pane).getAllByText(target!.title).length).toBeGreaterThan(0);
	});

	it("AC4: clicking an artifact row opens the family canvas in the right pane", async () => {
		const user = userEvent.setup();
		const artifact = REVIEW_COMPOSITION_SUBJECT.artifacts.find((a) => a.kind === "code_diff")!;
		renderComposition();

		await user.click(screen.getByRole("button", { name: new RegExp(artifact.title, "i") }));

		const pane = screen.getByRole("complementary");
		const codePayload = artifact.payload as CodeDiffPayload;
		expect(within(pane).getAllByText(artifact.title).length).toBeGreaterThan(0);
		expect(within(pane).getByText(codePayload.description)).toBeInTheDocument();
	});

	it("AC5: closing the pane returns the composition to full width", async () => {
		const user = userEvent.setup();
		renderComposition({ initialOpenArtifactId: "artifact:code:1" });

		const close = screen.getByRole("button", { name: /close artifact/i });
		await user.click(close);

		expect(screen.queryByRole("complementary")).not.toBeInTheDocument();
	});

	it("AC6: Esc closes the right pane", async () => {
		const user = userEvent.setup();
		renderComposition({ initialOpenArtifactId: "artifact:code:1" });

		expect(screen.getByRole("complementary")).toBeInTheDocument();
		await user.keyboard("{Escape}");

		expect(screen.queryByRole("complementary")).not.toBeInTheDocument();
	});

	it("AC7: renders one global conversation with reference chips", () => {
		renderComposition();

		const conversation = screen.getByText("Conversation").closest("section")!;
		for (const comment of REVIEW_COMPOSITION_SUBJECT.conversation) {
			expect(within(conversation).getByText(comment.body)).toBeInTheDocument();
		}
		const ref = REVIEW_COMPOSITION_SUBJECT.conversation[0]?.refs?.[0];
		expect(ref).toBeDefined();
		expect(within(conversation).getByText(ref!.label)).toBeInTheDocument();
	});

	it("AC8: verdict buttons submit one binding verdict over the Subject", async () => {
		const user = userEvent.setup();
		const { onSubmitVerdict } = renderComposition();

		await user.click(screen.getByRole("button", { name: /^Approve$/i }));
		expect(onSubmitVerdict).toHaveBeenCalledExactlyOnceWith("approve");

		await user.click(screen.getByRole("button", { name: /Request changes/i }));
		expect(onSubmitVerdict).toHaveBeenCalledWith("request-changes");
	});

	it("AC9: overflow verdict options submit the corresponding decision", async () => {
		const user = userEvent.setup();
		const { onSubmitVerdict } = renderComposition();

		await user.click(screen.getByRole("button", { name: /more verdict options/i }));
		await user.click(screen.getByRole("button", { name: /Reject/i }));

		expect(onSubmitVerdict).toHaveBeenCalledWith("reject");
	});

	it("does not render a separate conversation or verdict control per artifact", () => {
		renderComposition();

		// Only one Approve button should exist in the frame, not inside each canvas.
		expect(screen.getAllByRole("button", { name: /^Approve$/i })).toHaveLength(1);
	});

	it("falls back to a safe unknown canvas when a kind has no tailored renderer", () => {
		const unknownArtifact: ReviewArtifact = {
			id: "artifact:unknown:1",
			tool: "example",
			app: "Example",
			sourceHref: "https://example.com/1",
			title: "Mystery output",
			kind: "not_a_real_kind" as ReviewCanvasKind,
			payload: { foo: "bar" },
		};
		const CanvasComponent = getReviewCanvas(unknownArtifact.kind);
		const { container } = render(<CanvasComponent artifact={unknownArtifact} />);

		expect(within(container).getByText("Mystery output")).toBeInTheDocument();
	});
});
