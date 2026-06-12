/**
 * AF14 — AssistantAttachButton tests (AF14: renamed from CocAttachButton)
 *
 * AC coverage:
 *   A3: "+" button appears on BetCard/TaskCard when overlayOpen=true.
 *   A3: button is keyboard-accessible (not hover-only).
 *   A3: clicking calls attachContext with the correct ref.
 *   A3: button renders nothing when overlayOpen=false.
 */

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { AssistantAttachButton } from "../components/AssistantAttachButton";
import type { AssistantContextRef } from "../contexts/AssistantContext";
import { AssistantContext } from "../contexts/AssistantContext";

const testRef: AssistantContextRef = { kind: "bet", id: "bet-1", label: "Ambrovia v2" };

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

describe("AF14 — AssistantAttachButton", () => {
	it("renders nothing when overlayOpen=false (default context)", () => {
		// No Provider — uses default context value (overlayOpen=false).
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

	it("button is focusable via keyboard (not hover-only)", () => {
		renderWithContext(true);
		const btn = screen.getByTestId("assistant-attach-button");
		// Verify it is a <button> element — keyboard-native.
		expect(btn.tagName).toBe("BUTTON");
		expect(btn).not.toHaveAttribute("tabindex", "-1");
	});

	it("works with task refs as well as bet refs", () => {
		const taskRef: AssistantContextRef = { kind: "task", id: "task-42", label: "Fix the bug" };
		const attachContext = vi.fn();
		render(
			<AssistantContext.Provider value={{ overlayOpen: true, attachContext }}>
				<AssistantAttachButton ref={taskRef} />
			</AssistantContext.Provider>,
		);
		expect(
			screen.getByRole("button", { name: /attach fix the bug to assistant/i }),
		).toBeInTheDocument();
	});
});
