/**
 * TaskDependencyField — set and see a task's dependencies.
 *
 * The write door (`POST /tasks`, `PATCH /tasks/:id`) already validates
 * `dependencies` and parks the task while any named one is unfinished; this
 * is the one control that reaches it from a human surface. Shared between
 * `WorkTaskCreate` and `WorkTaskPage`'s edit panel — the two surfaces the
 * plan names.
 *
 * Built on the shared `Combobox` in server-driven mode (options = the current
 * search results, passing `onQueryChange`) — the closed trigger always reads
 * as a placeholder, never a chosen task, because `value` is never set: each
 * pick hands off to the chip list this component owns rather than becoming
 * "the" value. This is also what gives the field its keyboard navigation
 * (ArrowUp/Down, Enter, Escape) for free.
 *
 * Existing dependency ids (the edit surface loads them bare) resolve to
 * titles via `useTaskLookup`'s bulk lookup door; freshly-picked titles are
 * known instantly from the search result that picked them, and win on
 * overlap since they are never stale.
 */

import { type JSX, useMemo, useState } from "react";
import { Combobox, ReferenceChip } from "../ds/index.js";
import { useTaskLookup } from "../hooks/useTaskLookup.js";
import { useTaskSearch } from "../hooks/useTaskSearch.js";

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
	const [pickedTitles, setPickedTitles] = useState<Readonly<Record<string, string>>>({});
	const lookedUpTitles = useTaskLookup(dependencies);

	const excludeIds = useMemo(
		() => (currentTaskId ? [...dependencies, currentTaskId] : dependencies),
		[dependencies, currentTaskId],
	);
	const { status, results, error } = useTaskSearch(query, excludeIds);

	const titleFor = (id: string): string => pickedTitles[id] ?? lookedUpTitles[id] ?? id;

	const options = useMemo(
		() => results.map((task) => ({ id: task.id, label: task.title })),
		[results],
	);

	// `results` is already excludeIds-filtered (see useTaskSearch), so a task
	// found here can never be the one being edited or already a dependency —
	// no second guard needed.
	const handlePick = (id: string): void => {
		const task = results.find((r) => r.id === id);
		if (!task) return;
		onChange([...dependencies, task.id]);
		setPickedTitles((prev) => ({ ...prev, [task.id]: task.title }));
	};

	const removeDependency = (id: string): void => {
		onChange(dependencies.filter((depId) => depId !== id));
	};

	const searchFieldId = "task-dependency-search-field";

	return (
		<div data-testid="task-dependency-field" className="flex flex-col gap-[6px]">
			<label htmlFor={searchFieldId} className="type-small text-[var(--text-primary)]">
				Depends on (waits until these finish)
			</label>
			{dependencies.length > 0 && (
				<ul className="flex flex-wrap items-center gap-[6px]" data-testid="task-dependency-list">
					{dependencies.map((id) => (
						<li key={id}>
							<ReferenceChip
								kind="task"
								label={titleFor(id)}
								mode="draft"
								disabled={disabled}
								onRemove={() => removeDependency(id)}
							/>
						</li>
					))}
				</ul>
			)}
			<Combobox
				id={searchFieldId}
				options={options}
				onChange={handlePick}
				onQueryChange={setQuery}
				disabled={disabled}
				placeholder="Search tasks by title…"
				inputAriaLabel="Search tasks by title"
				listAriaLabel="Matching tasks"
				loading={status === "loading"}
				error={status === "error" ? (error ?? "Search failed") : null}
				emptyMessage={status === "ready" ? "No matching tasks" : undefined}
			/>
		</div>
	);
}
