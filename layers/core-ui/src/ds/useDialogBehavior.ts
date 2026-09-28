// @lore: focus-trap-react needs displayCheck:"none" under jsdom — jsdom has no layout (all sizes 0); without it trap throws "no focusable element"

import {
	type KeyboardEventHandler,
	type MouseEventHandler,
	type RefObject,
	useCallback,
	useEffect,
	useRef,
	useState,
} from "react";

export type DialogLayer = "drawer" | "overlay" | "dialog";

export interface UseDialogBehaviorOptions {
	open: boolean;
	onClose: () => void;
	isDirty?: boolean;
	modal?: boolean; // default true
	layer?: DialogLayer; // default "dialog"
}

export interface UseDialogBehavior {
	guarding: boolean;
	requestDismiss: () => void;
	confirmDiscard: () => void;
	cancelDiscard: () => void;
	getOverlayProps: () => {
		role: "dialog";
		"aria-modal": boolean;
		"data-dialog-layer": DialogLayer;
		style: { zIndex: string };
		ref: RefObject<HTMLElement | null>;
		onKeyDown: KeyboardEventHandler;
	};
	getScrimProps: () => {
		style: { zIndex: string; background: string };
		onMouseDown: MouseEventHandler;
	} | null;
}

const LAYER_Z: Record<DialogLayer, string> = {
	drawer: "var(--z-drawer)",
	overlay: "var(--z-overlay)",
	dialog: "var(--z-dialog)",
};

export function ensureOverlayRoot(): HTMLElement {
	const existing = document.getElementById("overlay-root");
	if (existing) return existing;
	const node = document.createElement("div");
	node.id = "overlay-root";
	document.body.appendChild(node);
	return node;
}

export function useDialogBehavior({
	open,
	onClose,
	isDirty = false,
	modal = true,
	layer = "dialog",
}: UseDialogBehaviorOptions): UseDialogBehavior {
	const [guarding, setGuarding] = useState(false);
	const overlayRef = useRef<HTMLElement | null>(null);

	useEffect(() => {
		if (!open) {
			setGuarding(false);
		}
	}, [open]);

	useEffect(() => {
		if (!(modal && open)) return;
		const prev = document.body.style.overflow;
		document.body.style.overflow = "hidden";
		return (): void => {
			document.body.style.overflow = prev;
		};
	}, [modal, open]);

	// Inert background: applies inert to #root (not #overlay-root or body); feature-detected, degrades gracefully
	useEffect(() => {
		if (!(modal && open)) return;
		if (!("inert" in HTMLElement.prototype)) return;
		const appRoot = document.getElementById("root");
		if (!appRoot) return;
		appRoot.setAttribute("inert", "");
		return (): void => {
			appRoot.removeAttribute("inert");
		};
	}, [modal, open]);

	const requestDismiss = useCallback((): void => {
		if (guarding) {
			setGuarding(false);
			return;
		}
		if (!isDirty) {
			onClose();
			return;
		}
		setGuarding(true);
	}, [guarding, isDirty, onClose]);

	const confirmDiscard = useCallback((): void => {
		setGuarding(false);
		onClose();
	}, [onClose]);

	const cancelDiscard = useCallback((): void => {
		setGuarding(false);
	}, []);

	const handleKeyDown: KeyboardEventHandler = useCallback(
		(e) => {
			if (e.key === "Escape") {
				e.preventDefault();
				e.stopPropagation();
				requestDismiss();
			}
		},
		[requestDismiss],
	);

	const handleScrimMouseDown: MouseEventHandler = useCallback(
		(e) => {
			if (e.target === e.currentTarget) {
				requestDismiss();
			}
		},
		[requestDismiss],
	);

	const getOverlayProps = useCallback(
		() => ({
			role: "dialog" as const,
			"aria-modal": modal,
			"data-dialog-layer": layer,
			style: { zIndex: LAYER_Z[layer] },
			ref: overlayRef,
			onKeyDown: handleKeyDown,
		}),
		[modal, layer, handleKeyDown],
	);

	const getScrimProps = useCallback((): {
		style: { zIndex: string; background: string };
		onMouseDown: MouseEventHandler;
	} | null => {
		if (!modal) return null;
		return {
			style: {
				zIndex: "var(--z-scrim)",
				background: "var(--scrim)",
			},
			onMouseDown: handleScrimMouseDown,
		};
	}, [modal, handleScrimMouseDown]);

	return {
		guarding,
		requestDismiss,
		confirmDiscard,
		cancelDiscard,
		getOverlayProps,
		getScrimProps,
	};
}
