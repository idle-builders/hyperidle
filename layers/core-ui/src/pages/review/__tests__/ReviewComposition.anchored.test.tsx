import type { AnchorRef } from "@hyperidle/domain-model";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { REVIEW_COMPOSITION_SUBJECT } from "../__fixtures__/review-composition.fixture.js";
import { ReviewComposition } from "../ReviewComposition.js";

describe("ReviewComposition — anchored comments", () => {
	function renderComposition(props?: Partial<Parameters<typeof ReviewComposition>[0]>) {
		const onSubmitVerdict = vi.fn();
		const onPostComment = vi.fn().mockResolvedValue(undefined);
		return {
			onSubmitVerdict,
			onPostComment,
			...render(
				<ReviewComposition
					subject={REVIEW_COMPOSITION_SUBJECT}
					onSubmitVerdict={onSubmitVerdict}
					onPostComment={onPostComment}
					threadId="thread-review-1"
					{...props}
				/>,
			),
		};
	}

	it("posts unanchored comments from the global composer", async () => {
		const { onPostComment } = renderComposition();

		const textarea = screen.getByTestId("composer-textarea");
		await userEvent.type(textarea, "Looks good overall.");

		const send = screen.getByRole("button", { name: /^Send$/ });
		await userEvent.click(send);

		await waitFor(() => {
			expect(onPostComment).toHaveBeenCalledTimes(1);
		});

		const call = onPostComment.mock.calls[0]![0];
		expect(call.text).toBe("Looks good overall.");
		expect(call.anchor).toBeUndefined();
	});

	it("clicking an anchor chip in the global conversation jumps to the artifact", async () => {
		renderComposition();

		const conversation = screen.getByText("Conversation").closest("section")!;
		const chip = within(conversation).getByRole("button", { name: /go to anchor/i });
		await userEvent.click(chip);

		const pane = screen.getByRole("complementary");
		expect(pane).toBeInTheDocument();
		// The pane title is the code diff artifact.
		const codeArtifact = REVIEW_COMPOSITION_SUBJECT.artifacts.find(
			(a) => a.id === "artifact:code:1",
		)!;
		expect(within(pane).getAllByText(codeArtifact.title).length).toBeGreaterThan(0);
	});

	it("keeps verdict submission independent of anchored conversation", async () => {
		const { onSubmitVerdict } = renderComposition();

		await userEvent.click(screen.getByRole("button", { name: /^Approve$/i }));

		expect(onSubmitVerdict).toHaveBeenCalledExactlyOnceWith("approve");
	});

	it("hides the global composer when the review is resolved", () => {
		const resolvedSubject = {
			...REVIEW_COMPOSITION_SUBJECT,
			verdict: { decision: "approve" as const },
		};
		renderComposition({ subject: resolvedSubject });

		expect(screen.queryByTestId("composer-textarea")).not.toBeInTheDocument();
		expect(screen.getByText(/review resolved/i)).toBeInTheDocument();
	});

	it("passes an anchor when sending an inline reply from an opened artifact", async () => {
		const { onPostComment } = renderComposition({ initialOpenArtifactId: "artifact:code:1" });

		const pane = screen.getByRole("complementary");
		const lineText = within(pane).getByText((content) => content.includes('code: "promo_expired"'));
		const line = lineText.closest("[data-diff-type]") as HTMLElement;
		const plus = within(line).getByRole("button", { name: "Add inline comment", hidden: true });

		// Tailwind group-hover hides the +; dispatch click directly.
		fireEvent.click(plus);

		const composer = within(pane).getByTestId("composer-textarea");
		await userEvent.type(composer, "Nice error shape.");

		const send = within(pane).getByRole("button", { name: /^Send$/ });
		await userEvent.click(send);

		await waitFor(() => {
			expect(onPostComment).toHaveBeenCalledTimes(1);
		});

		const call = onPostComment.mock.calls[0]![0];
		expect(call.text).toBe("Nice error shape.");
		expect((call.anchor as AnchorRef | undefined)?.artifactId).toBe("artifact:code:1");
		expect((call.anchor as AnchorRef | undefined)?.spotLabel).toBeDefined();
	});
});
