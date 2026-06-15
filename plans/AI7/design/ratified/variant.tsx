/**
 * AI7 — Page anatomy: embodied ratified variant (DESIGN SKETCH, not production).
 *
 * Demonstrates the two primitives + the scaffold/scroll rule in one frame so the
 * design-critique gate can look at the actual rendered standard. Production lands
 * the primitives in packages/design-system/src/ (see architecture.md); this file
 * is the design artifact only. Uses Hearth tokens + the verified de-facto class
 * strings. Stays out of the catalog snapshot net (lives under plans/, not src/).
 */

import type { JSX, ReactNode } from "react";

// ── Embodied PageHeader (matches the production API to land in DS) ──
function PageHeader({
	title,
	leading,
	subtitle,
	actions,
}: {
	title: ReactNode;
	leading?: ReactNode;
	subtitle?: ReactNode;
	actions?: ReactNode;
}): JSX.Element {
	return (
		<header className="shrink-0 px-[24px] py-[18px] border-b border-[var(--border-subtle)]">
			{leading ? <div className="mb-[6px]">{leading}</div> : null}
			<div className="flex items-center justify-between gap-[12px]">
				<h2 className="text-[20px] font-[600] tracking-[-0.01em] text-[var(--text-primary)] min-w-0 truncate">
					{title}
				</h2>
				{actions ? <div className="flex items-center gap-[9px] shrink-0">{actions}</div> : null}
			</div>
			{subtitle ? (
				<div className="mt-[3px] text-[13px] text-[var(--text-tertiary)]">{subtitle}</div>
			) : null}
		</header>
	);
}

// ── Embodied SectionLabel ──
function SectionLabel({
	label,
	trailing,
	divider,
}: {
	label: ReactNode;
	trailing?: ReactNode;
	divider?: boolean;
}): JSX.Element {
	return (
		<div
			className={
				"flex items-center justify-between gap-[12px] " +
				(divider
					? "pb-[6px] mb-[9px] border-b border-[var(--border-subtle)]"
					: "mb-[9px]")
			}
		>
			<h3 className="text-[13px] font-[600] uppercase tracking-[0.06em] text-[var(--text-tertiary)]">
				{label}
			</h3>
			{trailing ? <div className="shrink-0">{trailing}</div> : null}
		</div>
	);
}

function StubBreadcrumb(): JSX.Element {
	return (
		<nav className="flex items-center gap-[6px] text-[13px] text-[var(--text-secondary)]">
			<span>Work</span>
			<span className="text-[var(--text-tertiary)]">/</span>
			<span className="text-[var(--text-tertiary)]">Acme Corp</span>
		</nav>
	);
}

function StubButton({ children, primary }: { children: ReactNode; primary?: boolean }): JSX.Element {
	return (
		<button
			type="button"
			className={
				"rounded-[var(--r-pill)] px-[12px] py-[6px] text-[13px] font-[600] border-none cursor-pointer " +
				(primary
					? "bg-[var(--accent-primary)] text-[var(--text-on-accent,white)]"
					: "bg-[var(--surface-container)] text-[var(--text-secondary)]")
			}
		>
			{children}
		</button>
	);
}

/** The full page-anatomy demo: scaffold + pinned header + scrolling body with section labels. */
export function PageAnatomy(): JSX.Element {
	return (
		<div
			style={{ height: 520, width: 760, background: "var(--surface-elevated)", borderRadius: 10 }}
			className="overflow-hidden"
		>
			{/* Scaffold: flex col h-full → pinned header + scrolling body */}
			<div className="flex flex-col h-full">
				<PageHeader
					title="Ship onboarding redesign"
					leading={<StubBreadcrumb />}
					subtitle="Phase: build · Lead: Dana"
					actions={
						<>
							<StubButton>Edit</StubButton>
							<StubButton primary>New bet</StubButton>
						</>
					}
				/>
				<div className="flex-1 overflow-y-auto">
					<div className="max-w-[960px] mx-auto w-full p-[24px] flex flex-col gap-[24px]">
						<section>
							<SectionLabel label="Active bets" trailing={<StubButton>New</StubButton>} />
							<div className="text-[13px] text-[var(--text-secondary)] leading-[1.7]">
								Three time-boxed bets in flight. Body content is owned by the page; the primitives
								own only the header strip and the section opener.
							</div>
						</section>
						<section>
							<SectionLabel label="Routines" divider />
							<div className="text-[13px] text-[var(--text-secondary)] leading-[1.7]">
								Section label with the optional bottom-rule variant (used by WorkTask / WorkBet).
								Default has no divider — that is the de-facto majority.
							</div>
						</section>
						<section>
							<SectionLabel label="Agents" />
							<div className="text-[13px] text-[var(--text-tertiary)] leading-[1.7]">
								Long content scrolls under the pinned header. The header never moves; orientation
								(title, breadcrumb, actions) stays fixed — the ratified scroll rule.
							</div>
							<div style={{ height: 400 }} />
							<div className="text-[13px] text-[var(--text-tertiary)]">…scrolled to bottom…</div>
						</section>
					</div>
				</div>
			</div>
		</div>
	);
}

export default { title: "AI7 PageAnatomy (design sketch)" };
