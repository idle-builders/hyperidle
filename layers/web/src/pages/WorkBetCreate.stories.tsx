/**
 * WorkBetCreate stories — visual-polish input for the full-page bet create surface.
 *
 * States: empty, writing (title preview live), single-team, multi-team, submitting, error.
 * AG3: Replaces BetCreateDialog stories. Route: /work/bet/new.
 */

import type { JSX } from "react";
// AJ3: page-fed variant mounts via the shared isolation harness instead of a
// local ad-hoc MemoryRouter wrapper. One story = prototype = annotation
// surface = catalog entry. See layers/web/src/preview + plans/AJ3.
import { MockProviders } from "../__preview__";
import { WorkBetCreate } from "./WorkBetCreate";

// Storybook scaffold — stories render through MockProviders for routing hooks
function PageWrapper({ children }: { children: React.ReactNode }): JSX.Element {
	return (
		<MockProviders route="/work/bet/new">
			<div style={{ height: "100vh", display: "flex", flexDirection: "column" }}>{children}</div>
		</MockProviders>
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
