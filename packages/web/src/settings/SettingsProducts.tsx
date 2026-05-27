/**
 * SettingsProducts — Products settings section.
 *
 * P4 Task 10: Settings section stubs (AC-12, AC-19)
 * Lists products and their active/inactive state.
 */

import type { JSX } from "react";
import { useSettings } from "../hooks/useSettings.js";

export function SettingsProducts(): JSX.Element {
	const { settings, status } = useSettings();

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

	const { products } = settings;

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
					<span
						className={
							product.active ? "badge badge-sm badge-success" : "badge badge-sm badge-ghost"
						}
					>
						{product.active ? "Active" : "Inactive"}
					</span>
				</li>
			))}
		</ul>
	);
}
