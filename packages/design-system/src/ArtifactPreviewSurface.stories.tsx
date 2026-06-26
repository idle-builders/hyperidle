// AF16 T12: Updated stories to cover image-with-preview, image-no-preview, code, unregistered-no-preview.
// AE6: ArtifactPreviewSurface stories.

import { ArtifactPreviewSurface } from "./ArtifactPreviewSurface.js";

export default {
	title: "ArtifactPreviewSurface",
	tier: "1" as const,
};

// T11: null preview → "No preview available" (full), "No preview" (gallery)
export const NoPreviewFull = (): React.JSX.Element => (
	<div className="w-[480px]">
		<ArtifactPreviewSurface kind="image" preview={null} size="full" />
	</div>
);

export const NoPreviewGallery = (): React.JSX.Element => (
	<div className="w-[280px]">
		<ArtifactPreviewSurface kind="image" preview={null} size="gallery" />
	</div>
);

// T10: image + valid preview → <img>
export const ImageFull = (): React.JSX.Element => (
	<div className="w-[480px]">
		<ArtifactPreviewSurface
			kind="image"
			size="full"
			preview={{
				url: "https://images.unsplash.com/photo-1518770660439-4636190af475?w=400",
				width: 400,
				height: 300,
				alt: "Circuit board",
			}}
		/>
	</div>
);

// T12 / AM5 K4b: code kind + preview → CodePayload (pure {path,lang,text} shape)
export const CodeFull = (): React.JSX.Element => (
	<div className="w-[480px]">
		<ArtifactPreviewSurface
			kind="code"
			size="full"
			preview={{
				kind: "code",
				path: "src/index.ts",
				lang: "typescript",
				text: "import React from 'react';\nimport { useState } from 'react';\n\nexport default function App() {\n  return <div>Hello</div>;\n}",
			}}
		/>
	</div>
);

// T12: unregistered kind + null preview → "No preview available"
export const UnregisteredKindNoPreview = (): React.JSX.Element => (
	<div className="w-[280px]">
		<ArtifactPreviewSurface kind="blog_post" preview={null} size="gallery" />
	</div>
);

// Gallery text path (unchanged)
export const TextGallery = (): React.JSX.Element => (
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

export const DataGallery = (): React.JSX.Element => (
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
