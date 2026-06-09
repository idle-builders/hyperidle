// AE6 — ImageRenderer: renders image artifact previews.
// Maps from old kinds: screenshot, design

import type { ImagePreview } from "@hyperidle/shared";
import type { JSX } from "react";

export interface ImageRendererProps {
	preview: ImagePreview | null;
	kind: string;
}

export function ImageRenderer({ preview }: ImageRendererProps): JSX.Element {
	if (!preview) {
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
