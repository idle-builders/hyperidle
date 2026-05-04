/**
 * L15 — TaskActionsMenu: a kebab affordance attached to each Kanban TaskCard.
 *
 * Replaces drag-to-move on the Team Board (L15 AC1-AC5). The menu has six
 * items: "Open thread" + five "Request: <state>" items. Selecting a request
 * posts a plain message to the task's thread (via task-thread-client).
 * Selecting "Open thread" find-or-creates the thread and navigates to the
 * existing /conversations/review?id=<threadId> route.
 *
 * @lore L15 mock-task-id seam: WorkTeam's INITIAL_TASKS use mock string IDs
 * (t1..t5) that don't exist as DB rows. The threads server route does NOT
 * enforce a foreign-key on host_id (routes/threads.ts:144-378), so the
 * find-or-create flow round-trips through real DB rows under those mock IDs.
 * When real task IDs land (post-L18), the seam disappears with no code
 * changes here.
 *
 * @lore L15 route shape: the plan's /conversations/<threadId> URL was
 * UNVERIFIED. The actual existing route is /conversations/review with the
 * thread id passed via ?id=<threadId> (see ConversationsReview.tsx:160 +
 * router.tsx:30). Builder verified this with a grep before wiring.
 *
 * @lore L15 review C4: the trigger button is a 44×44 hit area (AQ-015) with
 * a centered 24px glyph. Density-static allowlist does NOT exempt the
 * touch-target rule; only padding/font scaling.
 *
 * @lore L15 review W3: while a request is in-flight, the menu disables
 * actions and announces "Requested" via the live region BlockActionsPopover
 * already wires.
 */

import { BlockActionsPopover } from "@hyperidle/design-system";
import type { TaskState } from "@hyperidle/shared";
import { type JSX, useEffect, useId, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { createActorFetch } from "../hooks/actor-fetch";
import {
	buildRequestStateText,
	createTaskThreadClient,
	type TaskThreadClient,
	TaskThreadHttpError,
} from "../services/task-thread-client";

export interface TaskActionsMenuProps {
	readonly task: {
		readonly id: string;
		readonly title: string;
		readonly state: TaskState;
	};
	/**
	 * Optional client injection seam for unit tests. Production callers
	 * omit this and the default singleton is used.
	 */
	readonly client?: TaskThreadClient;
}

/**
 * The five user-requestable target states. Excludes `proposed`, `accepted`,
 * and `review` because those are agent-driven transitions on the Team Board.
 */
const REQUESTABLE_STATES: ReadonlyArray<TaskState> = [
	"in_progress",
	"blocked",
	"done",
	"hold",
	"killed",
] as const;

const STATE_LABELS: Record<TaskState, string> = {
	proposed: "Proposed",
	accepted: "Accepted",
	hold: "Hold",
	in_progress: "In progress",
	blocked: "Blocked",
	review: "Review",
	done: "Done",
	killed: "Kill",
};

// L15 review S4: lazy-singleton dropped — module-scope construction is fine.
const defaultClient: TaskThreadClient = createTaskThreadClient(createActorFetch());

function newClientKey(): string {
	return globalThis.crypto.randomUUID();
}

function errorMessageFor(cause: unknown, fallback: string): string {
	if (cause instanceof TaskThreadHttpError) return cause.userMessage;
	return fallback;
}

export function TaskActionsMenu(props: TaskActionsMenuProps): JSX.Element {
	const { task } = props;
	const client = props.client ?? defaultClient;
	const navigate = useNavigate();
	const popoverId = useId();
	const liveRegionId = useId();
	const [open, setOpen] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [pending, setPending] = useState(false);
	const containerRef = useRef<HTMLDivElement | null>(null);

	// L15 review W2: outside-click closes the menu (BlockActionsPopover only
	// handles Escape).
	useEffect(() => {
		if (!open) return;
		function onPointerDown(e: PointerEvent): void {
			const node = containerRef.current;
			if (node && e.target instanceof Node && !node.contains(e.target)) {
				setOpen(false);
			}
		}
		document.addEventListener("pointerdown", onPointerDown);
		return () => document.removeEventListener("pointerdown", onPointerDown);
	}, [open]);

	function runAction(args: {
		fallback: string;
		closeOnError: boolean;
		action: () => Promise<void>;
	}): void {
		if (pending) return;
		setError(null);
		setPending(true);
		void (async () => {
			try {
				await args.action();
			} catch (cause) {
				setError(errorMessageFor(cause, args.fallback));
				if (args.closeOnError) setOpen(false);
			} finally {
				setPending(false);
			}
		})();
	}

	const openThreadItem = {
		id: "open-thread",
		label: "Open thread",
		disabled: pending,
		onSelect: (): void => {
			runAction({
				fallback: "Failed to open thread.",
				closeOnError: false,
				action: async () => {
					const handle = await client.findOrCreateTaskThread(task.id);
					setOpen(false);
					navigate(`/conversations/review?id=${encodeURIComponent(handle.threadId)}`);
				},
			});
		},
	};

	const requestItems = REQUESTABLE_STATES.map((targetState) => ({
		id: `request-${targetState}`,
		label: `Request: ${STATE_LABELS[targetState]}`,
		disabled: pending || targetState === task.state,
		onSelect: (): void => {
			runAction({
				fallback: "Failed to post request.",
				closeOnError: false,
				action: async () => {
					const handle = await client.findOrCreateTaskThread(task.id);
					await client.postPlainMessage(
						handle.threadId,
						buildRequestStateText(targetState),
						newClientKey(),
					);
					setOpen(false);
				},
			});
		},
	}));

	const items = [openThreadItem, ...requestItems];

	return (
		<div ref={containerRef} className="relative inline-flex flex-col items-end">
			<button
				type="button"
				aria-label={`Actions for ${task.title}`}
				aria-haspopup="menu"
				aria-expanded={open}
				aria-controls={open ? popoverId : undefined}
				aria-busy={pending || undefined}
				onClick={() => {
					setError(null);
					setOpen((v) => !v);
				}}
				className="inline-flex items-center justify-center min-w-[44px] min-h-[44px] rounded-[var(--r1)] text-[var(--text-lo)] hover:text-[var(--text-hi)] hover:bg-[var(--surface-ghost)] focus-visible:outline focus-visible:outline-1 focus-visible:outline-[var(--primary)]"
			>
				<span aria-hidden className="inline-block w-[24px] h-[24px] leading-[24px] text-center">
					⋯
				</span>
			</button>
			<BlockActionsPopover
				id={popoverId}
				open={open}
				onClose={() => setOpen(false)}
				items={items}
				liveRegionId={liveRegionId}
			/>
			{error ? (
				<div role="alert" className="mt-[4px] text-[12px] text-[var(--danger)]">
					{error}
				</div>
			) : null}
		</div>
	);
}
