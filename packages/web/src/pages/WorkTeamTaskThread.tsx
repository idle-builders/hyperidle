/**
 * WorkTeamTaskThread — L15.
 *
 * Mounted at `/work/team/tasks/:taskId/thread`. Looks up the L1 thread for
 * the given task (`host_kind=task`) and mounts <ThreadShell>. When no thread
 * exists yet, renders an EmptyState explaining that a request creates the
 * thread.
 *
 * @lore L15: parallels the ConversationsReview fetch+decode+ThreadShell
 * pattern, but for `host_kind=task` threads. The two surfaces are kept
 * distinct because review-grammar (verdict UX, ArtifactView slot) does not
 * apply to `plain`-message task chats — see plan §10 design-it-twice.
 *
 * @lore L15 review (apply D / Security MUST-1): this page is read-only.
 * The `<TaskRequestPopover>` on the Kanban card is the L15 write surface;
 * the thread page only renders what the server returns. ThreadShell is
 * mounted with `readOnly` so the Composer is hidden — previously a no-op
 * `onAppendMessage` left the composer mounted and silently swallowed any
 * text the user typed.
 */
import { EmptyState, ErrorState, SkeletonList, ThreadShell } from "@hyperidle/design-system";
import { type JSX, useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { decodeThreadDetail, type ThreadDetail } from "../lib/thread-detail";

type LoadState =
	| { kind: "loading" }
	| { kind: "error"; message: string }
	| { kind: "empty" }
	| { kind: "loaded"; detail: ThreadDetail };

const noopAppend = async (): Promise<void> => {
	// Defensive — never invoked because `readOnly` hides the Composer.
};

export function WorkTeamTaskThread(): JSX.Element {
	const params = useParams<{ taskId: string }>();
	const taskId = params.taskId ?? "";
	const [state, setState] = useState<LoadState>({ kind: "loading" });

	useEffect(() => {
		if (!taskId) {
			setState({ kind: "empty" });
			return;
		}
		const ac = new AbortController();
		(async (): Promise<void> => {
			try {
				const listRes = await fetch(
					`/api/threads?host_kind=task&host_id=${encodeURIComponent(taskId)}`,
					{ signal: ac.signal },
				);
				if (ac.signal.aborted) return;
				if (!listRes.ok) {
					setState({ kind: "error", message: `HTTP ${listRes.status}` });
					return;
				}
				const list = (await listRes.json()) as { threads: Array<{ id: string }> };
				const first = list.threads?.[0];
				if (!first) {
					setState({ kind: "empty" });
					return;
				}
				const detailRes = await fetch(`/api/threads/${first.id}`, { signal: ac.signal });
				if (ac.signal.aborted) return;
				if (!detailRes.ok) {
					setState({ kind: "error", message: `HTTP ${detailRes.status}` });
					return;
				}
				const detail = decodeThreadDetail(await detailRes.json());
				if (ac.signal.aborted) return;
				setState({ kind: "loaded", detail });
			} catch (cause) {
				if (ac.signal.aborted) return;
				if (cause instanceof Error && cause.name === "AbortError") return;
				setState({
					kind: "error",
					message: cause instanceof Error ? cause.message : "Network error",
				});
			}
		})();
		return () => ac.abort();
	}, [taskId]);

	if (state.kind === "loading") {
		return (
			<div className="flex flex-col gap-3 h-full" data-testid="work-team-task-thread-page">
				<SkeletonList rows={3} ariaLabel="Loading thread" />
			</div>
		);
	}
	if (state.kind === "error") {
		return (
			<div className="flex flex-col gap-3 h-full" data-testid="work-team-task-thread-page">
				<ErrorState title="Failed to load thread" description={state.message} />
			</div>
		);
	}
	if (state.kind === "empty") {
		return (
			<div className="flex flex-col h-full" data-testid="work-team-task-thread-page">
				<EmptyState title="No thread yet" description="Send a request to start one." />
			</div>
		);
	}
	return (
		<div className="flex flex-col h-full" data-testid="work-team-task-thread-page">
			<ThreadShell
				thread={state.detail.thread}
				messages={state.detail.messages}
				identities={state.detail.identities}
				onAppendMessage={noopAppend}
				readOnly
			/>
		</div>
	);
}
