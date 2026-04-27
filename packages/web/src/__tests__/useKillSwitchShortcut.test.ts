/**
 * L7 — useKillSwitchShortcut hook (red phase).
 *
 * Pins AC1 from `docs/work-packages/TRACK-L.md` L7:
 *   "kill switch reachable from … the keyboard shortcut Cmd+Shift+."
 *
 *   - Cmd+Shift+. (and Ctrl+Shift+.) fires the registered callback.
 *   - Suppressed when an input/textarea/contentEditable has focus
 *     (mirror VerdictGrammarCoach `?` guard).
 *
 * These tests MUST fail today: the hook does not exist.
 */
import { renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useKillSwitchShortcut } from "../hooks/useKillSwitchShortcut";

function dispatchKey(opts: {
	key: string;
	meta?: boolean;
	ctrl?: boolean;
	shift?: boolean;
	target?: HTMLElement;
}): void {
	const evt = new KeyboardEvent("keydown", {
		key: opts.key,
		metaKey: opts.meta,
		ctrlKey: opts.ctrl,
		shiftKey: opts.shift,
		bubbles: true,
		cancelable: true,
	});
	(opts.target ?? window).dispatchEvent(evt);
}

describe("L7 — useKillSwitchShortcut", () => {
	beforeEach(() => {
		document.body.innerHTML = "";
	});
	afterEach(() => {
		document.body.innerHTML = "";
	});

	it("Cmd+Shift+. fires the callback", () => {
		const onTrigger = vi.fn();
		renderHook(() => useKillSwitchShortcut(onTrigger));
		dispatchKey({ key: ".", meta: true, shift: true });
		expect(onTrigger).toHaveBeenCalledTimes(1);
	});

	it("Ctrl+Shift+. fires the callback (non-mac)", () => {
		const onTrigger = vi.fn();
		renderHook(() => useKillSwitchShortcut(onTrigger));
		dispatchKey({ key: ".", ctrl: true, shift: true });
		expect(onTrigger).toHaveBeenCalledTimes(1);
	});

	it("does NOT fire when an INPUT element has focus", () => {
		const input = document.createElement("input");
		document.body.appendChild(input);
		input.focus();
		const onTrigger = vi.fn();
		renderHook(() => useKillSwitchShortcut(onTrigger));
		dispatchKey({ key: ".", meta: true, shift: true, target: input });
		expect(onTrigger).not.toHaveBeenCalled();
	});

	it("does NOT fire when a TEXTAREA element has focus", () => {
		const ta = document.createElement("textarea");
		document.body.appendChild(ta);
		ta.focus();
		const onTrigger = vi.fn();
		renderHook(() => useKillSwitchShortcut(onTrigger));
		dispatchKey({ key: ".", meta: true, shift: true, target: ta });
		expect(onTrigger).not.toHaveBeenCalled();
	});

	it("does NOT fire when a contentEditable element has focus", () => {
		const div = document.createElement("div");
		div.setAttribute("contenteditable", "true");
		div.tabIndex = 0;
		document.body.appendChild(div);
		div.focus();
		const onTrigger = vi.fn();
		renderHook(() => useKillSwitchShortcut(onTrigger));
		dispatchKey({ key: ".", meta: true, shift: true, target: div });
		expect(onTrigger).not.toHaveBeenCalled();
	});

	it("does NOT fire on a plain `.` (no modifiers)", () => {
		const onTrigger = vi.fn();
		renderHook(() => useKillSwitchShortcut(onTrigger));
		dispatchKey({ key: "." });
		expect(onTrigger).not.toHaveBeenCalled();
	});
});
