/**
 * WorkTaskPage — recursive task detail page.
 *
 * Route: /work/task/:taskId
 *
 * One page for any task at any depth. Replaces both WorkBet and WorkTask.
 * Calls `open_task` to get the task, its ancestors (root-first for the
 * breadcrumb), and its nested subtree.
 *
 * The edit surface is the point: title, description, doneCondition,
 * ownerAgentId and state are all editable via `edit_task` with no role gate
 * or approval step (AC7 / AC10).
 *
 * @lore BB1: bets are gone; root tasks (parentTaskId === null) are the top
 * of the work tree. The breadcrumb is built from ancestors, not from a fixed
 * two-level [Work / Team / Bet / Task] structure.
 *
 * @lore BB1: AppShell <main> is overflow-hidden with no padding, so this page
 * uses the fixed shrink-0 header + flex-1 overflow-y-auto body pattern from
 * the existing WorkTask, WorkBet, and KnowledgeDetail pages.
 *
 * @lore the architecture doc: `taskInvariants` runs client-side here to grey
 * the Save button on a doomed edit (e.g. an illegal state transition) before
 * the round trip, not just after — the same pure function `edit_task.run`
 * runs server-side as its first pass.
 */

import {
	type EditTaskInput,
	type Task,
	TASK_STATE_LABEL,
	type TaskNode,
	type TaskState,
	type TaskView,
	taskInvariants,
} from "@hyperidle/domain-model";
import { type JSX, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link as RRLink, useNavigate, useParams } from "react-router-dom";
import { ArtifactSection } from "../components/ArtifactSection.js";
import { TaskDependencyField } from "../components/TaskDependencyField.js";
import {
	Breadcrumb,
	type BreadcrumbSegment,
	Button,
	Combobox,
	ErrorState,
	Input,
	LiveDot,
	PageHeader,
	PageScaffold,
	SectionLabel,
	Select,
	StatusChip,
	taskStateToStatus,
} from "../ds/index.js";
import { useAgents } from "../hooks/useAgents.js";
import { useTaskSessions } from "../hooks/useTaskSessions.js";
import { useViewportBreakpoint } from "../hooks/useViewportBreakpoint.js";
import { call } from "../services/call.js";
import { HostThreadSection } from "../shell/HostThreadSection.js";
import { NavHistoryCluster } from "../shell/NavHistoryCluster.js";

// ── Editable field state ────────────────────────────────────────────────────

interface EditState {
	title: string;
	description: string;
	doneCondition: string;
	ownerAgentId: string;
	state: TaskState;
	dependencies: readonly string[];
}

/** `Task.dependencies` is the column's raw JSON-text; malformed/absent reads as none. */
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

/** Same-set comparison, order-insensitive — the field re-adds/removes freely. */
function sameDependencySet(a: readonly string[], b: readonly string[]): boolean {
	if (a.length !== b.length) return false;
	const bSet = new Set(b);
	return a.every((id) => bSet.has(id));
}

// ── Task state select options ───────────────────────────────────────────────

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

// ── Reorder arrow icons ─────────────────────────────────────────────────────
//
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

// ── Recursive subtask tree ──────────────────────────────────────────────────

/**
 * Renders a recursive list of subtask nodes at any depth.
 * Each leaf can expand further via the Add subtask affordance.
 *
 * @param onReorder - callback to PATCH position for a task within its sibling
 *   list. Receives the task id and the target position (0-indexed). When
 *   provided, each row shows move-up / move-down controls disabled at the
 *   boundary siblings. Works at every depth — grandchildren reorder within
 *   their own sibling list, not their parent's.
 */
function SubtaskTree({
	nodes,
	depth = 0,
	onReorder,
}: {
	nodes: readonly TaskNode[];
	depth?: number;
	onReorder?: (taskId: string, newPosition: number) => void;
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
}: {
	node: TaskNode;
	depth: number;
	index: number;
	totalSiblings: number;
	onReorder?: (taskId: string, newPosition: number) => void;
}): JSX.Element {
	// @lore BB1: the node IS the task, with `children` alongside — the tree
	// endpoint flattens each row rather than wrapping it in `{ task, children }`.
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
				{/* Reorder controls — only rendered when a reorder handler is wired */}
				{onReorder !== undefined && (
					<div className="flex items-center gap-[3px] shrink-0">
						<Button
							variant="ghost"
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
				<span className="type-metadata text-[var(--text-tertiary)]">{task.ownerAgentId}</span>
			)}
			{/* Recursively render grandchildren — pass onReorder so any depth works */}
			{children.length > 0 && (
				<div className="mt-[6px]">
					<SubtaskTree nodes={children} depth={depth + 1} onReorder={onReorder} />
				</div>
			)}
		</div>
	);
}

