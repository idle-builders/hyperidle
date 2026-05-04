/**
 * @lore L15: per-task kebab menu replacing drag-to-move. Tier 3 shell — not
 * a design-system primitive — because the vocabulary (state-change, open
 * thread) is task-specific. See L15-plan.md §4.5.2.
 */
import { type JSX, useCallback, useEffect, useRef, useState } from "react";
import { type KanbanColumnState, type KanbanTask, STATE_TO_COLUMN } from "./Kanban";

export type TaskActionsResult =
	| { ok: true }
	| { ok: false; reason: "network" | "validation" | "forbidden" | "server" };

export interface TaskActionsMenuProps {
	task: KanbanTask;
	onStateRequest: (targetColumn: KanbanColumnState) => Promise<TaskActionsResult>;
	onOpenThread: () => void;
}

const STATE_OPTIONS: Array<{ key: KanbanColumnState; label: string; shortcut: string }> = [
	{ key: "planned", label: "Planned", shortcut: "p" },
	{ key: "blocked", label: "Blocked", shortcut: "b" },
	{ key: "in_progress", label: "In Progress", shortcut: "i" },
	{ key: "done", label: "Done", shortcut: "d" },
];

/**
 * @lore L15 (security MED): cap consecutive submenu re-opens on error so a
 * stuck server cannot trap the user in an auto-reopen loop. After N
 * failures we close the menu and the parent toast becomes the only retry
 * surface.
 */
const MAX_FAILURE_REOPEN = 3;

