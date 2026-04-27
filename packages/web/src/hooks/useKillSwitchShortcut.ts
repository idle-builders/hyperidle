/**
 * L7 — useKillSwitchShortcut.
 *
 * Registers a global `Cmd+Shift+.` (mac) / `Ctrl+Shift+.` (other)
 * keyboard shortcut. Suppressed when an INPUT, TEXTAREA, or
 * `contenteditable` element has focus (mirrors the VerdictGrammarCoach
 * `?` guard) so the founder can type a literal `.` while filling in a
 * form.
 *
 * @lore L7 (TRACK-L L7 AC1): the shortcut is the third entry point to
 * the kill switch alongside the avatar menu and Settings → Safety.
 * Single source of truth for the modifier combination so a future
 * remap (e.g. user-customisable hotkeys) only updates this hook.
 */
import { useEffect } from "react";

function isEditableTarget(target: EventTarget | null): boolean {
	if (!(target instanceof HTMLElement)) return false;
	const tag = target.tagName;
	if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
	// `isContentEditable` is unreliable in jsdom; fall back to the
	// attribute check so the hook behaves identically in tests.
	if (target.isContentEditable) return true;
	const attr = target.getAttribute("contenteditable");
	if (attr !== null && attr !== "false") return true;
	return false;
}

export function useKillSwitchShortcut(onTrigger: () => void): void {
	useEffect(() => {
		function handler(event: KeyboardEvent): void {
			if (event.key !== ".") return;
			if (!event.shiftKey) return;
			if (!(event.metaKey || event.ctrlKey)) return;
			if (isEditableTarget(event.target)) return;
			event.preventDefault();
			onTrigger();
		}
		window.addEventListener("keydown", handler);
		return () => {
			window.removeEventListener("keydown", handler);
		};
	}, [onTrigger]);
}
