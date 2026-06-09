/**
 * L21 — CocAttachButton tests
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
import { CocAttachButton } from "../components/CocAttachButton";
import type { CocContextRef } from "../contexts/CocContext";
import { CocContext } from "../contexts/CocContext";

const testRef: CocContextRef = { kind: "bet", id: "bet-1", label: "Ambrovia v2" };

function renderWithContext(
	overlayOpen: boolean,
	attachContext = vi.fn(),
): ReturnType<typeof render> {
	return render(
		<CocContext.Provider value={{ overlayOpen, attachContext }}>
			<CocAttachButton ref={testRef} />
		</CocContext.Provider>,
	);
}

describe("L21 — CocAttachButton", () => {
	it("renders nothing when overlayOpen=false (default context)", () => {
		// No Provider — uses default context value (overlayOpen=false).
		render(<CocAttachButton ref={testRef} />);
		expect(screen.queryByTestId("coc-attach-button")).not.toBeInTheDocument();
	});

	it("renders a button when overlayOpen=true", () => {
		renderWithContext(true);
		expect(screen.getByTestId("coc-attach-button")).toBeInTheDocument();
	});

	it("button has accessible aria-label including the ref label", () => {
		renderWithContext(true);
		expect(
			screen.getByRole("button", { name: /attach ambrovia v2 to assistant/i }),
		).toBeInTheDocument();
	});

	it("renders nothing when overlayOpen=false even with explicit Provider", () => {
		renderWithContext(false);
		expect(screen.queryByTestId("coc-attach-button")).not.toBeInTheDocument();
	});

	it("calls attachContext with the correct ref when clicked", async () => {
		const user = userEvent.setup();
		const attachContext = vi.fn();
		renderWithContext(true, attachContext);
		await user.click(screen.getByTestId("coc-attach-button"));
		expect(attachContext).toHaveBeenCalledOnce();
		expect(attachContext).toHaveBeenCalledWith(testRef);
	});

	it("button is focusable via keyboard (not hover-only)", () => {
		renderWithContext(true);
		const btn = screen.getByTestId("coc-attach-button");
		// Verify it is a <button> element — keyboard-native.
		expect(btn.tagName).toBe("BUTTON");
		expect(btn).not.toHaveAttribute("tabindex", "-1");
	});

	it("works with task refs as well as bet refs", () => {
		const taskRef: CocContextRef = { kind: "task", id: "task-42", label: "Fix the bug" };
		const attachContext = vi.fn();
		render(
			<CocContext.Provider value={{ overlayOpen: true, attachContext }}>
				<CocAttachButton ref={taskRef} />
			</CocContext.Provider>,
		);
		expect(
			screen.getByRole("button", { name: /attach fix the bug to assistant/i }),
		).toBeInTheDocument();
	});
});
