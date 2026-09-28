// @lore: PageScaffold scroll — AppShell main is overflow-hidden with no padding; use shrink-0 header + flex-1 overflow-y-auto body pattern

import {
	type EditTaskInput,
	TASK_OUTCOME_VERDICT_LABEL,
	TASK_STATE_LABEL,
	type Task,
	type TaskNode,
	type TaskState,
	type TaskView,
	taskInvariants,
} from "@hyperidle/domain-model";
import { type JSX, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link as RRLink, useNavigate, useParams } from "react-router-dom";
import { ChildDocumentsSection } from "../components/ChildDocumentsSection.js";
import type { OpenHandler, PartAuthor } from "../components/parts";
import { SessionView } from "../components/SessionView.js";
import { TaskDependencyField } from "../components/TaskDependencyField.js";
import {
	Breadcrumb,
	type BreadcrumbSegment,
	Button,
	Combobox,
	clickableProps,
	ErrorState,
	Input,
	LiveDot,
	PageFrame,
	PageHeader,
	PageScaffold,
	SectionLabel,
	Select,
	SplitView,
	StatusChip,
	taskStateToStatus,
} from "../ds/index.js";
import { useAgents } from "../hooks/useAgents.js";
import { useCurrentUser } from "../hooks/useCurrentUser.js";
import { useSessionActivity } from "../hooks/useSessionActivity.js";
import { useTaskSessions } from "../hooks/useTaskSessions.js";
import { useUiPreference } from "../hooks/useUiPreference.js";
import { useViewportBreakpoint } from "../hooks/useViewportBreakpoint.js";
import { call } from "../services/call.js";
import { createOpenHandler } from "../services/open-handler.js";
import { HostThreadSection } from "../shell/HostThreadSection.js";
import { NavHistoryCluster } from "../shell/NavHistoryCluster.js";

interface EditState {
	title: string;
	description: string;
	doneCondition: string;
	ownerAgentId: string;
	state: TaskState;
	dependencies: readonly string[];
}

function parseDependencies(dependencies: string | null): readonly string[] {
	if (!dependencies) return [];
	try {
		const parsed: unknown = JSON.parse(dependencies);
		return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === "string") : [];
	} catch {
		return [];
	}
}

function taskToEditState(task: Task): EditState {
	return {
		title: task.title,
		description: task.description ?? "",
		doneCondition: task.doneCondition ?? "",
		ownerAgentId: task.ownerAgentId ?? "",
		state: task.state,
		dependencies: parseDependencies(task.dependencies),
	};
}

function sameDependencySet(a: readonly string[], b: readonly string[]): boolean {
	if (a.length !== b.length) return false;
	const bSet = new Set(b);
	return a.every((id) => bSet.has(id));
}

const TASK_STATE_OPTIONS: { value: TaskState; label: string }[] = [
	{ value: "proposed", label: TASK_STATE_LABEL.proposed },
	{ value: "accepted", label: TASK_STATE_LABEL.accepted },
	{ value: "hold", label: TASK_STATE_LABEL.hold },
	{ value: "in_progress", label: TASK_STATE_LABEL.in_progress },
	{ value: "blocked", label: TASK_STATE_LABEL.blocked },
	{ value: "review", label: TASK_STATE_LABEL.review },
	{ value: "done", label: TASK_STATE_LABEL.done },
	{ value: "killed", label: TASK_STATE_LABEL.killed },
];

// 16×16 filled chevrons consistent with ds/Fold.tsx's icon style.
// Paths are vertical mirrors of ICON_FOLD from Fold.tsx.

const ICON_CHEVRON_UP = "M8 5.5L3.5 10l1 1L8 7.5 11.5 11l1-1L8 5.5z";
const ICON_CHEVRON_DOWN = "M8 10.5L3.5 6l1-1L8 8.5 11.5 5l1 1L8 10.5z";

function ChevronUpIcon(): JSX.Element {
	return (
		<svg
			viewBox="0 0 16 16"
			fill="currentColor"
			aria-hidden="true"
			style={{ width: 12, height: 12 }}
			className="shrink-0"
		>
			<path d={ICON_CHEVRON_UP} />
		</svg>
	);
}

