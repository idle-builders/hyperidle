/**
 * BetCreateDialog — bet creation flow.
 *
 * Opens as a native <dialog>. Fields: optional team select (shown only when
 * multiple teams exist), description textarea, title preview.
 * The dialog validates: team required (auto-resolved for single team),
 * description non-empty.
 *
 * @lore Q3 W-1: buttons use btn-sm with min-h-[44px] to meet AQ-015 44px touch
 * target floor. btn-xs is forbidden.
 *
 * @lore Q3 W-2: all fields use <label> elements, not <span> labels, per design
 * critique W-2.
 *
 * @lore Q3 W-3: deriveTitleFromPitch imported from @hyperidle/shared to share
 * the same logic with the server canvas endpoint.
 *
 * @lore R2: appetite fields removed per spec. Team select hidden when only
 * one team exists — teamId auto-resolved to the single team.
 * Submit payload no longer includes costAppetite.
 *
 * @lore U1: Renamed `products`/`productId` → `teams`/`teamId`; `pitch` →
 * `description` in the submit payload to match the U1 schema rename.
 */

import { deriveTitleFromPitch } from "@hyperidle/shared";
import { type JSX, useEffect, useRef, useState } from "react";
import { apiFetch } from "../../services/api-fetch.js";

export interface BetTeam {
	id: string;
	name: string;
}

export interface BetCreateDialogProps {
	open: boolean;
	onClose: () => void;
	onCreated: () => void;
	/** List of teams to display in the team select. */
	teams: BetTeam[];
}

export function BetCreateDialog({
	open,
	onClose,
	onCreated,
	teams,
}: BetCreateDialogProps): JSX.Element | null {
	const dialogRef = useRef<HTMLDialogElement>(null);

	// R2: teamId only needed when multiple teams exist
	const [teamId, setTeamId] = useState("");
	const [description, setDescription] = useState("");
	const [submitting, setSubmitting] = useState(false);
	const [error, setError] = useState<string | null>(null);

	// R2: when only one team, auto-resolve; otherwise use the select value
	const singleTeam = teams.length === 1;
	const resolvedTeamId = singleTeam ? (teams[0]?.id ?? "") : teamId;

	const derivedTitle = description.trim() ? deriveTitleFromPitch(description, "") : "";
	const canCreate =
		resolvedTeamId.trim().length > 0 && description.trim().length > 0 && !submitting;

	// Sync the native dialog open/closed state with the `open` prop.
	// @lore Q3: same JSDOM guard as KnowledgeCreateDialog — showModal() is not
	// implemented in JSDOM so we fall back to setAttribute("open", "").
	useEffect(() => {
		if (!dialogRef.current) return;
		if (open) {
			// Reset form state on open.
			setTeamId("");
			setDescription("");
			setError(null);
			setSubmitting(false);
			if (!dialogRef.current.open) {
				if (typeof dialogRef.current.showModal === "function") {
					dialogRef.current.showModal();
				} else {
					dialogRef.current.setAttribute("open", "");
				}
			}
		} else if (dialogRef.current.open) {
			if (typeof dialogRef.current.close === "function") {
				dialogRef.current.close();
			} else {
				dialogRef.current.removeAttribute("open");
			}
		}
	}, [open]);

	const handleSubmit = async (): Promise<void> => {
		const trimmedDescription = description.trim();
		if (!(trimmedDescription && resolvedTeamId.trim())) return;

		setSubmitting(true);
		setError(null);

		const payload: Record<string, unknown> = {
			teamId: resolvedTeamId,
			description: trimmedDescription,
		};

		const res = await apiFetch("/api/bets", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(payload),
		});

		if (!res.ok) {
			const data = (await res.json().catch(() => ({}))) as { error?: string };
			setError(data.error ?? `Failed to create bet: ${res.status}`);
			setSubmitting(false);
			return;
		}

		setSubmitting(false);
		onCreated();
		onClose();
	};

	const handleCancel = (): void => {
		if (submitting) return;
		onClose();
	};

	return (
		<dialog ref={dialogRef} aria-modal="true" aria-label="Create new bet">
			{/* @lore Q3: only render dialog content when open. This prevents
			    select options from appearing in the DOM when closed, which would
			    cause `getByText` to find duplicate text in tests. */}
			{open && (
				<div className="p-4 flex flex-col gap-3 min-w-[320px] max-w-[480px] w-full">
					<h2 className="text-sm font-heading font-semibold uppercase tracking-wider">New bet</h2>

					{/* R2: Team select — only shown when multiple teams exist */}
					{teams.length > 1 && (
						<label className="flex flex-col gap-1">
							<span className="text-xs text-[var(--text-lo)]">
								Team <span aria-hidden>(required)</span>
							</span>
							<select
								className="select select-bordered select-sm text-base w-full"
								value={teamId}
								onChange={(e) => setTeamId(e.target.value)}
								disabled={submitting}
							>
								<option value="">Select a team…</option>
								{teams.map((t) => (
									<option key={t.id} value={t.id}>
										{t.name}
									</option>
								))}
							</select>
						</label>
					)}

					{/* Description textarea */}
					<label className="flex flex-col gap-1">
						<span className="text-xs text-[var(--text-lo)]">
							Description <span aria-hidden>(required)</span>
						</span>
						<textarea
							className="textarea textarea-bordered text-base resize-none h-40 w-full"
							placeholder="Describe the bet in markdown…"
							value={description}
							onChange={(e) => setDescription(e.target.value)}
							disabled={submitting}
						/>
					</label>

					{/* Title preview */}
					<div className="flex flex-col gap-1">
						<span className="text-xs text-[var(--text-lo)]">Title preview</span>
						<p
							data-testid="bet-title-preview"
							className="text-sm text-[var(--text-mid)] italic truncate"
						>
							{derivedTitle || "—"}
						</p>
					</div>

					{error && (
						<p role="alert" className="text-xs text-error">
							{error}
						</p>
					)}

					<div className="flex gap-2 justify-end">
						<button
							type="button"
							className="btn btn-sm btn-ghost min-h-[44px]"
							onClick={handleCancel}
							disabled={submitting}
						>
							Cancel
						</button>
						<button
							type="button"
							className="btn btn-sm btn-primary min-h-[44px]"
							onClick={() => void handleSubmit()}
							disabled={!canCreate}
						>
							{submitting ? "…" : "Create"}
						</button>
					</div>
				</div>
			)}
		</dialog>
	);
}
