// AE6 — ImageRenderer stories.

import { ImageRenderer } from "./image-renderer.js";

export default { title: "Kinds/ImageRenderer" };

export function WithImage() {
	return (
		<ImageRenderer
			preview={{
				kind: "image",
				url: "https://placehold.co/800x450",
				width: 800,
				height: 450,
				alt: "Dashboard screenshot",
			}}
			kind="image"
		/>
	);
}

export function NoAlt() {
	return (
		<ImageRenderer
			preview={{
				kind: "image",
				url: "https://placehold.co/400x300",
				width: 400,
				height: 300,
			}}
			kind="image"
		/>
	);
}

export function NoPreview() {
	return <ImageRenderer preview={null} kind="image" />;
}
