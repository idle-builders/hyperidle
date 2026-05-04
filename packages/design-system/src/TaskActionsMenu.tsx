/**
 * L15 §4.3 — TaskActionsMenu (Tier 2).
 *
 * State-conditional verb menu for a task card. Wraps the card body so a
 * click-on-card opens the menu, and exposes the universal actions
 * (open thread, reply, snooze, copy link) plus the verb actions legal
 * for the task's current state.
 *
 * Open state is committed synchronously via `flushSync` so the menu's
 * visibility is observable immediately after the click event resolves —
 * tests that fire a single bare click see the open menu without needing
 * an extra `act()` flush.
 *
 * @lore L15 §2.4: the verb→state matrix is the single source of truth.
 * Adding a new verb forces a decision in `TASK_VERBS_BY_STATE` and the
 * `LETTER_BINDINGS` table here.
 */

import {
	type PendingRequestSummary,
	type RequestVerb,
	REQUEST_VERB_TEXT,
	TASK_VERBS_BY_STATE,
	type TaskState,
} from "@hyperidle/shared";
import {
	type JSX,
	type KeyboardEvent as ReactKeyboardEvent,
	type MouseEvent as ReactMouseEvent,
	type ReactNode,
	useState,
} from "react";
import { flushSync } from "react-dom";
import { dsProps } from "./ds-attrs";

export interface TaskActionsMenuProps {
	task: {
		id: string;
		title: string;
		state: TaskState;
		pendingRequest?: PendingRequestSummary | null;
	};
	onRequestStateChange: (verb: RequestVerb, reason?: string) => void;
	onCancelPendingRequest: () => void;
	onOpenThread: () => void;
	onReplyInThread: (body: string) => void;
	onSnooze24h: () => void;
	onCopyLink: () => void;
	children: ReactNode;
}

interface MenuItemSpec {
	readonly key: string;
	readonly label: string;
	readonly secondary?: string;
	readonly shortcut?: string;
	readonly onActivate: () => void;
}

// @lore L15 simplification-scan MF4: every verb gets a unique letter so the
// keyboard accelerator never silently fires the wrong action. `H` could have
// matched both `request_hold` and `hand_back` in `in_progress`; `C` could
// have matched both `request_changes` and `cancel_request` in `review`. Use
// `K` for hand-bacK and `X` for cancel/eXit.
const LETTER_BY_VERB: Partial<Record<RequestVerb, string>> = {
	request_stop: "S",
	request_hold: "H",
	request_unblock: "B",
	request_mark_done: "D",
	request_changes: "C",
	hand_back: "K",
	cancel_request: "X",
};

const VERB_SECONDARY: Record<RequestVerb, string> = {
	request_stop: "asks the agent to abandon — agent decides",
	request_hold: "asks the agent to pause — agent decides",
	request_unblock: "asks the agent to resume — agent decides",
	request_mark_done: "asks the agent to close — agent decides",
	request_changes: "asks the agent to revise — agent decides",
	hand_back: "moves ownership to you — agent confirms",
	cancel_request: "withdraws the pending request",
};

