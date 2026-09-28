// @lore: fromDocument — DocumentDetail auto-creates at 1 team, sends here for multiple; sourceDocumentId carries provenance FK; dropping it loses it silently

import { type JSX, useEffect, useState } from "react";
import { Link as RRLink, useNavigate, useSearchParams } from "react-router-dom";
import { TaskDependencyField } from "../components/TaskDependencyField.js";
import { Breadcrumb, Button, Input, PageHeader, PageScaffold, Select } from "../ds/index.js";
import { useDocument } from "../hooks/useDocument.js";
import { useTeams } from "../hooks/useTeams.js";
import { call } from "../services/call.js";

export function WorkTaskCreate(): JSX.Element {
	const navigate = useNavigate();
	const [searchParams] = useSearchParams();

	const parentTaskId = searchParams.get("parentTaskId") ?? undefined;
	const fromDocumentId = searchParams.get("fromDocument") ?? undefined;

	const { data: teamsData } = useTeams();
	const teams = teamsData?.teams ?? [];
	const singleTeam = teams.length === 1;

	const [title, setTitle] = useState("");
	const [description, setDescription] = useState("");
	const [doneCondition, setDoneCondition] = useState("");
	const [teamId, setTeamId] = useState("");
	const [dependencies, setDependencies] = useState<readonly string[]>([]);
	const [submitting, setSubmitting] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const { data: documentView } = useDocument(fromDocumentId);
	const sourceDocument = documentView?.document ?? null;
	useEffect(() => {
		if (sourceDocument === null) return;
		setTitle((t) => (t === "" ? sourceDocument.title : t));
		setDescription((d) => (d === "" ? sourceDocument.body : d));
	}, [sourceDocument]);

	const resolvedTeamId = singleTeam ? (teams[0]?.id ?? "") : teamId;
	// parentTaskId path: teamId is inherited server-side; only title is required
	const canCreate =
		title.trim().length > 0 &&
		(parentTaskId != null || resolvedTeamId.trim().length > 0) &&
		!submitting;

	const handleCreate = async (): Promise<void> => {
		if (!canCreate) return;
		setSubmitting(true);
		setError(null);

		try {
			const result = await call("edit_task", {
				title: title.trim(),
				description: description.trim() || undefined,
				doneCondition: doneCondition.trim() || undefined,
				parentTaskId,
				teamId: parentTaskId != null ? undefined : resolvedTeamId,
				sourceDocumentId: fromDocumentId,
				dependencies: dependencies.length > 0 ? [...dependencies] : undefined,
			});

			if (!result.ok) {
				const problem = result.problems[0];
				setError(
					// A dependency rejection names the rule it broke for the
					// two codes mapped below. A dangling id's `dependency_not_found`
					// is not mapped, so it still falls through to the generic message.
					((problem?.code === "cycle" || problem?.code === "dependency_killed") &&
						problem.message) ||
						"Failed to create task. Please try again.",
				);
				setSubmitting(false);
				return;
			}

			navigate(`/work/task/${encodeURIComponent(result.data.task.id)}`);
		} catch {
			setError("Network error. Please try again.");
			setSubmitting(false);
		}
	};

	const handleCancel = (): void => {
		if (parentTaskId != null) {
			navigate(`/work/task/${encodeURIComponent(parentTaskId)}`);
		} else {
			navigate("/work");
		}
	};

	const breadcrumbSegments =
		parentTaskId != null
			? ([
					{ label: "Work", to: "/work" },
					{ label: "Task", to: `/work/task/${encodeURIComponent(parentTaskId)}` },
					{ label: "New subtask" },
				] as const)
			: ([{ label: "Work", to: "/work" }, { label: "New task" }] as const);

	return (
		<PageScaffold
			frame="page"
			data-testid="task-create-page"
			header={
				<PageHeader
					title={parentTaskId != null ? "New subtask" : "New task"}
					leading={<Breadcrumb segments={breadcrumbSegments} LinkComponent={RRLink} />}
					actions={
						<>
							<Button variant="secondary" size="sm" onClick={handleCancel} disabled={submitting}>
								Cancel
							</Button>
							<Button
								variant="primary"
								size="sm"
								data-testid="task-create-submit"
								onClick={() => void handleCreate()}
								disabled={!canCreate}
							>
								{submitting ? "Creating…" : "Create"}
							</Button>
						</>
					}
				/>
			}
		>
			<div
				className="max-w-[800px] w-full py-[24px] flex flex-col gap-[18px]"
				data-testid="task-create-body"
			>
				{error && (
					<p
						role="alert"
						data-testid="task-create-error"
						className="type-metadata text-[var(--status-error)]"
					>
						{error}
					</p>
				)}

				<Input
					label="Title"
					value={title}
					onChange={(e: React.ChangeEvent<HTMLInputElement>) => setTitle(e.target.value)}
					placeholder="Short task title"
					disabled={submitting}
					data-testid="task-create-title"
					autoFocus
				/>

				<Input
					label="Description"
					textarea
					value={description}
					onChange={(e) => setDescription(e.target.value)}
					placeholder="What needs to happen, and why?"
					rows={4}
					disabled={submitting}
					data-testid="task-create-description"
				/>

				<Input
					label="Goal (done when…)"
					textarea
					value={doneCondition}
					onChange={(e) => setDoneCondition(e.target.value)}
					placeholder="Acceptance condition"
					rows={2}
					disabled={submitting}
					data-testid="task-create-done-condition"
				/>

				<TaskDependencyField
					dependencies={dependencies}
					onChange={setDependencies}
					disabled={submitting}
				/>

				{parentTaskId == null && !singleTeam && (
					<Select
						label="Team"
						value={teamId}
						onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setTeamId(e.target.value)}
						placeholder="Select a team…"
						options={teams.map((t) => ({ value: t.id, label: t.name }))}
						disabled={submitting}
						data-testid="task-create-team"
					/>
				)}

				{parentTaskId == null && singleTeam && teams[0] && (
					<div className="flex flex-col gap-[3px]">
						<span className="type-label uppercase text-[var(--text-tertiary)]">Team</span>
						<span className="type-small text-[var(--text-primary)]">{teams[0].name}</span>
					</div>
				)}
			</div>
		</PageScaffold>
	);
}
