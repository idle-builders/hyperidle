import { ArtifactPreviewSurface } from "./ArtifactPreviewSurface.js";

export default {
	title: "ArtifactPreviewSurface",
	tier: "1" as const,
};

export const PendingGallery = (): React.JSX.Element => (
	<div className="w-[280px]">
		<ArtifactPreviewSurface kind="design" preview={null} size="gallery" />
	</div>
);

export const PendingFull = (): React.JSX.Element => (
	<div className="w-[480px]">
		<ArtifactPreviewSurface kind="screenshot" preview={null} size="full" />
	</div>
);

export const DeckPopulated = (): React.JSX.Element => (
	<div className="w-[280px]">
		<ArtifactPreviewSurface
			kind="deck"
			preview={{ kind: "deck", slideCount: 12, firstSlideTitle: "Q3 strategy review" }}
			size="gallery"
		/>
	</div>
);

export const UnknownKind = (): React.JSX.Element => (
	<div className="w-[280px]">
		<ArtifactPreviewSurface kind="unknown_kind" preview={null} size="gallery" />
	</div>
);
