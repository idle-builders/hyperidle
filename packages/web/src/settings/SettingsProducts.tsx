/**
 * SettingsProducts — Products settings section.
 *
 * P4 Task 10: Settings section (AC-12, AC-18)
 * Lists products with active/archived toggle.
 *
 * Toggling calls PATCH /api/products/:id to update phase (build ↔ archived).
 * Active products are those with phase !== "archived".
 */

import { type JSX, useCallback, useState } from "react";
import { useSettings } from "../hooks/useSettings.js";
import { apiFetch } from "../services/api-fetch.js";
import { useToast } from "../shell/ToastRegion.js";
import type { ProductSetting } from "./settings-types.js";

export function SettingsProducts(): JSX.Element {
	const { settings, status } = useSettings();
	const { showToast } = useToast();
	// Local product state for optimistic updates
	const [localProducts, setLocalProducts] = useState<ProductSetting[] | null>(null);
	const [togglingId, setTogglingId] = useState<string | null>(null);

	// Initialize local state from loaded settings
	const sourceProducts = settings?.products ?? null;
	if (localProducts === null && sourceProducts !== null) {
		setLocalProducts(sourceProducts);
	}

	const handleToggle = useCallback(
		async (productId: string, currentlyActive: boolean): Promise<void> => {
			// Optimistically update
			const newPhase = currentlyActive ? "archived" : "build";
			setLocalProducts((prev) =>
				prev
					? prev.map((p) => (p.id === productId ? { ...p, active: !currentlyActive } : p))
					: prev,
			);
			setTogglingId(productId);
			try {
				const res = await apiFetch(`/api/products/${encodeURIComponent(productId)}`, {
					method: "PATCH",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ phase: newPhase }),
				});
				if (!res.ok) {
					throw new Error(`HTTP ${res.status}`);
				}
				showToast(`Product ${currentlyActive ? "archived" : "activated"}`);
			} catch {
				// Revert on failure
				setLocalProducts((prev) =>
					prev
						? prev.map((p) => (p.id === productId ? { ...p, active: currentlyActive } : p))
						: prev,
				);
				showToast("Failed to update product");
			} finally {
				setTogglingId(null);
			}
		},
		[showToast],
	);

	if (status === "loading") {
		return (
			<div className="flex flex-col gap-3">
				<div className="skeleton h-8 w-full" />
				<div className="skeleton h-8 w-full" />
			</div>
		);
	}

	if (status === "error" || !settings) {
		return <p className="text-sm text-error">Failed to load products. Please try again.</p>;
	}

	const products = localProducts ?? settings.products;

	if (products.length === 0) {
		return (
			<p className="text-sm text-[var(--text-lo)]">
				No products configured. Add products from the Work view.
			</p>
		);
	}

	return (
		<ul className="flex flex-col gap-2">
			{products.map((product) => (
				<li key={product.id} className="flex items-center justify-between gap-2 text-sm">
					<span className="text-[var(--text-hi)]">{product.name}</span>
					<input
						type="checkbox"
						className="toggle toggle-sm toggle-primary"
						checked={product.active}
						onChange={() => handleToggle(product.id, product.active)}
						disabled={togglingId === product.id}
						aria-label={`Toggle ${product.name} active`}
					/>
				</li>
			))}
		</ul>
	);
}
