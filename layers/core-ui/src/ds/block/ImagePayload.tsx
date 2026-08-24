// design-lint-disable require-stories-sibling

import type { JSX } from "react";
import { IMAGE_URL_SAFE_SCHEMES } from "../../block/types.js";

import { UnknownPayload } from "./UnknownPayload.js";

export interface ImagePayloadProps {
	alt: string;
	url: string;
	title: string | null;
}

/**
 * @lore M17 defense-in-depth: even though `deriveBlocks` already gates image
 * URLs through IMAGE_URL_SAFE_SCHEMES, ImagePayload re-validates here so that
 * a caller assembling a Block payload by hand (storybook, tests, future API)
 * can't accidentally render `<img src="javascript:…">`. A failing URL falls
 * back to the UNKNOWN warn shell.
 */
function isSafeImageUrl(url: string): boolean {
	if (!url) return true;
	if (/^\/(?!\/)/.test(url)) return true;
	if (/^\.{0,2}\//.test(url)) return true;
	if (!/^[a-z][a-z0-9+.-]*:/i.test(url)) return true;
	const lower = url.toLowerCase();
	for (const safe of IMAGE_URL_SAFE_SCHEMES) {
		if (lower.startsWith(safe)) return true;
	}
	return false;
}

export function ImagePayload({ alt, url, title }: ImagePayloadProps): JSX.Element {
	if (!isSafeImageUrl(url)) {
		return <UnknownPayload raw={`![${alt}](${url})`} reason="parser-unrecognised" />;
	}
	return (
		// data-component is a test-support marker (E2E selector hook; no behavior).
		<figure
			data-component="ImagePayload"
			className="border-width-thin m-0 relative rounded-[var(--r-default)]  border-[var(--border-subtle)] overflow-hidden"
		>
			<img src={url} alt={alt} title={title ?? undefined} className="block max-w-full h-auto" />
			<button
				type="button"
				aria-label="Zoom image"
				className="absolute top-[8px] right-[8px] w-[28px] h-[28px] rounded-[var(--r-default)] bg-[color-mix(in_oklab,var(--surface-page)_75%,transparent)] text-[var(--text-secondary)] flex items-center justify-center focus-visible:outline focus-visible:outline-1 focus-visible:outline-[var(--accent-deep)] focus-visible:[outline-offset:-1px]"
			>
				<svg
					width="14"
					height="14"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					strokeWidth="2"
					aria-hidden="true"
				>
					<circle cx="11" cy="11" r="8" />
					<path d="M21 21l-4.35-4.35" />
				</svg>
			</button>
			{alt ? (
				<figcaption className="type-metadata  text-[var(--text-tertiary)] px-[12px] py-[6px]">
					{alt}
				</figcaption>
			) : null}
		</figure>
	);
}
