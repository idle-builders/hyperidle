/**
 * SettingsOrgChart — Org Chart settings section.
 *
 * P4 Task 10: Settings section (AC-12, AC-14)
 * Displays org chart edges with Add/Delete functionality.
 *
 * - Fetches every user via `search_users({})` — each row carries its own
 *   `edges` and its effective `team`; users/edges/teams are all derived from
 *   that one list (architecture.md §8).
 * - Edge table: FROM | MECHANISM | TARGET | delete button
 * - "Add Edge" expands inline form with From select, Mechanism select, Target select
 * - Delete calls `edit_user({ id: fromUserId, edges: { remove: [edgeId] } })`
 * - Add calls `edit_user({ id: fromUserId, edges: { add: [{mechanism, target}] } })`
 *
 * @lore BC5 T9: the door swap. A team-mechanism edge's target is the team's
 * real id directly now — the old `team_members` indirection (`teamActualId`)
 * is gone along with the team_members table itself.
 *
 * @lore visual-parity W-06: DaisyUI form classes replaced with Hearth token styling.
 * @lore visual-parity issue-16: Target field is now context-aware:
 * - mechanism "direct" → select from users list
 * - mechanism "team" → select from each user's effective `team` (id=teams.id, name=teams.name)
 * - mechanism "function" → free-text input
 * Inline error display added below the form (not just toast).
 *
 * @lore AF15: Three fixes:
 * 1. OrgData now includes teams:{id,name}[] derived from every user's effective team.
 * 2. Team select uses the derived teams list (real team ids) instead of deriveTeams
 *    (circular edge-derived derivation). deriveTeams deleted — was a circular dependency
 *    that made the first team edge impossible to create.
 * 3. Solo short-circuit (1 human) relaxed: Add-Edge form still renders. Mechanism
 *    defaults to "function" in solo mode — the zero-dependency path. Guidance text
 *    becomes a hint above the form, not a blocker.
 *
 * @lore AF15: Empty team state copy fixed — no longer says "create one in Work"
 * (Work roster does not create teams; only SetupFlow does). Now points to the
 * function mechanism and Setup, which are real affordances.
 *
 * @lore The "From" field and the "direct"/"team" Target pickers are the
 * shared `Combobox` (client-filtered — `users`/`teams` are already the full
 * list) instead of a closed `<Select>`. "Mechanism" stays a `Select` — a
 * short fixed list, not an entity picker. The "no teams yet" guidance moved
 * from a disabled option that impersonated the closed trigger's value to
 * `Combobox`'s own `emptyMessage`, shown inside the popover once opened.
 * "From" and "Target" never render together with the same visible label —
 * mechanism selection decides which one shows — so no accessible-name
 * override is needed; the visible labels are already unique.
 */

import { type JSX, useCallback, useEffect, useState } from "react";
// hearth-internal-padding
import {
	Button,
	Combobox,
	EmptyState,
	ErrorState,
	Input,
	ItemList,
	Menu,
	Row,
	Select,
	SkeletonList,
} from "../ds";
import { call } from "../services/call.js";
import { useToast } from "../shell/ToastRegion.js";

type OrgEdgeMechanism = "direct" | "function" | "team";

interface OrgEdge {
	id: string;
	fromUserId: string;
	mechanism: OrgEdgeMechanism;
	target: string;
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
	teams: OrgTeam[];
}

const MECHANISMS: OrgEdgeMechanism[] = ["direct", "function", "team"];

