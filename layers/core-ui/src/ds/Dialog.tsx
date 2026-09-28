/**
 * Dialog: the single public dialog primitive for the Hearth design system.
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

	// @lore: focus-trap-react.setTimeout — not flushed by act(); useEffect ensures synchronous focus in jsdom
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
					// @lore: displayCheck:"none" — required for jsdom; jsdom skips visibility computation; trap throws without it
					tabbableOptions: { displayCheck: "none" },
				}}
			>
				{/* biome-ignore lint/a11y/useAriaPropsSupportedByRole: role is statically typed "dialog" in useDialogBehavior.getOverlayProps — biome can't see through the indirection to know aria-modal is valid here. */}
				{/* biome-ignore lint/a11y/noStaticElementInteractions: same indirection — role is "dialog", which supports onKeyDown for the focus/escape handling. */}
				<div
					role={overlayProps.role}
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
								borderBottom: "var(--bw-thin) solid var(--border-subtle)",
								flexShrink: 0,
							}}
						>
							<span
								data-dialog-title=""
								data-testid="dialog-title"
								style={{
									// 15px — intentional
									// 600
									color: "var(--text-primary)",

									flex: 1,
									minWidth: 0,
									overflow: "hidden",
									textOverflow: "ellipsis",
									whiteSpace: "nowrap",
								}}
								className="type-copy"
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

									padding: "var(--space-2)",
									borderRadius: "var(--r-subtle)",
									flexShrink: 0,
									minWidth: "44px",
									minHeight: "44px",
									display: "flex",
									alignItems: "center",
									justifyContent: "center",
								}}
								className="type-control"
							>
								{/* Close icon — inline SVG; lucide-react not installed in design-system */}
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
											borderTop: "var(--bw-thin) solid var(--border-subtle)",
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
