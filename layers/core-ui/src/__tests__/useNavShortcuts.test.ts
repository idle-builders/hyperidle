/**
 * AG4 — useNavShortcuts hook (RED phase).
 *
 * Guards:
 *   - ⌘[ → onBack
 *   - ⌘] → onForward
 *   - ⌘1 → onSwitchView("conversations")
 *   - ⌘2 → onSwitchView("work")
 *   - ⌘3 → onSwitchView("knowledge")
 *   - Must NOT fire while target is input/textarea/contentEditable
 *   - Must NOT collide with ⌘K (search)
 *   - Must preventDefault on matched combos
 *
 * Guard source: AppShell L446-447 — tagName === "input" || tagName === "textarea" || el.isContentEditable
 * NOT from useCommandK (which has no typing guard).
 *
 * These tests FAIL until layers/core-ui/src/hooks/useNavShortcuts.ts exists.
 */

// @vitest-environment jsdom

import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useNavShortcuts } from "../hooks/useNavShortcuts.js";

function dispatchKey(
	key: string,
	opts: { metaKey?: boolean; ctrlKey?: boolean; target?: HTMLElement } = {},
): KeyboardEvent {
	const event = new KeyboardEvent("keydown", {
		key,
		metaKey: opts.metaKey ?? false,
		ctrlKey: opts.ctrlKey ?? false,
		bubbles: true,
		cancelable: true,
	});
	if (opts.target) {
		// Dispatch from a specific target element
		opts.target.dispatchEvent(event);
	} else {
		document.dispatchEvent(event);
	}
	return event;
}