function ChevronDownIcon(): JSX.Element {
	return (
		<svg
			viewBox="0 0 16 16"
			fill="currentColor"
			aria-hidden="true"
			style={{ width: 12, height: 12 }}
			className="shrink-0"
		>
			<path d={ICON_CHEVRON_DOWN} />
		</svg>
	);
}

function SubtaskTree({
	nodes,
	depth = 0,
	onReorder,
	resolveAgentName,
}: {
	nodes: readonly TaskNode[];
	depth?: number;
	onReorder?: (taskId: string, newPosition: number) => void;
	resolveAgentName?: (id: string) => string;
}): JSX.Element {
	if (nodes.length === 0) {
		return <p className="type-metadata text-[var(--text-tertiary)] py-[6px]">No subtasks yet.</p>;
	}
	return (
		<ul
			data-testid={depth === 0 ? "subtask-tree-root" : undefined}
			className="flex flex-col gap-[6px]"
			style={depth > 0 ? { paddingLeft: "18px" } : undefined}
		>
			{nodes.map((node, idx) => (
				<li key={node.id}>
					<SubtaskRow
						node={node}
						depth={depth}
						index={idx}
						totalSiblings={nodes.length}
						onReorder={onReorder}
						resolveAgentName={resolveAgentName}
					/>
				</li>
			))}
		</ul>
	);
}

function SubtaskRow({
	node,
	depth,
	index,
	totalSiblings,
	onReorder,
	resolveAgentName,
}: {
	node: TaskNode;
	depth: number;
	index: number;
	totalSiblings: number;
	onReorder?: (taskId: string, newPosition: number) => void;
	resolveAgentName?: (id: string) => string;
}): JSX.Element {
	const { children } = node;
	const task = node;
	const isFirst = index === 0;
	const isLast = index === totalSiblings - 1;

	return (
		<div
			data-testid="subtask-row"
			className="border-width-thin border-[var(--border-subtle)] bg-[var(--surface-elevated)] rounded-[var(--r-default)] p-[12px] flex flex-col gap-[6px]"
		>
			<div className="flex items-center gap-[9px]">
				<RRLink
					to={`/work/task/${encodeURIComponent(task.id)}`}
					className="type-copy text-[var(--text-primary)] hover:underline flex-1 min-w-0 truncate"
					data-testid={`subtask-link-${task.id}`}
				>
					{task.title}
				</RRLink>
				{task.state === "in_progress" && <LiveDot />}
				<StatusChip status={taskStateToStatus(task.state)} label={TASK_STATE_LABEL[task.state]} />
				{onReorder !== undefined && (
					<div className="flex items-center gap-[3px] shrink-0">
						<Button
							variant="ghost"
							tone="neutral"
							size="icon"
							aria-label="Move up"
							disabled={isFirst}
							onClick={() => {
								onReorder(task.id, index - 1);
							}}
							data-testid={`move-up-${task.id}`}
						>
							<ChevronUpIcon />
						</Button>
						<Button
							variant="ghost"
							size="icon"
							aria-label="Move down"
							disabled={isLast}
							onClick={() => {
								onReorder(task.id, index + 1);
							}}
							data-testid={`move-down-${task.id}`}
						>
							<ChevronDownIcon />
						</Button>
					</div>
				)}
			</div>
			{task.ownerAgentId && (
				<span className="type-metadata text-[var(--text-tertiary)]">
					{resolveAgentName ? resolveAgentName(task.ownerAgentId) : task.ownerAgentId}
				</span>
			)}
			{children.length > 0 && (
				<div className="mt-[6px]">
					<SubtaskTree
						nodes={children}
						depth={depth + 1}
						onReorder={onReorder}
						resolveAgentName={resolveAgentName}
					/>
				</div>
			)}
		</div>
	);
}

