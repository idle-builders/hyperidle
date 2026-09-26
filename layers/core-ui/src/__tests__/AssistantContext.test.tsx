/**
 * AssistantContext tests.
 *
 * Context can be attached: AssistantContext exports the correct shape.
 */

import { render } from "@testing-library/react";
import { useContext } from "react";
import { describe, expect, it, vi } from "vitest";
import {
	AssistantContext,
	type AssistantContextRef,
	type AssistantContextValue,
} from "../contexts/AssistantContext";

describe("AssistantContext", () => {
	it("AssistantContext default value has overlayOpen=false", () => {
		let capturedValue: AssistantContextValue | null = null;

		function Consumer(): null {
			capturedValue = useContext(AssistantContext);
			return null;
		}

		render(<Consumer />);

		expect(capturedValue).not.toBeNull();
		expect(capturedValue!.overlayOpen).toBe(false);
	});

	it("AssistantContext default attachContext is a function", () => {
		let capturedValue: AssistantContextValue | null = null;

		function Consumer(): null {
			capturedValue = useContext(AssistantContext);
			return null;
		}

		render(<Consumer />);

		expect(typeof capturedValue!.attachContext).toBe("function");
	});

	it("Provider passes overlayOpen=true to consumers", () => {
		let capturedOverlayOpen = false;

		function Consumer(): null {
			const ctx = useContext(AssistantContext);
			capturedOverlayOpen = ctx.overlayOpen;
			return null;
		}

		render(
			<AssistantContext.Provider value={{ overlayOpen: true, attachContext: vi.fn() }}>
				<Consumer />
			</AssistantContext.Provider>,
		);

		expect(capturedOverlayOpen).toBe(true);
	});

	it("attachContext passes the ref to the provider handler", () => {
		const mockAttachContext = vi.fn();
		const testRef: AssistantContextRef = { kind: "task", id: "task-1", label: "Test Bet" };

		function Consumer(): null {
			const { attachContext } = useContext(AssistantContext);
			attachContext(testRef);
			return null;
		}

		render(
			<AssistantContext.Provider value={{ overlayOpen: true, attachContext: mockAttachContext }}>
				<Consumer />
			</AssistantContext.Provider>,
		);

		expect(mockAttachContext).toHaveBeenCalledWith(testRef);
	});

	it("AssistantContextRef supports all attachment kinds", () => {
		// Type-level test: all 5 context kinds compile
		// @lore: betRef now uses kind:"task" (root tasks replace bets)
		const betRef: AssistantContextRef = { kind: "task", id: "b1", label: "Bet" };
		const taskRef: AssistantContextRef = { kind: "task", id: "t1", label: "Task" };
		const documentRef: AssistantContextRef = { kind: "document", id: "ki1", label: "KB" };
		const messageRef: AssistantContextRef = { kind: "message", id: "msg1", label: "Message" };

		expect(betRef.kind).toBe("task");
		expect(taskRef.kind).toBe("task");
		expect(documentRef.kind).toBe("document");
		expect(messageRef.kind).toBe("message");
	});

	it("AssistantContextRef supports pending_block kind with content snapshot", () => {
		const pendingBlock: AssistantContextRef = {
			kind: "pending_block",
			content: "Full block text captured at click time.",
			label: "Full block text captured",
		};
		expect(pendingBlock.kind).toBe("pending_block");
		expect(pendingBlock.content).toBe("Full block text captured at click time.");
	});
});