/** Every user, each with its own `edges` and effective `team` — the one call. */
async function fetchOrgData(): Promise<OrgData> {
	const result = await call("search_users", {});
	if (!result.ok) throw new Error(result.problems[0]?.message ?? "Failed to load org chart");
	const users: OrgUser[] = result.data.map((u) => ({
		id: u.id,
		kind: u.kind,
		name: u.name,
		role: u.role,
	}));
	const edges: OrgEdge[] = result.data.flatMap((u) =>
		u.edges.map((e) => ({
			id: e.id,
			fromUserId: u.id,
			mechanism: e.mechanism as OrgEdgeMechanism,
			target: e.target,
		})),
	);
	const teamsById = new Map<string, OrgTeam>();
	for (const u of result.data) {
		if (u.team) teamsById.set(u.team.id, { id: u.team.id, name: u.team.name });
	}
	return { edges, users, teams: [...teamsById.values()] };
}

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
	// @lore FR-10: per-row action menu open state — only one open at a time.
	const [openMenuId, setOpenMenuId] = useState<string | null>(null);

	const loadOrg = useCallback(async (): Promise<void> => {
		setStatus("loading");
		try {
			const org = await fetchOrgData();
			setData(org);
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
			const edge = data?.edges.find((e) => e.id === edgeId);
			if (!edge) return;
			setDeletingId(edgeId);
			try {
				const result = await call("edit_user", { id: edge.fromUserId, edges: { remove: [edgeId] } });
				if (!result.ok) {
					throw new Error(result.problems[0]?.message ?? "Failed to delete edge");
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
		[data, showToast],
	);

	const handleAdd = useCallback(async (): Promise<void> => {
		if (!(fromUserId && target)) return;
		setAdding(true);
		setFormError(null);
		try {
			const result = await call("edit_user", {
				id: fromUserId,
				edges: { add: [{ mechanism, target }] },
			});
			if (!result.ok) {
				throw new Error(result.problems[0]?.message ?? "Failed to add edge");
			}
			const freshEdges: OrgEdge[] = result.data.user
				? result.data.user.edges.map((e) => ({
						id: e.id,
						fromUserId,
						mechanism: e.mechanism as OrgEdgeMechanism,
						target: e.target,
					}))
				: [];
			setData((prev) =>
				prev
					? { ...prev, edges: [...prev.edges.filter((e) => e.fromUserId !== fromUserId), ...freshEdges] }
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
	// For "team" mechanism, target is the team's real id — look it up in data.teams.
	// For other mechanisms (direct/function), target is a user id or free text — use as-is.
	const targetLabel = (edge: OrgEdge): string => {
		if (edge.mechanism === "team") {
			const team = teams.find((t) => t.id === edge.target);
			return team?.name ?? edge.target;
		}
		return edge.target;
	};

	// Solo: show hint + form (mechanism defaults to "function")
	const soloHint = isSolo ? (
		<p className="type-small  text-[var(--text-secondary)]">
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
				// @lore FR-10: destructive actions moved behind a Menu — no inline Delete on rows.
				<ItemList variant="flush" isEmpty={false}>
					{edges.map((edge) => (
						<Row
							key={edge.id}
							title={userName(edge.fromUserId)}
							subtitle={targetLabel(edge)}
							cells={[{ content: edge.mechanism }]}
							actions={
								<div className="relative">
									<button
										type="button"
										aria-label={`Actions for edge from ${userName(edge.fromUserId)}`}
										aria-haspopup="menu"
										aria-expanded={openMenuId === edge.id}
										disabled={deletingId === edge.id}
										onClick={(e) => {
											e.stopPropagation();
											setOpenMenuId(openMenuId === edge.id ? null : edge.id);
										}}
										className="type-control cursor-pointer inline-flex h-[28px] w-[28px] items-center justify-center rounded-[var(--r-subtle)] text-[var(--text-tertiary)] hover:bg-[color-mix(in_oklab,var(--text-secondary)_8%,transparent)] hover:text-[var(--text-primary)] disabled:opacity-40"
									>
										{deletingId === edge.id ? (
											<span className="type-metadata">…</span>
										) : (
											<svg
												width="14"
												height="14"
												viewBox="0 0 24 24"
												fill="currentColor"
												aria-hidden="true"
											>
												<circle cx="12" cy="5" r="2" />
												<circle cx="12" cy="12" r="2" />
												<circle cx="12" cy="19" r="2" />
											</svg>
										)}
									</button>
									<Menu
										open={openMenuId === edge.id}
										onClose={() => setOpenMenuId(null)}
										label={`Edge actions`}
										align="end"
										items={[
											{
												id: "delete",
												label: "Delete",
												destructive: true,
												onSelect: () => {
													setOpenMenuId(null);
													void handleDelete(edge.id);
												},
											},
										]}
									/>
								</div>
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
					Add relationship
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
	/** AF15: Real teams, derived from every user's effective `team`. */
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
		<div className="border-width-default flex flex-col gap-[12px] p-[18px]  border-[var(--border-subtle)] rounded-[var(--r-subtle)]">
			<div className="flex gap-[12px] flex-wrap">
				{/* From */}
				<div className="flex-1 min-w-[120px]">
					<Combobox
						id="org-from"
						label="From"
						value={fromUserId}
						onChange={onFromChange}
						disabled={adding}
						placeholder="Select user…"
						listAriaLabel="Users"
						inputAriaLabel="Filter users"
						options={users.map((u) => ({ id: u.id, label: u.name }))}
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
						<Combobox
							id="org-target"
							label="Target"
							value={target}
							onChange={onTargetChange}
							disabled={adding}
							placeholder="Select user…"
							listAriaLabel="Users"
							inputAriaLabel="Filter users"
							options={users.map((u) => ({ id: u.id, label: u.name }))}
						/>
					) : mechanism === "team" ? (
						/* AF15: Team select from real teams (each user's effective `team`).
						 * value=team.id (teams.id — what the server validates for mechanism:"team").
						 * label=team.name (human-readable).
						 * @lore AF15: The old deriveTeams() derived from existing edges — circular.
						 * Now sourced from `search_users`'s per-row `team`.
						 * @lore BA6: the empty-teams guidance used to BE the closed
						 * trigger's displayed value (a disabled option standing in for
						 * "selected"). Combobox has no such slot, so it is `emptyMessage`
						 * instead — shown inside the popover once opened, not before. */
						<Combobox
							id="org-target"
							label="Target"
							value={target}
							onChange={onTargetChange}
							disabled={adding}
							placeholder="Select team…"
							listAriaLabel="Teams"
							inputAriaLabel="Filter teams"
							emptyMessage="No teams yet — use a Function relationship instead, or run Setup to create your first team."
							options={teams.map((t) => ({ id: t.id, label: t.name }))}
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
					className="type-metadata  text-[var(--status-error)]"
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