function SessionRow({
	id,
	title,
	agent,
	status,
	onOpen,
}: {
	id: string;
	title: string;
	agent: string;
	status: string;
	/** Opens the session in the page's split pane — the same `onOpenSession` door Conversations uses. */
	onOpen: (sessionId: string) => void;
}): JSX.Element {
	const isActive = status === "active";
	const isDone = status === "done" || status === "completed";
	return (
		<div
			key={id}
			data-testid="session-row"
			{...clickableProps(
				() => onOpen(id),
				"border-width-thin-b border-[var(--border-subtle)] flex items-center gap-[12px] py-[12px]",
			)}
		>
			<div className="flex-1 min-w-0">
				<div className="type-copy text-[var(--text-primary)] truncate">{title}</div>
				<div className="type-metadata text-[var(--text-tertiary)] truncate mt-[3px]">{agent}</div>
			</div>
			<div className="flex items-center gap-[6px] shrink-0">
				{isActive && <LiveDot />}
				<span className="type-metadata text-[var(--text-secondary)]">
					{isActive ? "Active" : isDone ? "Done" : status}
				</span>
			</div>
		</div>
	);
}

function TaskSessionPanel({
	sessionId,
	viewerId,
	viewerName,
	onClose,
	onOpen,
}: {
	sessionId: string;
	viewerId: string;
	viewerName: string;
	onClose: () => void;
	onOpen: OpenHandler;
}): JSX.Element {
	const { entries, status, summary } = useSessionActivity(sessionId);
	const agent: PartAuthor = summary?.agentId
		? { id: summary.agentId, name: summary.agentId, isAgent: true, isMe: false }
		: { id: "", name: "Agent", isAgent: true, isMe: false };
	const viewer: PartAuthor = { id: viewerId, name: viewerName, isAgent: false, isMe: true };

	return (
		<div className="relative flex h-full flex-col">
			<Button
				variant="ghost"
				size="icon"
				onClick={onClose}
				aria-label="Close session view"
				data-testid="close-session-view"
				className="absolute top-[9px] right-[12px] z-[1]"
			>
				<svg
					viewBox="0 0 12 12"
					className="h-[11px] w-[11px]"
					fill="none"
					stroke="currentColor"
					strokeWidth="1.5"
					aria-hidden="true"
				>
					<path d="M2 2 L10 10 M10 2 L2 10" strokeLinecap="round" />
				</svg>
			</Button>
			<SessionView
				sessionId={sessionId}
				entries={[...entries]}
				identity={{ agent, viewer, title: "Session", host: "" }}
				status={status}
				onOpen={onOpen}
				onSend={() => {
					// Task-page session view: sending is not supported here — the
					// task's own thread (Discussion, below) is where a person talks
					// to the agent.
				}}
			/>
		</div>
	);
}

interface UseOpenTaskResult {
	data: TaskView | null;
	loading: boolean;
	error: Error | null;
	refresh: () => void;
}

function useOpenTask(taskId: string | undefined): UseOpenTaskResult {
	const [refreshCounter, setRefreshCounter] = useState(0);
	const [state, setState] = useState<Omit<UseOpenTaskResult, "refresh">>({
		data: null,
		loading: taskId !== undefined,
		error: null,
	});

	// biome-ignore lint/correctness/useExhaustiveDependencies: refreshCounter triggers re-fetches on demand via refresh()
	useEffect(() => {
		if (!taskId) {
			setState({ data: null, loading: false, error: null });
			return;
		}
		let cancelled = false;
		setState({ data: null, loading: true, error: null });
		call("open_task", { id: taskId })
			.then((result) => {
				if (cancelled) return;
				if (!result.ok) {
					setState({
						data: null,
						loading: false,
						error: new Error(result.problems[0]?.message ?? "Failed to load task"),
					});
					return;
				}
				setState({ data: result.data, loading: false, error: null });
			})
			.catch((err: unknown) => {
				if (!cancelled) {
					setState({
						data: null,
						loading: false,
						error: err instanceof Error ? err : new Error(String(err)),
					});
				}
			});
		return (): void => {
			cancelled = true;
		};
	}, [taskId, refreshCounter]);

	const refresh = useCallback((): void => {
		setRefreshCounter((c) => c + 1);
	}, []);

	return { ...state, refresh };
}

