/**
 * L15 Tier-2 component — TaskActionsMenu.
 *
 * Per-card menu opened by the `···` trigger on a TaskCard. Renders the
 * canonical request-verb set (state-conditional) + universal items, with
 * a per-item "→ agent decides" hint that teaches the human-requests /
 * agent-decides protocol every time the menu is open.
 *
 * Visual parity reference: packages/design-system/html/TaskActionsMenu.html.
 *
 * @lore L15 § 4.3: state-conditional verb subsets driven by
 * TASK_VERBS_BY_STATE in @hyperidle/shared. Adding a new verb requires only
 * extending the verb registry; this component picks it up.
 */

import {
	REQUEST_VERB_TEXT,
	type RequestVerb,
	TASK_VERBS_BY_STATE,
	type TaskState,
} from "@hyperidle/shared";
import { type JSX, type ReactNode, useCallback, useEffect, useId, useRef, useState } from "react";
import { dsProps } from "./ds-attrs";

interface VerbDef {
	secondary: string;
	shortcut: string[];
}

const VERB_DEFS: Record<RequestVerb, VerbDef> = {
	request_stop: { secondary: "asks the agent to abandon — agent decides", shortcut: ["S"] },
	request_hold: { secondary: "asks the agent to pause — agent decides", shortcut: ["H"] },
	request_unblock: { secondary: "asks the agent to retry — agent decides", shortcut: ["U"] },
	request_mark_done: { secondary: "asks the agent to wrap — agent decides", shortcut: ["D"] },
	request_changes: { secondary: "rejects with comment — agent decides", shortcut: ["C"] },
	hand_back: { secondary: "moves ownership to you — agent confirms", shortcut: ["B"] },
	cancel_request: { secondary: "withdraws the request", shortcut: ["X"] },
};

export interface TaskActionsMenuProps {
	task: {
		id: string;
		title: string;
		state: TaskState;
		hasPendingRequest?: boolean;
	};
	onRequestStateChange: (verb: RequestVerb, reason?: string) => void;
	onCancelPendingRequest?: () => void;
	onOpenThread?: () => void;
	/**
	 * Render slot: the wrapping element renders the trigger and conditionally
	 * renders the dropdown menu surface.
	 */
	children?: ReactNode;
}

interface MenuItemProps {
	primary: string;
	secondary?: string;
	shortcut?: string[];
	danger?: boolean;
	onClick: () => void;
}

function Shortcut({ keys }: { keys: string[] }): JSX.Element {
	return (
		<span className="font-heading text-[11px] tracking-[0.04em] text-[var(--text-lo)] self-center">
			{keys.map((k, i) => (
				// biome-ignore lint/suspicious/noArrayIndexKey: shortcut keys are stable per item
				<span key={i}>
					{i > 0 && <span className="mx-[4px] text-[var(--text-lo)]">·</span>}
					<kbd className="font-heading text-[11px] tracking-[0.04em] text-[var(--text-mid)] bg-[var(--surface-3)] border border-[var(--border-subtle)] rounded-[var(--r1)] px-[5px] py-[1px] leading-[1.4]">
						{k}
					</kbd>
				</span>
			))}
		</span>
	);
}

function MenuItem({ primary, secondary, shortcut, danger, onClick }: MenuItemProps): JSX.Element {
	return (
		<button
			type="button"
			role="menuitem"
			onClick={onClick}
			className="text-left w-full px-[10px] py-[6px] rounded-[var(--r1)] bg-transparent border-none cursor-pointer grid grid-cols-[1fr_auto] items-baseline gap-x-[12px] gap-y-[2px] hover:bg-[var(--surface-ghost)] focus-visible:bg-[var(--surface-ghost)] focus-visible:outline-none"
		>
			<span
				className={`text-[13px] font-medium leading-[1.35] ${danger ? "text-[var(--danger)]" : "text-[var(--text-hi)]"}`}
			>
				{primary}
			</span>
			{shortcut && <Shortcut keys={shortcut} />}
			{secondary && (
				<span className="col-span-full text-[11px] text-[var(--text-lo)] leading-[1.35]">
					→ {secondary}
				</span>
			)}
		</button>
	);
}

