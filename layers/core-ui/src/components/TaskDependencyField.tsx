/**
 * TaskDependencyField — set and see a task's dependencies.
 *
 * BA6: the write door (`POST /tasks`, `PATCH /tasks/:id`) already validates
 * `dependencies` and parks the task while any named one is unfinished; this
 * is the one control that reaches it from a human surface. Shared between
 * `WorkTaskCreate` and `WorkTaskPage`'s edit panel — the two surfaces the
 * plan names.
 *
 * @lore BA6: no existing design-system control fits the PICKER shape.
 * `ScopePicker` and `RoleCombobox` both pick from a small closed catalog; a
 * dependency can point at ANY task under any root (no restriction, per the
 * plan), and there is no task-search endpoint or hook to build a
 * title-based picker against today — that is real, separate work, not a
 * detail of this field. Building one here would be inventing scope the plan
 * didn't ask for, so this is deliberately the plainest interaction: type a
 * task id, add it, remove it. A title-based picker is a reasonable
 * follow-up, not a defect in this control.
 *
 * The CHIP that shows an added id, though, is not a new shape — it is
 * `ReferenceChip`'s existing `mode="draft"` (open body + trailing ✕ remove),
 * extended with a `"task"` kind rather than hand-rolled a second time.
 */

import { type JSX, useState } from "react";
import { Button, Input, ReferenceChip } from "../ds/index.js";

export interface TaskDependencyFieldProps {
	dependencies: readonly string[];
	onChange: (dependencies: readonly string[]) => void;
	disabled?: boolean;
}

export function TaskDependencyField({
	dependencies,
	onChange,
	disabled = false,
}: TaskDependencyFieldProps): JSX.Element {
	const [draft, setDraft] = useState("");

	const addDependency = (): void => {
		const id = draft.trim();
		if (id === "" || dependencies.includes(id)) return;
		onChange([...dependencies, id]);
		setDraft("");
	};

	const removeDependency = (id: string): void => {
		onChange(dependencies.filter((depId) => depId !== id));
	};

	return (
		<div data-testid="task-dependency-field" className="flex flex-col gap-[6px]">
			{dependencies.length > 0 && (
				<ul className="flex flex-wrap items-center gap-[6px]" data-testid="task-dependency-list">
					{dependencies.map((id) => (
						<li key={id} data-testid={`task-dependency-remove-${id}`}>
							<ReferenceChip
								kind="task"
								label={id}
								mode="draft"
								onRemove={disabled ? undefined : () => removeDependency(id)}
							/>
						</li>
					))}
				</ul>
			)}
			<div className="flex items-center gap-[6px]">
				<Input
					label="Depends on (waits until these finish)"
					value={draft}
					onChange={(e: React.ChangeEvent<HTMLInputElement>) => setDraft(e.target.value)}
					onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => {
						if (e.key === "Enter") {
							e.preventDefault();
							addDependency();
						}
					}}
					placeholder="Paste a task id…"
					disabled={disabled}
					data-testid="task-dependency-input"
				/>
				<Button
					variant="secondary"
					size="sm"
					onClick={addDependency}
					disabled={disabled || draft.trim() === ""}
					data-testid="task-dependency-add-btn"
				>
					Add
				</Button>
			</div>
		</div>
	);
}
