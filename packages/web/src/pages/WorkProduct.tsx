/**
 * L13 — Work/Product page: unified product team view.
 *
 * Layout (V1 — Stacked single column, per design/approved.md):
 *   R1 — Product header (breadcrumb + name + status + phase + lead)
 *   R4 — Team burn vs cap
 *   R2 — Active bets
 *   R3 — Roster
 *   Artifact slot (placeholder for L12)
 *
 * @lore L13: Product = Team 1:1 invariant. The page is addressed by productId
 * (the public identifier), never by teamId. See plans/L13/concept.md.
 *
 * @lore L13: The `overrideData` / `overrideLoading` / `overrideError` props
 * mirror WorkBet's `overrideBet` / `loading` props — used by stories and tests
 * to inject fixture data without crossing the __fixtures__/ import boundary.
 */

import {
	betStatusToStatus,
	EmptyState,
	ErrorState,
	KeyValue,
	SkeletonCard,
	StatusChip,
} from "@hyperidle/design-system";
import type { BetCardSummary, ProductDetail } from "@hyperidle/shared";
import type { JSX } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useProduct } from "../hooks/useProduct";

export interface WorkProductProps {
	/**
	 * Override the product detail with directly injected data. When set,
	 * the useProduct hook is not called. Used by stories and tests.
	 * Pass `null` to simulate a resolved-but-empty fetch (e.g. 404/500 path).
	 */
	overrideData?: ProductDetail | null;
	/**
	 * Override the loading state. When true, skeleton placeholders are shown.
	 */
	overrideLoading?: boolean;
	/**
	 * Override the error state. When set, the appropriate error UI is shown.
	 */
	overrideError?: Error | null;
}

export function WorkProduct({
	overrideData,
	overrideLoading,
	overrideError,
}: WorkProductProps = {}): JSX.Element {
	const { productId } = useParams<{ productId: string }>();

	// Only call useProduct when there is no override (mirrors WorkBet pattern).
	const fetched = useProduct(overrideData !== undefined ? undefined : productId);

	const error = overrideError !== undefined ? (overrideError ?? null) : fetched.error;
	const data = overrideData !== undefined ? overrideData : fetched.data;

	// Loading state
	if (overrideLoading === true || (overrideData === undefined && fetched.loading)) {
		return (
			<div
				className="flex flex-col gap-[var(--density-gap)] h-full"
				data-testid="work-product-page"
			>
				<SkeletonCard ariaLabel="Loading product header" />
				<SkeletonCard ariaLabel="Loading burn vs cap" />
				<SkeletonCard ariaLabel="Loading active bets" />
				<SkeletonCard ariaLabel="Loading roster" />
			</div>
		);
	}

	// Error state — distinguish 404 from other errors
	if (error !== null && error !== undefined) {
		const is404 = error.message.includes("404");
		if (is404) {
			return (
				<div
					className="flex flex-col gap-[var(--density-gap)] h-full"
					data-testid="work-product-page"
				>
					<EmptyState
						title="Product not found"
						description="The product you are looking for does not exist or has been removed."
						dataTestId="product-not-found"
					/>
				</div>
			);
		}
		return (
			<div
				className="flex flex-col gap-[var(--density-gap)] h-full"
				data-testid="work-product-page"
			>
				<ErrorState title="Failed to load product" description={error.message} />
			</div>
		);
	}

	// Null data after loading/error — 404 from overrideData=null path
	if (data === null) {
		return (
			<div
				className="flex flex-col gap-[var(--density-gap)] h-full"
				data-testid="work-product-page"
			>
				<EmptyState
					title="Product not found"
					description="The product you are looking for does not exist or has been removed."
					dataTestId="product-not-found"
				/>
			</div>
		);
	}

	return <WorkProductLoaded data={data} />;
}

