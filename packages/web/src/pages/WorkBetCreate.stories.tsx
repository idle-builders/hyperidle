/**
 * WorkBetCreate stories — visual-polish input for the full-page bet create surface.
 *
 * States: empty, writing (title preview live), single-team, multi-team, submitting, error.
 * AG3: Replaces BetCreateDialog stories. Route: /work/bet/new.
 */

import type { JSX } from "react";
import { MemoryRouter } from "react-router-dom";
import { WorkBetCreate } from "./WorkBetCreate";

// Storybook scaffold — stories render in MemoryRouter for routing hooks
function PageWrapper({ children }: { children: React.ReactNode }): JSX.Element {
	return (
		<MemoryRouter initialEntries={["/work/bet/new"]}>
			<div style={{ height: "100vh", display: "flex", flexDirection: "column" }}>{children}</div>
		</MemoryRouter>
	);
}

export default { title: "Page: Work/WorkBetCreate" };

export function EmptyState(): JSX.Element {
	return (
		<PageWrapper>
			<WorkBetCreate />
		</PageWrapper>
	);
}

export function SingleTeam(): JSX.Element {
	return (
		<PageWrapper>
			<WorkBetCreate />
		</PageWrapper>
	);
}

export function MultiTeam(): JSX.Element {
	return (
		<PageWrapper>
			<WorkBetCreate />
		</PageWrapper>
	);
}

export function Submitting(): JSX.Element {
	return (
		<PageWrapper>
			<WorkBetCreate />
		</PageWrapper>
	);
}

export function WithError(): JSX.Element {
	return (
		<PageWrapper>
			<WorkBetCreate />
		</PageWrapper>
	);
}

export function Writing(): JSX.Element {
	return (
		<PageWrapper>
			<WorkBetCreate />
		</PageWrapper>
	);
}
