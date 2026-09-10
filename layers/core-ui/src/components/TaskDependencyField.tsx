/**
 * TaskDependencyField — set and see a task's dependencies.
 *
 * BA6: the write door (`POST /tasks`, `PATCH /tasks/:id`) already validates
 * `dependencies` and parks the task while any named one is unfinished; this
 * is the one control that reaches it from a human surface. Shared between
 * `WorkTaskCreate` and `WorkTaskPage`'s edit panel — the two surfaces the
 * plan names.
 *
 * @lore BA6 (rejected-round fix): the maintainer rejected the first cut of
 * this field — "searching a task should be possible" — over a paste-a-raw-id
 * input whose chip then displayed the UUID. The search door it now reaches,
 * `GET /api/tasks?q=<query>` (`useTaskSearch`), already existed; the earlier
 * `@lore` claiming "no task-search endpoint" was wrong. Existing dependency
 * ids (the edit surface loads them bare) resolve to titles via the bulk
 * lookup door, `GET /api/tasks?ids=a,b,c` (`useTaskLookup`) — both reused,
 * neither a new endpoint.
 *
 * @lore BA6: `ReferenceChip` (not forked) renders each picked dependency.
 * Extended with `disabled` (real `disabled` attribute on both its buttons —
 * the old version only dropped the `onRemove` handler, leaving a focusable
 * control that silently no-op'd) and `removeTestId` (so a testid targets the
 * chip's own remove button, not an inert wrapping `<li>`). `mode="draft"`'s
 * open body is a plain span here (no `onOpen` passed) — this field lists
 * references, it doesn't drill into them, so draft mode no longer ships a
 * dead "Open <label>" button when a caller has nothing to open.
 */

import { type JSX, useMemo, useState } from "react";
import { ReferenceChip, SearchField } from "../ds/index.js";
import { useTaskLookup } from "../hooks/useTaskLookup.js";
import { type TaskSearchResult, useTaskSearch } from "../hooks/useTaskSearch.js";

export interface TaskDependencyFieldProps {
	dependencies: readonly string[];
	onChange: (dependencies: readonly string[]) => void;
	disabled?: boolean;
	/** The task being edited — excluded from search results (no self-dependency). Undefined on the create surface, where there is no task yet. */
	currentTaskId?: string;
}

export function TaskDependencyField({
	dependencies,
	onChange,
	disabled = false,
	currentTaskId,
}: TaskDependencyFieldProps): JSX.Element {
	const [query, setQuery] = useState("");
	// Freshly-picked titles are known instantly from the search result that
	// picked them; pre-existing (id-only) dependencies resolve via the bulk
	// lookup door. Picked wins on overlap — it is never stale.
	const [pickedTitles, setPickedTitles] = useState<Readonly<Record<string, string>>>({});
	const lookedUpTitles = useTaskLookup(dependencies);

	const excludeIds = useMemo(
		() => (currentTaskId ? [...dependencies, currentTaskId] : dependencies),
		[dependencies, currentTaskId],
	);
	const { status, results, error } = useTaskSearch(query, excludeIds);

	const titleFor = (id: string): string => pickedTitles[id] ?? lookedUpTitles[id] ?? id;

	const addDependency = (task: TaskSearchResult): void => {
		if (dependencies.includes(task.id) || task.id === currentTaskId) return;
		onChange([...dependencies, task.id]);
		setPickedTitles((prev) => ({ ...prev, [task.id]: task.title }));
		setQuery("");
	};

	const removeDependency = (id: string): void => {
		onChange(dependencies.filter((depId) => depId !== id));
	};

	const showResults = query.trim() !== "";

	return (
		<div data-testid="task-dependency-field" className="flex flex-col gap-[6px]">
			{dependencies.length > 0 && (
				<ul className="flex flex-wrap items-center gap-[6px]" data-testid="task-dependency-list">
					{dependencies.map((id) => (
						<li key={id}>
							<ReferenceChip
								kind="task"
								label={titleFor(id)}
								mode="draft"
								disabled={disabled}
								removeTestId={`task-dependency-remove-${id}`}
								onRemove={() => removeDependency(id)}
							/>
						</li>
					))}
				</ul>
			)}
			<div className="relative flex flex-col gap-[3px]">
				<SearchField
					placeholder="Search tasks by title…"
					value={query}
					onChange={setQuery}
					loading={status === "loading"}
					disabled={disabled}
					data-testid="task-dependency-search"
				/>
				{showResults && !disabled && (
					<div
						role="listbox"
						aria-label="Matching tasks"
						data-testid="task-dependency-results"
						className="border-width-thin flex max-h-[220px] flex-col overflow-y-auto rounded-[var(--r-subtle)] border-[var(--border-subtle)] bg-[var(--surface-elevated)] py-[3px]"
					>
						{status === "loading" && (
							<div className="type-small px-[9px] py-[6px] text-[var(--text-tertiary)]">
								Searching…
							</div>
						)}
						{status === "error" && (
							<div className="type-small px-[9px] py-[6px] text-[var(--status-error)]" role="alert">
								{error ?? "Search failed"}
							</div>
						)}
						{status === "ready" && results.length === 0 && (
							<div className="type-small px-[9px] py-[6px] text-[var(--text-tertiary)]">
								No matching tasks
							</div>
						)}
						{results.map((task) => (
							<button
								key={task.id}
								type="button"
								role="option"
								data-testid={`task-dependency-result-${task.id}`}
								className="type-small flex items-center px-[9px] py-[6px] text-left text-[var(--text-primary)] hover:bg-[var(--surface-container)]"
								onClick={() => addDependency(task)}
							>
								{task.title}
							</button>
						))}
					</div>
				)}
			</div>
		</div>
	);
}