describe("useNavShortcuts", () => {
	const makeOpts = () => ({
		onBack: vi.fn(),
		onForward: vi.fn(),
		onSwitchView: vi.fn(),
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	describe("⌘[ — Back", () => {
		it("fires onBack on Meta+[", () => {
			const opts = makeOpts();
			renderHook(() => useNavShortcuts(opts));
			act(() => {
				dispatchKey("[", { metaKey: true });
			});
			expect(opts.onBack).toHaveBeenCalledOnce();
		});

		it("fires onBack on Ctrl+[", () => {
			const opts = makeOpts();
			renderHook(() => useNavShortcuts(opts));
			act(() => {
				dispatchKey("[", { ctrlKey: true });
			});
			expect(opts.onBack).toHaveBeenCalledOnce();
		});

		it("does NOT fire onBack on plain [", () => {
			const opts = makeOpts();
			renderHook(() => useNavShortcuts(opts));
			act(() => {
				dispatchKey("[");
			});
			expect(opts.onBack).not.toHaveBeenCalled();
		});

		it("prevents default on Meta+[", () => {
			renderHook(() => useNavShortcuts(makeOpts()));
			const event = dispatchKey("[", { metaKey: true });
			expect(event.defaultPrevented).toBe(true);
		});
	});

	describe("⌘] — Forward", () => {
		it("fires onForward on Meta+]", () => {
			const opts = makeOpts();
			renderHook(() => useNavShortcuts(opts));
			act(() => {
				dispatchKey("]", { metaKey: true });
			});
			expect(opts.onForward).toHaveBeenCalledOnce();
		});

		it("fires onForward on Ctrl+]", () => {
			const opts = makeOpts();
			renderHook(() => useNavShortcuts(opts));
			act(() => {
				dispatchKey("]", { ctrlKey: true });
			});
			expect(opts.onForward).toHaveBeenCalledOnce();
		});

		it("does NOT fire onForward on plain ]", () => {
			const opts = makeOpts();
			renderHook(() => useNavShortcuts(opts));
			act(() => {
				dispatchKey("]");
			});
			expect(opts.onForward).not.toHaveBeenCalled();
		});

		it("prevents default on Meta+]", () => {
			renderHook(() => useNavShortcuts(makeOpts()));
			const event = dispatchKey("]", { metaKey: true });
			expect(event.defaultPrevented).toBe(true);
		});
	});

	describe("⌘1/2/3 — View switch", () => {
		it("fires onSwitchView('conversations') on Meta+1", () => {
			const opts = makeOpts();
			renderHook(() => useNavShortcuts(opts));
			act(() => {
				dispatchKey("1", { metaKey: true });
			});
			expect(opts.onSwitchView).toHaveBeenCalledWith("conversations");
		});

		it("fires onSwitchView('work') on Meta+2", () => {
			const opts = makeOpts();
			renderHook(() => useNavShortcuts(opts));
			act(() => {
				dispatchKey("2", { metaKey: true });
			});
			expect(opts.onSwitchView).toHaveBeenCalledWith("work");
		});

		it("fires onSwitchView('knowledge') on Meta+3", () => {
			const opts = makeOpts();
			renderHook(() => useNavShortcuts(opts));
			act(() => {
				dispatchKey("3", { metaKey: true });
			});
			expect(opts.onSwitchView).toHaveBeenCalledWith("knowledge");
		});

		it("fires onSwitchView on Ctrl+1", () => {
			const opts = makeOpts();
			renderHook(() => useNavShortcuts(opts));
			act(() => {
				dispatchKey("1", { ctrlKey: true });
			});
			expect(opts.onSwitchView).toHaveBeenCalledWith("conversations");
		});

		it("prevents default on Meta+1", () => {
			renderHook(() => useNavShortcuts(makeOpts()));
			const event = dispatchKey("1", { metaKey: true });
			expect(event.defaultPrevented).toBe(true);
		});

		it("does NOT fire on plain digit 1", () => {
			const opts = makeOpts();
			renderHook(() => useNavShortcuts(opts));
			act(() => {
				dispatchKey("1");
			});
			expect(opts.onSwitchView).not.toHaveBeenCalled();
		});
	});

	describe("Text input guard — must NOT fire while typing", () => {
		beforeEach(() => {
			// Append elements to body so dispatchEvent from them bubbles to document
			document.body.innerHTML = "";
		});

		it("does NOT fire while focus is in an <input>", () => {
			const opts = makeOpts();
			renderHook(() => useNavShortcuts(opts));

			const input = document.createElement("input");
			document.body.appendChild(input);
			input.focus();

			act(() => {
				const event = new KeyboardEvent("keydown", {
					key: "[",
					metaKey: true,
					bubbles: true,
					cancelable: true,
				});
				Object.defineProperty(event, "target", { value: input, writable: false });
				document.dispatchEvent(event);
			});
			expect(opts.onBack).not.toHaveBeenCalled();
		});

		it("does NOT fire while focus is in a <textarea>", () => {
			const opts = makeOpts();
			renderHook(() => useNavShortcuts(opts));

			const textarea = document.createElement("textarea");
			document.body.appendChild(textarea);
			textarea.focus();

			act(() => {
				const event = new KeyboardEvent("keydown", {
					key: "1",
					metaKey: true,
					bubbles: true,
					cancelable: true,
				});
				Object.defineProperty(event, "target", { value: textarea, writable: false });
				document.dispatchEvent(event);
			});
			expect(opts.onSwitchView).not.toHaveBeenCalled();
		});

		it("does NOT fire while focus is in a contentEditable element", () => {
			const opts = makeOpts();
			renderHook(() => useNavShortcuts(opts));

			const div = document.createElement("div");
			div.contentEditable = "true";
			document.body.appendChild(div);
			div.focus();

			act(() => {
				const event = new KeyboardEvent("keydown", {
					key: "]",
					metaKey: true,
					bubbles: true,
					cancelable: true,
				});
				Object.defineProperty(event, "target", { value: div, writable: false });
				document.dispatchEvent(event);
			});
			expect(opts.onForward).not.toHaveBeenCalled();
		});
	});

	describe("No collision with ⌘K", () => {
		it("does NOT fire any callback for Meta+K", () => {
			const opts = makeOpts();
			renderHook(() => useNavShortcuts(opts));
			act(() => {
				dispatchKey("k", { metaKey: true });
			});
			expect(opts.onBack).not.toHaveBeenCalled();
			expect(opts.onForward).not.toHaveBeenCalled();
			expect(opts.onSwitchView).not.toHaveBeenCalled();
		});

		it("does NOT preventDefault on Meta+K (leaves it for useCommandK)", () => {
			renderHook(() => useNavShortcuts(makeOpts()));
			const event = new KeyboardEvent("keydown", {
				key: "k",
				metaKey: true,
				cancelable: true,
			});
			act(() => {
				document.dispatchEvent(event);
			});
			expect(event.defaultPrevented).toBe(false);
		});
	});

	describe("Cleanup", () => {
		it("removes listener on unmount — shortcuts no longer fire", () => {
			const opts = makeOpts();
			const { unmount } = renderHook(() => useNavShortcuts(opts));
			unmount();
			act(() => {
				dispatchKey("[", { metaKey: true });
			});
			expect(opts.onBack).not.toHaveBeenCalled();
		});
	});
});