export function TaskActionsMenu({
	task,
	onRequestStateChange,
	onCancelPendingRequest,
	onOpenThread,
	children,
}: TaskActionsMenuProps): JSX.Element {
	const [open, setOpen] = useState(false);
	const triggerRef = useRef<HTMLButtonElement>(null);
	const menuRef = useRef<HTMLDivElement>(null);
	const menuId = useId();

	const stateVerbs = TASK_VERBS_BY_STATE[task.state];
	const showStateSection = stateVerbs.length > 0;
	const hasPending = Boolean(task.hasPendingRequest);

	const close = useCallback((): void => {
		setOpen(false);
		triggerRef.current?.focus();
	}, []);

	function handleVerb(verb: RequestVerb): void {
		onRequestStateChange(verb);
		close();
	}

	function handleCancel(): void {
		onCancelPendingRequest?.();
		close();
	}

	function handleOpenThread(): void {
		onOpenThread?.();
		close();
	}

	// Build a shortcut → action map driven by VERB_DEFS so the kbd chips and
	// the keyboard listener stay in lockstep.
	const shortcutMap: Record<string, () => void> = {};
	for (const verb of stateVerbs) {
		const def = VERB_DEFS[verb];
		const key = def.shortcut[0];
		if (key) shortcutMap[key.toLowerCase()] = () => handleVerb(verb);
	}
	if (hasPending) {
		const cancelKey = VERB_DEFS.cancel_request.shortcut[0];
		if (cancelKey) shortcutMap[cancelKey.toLowerCase()] = handleCancel;
	}
	if (onOpenThread) shortcutMap.o = handleOpenThread;

	// Keyboard + outside-click controller. Esc closes, outside-click closes,
	// arrow-keys rove between menuitems, single-letter shortcuts fire the
	// matching item. Tab is left to browser default.
	useEffect(() => {
		if (!open) return;
		function onKeyDown(e: KeyboardEvent): void {
			if (e.key === "Escape") {
				e.preventDefault();
				close();
				return;
			}
			if (e.key === "ArrowDown" || e.key === "ArrowUp") {
				const items = Array.from(
					menuRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? [],
				);
				if (items.length === 0) return;
				const active = document.activeElement as HTMLElement | null;
				const idx = items.indexOf(active);
				const next =
					e.key === "ArrowDown"
						? items[(idx + 1) % items.length]
						: items[(idx - 1 + items.length) % items.length];
				next?.focus();
				e.preventDefault();
				return;
			}
			if (e.key.length === 1 && !e.metaKey && !e.ctrlKey && !e.altKey) {
				const fn = shortcutMap[e.key.toLowerCase()];
				if (fn) {
					e.preventDefault();
					fn();
				}
			}
		}
		function onPointerDown(e: PointerEvent): void {
			const t = e.target as Node | null;
			if (!t) return;
			if (menuRef.current?.contains(t)) return;
			if (triggerRef.current?.contains(t)) return;
			close();
		}
		document.addEventListener("keydown", onKeyDown);
		document.addEventListener("pointerdown", onPointerDown);
		return () => {
			document.removeEventListener("keydown", onKeyDown);
			document.removeEventListener("pointerdown", onPointerDown);
		};
		// shortcutMap is rebuilt every render; we rebuild listeners on `open`
		// transitions only — shortcutMap is read at event-time via closure.
		// biome-ignore lint/correctness/useExhaustiveDependencies: shortcutMap is intentionally read at event-time via closure
	}, [open, close, shortcutMap]);

	return (
		<div className="relative inline-block">
			<button
				ref={triggerRef}
				type="button"
				aria-label="Task actions"
				aria-haspopup="menu"
				aria-expanded={open}
				aria-controls={menuId}
				onClick={() => setOpen((p) => !p)}
				className="absolute top-[6px] right-[6px] w-[22px] h-[22px] min-w-[44px] min-h-[44px] min-[1025px]:min-w-[22px] min-[1025px]:min-h-[22px] rounded-[var(--r1)] flex items-center justify-center text-[var(--text-lo)] bg-transparent border-none cursor-pointer text-[14px] leading-none hover:bg-[var(--surface-6)] hover:opacity-100 focus-visible:bg-[var(--surface-6)] focus-visible:opacity-100 focus-visible:outline-none"
			>
				···
			</button>
			{children}
			{open && (
				<div
					{...dsProps("TaskActionsMenu", "2")}
					ref={menuRef}
					id={menuId}
					role="menu"
					aria-label="Task actions"
					data-state={task.state}
					data-pending={hasPending ? "true" : "false"}
					className="absolute top-[30px] right-[6px] min-w-[260px] max-w-[280px] bg-[var(--surface-1)] border border-[var(--border-default)] rounded-[var(--r2)] shadow-[var(--float)] p-[4px] flex flex-col gap-[1px] z-10"
				>
					{showStateSection && (
						<>
							<div className="font-heading text-[11px] tracking-[0.05em] uppercase font-medium text-[var(--text-lo)] px-[10px] pt-[6px] pb-[4px]">
								Request state change
							</div>
							{stateVerbs.map((verb) => {
								const def = VERB_DEFS[verb];
								return (
									<MenuItem
										key={verb}
										primary={REQUEST_VERB_TEXT[verb]}
										secondary={def.secondary}
										shortcut={def.shortcut}
										onClick={() => handleVerb(verb)}
									/>
								);
							})}
						</>
					)}

					{hasPending && (
						<>
							{showStateSection && <div className="h-[1px] bg-[var(--border-subtle)] my-[4px]" />}
							<MenuItem
								primary={REQUEST_VERB_TEXT.cancel_request}
								secondary={VERB_DEFS.cancel_request.secondary}
								shortcut={VERB_DEFS.cancel_request.shortcut}
								danger
								onClick={handleCancel}
							/>
						</>
					)}

					{onOpenThread && (
						<>
							{(showStateSection || hasPending) && (
								<div className="h-[1px] bg-[var(--border-subtle)] my-[4px]" />
							)}
							<div className="font-heading text-[11px] tracking-[0.05em] uppercase font-medium text-[var(--text-lo)] px-[10px] pt-[6px] pb-[4px]">
								Thread
							</div>
							<MenuItem
								primary="Open thread"
								secondary="jump to the conversation"
								shortcut={["O"]}
								onClick={handleOpenThread}
							/>
						</>
					)}
				</div>
			)}
		</div>
	);
}
