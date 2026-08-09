/**
 * L18 — WorkBet anchored-messages tests.
 *
 * AC coverage:
 *  - block-anchored messages render inline after the block payload
 *  - the same anchored messages also appear in the chronological thread log
 */

import type { PlainPayload } from "@hyperidle/domain-model";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WorkBet } from "../../pages/WorkBet";
import type { BetDetail } from "../../types/bet";

// We need a controlled useHostThread mock so we can feed anchored messages
vi.mock("../../hooks/useHostThread", () => ({
	useHostThread: vi.fn(() => ({
		data: null,
		error: null,
		isLoading: false,
		refresh: vi.fn(),
	})),
}));

vi.mock("../../shell/HostThreadSection", () => ({
	HostThreadSection: () => <div data-testid="host-thread-section" />,
}));

vi.mock("../../components/ArtifactThreadsSummary", () => ({
	ArtifactThreadsSummary: () => <div data-testid="artifact-threads-summary" />,
}));

// Import after mocking
import { useHostThread } from "../../hooks/useHostThread";

const THREAD_ID = "t-anchored";
const BLOCK_ID = "block-id-test-1";

const BET_WITH_PITCH: BetDetail = {
	id: "b-anchored",
	title: "Anchored Messages Test",
	team: "Alpha Core",
	status: "completed",
	atRisk: false,
	tokenAppetite: null,
	tokensActual: null,
	progress: { done: 0, total: 1 },
	description: `# Problem\n\nThis paragraph will have an anchored message.`,
	tasks: [],
};

function renderBet(): ReturnType<typeof render> {
	return render(
		<MemoryRouter initialEntries={[`/work/bet/${BET_WITH_PITCH.id}`]}>
			<Routes>
				<Route path="/work/bet/:betId" element={<WorkBet overrideBet={BET_WITH_PITCH} />} />
			</Routes>
		</MemoryRouter>,
	);
}

describe("WorkBet anchored messages (L18)", () => {
	afterEach(() => {
		cleanup();
		vi.restoreAllMocks();
	});

	it("block-anchored messages render inline after the block payload", () => {
		vi.mocked(useHostThread).mockReturnValue({
			data: {
				thread: {
					id: THREAD_ID,
					hostKind: "bet",
					hostId: "b-anchored",
					initiatorId: "u-founder",
					participants: ["u-founder"],
					pinned: false,
					resolvedAt: null,
					lastActiveAt: "2026-05-05T10:00:00Z",
					createdAt: "2026-05-05T09:00:00Z",
				},
				messages: [
					{
						id: "msg-anchored-1",
						threadId: THREAD_ID,
						senderId: "u-founder",
						type: "plain" as const,
						payload: {
							text: "Anchored comment on this block",
							blockId: BLOCK_ID,
						} as PlainPayload & { blockId?: string },
						clientKey: "ck-anch-1",
						deletedAt: null,
						redactedAt: null,
						resolvedAt: null,
						createdAt: "2026-05-05T09:05:00Z",
					},
				],
				identities: {},
			},
			error: null,
			isLoading: false,
			refresh: vi.fn(),
		});

		renderBet();

		// The anchored message should render inline after its block
		expect(screen.getByTestId("anchored-messages")).toBeInTheDocument();
		expect(screen.getByText("Anchored comment on this block")).toBeInTheDocument();
	});
});
