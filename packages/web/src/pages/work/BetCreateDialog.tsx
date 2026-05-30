/**
 * BetCreateDialog — Q3 bet creation flow.
 *
 * Opens as a native <dialog> (same pattern as KnowledgeCreateDialog in Q2).
 * Fields: product select, pitch textarea (h-40), title preview, optional appetite
 * (amount + currency). The dialog validates: product required, pitch non-empty.
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
 * @lore Q3 S-4: appetite amount input uses step="any" (not step="1") to allow
 * decimal amounts like $12.50. Major-to-minor conversion: minor = amount * 10^scale.
 *
 * @lore Q3 reviewer: mobile dialog sizing — min-w-[320px] max-w-[480px] w-full.
 * Inputs are text-base (16px) to prevent iOS Safari zoom on focus.
 */

import { CURRENCY_CODES, CURRENCY_SCALE, type CurrencyCode, deriveTitle } from "@hyperidle/shared";
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

	const [teamId, setTeamId] = useState("");
	const [pitch, setPitch] = useState("");
	const [appetiteAmount, setAppetiteAmount] = useState("");
	const [appetiteCurrency, setAppetiteCurrency] = useState<CurrencyCode>("USD");
	const [submitting, setSubmitting] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const derivedTitle = pitch.trim() ? deriveTitle(pitch, "") : "";
	const canCreate = teamId.trim().length > 0 && pitch.trim().length > 0 && !submitting;

	// Sync the native dialog open/closed state with the `open` prop.
	// @lore Q3: same JSDOM guard as KnowledgeCreateDialog — showModal() is not
	// implemented in JSDOM so we fall back to setAttribute("open", "").
	useEffect(() => {
		if (!dialogRef.current) return;
		if (open) {
			// Reset form state on open.
			setTeamId("");
			setPitch("");
			setAppetiteAmount("");
			setAppetiteCurrency("USD");
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
		const trimmedPitch = pitch.trim();
		const trimmedTeamId = teamId.trim();
		if (!(trimmedPitch && trimmedTeamId)) return;

		setSubmitting(true);
		setError(null);

		// Build costAppetite payload — omit when amount is empty or zero.
		let costAppetite: { minor: number; currency: CurrencyCode } | undefined;
		const parsedAmount = Number.parseFloat(appetiteAmount);
		if (appetiteAmount.trim() && !Number.isNaN(parsedAmount) && parsedAmount > 0) {
			const scale = CURRENCY_SCALE[appetiteCurrency];
			const minor = Math.round(parsedAmount * 10 ** scale);
			costAppetite = { minor, currency: appetiteCurrency };
		}

		const payload: Record<string, unknown> = {
			teamId: trimmedTeamId,
			description: trimmedPitch,
		};
		if (costAppetite) {
			payload.costAppetite = costAppetite;
		}

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
					<h2 className="text-sm font-heading font-semibold uppercase tracking-wider">New pitch</h2>

					{/* Team select */}
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

					{/* Pitch textarea */}
					<label className="flex flex-col gap-1">
						<span className="text-xs text-[var(--text-lo)]">
							Pitch <span aria-hidden>(required)</span>
						</span>
						<textarea
							className="textarea textarea-bordered text-base resize-none h-40 w-full"
							placeholder="Describe the bet in markdown…"
							value={pitch}
							onChange={(e) => setPitch(e.target.value)}
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

					{/* Appetite — optional */}
					<div className="flex gap-2">
						<label className="flex flex-col gap-1 flex-1">
							<span className="text-xs text-[var(--text-lo)]">Appetite amount</span>
							<input
								type="number"
								name="appetite-amount"
								className="input input-bordered input-sm text-base w-full"
								placeholder="0.00"
								aria-label="Appetite amount"
								value={appetiteAmount}
								step="any"
								min="0"
								onChange={(e) => setAppetiteAmount(e.target.value)}
								disabled={submitting}
							/>
						</label>
						<label className="flex flex-col gap-1">
							<span className="text-xs text-[var(--text-lo)]">Currency</span>
							<select
								className="select select-bordered select-sm text-base"
								aria-label="Currency"
								value={appetiteCurrency}
								onChange={(e) => setAppetiteCurrency(e.target.value as CurrencyCode)}
								disabled={submitting}
							>
								{CURRENCY_CODES.map((code) => (
									<option key={code} value={code}>
										{code}
									</option>
								))}
							</select>
						</label>
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
