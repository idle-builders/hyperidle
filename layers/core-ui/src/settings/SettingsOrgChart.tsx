// @lore: OrgEdgeMechanism — imported, never redeclared locally; a local copy can silently drift from the shared mechanism values.
import { ORG_EDGE_MECHANISMS, type OrgEdgeMechanism } from "@hyperidle/domain-model";
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

const MECHANISMS: readonly OrgEdgeMechanism[] = ORG_EDGE_MECHANISMS;

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
				const result = await call("edit_user", {
					id: edge.fromUserId,
					edges: { remove: [edgeId] },
				});
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
					? {
							...prev,
							edges: [...prev.edges.filter((e) => e.fromUserId !== fromUserId), ...freshEdges],
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

	// Solo contextual hint when exactly 1 human user.
	// RELAXED — we still render the Add-Edge form but show guidance above it.
	// Default mechanism to "discipline" in solo mode (zero-dependency path).
	// 0 humans (all-agent org) sees the full UI.
	const humanUsers = users.filter((u) => u.kind === "human");
	const isSolo = humanUsers.length === 1;

	// Resolve display name for a user id
	const userName = (id: string): string => users.find((u) => u.id === id)?.name ?? id;

	// Resolve edge target to a human-readable label.
	// For "team" mechanism, target is the team's real id — look it up in data.teams.
	// For other mechanisms (direct/function), target is a user id or free text — use as-is.
	const targetLabel = (edge: OrgEdge): string => {
		if (edge.mechanism === "team") {
			const team = teams.find((t) => t.id === edge.target);
			return team?.name ?? edge.target;
		}
		return edge.target;
	};

	// Solo: show hint + form (mechanism defaults to "discipline")
	const soloHint = isSolo ? (
		<p className="type-small  text-[var(--text-secondary)]">
			Add a discipline (e.g. "Engineering") to describe your craft, or add a second human to define
			reporting lines.
		</p>
	) : null;

	// Effective mechanism in solo mode: open the form with "discipline" default
	const effectiveMechanism = isSolo && !showAddForm ? "discipline" : mechanism;

	return (
		<div className="flex flex-col gap-[18px]">
			{/* solo guidance hint — shown above the form, not instead of it */}
			{soloHint}

			{/* edge list */}
			{edges.length === 0 ? (
				<EmptyState
					compact
					title="No edges yet"
					description="Teams don't auto-create org edges. Add a reporting line, discipline, or team relationship to define your chart."
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
								<div className="relative">
									<Button
										variant="ghost"
										tone="neutral"
										size="icon"
										aria-label={`Actions for edge from ${userName(edge.fromUserId)}`}
										aria-haspopup="menu"
										aria-expanded={openMenuId === edge.id}
										disabled={deletingId === edge.id}
										onClick={(e) => {
											e.stopPropagation();
											setOpenMenuId(openMenuId === edge.id ? null : edge.id);
										}}
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
									</Button>
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

			{/* add edge */}
			{!showAddForm ? (
				<Button
					variant="ghost"
					size="sm"
					className="self-start"
					onClick={() => {
						// Default to "discipline" in solo mode
						if (isSolo) setMechanism("discipline");
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
	/** Real teams, derived from every user's effective `team`. */
	teams: OrgTeam[];
	/** True when exactly 1 human — defaults mechanism to "discipline". */
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
				{/* from */}
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

				{/* mechanism */}
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

				{/* target — context-aware by mechanism */}
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
						/* mechanism === "discipline": free-text input */
						<Input
							id="org-target"
							label="Target"
							type="text"
							value={target}
							onChange={(e) => onTargetChange(e.target.value)}
							placeholder="e.g. engineering, support"
							aria-label="Target discipline"
							disabled={adding}
						/>
					)}
				</div>
			</div>

			{/* inline error */}
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
