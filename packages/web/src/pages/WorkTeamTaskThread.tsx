/**
 * @lore L15: placeholder thread page for a task. L18 will replace the body
 * but the route `/work/team/task/:taskId/thread` and filename are stable.
 * Lazy-creates the thread on first visit if none exists.
 */
import type { Message, Thread } from "@hyperidle/shared";
import { type JSX, useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { ensureTaskThread } from "../shell/ensureTaskThread";

interface ThreadDetailResponse {
	thread: Thread;
	messages: Message[];
}

type LoadError = "network" | "validation" | "forbidden" | "server";

const ERROR_COPY: Record<LoadError, string> = {
	network: "We couldn't reach the server. Check your connection and retry.",
	validation: "This task's thread couldn't be opened (invalid request).",
	forbidden: "You don't have permission to view this thread.",
	server: "Something went wrong on our side. Please retry shortly.",
};

export function WorkTeamTaskThread(): JSX.Element {
	const params = useParams<{ taskId: string }>();
	const taskId = params.taskId ?? "";
	const [detail, setDetail] = useState<ThreadDetailResponse | null>(null);
	const [error, setError] = useState<LoadError | null>(null);

	useEffect(() => {
		let cancelled = false;
		async function load(): Promise<void> {
			if (!taskId) return;
			const ensured = await ensureTaskThread(taskId);
			if (!ensured.ok) {
				if (!cancelled) setError(ensured.reason);
				return;
			}
			try {
				const resp = await fetch(`/api/threads/${ensured.threadId}`);
				if (!resp.ok) {
					if (!cancelled) setError(resp.status >= 500 ? "server" : "validation");
					return;
				}
				const json = (await resp.json()) as ThreadDetailResponse;
				if (!cancelled) setDetail(json);
			} catch {
				if (!cancelled) setError("network");
			}
		}
		void load();
		return () => {
			cancelled = true;
		};
	}, [taskId]);

	return (
		<div data-testid="work-team-task-thread" className="flex flex-col gap-2 h-full">
			<h1 className="text-sm font-heading font-semibold uppercase tracking-wider text-[var(--text-lo)]">
				Task {taskId} thread
			</h1>
			{error !== null && (
				<div className="text-[var(--danger)]">{ERROR_COPY[error]}</div>
			)}
			{detail !== null && (
				<div className="text-[var(--text-lo)]">
					Thread {detail.thread.id} — {detail.messages.length} messages
				</div>
			)}
		</div>
	);
}
