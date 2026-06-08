/**
 * SettingsOrgChart — Org Chart settings section.
 *
 * P4 Task 10: Settings section (AC-12, AC-14)
 * Displays org chart edges with Add/Delete functionality.
 *
 * - Fetches edges from GET /api/org (returns { edges, users })
 * - Edge table: FROM | MECHANISM | TARGET | delete button
 * - "Add Edge" expands inline form with From select, Mechanism select, Target select
 * - Delete calls DELETE /api/org/edges/:id
 * - Add calls PUT /api/org/edges
 *
 * @lore visual-parity W-06: DaisyUI form classes replaced with Hearth token styling.
 * @lore visual-parity issue-16: Target field is now context-aware:
 * - mechanism "direct" → select from users list
 * - mechanism "team" → select from team names derived from org edges
 * - mechanism "function" → free-text input
 * Inline error display added below the form (not just toast).
 */

// hearth-internal-padding
import { type JSX, useCallback, useEffect, useMemo, useState } from "react";
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

interface OrgData {
	edges: OrgEdge[];
	users: OrgUser[];
}

const MECHANISMS: OrgEdgeMechanism[] = ["direct", "function", "team"];

/** Shared Hearth token styling for form selects */
const selectStyle: React.CSSProperties = {
	fontFamily: "var(--font-sans)",
	fontSize: "15px",
	padding: "10px 12px",
	border: "1.5px solid var(--border-default)",
	borderRadius: "var(--r-default)",
	background: "var(--surface-elevated)",
	color: "var(--text-primary)",
	outline: "none",
	width: "100%",
};

