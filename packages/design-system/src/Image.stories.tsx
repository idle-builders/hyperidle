// AM5 — base-primitive foundation story: Image (pure content).
// Thin wrapper over block/ImagePayload. The payload re-validates the URL scheme
// (M17 defense-in-depth) and renders a figure + zoom affordance + caption.
import type { JSX } from "react";
import { ImagePayload } from "./block/ImagePayload.js";

export default { title: "Image", group: "Blocks" as const };

export const Captioned = (): JSX.Element => (
	<div className="w-[420px]">
		<ImagePayload alt="A placeholder figure" url="https://placehold.co/600x240" title={null} />
	</div>
);

export const WithTitle = (): JSX.Element => (
	<div className="w-[420px]">
		<ImagePayload
			alt="Architecture diagram"
			url="https://placehold.co/600x300"
			title="Three-layer system"
		/>
	</div>
);