export function TaskActionsMenu({
	task,
	onStateRequest,
	onOpenThread,
}: TaskActionsMenuProps): JSX.Element | null {
	const [open, setOpen] = useState(false);
	const [submenuOpen, setSubmenuOpen] = useState(false);
	const [inFlight, setInFlight] = useState(false);
	const triggerRef = useRef<HTMLButtonElement>(null);
	const containerRef = useRef<HTMLDivElement>(null);
	const submenuRef = useRef<HTMLDivElement>(null);
	const failureCountRef = useRef(0);

	// `hold` and `killed` map to `null` (excluded from board) — render
	// nothing so the kebab cannot fire a request with a stale current-state
	// label in its copy. Adversary CRITICAL: refuse upstream rather than at
	// click time.
	const currentColumn = STATE_TO_COLUMN[task.state];
	if (currentColumn === null) return null;

	const closeAll = useCallback((restoreFocus: boolean): void => {
		setSubmenuOpen(false);
		setOpen(false);
		if (restoreFocus) triggerRef.current?.focus();
	}, []);

	useEffect(() => {
		if (!open) return;
		function handleDocClick(e: MouseEvent): void {
			if (!containerRef.current) return;
			if (!containerRef.current.contains(e.target as Node)) {
				closeAll(false);
			}
		}
		document.addEventListener("mousedown", handleDocClick);
		return () => document.removeEventListener("mousedown", handleDocClick);
	}, [open, closeAll]);

	// When the submenu opens, move focus to the first non-disabled menuitem
	// so keyboard users land inside the new region.
	useEffect(() => {
		if (!submenuOpen) return;
		const first = submenuRef.current?.querySelector<HTMLButtonElement>(
			'button[role="menuitem"]:not([disabled])',
		);
		first?.focus();
	}, [submenuOpen]);

	const handleSelectState = useCallback(
		async (target: KanbanColumnState): Promise<void> => {
			if (target === currentColumn) return;
			if (inFlight) return;
			setInFlight(true);
			closeAll(true);
			try {
				const result = await onStateRequest(target);
				if (!result.ok) {
					failureCountRef.current += 1;
					if (failureCountRef.current < MAX_FAILURE_REOPEN) {
						setOpen(true);
						setSubmenuOpen(true);
					}
				} else {
					failureCountRef.current = 0;
				}
			} finally {
				setInFlight(false);
			}
		},
		[currentColumn, closeAll, onStateRequest, inFlight],
	);

	const handleOpenThread = useCallback((): void => {
		closeAll(false);
		onOpenThread();
	}, [closeAll, onOpenThread]);

	function handleRootKeyDown(e: React.KeyboardEvent<HTMLDivElement>): void {
		if (!open) return;
		if (e.key === "Escape") {
			e.preventDefault();
			e.stopPropagation();
			// ESC inside submenu returns to the parent menu state — only a
			// second ESC closes the whole menu.
			if (submenuOpen) {
				setSubmenuOpen(false);
				// Restore focus to the trigger so a subsequent ESC reaches
				// the keyhandler on the container.
				triggerRef.current?.focus();
				return;
			}
			closeAll(true);
			return;
		}
		const k = e.key.toLowerCase();
		if (submenuOpen) {
			const match = STATE_OPTIONS.find((o) => o.shortcut === k);
			if (match) {
				e.preventDefault();
				void handleSelectState(match.key);
			}
			return;
		}
		if (k === "t") {
			e.preventDefault();
			handleOpenThread();
		}
	}

	function toggleMenu(): void {
		if (open) {
			closeAll(false);
		} else {
			setOpen(true);
			setSubmenuOpen(false);
		}
	}

	// Density-token-aware menu/menuitem class strings. Min-h on menuitems
	// satisfies AQ-015 (≥ 44px touch targets at viewport ≤ 1024 px).
	const menuShellCls =
		"absolute right-0 top-full z-10 mt-[var(--density-card-gap)] min-w-[12rem] bg-[var(--surface-2)] border border-[var(--border)] rounded-[var(--r1)] shadow-lg p-[var(--density-card-gap)] transition-opacity duration-[var(--motion-fast)]";
	const menuItemCls =
		"w-full text-left px-[var(--density-pad-x)] py-[var(--density-card-gap)] hover:bg-[var(--surface-3)] rounded-[var(--r1)] min-h-[44px] flex items-center";

	return (
		<div
			ref={containerRef}
			className="relative opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 focus-within:opacity-100 hover:opacity-100 transition-opacity duration-[var(--motion-fast)]"
			onKeyDown={handleRootKeyDown}
		>
			<button
				ref={triggerRef}
				type="button"
				aria-label="Task actions"
				aria-haspopup="menu"
				aria-expanded={open}
				disabled={inFlight}
				className="btn btn-ghost btn-xs min-h-[44px] min-w-[44px]"
				onClick={toggleMenu}
			>
				{/* lucide MoreVertical, inlined — no new dep */}
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
					<circle cx="12" cy="5" r="1" />
					<circle cx="12" cy="12" r="1" />
					<circle cx="12" cy="19" r="1" />
				</svg>
			</button>
			{open && !submenuOpen && (
				<div role="menu" aria-label="Task actions" className={menuShellCls}>
					<button
						type="button"
						role="menuitem"
						className={menuItemCls}
						onClick={() => setSubmenuOpen(true)}
						aria-haspopup="menu"
						aria-expanded={false}
						disabled={inFlight}
					>
						Request state change
					</button>
					<button
						type="button"
						role="menuitem"
						className={menuItemCls}
						onClick={handleOpenThread}
						disabled={inFlight}
					>
						Open thread
					</button>
				</div>
			)}
			{open && submenuOpen && (
				<div
					ref={submenuRef}
					role="menu"
					aria-label="Request state change"
					className={menuShellCls}
				>
					{STATE_OPTIONS.map((opt) => {
						const isCurrent = opt.key === currentColumn;
						const isDanger = opt.key === "blocked";
						const dangerCls = isDanger ? " text-[var(--danger)]" : "";
						const disabledCls = isCurrent ? " opacity-50 cursor-not-allowed" : "";
						return (
							<button
								key={opt.key}
								type="button"
								role="menuitem"
								aria-disabled={isCurrent}
								disabled={isCurrent || inFlight}
								className={`${menuItemCls}${dangerCls}${disabledCls}`}
								onClick={() => {
									if (!isCurrent) void handleSelectState(opt.key);
								}}
							>
								{isCurrent ? `${opt.label} (current)` : opt.label}
							</button>
						);
					})}
				</div>
			)}
		</div>
	);
}
