/**
 * AF12 — WorkBet UI: activate control (AC1), appetite money input (AC2),
 * kill-dialog copy honesty (AC3).
 *
 * Drives the exported WorkBet page with an `overrideBet` fixture, opens the
 * relevant dialog via the overflow menu, and asserts on copy + the exact
 * `apiFetch` payload shape.
 *
 * @lore AF12 RED:
 *  - AC1: no "Activate bet" overflow item exists yet → query fails.
 *  - AC2: the appetite dialog is a duration picker; it sends a STRING value, not
 *    WireMoney → the payload-shape assertion fails.
 *  - AC3: the kill dialog copy still says "freed immediately" and lacks the
 *    "finish their current step" qualifier → copy assertions fail.
 */

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { BetDetail } from "../types/bet";

// Mock apiFetch so we can inspect payloads and avoid real network.
const apiFetchMock = vi.fn();
vi.mock("../services/api-fetch.js", () => ({
	apiFetch: (...args: unknown[]) => apiFetchMock(...args),
}));

// Mock useHostThread so HostThreadSection doesn't fire fetches.
vi.mock("../hooks/useHostThread", () => ({
	useHostThread: vi.fn(() => ({ data: null, error: null, isLoading: false, refresh: vi.fn() })),
}));
// Mock useCurrentUser so WorkBet's mount-time GET /api/auth/me doesn't occupy
// apiFetch call[0] — the action POST/PATCH must be the first observable call.
vi.mock("../hooks/useCurrentUser", () => ({
	useCurrentUser: vi.fn(() => ({ user: null, isLoading: false, error: null })),
}));
// Mock ArtifactSection so its mount-time GET /api/artifacts doesn't occupy
// apiFetch call[0] (same approach as TaskSheet.AF12-sessions.test.tsx).
vi.mock("../components/ArtifactSection", () => ({
	ArtifactSection: () => null,
	useArtifactOpen: () => vi.fn(),
}));
vi.mock("../hooks/useArtifactThreadSummary", () => ({
	useArtifactThreadSummary: vi.fn(() => ({
		data: null,
		error: null,
		isLoading: false,
		refresh: vi.fn(),
	})),
}));

import { WorkBet } from "../pages/WorkBet";

const ACTIVE_BET: BetDetail = {
	id: "b_active",
	title: "Payment Gateway Integration",
	team: "Alpha Core",
	status: "active",
	atRisk: false,
	costAppetite: { minor: 20000, currency: "USD" },
	tokenAppetite: null,
	costActual: null,
	tokensActual: null,
	progress: { done: 2, total: 6 },
	description: "# Problem\nManual payments.",
	tasks: [],
};

const DRAFT_BET: BetDetail = { ...ACTIVE_BET, id: "b_draft", status: "draft" };

function renderBet(bet: BetDetail): ReturnType<typeof render> {
	return render(
		<MemoryRouter initialEntries={[`/work/bet/${bet.id}`]}>
			<Routes>
				<Route path="/work/bet/:betId" element={<WorkBet overrideBet={bet} />} />
			</Routes>
		</MemoryRouter>,
	);
}

function okJson(body: unknown = {}): Promise<Response> {
	return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body) } as Response);
}

describe("WorkBet AF12 — AC1 activate control", () => {
	beforeEach(() => {
		apiFetchMock.mockReset();
		apiFetchMock.mockImplementation(() => okJson());
	});
	afterEach(() => vi.clearAllMocks());

	it("shows an 'Activate bet' overflow item for a draft bet", () => {
		renderBet(DRAFT_BET);
		expect(screen.getByText("Activate bet")).toBeInTheDocument();
	});

	it("does NOT show 'Activate bet' for an active bet", () => {
		renderBet(ACTIVE_BET);
		expect(screen.queryByText("Activate bet")).not.toBeInTheDocument();
	});

	it("clicking 'Activate bet' POSTs to /commit", async () => {
		const user = userEvent.setup();
		renderBet(DRAFT_BET);
		await user.click(screen.getByText("Activate bet"));
		await waitFor(() => {
			expect(apiFetchMock).toHaveBeenCalled();
		});
		const url = apiFetchMock.mock.calls[0]?.[0] as string;
		const opts = apiFetchMock.mock.calls[0]?.[1] as { method?: string };
		expect(url).toContain("/api/bets/b_draft/commit");
		expect(opts.method).toBe("POST");
	});
});

