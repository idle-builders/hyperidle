import { useCallback, useEffect, useState } from "react";

interface UseCommandKReturn {
	isOpen: boolean;
	open: () => void;
	close: () => void;
}

// @lore: document-level keydown — shortcut works regardless of focus; preventDefault stops browser's native Cmd+K (address bar in Chrome/Safari)
export function useCommandK(): UseCommandKReturn {
	const [isOpen, setIsOpen] = useState(false);

	const open = useCallback((): void => {
		setIsOpen(true);
	}, []);

	const close = useCallback((): void => {
		setIsOpen(false);
	}, []);

	useEffect(() => {
		const handler = (e: KeyboardEvent): void => {
			if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
				e.preventDefault();
				setIsOpen((prev) => !prev);
			}
		};
		document.addEventListener("keydown", handler);
		return () => {
			document.removeEventListener("keydown", handler);
		};
	}, []);

	return { isOpen, open, close };
}
