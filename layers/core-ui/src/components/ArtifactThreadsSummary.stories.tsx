/**
 * ArtifactThreadsSummary stories — L18 per-bet artifact thread summary section.
 *
 * Shows: loading, empty, populated with rows, truncated with +N more.
 */

import { MemoryRouter } from "react-router-dom";
import { ArtifactThreadsSummary } from "./ArtifactThreadsSummary";

// Mock the hook so stories don't make real fetch calls.
// @lore L18: The component calls useArtifactThreadSummary internally.
// Stories use vi.mock-equivalents via module-level overrides where possible.
// For the design system preview, we render a controlled version of the JSX.

export default { title: "ArtifactThreadsSummary", tier: "component" as const };

// ── Loading state ────────────────────────────────────────────────────────────

export const Loading = (): React.JSX.Element => (
	<MemoryRouter>
		<div data-testid="artifact-threads-summary-loading" className="p-3">
			<div className="animate-pulse h-4 bg-[var(--surface-elevated)] rounded w-1/3" />
		</div>
	</MemoryRouter>
);

// ── Empty state (artifacts exist but no thread messages) ─────────────────────

export const Empty = (): React.JSX.Element => (
	<MemoryRouter>
		<section
			data-testid="artifact-threads-summary"
			aria-label="Artifact threads"
			className="flex flex-col gap-2"
		>
			<h3 className="text-xs font-heading uppercase tracking-[0.02em] text-[var(--text-tertiary)]">
				Artifact threads
			</h3>
			<div
				data-testid="artifact-threads-summary-empty"
				className="text-sm text-[var(--text-tertiary)] px-3 py-2"
			>
				No artifact discussions yet.
			</div>
		</section>
	</MemoryRouter>
);

// ── Populated state ──────────────────────────────────────────────────────────

export const WithRows = (): React.JSX.Element => (
	<MemoryRouter>
		<section
			data-testid="artifact-threads-summary"
			aria-label="Artifact threads"
			className="flex flex-col gap-2"
		>
			<h3 className="text-xs font-heading uppercase tracking-[0.02em] text-[var(--text-tertiary)]">
				Artifact threads
			</h3>
			<ul className="flex flex-col gap-1">
				{[
					{
						id: "art-1",
						title: "auth-service.ts",
						snippet: "Looks good but the cache TTL is too long",
						count: 3,
						time: "2h ago",
					},
					{
						id: "art-2",
						title: "component.tsx",
						snippet: "Needs a minor fix before merging",
						count: 1,
						time: "4h ago",
					},
				].map((item) => (
					<li key={item.id}>
						<a
							href={`/artifacts/${item.id}`}
							className="flex flex-col gap-0.5 px-3 py-2 rounded hover:bg-[var(--surface-container)] text-sm"
						>
							<div className="flex items-center justify-between gap-2">
								<span className="font-medium text-[var(--text-primary)] truncate">
									{item.title}
								</span>
								<div className="flex items-center gap-2 shrink-0 text-xs text-[var(--text-tertiary)]">
									<span>{item.time}</span>
									<span>{item.count}</span>
								</div>
							</div>
							<span className="text-xs text-[var(--text-tertiary)] truncate">{item.snippet}</span>
						</a>
					</li>
				))}
			</ul>
		</section>
	</MemoryRouter>
);

// ── Truncated with +N more ───────────────────────────────────────────────────

export const Truncated = (): React.JSX.Element => (
	<MemoryRouter>
		<section
			data-testid="artifact-threads-summary"
			aria-label="Artifact threads"
			className="flex flex-col gap-2"
		>
			<h3 className="text-xs font-heading uppercase tracking-[0.02em] text-[var(--text-tertiary)]">
				Artifact threads
			</h3>
			<ul className="flex flex-col gap-1">
				{Array.from({ length: 10 }, (_, i) => (
					<li key={i}>
						<a
							href={`/artifacts/art-${i}`}
							className="flex flex-col gap-0.5 px-3 py-2 rounded hover:bg-[var(--surface-container)] text-sm"
						>
							<div className="flex items-center justify-between gap-2">
								<span className="font-medium text-[var(--text-primary)] truncate">
									file-{i + 1}.ts
								</span>
								<div className="flex items-center gap-2 shrink-0 text-xs text-[var(--text-tertiary)]">
									<span>1h ago</span>
									<span>{i + 1}</span>
								</div>
							</div>
							<span className="text-xs text-[var(--text-tertiary)] truncate">
								Discussion about this artifact
							</span>
						</a>
					</li>
				))}
			</ul>
			<a
				data-testid="artifact-threads-summary-more"
				href="/artifacts?betId=bet-1"
				className="text-xs text-[var(--text-tertiary)] px-3 py-1 hover:text-[var(--text-primary)]"
			>
				+2 more
			</a>
		</section>
	</MemoryRouter>
);

// ── Live component (fetches from hook, shows real behavior) ──────────────────

export const LiveComponent = (): React.JSX.Element => (
	<MemoryRouter>
		<ArtifactThreadsSummary betId="bet-demo-001" />
	</MemoryRouter>
);
