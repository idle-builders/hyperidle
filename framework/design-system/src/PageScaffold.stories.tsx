/**
 * PageScaffold — design-system stories (AZ2).
 *
 * Covers: scroll body (default, tall content), managed body (self-scrolling
 * child), header-less scroll body (ArtifactPermalink shape).
 */

import type { JSX } from "react";
import { PageScaffold } from "./PageScaffold.js";

export default { title: "PageScaffold" };

// Scroll body (default) — the scaffold owns the scroll region. Tall content
// scrolls; the header stays pinned.
export function ScrollBody(): JSX.Element {
	return (
		<div style={{ height: 360, border: "1px solid var(--border-subtle, #ddd)" }}>
			<PageScaffold
				header={
					<header
						style={{
							padding: "18px 24px",
							borderBottom: "1px solid var(--border-subtle, #ddd)",
							fontWeight: 600,
						}}
					>
						Page title
					</header>
				}
			>
				<div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 12 }}>
					{Array.from({ length: 20 }, (_, i) => (
						<div key={i} style={{ padding: 12, background: "var(--surface-container, #f2f0ec)" }}>
							Row {i + 1}
						</div>
					))}
				</div>
			</PageScaffold>
		</div>
	);
}

// Managed body — the child (e.g. SplitView) owns its own scrolling. The
// scaffold only guarantees it a bounded flex column.
export function ManagedBody(): JSX.Element {
	return (
		<div style={{ height: 360, border: "1px solid var(--border-subtle, #ddd)" }}>
			<PageScaffold
				body="managed"
				header={
					<header
						style={{
							padding: "18px 24px",
							borderBottom: "1px solid var(--border-subtle, #ddd)",
							fontWeight: 600,
						}}
					>
						Page title
					</header>
				}
			>
				<div
					style={{
						height: "100%",
						overflow: "auto",
						padding: 24,
						background: "var(--surface-elevated, #fff)",
					}}
				>
					A self-scrolling child (e.g. SplitView) fills the managed body.
				</div>
			</PageScaffold>
		</div>
	);
}

// Header-less scroll body — the ArtifactPermalink shape: no title strip, just
// a scrolling body.
export function NoHeader(): JSX.Element {
	return (
		<div style={{ height: 240, border: "1px solid var(--border-subtle, #ddd)" }}>
			<PageScaffold>
				<div style={{ padding: 12 }}>No header — content scrolls directly.</div>
			</PageScaffold>
		</div>
	);
}
