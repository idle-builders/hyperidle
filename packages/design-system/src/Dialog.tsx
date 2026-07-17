/**
 * AI2 — Dialog: the single public dialog primitive for the Hearth design system.
 *
 * Every dialog in HyperIdle renders through this component. It owns:
 *   - Portal into #overlay-root (body sibling of #root, never nested inside it)
 *   - Dismissal/guard rule (clean closes, dirty guards, confirmation always closes)
 *   - Focus trap (focus-trap-react, returnFocusOnDeactivate)
 *   - Scroll-lock (body.overflow hidden while modal open)
 *   - inert on #root while modal open (feature-detected; graceful no-op in jsdom)
 *   - z-layer via CSS token (var(--z-*))
 *   - Mobile bottom-sheet at ≤480px
 *
 * @lore AI2: jsdom does not implement `inert`. Unit tests assert focus-trap
 * behavior and guard logic. Playwright (AC-2) asserts the inert attribute.
 *
 * @lore AI2: focus-trap-react requires displayCheck:"none" under jsdom
 * because jsdom doesn't compute element visibility. Without it, the trap
 * throws in every vitest run. The FocusTrap is only activated when open=true
 * to prevent initialization errors when no tabbable element is present.
 *
 * @lore AI2: The dialog box emits data-dialog-box and data-testid="dialog-box"
 * for mobile-sheet CSS targeting (AC-4 tests query by these attributes).
 * The title emits data-dialog-title for test queries.
 */

