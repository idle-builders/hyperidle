/**
 * AG4 — Navigation keyboard shortcuts hook.
 *
 * Binds global keyboard shortcuts for history traversal and view switching.
 * Guards against firing while focus is in a text field (input/textarea/contentEditable).
 *
 * Shortcuts:
 *   ⌘/Ctrl + [  → Back (history -1)
 *   ⌘/Ctrl + ]  → Forward (history +1)
 *   ⌘/Ctrl + 1  → Switch to Conversations view
 *   ⌘/Ctrl + 2  → Switch to Work view
 *   ⌘/Ctrl + 3  → Switch to Knowledge view
 *
 * @lore AG4 Decision 1: Renderer-level keydown, not Electron accelerators.
 * Accelerators fire even while typing (no per-keystroke guard) and don't
 * work in the browser dev environment. useCommandK is the template for the
 * document-keydown + preventDefault pattern — but it has NO typing guard.
 * The text-input guard comes from AppShell L446-447 (the only correct source).
 *
 * @lore AG4: Does NOT handle ⌘K (that belongs to useCommandK). Only the 5
 * navigation combos are claimed here to avoid swallowing app shortcuts.
 */

import { useEffect } from "react";
import type { ViewId } from "../shell/shell-types.js";

export interface NavShortcutsOpts {
	onBack: () => void;
	onForward: () => void;
	onSwitchView: (v: ViewId) => void;
}

const VIEW_BY_DIGIT: Record<string, ViewId> = {
	"1": "conversations",
	"2": "work",
	"3": "knowledge",
};

export function useNavShortcuts(opts: NavShortcutsOpts): void {
	const { onBack, onForward, onSwitchView } = opts;

	useEffect(() => {
		const handler = (e: KeyboardEvent): void => {
			// Guard: don't fire while typing — AppShell L446-447 pattern.
			// isContentEditable is the DOM standard for real browsers.
			// jsdom (used in tests) doesn't implement isContentEditable getter —
			// it returns undefined even when contentEditable="true". We also check
			// the contentEditable property directly (which jsdom does support) for
			// test environment parity. Both checks are correct in production.
			const target = e.target as HTMLElement | null;
			if (target && typeof target.tagName === "string") {
				const tag = target.tagName.toLowerCase();
				if (
					tag === "input" ||
					tag === "textarea" ||
					target.isContentEditable ||
					// jsdom compat: isContentEditable is undefined in jsdom, check the prop
					(target as HTMLElement & { contentEditable?: string }).contentEditable === "true"
				) {
					return;
				}
			}

			if (!(e.metaKey || e.ctrlKey)) return;

			if (e.key === "[") {
				e.preventDefault();
				onBack();
				return;
			}
			if (e.key === "]") {
				e.preventDefault();
				onForward();
				return;
			}
			const view = VIEW_BY_DIGIT[e.key];
			if (view !== undefined) {
				e.preventDefault();
				onSwitchView(view);
			}
		};

		document.addEventListener("keydown", handler);
		return () => {
			document.removeEventListener("keydown", handler);
		};
	}, [onBack, onForward, onSwitchView]);
}
