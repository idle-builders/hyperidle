/**
 * AD8b — AssistantContext tests (RED phase).
 *
 * AC-9: Context can be attached (AssistantContext exports the correct shape).
 * AC-10: Rename from CocContext to AssistantContext (imports from the new path).
 *
 * Will FAIL until AssistantContext.tsx is created.
 */

import { render } from "@testing-library/react";
import { useContext } from "react";
import { describe, expect, it, vi } from "vitest";
import {
	AssistantContext,
	type AssistantContextRef,
	type AssistantContextValue,
} from "../contexts/AssistantContext";

describe("AD8b — AssistantContext", () => {
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
		const testRef: AssistantContextRef = { kind: "bet", id: "bet-1", label: "Test Bet" };

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
		const betRef: AssistantContextRef = { kind: "bet", id: "b1", label: "Bet" };
		const taskRef: AssistantContextRef = { kind: "task", id: "t1", label: "Task" };
		const knowledgeRef: AssistantContextRef = { kind: "knowledge_item", id: "ki1", label: "KB" };
		const messageRef: AssistantContextRef = { kind: "message", id: "msg1", label: "Message" };

		expect(betRef.kind).toBe("bet");
		expect(taskRef.kind).toBe("task");
		expect(knowledgeRef.kind).toBe("knowledge_item");
		expect(messageRef.kind).toBe("message");
	});

	it("AssistantContextRef supports block kind with triple (blockId, hostKind, hostId)", () => {
		const blockRef: AssistantContextRef = {
			kind: "block",
			blockId: "blk-1",
			hostKind: "bet",
			hostId: "bet-1",
			label: "Block content",
		};
		expect(blockRef.kind).toBe("block");
		expect(blockRef.blockId).toBe("blk-1");
	});
});