import FocusTrap from "focus-trap-react";
// hearth-internal-padding
import { type JSX, type ReactNode, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { DiscardConfirmStrip } from "./DiscardConfirmStrip.js";
import { type DialogLayer, ensureOverlayRoot, useDialogBehavior } from "./useDialogBehavior.js";

export type { DialogLayer };
export type DialogSize = "sm" | "md" | "lg";

export interface DialogProps {
	open: boolean;
	onClose: () => void;
	title: string;
	children: ReactNode;
	footer?: ReactNode;
	isDirty?: boolean; // default false
	modal?: boolean; // default true
	layer?: DialogLayer; // default "dialog"
	size?: DialogSize; // default "md"
	discardCopy?: { prompt: string; keep: string; discard: string };
	"aria-label"?: string;
}

const SIZE_MAX_WIDTH: Record<DialogSize, string> = {
	sm: "400px",
	md: "560px",
	lg: "720px",
};

export function Dialog({
	open,
	onClose,
	title,
	children,
	footer,
	isDirty = false,
	modal = true,
	layer = "dialog",
	size = "md",
	discardCopy,
	"aria-label": ariaLabel,
}: DialogProps): JSX.Element | null {
	const boxRef = useRef<HTMLDivElement | null>(null);

	// Ensure #overlay-root exists (self-sufficient in bare jsdom tests)
	useEffect(() => {
		ensureOverlayRoot();
	}, []);

	// Move focus into the dialog box on open.
	// focus-trap-react uses setTimeout internally which doesn't fire during act() in jsdom.
	// We use useEffect to ensure focus moves synchronously on the next render cycle.
	// @lore AI2: Direct focus call via useEffect is required because focus-trap-react's
	// internal setTimeout is not flushed by React's act() in jsdom environments.
	// The focus trap still prevents focus from leaving the dialog.
	useEffect(() => {
		if (!open) return;
		// Find the first tabbable element inside the dialog box, or focus the box itself
		const box = boxRef.current;
		if (!box) return;
		const tabbable = box.querySelector<HTMLElement>(
			'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
		);
		if (tabbable) {
			tabbable.focus();
		} else {
			box.focus();
		}
	}, [open]);

	const behavior = useDialogBehavior({ open, onClose, isDirty, modal, layer });

	// Get the portal target after ensureOverlayRoot has run
	const portalTarget = typeof document !== "undefined" ? ensureOverlayRoot() : null;

	if (!(open && portalTarget)) return null;

	const overlayProps = behavior.getOverlayProps();
	const scrimProps = behavior.getScrimProps();

	const dialogContent = (
		<>
			{/* Scrim — modal only */}
			{scrimProps && (
				<div
					aria-hidden="true"
					style={{
						position: "fixed",
						inset: 0,
						...scrimProps.style,
					}}
					onMouseDown={scrimProps.onMouseDown}
				/>
			)}

			{/* Dialog overlay wrapper */}
			<FocusTrap
				active={open}
				focusTrapOptions={{
					returnFocusOnDeactivate: true,
					// initialFocus not set: trap moves focus to first tabbable element
					allowOutsideClick: true,
					fallbackFocus: "[data-dialog-box]",
					// @lore AI2: displayCheck:"none" required for jsdom — jsdom doesn't compute
					// element visibility, so the trap would throw without this option.
					tabbableOptions: { displayCheck: "none" },
				}}
			>
				<div
					role="dialog"
					aria-modal={overlayProps["aria-modal"]}
					data-dialog-layer={overlayProps["data-dialog-layer"]}
					aria-label={ariaLabel ?? title}
					onKeyDown={overlayProps.onKeyDown}
					style={{
						position: "fixed",
						inset: 0,
						display: "flex",
						alignItems: "center",
						justifyContent: "center",
						pointerEvents: "none",
						zIndex: overlayProps.style.zIndex,
					}}
				>
					{/* Box — centered desktop, bottom-anchored mobile (≤480px via class) */}
					<div
						ref={boxRef}
						data-dialog-box=""
						data-testid="dialog-box"
						// tabIndex allows the box itself to receive focus as the fallback
						// when no other tabbable element exists (e.g. content-only dialogs)
						tabIndex={-1}
						style={{
							position: "relative",
							pointerEvents: "auto",
							background: "var(--surface-elevated)",
							borderRadius: "var(--r-default)",
							boxShadow: "var(--shadow-elevated)",
							width: "100%",
							maxWidth: SIZE_MAX_WIDTH[size],
							maxHeight: "85vh",
							display: "flex",
							flexDirection: "column",
							overflow: "hidden",
						}}
					>
						{/* Header: title (15/600) + close button */}
						<div
							style={{
								display: "flex",
								alignItems: "center",
								justifyContent: "space-between",
								gap: "var(--space-4)",
								padding: "var(--space-6)",
								borderBottom: "1px solid var(--border-subtle)",
								flexShrink: 0,
							}}
						>
							<span
								data-dialog-title=""
								data-testid="dialog-title"
								style={{
									fontSize: "var(--text-base)", // 15px — intentional (design §4.1)
									fontWeight: "var(--fw-semibold)", // 600
									color: "var(--text-primary)",
									lineHeight: "var(--leading-tight)",
									flex: 1,
									minWidth: 0,
									overflow: "hidden",
									textOverflow: "ellipsis",
									whiteSpace: "nowrap",
								}}
							>
								{title}
							</span>
							<button
								type="button"
								aria-label="Close dialog"
								onClick={behavior.requestDismiss}
								style={{
									background: "transparent",
									border: "none",
									cursor: "pointer",
									color: "var(--text-secondary)",
									fontSize: "var(--text-base)",
									lineHeight: 1,
									padding: "var(--space-2)",
									borderRadius: "var(--r-subtle)",
									flexShrink: 0,
									minWidth: "44px",
									minHeight: "44px",
									display: "flex",
									alignItems: "center",
									justifyContent: "center",
								}}
							>
								{/* Close icon — inline SVG per AQ-105; lucide-react not installed in design-system */}
								<svg
									aria-hidden="true"
									width="16"
									height="16"
									viewBox="0 0 24 24"
									fill="none"
									stroke="currentColor"
									strokeWidth="2"
									strokeLinecap="round"
									strokeLinejoin="round"
								>
									<line x1="18" y1="6" x2="6" y2="18" />
									<line x1="6" y1="6" x2="18" y2="18" />
								</svg>
							</button>
						</div>

						{/* Body */}
						<div
							style={{
								padding: "var(--space-6)",
								overflowY: "auto",
								flex: 1,
							}}
						>
							{children}
						</div>

						{/* Footer: action buttons OR discard confirm strip */}
						{(footer !== undefined || behavior.guarding) && (
							<div
								style={{
									padding: "0 var(--space-6) var(--space-6)",
									flexShrink: 0,
								}}
							>
								{behavior.guarding ? (
									<DiscardConfirmStrip
										onKeepEditing={behavior.cancelDiscard}
										onDiscard={behavior.confirmDiscard}
										copy={discardCopy}
									/>
								) : (
									<div
										style={{
											borderTop: "1px solid var(--border-subtle)",
											paddingTop: "var(--space-6)",
											display: "flex",
											justifyContent: "flex-end",
											gap: "var(--space-2)",
										}}
									>
										{footer}
									</div>
								)}
							</div>
						)}
					</div>
				</div>
			</FocusTrap>
		</>
	);

	return createPortal(dialogContent, portalTarget);
}
