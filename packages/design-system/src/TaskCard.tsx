import { getRequestableVerbRows, type TaskRequestVerb, type TaskState } from "@hyperidle/shared";
import { type JSX, type KeyboardEvent, type ReactNode, useEffect, useRef, useState } from "react";
import { dsProps } from "./ds-attrs";
import { KeyValue } from "./KeyValue";
import { StatusChip } from "./StatusChip";
import { taskStateToStatus } from "./status-mapping";
import { Tag } from "./Tag";

export interface TaskCardProps {
	title: string;
	owner: string;
	state: TaskState;
	cost?: string;
	betTag?: string;
	actions?: ReactNode;

	/**
	 * Thread state (approved.md §3 + §5):
	 *   undefined → no thread exists yet → no dot.
	 *   0         → thread exists, all read → grey dot.
	 *   > 0       → unread → primary-tint dot + interactive title row.
	 */
	threadUnreadCount?: number;
	onOpenThread?: () => void;
	onRequestStateChange?: (verb: TaskRequestVerb) => void;

	/**
	 * L15 (AR1/SR1/DR5): when set, the kebab is disabled and the matching
	 * verb (or `open-thread`) row renders an inline `loading-xs` spinner.
	 * The menu stays open until the parent flips this back to `null`. This
	 * is the load-bearing client-side guard against double-firing requests.
	 *
	 * Approved.md §5 row "Request in flight": *"Selected menu item shows
	 * `loading-xs` spinner inline; menu stays open; kebab disabled."*
	 */
	pendingVerb?: TaskRequestVerb | "open-thread" | null;
}

/**
 * @lore L15: TaskCard never owns its `state` prop internally — the chip is
 * always a pure projection. Optimistic updates are explicitly forbidden by
 * approved.md §12 item 5; the chip moves only when the parent re-renders
 * with a new state prop (driven by a server `TaskStateChangedEvent`).
 *
 * @lore L15: dropdown open/close is JS-driven via `useState(menuOpen)` +
 * a `mousedown` document listener for outside-click. We tried CSS-only
 * `:focus-within` first but DaisyUI's tabbed dropdown closes when focus
 * moves to the menuitem button (focus-within stays true on parent but the
 * menu closes on item activation needed a click-handler anyway). The JS
 * path also gives us aria-expanded synchronization for free.
 */
