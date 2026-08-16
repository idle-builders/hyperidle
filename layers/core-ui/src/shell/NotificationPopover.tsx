/**
 * AF8 — NotificationPopover
 *
 * In-app notification inbox popover. Anchored to the notification trigger
 * in the Sidebar bottom strip.
 *
 * States: loading / error / empty / populated
 * Row anatomy: urgency dot → title (flex-1, truncate) → type label → relative
 * time → hover-reveal mute/dismiss glyphs (opacity-0 at rest, group-hover:100)
 *
 * @lore AF8: markSeen is called on mount (when open=true) so unseen dots
 * clear immediately on popover open, matching the UX spec. markRead removes
 * a specific row (jump or dismiss). muteType removes all rows of a type and
 * writes the mute preference to the server.
 *
 * @lore AF8: Tier-3 shell composition — NOT a design-system primitive.
 * Uses raw DaisyUI + Hearth tokens. Every interactive element follows the
 * AQ-015 touch target rule at ≤1024px.
 *
 * @lore AF8 W1: Row is a single-line dense layout (min-h-36px) per approved.md
 * §A Row anatomy. Trailing mute/dismiss are opacity-0 at rest, visible on
 * group-hover/focus-within (hover-reveal idiom). Text buttons were replaced
 * with 16px glyph buttons. Positioning uses fixed bottom-16 left-4 (not
 * hardcoded pixel offsets).
 *
 * @lore AF8 C1: Retry button wired to refetch() exposed from useNotifications.
 * Previously the button had no onClick — clicking it was a dead action.
 *
 * @lore AF8 W4 (sourceLink guard): sourceLink is system-authored today but
 * the plan's §Security requires we reject anything not starting with "/" as
 * defense-in-depth against future agent-authored content reaching this path.
 */

