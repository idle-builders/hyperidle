// AF16 T12: Updated stories to cover image-with-preview, image-no-preview, code, unregistered-no-preview.
// AE6: ArtifactPreviewSurface stories.

import { ArtifactPreviewSurface } from "./ArtifactPreviewSurface.js";

// @lore AZ6: a full-size preview requires the app's HTML sanitiser (prose bodies may
// embed HTML). The design-system package never imports DOMPurify, so dev surfaces
// pass a pass-through — same pattern as Html.stories.tsx.
const passthrough = (raw: string): string => raw;

export default {
	title: "ArtifactPreviewSurface",
	tier: "1" as const,
};

// T11: null preview → "No preview available" (full), "No preview" (gallery)
export const NoPreviewFull = (): React.JSX.Element => (
	<div className="w-[480px]">
		<ArtifactPreviewSurface kind="image" preview={null} size="full" sanitizeHtml={passthrough} />
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
			sanitizeHtml={passthrough}
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
			sanitizeHtml={passthrough}
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

// AZ6: the two states this work package exists to create.

const DECISION = `# Q3 pricing decision

We recommend moving the Pro tier from **$29** to **$39**/month.

## Why

- Churn at $29 is 4.1%, below the band where price is the driver.
- Two of the three closest competitors sit above $35.

| Tier | Now | Proposed |
| --- | --- | --- |
| Starter | $9 | $9 |
| Pro | $29 | $39 |

<details><summary>Raw model output</summary>elasticity = -0.42</details>
`;

export const ProseFull = (): React.JSX.Element => (
	<div className="w-[720px]">
		<ArtifactPreviewSurface
			kind="text"
			size="full"
			preview={{ kind: "text", body: DECISION }}
			sanitizeHtml={passthrough}
		/>
	</div>
);

export const UnrenderableUnknownKind = (): React.JSX.Element => (
	<div className="w-[720px]">
		<ArtifactPreviewSurface
			kind="spreadsheet"
			size="full"
			preview={{ kind: "spreadsheet", sheet: "Roadmap", cells: [["Q3", "Q4"]] }}
			sanitizeHtml={passthrough}
		/>
	</div>
);

export const UnrenderableEmpty = (): React.JSX.Element => (
	<div className="w-[720px]">
		<ArtifactPreviewSurface
			kind="text"
			size="full"
			preview={{ kind: "text", body: "" }}
			sanitizeHtml={passthrough}
		/>
	</div>
);

export const UnrenderableMalformed = (): React.JSX.Element => (
	<div className="w-[720px]">
		<ArtifactPreviewSurface
			kind="image"
			size="full"
			preview={{ kind: "image", width: 10, height: 10 }}
			sanitizeHtml={passthrough}
		/>
	</div>
);
