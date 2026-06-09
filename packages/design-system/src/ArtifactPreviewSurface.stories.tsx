// AE6: ArtifactPreviewSurface stories updated for 6 fundamental kinds.

import { ArtifactPreviewSurface } from "./ArtifactPreviewSurface.js";

export default {
	title: "ArtifactPreviewSurface",
	tier: "1" as const,
};

export const PendingGallery = (): React.JSX.Element => (
	<div className="w-[280px]">
		<ArtifactPreviewSurface kind="image" preview={null} size="gallery" />
	</div>
);

export const PendingFull = (): React.JSX.Element => (
	<div className="w-[480px]">
		<ArtifactPreviewSurface kind="text" preview={null} size="full" />
	</div>
);

export const TextPopulated = (): React.JSX.Element => (
	<div className="w-[280px]">
		<ArtifactPreviewSurface
			kind="text"
			preview={{
				kind: "text",
				body: "This agreement is between Party A and Party B.",
				format: "plain",
			}}
			size="gallery"
		/>
	</div>
);

export const DataPopulated = (): React.JSX.Element => (
	<div className="w-[280px]">
		<ArtifactPreviewSurface
			kind="data"
			preview={{
				kind: "data",
				headlines: [
					{ label: "DAU", value: "12.4k" },
					{ label: "MRR", value: "$48k" },
				],
			}}
			size="gallery"
		/>
	</div>
);

export const UnregisteredKind = (): React.JSX.Element => (
	<div className="w-[280px]">
		<ArtifactPreviewSurface kind="blog_post" preview={null} size="gallery" />
	</div>
);
