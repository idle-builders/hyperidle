/**
 * SettingsOrgChart — Org Chart settings section.
 *
 * P4 Task 10: Settings section (AC-12, AC-14)
 * Displays org chart edges with Add/Delete functionality.
 *
 * - Fetches edges from GET /api/org (returns { edges, users, teams })
 * - Edge table: FROM | MECHANISM | TARGET | delete button
 * - "Add Edge" expands inline form with From select, Mechanism select, Target select
 * - Delete calls DELETE /api/org/edges/:id
 * - Add calls PUT /api/org/edges
 *
 * @lore visual-parity W-06: DaisyUI form classes replaced with Hearth token styling.
 * @lore visual-parity issue-16: Target field is now context-aware:
 * - mechanism "direct" → select from users list
 * - mechanism "team" → select from teams list from GET /api/org (id=teamMembers.id, name=teams.name)
 * - mechanism "function" → free-text input
 * Inline error display added below the form (not just toast).
 *
 * @lore AF15: Three fixes:
 * 1. OrgData now includes teams:{id,name}[] from GET /api/org.
 * 2. Team select uses data.teams (real ids from teamMembers) instead of deriveTeams
 *    (circular edge-derived derivation). deriveTeams deleted — was a circular dependency
 *    that made the first team edge impossible to create.
 * 3. Solo short-circuit (1 human) relaxed: Add-Edge form still renders. Mechanism
 *    defaults to "function" in solo mode — the zero-dependency path. Guidance text
 *    becomes a hint above the form, not a blocker.
 *
 * @lore AF15: Empty team state copy fixed — no longer says "create one in Work"
 * (Work roster does not create teams; only SetupFlow does). Now points to the
 * function mechanism and Setup, which are real affordances.
 */

// hearth-internal-padding
import {
	Button,
	EmptyState,
	ErrorState,
	Input,
	ItemList,
	Row,
	Select,
	SkeletonList,
} from "@hyperidle/design-system";
import { type JSX, useCallback, useEffect, useState } from "react";
import { apiFetch } from "../services/api-fetch.js";
import { useToast } from "../shell/ToastRegion.js";

type OrgEdgeMechanism = "direct" | "function" | "team";

interface OrgEdge {
	id: string;
	fromUserId: string;
	mechanism: OrgEdgeMechanism;
	target: string;
	createdAt: string;
}

interface OrgUser {
	id: string;
	kind: string;
	name: string;
	role: string;
}

interface OrgTeam {
	id: string;
	name: string;
}

interface OrgData {
	edges: OrgEdge[];
	users: OrgUser[];
	/** AF15: Real teams list from teamMembers joined to teams.name. id = teamMembers.id. */
	teams: OrgTeam[];
}

const MECHANISMS: OrgEdgeMechanism[] = ["direct", "function", "team"];