/** Shared Hearth token styling for form inputs */
const inputStyle: React.CSSProperties = {
	fontFamily: "var(--font-sans)",
	fontSize: "15px",
	padding: "10px 12px",
	border: "1.5px solid var(--border-default)",
	borderRadius: "var(--r-default)",
	background: "var(--surface-elevated)",
	color: "var(--text-primary)",
	outline: "none",
	width: "100%",
};

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
		return (
			<div className="flex flex-col gap-[12px]">
				<div className="skeleton h-8 w-full" />
				<div className="skeleton h-8 w-full" />
			</div>
		);
	}

	if (status === "error" || !data) {
		return (
			<p className="text-[13px] text-[var(--status-error)]">
				Failed to load org chart. Please try again.
			</p>
		);
	}

	const { edges, users } = data;

	// AD3 AC-2: solo contextual message when exactly 1 human user.
	// 0 humans (all-agent org) sees the full UI since there's nothing to hide.
	const humanUsers = users.filter((u) => u.kind === "human");
	if (humanUsers.length === 1) {
		return (
			<p className="text-[13px] text-[var(--text-secondary)]">
				Org chart manages reporting lines between humans. Add a second human user to start defining
				your org structure.
			</p>
		);
	}

	// Resolve display name for a user id
	const userName = (id: string): string => users.find((u) => u.id === id)?.name ?? id;

	return (
		<div className="flex flex-col gap-[12px]">
			{/* Edge table */}
			{edges.length === 0 ? (
				<p className="text-[13px] text-[var(--text-tertiary)]">No edges defined.</p>
			) : (
				<table className="table table-xs w-full">
					<thead>
						<tr>
							<th className="text-[var(--text-tertiary)]">From</th>
							<th className="text-[var(--text-tertiary)]">Mechanism</th>
							<th className="text-[var(--text-tertiary)]">Target</th>
							<th />
						</tr>
					</thead>
					<tbody>
						{edges.map((edge) => (
							<tr key={edge.id}>
								<td className="text-[13px]">{userName(edge.fromUserId)}</td>
								<td className="text-[13px] font-mono text-[var(--text-secondary)]">
									{edge.mechanism}
								</td>
								<td className="text-[13px]">{edge.target}</td>
								<td>
									<button
										type="button"
										className="inline-flex items-center text-[12px] font-[500] px-[9px] py-[3px] rounded-[var(--r-pill)] bg-transparent border-[1.5px] border-[var(--border-default)] text-[var(--status-error)] cursor-pointer hover:border-[var(--status-error)] transition-colors duration-[var(--motion-fast)]"
										onClick={() => void handleDelete(edge.id)}
										disabled={deletingId === edge.id}
										aria-label={`Delete edge ${edge.id}`}
									>
										{deletingId === edge.id ? "…" : "Delete"}
									</button>
								</td>
							</tr>
						))}
					</tbody>
				</table>
			)}

			{/* Add Edge */}
			{!showAddForm ? (
				<button
					type="button"
					className="inline-flex items-center text-[13px] font-[500] px-[12px] py-[7px] rounded-[var(--r-pill)] bg-transparent border-[1.5px] border-[var(--border-default)] text-[var(--text-secondary)] cursor-pointer hover:border-[var(--accent-primary)] hover:text-[var(--text-primary)] self-start transition-colors duration-[var(--motion-fast)]"
					onClick={() => setShowAddForm(true)}
					data-testid="add-edge-btn"
				>
					+ Add Edge
				</button>
			) : (
				<AddEdgeForm
					users={users}
					edges={edges}
					fromUserId={fromUserId}
					mechanism={mechanism}
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
	edges: OrgEdge[];
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

/**
 * Derives team names from existing org edges with mechanism="team".
 * Falls back to an empty list when no team edges exist.
 *
 * @lore visual-parity issue-16: the /api/org endpoint returns edges and users,
 * not a separate teams list. Teams are derived from edges where mechanism="team"
 * and the target field contains the team name. This gives a best-effort list of
 * known teams without a separate API call.
 */
function deriveTeams(edges: OrgEdge[]): string[] {
	const seen = new Set<string>();
	for (const edge of edges) {
		if (edge.mechanism === "team" && edge.target) {
			seen.add(edge.target);
		}
	}
	return Array.from(seen).sort();
}

function AddEdgeForm({
	users,
	edges,
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
	const teams = useMemo(() => deriveTeams(edges), [edges]);
	const canAdd = Boolean(fromUserId && target && !adding);

	return (
		<div className="flex flex-col gap-[12px] p-[18px] border-[1.5px] border-[var(--border-subtle)] rounded-[var(--r-subtle)]">
			<div className="flex gap-[12px] flex-wrap">
				{/* From */}
				<div className="flex flex-col gap-[6px] flex-1 min-w-[120px]">
					<label
						htmlFor="org-from"
						className="text-[12px] font-[600] uppercase tracking-[0.06em] text-[var(--text-tertiary)]"
					>
						From
					</label>
					<select
						id="org-from"
						style={selectStyle}
						value={fromUserId}
						onChange={(e) => onFromChange(e.target.value)}
						aria-label="From user"
						disabled={adding}
					>
						<option value="">Select user…</option>
						{users.map((u) => (
							<option key={u.id} value={u.id}>
								{u.name}
							</option>
						))}
					</select>
				</div>

				{/* Mechanism */}
				<div className="flex flex-col gap-[6px] flex-1 min-w-[120px]">
					<label
						htmlFor="org-mechanism"
						className="text-[12px] font-[600] uppercase tracking-[0.06em] text-[var(--text-tertiary)]"
					>
						Mechanism
					</label>
					<select
						id="org-mechanism"
						style={selectStyle}
						value={mechanism}
						onChange={(e) => onMechanismChange(e.target.value as OrgEdgeMechanism)}
						aria-label="Mechanism"
						disabled={adding}
					>
						{MECHANISMS.map((m) => (
							<option key={m} value={m}>
								{m}
							</option>
						))}
					</select>
				</div>

				{/* Target — context-aware by mechanism */}
				<div className="flex flex-col gap-[6px] flex-1 min-w-[120px]">
					<label
						htmlFor="org-target"
						className="text-[12px] font-[600] uppercase tracking-[0.06em] text-[var(--text-tertiary)]"
					>
						Target
					</label>
					{mechanism === "direct" ? (
						<select
							id="org-target"
							style={selectStyle}
							value={target}
							onChange={(e) => onTargetChange(e.target.value)}
							aria-label="Target user"
							disabled={adding}
						>
							<option value="">Select user…</option>
							{users.map((u) => (
								<option key={u.id} value={u.id}>
									{u.name}
								</option>
							))}
						</select>
					) : mechanism === "team" ? (
						<select
							id="org-target"
							style={selectStyle}
							value={target}
							onChange={(e) => onTargetChange(e.target.value)}
							aria-label="Target team"
							disabled={adding}
						>
							<option value="">Select team…</option>
							{teams.map((t) => (
								<option key={t} value={t}>
									{t}
								</option>
							))}
							{/* Allow typing a new team name not yet in the list */}
							{target && !teams.includes(target) && <option value={target}>{target}</option>}
						</select>
					) : (
						/* mechanism === "function": free-text input */
						<input
							id="org-target"
							type="text"
							style={inputStyle}
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
				<button
					type="button"
					className="inline-flex items-center text-[13px] font-[500] px-[12px] py-[7px] rounded-[var(--r-pill)] bg-transparent border-[1.5px] border-[var(--border-default)] text-[var(--text-secondary)] cursor-pointer hover:border-[var(--accent-primary)] hover:text-[var(--text-primary)] transition-colors duration-[var(--motion-fast)]"
					onClick={onCancel}
					disabled={adding}
				>
					Cancel
				</button>
				<button
					type="button"
					className="inline-flex items-center text-[13px] font-[500] px-[12px] py-[7px] rounded-[var(--r-pill)] bg-[var(--accent-primary)] text-[var(--text-on-accent)] border-none cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed transition-opacity duration-[var(--motion-fast)]"
					onClick={onAdd}
					disabled={!canAdd}
					data-testid="org-add-submit"
				>
					{adding ? "Adding…" : "Add"}
				</button>
			</div>
		</div>
	);
}
