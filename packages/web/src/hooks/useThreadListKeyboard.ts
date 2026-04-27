import type { Section } from "@hyperidle/shared";
import { useCallback, useEffect, useRef, useState } from "react";

/**
 * L3 — Cross-section keyboard navigation for the Conversations submenu queue.
 *
 * Owns J/K/[/]/Enter handling against a flattened list of section rows.
 *
 * @lore L3: J/K step ±1 across section boundaries. `[`/`]` jump to the
 * first row of the previous/next non-empty section. No wrap — wrapping
 * triage queues is a footgun (plan §5.7).
 */

export interface FlatThreadRow {
	section: Section;
	threadId: string;
	[key: string]: unknown;
}

export interface UseThreadListKeyboardOptions<T extends FlatThreadRow = FlatThreadRow> {
	flat: readonly T[];
	onOpenThread: (threadId: string, row: T) => void;
	initialIndex?: number;
}

export interface UseThreadListKeyboardResult<T extends FlatThreadRow = FlatThreadRow> {
	activeIndex: number;
	activeRow: T | null;
	setActiveIndex: (next: number) => void;
}

const INPUT_TAGS = new Set(["INPUT", "TEXTAREA", "SELECT"]);

function isEditableTarget(target: EventTarget | null): boolean {
	if (!(target instanceof HTMLElement)) return false;
	if (INPUT_TAGS.has(target.tagName)) return true;
	if (target.isContentEditable) return true;
	return false;
}

export function useThreadListKeyboard<T extends FlatThreadRow = FlatThreadRow>(
	options: UseThreadListKeyboardOptions<T>,
): UseThreadListKeyboardResult<T> {
	const { flat, onOpenThread, initialIndex = 0 } = options;
	const [activeIndex, setActiveIndexState] = useState<number>(() => {
		if (flat.length === 0) return 0;
		return Math.min(Math.max(0, initialIndex), flat.length - 1);
	});

	// Refs avoid stale closures inside the document-level keydown handler.
	// @lore L3 review (adversary C7): we update both refs INSIDE a layout
	// effect rather than during render. Mutating refs during render
	// produced a race between filter-change renders and concurrent
	// keystrokes — the keydown handler could observe the new flat list
	// while activeIndex was clamping in a separate effect, leading to a
	// "select wrong row by 1" bug. With useEffect, refs sync after the
	// commit, in lockstep with the clamp effect below.
	const flatRef = useRef(flat);
	const onOpenRef = useRef(onOpenThread);
	useEffect(() => {
		flatRef.current = flat;
		onOpenRef.current = onOpenThread;
	}, [flat, onOpenThread]);

	// Clamp active index when the list shrinks.
	useEffect(() => {
		setActiveIndexState((prev) => {
			if (flat.length === 0) return 0;
			if (prev > flat.length - 1) return flat.length - 1;
			return prev;
		});
	}, [flat.length]);

	const setActiveIndex = useCallback((next: number): void => {
		setActiveIndexState((prev) => {
			const len = flatRef.current.length;
			if (len === 0) return 0;
			const clamped = Math.min(Math.max(0, next), len - 1);
			return clamped === prev ? prev : clamped;
		});
	}, []);

	useEffect(() => {
		function handler(event: KeyboardEvent): void {
			const list = flatRef.current;
			if (list.length === 0) return;
			if (isEditableTarget(event.target)) return;

			switch (event.key) {
				case "j":
				case "J": {
					event.preventDefault();
					setActiveIndexState((prev) => Math.min(prev + 1, list.length - 1));
					break;
				}
				case "k":
				case "K": {
					event.preventDefault();
					setActiveIndexState((prev) => Math.max(prev - 1, 0));
					break;
				}
				case "Enter": {
					event.preventDefault();
					setActiveIndexState((prev) => {
						const row = list[prev];
						if (row) onOpenRef.current(row.threadId, row);
						return prev;
					});
					break;
				}
				case "]": {
					event.preventDefault();
					setActiveIndexState((prev) => {
						const currentSection = list[prev]?.section;
						for (let i = prev + 1; i < list.length; i += 1) {
							if (list[i].section !== currentSection) return i;
						}
						return prev;
					});
					break;
				}
				case "[": {
					event.preventDefault();
					setActiveIndexState((prev) => {
						const currentSection = list[prev]?.section;
						let prevSectionEndIdx = -1;
						for (let i = prev - 1; i >= 0; i -= 1) {
							if (list[i].section !== currentSection) {
								prevSectionEndIdx = i;
								break;
							}
						}
						if (prevSectionEndIdx === -1) return prev;
						const prevSection = list[prevSectionEndIdx].section;
						let firstIdx = prevSectionEndIdx;
						while (firstIdx - 1 >= 0 && list[firstIdx - 1].section === prevSection) {
							firstIdx -= 1;
						}
						return firstIdx;
					});
					break;
				}
				default:
					break;
			}
		}

		document.addEventListener("keydown", handler);
		return () => {
			document.removeEventListener("keydown", handler);
		};
	}, []);

	const activeRow =
		flat.length === 0 ? null : (flat[Math.min(activeIndex, flat.length - 1)] ?? null);

	return { activeIndex, activeRow, setActiveIndex };
}
