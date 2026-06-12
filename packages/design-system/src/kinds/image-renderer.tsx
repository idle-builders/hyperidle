// AE6 — ImageRenderer: renders image artifact previews.
// Maps from old kinds: screenshot, design

import type { ImagePreview } from "@hyperidle/shared";
import type { JSX } from "react";

export interface ImageRendererProps {
	preview: ImagePreview | null;
	kind: string;
}

export function ImageRenderer({ preview }: ImageRendererProps): JSX.Element {
	// @lore AF16 T11 WARNING-4: null or malformed preview (missing url) both return the
	// pending state. Do NOT render <img src=""> — a broken image link is worse UX than
	// the "Image pending." state that the parent surface maps to "No preview available".
	if (!(preview && preview.url)) {
		return <p className="text-sm text-[var(--text-tertiary)] italic">Image pending.</p>;
	}

	return (
		<section aria-label="Image preview">
			<img
				src={preview.url}
				alt={preview.alt ?? `${preview.width}×${preview.height} image`}
				width={preview.width}
				height={preview.height}
				className="max-w-full rounded-[var(--r-subtle)]"
			/>
			<p className="text-xs text-[var(--text-tertiary)] mt-1 font-mono">
				{preview.width} × {preview.height}
			</p>
		</section>
	);
}
