/**
 * AK3 design sketch — bet detail "Tasks" section, four honest states.
 * Embodies plans/AK3/design/honest-task-state/spec.md. Reuses EmptyState +
 * the existing task-row markup. Zero new components. Story-only; not shipped.
 */
import type { JSX } from "react";
import { Button, EmptyState, LiveDot, StatusChip } from "@hyperidle/design-system";

const AlertGlyph = (
	<svg
		width="24"
		height="24"
		viewBox="0 0 24 24"
		fill="none"
		stroke="currentColor"
		strokeWidth="2"
		strokeLinecap="round"
		strokeLinejoin="round"
		aria-hidden="true"
	>
		<path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
		<line x1="12" y1="9" x2="12" y2="13" />
		<line x1="12" y1="17" x2="12.01" y2="17" />
	</svg>
);

function TasksShell({ children }: { children: JSX.Element }): JSX.Element {
	return (
		<section aria-label="Tasks" className="max-w-[640px] py-[18px]">
			<div className="text-[13px] font-[600] uppercase tracking-[0.06em] text-[var(--text-tertiary)] pb-[6px] border-b border-[var(--border-subtle)] mb-[9px]">
				Tasks
			</div>
			{children}
		</section>
	);
}

export function Draft(): JSX.Element {
	return (
		<TasksShell>
			<EmptyState
				title="Not committed yet"
				description="Commit this bet and your team will break it into tasks."
				dataTestId="bet-tasks-draft"
			/>
		</TasksShell>
	);
}

export function Decomposing(): JSX.Element {
	return (
		<TasksShell>
			<EmptyState
				icon={<LiveDot />}
				iconBg="var(--accent-primary-dim)"
				title="Planning the work"
				description="Your team is breaking this bet into tasks. This usually takes a moment."
				dataTestId="bet-tasks-decomposing"
			/>
		</TasksShell>
	);
}

export function BlockedNoAgent(): JSX.Element {
	return (
		<TasksShell>
			<EmptyState
				icon={AlertGlyph}
				iconBg="var(--accent-secondary-dim)"
				title="No one can take this work"
				description="This team has no agent eligible to own tasks for this bet, so work hasn't started. Add an agent to the team to get going."
				action={
					<Button variant="secondary" onClick={() => {}}>
						Add an agent
					</Button>
				}
				dataTestId="bet-tasks-blocked"
			/>
		</TasksShell>
	);
}

export function BlockedEmpty(): JSX.Element {
	return (
		<TasksShell>
			<EmptyState
				icon={AlertGlyph}
				iconBg="var(--accent-secondary-dim)"
				title="Couldn't plan the work"
				description="Your team couldn't break this bet into tasks. Try committing again, or refine the bet's goal and done condition."
				dataTestId="bet-tasks-blocked"
			/>
		</TasksShell>
	);
}

export function Populated(): JSX.Element {
	const tasks = [
		{ id: "t1", title: "Draft the landing-page headline", owner: "Writer", state: "in_progress" as const },
		{ id: "t2", title: "Build the hero section", owner: "Frontend Builder", state: "accepted" as const },
		{ id: "t3", title: "Wire the signup endpoint", owner: "Backend Builder", state: "proposed" as const },
	];
	return (
		<TasksShell>
			<div className="flex flex-col">
				{tasks.map((task) => (
					<button
						key={task.id}
						type="button"
						data-testid="task-row"
						className="flex items-center gap-[12px] py-[12px] border-b border-[var(--border-subtle)] last:border-b-0 cursor-pointer hover:bg-[rgba(44,36,26,0.02)] text-left w-full"
					>
						<div className="flex-1 min-w-0">
							<div className="text-[15px] text-[var(--text-primary)] truncate">{task.title}</div>
							<div className="text-[12px] text-[var(--text-tertiary)] truncate mt-[2px]">
								{task.owner}
							</div>
						</div>
						<span className="flex items-center gap-[6px]">
							{task.state === "in_progress" && <LiveDot />}
							<StatusChip status="info" label={task.state} />
						</span>
					</button>
				))}
			</div>
		</TasksShell>
	);
}

export default { title: "AK3 / Bet Tasks Honest State" };
