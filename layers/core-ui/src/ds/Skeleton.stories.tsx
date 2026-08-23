import { Skeleton, SkeletonCard, SkeletonList } from "./Skeleton.js";

export default {
	title: "Skeleton",
	tier: "utility" as const,
	order: ["SingleBar", "SingleBarNarrow", "List3Rows", "List6Rows", "Card", "CardGrid2x2"],
};

export const SingleBar = (): React.JSX.Element => (
	<div style={{ maxWidth: "320px" }}>
		<Skeleton ariaLabel="Loading block reference" />
	</div>
);

export const SingleBarNarrow = (): React.JSX.Element => (
	<div style={{ maxWidth: "320px" }}>
		<Skeleton height="16px" width="33%" ariaLabel="Loading discussions" />
	</div>
);

export const List3Rows = (): React.JSX.Element => (
	<div style={{ maxWidth: "320px" }}>
		<SkeletonList rows={3} ariaLabel="Loading list" />
	</div>
);

export const List6Rows = (): React.JSX.Element => (
	<div style={{ maxWidth: "320px" }}>
		<SkeletonList rows={6} ariaLabel="Loading list" />
	</div>
);

export const Card = (): React.JSX.Element => (
	<div style={{ maxWidth: "288px" }}>
		<SkeletonCard ariaLabel="Loading bet" />
	</div>
);

export const CardGrid2x2 = (): React.JSX.Element => (
	<div className="grid grid-cols-2 gap-3" style={{ maxWidth: "32rem" }}>
		<SkeletonCard ariaLabel="Loading product" />
		<SkeletonCard ariaLabel="Loading product" />
		<SkeletonCard ariaLabel="Loading product" />
		<SkeletonCard ariaLabel="Loading product" />
	</div>
);
