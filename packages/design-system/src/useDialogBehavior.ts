/**
 * AI2 — useDialogBehavior: the single dismissal/guard/layer contract for all
 * overlay surfaces. Consumed by Dialog (box chrome) and directly by non-box
 * surfaces (TaskSheet, AssistantOverlay, NotificationPopover, GlobalSearch,
 * mobile drawer).
 *
 * @lore AI2: jsdom does not implement `inert` — the `inert` attribute is
 * applied via feature-detection (`"inert" in HTMLElement.prototype`). When
 * absent, the focus-trap still contains focus, so a11y degrades gracefully.
 * Never assert the `inert` attribute in unit tests; assert it via Playwright.
 *
 * @lore AI2: focus-trap-react requires displayCheck:"none" under jsdom because
 * jsdom doesn't lay out elements (all computed sizes are 0). This option is
 * carried from the existing web-side lore into this DS hook. Without it, the
 * trap throws "Your focus-trap must have at least one focusable element" in
 * every jsdom test environment.
 *
 * @lore AI2: ensureOverlayRoot() lazily creates and appends a #overlay-root
 * div to document.body as a SIBLING of #root (never inside it). This allows
 * createPortal to target a body-level node from any test without requiring
 * DialogPortalRoot to be mounted first. The function is idempotent.
 */

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

/**
 * Lazily create and append #overlay-root to document.body as a body-level
 * sibling of #root. Idempotent — returns existing node if already present.
 *
 * @lore AI2: Called on mount so Dialog/non-box surfaces work in bare jsdom
 * tests without a pre-mounted DialogPortalRoot. The app shell also calls this
 * via DialogPortalRoot for a deterministic eager mount at startup.
 */
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

	// Reset guarding state when dialog closes
	useEffect(() => {
		if (!open) {
			setGuarding(false);
		}
	}, [open]);

	// Scroll-lock: prevent body scroll while any modal dialog is open
	useEffect(() => {
		if (!(modal && open)) return;
		const prev = document.body.style.overflow;
		document.body.style.overflow = "hidden";
		return (): void => {
			document.body.style.overflow = prev;
		};
	}, [modal, open]);

	// Inert background: set inert on #root (sibling of #overlay-root) while modal open
	// @lore AI2: inert is feature-detected — jsdom may not implement it.
	// The focus trap still contains focus when inert is absent (graceful degradation).
	// The element receiving inert is #root (app root), NOT #overlay-root or body.
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
			// Second Esc while guarding → cancelDiscard (Keep editing)
			setGuarding(false);
			return;
		}
		if (!isDirty) {
			// Clean dialog or confirmation (isDirty=false) → close immediately
			onClose();
			return;
		}
		// Dirty → raise guard strip
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
			// Only respond to direct clicks on the scrim, not children
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
