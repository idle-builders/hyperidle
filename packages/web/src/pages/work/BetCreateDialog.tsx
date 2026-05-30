/**
 * BetCreateDialog — bet creation flow.
 *
 * Opens as a native <dialog>. Fields: optional product select (shown only when
 * multiple products exist), pitch textarea, title preview.
 * The dialog validates: product required (auto-resolved for single product),
 * pitch non-empty.
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
 * @lore R2: appetite fields removed per spec. Product select hidden when only
 * one product exists — productId auto-resolved to the single product.
 * Submit payload no longer includes costAppetite.
 */

import { deriveTitleFromPitch } from "@hyperidle/shared";
import { type JSX, useEffect, useRef, useState } from "react";
import { apiFetch } from "../../services/api-fetch.js";

export interface BetProduct {
	id: string;
	name: string;
}

export interface BetCreateDialogProps {
	open: boolean;
	onClose: () => void;
	onCreated: () => void;
	/** List of products to display in the product select. */
	products: BetProduct[];
}

export function BetCreateDialog({
	open,
	onClose,
	onCreated,
	products,
}: BetCreateDialogProps): JSX.Element | null {
	const dialogRef = useRef<HTMLDialogElement>(null);

	// R2: productId only needed when multiple products exist
	const [productId, setProductId] = useState("");
	const [pitch, setPitch] = useState("");
	const [submitting, setSubmitting] = useState(false);
	const [error, setError] = useState<string | null>(null);

	// R2: when only one product, auto-resolve; otherwise use the select value
	const singleProduct = products.length === 1;
	const resolvedProductId = singleProduct ? (products[0]?.id ?? "") : productId;

	const derivedTitle = pitch.trim() ? deriveTitleFromPitch(pitch, "") : "";
	const canCreate = resolvedProductId.trim().length > 0 && pitch.trim().length > 0 && !submitting;

	// Sync the native dialog open/closed state with the `open` prop.
	// @lore Q3: same JSDOM guard as KnowledgeCreateDialog — showModal() is not
	// implemented in JSDOM so we fall back to setAttribute("open", "").
	useEffect(() => {
		if (!dialogRef.current) return;
		if (open) {
			// Reset form state on open.
			setProductId("");
			setPitch("");
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
		if (!(trimmedPitch && resolvedProductId.trim())) return;

		setSubmitting(true);
		setError(null);

		const payload: Record<string, unknown> = {
			productId: resolvedProductId,
			pitch: trimmedPitch,
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
					<h2 className="text-sm font-heading font-semibold uppercase tracking-wider">New pitch</h2>

					{/* R2: Product select — only shown when multiple products exist */}
					{products.length > 1 && (
						<label className="flex flex-col gap-1">
							<span className="text-xs text-[var(--text-lo)]">
								Product <span aria-hidden>(required)</span>
							</span>
							<select
								className="select select-bordered select-sm text-base w-full"
								value={productId}
								onChange={(e) => setProductId(e.target.value)}
								disabled={submitting}
							>
								<option value="">Select a product…</option>
								{products.map((p) => (
									<option key={p.id} value={p.id}>
										{p.name}
									</option>
								))}
							</select>
						</label>
					)}

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
