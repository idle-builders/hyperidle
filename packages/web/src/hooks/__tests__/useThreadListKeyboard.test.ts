/**
 * L3 — Thread List / Queue Rendering. Pure-hook tests (red phase).
 *
 * Validates the keyboard navigation model that owns J/K/[/]/Enter for the
 * cross-section thread list. The hook does not exist yet; these tests
 * MUST FAIL today.
 *
 * Plan §5.7: J/K = ±1 across flat list (no wrap); [/] = first row of
 * prev/next non-empty section; Enter = onOpenThread(active).
 */
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useThreadListKeyboard } from "../useThreadListKeyboard";

interface FlatRow {
	section: "pinned" | "blocking" | "reviews" | "chats" | "resolved";
	threadId: string;
}

const FLAT: FlatRow[] = [
	{ section: "pinned", threadId: "p1" },
	{ section: "pinned", threadId: "p2" },
	{ section: "blocking", threadId: "b1" },
	{ section: "blocking", threadId: "b2" },
	{ section: "reviews", threadId: "r1" },
	{ section: "reviews", threadId: "r2" },
	{ section: "chats", threadId: "c1" },
];

function dispatchKey(key: string, target: EventTarget = document): void {
	const event = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true });
	target.dispatchEvent(event);
}

describe("L3 — useThreadListKeyboard", () => {
	let onOpenThread: ReturnType<typeof vi.fn>;

	beforeEach(() => {
		onOpenThread = vi.fn();
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("starts with index 0 by default", () => {
		const { result } = renderHook(() => useThreadListKeyboard({ flat: FLAT, onOpenThread }));
		expect(result.current.activeIndex).toBe(0);
		expect(result.current.activeRow).toEqual(FLAT[0]);
	});

	it("J advances by one across section boundaries", () => {
		const { result } = renderHook(() => useThreadListKeyboard({ flat: FLAT, onOpenThread }));
		act(() => {
			dispatchKey("j");
		});
		expect(result.current.activeIndex).toBe(1);
		act(() => {
			dispatchKey("j");
		});
		// Cross from pinned into blocking.
		expect(result.current.activeRow.section).toBe("blocking");
		expect(result.current.activeRow.threadId).toBe("b1");
	});

	it("K decrements by one and crosses sections (last row of prior section)", () => {
		const { result } = renderHook(() =>
			useThreadListKeyboard({ flat: FLAT, onOpenThread, initialIndex: 4 }),
		);
		// Start at r1 (first row of reviews).
		expect(result.current.activeRow.threadId).toBe("r1");
		act(() => {
			dispatchKey("k");
		});
		// Should land on b2 (last row of blocking).
		expect(result.current.activeRow.threadId).toBe("b2");
	});

	it("J does not wrap past the last row", () => {
		const { result } = renderHook(() =>
			useThreadListKeyboard({
				flat: FLAT,
				onOpenThread,
				initialIndex: FLAT.length - 1,
			}),
		);
		act(() => {
			dispatchKey("j");
		});
		expect(result.current.activeIndex).toBe(FLAT.length - 1);
	});

	it("K does not wrap past the first row", () => {
		const { result } = renderHook(() =>
			useThreadListKeyboard({ flat: FLAT, onOpenThread, initialIndex: 0 }),
		);
		act(() => {
			dispatchKey("k");
		});
		expect(result.current.activeIndex).toBe(0);
	});

	it("] jumps to the first row of the next non-empty section", () => {
		const { result } = renderHook(() =>
			useThreadListKeyboard({ flat: FLAT, onOpenThread, initialIndex: 0 }),
		);
		act(() => {
			dispatchKey("]");
		});
		expect(result.current.activeRow.section).toBe("blocking");
		expect(result.current.activeRow.threadId).toBe("b1");
		act(() => {
			dispatchKey("]");
		});
		expect(result.current.activeRow.section).toBe("reviews");
		expect(result.current.activeRow.threadId).toBe("r1");
	});

	it("[ jumps to the first row of the previous non-empty section", () => {
		const { result } = renderHook(() =>
			useThreadListKeyboard({ flat: FLAT, onOpenThread, initialIndex: 6 }),
		);
		// Start at c1.
		expect(result.current.activeRow.threadId).toBe("c1");
		act(() => {
			dispatchKey("[");
		});
		expect(result.current.activeRow.threadId).toBe("r1");
		act(() => {
			dispatchKey("[");
		});
		expect(result.current.activeRow.threadId).toBe("b1");
	});

	it("Enter calls onOpenThread with the active row", () => {
		renderHook(() => useThreadListKeyboard({ flat: FLAT, onOpenThread, initialIndex: 2 }));
		act(() => {
			dispatchKey("Enter");
		});
		expect(onOpenThread).toHaveBeenCalledTimes(1);
		const args = onOpenThread.mock.calls[0];
		expect(args[0]).toBe("b1");
	});

	it("ignores keystrokes when target is an input element", () => {
		const { result } = renderHook(() => useThreadListKeyboard({ flat: FLAT, onOpenThread }));
		const input = document.createElement("input");
		document.body.appendChild(input);
		try {
			act(() => {
				dispatchKey("j", input);
			});
			expect(result.current.activeIndex).toBe(0);
			act(() => {
				dispatchKey("Enter", input);
			});
			expect(onOpenThread).not.toHaveBeenCalled();
		} finally {
			document.body.removeChild(input);
		}
	});

	it("disables itself when the flat list is empty (no errors, no onOpenThread)", () => {
		renderHook(() => useThreadListKeyboard({ flat: [], onOpenThread }));
		act(() => {
			dispatchKey("j");
			dispatchKey("Enter");
		});
		expect(onOpenThread).not.toHaveBeenCalled();
	});

	it("clamps activeIndex when the flat list shrinks", () => {
		const { result, rerender } = renderHook(
			(props: { flat: FlatRow[] }) =>
				useThreadListKeyboard({ flat: props.flat, onOpenThread, initialIndex: 5 }),
			{ initialProps: { flat: FLAT } },
		);
		expect(result.current.activeIndex).toBe(5);
		rerender({ flat: FLAT.slice(0, 3) });
		expect(result.current.activeIndex).toBeLessThan(3);
	});
});