export function TaskActionsMenu(props: TaskActionsMenuProps): JSX.Element {
	const {
		task,
		onRequestStateChange,
		onCancelPendingRequest,
		onOpenThread,
		onReplyInThread,
		onSnooze24h,
		onCopyLink,
		children,
	} = props;
	const [open, setOpen] = useState(false);

	const setOpenSync = (next: boolean): void => {
		flushSync(() => setOpen(next));
	};
	const close = (): void => setOpenSync(false);

	const verbs = TASK_VERBS_BY_STATE[task.state] ?? [];
	const items: MenuItemSpec[] = [];
	for (const verb of verbs) {
		items.push({
			key: `verb-${verb}`,
			label: REQUEST_VERB_TEXT[verb],
			secondary: VERB_SECONDARY[verb],
			shortcut: LETTER_BY_VERB[verb],
			onActivate: () => {
				onRequestStateChange(verb);
				close();
			},
		});
	}
	if (task.pendingRequest) {
		items.push({
			key: "verb-cancel",
			label: REQUEST_VERB_TEXT.cancel_request,
			secondary: VERB_SECONDARY.cancel_request,
			shortcut: LETTER_BY_VERB.cancel_request,
			onActivate: () => {
				onCancelPendingRequest();
				close();
			},
		});
	}
	items.push({
		key: "open-thread",
		label: "Open thread",
		secondary: "jump to the conversation",
		shortcut: "O",
		onActivate: () => {
			onOpenThread();
			close();
		},
	});
	items.push({
		key: "reply",
		label: "Reply in thread…",
		secondary: "send a free-form message",
		shortcut: "R",
		onActivate: () => {
			onReplyInThread("");
			close();
		},
	});
	items.push({
		key: "snooze",
		label: "Snooze 24h",
		secondary: "hide from your board for a day",
		shortcut: "Z",
		onActivate: () => {
			onSnooze24h();
			close();
		},
	});
	items.push({
		key: "copy",
		label: "Copy link",
		shortcut: undefined,
		onActivate: () => {
			onCopyLink();
			close();
		},
	});

	const handleKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>): void => {
		if (!open) return;
		if (e.key === "Escape") {
			close();
			return;
		}
		const upper = e.key.toUpperCase();
		if (upper.length !== 1) return;
		const match = items.find((it) => it.shortcut === upper);
		if (match) {
			e.preventDefault();
			match.onActivate();
		}
	};

	const handleCardBodyClick = (e: ReactMouseEvent<HTMLDivElement>): void => {
		// CRITICAL-2: card-body click opens the menu (not the thread). The
		// trigger has its own onClick and stops propagation; the chip slot in
		// TaskCard also stops propagation when present.
		const target = e.target as HTMLElement;
		// Avoid double-firing when the click originated on a button inside the
		// children (e.g. the trigger or the pending chip).
		if (target.closest("button")) return;
		setOpenSync(true);
	};

	return (
		<div
			{...dsProps("TaskActionsMenu", "2")}
			className="relative w-full focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
			onKeyDown={handleKeyDown}
			onClick={handleCardBodyClick}
		>
			{/*
			 * CRITICAL-1/3: trigger sits inside the host with z-20 so it stays
			 * clickable above any card-body content that might overlap it.
			 * The host is full-width (matches the children's box) so right-0
			 * on the menu anchors correctly to the trigger column.
			 */}
			<button
				type="button"
				aria-label="Task actions"
				aria-haspopup="menu"
				aria-expanded={open}
				className="absolute top-[8px] right-[8px] z-20 btn btn-ghost btn-xs px-[6px] py-[2px] text-[var(--text-hi)]"
				onClick={(e) => {
					e.stopPropagation();
					setOpenSync(true);
				}}
			>
				···
			</button>
			{children}
			{open ? (
				<div
					role="menu"
					className="absolute right-0 top-full mt-[4px] z-30 bg-[var(--surface-3)] border border-[var(--border-default)] rounded-[var(--r2)] py-[6px] min-w-[260px] max-w-[320px] shadow-md flex flex-col"
				>
					{items.map((it) => (
						<button
							key={it.key}
							type="button"
							role="menuitem"
							className="w-full flex items-start justify-between gap-[8px] px-[12px] py-[6px] text-left hover:bg-[var(--surface-ghost)]"
							onClick={(e) => {
								e.stopPropagation();
								it.onActivate();
							}}
						>
							<span className="flex flex-col gap-[2px]">
								<span className="text-[length:var(--density-text)] text-[var(--text-hi)]">
									{it.label}
								</span>
								{it.secondary ? (
									<span className="text-[12px] text-[var(--text-lo)]">
										→ {it.secondary}
									</span>
								) : null}
							</span>
							{it.shortcut ? (
								<kbd className="text-[11px] text-[var(--text-lo)] border border-[var(--border-default)] rounded-[var(--r1)] px-[4px] py-[1px]">
									{it.shortcut}
								</kbd>
							) : null}
						</button>
					))}
				</div>
			) : null}
		</div>
	);
}