type EditTaskStatus = "idle" | "saving" | "saved" | "error";

interface UseEditTaskResult {
	status: EditTaskStatus;
	errorMessage: string | null;
	edit: (input: EditTaskInput) => void;
}

function useEditTask(onSaved?: (view: TaskView) => void): UseEditTaskResult {
	const [status, setStatus] = useState<EditTaskStatus>("idle");
	const [errorMessage, setErrorMessage] = useState<string | null>(null);
	const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const unmountedRef = useRef(false);
	const onSavedRef = useRef(onSaved);

	useEffect(() => {
		onSavedRef.current = onSaved;
	}, [onSaved]);

	useEffect(() => {
		unmountedRef.current = false;
		return (): void => {
			unmountedRef.current = true;
			if (savedTimerRef.current !== null) clearTimeout(savedTimerRef.current);
		};
	}, []);

	const edit = useCallback((input: EditTaskInput): void => {
		if (unmountedRef.current) return;
		setStatus("saving");
		setErrorMessage(null);
		void call("edit_task", input).then((result) => {
			if (unmountedRef.current) return;
			if (!result.ok) {
				setErrorMessage(result.problems[0]?.message ?? null);
				setStatus("error");
				return;
			}
			setStatus("saved");
			onSavedRef.current?.(result.data);
			if (savedTimerRef.current !== null) clearTimeout(savedTimerRef.current);
			savedTimerRef.current = setTimeout(() => {
				if (!unmountedRef.current) setStatus("idle");
			}, 3000);
		});
	}, []);

	return { status, errorMessage, edit };
}

