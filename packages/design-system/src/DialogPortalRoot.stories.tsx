/**
 * AI2 — DialogPortalRoot stories.
 *
 * DialogPortalRoot is a zero-visual component — it mounts #overlay-root as
 * a body sibling for Dialog portal targets. The only observable output is
 * the presence of the #overlay-root element in the DOM.
 *
 * The story renders a documentation card explaining the component's purpose.
 */

import type { JSX } from "react";
import { DialogPortalRoot } from "./DialogPortalRoot.js";

export default { title: "AI2/DialogPortalRoot" };

export function MountEffect(): JSX.Element {
	return (
		<div
			style={{
				padding: "var(--space-6)",
				background: "var(--surface-page)",
				borderRadius: "var(--r-default)",
				maxWidth: "480px",
			}}
		>
			<DialogPortalRoot />
			<p
				style={{
					fontSize: "var(--text-sm)",
					color: "var(--text-secondary)",
					margin: 0,
					lineHeight: 1.5,
				}}
			>
				<strong
					style={{ color: "var(--text-primary)", display: "block", marginBottom: "var(--space-3)" }}
				>
					DialogPortalRoot
				</strong>
				Zero-visual component. On mount, it calls{" "}
				<code style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-xs)" }}>
					ensureOverlayRoot()
				</code>{" "}
				to create a{" "}
				<code style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-xs)" }}>
					#overlay-root
				</code>{" "}
				div as a sibling of{" "}
				<code style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-xs)" }}>#root</code>{" "}
				under{" "}
				<code style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-xs)" }}>
					document.body
				</code>
				. All Dialog portals target this node.
			</p>
		</div>
	);
}
