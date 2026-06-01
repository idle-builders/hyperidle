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
 */

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

interface OrgData {
	edges: OrgEdge[];
	users: OrgUser[];
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
			showToast("Edge added");
		} catch (err) {
			showToast(err instanceof Error ? err.message : "Failed to add edge");
		} finally {
			setAdding(false);
		}
	}, [fromUserId, mechanism, target, showToast]);

	if (status === "loading") {
		return (
			<div className="flex flex-col gap-3">
				<div className="skeleton h-8 w-full" />
				<div className="skeleton h-8 w-full" />
			</div>
		);
	}

	if (status === "error" || !data) {
		return <p className="text-sm text-error">Failed to load org chart. Please try again.</p>;
	}

	const { edges, users } = data;

	// Resolve display name for a user id
	const userName = (id: string): string => users.find((u) => u.id === id)?.name ?? id;

	return (
		<div className="flex flex-col gap-3">
			{/* Edge table */}
			{edges.length === 0 ? (
				<p className="text-sm text-[var(--text-tertiary)]">No edges defined.</p>
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
								<td className="text-sm">{userName(edge.fromUserId)}</td>
								<td className="text-sm font-mono text-[var(--text-secondary)]">{edge.mechanism}</td>
								<td className="text-sm">{edge.target}</td>
								<td>
									<button
										type="button"
										className="btn btn-ghost btn-xs text-error"
										onClick={() => handleDelete(edge.id)}
										disabled={deletingId === edge.id}
										aria-label={`Delete edge ${edge.id}`}
									>
										{deletingId === edge.id ? (
											<span className="loading loading-spinner loading-xs" />
										) : (
											"Delete"
										)}
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
					className="btn btn-ghost btn-sm self-start"
					onClick={() => setShowAddForm(true)}
					data-testid="add-edge-btn"
				>
					+ Add Edge
				</button>
			) : (
				<div className="flex flex-col gap-2 p-3 border border-[var(--border-subtle)] rounded-[var(--r-subtle)]">
					<div className="flex gap-2 flex-wrap">
						<div className="form-control flex-1 min-w-[120px]">
							<label className="label" htmlFor="org-from">
								<span className="label-text text-[var(--text-secondary)]">From</span>
							</label>
							<select
								id="org-from"
								className="select select-sm select-bordered"
								value={fromUserId}
								onChange={(e) => setFromUserId(e.target.value)}
								aria-label="From user"
							>
								<option value="">Select user…</option>
								{users.map((u) => (
									<option key={u.id} value={u.id}>
										{u.name}
									</option>
								))}
							</select>
						</div>

						<div className="form-control flex-1 min-w-[120px]">
							<label className="label" htmlFor="org-mechanism">
								<span className="label-text text-[var(--text-secondary)]">Mechanism</span>
							</label>
							<select
								id="org-mechanism"
								className="select select-sm select-bordered"
								value={mechanism}
								onChange={(e) => setMechanism(e.target.value as OrgEdgeMechanism)}
								aria-label="Mechanism"
							>
								{MECHANISMS.map((m) => (
									<option key={m} value={m}>
										{m}
									</option>
								))}
							</select>
						</div>

						<div className="form-control flex-1 min-w-[120px]">
							<label className="label" htmlFor="org-target">
								<span className="label-text text-[var(--text-secondary)]">Target</span>
							</label>
							<input
								id="org-target"
								type="text"
								className="input input-sm input-bordered"
								value={target}
								onChange={(e) => setTarget(e.target.value)}
								placeholder="user id, role, or team id"
								aria-label="Target"
							/>
						</div>
					</div>

					<div className="flex gap-2 justify-end">
						<button
							type="button"
							className="btn btn-ghost btn-sm"
							onClick={() => {
								setShowAddForm(false);
								setFromUserId("");
								setMechanism("direct");
								setTarget("");
							}}
						>
							Cancel
						</button>
						<button
							type="button"
							className="btn btn-primary btn-sm"
							onClick={handleAdd}
							disabled={adding || !fromUserId || !target}
						>
							{adding && <span className="loading loading-spinner loading-xs" />}
							Add
						</button>
					</div>
				</div>
			)}
		</div>
	);
}
