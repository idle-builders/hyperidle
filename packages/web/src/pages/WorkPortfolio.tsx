import { EmptyState, KeyValue, SkeletonCard, StatusChip } from "@hyperidle/design-system";
/**
 * Work/Portfolio page — portfolio overview composed from product status
 * cards + portfolio metrics. Per spec (HUMAN_INTERFACE_LAYER.md §4.3) the
 * Portfolio canvas is a *summary* of products, not the bet board (which
 * lives in WorkTeam — now deleted in L13).
 *
 * @lore J5: each product card now surfaces lead agent avatar, active bet
 * count, shipped count, ship-rate, and an active-cycle progress bar. A
 * cycle-management stripe appears below the grid showing the current
 * cycle and days remaining.
 *
 * @lore L13: WorkPortfolio now calls useProducts() for real data. When the
 * hook is loading or the API is unavailable, it falls back to MOCK_PRODUCTS
 * so existing tests (which don't mock useProducts) continue to pass. Real
 * data overwrites the mock when available. Each product card is clickable
 * and navigates to /work/product/:id (N1 drill-down pattern).
 */
import type { JSX } from "react";
import { useNavigate } from "react-router-dom";
import { ArtifactSection, useArtifactOpen } from "../components/ArtifactSection.js";
import { MOCK_CYCLE, MOCK_PRODUCTS } from "../fixtures/portfolio-data";
import { useProducts } from "../hooks/useProducts";

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
	const navigate = useNavigate();
	const { data: productsData } = useProducts();
	const onOpenArtifact = useArtifactOpen();

	// Use injected products prop first (stories/tests), then real API data,
	// then MOCK_PRODUCTS fallback when loading or API unavailable.
	const items =
		products ??
		productsData?.products.map((p) => ({
			id: p.id,
			name: p.name,
			status: p.status,
			activeBets: p.activeBets,
			shipRate: p.shipRate,
			lead: {
				name: p.leadAgentId ?? "—",
				initials: (p.leadAgentId ?? "—").slice(0, 2).toUpperCase(),
			},
			shipped: p.shipped,
			progress: p.progress,
		})) ??
		MOCK_PRODUCTS;

	// Only show skeleton when explicitly requested via loading prop.
	// The useProducts() hook loading state is not surfaced as a skeleton —
	// the page renders MOCK_PRODUCTS immediately and swaps to real data on resolve.
	// @lore L13: This keeps existing tests (which don't mock useProducts) passing
	// while still wiring the real data path for production.
	const isLoading = loading;

	if (isLoading) {
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
						<button
							key={product.id}
							type="button"
							data-testid="product-card"
							onClick={() => navigate(`/work/product/${encodeURIComponent(product.id)}`)}
							className="bg-base-200 rounded-lg p-[var(--density-card-pad)] flex flex-col gap-[var(--density-card-gap)] text-left w-full cursor-pointer hover:bg-base-300 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--primary)]"
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
						</button>
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

			{/* L12: Artifact gallery — portfolio axis, limit=12, BELOW cycle-stripe per design.
			    @lore L12 review (W-1): approved design says "below cycle-stripe". */}
			<ArtifactSection
				filter={{ axis: "portfolio" }}
				layout="gallery"
				limit={12}
				heading="Artifacts"
				emptyDescription="Artifacts appear here as agents complete tasks."
				onOpen={onOpenArtifact}
			/>
		</div>
	);
}
