/**
 * L13 — WorkProduct page stories. Renders key states at /designsystem.
 */
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { WorkProduct } from "./WorkProduct";

export default { title: "WorkProduct" };

const MOCK_DETAIL = {
	product: {
		id: "p1",
		name: "HyperIdle Core",
		phase: "build",
		status: "healthy" as const,
		leadAgentId: "agent-lead",
	},
	team: { id: "t1", formedAt: "2024-01-01T00:00:00.000Z", dissolvedAt: null },
	roster: [
		{ agentId: "agent-lead", name: "Lead Agent", role: "lead", isLead: true },
		{ agentId: "agent-member", name: "Alice Agent", role: "member", isLead: false },
	],
	burn: { costActual: 4200, costCap: 10000, capacity: 5, activeBets: 2 },
	activeBets: [
		{
			id: "b1",
			pitchTitle: "Auth migration",
			appetite: "2 weeks",
			status: "active" as const,
			progressDone: 1,
			progressTotal: 2,
		},
		{
			id: "b2",
			pitchTitle: "Onboarding revamp",
			appetite: "6 weeks",
			status: "in_progress" as const,
			progressDone: 0,
			progressTotal: 5,
		},
	],
};

function wrap(element: React.JSX.Element): React.JSX.Element {
	return (
		<MemoryRouter initialEntries={["/work/product/p1"]}>
			<Routes>
				<Route path="/work/product/:productId" element={element} />
				<Route path="/work/portfolio" element={<div>Portfolio</div>} />
				<Route path="/work/bet/:betId" element={<div>Bet detail</div>} />
			</Routes>
		</MemoryRouter>
	);
}

export const Populated = (): React.JSX.Element => wrap(<WorkProduct overrideData={MOCK_DETAIL} />);

export const EmptyBets = (): React.JSX.Element =>
	wrap(<WorkProduct overrideData={{ ...MOCK_DETAIL, activeBets: [] }} />);

export const EmptyRoster = (): React.JSX.Element =>
	wrap(<WorkProduct overrideData={{ ...MOCK_DETAIL, roster: [] }} />);

export const NoCap = (): React.JSX.Element =>
	wrap(
		<WorkProduct
			overrideData={{
				...MOCK_DETAIL,
				burn: { ...MOCK_DETAIL.burn, costCap: null },
			}}
		/>,
	);

export const Loading = (): React.JSX.Element => wrap(<WorkProduct overrideLoading />);

export const NotFound = (): React.JSX.Element => wrap(<WorkProduct overrideData={null} />);

export const ErrorProduct = (): React.JSX.Element =>
	wrap(<WorkProduct overrideError={new Error("Product fetch failed: 500")} />);
