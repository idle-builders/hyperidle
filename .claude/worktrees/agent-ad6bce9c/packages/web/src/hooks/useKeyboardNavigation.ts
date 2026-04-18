import { useCallback, useEffect, useState } from "react";

export interface UseKeyboardNavigationOptions {
	itemCount: number;
	onSelect: (index: number) => void;
	onClose: () => void;
}

interface UseKeyboardNavigationReturn {
	activeIndex: number;
	setActiveIndex: (index: number) => void;
	onKeyDown: (e: KeyboardEvent) => void;
}

export function useKeyboardNavigation({
	itemCount,
	onSelect,
	onClose,
}: UseKeyboardNavigationOptions): UseKeyboardNavigationReturn {
	const [activeIndex, setActiveIndex] = useState(0);

	// Reset activeIndex when itemCount changes
	// biome-ignore lint/correctness/useExhaustiveDependencies: itemCount is intentionally a dep to reset index on count change
	useEffect(() => {
		setActiveIndex(0);
	}, [itemCount]);

	const onKeyDown = useCallback(
		(e: KeyboardEvent): void => {
			switch (e.key) {
				case "ArrowDown":
					setActiveIndex((prev) => (itemCount === 0 ? 0 : (prev + 1) % itemCount));
					break;
				case "ArrowUp":
					setActiveIndex((prev) => (itemCount === 0 ? 0 : (prev - 1 + itemCount) % itemCount));
					break;
				case "Enter":
					onSelect(activeIndex);
					break;
				case "Escape":
					onClose();
					break;
			}
		},
		[itemCount, onSelect, onClose, activeIndex],
	);

	return { activeIndex, setActiveIndex, onKeyDown };
}
