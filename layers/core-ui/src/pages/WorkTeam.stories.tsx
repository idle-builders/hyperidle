/**
 * L13 — WorkTeam page stories. Renders key states for visual verification.
 *
 * @lore U5: Renamed from WorkProduct.stories.tsx → WorkTeam.stories.tsx.
 */
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { WorkTeam } from "./WorkTeam";

// AJ6 W5: area-less title — no "Page: Area/*" prefix, no area subdir.
// Requires explicit meta.group; Work is the correct domain.
export default { title: "WorkTeam", group: "Work" as const };

const MOCK_DETAIL = {
	team: {
		id: "p1",
		name: "HyperIdle Core",
		phase: "build",
		status: "healthy" as const,
		leadAgentId: "agent-lead",
	},
	teamMembers: { id: "t1", formedAt: "2024-01-01T00:00:00.000Z", dissolvedAt: null },
	roster: [
		{
			agentId: "agent-lead",
			name: "Lead Agent",
			role: "lead",
			isLead: true,
			agentCategory: "team",
		},
		{
			agentId: "agent-member",
			name: "Alice Agent",
			role: "member",
			isLead: false,
			agentCategory: "team",
		},
	],
	burn: {
		capacity: 5,
		activeBets: 2,
	},
	activeBets: [
		{
			id: "b1",
			descriptionTitle: "Auth migration",
			status: "active" as const,
			progressDone: 1,
			progressTotal: 2,
		},
		{
			id: "b2",
			descriptionTitle: "Onboarding revamp",
			status: "active" as const,
			progressDone: 0,
			progressTotal: 5,
		},
	],
};

function wrap(element: React.JSX.Element): React.JSX.Element {
	return (
		<MemoryRouter initialEntries={["/work/team/p1"]}>
			<Routes>
				<Route path="/work/team/:teamId" element={element} />
				<Route path="/work/portfolio" element={<div>Portfolio</div>} />
				<Route path="/work/bet/:betId" element={<div>Bet detail</div>} />
			</Routes>
		</MemoryRouter>
	);
}

export const Populated = (): React.JSX.Element => wrap(<WorkTeam overrideData={MOCK_DETAIL} />);

export const EmptyBets = (): React.JSX.Element =>
	wrap(<WorkTeam overrideData={{ ...MOCK_DETAIL, activeBets: [] }} />);

export const EmptyRoster = (): React.JSX.Element =>
	wrap(<WorkTeam overrideData={{ ...MOCK_DETAIL, roster: [] }} />);

export const Loading = (): React.JSX.Element => wrap(<WorkTeam overrideLoading />);

export const NotFound = (): React.JSX.Element => wrap(<WorkTeam overrideData={null} />);

export const ErrorTeam = (): React.JSX.Element =>
	wrap(<WorkTeam overrideError={new Error("Team fetch failed: 500")} />);