export function SettingsOrgChart(): JSX.Element {
	const { showToast } = useToast();
	const [data, setData] = useState<OrgData | null>(null);
	const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
	const [showAddForm, setShowAddForm] = useState(false);
	const [fromUserId, setFromUserId] = useState("");
	const [mechanism, setMechanism] = useState<OrgEdgeMechanism>("direct");
	const [target, setTarget] = useState("");
	const [adding, setAdding] = useState(false);
	const [deletingId, setDeletingId] = useState<string | null>(null);
	const [formError, setFormError] = useState<string | null>(null);

	const loadOrg = useCallback(async (): Promise<void> => {
		setStatus("loading");
		try {
			const res = await apiFetch("/api/org");
			if (!res.ok) throw new Error(`HTTP ${res.status}`);
			const json = (await res.json()) as OrgData;
			setData(json);
			setStatus("ready");
		} catch {
			setStatus("error");
		}
	}, []);

	useEffect(() => {
		void loadOrg();
	}, [loadOrg]);

	const handleDelete = useCallback(
		async (edgeId: string): Promise<void> => {
			setDeletingId(edgeId);
			try {
				const res = await apiFetch(`/api/org/edges/${encodeURIComponent(edgeId)}`, {
					method: "DELETE",
				});
				if (!res.ok && res.status !== 204) {
					throw new Error(`HTTP ${res.status}`);
				}
				setData((prev) =>
					prev ? { ...prev, edges: prev.edges.filter((e) => e.id !== edgeId) } : prev,
				);
				showToast("Edge deleted");
			} catch {
				showToast("Failed to delete edge");
			} finally {
				setDeletingId(null);
			}
		},
		[showToast],
	);

	const handleAdd = useCallback(async (): Promise<void> => {
		if (!(fromUserId && target)) return;
		setAdding(true);
		setFormError(null);
		try {
			const res = await apiFetch("/api/org/edges", {
				method: "PUT",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ fromUserId, mechanism, target }),
			});
			if (!res.ok) {
				const err = (await res.json().catch(() => ({}))) as { error?: string };
				throw new Error(err.error ?? `HTTP ${res.status}`);
			}
			const edge = (await res.json()) as OrgEdge;
			setData((prev) =>
				prev
					? {
							...prev,
							edges: prev.edges.some((e) => e.id === edge.id) ? prev.edges : [...prev.edges, edge],
						}
					: prev,
			);
			setShowAddForm(false);
			setFromUserId("");
			setMechanism("direct");
			setTarget("");
			setFormError(null);
			showToast("Edge added");
		} catch (err) {
			const msg = err instanceof Error ? err.message : "Failed to add edge";
			setFormError(msg);
			showToast(msg);
		} finally {
			setAdding(false);
		}
	}, [fromUserId, mechanism, target, showToast]);

	if (status === "loading") {
		return <SkeletonList rows={2} ariaLabel="Loading org chart" />;
	}

	if (status === "error" || !data) {
		return (
			<ErrorState
				compact
				title="Couldn't load org chart"
				description="Failed to load org chart. Please try again."
				onRetry={() => void loadOrg()}
			/>
		);
	}

	const { edges, users, teams } = data;

	// AD3 AC-2 / AF15: solo contextual hint when exactly 1 human user.
	// AF15: RELAXED — we still render the Add-Edge form but show guidance above it.
	// Default mechanism to "function" in solo mode (zero-dependency path).
	// 0 humans (all-agent org) sees the full UI.
	const humanUsers = users.filter((u) => u.kind === "human");
	const isSolo = humanUsers.length === 1;

	// Resolve display name for a user id
	const userName = (id: string): string => users.find((u) => u.id === id)?.name ?? id;

	// D4 (POLISH-060): resolve edge target to a human-readable label.
	// For "team" mechanism, target is a team-<uuid> — look it up in data.teams.
	// For other mechanisms (direct/function), target is a user id or free text — use as-is.
	const targetLabel = (edge: OrgEdge): string => {
		if (edge.mechanism === "team") {
			return teams.find((t) => t.id === edge.target)?.name ?? edge.target;
		}
		return edge.target;
	};

	// Solo: show hint + form (mechanism defaults to "function")
	const soloHint = isSolo ? (
		<p className="text-[13px] text-[var(--text-secondary)]">
			Add a function (e.g. "Engineering") to describe your role, or add a second human to define
			reporting lines.
		</p>
	) : null;

	// Effective mechanism in solo mode: open the form with "function" default
	const effectiveMechanism = isSolo && !showAddForm ? "function" : mechanism;

	return (
		<div className="flex flex-col gap-[18px]">
			{/* Solo guidance hint (shown above the form, not instead of it) */}
			{soloHint}

			{/* Edge list */}
			{edges.length === 0 ? (
				<EmptyState
					compact
					title="No edges yet"
					description="Teams don't auto-create org edges. Add a reporting line, function, or team relationship to define your chart."
				/>
			) : (
				<ItemList variant="flush" isEmpty={false}>
					{edges.map((edge) => (
						<Row
							key={edge.id}
							title={userName(edge.fromUserId)}
							subtitle={targetLabel(edge)}
							cells={[{ content: edge.mechanism }]}
							actions={
								<Button
									variant="destructive"
									size="sm"
									onClick={() => void handleDelete(edge.id)}
									disabled={deletingId === edge.id}
									aria-label={`Delete edge ${edge.id}`}
								>
									{deletingId === edge.id ? "…" : "Delete"}
								</Button>
							}
						/>
					))}
				</ItemList>
			)}

			{/* Add Edge */}
			{!showAddForm ? (
				<Button
					variant="ghost"
					size="sm"
					className="self-start"
					onClick={() => {
						// Default to "function" in solo mode
						if (isSolo) setMechanism("function");
						setShowAddForm(true);
					}}
					data-testid="add-edge-btn"
				>
					+ Add Edge
				</Button>
			) : (
				<AddEdgeForm
					users={users}
					teams={teams}
					isSolo={isSolo}
					fromUserId={fromUserId}
					mechanism={effectiveMechanism}
					target={target}
					adding={adding}
					formError={formError}
					onFromChange={setFromUserId}
					onMechanismChange={(m) => {
						setMechanism(m);
						setTarget("");
					}}
					onTargetChange={setTarget}
					onAdd={() => void handleAdd()}
					onCancel={() => {
						setShowAddForm(false);
						setFromUserId("");
						setMechanism("direct");
						setTarget("");
						setFormError(null);
					}}
				/>
			)}
		</div>
	);
}

