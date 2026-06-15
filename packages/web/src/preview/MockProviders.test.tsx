/**
 * AJ3 — isolation harness proving test (the AC2 proof).
 *
 * Discharges AC2 directly: a page-level / data-fed surface mounts via thin
 * mock providers, with NO server, database, or real data. It mounts the REAL
 * `WorkBet` page — fed by an existing fixture (`MOCK_BETS.b1`) through its
 * `overrideBet` prop so the fetch short-circuits — wrapped in `MockProviders`,
 * and asserts the page renders its real fixture-derived heading.
 *
 * This is not a synthetic test-local surface: it imports application code
 * (`WorkBet`, `MockProviders`, the fixture) and asserts the rendered DOM of a
 * real page. It would fail if `MockProviders` failed to supply the router or
 * the AssistantContext the page consumes (`useNavigate`/`useParams`/`useContext`).
 */

import { render, screen } from "@testing-library/react";
import { Route, Routes } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { MOCK_BETS } from "../pages/__fixtures__/work-bet-fixtures";
import { WorkBet } from "../pages/WorkBet";
import { MockProviders } from "./index";

describe("AJ3: MockProviders mounts a real data-fed page in isolation, no backend", () => {
	it("renders WorkBet's real heading from fixture data through the mock providers", () => {
		const bet = MOCK_BETS.b1;
		if (!bet) throw new Error("fixture MOCK_BETS.b1 missing");

		render(
			<MockProviders route={`/work/bet/${bet.id}`}>
				<Routes>
					<Route path="/work/bet/:betId" element={<WorkBet overrideBet={bet} />} />
				</Routes>
			</MockProviders>,
		);

		// Asserts against the REAL surface: the page rendered its real heading
		// from fixture data — no server, no db, no network.
		expect(screen.getByRole("heading", { name: bet.title })).toBeInTheDocument();
	});
});