function EditPanel({ task, onSaved }: { task: Task; onSaved: () => void }): JSX.Element {
	const [fields, setFields] = useState<EditState>(() => taskToEditState(task));
	const { status, errorMessage, edit } = useEditTask(onSaved);
	const { agents } = useAgents();

	// "No owner" (id "") is always offered first — it is what "leave blank" saves.
	const ownerOptions = useMemo(
		() => [
			{ id: "", label: "No owner" },
			...agents.map((a) => ({ id: a.id, label: a.name, description: a.role })),
		],
		[agents],
	);

	useEffect(() => {
		setFields(taskToEditState(task));
	}, [task]);

	const isDirty =
		fields.title !== task.title ||
		fields.description !== (task.description ?? "") ||
		fields.doneCondition !== (task.doneCondition ?? "") ||
		fields.ownerAgentId !== (task.ownerAgentId ?? "") ||
		fields.state !== task.state ||
		!sameDependencySet(fields.dependencies, parseDependencies(task.dependencies));

	// The same pure check `edit_task.run` runs server-side, run here first so a
	// doomed edit (e.g. an illegal state transition) greys the button before the
	// round trip rather than only failing after it.
	const invariantProblems = useMemo(
		() =>
			taskInvariants(
				{
					...task,
					title: fields.title.trim() || task.title,
					description: fields.description.trim() || null,
					doneCondition: fields.doneCondition.trim() || null,
					ownerAgentId: fields.ownerAgentId.trim() || null,
					state: fields.state,
				},
				task,
			),
		[
			task,
			fields.title,
			fields.description,
			fields.doneCondition,
			fields.ownerAgentId,
			fields.state,
		],
	);

	const handleSubmit = useCallback((): void => {
		if (!isDirty || status === "saving" || invariantProblems.length > 0) return;
		edit({
			id: task.id,
			version: task.updatedAt,
			title: fields.title.trim() || task.title,
			description: fields.description.trim() || null,
			doneCondition: fields.doneCondition.trim() || null,
			ownerAgentId: fields.ownerAgentId.trim() || null,
			state: fields.state,
			dependencies: [...fields.dependencies],
		});
	}, [isDirty, status, invariantProblems, fields, task, edit]);

	const isSaving = status === "saving";

	return (
		<section data-testid="task-edit-panel" aria-label="Edit task">
			<SectionLabel label="Details" divider />
			<div className="flex flex-col gap-[18px] mt-[12px]">
				<div>
					<Input
						label="Title"
						value={fields.title}
						onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
							setFields((f) => ({ ...f, title: e.target.value }))
						}
						data-testid="task-title-input"
						disabled={isSaving}
					/>
				</div>
				<div>
					<Input
						label="Description"
						textarea
						value={fields.description}
						onChange={(e) => setFields((f) => ({ ...f, description: e.target.value }))}
						placeholder="Describe the task…"
						rows={4}
						data-testid="task-description-input"
						disabled={isSaving}
					/>
				</div>
				<div>
					<Input
						label="Goal (done when…)"
						textarea
						value={fields.doneCondition}
						onChange={(e) => setFields((f) => ({ ...f, doneCondition: e.target.value }))}
						placeholder="Describe the acceptance condition…"
						rows={2}
						data-testid="task-done-condition-input"
						disabled={isSaving}
					/>
				</div>
				<div>
					<Combobox
						id="task-owner-combobox"
						label="Owner agent"
						options={ownerOptions}
						value={fields.ownerAgentId}
						onChange={(ownerAgentId) => setFields((f) => ({ ...f, ownerAgentId }))}
						placeholder="No owner"
						listAriaLabel="Agents"
						inputAriaLabel="Filter agents"
						disabled={isSaving}
					/>
				</div>
				<TaskDependencyField
					dependencies={fields.dependencies}
					onChange={(dependencies) => setFields((f) => ({ ...f, dependencies }))}
					disabled={isSaving}
					currentTaskId={task.id}
				/>
				<div>
					<Select
						label="State"
						value={fields.state}
						options={TASK_STATE_OPTIONS}
						onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
							setFields((f) => ({ ...f, state: e.target.value as TaskState }))
						}
						data-testid="task-state-select"
						disabled={isSaving}
					/>
				</div>
				<div className="flex items-center gap-[12px]">
					<Button
						variant="primary"
						onClick={handleSubmit}
						disabled={!isDirty || isSaving || invariantProblems.length > 0}
						data-testid="task-save-btn"
					>
						{isSaving ? "Saving…" : "Save changes"}
					</Button>
					{status === "saved" && (
						<span
							className="type-metadata text-[var(--accent-primary)]"
							data-testid="task-save-confirmation"
						>
							Saved
						</span>
					)}
					{status === "idle" && invariantProblems.length > 0 && (
						<span
							className="type-metadata text-[var(--status-error)]"
							data-testid="task-invariant-error"
						>
							{invariantProblems[0]?.message}
						</span>
					)}
					{status === "error" && (
						<span
							className="type-metadata text-[var(--status-error)]"
							data-testid="task-save-error"
						>
							{/* Show the rejection's reason (e.g. a dependency cycle)
							    when the server sent one, instead of always the generic line. */}
							{errorMessage ?? "Save failed — try again"}
						</span>
					)}
				</div>
			</div>
		</section>
	);
}

export interface WorkTaskPageProps {
	overrideTaskId?: string;
}

