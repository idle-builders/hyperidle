/**
 * Work/Portfolio page — portfolio overview composed from product status
 * cards + portfolio metrics. Per spec (HUMAN_INTERFACE_LAYER.md §4.3) the
 * Portfolio canvas is a *summary* of products, not the bet board (which
 * lives in WorkTeam).
 */
import type { JSX } from "react";
import { KeyValue } from "../components/KeyValue";
import { StatusChip } from "../components/StatusChip";
import { MOCK_PRODUCTS } from "../fixtures/portfolio-data";

export function WorkPortfolio(): JSX.Element {
	return (
		<div className="flex flex-col gap-3 h-full" data-testid="work-portfolio-page">
			<h1 className="text-sm font-heading font-semibold uppercase tracking-wider text-[var(--text-hi)]">
				Portfolio
			</h1>
			<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
				{MOCK_PRODUCTS.map((product) => (
					// Design H4: the product status card uses tonal layering
					// (bg-base-200 + shadow-sm) instead of a decorative border —
					// UI_DESIGN.md §Rules: "surfaces use tonal layering only,
					// no borders except ghost".
					<div
						key={product.id}
						data-testid="product-card"
						className="bg-base-200 rounded p-3 flex flex-col gap-2 shadow-sm"
					>
						<div className="flex items-center justify-between gap-2">
							<span className="text-sm font-medium text-[var(--text-hi)]">{product.name}</span>
							<StatusChip status={product.status} />
						</div>
						<KeyValue label="Active bets" value={String(product.activeBets)} />
						<KeyValue label="Ship rate" value={product.shipRate} />
					</div>
				))}
			</div>
		</div>
	);
}