export function TaskCard({
	title,
	owner,
	state,
	cost,
	betTag,
	actions,
	threadUnreadCount,
	onOpenThread,
	onRequestStateChange,
	pendingVerb = null,
}: TaskCardProps): JSX.Element {
	const unread = threadUnreadCount ?? 0;
	const hasThread = threadUnreadCount !== undefined;
	const titleInteractive = unread > 0;
	const showKebab = onRequestStateChange !== undefined || onOpenThread !== undefined;
	const isPending = pendingVerb !== null;

	const verbRows = getRequestableVerbRows(state);
	const [menuOpen, setMenuOpen] = useState(false);
	const dropdownRef = useRef<HTMLDivElement | null>(null);

	// L15 (AR1/SR1/DR5): when pendingVerb flips from non-null → null, the
	// request finished. Close the menu so the next click on the kebab opens
	// it fresh. (We keep the menu open during the in-flight window so the
	// spinner is visible per approved §5.)
	const prevPending = useRef<TaskRequestVerb | "open-thread" | null>(null);
	useEffect(() => {
		if (prevPending.current !== null && pendingVerb === null) {
			setMenuOpen(false);
		}
		prevPending.current = pendingVerb;
	}, [pendingVerb]);

	useEffect(() => {
		// While a request is in flight, do not close on outside-click — the
		// approved §5 contract requires the menu to stay open with the
		// spinner showing until the parent ack flips pendingVerb back to null.
		if (!menuOpen || isPending) return;
		function handleDocumentClick(event: MouseEvent): void {
			const target = event.target;
			if (!(target instanceof Node)) return;
			if (!dropdownRef.current?.contains(target)) {
				setMenuOpen(false);
			}
		}
		document.addEventListener("mousedown", handleDocumentClick);
		return () => document.removeEventListener("mousedown", handleDocumentClick);
	}, [menuOpen, isPending]);

	function handleVerbClick(verb: TaskRequestVerb, disabled: boolean): void {
		if (disabled || isPending) return;
		onRequestStateChange?.(verb);
		// Approved §5: menu stays open after click; the parent's pendingVerb
		// prop drives the spinner UI. Outside-click + Escape (browser
		// default on the next interaction) close it. The kebab toggle still
		// works once the parent flips pendingVerb back to null.
	}

	function handleOpenThreadClick(): void {
		if (isPending) return;
		onOpenThread?.();
	}

	function handleTitleKeyDown(e: KeyboardEvent<HTMLSpanElement>): void {
		if (!(titleInteractive && onOpenThread)) return;
		if (e.key === "Enter" || e.key === " ") {
			e.preventDefault();
			onOpenThread();
		}
	}

	const cardClass = `bg-[var(--surface-4)] rounded-[var(--r2)] p-[var(--density-card-pad)] flex flex-col gap-[var(--density-card-gap)] max-w-[320px] ${
		state === "blocked" ? "border border-[var(--danger)]" : ""
	}`;

	const titleClasses = titleInteractive
		? "text-[length:var(--density-text)] font-medium truncate text-[var(--text-hi)] cursor-pointer hover:text-[var(--primary)] transition-colors duration-[var(--motion-fast)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--primary)]"
		: "text-[length:var(--density-text)] font-medium truncate text-[var(--text-hi)]";

	// Split the matrix into request rows and danger rows so the renderer can
	// place dangers under a visual divider per approved.md §4.1.
	const requestRows = verbRows.filter((r) => !r.danger);
	const dangerRows = verbRows.filter((r) => r.danger);

	return (
		<div {...dsProps("TaskCard", "2")} aria-label={`Task: ${title}`} className={cardClass}>
			<div
				className={`flex items-start justify-between gap-[var(--density-gap)] ${
					titleInteractive ? "max-lg:min-h-[44px]" : ""
				}`}
			>
				<div className="flex items-center gap-[var(--density-gap)] min-w-0">
					{hasThread && (
						<span
							data-testid="task-thread-dot"
							data-unread={unread > 0 ? "true" : "false"}
							aria-hidden="true"
							className={`inline-block h-[6px] w-[6px] rounded-full shrink-0 ${
								unread > 0
									? "bg-[var(--primary)] shadow-[0_0_0_2px_color-mix(in_oklab,var(--primary)_30%,transparent)]"
									: "bg-[var(--text-lo)]"
							}`}
						/>
					)}
					{titleInteractive && onOpenThread ? (
						<span
							role="button"
							tabIndex={0}
							onClick={onOpenThread}
							onKeyDown={handleTitleKeyDown}
							className={titleClasses}
						>
							{title}
						</span>
					) : (
						<span className={titleClasses}>{title}</span>
					)}
				</div>
				{showKebab && (
					<div ref={dropdownRef} className="dropdown dropdown-end shrink-0 relative">
						<button
							type="button"
							aria-label={`Task actions for ${title}`}
							aria-haspopup="menu"
							aria-expanded={menuOpen ? "true" : "false"}
							disabled={isPending}
							aria-disabled={isPending ? "true" : undefined}
							onClick={(e) => {
								e.stopPropagation();
								if (isPending) return;
								setMenuOpen((open) => !open);
							}}
							className="btn btn-ghost btn-xs min-h-[28px] h-[28px] w-[28px] p-0 [@media(max-width:1024px)]:min-h-[44px] [@media(max-width:1024px)]:h-[44px] [@media(max-width:1024px)]:w-[44px] disabled:opacity-60"
						>
							<svg
								xmlns="http://www.w3.org/2000/svg"
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
								<circle cx="12" cy="5" r="1.5" />
								<circle cx="12" cy="12" r="1.5" />
								<circle cx="12" cy="19" r="1.5" />
							</svg>
						</button>
						{menuOpen && (
							<ul
								role="menu"
								className="dropdown-content menu menu-sm z-[1] mt-[var(--density-gap)] min-w-[240px] bg-[var(--surface-3)] rounded-[var(--r2)] p-[var(--density-pad-x)] shadow-lg border border-[var(--border-default)] absolute right-0 top-full [@media(max-width:1024px)]:[&_li>button]:min-h-[44px]"
							>
								{onOpenThread && (
									<li>
										<button
											type="button"
											role="menuitem"
											aria-label="Open thread"
											onClick={handleOpenThreadClick}
											className={`flex justify-between items-center gap-[var(--density-gap)] ${
												unread > 0
													? "bg-[color-mix(in_oklab,var(--primary)_14%,transparent)] text-[var(--primary)]"
													: ""
											}`}
										>
											<span className="flex items-center gap-[var(--density-gap)]">
												{pendingVerb === "open-thread" && (
													<span
														className="loading loading-spinner loading-xs"
														aria-hidden="true"
														data-testid="task-pending-spinner"
													/>
												)}
												Open thread
											</span>
											{unread > 0 && (
												<span
													aria-hidden="true"
													className="text-[11px] font-heading uppercase tracking-[var(--tracking-caps)]"
												>
													{unread} UNREAD
												</span>
											)}
										</button>
									</li>
								)}
								{onOpenThread && onRequestStateChange && (
									<li role="none">
										<hr className="border-[var(--border-subtle)] my-[var(--density-gap)]" />
									</li>
								)}
								{onRequestStateChange && (
									<>
										<li className="menu-title text-[11px] font-heading uppercase tracking-[var(--tracking-caps)] text-[var(--text-lo)] px-[var(--density-pad-x)] pt-[var(--density-pad-y)] pb-[var(--density-gap)]">
											Request state change
										</li>
										{requestRows.map((row) => (
											<li key={row.verb} className={row.disabled ? "disabled" : ""}>
												<button
													type="button"
													role="menuitem"
													aria-label={row.label}
													aria-disabled={row.disabled ? "true" : undefined}
													onClick={() => handleVerbClick(row.verb, row.disabled)}
													className={`flex justify-between items-center gap-[var(--density-gap)] ${
														row.disabled ? "text-[var(--text-lo)] cursor-not-allowed" : ""
													}`}
												>
													<span className="flex items-center gap-[var(--density-gap)]">
														{pendingVerb === row.verb && (
															<span
																className="loading loading-spinner loading-xs"
																aria-hidden="true"
																data-testid="task-pending-spinner"
															/>
														)}
														{row.label}
													</span>
													<span
														aria-hidden="true"
														className="text-[11px] font-heading uppercase tracking-[var(--tracking-caps)] text-[var(--text-lo)]"
													>
														{row.disabled && row.disabledHint ? row.disabledHint : row.targetState}
													</span>
												</button>
											</li>
										))}
										{dangerRows.length > 0 && (
											<li role="none">
												<hr className="border-[var(--border-subtle)] my-[var(--density-gap)]" />
											</li>
										)}
										{dangerRows.map((row) => (
											<li key={row.verb}>
												<button
													type="button"
													role="menuitem"
													aria-label={row.label}
													onClick={() => handleVerbClick(row.verb, row.disabled)}
													className="flex justify-between items-center gap-[var(--density-gap)] text-[var(--danger)]"
												>
													<span className="flex items-center gap-[var(--density-gap)]">
														{pendingVerb === row.verb && (
															<span
																className="loading loading-spinner loading-xs"
																aria-hidden="true"
																data-testid="task-pending-spinner"
															/>
														)}
														{row.label}
													</span>
													<span
														aria-hidden="true"
														className="text-[11px] font-heading uppercase tracking-[var(--tracking-caps)]"
													>
														{row.targetState}
													</span>
												</button>
											</li>
										))}
									</>
								)}
							</ul>
						)}
					</div>
				)}
			</div>
			<div className="flex items-center gap-[var(--density-gap)]">
				{betTag && <Tag label={betTag} />}
				<StatusChip status={taskStateToStatus(state)} />
			</div>
			<span className="text-[12px] text-[var(--text-hi)]">{owner}</span>
			{cost && <KeyValue label="Cost" value={cost} />}
			{actions}
		</div>
	);
}