export function WorkTaskPage({ overrideTaskId }: WorkTaskPageProps = {}): JSX.Element {
	const { taskId: routeTaskId } = useParams<{ taskId: string }>();
	const navigate = useNavigate();
	const { sidebarMobile } = useViewportBreakpoint();

	const taskId = overrideTaskId ?? routeTaskId;
	const { data, loading, error, refresh } = useOpenTask(taskId);
	const { data: sessionsData } = useTaskSessions(taskId);
	const { agents } = useAgents();
	const resolveAgentName = useMemo(() => {
		const map = new Map(agents.map((a) => [a.id, a.name]));
		return (id: string): string => map.get(id) ?? id;
	}, [agents]);

	const { user } = useCurrentUser();
	const [openSessionId, setOpenSessionId] = useState<string | null>(null);
	const [sessionRatio, setSessionRatio] = useUiPreference("task.session", 0.6);
	const openSessionTarget = createOpenHandler(navigate, { onOpenSession: setOpenSessionId });

	const { edit: editPosition } = useEditTask(refresh);
	const onReorder = useCallback(
		(reorderTaskId: string, newPosition: number): void => {
			editPosition({ id: reorderTaskId, position: newPosition });
		},
		[editPosition],
	);

	if (loading) {
		return (
			<PageScaffold
				frame="page"
				data-testid="task-page-loading"
				header={
					<PageHeader
						title="Task"
						subtitle={<span className="skeleton block h-[13px] w-[240px]" />}
					/>
				}
			>
				<div role="status" aria-busy="true" className="p-[24px]">
					<div className="skeleton h-[120px] w-full rounded-[var(--r-default)]" />
				</div>
			</PageScaffold>
		);
	}

	if (error) {
		return (
			<PageScaffold frame="page" header={<PageHeader title="Task" />} data-testid="task-page-error">
				<div role="alert" className="p-[24px]">
					<ErrorState
						title="Failed to load task"
						description={error.message}
						onRetry={refresh}
						dataTestId="task-error-state"
					/>
				</div>
			</PageScaffold>
		);
	}

	if (!data) {
		return (
			<PageScaffold
				frame="page"
				header={<PageHeader title="Task" />}
				data-testid="task-page-not-found"
			>
				<div className="p-[24px]">
					<p className="type-small text-[var(--text-secondary)]">Task not found.</p>
				</div>
			</PageScaffold>
		);
	}

	const { task, ancestors, children } = data;
	const sessions = sessionsData?.sessions ?? [];
	const activeSessions = sessions.filter((s) => s.status === "active");
	const completedSessions = sessions.filter((s) => s.status === "done" || s.status === "completed");

	const breadcrumbSegments: readonly [BreadcrumbSegment, ...BreadcrumbSegment[]] = [
		{ label: "Work", to: "/work" },
		...ancestors.map((a) => ({ label: a.title, to: `/work/task/${encodeURIComponent(a.id)}` })),
		{ label: task.title },
	];

	return (
		<PageScaffold
			body="managed"
			data-testid="task-detail-page"
			header={
				<PageHeader
					title={task.title}
					leading={
						<div data-testid="task-breadcrumb">
							<Breadcrumb
								segments={breadcrumbSegments}
								leading={
									!sidebarMobile ? (
										<NavHistoryCluster onBack={() => navigate(-1)} onForward={() => navigate(1)} />
									) : undefined
								}
								LinkComponent={RRLink}
							/>
						</div>
					}
					actions={
						<div className="flex items-center gap-[6px]">
							{task.state === "in_progress" && <LiveDot />}
							<StatusChip
								status={taskStateToStatus(task.state)}
								label={TASK_STATE_LABEL[task.state]}
							/>
						</div>
					}
				/>
			}
		>
			<SplitView
				compact={sidebarMobile}
				originLabel="task"
				surfaceKey="task.session"
				mode={openSessionId ? "split" : "fold-back"}
				dividerRatio={sessionRatio}
				onRatioChange={setSessionRatio}
				onModeChange={(mode) => {
					if (mode === "fold-back") setOpenSessionId(null);
				}}
				origin={
					<PageFrame>
						<div
							data-testid="task-detail-body"
							className="flex flex-col gap-[24px] max-w-[800px] w-full py-[24px] box-border"
						>
							<div
								data-testid="task-meta-strip"
								className="border-width-thin bg-[var(--surface-page)] rounded-[var(--r-default)] border-[var(--border-subtle)] flex overflow-hidden"
							>
								<div className="border-width-thin-r flex flex-col gap-[3px] px-[18px] py-[12px] flex-1 min-w-[100px] border-[var(--border-subtle)]">
									<span className="type-label uppercase text-[var(--text-tertiary)]">Owner</span>
									<span className="type-small text-[var(--text-primary)]">
										{task.ownerAgentId ? resolveAgentName(task.ownerAgentId) : "Unassigned"}
									</span>
								</div>
								<div className="border-width-thin-r flex flex-col gap-[3px] px-[18px] py-[12px] flex-1 min-w-[100px] border-[var(--border-subtle)]">
									<span className="type-label uppercase text-[var(--text-tertiary)]">Status</span>
									<div className="flex items-center gap-[6px] mt-[3px]">
										{task.state === "in_progress" && <LiveDot />}
										<StatusChip
											status={taskStateToStatus(task.state)}
											label={TASK_STATE_LABEL[task.state]}
										/>
									</div>
								</div>
								<div className="border-width-thin-r flex flex-col gap-[3px] px-[18px] py-[12px] flex-1 min-w-[100px] border-[var(--border-subtle)]">
									<span className="type-label uppercase text-[var(--text-tertiary)]">Depth</span>
									<span className="type-small text-[var(--text-primary)]">
										{ancestors.length === 0 ? "Root task" : `Level ${ancestors.length}`}
									</span>
								</div>
								<div className="flex flex-col gap-[3px] px-[18px] py-[12px] flex-1 min-w-[100px]">
									<span className="type-label uppercase text-[var(--text-tertiary)]">Sessions</span>
									<span
										data-testid="task-session-count"
										className="type-small text-[var(--text-primary)]"
									>
										{activeSessions.length} active / {completedSessions.length} completed
									</span>
								</div>
							</div>

							{/* Outcome verdict — shown when the task has been evaluated */}
							{task.outcomeVerdict && (
								<div
									data-testid="task-outcome-block"
									className="border-width-thin border-[var(--border-subtle)] bg-[var(--surface-page)] rounded-[var(--r-default)] px-[18px] py-[12px] flex flex-col gap-[6px]"
								>
									<div className="flex items-center gap-[9px]">
										<span className="type-label uppercase text-[var(--text-tertiary)]">
											Outcome
										</span>
										<span
											data-testid="task-outcome-verdict"
											className="type-small text-[var(--text-primary)]"
										>
											{TASK_OUTCOME_VERDICT_LABEL[task.outcomeVerdict]}
										</span>
									</div>
									{task.outcomeSummary && (
										<p
											data-testid="task-outcome-summary"
											className="type-copy text-[var(--text-secondary)]"
										>
											{task.outcomeSummary}
										</p>
									)}
								</div>
							)}

							{/* Edit panel */}
							<EditPanel task={task} onSaved={refresh} />

							<section data-testid="task-subtasks-section">
								<div className="flex items-center justify-between">
									<SectionLabel label="Subtasks" divider />
									<Button
										variant="secondary"
										size="sm"
										onClick={() =>
											navigate(`/work/task/new?parentTaskId=${encodeURIComponent(task.id)}`)
										}
										data-testid="add-subtask-btn"
									>
										+ Add subtask
									</Button>
								</div>
								<div className="mt-[12px]">
									<SubtaskTree
										nodes={children}
										onReorder={onReorder}
										resolveAgentName={resolveAgentName}
									/>
								</div>
							</section>

							<section data-testid="task-sessions-section">
								<SectionLabel label="Sessions" divider />
								{sessions.length === 0 ? (
									<p className="type-metadata text-[var(--text-tertiary)]">No sessions yet.</p>
								) : (
									<div className="flex flex-col">
										{sessions.map((s) => (
											<SessionRow
												key={s.id}
												id={s.id}
												title={s.title}
												agent={s.agent}
												status={s.status}
												onOpen={(sessionId) => openSessionTarget({ route: "session", sessionId })}
											/>
										))}
									</div>
								)}
							</section>

							{/* Documents parented to this task */}
							<ChildDocumentsSection
								parentKind="task"
								parentId={taskId ?? ""}
								heading="Documents"
								emptyDescription="Documents will appear here once agents produce output for this task."
							/>

							<section aria-label="Discussion">
								<SectionLabel label="Discussion" divider />
								<HostThreadSection threadId={task.threadId} inline />
							</section>
						</div>
					</PageFrame>
				}
				destination={
					openSessionId ? (
						<TaskSessionPanel
							sessionId={openSessionId}
							viewerId={user?.id ?? ""}
							viewerName={user?.name ?? user?.id ?? ""}
							onClose={() => setOpenSessionId(null)}
							onOpen={openSessionTarget}
						/>
					) : (
						<div />
					)
				}
			/>
		</PageScaffold>
	);
}
