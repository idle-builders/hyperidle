/**
 * WorkTaskCreate — full-page task create form at /work/task/new.
 *
 * Accepts an optional ?parentTaskId= search param. When present the new task
 * is created as a child; teamId is inherited from the parent. When absent
 * (creating a root task) a team must be selected.
 *
 * On 201 response, navigates to /work/task/:id.
 *
 * @lore BB1: replaces WorkBetCreate. POST /api/tasks instead of POST /api/bets.
 * The parentTaskId query-param path is the subtask creation path — the "Add
 * subtask" button on WorkTaskPage passes it here.
 *
 * @lore AK5: ?fromKnowledge=<id> is the multi-team promote path. KnowledgeDetail
 * auto-creates when there is exactly one team and sends the user here otherwise,
 * so this page is the ONLY other place that carries sourceKnowledgeItemId into
 * the POST. Dropping it here silently loses the provenance FK.
 */

import { type JSX, useEffect, useState } from "react";
import { Link as RRLink, useNavigate, useSearchParams } from "react-router-dom";
import { TaskDependencyField } from "../components/TaskDependencyField.js";
import { Breadcrumb, Button, Input, PageHeader, PageScaffold, Select } from "../ds/index.js";
import { useKnowledgeItem } from "../hooks/useKnowledgeItem.js";
import { useTeams } from "../hooks/useTeams.js";
import { apiFetch } from "../services/api-fetch.js";

export function WorkTaskCreate(): JSX.Element {
	const navigate = useNavigate();
	const [searchParams] = useSearchParams();

	const parentTaskId = searchParams.get("parentTaskId") ?? undefined;
	// AK5: provenance carrier for the multi-team promote path.
	const fromKnowledgeId = searchParams.get("fromKnowledge") ?? undefined;

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

	// AK5: pre-fill title/description from the promoted knowledge item.
	const { data: knowledgeData } = useKnowledgeItem(fromKnowledgeId);
	const knowledgeItem = knowledgeData ?? null;
	useEffect(() => {
		if (knowledgeItem === null) return;
		setTitle((t) => (t === "" ? knowledgeItem.title : t));
		setDescription((d) => (d === "" ? knowledgeItem.body : d));
	}, [knowledgeItem]);

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

		const payload: Record<string, string | string[] | undefined> = {
			title: title.trim(),
			description: description.trim() || undefined,
			doneCondition: doneCondition.trim() || undefined,
			parentTaskId,
			teamId: parentTaskId != null ? undefined : resolvedTeamId,
			sourceKnowledgeItemId: fromKnowledgeId,
			dependencies: dependencies.length > 0 ? [...dependencies] : undefined,
		};

		// Remove undefined keys
		for (const key of Object.keys(payload)) {
			if (payload[key] === undefined) delete payload[key];
		}

		try {
			const res = await apiFetch("/api/tasks", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(payload),
			});

			if (!res.ok) {
				const body = (await res.json().catch(() => null)) as {
					error?: string;
					code?: string;
				} | null;
				setError(
					body?.code === "CAPACITY_EXCEEDED"
						? "Team is at its concurrent task limit."
						: // BA6 AC5: a dependency rejection names the rule it broke for the
							// two codes mapped below — `TASK_CYCLE` and `TASK_DEPENDENCY_KILLED`
							// (fix round, "Also fix": the latter was missing here even though
							// the PATCH side already mapped it). A dangling id returns 404 with
							// `code: NOT_FOUND`, which is not mapped, so it still falls through
							// to the generic message.
							((body?.code === "TASK_CYCLE" || body?.code === "TASK_DEPENDENCY_KILLED") &&
								body.error) ||
								"Failed to create task. Please try again.",
				);
				setSubmitting(false);
				return;
			}

			const created = (await res.json()) as { id: string };
			navigate(`/work/task/${encodeURIComponent(created.id)}`);
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

				{/* Team select — shown only for root tasks when there are multiple teams */}
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
