/**
 * Setup does not complete on a machine that cannot run an agent.
 *
 * Every harness HyperIdle runs is something the person installs and signs into
 * themselves. When none of them is ready, finishing setup would hand someone a
 * workspace whose agents silently fail — the worst possible first five minutes,
 * and one where nothing on screen says why.
 *
 * So the Start button is disabled, and the screen says which harnesses it looked
 * for, what state each is in, and the command that fixes it. That copy is not
 * invented here: discovery already reports a reason and a login command per
 * harness, and this screen shows what discovery said.
 *
 * "Ready" is the only choosable state. `installed` and `unauthenticated` both
 * mean the binary is there but cannot run a turn, and treating either as good
 * enough is how someone ends up at a working-looking workspace that cannot
 * think.
 */

import type { HarnessCapabilityDescriptor } from "@hyperidle/harness-capability";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SetupFlow } from "../pages/SetupFlow";

const { callMock } = vi.hoisted(() => ({ callMock: vi.fn() }));
vi.mock("../services/call.js", () => ({ call: callMock }));

function descriptor(
	type: string,
	name: string,
	state: HarnessCapabilityDescriptor["discovery"]["state"],
	reason?: string,
): HarnessCapabilityDescriptor {
	return {
		type,
		name,
		kind: "local",
		authAction: {
			kind: "native_cli_login",
			label: `Log in to ${name}`,
			command: [type, "login"],
		},
		discovery: { state, ...(reason ? { reason } : {}) },
		models: [],
		modelProviders: [],
	};
}

const NONE_READY: HarnessCapabilityDescriptor[] = [
	descriptor("codex", "Codex", "missing", "Codex CLI is not installed or not on PATH."),
	descriptor("claude-code", "Claude Code", "missing", "Claude Code CLI is not installed."),
	descriptor("opencode", "OpenCode", "unauthenticated", "OpenCode is installed but not signed in."),
	descriptor("cursor-agent", "Cursor Agent", "installed", "Cursor Agent is installed."),
];

const ONE_READY: HarnessCapabilityDescriptor[] = [
	descriptor("claude-code", "Claude Code", "ready"),
	descriptor("codex", "Codex", "missing", "Codex CLI is not installed or not on PATH."),
];

function mockFetch(descriptors: HarnessCapabilityDescriptor[]): void {
	callMock.mockReset();
	callMock.mockImplementation((name: string) => {
		if (name === "open_user") {
			return Promise.resolve({
				ok: true,
				data: {
					user: null,
					runsOn: descriptors,
					runConfig: null,
					documentIds: [],
					folders: [],
					subscriptions: [],
					connections: null,
					inbox: null,
				},
			});
		}
		return Promise.resolve({ ok: false, problems: [{ code: "unmocked", message: name }] });
	});
}

function renderSetup(): void {
	render(
		<MemoryRouter initialEntries={["/setup"]}>
			<Routes>
				<Route path="/setup" element={<SetupFlow />} />
				<Route path="/work" element={<div data-testid="work-page">work</div>} />
			</Routes>
		</MemoryRouter>,
	);
}

describe("setup will not finish without a harness that can run", () => {
	beforeEach(() => {
		vi.restoreAllMocks();
	});
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("disables Start when no harness is ready, however complete the rest of the form is", async () => {
		mockFetch(NONE_READY);
		renderSetup();
		await screen.findByTestId("harness-row-codex");

		await userEvent.type(screen.getByLabelText(/your name/i), "Founder");

		const start = screen.getByRole("button", { name: /start hyperidle/i });
		await waitFor(() => expect(start).toBeDisabled());
	});

	it("says what to install, naming each harness and the command that fixes it", async () => {
		mockFetch(NONE_READY);
		renderSetup();
		await screen.findByTestId("harness-row-codex");

		const blocked = await screen.findByTestId("no-harness-available");
		expect(blocked).toBeInTheDocument();
		// Each harness it looked for, by the name a person would recognise.
		for (const name of ["Codex", "Claude Code", "OpenCode", "Cursor Agent"]) {
			expect(blocked).toHaveTextContent(name);
		}
		// And the command discovery itself supplied, not one invented here.
		expect(blocked).toHaveTextContent("codex login");
		expect(blocked).toHaveTextContent("opencode login");
	});

	it("treats installed-but-not-signed-in as not ready, because it cannot run a turn", async () => {
		mockFetch(NONE_READY);
		renderSetup();
		await screen.findByTestId("harness-row-opencode");

		await userEvent.type(screen.getByLabelText(/your name/i), "Founder");
		const start = screen.getByRole("button", { name: /start hyperidle/i });
		await waitFor(() => expect(start).toBeDisabled());
	});

	it("lets setup proceed as soon as one harness is ready", async () => {
		mockFetch(ONE_READY);
		renderSetup();
		await screen.findByTestId("harness-row-claude-code");

		expect(screen.queryByTestId("no-harness-available")).not.toBeInTheDocument();

		await userEvent.type(screen.getByLabelText(/your name/i), "Founder");
		const start = screen.getByRole("button", { name: /start hyperidle/i });
		await waitFor(() => expect(start).toBeEnabled());
	});
});
