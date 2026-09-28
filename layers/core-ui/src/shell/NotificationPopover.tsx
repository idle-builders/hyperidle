// @lore: sourceLink guard — only navigate to routes starting with "/"; defense-in-depth against agent-authored content

import { type JSX, useCallback, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Button, EmptyState, useDialogBehavior } from "../ds";
import type { InboxItem, UseNotificationsResult } from "../hooks/useNotifications.js";
import { useNotifications } from "../hooks/useNotifications.js";
import { relativeShort } from "../utils/time.js";
import { linkForChange, titleForChange } from "./notification-display.js";

// Re-export for consumers
export type { InboxItem };

export interface NotificationPopoverProps {
	open: boolean;
	onClose: () => void;
	/** Injectable data override — lets stories render each distinct state without module mocking or API calls. */
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
	const { unseenCount, rows, status, refetch, markSeen, markRead } = _data ?? hookData;
	const overlayRef = useRef<HTMLDivElement>(null);

	const behavior = useDialogBehavior({ open, onClose, modal: false, layer: "overlay" });
	const overlayProps = behavior.getOverlayProps();

	const markSeenRef = useRef(markSeen);
	const unseenCountRef = useRef(unseenCount);
	markSeenRef.current = markSeen;
	unseenCountRef.current = unseenCount;

	useEffect(() => {
		if (open && unseenCountRef.current > 0) {
			void markSeenRef.current();
		}
	}, [open]);

	const { requestDismiss } = behavior;
	useEffect(() => {
		if (!open) return;
		const handler = (e: KeyboardEvent): void => {
			if (e.key === "Escape") {
				requestDismiss();
			}
		};
		document.addEventListener("keydown", handler);
		return () => document.removeEventListener("keydown", handler);
	}, [open, requestDismiss]);

	// Outside-click-to-close
	useEffect(() => {
		if (!open) return;
		const handler = (e: MouseEvent): void => {
			if (overlayRef.current && !overlayRef.current.contains(e.target as Node)) {
				onClose();
			}
		};
		document.addEventListener("mousedown", handler);
		return () => document.removeEventListener("mousedown", handler);
	}, [open, onClose]);

	const handleRowClick = useCallback(
		(changeId: string, link: string): void => {
			// link guard — only navigate to internal app routes
			if (!link.startsWith("/")) return;
			void markRead(changeId);
			navigate(link);
			onClose();
		},
		[markRead, navigate, onClose],
	);

	if (!open) return null;

	return (
		// biome-ignore lint/a11y/useAriaPropsSupportedByRole: role is statically typed "dialog" in useDialogBehavior.getOverlayProps — biome can't see through the indirection to know aria-modal is valid here.
		<div
			ref={overlayRef}
			role={overlayProps.role}
			aria-modal={overlayProps["aria-modal"]}
			aria-label="Notifications"
			data-testid="notification-popover"
			data-dialog-layer={overlayProps["data-dialog-layer"]}
			className="border-width-thin fixed top-[108px] left-[9px] flex w-[440px] flex-col overflow-hidden rounded-[var(--r-subtle)]  border-[var(--border-default)] bg-[var(--surface-elevated)] shadow-[var(--shadow-elevated)]"
			style={{ zIndex: overlayProps.style.zIndex, maxHeight: "70vh" }}
		>
			{/* Header */}
			<div
				className="border-width-thin-b flex shrink-0 items-center justify-between  border-[var(--border-subtle)]"
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
				<Button
					variant="ghost"
					tone="neutral"
					size="icon"
					onClick={onClose}
					aria-label="Close notifications"
				>
					<svg aria-hidden="true" viewBox="0 0 16 16" className="h-[16px] w-[16px]">
						<path d="m4 4 8 8m0-8-8 8" fill="none" stroke="currentColor" strokeWidth="1.5" />
					</svg>
				</Button>
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
							const title = titleForChange(row.change);
							const link = linkForChange(row.change);
							const unseen = row.seenAt === null;
							return (
								<li
									key={row.change.id}
									data-testid={`notification-row-${row.change.id}`}
									className="border-width-thin-b group relative  border-[var(--border-subtle)] hover:bg-[color-mix(in_oklab,var(--accent-primary)_4%,var(--surface-elevated))]"
								>
									{/*
									 * Single-line dense row: div with row-level keyboard/click for jump,
									 * plus a real <button> for dismiss at the trailing edge.
									 */}
									{/* biome-ignore lint/a11y/useSemanticElements: a real <button> here would nest inside the trailing dismiss <button>, which HTML forbids. */}
									<div
										role="button"
										tabIndex={0}
										className="flex w-full min-h-[36px] items-center gap-[9px] cursor-pointer"
										style={{ padding: "9px 12px" }}
										onClick={() => handleRowClick(row.change.id, link)}
										onKeyDown={(e) => {
											if (e.key === "Enter" || e.key === " ") {
												e.preventDefault();
												handleRowClick(row.change.id, link);
											}
										}}
									>
										{/* 1. Unseen dot */}
										<span
											className="shrink-0 rounded-[var(--r-pill)]"
											style={{
												display: "inline-block",
												width: "6px",
												height: "6px",
												background: unseen ? "var(--status-error)" : "var(--border-strong)",
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
											{title}
										</span>

										{/* 3. Object label */}
										<span
											style={{
												color: "var(--text-tertiary)",

												textTransform: "uppercase",
												whiteSpace: "nowrap",
											}}
											className="type-label"
										>
											{row.change.object}
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
											{relativeShort(row.change.at)}
										</span>

										{/* 5. Trailing affordance — hover-reveal dismiss */}
										<span
											className="motion-feedback flex shrink-0 items-center gap-[3px] opacity-0  group-hover:opacity-100 focus-within:opacity-100"
											style={{ flexShrink: 0 }}
										>
											{/* Dismiss (× glyph) */}
											<Button
												variant="ghost"
												tone="neutral"
												size="icon"
												aria-label="Dismiss notification"
												onClick={(e) => {
													e.stopPropagation();
													void markRead(row.change.id);
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
											</Button>
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
