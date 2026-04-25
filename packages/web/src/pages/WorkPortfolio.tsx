import { EmptyState, KeyValue, SkeletonCard, StatusChip } from "@hyperidle/design-system";
/**
 * Work/Portfolio page — portfolio overview composed from product status
 * cards + portfolio metrics. Per spec (HUMAN_INTERFACE_LAYER.md §4.3) the
 * Portfolio canvas is a *summary* of products, not the bet board (which
 * lives in WorkTeam).
 *
 * @lore J5: each product card now surfaces lead agent avatar, active bet
 * count, shipped count, ship-rate, and an active-cycle progress bar. A
 * cycle-management stripe appears below the grid showing the current
 * cycle and days remaining.
 */
import type { JSX } from "react";
import { MOCK_CYCLE, MOCK_PRODUCTS } from "../fixtures/portfolio-data";

export interface WorkPortfolioProps {
	/**
	 * J8: opt-in loading state so callers (and stories) can render a
	 * card-grid skeleton. Defaults to false so the production render path
	 * is unchanged.
	 */
	loading?: boolean;
	/**
	 * J8: opt-in override of the product list so the empty state can be
	 * exercised via props (and in stories) without mutating the shared
	 * fixture module.
	 */
	products?: typeof MOCK_PRODUCTS;
}

export function WorkPortfolio({ loading = false, products }: WorkPortfolioProps = {}): JSX.Element {
	const items = products ?? MOCK_PRODUCTS;

	if (loading) {
		return (
			<div
				className="flex flex-col gap-[var(--density-gap)] h-full"
				data-testid="work-portfolio-page"
			>
				<h1 className="text-sm font-heading font-semibold uppercase tracking-wider text-[var(--text-lo)]">
					Portfolio
				</h1>
				<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-[var(--density-gap)]">
					<SkeletonCard ariaLabel="Loading product" />
					<SkeletonCard ariaLabel="Loading product" />
					<SkeletonCard ariaLabel="Loading product" />
				</div>
			</div>
		);
	}

	return (
		<div
			/*
			 * @lore K11: page section gap → --density-gap per
			 * density-audit.md § 3.4.P1. Page outer pad inherits from
			 * `<main>`'s --density-page-gutter. The H1 stays uppercase mono
			 * (chrome) and does NOT consume --density-text-h1.
			 */
			className="flex flex-col gap-[var(--density-gap)] h-full"
			data-testid="work-portfolio-page"
		>
			<h1 className="text-sm font-heading font-semibold uppercase tracking-wider text-[var(--text-lo)]">
				Portfolio
			</h1>
			{items.length === 0 ? (
				<EmptyState
					title="No products in the portfolio"
					description="Add a product from Settings to start shaping bets and tracking ship rate here."
					dataTestId="portfolio-empty"
				/>
			) : (
				<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-[var(--density-gap)]">
					{items.map((product) => (
						/*
						 * @lore K11 § 3.4.P1: the inline product card adopts
						 * BetCard's density shape (--density-card-pad,
						 * --density-card-gap, --density-text title) so it
						 * scales in the same direction. Future story should
						 * unify with BetCard outright (BetCard already has
						 * leadAvatar / activeBets / shipped portfolio props
						 * from J5). The product avatar stays literal 24 px
						 * — card-internal, not row-anchor (§ 4.4).
						 */
						<div
							key={product.id}
							data-testid="product-card"
							className="bg-base-200 rounded-lg p-[var(--density-card-pad)] flex flex-col gap-[var(--density-card-gap)]"
						>
							<div className="flex items-center gap-[var(--density-gap)]">
								<span
									className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-base-300 text-[var(--text-hi)] text-xs font-semibold"
									aria-label={`Lead agent: ${product.lead.name}`}
								>
									{product.lead.initials}
								</span>
								<span className="text-[length:var(--density-text)] font-medium text-[var(--text-hi)] flex-1 truncate">
									{product.name}
								</span>
								<StatusChip status={product.status} />
							</div>
							<KeyValue
								label={product.activeBets === 1 ? "Active bet" : "Active bets"}
								value={String(product.activeBets)}
							/>
							<KeyValue label="Shipped" value={String(product.shipped)} />
							<KeyValue label="Ship rate" value={product.shipRate} />
							<div className="flex items-center gap-[var(--density-gap)]">
								{/* @lore K10: progress-bar height stays literal (h-1.5 / 6 px) —
								    instrument metric per density-audit.md § 3.4.P1. */}
								<progress
									className="progress progress-accent w-full h-1.5"
									value={product.progress.done}
									max={product.progress.total}
									aria-label={`Cycle progress for ${product.name}`}
								/>
								<span className="text-xs text-[var(--text-mid)] shrink-0">
									{product.progress.done}/{product.progress.total}
								</span>
							</div>
						</div>
					))}
				</div>
			)}
			<div
				data-testid="cycle-stripe"
				/* @lore K11: cycle stripe outer pad → --density-card-pad per § 3.4.P1. */
				className="bg-base-200 rounded-lg p-[var(--density-card-pad)] flex items-center justify-between gap-[var(--density-gap)]"
			>
				<span className="text-sm font-heading font-semibold uppercase tracking-wider text-[var(--text-lo)]">
					{MOCK_CYCLE.label}
				</span>
				<span className="text-xs text-[var(--text-mid)]">
					{`${MOCK_CYCLE.daysRemaining} ${
						MOCK_CYCLE.daysRemaining === 1 ? "day remaining" : "days remaining"
					}`}
				</span>
			</div>
		</div>
	);
}
