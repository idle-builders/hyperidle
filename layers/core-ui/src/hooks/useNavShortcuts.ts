// @lore: renderer-level keydown, not Electron accelerators — accelerators fire while typing (no guard); document-level gives per-keystroke control

// @lore: does NOT handle ⌘K (useCommandK owns it); only these 5 combos claimed here to avoid swallowing other app shortcuts

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
			// Guard: jsdom doesn't implement isContentEditable getter (returns undefined); also check contentEditable prop directly for jsdom test parity
			const target = e.target as HTMLElement | null;
			if (target && typeof target.tagName === "string") {
				const tag = target.tagName.toLowerCase();
				if (
					tag === "input" ||
					tag === "textarea" ||
					target.isContentEditable ||
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
