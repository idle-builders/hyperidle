/**
 * AD8b — AssistantAttachButton component tests (RED phase).
 *
 * AC-9: Context can be attached from bet cards, task cards, knowledge items,
 *       blocks, and thread messages.
 *
 * This is a rename of CocAttachButton → AssistantAttachButton.
 * Tests import from AssistantAttachButton (the new path) and AssistantContext.
 * Will FAIL until rename is complete.
 */

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { AssistantAttachButton } from "../components/AssistantAttachButton";
import { AssistantContext, type AssistantContextRef } from "../contexts/AssistantContext";

const testRef: AssistantContextRef = { kind: "task", id: "task-1", label: "Ambrovia v2" };

function renderWithContext(
	overlayOpen: boolean,
	attachContext = vi.fn(),
): ReturnType<typeof render> {
	return render(
		<AssistantContext.Provider value={{ overlayOpen, attachContext }}>
			<AssistantAttachButton ref={testRef} />
		</AssistantContext.Provider>,
	);
}

describe("AD8b — AssistantAttachButton", () => {
	it("renders nothing when overlayOpen=false (default context)", () => {
		render(<AssistantAttachButton ref={testRef} />);
		expect(screen.queryByTestId("assistant-attach-button")).not.toBeInTheDocument();
	});

	it("renders a button when overlayOpen=true", () => {
		renderWithContext(true);
		expect(screen.getByTestId("assistant-attach-button")).toBeInTheDocument();
	});

	it("button has accessible aria-label including the ref label", () => {
		renderWithContext(true);
		expect(
			screen.getByRole("button", { name: /attach ambrovia v2 to assistant/i }),
		).toBeInTheDocument();
	});

	it("renders nothing when overlayOpen=false even with explicit Provider", () => {
		renderWithContext(false);
		expect(screen.queryByTestId("assistant-attach-button")).not.toBeInTheDocument();
	});

	it("calls attachContext with the correct ref when clicked", async () => {
		const user = userEvent.setup();
		const attachContext = vi.fn();
		renderWithContext(true, attachContext);
		await user.click(screen.getByTestId("assistant-attach-button"));
		expect(attachContext).toHaveBeenCalledOnce();
		expect(attachContext).toHaveBeenCalledWith(testRef);
	});

	it("button is a native <button> element (keyboard accessible)", () => {
		renderWithContext(true);
		const btn = screen.getByTestId("assistant-attach-button");
		expect(btn.tagName).toBe("BUTTON");
		expect(btn).not.toHaveAttribute("tabindex", "-1");
	});

	it("works with task refs", () => {
		const taskRef: AssistantContextRef = { kind: "task", id: "task-42", label: "Fix the bug" };
		render(
			<AssistantContext.Provider value={{ overlayOpen: true, attachContext: vi.fn() }}>
				<AssistantAttachButton ref={taskRef} />
			</AssistantContext.Provider>,
		);
		expect(
			screen.getByRole("button", { name: /attach fix the bug to assistant/i }),
		).toBeInTheDocument();
	});

	it("works with knowledge_item refs", () => {
		const knowledgeRef: AssistantContextRef = {
			kind: "knowledge_item",
			id: "ki-1",
			label: "API Guide",
		};
		render(
			<AssistantContext.Provider value={{ overlayOpen: true, attachContext: vi.fn() }}>
				<AssistantAttachButton ref={knowledgeRef} />
			</AssistantContext.Provider>,
		);
		expect(screen.getByTestId("assistant-attach-button")).toBeInTheDocument();
	});
});