describe("WorkBet AF12 — AC2 appetite money input", () => {
	beforeEach(() => {
		apiFetchMock.mockReset();
		apiFetchMock.mockImplementation(() => okJson());
	});
	afterEach(() => vi.clearAllMocks());

	it("does NOT offer 'Adjust appetite' for a draft bet (server allows active only)", () => {
		const { container } = renderBet(DRAFT_BET);
		expect(container.querySelector('[data-bet-action="adjust-appetite"]')).toBeNull();
	});

	it("the appetite dialog sends a WireMoney object (not a duration string)", async () => {
		const user = userEvent.setup();
		const { container } = renderBet(ACTIVE_BET);

		const adjustItem = container.querySelector(
			'[data-bet-action="adjust-appetite"]',
		) as HTMLElement;
		await user.click(adjustItem);

		// Money input: a numeric amount + currency select (no duration <select>).
		const amount = await screen.findByRole("spinbutton");
		await user.clear(amount);
		await user.type(amount, "250");

		const reason = screen.getByPlaceholderText(/why is the appetite changing/i);
		await user.type(reason, "Scope grew");

		await user.click(screen.getByRole("button", { name: /save/i }));

		await waitFor(() => expect(apiFetchMock).toHaveBeenCalled());
		const opts = apiFetchMock.mock.calls[0]?.[1] as { body: string };
		const payload = JSON.parse(opts.body) as { field: string; value: unknown };
		expect(payload.field).toBe("cost_appetite");
		// The value must be a WireMoney { minor, currency }, NOT a string like "2 weeks".
		expect(typeof payload.value).toBe("object");
		expect(payload.value).toMatchObject({ minor: 25000, currency: "USD" });
	});

	it("the duration picker options are gone (no '2 weeks' etc.)", async () => {
		const user = userEvent.setup();
		const { container } = renderBet(ACTIVE_BET);
		await user.click(container.querySelector('[data-bet-action="adjust-appetite"]') as HTMLElement);
		await screen.findByPlaceholderText(/why is the appetite changing/i);
		expect(screen.queryByText("2 weeks")).not.toBeInTheDocument();
		expect(screen.queryByText("6 weeks")).not.toBeInTheDocument();
	});
});

describe("WorkBet AF12 — AC3 kill-dialog copy honesty", () => {
	beforeEach(() => {
		apiFetchMock.mockReset();
		apiFetchMock.mockImplementation(() => okJson());
	});
	afterEach(() => vi.clearAllMocks());

	function openKillDialog(): void {
		fireEvent.click(screen.getByText("Kill"));
	}

	it("the kill dialog describes the cascade: in-progress tasks killed, sessions stopped", async () => {
		renderBet(ACTIVE_BET);
		openKillDialog();
		const dialog = await screen.findByRole("dialog");
		expect(dialog).toHaveTextContent(/in-progress tasks/i);
		expect(dialog).toHaveTextContent(/sessions/i);
	});

	it("the SAVED line does NOT claim cost stops 'immediately'", async () => {
		renderBet(ACTIVE_BET);
		openKillDialog();
		const dialog = await screen.findByRole("dialog");
		// "freed immediately" would falsely imply cost stops the instant Kill is clicked.
		expect(dialog.textContent ?? "").not.toMatch(/immediately/i);
	});

	it("the dialog includes the 'finish their current step' running-agents qualifier", async () => {
		renderBet(ACTIVE_BET);
		openKillDialog();
		const dialog = await screen.findByRole("dialog");
		expect(dialog).toHaveTextContent(/finish their current step/i);
	});
});
