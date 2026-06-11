/**
 * AF8 — NotificationPopover
 *
 * In-app notification inbox popover. Anchored to the notification trigger
 * in the Sidebar bottom strip.
 *
 * States: loading / error / empty / populated
 * Row anatomy: urgency dot, title, type label, relative time, mute button, dismiss button
 *
 * @lore AF8: markSeen is called on mount (when open=true) so unseen dots
 * clear immediately on popover open, matching the UX spec. markRead removes
 * a specific row (jump or dismiss). muteType removes all rows of a type and
 * writes the mute preference to the server.
 *
 * @lore AF8: Tier-3 shell composition — NOT a design-system primitive.
 * Uses raw DaisyUI + Hearth tokens. Every interactive element follows the
 * AQ-015 touch target rule at ≤1024px.
 */

import { type JSX, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useNotifications } from "../hooks/useNotifications.js";

// Type label map (friendly display of notification type keys)
const TYPE_LABELS: Record<string, string> = {
	review_request: "REVIEW",
	blocker_alert: "BLOCKER",
	cost_alert: "COST",
};

function formatRelativeTime(isoString: string): string {
	const diff = Date.now() - new Date(isoString).getTime();
	const secs = Math.floor(diff / 1000);
	if (secs < 60) return `${secs}s ago`;
	const mins = Math.floor(secs / 60);
	if (mins < 60) return `${mins}m ago`;
	const hrs = Math.floor(mins / 60);
	if (hrs < 24) return `${hrs}h ago`;
	return `${Math.floor(hrs / 24)}d ago`;
}

export interface NotificationPopoverProps {
	open: boolean;
	onClose: () => void;
}

