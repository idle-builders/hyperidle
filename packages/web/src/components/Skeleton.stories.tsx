import { SkeletonCard, SkeletonList } from "./Skeleton.js";

export default { title: "Skeleton" };

export const List3 = (): React.JSX.Element => (
	<div className="w-80">
		<SkeletonList rows={3} ariaLabel="Loading list" />
	</div>
);

export const List6 = (): React.JSX.Element => (
	<div className="w-80">
		<SkeletonList rows={6} ariaLabel="Loading list" />
	</div>
);

export const Card = (): React.JSX.Element => (
	<div className="w-72">
		<SkeletonCard ariaLabel="Loading bet" />
	</div>
);

export const CardGrid = (): React.JSX.Element => (
	<div className="grid grid-cols-2 gap-3 w-[32rem]">
		<SkeletonCard ariaLabel="Loading product" />
		<SkeletonCard ariaLabel="Loading product" />
		<SkeletonCard ariaLabel="Loading product" />
		<SkeletonCard ariaLabel="Loading product" />
	</div>
);
