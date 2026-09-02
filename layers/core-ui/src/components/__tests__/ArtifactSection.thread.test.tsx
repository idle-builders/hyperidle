/**
 * A produced item appears in the conversation it was produced in.
 *
 * This is the thread half of the parity requirement: a human and an agent put
 * a knowledge item into a conversation the same way, and this is the surface
 * where either one shows up.
 *
 * The conversation page already owns a `SplitView`, so the section hands the
 * click back rather than splitting a second time inside it — two splits on one
 * screen fight over the same gesture and the same width.
 */

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ArtifactSection } from "../ArtifactSection.js";

vi.mock("../../hooks/useParentedKnowledgeItems.js", () => ({
	useParentedKnowledgeItems: (parentKind: string, parentId: string) => ({
		data: {
			items: [
				{
					id: "ki-1",
					title: `Produced in ${parentKind} ${parentId}`,
					status: "draft",
				},
			],
		},
		error: null,
		isLoading: false,
	}),
}));

describe("produced items in a conversation", () => {
	it("lists an item parented to the thread", () => {
		render(
			<ArtifactSection parentKind="thread" parentId="thr-1" heading="Artifacts" onOpen={vi.fn()} />,
		);

		expect(screen.getByText("Produced in thread thr-1")).toBeInTheDocument();
	});

	it("hands the click to the caller instead of splitting inside itself", async () => {
		const onOpen = vi.fn();
		render(
			<ArtifactSection parentKind="thread" parentId="thr-1" heading="Artifacts" onOpen={onOpen} />,
		);

		await userEvent.click(screen.getByText("Produced in thread thr-1"));

		expect(onOpen).toHaveBeenCalledWith("ki-1");
		// The caller owns the split — this section must not have opened one.
		expect(screen.queryByTestId("artifact-section-detail")).toBeNull();
	});

	it("still owns its own split when no caller takes the click", async () => {
		render(<ArtifactSection parentKind="task" parentId="task-1" heading="Artifacts" />);

		await userEvent.click(screen.getByText("Produced in task task-1"));

		expect(screen.getByTestId("artifact-section-detail")).toBeInTheDocument();
	});
});