export function NotificationPopover({
	open,
	onClose,
}: NotificationPopoverProps): JSX.Element | null {
	const navigate = useNavigate();
	const { unseenCount, rows, status, markSeen, markRead, muteType } = useNotifications();

	// Mark all unseen on open — intentionally only depends on `open` so this fires
	// exactly once when the popover opens, not on every unseenCount/markSeen update.
	// biome-ignore lint/correctness/useExhaustiveDependencies: intentional — fires on open toggle only
	useEffect(() => {
		if (open && unseenCount > 0) {
			void markSeen();
		}
	}, [open]); // eslint-disable-line react-hooks/exhaustive-deps

	if (!open) return null;

	return (
		<div
			role="dialog"
			aria-label="Notifications"
			data-testid="notification-popover"
			style={{
				position: "fixed",
				bottom: "64px",
				left: "212px",
				width: "360px",
				maxHeight: "70vh",
				background: "var(--surface-elevated)",
				borderRadius: "var(--r-default)",
				boxShadow: "var(--shadow-elevated)",
				border: "1px solid var(--border-subtle)",
				display: "flex",
				flexDirection: "column",
				zIndex: 40,
				overflow: "hidden",
			}}
		>
			{/* Header */}
			<div
				style={{
					display: "flex",
					alignItems: "center",
					justifyContent: "space-between",
					padding: "12px 18px",
					borderBottom: "1px solid var(--border-subtle)",
					flexShrink: 0,
				}}
			>
				<span
					style={{
						fontFamily: "var(--font-sans)",
						fontSize: "14px",
						fontWeight: 600,
						color: "var(--text-primary)",
					}}
				>
					Notifications
				</span>
				<button
					type="button"
					onClick={onClose}
					aria-label="Close notifications"
					style={{
						background: "none",
						border: "none",
						cursor: "pointer",
						color: "var(--text-tertiary)",
						fontSize: "18px",
						lineHeight: 1,
						padding: "3px 6px",
						borderRadius: "var(--r-subtle)",
					}}
				>
					×
				</button>
			</div>

			{/* Body */}
			<div style={{ overflowY: "auto", flex: 1, minHeight: 0 }}>
				{status === "loading" && (
					<div
						role="status"
						aria-label="Loading notifications"
						style={{
							display: "flex",
							justifyContent: "center",
							alignItems: "center",
							padding: "36px",
						}}
					>
						<span className="loading loading-spinner loading-sm" />
					</div>
				)}

				{status === "error" && (
					<div
						style={{
							padding: "24px 18px",
							textAlign: "center",
							color: "var(--text-secondary)",
							fontFamily: "var(--font-sans)",
							fontSize: "13px",
						}}
					>
						<p style={{ marginBottom: "12px" }}>Couldn't load notifications</p>
						<button
							type="button"
							aria-label="Retry loading notifications"
							style={{
								background: "var(--surface-container)",
								border: "1px solid var(--border-default)",
								borderRadius: "var(--r-subtle)",
								cursor: "pointer",
								color: "var(--text-secondary)",
								fontSize: "13px",
								padding: "6px 12px",
							}}
						>
							Retry
						</button>
					</div>
				)}

				{status === "ready" && rows.length === 0 && (
					<div
						style={{
							padding: "36px 18px",
							textAlign: "center",
							color: "var(--text-tertiary)",
							fontFamily: "var(--font-sans)",
							fontSize: "13px",
						}}
					>
						All caught up
					</div>
				)}

				{status === "ready" && rows.length > 0 && (
					<ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
						{rows.map((row) => {
							const typeLabel = TYPE_LABELS[row.typeKey] ?? row.typeKey.toUpperCase();
							return (
								<li
									key={row.id}
									data-testid={`notification-row-${row.id}`}
									style={{
										display: "flex",
										flexDirection: "column",
										borderBottom: "1px solid var(--border-subtle)",
									}}
								>
									{/* Main row button — navigate to source */}
									<button
										type="button"
										style={{
											display: "flex",
											flexDirection: "column",
											gap: "3px",
											padding: "12px 18px",
											cursor: "pointer",
											background: "none",
											border: "none",
											textAlign: "left",
											width: "100%",
										}}
										onClick={() => {
											navigate(row.sourceLink);
											onClose();
										}}
									>
										{/* Row top: urgency dot + title */}
										<div style={{ display: "flex", alignItems: "flex-start", gap: "9px" }}>
											<span
												style={{
													display: "inline-block",
													width: "8px",
													height: "8px",
													borderRadius: "50%",
													background:
														row.urgency === "immediate"
															? "var(--accent-primary)"
															: "var(--text-tertiary)",
													flexShrink: 0,
													marginTop: "4px",
												}}
												aria-hidden="true"
											/>
											<span
												style={{
													fontFamily: "var(--font-sans)",
													fontSize: "13px",
													color: "var(--text-primary)",
													fontWeight: 500,
													flex: 1,
												}}
											>
												{row.title}
											</span>
										</div>

										{/* Row meta: type label + relative time */}
										<div
											style={{
												display: "flex",
												alignItems: "center",
												gap: "9px",
												paddingLeft: "17px",
											}}
										>
											<span
												style={{
													fontFamily: "var(--font-mono)",
													fontSize: "11px",
													color: "var(--text-tertiary)",
													letterSpacing: "var(--tracking-caps)",
												}}
											>
												{typeLabel}
											</span>
											<span
												style={{
													fontFamily: "var(--font-sans)",
													fontSize: "11px",
													color: "var(--text-tertiary)",
												}}
											>
												{formatRelativeTime(row.createdAt)}
											</span>
										</div>
									</button>

									{/* Row actions — separate from the navigate button */}
									<div
										style={{
											display: "flex",
											gap: "9px",
											paddingLeft: "35px",
											paddingBottom: "9px",
										}}
									>
										<button
											type="button"
											aria-label={`Mute ${typeLabel.toLowerCase()} notifications`}
											onClick={() => void muteType(row.typeKey)}
											style={{
												background: "none",
												border: "none",
												cursor: "pointer",
												color: "var(--text-tertiary)",
												fontSize: "12px",
												fontFamily: "var(--font-sans)",
												padding: "3px 6px",
												borderRadius: "var(--r-subtle)",
												minHeight: "28px",
											}}
										>
											Mute {typeLabel.toLowerCase()}
										</button>
										<button
											type="button"
											aria-label="Dismiss"
											onClick={() => void markRead(row.id)}
											style={{
												background: "none",
												border: "none",
												cursor: "pointer",
												color: "var(--text-tertiary)",
												fontSize: "12px",
												fontFamily: "var(--font-sans)",
												padding: "3px 6px",
												borderRadius: "var(--r-subtle)",
												minHeight: "28px",
											}}
										>
											Dismiss
										</button>
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