interface AddEdgeFormProps {
	users: OrgUser[];
	/** AF15: Real teams from GET /api/org. id=teamMembers.id, name=teams.name. */
	teams: OrgTeam[];
	/** AF15: True when exactly 1 human — defaults mechanism to "function". */
	isSolo: boolean;
	fromUserId: string;
	mechanism: OrgEdgeMechanism;
	target: string;
	adding: boolean;
	formError: string | null;
	onFromChange: (value: string) => void;
	onMechanismChange: (value: OrgEdgeMechanism) => void;
	onTargetChange: (value: string) => void;
	onAdd: () => void;
	onCancel: () => void;
}

function AddEdgeForm({
	users,
	teams,
	fromUserId,
	mechanism,
	target,
	adding,
	formError,
	onFromChange,
	onMechanismChange,
	onTargetChange,
	onAdd,
	onCancel,
}: AddEdgeFormProps): JSX.Element {
	const canAdd = Boolean(fromUserId && target && !adding);

	return (
		<div className="flex flex-col gap-[12px] p-[18px] border-[1.5px] border-[var(--border-subtle)] rounded-[var(--r-subtle)]">
			<div className="flex gap-[12px] flex-wrap">
				{/* From */}
				<div className="flex-1 min-w-[120px]">
					<Select
						id="org-from"
						label="From"
						value={fromUserId}
						onChange={(e) => onFromChange(e.target.value)}
						aria-label="From user"
						disabled={adding}
						placeholder="Select user…"
						options={users.map((u) => ({ value: u.id, label: u.name }))}
					/>
				</div>

				{/* Mechanism */}
				<div className="flex-1 min-w-[120px]">
					<Select
						id="org-mechanism"
						label="Mechanism"
						value={mechanism}
						onChange={(e) => onMechanismChange(e.target.value as OrgEdgeMechanism)}
						aria-label="Mechanism"
						disabled={adding}
						options={MECHANISMS.map((m) => ({ value: m, label: m }))}
					/>
				</div>

				{/* Target — context-aware by mechanism */}
				<div className="flex-1 min-w-[120px]">
					{mechanism === "direct" ? (
						<Select
							id="org-target"
							label="Target"
							value={target}
							onChange={(e) => onTargetChange(e.target.value)}
							aria-label="Target user"
							disabled={adding}
							placeholder="Select user…"
							options={users.map((u) => ({ value: u.id, label: u.name }))}
						/>
					) : mechanism === "team" ? (
						/* AF15: Team select from real teams (teamMembers joined to teams.name).
						 * value=team.id (teamMembers.id — what server validates for mechanism:"team").
						 * label=team.name (teams.name — human-readable).
						 * Empty state: disabled option pointing to function mechanism or Setup.
						 * @lore AF15: The old deriveTeams() derived from existing edges — circular.
						 * Now sourced from GET /api/org `teams` array. */
						<Select
							id="org-target"
							label="Target"
							value={target}
							onChange={(e) => onTargetChange(e.target.value)}
							aria-label="Target team"
							disabled={adding}
							options={
								teams.length === 0
									? [
											{
												value: "",
												label:
													"No teams yet — use a Function relationship instead, or run Setup to create your first team.",
												disabled: true,
											},
										]
									: [
											{ value: "", label: "Select team…" },
											...teams.map((t) => ({ value: t.id, label: t.name })),
										]
							}
						/>
					) : (
						/* mechanism === "function": free-text input */
						<Input
							id="org-target"
							label="Target"
							type="text"
							value={target}
							onChange={(e) => onTargetChange(e.target.value)}
							placeholder="e.g. engineering, support"
							aria-label="Target function"
							disabled={adding}
						/>
					)}
				</div>
			</div>

			{/* Inline error */}
			{formError && (
				<p
					role="alert"
					data-testid="org-form-error"
					className="text-[12px] text-[var(--status-error)]"
				>
					{formError}
				</p>
			)}

			<div className="flex gap-[9px] justify-end">
				<Button variant="ghost" size="sm" onClick={onCancel} disabled={adding}>
					Cancel
				</Button>
				<Button
					variant="primary"
					size="sm"
					onClick={onAdd}
					disabled={!canAdd}
					data-testid="org-add-submit"
				>
					{adding ? "Adding…" : "Add"}
				</Button>
			</div>
		</div>
	);
}