// ── Session row ─────────────────────────────────────────────────────────────

function SessionRow({
	id,
	title,
	agent,
	status,
	effectivenessScore,
}: {
	id: string;
	title: string;
	agent: string;
	status: string;
	effectivenessScore?: number | null;
}): JSX.Element {
	const isActive = status === "active";
	const isDone = status === "done" || status === "completed";
	return (
		<div
			key={id}
			data-testid="session-row"
			className="border-width-thin-b border-[var(--border-subtle)] flex items-center gap-[12px] py-[12px]"
		>
			<div className="flex-1 min-w-0">
				<div className="type-copy text-[var(--text-primary)] truncate">{title}</div>
				<div className="type-metadata text-[var(--text-tertiary)] truncate mt-[3px]">{agent}</div>
			</div>
			{effectivenessScore !== null && effectivenessScore !== undefined && (
				// biome-ignore lint/a11y/useAriaPropsSupportedByRole: span receives aria-label for assistive text
				<span
					data-testid="session-effectiveness-score"
					className="type-data tabular-nums text-[var(--text-secondary)] shrink-0 flex items-center gap-[3px]"
					aria-label={`Effectiveness: ${effectivenessScore.toFixed(2)}`}
				>
					<span className="type-metadata text-[var(--text-tertiary)]">Effectiveness</span>
					{effectivenessScore.toFixed(2)}
				</span>
			)}
			<div className="flex items-center gap-[6px] shrink-0">
				{isActive && <LiveDot />}
				<span className="type-metadata text-[var(--text-secondary)]">
					{isActive ? "Active" : isDone ? "Done" : status}
				</span>
			</div>
		</div>
	);
}

// ── open_task / edit_task doors ─────────────────────────────────────────────

interface UseOpenTaskResult {
	data: TaskView | null;
	loading: boolean;
	error: Error | null;
	refresh: () => void;
}

/** Replaces `useTaskTree` — same {data, loading, error, refresh} shape, over `open_task`. */
function useOpenTask(taskId: string | undefined): UseOpenTaskResult {
	const [refreshCounter, setRefreshCounter] = useState(0);
	const [state, setState] = useState<Omit<UseOpenTaskResult, "refresh">>({
		data: null,
		loading: taskId !== undefined,
		error: null,
	});

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
	/** `id` and `version` are the caller's job — this just issues the call and tracks status. */
	edit: (input: EditTaskInput) => void;
}

/** Replaces `useTaskPatch` — same status machine, issuing `edit_task` instead of PATCH. */
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

// ── Edit panel ──────────────────────────────────────────────────────────────

/**
 * EditPanel renders the editable task fields and issues `edit_task` on submit.
 * Title, description, goal, owner, and state are all editable — no approval
 * step, no role gate (AC7).
 */
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

	// When the task prop changes (e.g. after a refresh), re-sync the form
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
		[task, fields.title, fields.description, fields.doneCondition, fields.ownerAgentId, fields.state],
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
				{/* Title */}
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
				{/* Description */}
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
				{/* Goal / done condition */}
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
				{/* Owner */}
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
				{/* Dependencies */}
				<TaskDependencyField
					dependencies={fields.dependencies}
					onChange={(dependencies) => setFields((f) => ({ ...f, dependencies }))}
					disabled={isSaving}
					currentTaskId={task.id}
				/>
				{/* State */}
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
				{/* Save controls */}
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
							{/* AC5: show the rejection's reason (e.g. a dependency cycle)
							    when the server sent one, instead of always the generic line. */}
							{errorMessage ?? "Save failed — try again"}
						</span>
					)}
				</div>
			</div>
		</section>
	);
}

// ── Main page ───────────────────────────────────────────────────────────────

export interface WorkTaskPageProps {
	/** Override task ID from route params — used by tests outside the router. */
	overrideTaskId?: string;
}