/** Internal component rendered when data is fully resolved. */
function WorkProductLoaded({ data }: { data: ProductDetail }): JSX.Element {
	const navigate = useNavigate();
	const { product, roster, burn, activeBets } = data;

	// D2: Resolve lead display name from roster instead of showing the agent id.
	const leadName =
		product.leadAgentId !== null
			? (roster.find((m) => m.agentId === product.leadAgentId)?.name ?? product.leadAgentId)
			: null;

	const capPercent =
		burn.costCap !== null && burn.costCap > 0
			? Math.min(1, (burn.costActual ?? 0) / burn.costCap)
			: 0;

	return (
		<div className="flex flex-col gap-[var(--density-gap)] h-full" data-testid="work-product-page">
			{/* R1 — Product header */}
			<section aria-label="Product header">
				{/* Breadcrumb chip (N1 design) */}
				<div className="mb-1">
					<Link
						to="/work/portfolio"
						data-testid="product-breadcrumb-back"
						className="btn btn-ghost btn-xs"
					>
						← Portfolio
					</Link>
				</div>
				<div className="flex items-center gap-[var(--density-gap)] flex-wrap">
					<h1 className="text-sm font-heading font-semibold uppercase tracking-wider text-[var(--text-hi)] flex-1">
						{product.name}
					</h1>
					<StatusChip status={product.status} />
				</div>
				<div className="mt-1 text-xs text-[var(--text-lo)]">
					<span>Phase: {product.phase}</span>
					{leadName && <span className="ml-3">Lead: {leadName}</span>}
				</div>
			</section>

			{/* R4 — Team burn vs cap */}
			<section
				aria-label="Team burn vs cap"
				data-testid="product-burn-vs-cap"
				className="rounded-[var(--r1)] bg-[var(--surface-2)] p-[var(--density-card-pad)]"
			>
				<h2 className="text-xs font-heading font-semibold uppercase tracking-wider text-[var(--text-lo)] mb-2">
					Burn vs Cap
				</h2>
				<div className="flex flex-col gap-1">
					<KeyValue label="Cost (actual)" value={`$${((burn.costActual ?? 0) / 100).toFixed(2)}`} />
					<KeyValue
						label="Cap"
						value={burn.costCap !== null ? `$${(burn.costCap / 100).toFixed(2)}` : "—"}
					/>
					<KeyValue label="Capacity" value={`${burn.activeBets} / ${burn.capacity}`} />
				</div>
				{burn.costCap !== null && (
					<progress
						className="progress progress-primary w-full mt-2"
						value={capPercent}
						max={1}
						aria-label={`${Math.round(capPercent * 100)}% of cap used`}
					/>
				)}
				{burn.costCap === null && (
					<progress
						className="progress w-full mt-2"
						value={0}
						max={1}
						aria-label="Cost cap not set"
					/>
				)}
			</section>

			{/* R2 — Active bets */}
			<section aria-label="Active bets" data-testid="product-active-bets">
				<h2 className="text-xs font-heading font-semibold uppercase tracking-wider text-[var(--text-lo)] mb-2">
					Active Bets
				</h2>
				{activeBets.length === 0 ? (
					<EmptyState
						title="No active bets"
						description="This product team has no bets in flight."
						dataTestId="product-active-bets-empty"
					/>
				) : (
					<div className="flex flex-col gap-[var(--density-card-gap)]">
						{activeBets.map((bet) => (
							<BetRow
								key={bet.id}
								bet={bet}
								onNavigate={() => {
									navigate(`/work/bet/${encodeURIComponent(bet.id)}`);
								}}
							/>
						))}
					</div>
				)}
			</section>

			{/* R3 — Roster */}
			<section aria-label="Team roster" data-testid="product-roster">
				<h2 className="text-xs font-heading font-semibold uppercase tracking-wider text-[var(--text-lo)] mb-2">
					Roster
				</h2>
				{roster.length === 0 ? (
					<EmptyState
						title="Roster not configured"
						description="No agents are assigned to this product team."
					/>
				) : (
					<div className="flex flex-col gap-1">
						{roster.map((member) => (
							<div
								key={member.agentId}
								data-testid="product-roster-row"
								data-is-lead={member.isLead ? "true" : "false"}
								className="flex items-center gap-[var(--density-gap)] py-1 px-2 rounded-[var(--r0)] bg-[var(--surface-2)]"
							>
								<div className="flex-none w-7 h-7 rounded-full bg-[var(--surface-3)] flex items-center justify-center text-[10px] font-mono text-[var(--text-hi)] uppercase">
									{member.name.slice(0, 2)}
								</div>
								<div className="flex-1 min-w-0">
									<div className="text-xs font-medium text-[var(--text-hi)] truncate">
										{member.name}
									</div>
									<div className="text-[10px] text-[var(--text-lo)] truncate">
										{member.role}
										{member.isLead && <span className="ml-1 text-[var(--ok)]">· Lead</span>}
									</div>
								</div>
							</div>
						))}
					</div>
				)}
			</section>

			{/* Artifact slot — placeholder until artifact aggregation lands */}
			<section data-testid="product-artifact-slot" aria-label="Artifact aggregation" />
		</div>
	);
}

/** Single active-bet row rendered inside R2. Clickable → navigates to Bet detail. */
function BetRow({ bet, onNavigate }: { bet: BetCardSummary; onNavigate: () => void }): JSX.Element {
	const progressText = bet.progressTotal > 0 ? `${bet.progressDone}/${bet.progressTotal}` : "—";

	return (
		<button
			type="button"
			onClick={onNavigate}
			className="w-full text-left rounded-[var(--r1)] bg-[var(--surface-2)] p-[var(--density-card-pad)] hover:bg-[var(--surface-3)] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--primary)]"
		>
			<div className="flex items-center gap-[var(--density-gap)] flex-wrap">
				<span className="flex-1 text-xs font-medium text-[var(--text-hi)] truncate">
					{bet.pitchTitle}
				</span>
				<StatusChip status={betStatusToStatus(bet.status)} />
				<span className="text-[10px] font-mono text-[var(--text-lo)]">{bet.appetite}</span>
				<span className="text-[10px] font-mono text-[var(--text-lo)]">{progressText}</span>
			</div>
		</button>
	);
}
