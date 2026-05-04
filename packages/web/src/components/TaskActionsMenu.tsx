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
 */

import { BlockActionsPopover } from "@hyperidle/design-system";
import type { TaskState } from "@hyperidle/shared";
import { type JSX, useId, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
	buildRequestStateText,
	createTaskThreadClient,
	type TaskThreadClient,
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

let defaultClient: TaskThreadClient | null = null;
function getDefaultClient(): TaskThreadClient {
	if (defaultClient === null) {
		defaultClient = createTaskThreadClient(globalThis.fetch.bind(globalThis));
	}
	return defaultClient;
}

function newClientKey(): string {
	// crypto.randomUUID is widely available in evergreen browsers and Node 19+.
	return globalThis.crypto.randomUUID();
}

export function TaskActionsMenu(props: TaskActionsMenuProps): JSX.Element {
	const { task } = props;
	const client = props.client ?? getDefaultClient();
	const navigate = useNavigate();
	const popoverId = useId();
	const liveRegionId = useId();
	const [open, setOpen] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const containerRef = useRef<HTMLDivElement | null>(null);

	const items = useMemo(() => {
		const openThread = {
			id: "open-thread",
			label: "Open thread",
			onSelect: (): void => {
				setError(null);
				setOpen(false);
				void (async () => {
					try {
						const handle = await client.findOrCreateTaskThread(task.id);
						navigate(`/conversations/review?id=${encodeURIComponent(handle.threadId)}`);
					} catch (cause) {
						setError(cause instanceof Error ? cause.message : "Failed to open thread");
						setOpen(true);
					}
				})();
			},
		};
		const requestItems = REQUESTABLE_STATES.map((targetState) => ({
			id: `request-${targetState}`,
			label: `Request: ${STATE_LABELS[targetState]}`,
			disabled: targetState === task.state,
			onSelect: (): void => {
				setError(null);
				void (async () => {
					try {
						const handle = await client.findOrCreateTaskThread(task.id);
						await client.postPlainMessage(
							handle.threadId,
							buildRequestStateText(targetState),
							newClientKey(),
						);
						setOpen(false);
					} catch (cause) {
						setError(cause instanceof Error ? cause.message : "Failed to post request");
					}
				})();
			},
		}));
		return [openThread, ...requestItems];
	}, [client, navigate, task.id, task.state]);

	return (
		<div ref={containerRef} className="relative inline-flex flex-col items-end">
			<button
				type="button"
				aria-label={`Actions for ${task.title}`}
				aria-haspopup="menu"
				aria-expanded={open}
				aria-controls={popoverId}
				onClick={() => {
					setError(null);
					setOpen((v) => !v);
				}}
				className="inline-flex items-center justify-center w-[24px] h-[24px] rounded-[var(--r1)] text-[var(--text-lo)] hover:text-[var(--text-hi)] hover:bg-[var(--surface-ghost)] focus-visible:outline focus-visible:outline-1 focus-visible:outline-[var(--primary)]"
			>
				<span aria-hidden>⋯</span>
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
					Request failed: {error}
				</div>
			) : null}
		</div>
	);
}