import { Button, EmptyState, useDialogBehavior } from "@hyperidle/design-system";
import type { NotificationTypeKey } from "@hyperidle/domain-model";
import { shortLabelForType } from "@hyperidle/domain-model";
import { relativeShort } from "@hyperidle/presentation-format";
import { type JSX, useCallback, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import type { NotificationRow, UseNotificationsResult } from "../hooks/useNotifications.js";
import { useNotifications } from "../hooks/useNotifications.js";

// Re-export for consumers
export type { NotificationRow };

// AI4 Decision 4: TYPE_LABELS deleted — derive from shortLabelForType (shared registry).

export interface NotificationPopoverProps {
	open: boolean;
	onClose: () => void;
	/**
	 * Optional data override for Storybook and tests. When provided, the
	 * component skips the `useNotifications` hook and uses these values instead.
	 * @lore AF8 W2: injectable data lets stories render each distinct state
	 * deterministically without module mocking or API calls.
	 */
	_data?: UseNotificationsResult;
}

export function NotificationPopover({
	open,
	onClose,
	_data,
}: NotificationPopoverProps): JSX.Element | null {
	const navigate = useNavigate();
	const hookData = useNotifications();
	// Use injected data (for stories/tests) or live hook data
	const { unseenCount, rows, status, refetch, markSeen, markRead, muteType } = _data ?? hookData;
	const overlayRef = useRef<HTMLDivElement>(null);

	// @lore AI2: Migrated to useDialogBehavior with modal=false, layer="overlay".
	// modal=false: popover is non-modal — no scrim, no backdrop dismiss.
	// Escape is caught at document level (non-modal divs don't receive keyboard
	// events unless focused). Layer "overlay" (--z-overlay=40) replaces z-30.
	const behavior = useDialogBehavior({ open, onClose, modal: false, layer: "overlay" });
	const overlayProps = behavior.getOverlayProps();

	// Mark all unseen on open — intentionally only depends on `open` so this fires
	// exactly once when the popover opens, not on every unseenCount/markSeen update.
	// biome-ignore lint/correctness/useExhaustiveDependencies: intentional — fires on open toggle only
	useEffect(() => {
		if (open && unseenCount > 0) {
			void markSeen();
		}
	}, [open]); // eslint-disable-line react-hooks/exhaustive-deps

	// @lore AI2: Esc caught at document level for non-modal surfaces (popover div won't
	// receive keyboard events unless focused). behavior.requestDismiss() routes through
	// the unified guard rule. Outside-click-to-close preserved: popover dismisses on
	// mousedown outside, matching the old AF8 behavior.
	useEffect(() => {
		if (!open) return;
		const handler = (e: KeyboardEvent): void => {
			if (e.key === "Escape") {
				behavior.requestDismiss();
			}
		};
		document.addEventListener("keydown", handler);
		return () => document.removeEventListener("keydown", handler);
	}, [open, behavior.requestDismiss]);

	// Outside-click-to-close
	useEffect(() => {
		if (!open) return;
		const handler = (e: MouseEvent): void => {
			if (overlayRef.current && !overlayRef.current.contains(e.target as Node)) {
				onClose();
			}
		};
		// Use capture=false so we don't fight with stopPropagation inside the popover
		document.addEventListener("mousedown", handler);
		return () => document.removeEventListener("mousedown", handler);
	}, [open, onClose]);

	// Must be before the early return — hook rules require all hooks called unconditionally
	const handleRowClick = useCallback(
		(id: string, sourceLink: string): void => {
			// W4: sourceLink guard — only navigate to internal app routes
			if (!sourceLink.startsWith("/")) return;
			void markRead(id);
			navigate(sourceLink);
			onClose();
		},
		[markRead, navigate, onClose],
	);

	if (!open) return null;

	return (
		<div
			ref={overlayRef}
			role={overlayProps.role}
			aria-modal={overlayProps["aria-modal"]}
			aria-label="Notifications"
			data-testid="notification-popover"
			data-dialog-layer={overlayProps["data-dialog-layer"]}
			// @lore AI2: z-30 removed; z-layer now via --z-overlay token in style prop (AC-3).
			// @lore AZ-bugs: Repositioned from bottom-16 left-4 (bottom-left corner, ~600px
			// from bell trigger) to top-[108px] left-[9px] to clear below the bell trigger
			// (bell bottom ≈ 105px). top-[60px] overlapped the bell; top-[108px] clears it.
			// Width expanded to w-[440px] so notification titles don't truncate (scrollWidth 221px
			// needs more than the prior w-[360px] left-rail 75px trailing affordances).
			className="border-[var(--bw-thin)] fixed top-[108px] left-[9px] flex w-[440px] flex-col overflow-hidden rounded-[var(--r-subtle)]  border-[var(--border-default)] bg-[var(--surface-elevated)] shadow-[var(--shadow-elevated)]"
			style={{ zIndex: overlayProps.style.zIndex, maxHeight: "70vh" }}
		>
			{/* Header */}
			<div
				className="border-b-[var(--bw-thin)] flex shrink-0 items-center justify-between  border-[var(--border-subtle)]"
				style={{ padding: "12px 18px" }}
			>
				<span
					style={{
						color: "var(--text-primary)",
					}}
					className="type-small"
				>
					Notifications
				</span>
				<button
					type="button"
					onClick={onClose}
					aria-label="Close notifications"
					className="border-none flex items-center justify-center rounded-[var(--r-subtle)] text-[var(--text-tertiary)] hover:text-[var(--accent-deep)]"
					style={{
						background: "none",
						border: "none",
						cursor: "pointer",
						padding: "6px",
						minWidth: "36px",
						minHeight: "36px",
					}}
				>
					<svg aria-hidden="true" viewBox="0 0 16 16" className="h-[16px] w-[16px]">
						<path d="m4 4 8 8m0-8-8 8" fill="none" stroke="currentColor" strokeWidth="1.5" />
					</svg>
				</button>
			</div>

			{/* Body */}
			<div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
				{status === "loading" && (
					<div
						role="status"
						aria-label="Loading notifications"
						className="flex items-center justify-center"
						style={{ padding: "36px" }}
					>
						<span className="loading loading-spinner loading-sm text-[var(--text-tertiary)]" />
					</div>
				)}

				{status === "error" && (
					<div
						className="flex flex-col items-center justify-center"
						style={{ padding: "24px 18px", gap: "12px" }}
					>
						<p
							style={{
								color: "var(--text-secondary)",
								margin: 0,
							}}
							className="type-small"
						>
							Couldn't load notifications
						</p>
						<Button
							variant="ghost"
							size="sm"
							aria-label="Retry loading notifications"
							onClick={() => void refetch()}
						>
							Retry
						</Button>
					</div>
				)}

				{status === "ready" && rows.length === 0 && (
					<div className="flex items-center justify-center" style={{ padding: "24px 18px" }}>
						<EmptyState
							title="All caught up"
							description="Notifications land here when something needs you."
							dataTestId="notifications-empty-state"
						/>
					</div>
				)}

				{status === "ready" && rows.length > 0 && (
					<ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
						{rows.map((row) => {
							const typeLabel = shortLabelForType(row.typeKey as NotificationTypeKey);
							return (
								<li
									key={row.id}
									data-testid={`notification-row-${row.id}`}
									className="border-b-[var(--bw-thin)] group relative  border-[var(--border-subtle)] hover:bg-[color-mix(in_oklab,var(--accent-primary)_4%,var(--surface-elevated))]"
								>
									{/*
									 * Single-line dense row: div with row-level keyboard/click for jump,
									 * plus real <button> elements for mute/dismiss at the trailing edge.
									 * @lore AF8 W1: cannot use <button> wrapper when trailing affordances
									 * are also <button> — HTML spec forbids nested buttons and causes
									 * hydration errors. Row is a div with role=row semantics; interactive
									 * via onClick + onKeyDown. The real buttons at the end handle mute/dismiss.
									 */}
									<div
										role="button"
										tabIndex={0}
										className="flex w-full min-h-[36px] items-center gap-[9px] cursor-pointer"
										style={{ padding: "9px 12px" }}
										onClick={() => handleRowClick(row.id, row.sourceLink)}
										onKeyDown={(e) => {
											if (e.key === "Enter" || e.key === " ") {
												e.preventDefault();
												handleRowClick(row.id, row.sourceLink);
											}
										}}
									>
										{/* 1. Urgency dot */}
										<span
											className="shrink-0 rounded-[var(--r-pill)]"
											style={{
												display: "inline-block",
												width: "6px",
												height: "6px",
												background:
													row.urgency === "immediate"
														? "var(--status-error)"
														: "var(--border-strong)",
											}}
											aria-hidden="true"
										/>

										{/* 2. Title */}
										<span
											className="type-small flex-1 truncate"
											style={{
												color: "var(--text-primary)",
											}}
										>
											{row.title}
										</span>

										{/* 3. Type label */}
										<span
											style={{
												color: "var(--text-tertiary)",

												textTransform: "uppercase",
												whiteSpace: "nowrap",
											}}
											className="type-label"
										>
											{typeLabel}
										</span>

										{/* 4. Relative time */}
										<span
											data-testid="notification-time"
											style={{
												color: "var(--text-tertiary)",
												fontVariantNumeric: "tabular-nums",
												whiteSpace: "nowrap",
												flexShrink: 0,
											}}
											className="type-small"
										>
											{relativeShort(row.createdAt)}
										</span>

										{/* 5. Trailing affordances — hover-reveal mute + dismiss */}
										<span
											className="motion-feedback flex shrink-0 items-center gap-[3px] opacity-0  group-hover:opacity-100 focus-within:opacity-100"
											style={{ flexShrink: 0 }}
										>
											{/* Mute (bell-slash SVG glyph) */}
											<button
												type="button"
												aria-label={`Mute ${typeLabel} notifications`}
												className="border-none flex items-center justify-center rounded-[var(--r-subtle)] text-[var(--text-tertiary)] hover:text-[var(--text-primary)]"
												style={{
													background: "none",
													border: "none",
													cursor: "pointer",
													padding: "3px",
													minWidth: "36px",
													minHeight: "36px",
												}}
												onClick={(e) => {
													e.stopPropagation();
													void muteType(row.typeKey);
												}}
											>
												{/* Bell with slash — mute icon */}
												<svg
													width="16"
													height="16"
													viewBox="0 0 24 24"
													fill="none"
													stroke="currentColor"
													strokeWidth="2"
													strokeLinecap="round"
													strokeLinejoin="round"
													aria-hidden="true"
												>
													<path d="M13.73 21a2 2 0 0 1-3.46 0" />
													<path d="M18.63 13A17.89 17.89 0 0 1 18 8" />
													<path d="M6.26 6.26A5.86 5.86 0 0 0 6 8c0 7-3 9-3 9h14" />
													<path d="M18 8a6 6 0 0 0-9.33-5" />
													<line x1="1" y1="1" x2="23" y2="23" />
												</svg>
											</button>

											{/* Dismiss (× glyph) */}
											<button
												type="button"
												aria-label="Dismiss notification"
												className="border-none flex items-center justify-center rounded-[var(--r-subtle)] text-[var(--text-tertiary)] hover:text-[var(--text-primary)]"
												style={{
													background: "none",
													border: "none",
													cursor: "pointer",
													padding: "3px",
													minWidth: "36px",
													minHeight: "36px",
												}}
												onClick={(e) => {
													e.stopPropagation();
													void markRead(row.id);
												}}
											>
												<svg aria-hidden="true" viewBox="0 0 16 16" className="h-[16px] w-[16px]">
													<path
														d="m4 4 8 8m0-8-8 8"
														fill="none"
														stroke="currentColor"
														strokeWidth="1.5"
													/>
												</svg>
											</button>
										</span>
									</div>
								</li>
							);
						})}
					</ul>
				)}
			</div>
		</div>
	);
}