export function WorkTaskPage({ overrideTaskId }: WorkTaskPageProps = {}): JSX.Element {
	const { taskId: routeTaskId } = useParams<{ taskId: string }>();
	const navigate = useNavigate();
	const { sidebarMobile } = useViewportBreakpoint();

	const taskId = overrideTaskId ?? routeTaskId;
	const { data, loading, error, refresh } = useOpenTask(taskId);
	const { data: sessionsData } = useTaskSessions(taskId);

	// Position reordering — `edit_task` with { id, position } then re-read the
	// subtree so the order the user sees matches what the server stored.
	// @lore BB1: useEditTask(refresh) wires the onSaved callback so the tree
	// re-fetches after every successful edit. The re-fetch is what keeps
	// server order authoritative — never an optimistic local swap.
	const { edit: editPosition } = useEditTask(refresh);
	const onReorder = useCallback(
		(reorderTaskId: string, newPosition: number): void => {
			editPosition({ id: reorderTaskId, position: newPosition });
		},
		[editPosition],
	);

	// ── Loading ────────────────────────────────────────────────────────────

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

	// ── Error ──────────────────────────────────────────────────────────────

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

	// ── Not found ──────────────────────────────────────────────────────────

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

	// Build breadcrumb from ancestors root-first + the current task as the
	// non-linked final segment. ancestors[0] is the root task.
	// @lore BB1: typed as a NON-EMPTY tuple, which is what `Breadcrumb` asks for.
	// This was `Array<…>` plus an `as unknown as` cast at the call site — a
	// double assertion that launders the value past the type checker (and that
	// `design/no-unknown-cast` rightly rejects). The array is non-empty by
	// construction: the "Work" root and the current task always exist, and the
	// ancestors spread in between. Saying so in the type costs nothing and means
	// the compiler checks the shape instead of being told to trust it.
	const breadcrumbSegments: readonly [BreadcrumbSegment, ...BreadcrumbSegment[]] = [
		{ label: "Work", to: "/work" },
		...ancestors.map((a) => ({ label: a.title, to: `/work/task/${encodeURIComponent(a.id)}` })),
		{ label: task.title },
	];

	return (
		<PageScaffold
			frame="page"
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
			<div
				data-testid="task-detail-body"
				className="flex flex-col gap-[24px] max-w-[800px] w-full py-[24px] box-border"
			>
				{/* Metadata strip */}
				<div
					data-testid="task-meta-strip"
					className="border-width-thin bg-[var(--surface-page)] rounded-[var(--r-default)] border-[var(--border-subtle)] flex overflow-hidden"
				>
					{/* Owner */}
					<div className="border-width-thin-r flex flex-col gap-[3px] px-[18px] py-[12px] flex-1 min-w-[100px] border-[var(--border-subtle)]">
						<span className="type-label uppercase text-[var(--text-tertiary)]">Owner</span>
						<span className="type-small text-[var(--text-primary)]">
							{task.ownerAgentId ?? "Unassigned"}
						</span>
					</div>
					{/* Status */}
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
					{/* Depth / parent */}
					<div className="border-width-thin-r flex flex-col gap-[3px] px-[18px] py-[12px] flex-1 min-w-[100px] border-[var(--border-subtle)]">
						<span className="type-label uppercase text-[var(--text-tertiary)]">Depth</span>
						<span className="type-small text-[var(--text-primary)]">
							{ancestors.length === 0 ? "Root task" : `Level ${ancestors.length}`}
						</span>
					</div>
					{/* Sessions */}
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

				{/* Edit panel */}
				<EditPanel task={task} onSaved={refresh} />

				{/* Subtasks */}
				<section data-testid="task-subtasks-section">
					<div className="flex items-center justify-between">
						<SectionLabel label="Subtasks" divider />
						<Button
							variant="secondary"
							size="sm"
							onClick={() => navigate(`/work/task/new?parentTaskId=${encodeURIComponent(task.id)}`)}
							data-testid="add-subtask-btn"
						>
							+ Add subtask
						</Button>
					</div>
					<div className="mt-[12px]">
						<SubtaskTree nodes={children} onReorder={onReorder} />
					</div>
				</section>

				{/* Sessions */}
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
									effectivenessScore={s.effectivenessScore}
								/>
							))}
						</div>
					)}
				</section>

				{/* Artifacts — knowledge items parented to this task (AC4) */}
				<ArtifactSection
					parentKind="task"
					parentId={taskId ?? ""}
					heading="Artifacts"
					emptyDescription="Artifacts will appear here once agents produce output for this task."
				/>

				{/* Discussion */}
				<section aria-label="Discussion">
					<SectionLabel label="Discussion" divider />
					<HostThreadSection hostKind="task" hostId={taskId ?? ""} inline />
				</section>
			</div>
		</PageScaffold>
	);
}
