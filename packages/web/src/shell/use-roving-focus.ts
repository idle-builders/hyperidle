import { useCallback, useRef, useState } from "react";

interface UseRovingFocusOptions {
	itemCount: number;
	onSelect?: (index: number) => void;
	onEscape?: () => void;
}

interface ItemProps {
	tabIndex: number;
	onKeyDown: (e: React.KeyboardEvent<HTMLElement>) => void;
	ref: (el: HTMLElement | null) => void;
}

interface UseRovingFocusReturn {
	activeIndex: number;
	getItemProps: (index: number) => ItemProps;
}

export function useRovingFocus({
	itemCount,
	onSelect,
	onEscape,
}: UseRovingFocusOptions): UseRovingFocusReturn {
	const [activeIndex, setActiveIndex] = useState(0);
	const itemRefs = useRef<(HTMLElement | null)[]>([]);

	const focusItem = useCallback((index: number) => {
		setActiveIndex(index);
		itemRefs.current[index]?.focus();
	}, []);

	const handleKeyDown = useCallback(
		(index: number, e: React.KeyboardEvent<HTMLElement>) => {
			switch (e.key) {
				case "ArrowDown": {
					e.preventDefault();
					const next = (index + 1) % itemCount;
					focusItem(next);
					break;
				}
				case "ArrowUp": {
					e.preventDefault();
					const prev = (index - 1 + itemCount) % itemCount;
					focusItem(prev);
					break;
				}
				case "Home": {
					// I4 KB3: WAI-ARIA roving tabindex requires Home/End.
					e.preventDefault();
					focusItem(0);
					break;
				}
				case "End": {
					e.preventDefault();
					focusItem(itemCount - 1);
					break;
				}
				case "Enter":
				case " ": {
					e.preventDefault();
					onSelect?.(index);
					break;
				}
				case "Escape": {
					e.preventDefault();
					onEscape?.();
					break;
				}
			}
		},
		[itemCount, onSelect, onEscape, focusItem],
	);

	const getItemProps = useCallback(
		(index: number): ItemProps => ({
			tabIndex: index === activeIndex ? 0 : -1,
			onKeyDown: (e: React.KeyboardEvent<HTMLElement>) => handleKeyDown(index, e),
			ref: (el: HTMLElement | null) => {
				itemRefs.current[index] = el;
			},
		}),
		[activeIndex, handleKeyDown],
	);

	return { activeIndex, getItemProps };
}
