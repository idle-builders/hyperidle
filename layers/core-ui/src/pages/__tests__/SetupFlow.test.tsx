/**
 * BC5 T10 — SetupFlow: three `edit_user` calls (person with team name; owned
 * assistant with ASSISTANT_IDENTITY and the picked harness; the team agent)
 * and it still calls `POST /api/filesystems/inspect-path` for the folder
 * detail (architecture.md §7). `call` is mocked at the door; `apiFetch` is
 * mocked for the plumbing inspect-path route only.
 */

import { ASSISTANT_IDENTITY } from "@hyperidle/domain-model";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SetupFlow } from "../SetupFlow.js";

const { callMock } = vi.hoisted(() => ({ callMock: vi.fn() }));
vi.mock("../../services/call.js", () => ({ call: callMock }));

const { apiFetchMock } = vi.hoisted(() => ({ apiFetchMock: vi.fn() }));
vi.mock("../../services/api-fetch.js", () => ({ apiFetch: apiFetchMock }));

const HARNESS = {
	type: "claude-code",
	name: "Claude Code",
	kind: "local",
	authAction: { kind: "native_cli_login", label: "Log in to Claude Code", command: ["claude"] },
	discovery: { state: "ready" },
	models: [
		{
			id: "claude-sonnet-4-6",
			label: "Sonnet",
			provider: "anthropic",
			selectable: true,
			options: [],
		},
	],
	modelProviders: ["anthropic"],
};

function openUserData(): Record<string, unknown> {
	return {
		user: null,
		runsOn: [HARNESS],
		runConfig: null,
		documentIds: [],
		folders: [],
		subscriptions: [],
		connections: null,
		behaviour: null,
		inbox: null,
	};
}

function renderSetupFlow(): ReturnType<typeof render> {
	return render(
		<MemoryRouter initialEntries={["/setup"]}>
			<SetupFlow />
		</MemoryRouter>,
	);
}

beforeEach(() => {
	callMock.mockReset();
	apiFetchMock.mockReset();
	apiFetchMock.mockResolvedValue({
		ok: true,
		json: async () => ({ exists: true, isGitRepo: true, branch: "main" }),
	});
});

afterEach(() => {
	vi.restoreAllMocks();
});

describe("SetupFlow", () => {
	it("mounts by calling open_user({}) for the machine's harnesses", async () => {
		callMock.mockImplementation((name: string) => {
			if (name === "open_user") return Promise.resolve({ ok: true, data: openUserData() });
			return Promise.resolve({ ok: false, problems: [{ code: "unmocked", message: name }] });
		});

		renderSetupFlow();

		await waitFor(() => {
			expect(callMock).toHaveBeenCalledWith("open_user", {});
		});
	});

	it("submits three edit_user calls (person+team, owned assistant, team agent) and still calls inspect-path", async () => {
		callMock.mockImplementation((name: string, input: Record<string, unknown>) => {
			if (name === "open_user") return Promise.resolve({ ok: true, data: openUserData() });
			if (name === "edit_user") {
				if (input.kind === "human") {
					return Promise.resolve({
						ok: true,
						data: { ...openUserData(), user: { id: "u-founder", kind: "human", name: "Ada" } },
					});
				}
				return Promise.resolve({
					ok: true,
					data: { ...openUserData(), user: { id: "u-agent", kind: "ai", name: input.name } },
				});
			}
			return Promise.resolve({ ok: false, problems: [{ code: "unmocked", message: name }] });
		});

		const user = userEvent.setup();
		renderSetupFlow();

		await waitFor(() => screen.getByLabelText(/your name/i));
		await user.type(screen.getByLabelText(/your name/i), "Ada");
		await user.type(screen.getByLabelText(/project folder/i), "/Users/ada/my-repo");

		await waitFor(() => {
			expect(screen.getByRole("button", { name: /start hyperidle/i })).not.toBeDisabled();
		});
		await user.click(screen.getByRole("button", { name: /start hyperidle/i }));

		await waitFor(() => {
			expect(apiFetchMock).toHaveBeenCalledWith(
				"/api/filesystems/inspect-path",
				expect.objectContaining({ method: "POST" }),
			);
		});

		await waitFor(() => {
			const editUserCalls = callMock.mock.calls.filter(([name]) => name === "edit_user");
			expect(editUserCalls).toHaveLength(3);
		});

		const editUserCalls = callMock.mock.calls.filter(([name]) => name === "edit_user");

		// 1. the person, with a team named from the folder basename
		expect(editUserCalls.at(0)?.[1]).toMatchObject({
			kind: "human",
			name: "Ada",
			team: { name: "my-repo" },
			folders: {
				add: [
					{
						kind: "code",
						resourceRef: { kind: "code", repo: "/Users/ada/my-repo", branch: "main" },
						writeback: "none",
						connectionId: null,
					},
				],
			},
		});

		// 2. their owned assistant, with ASSISTANT_IDENTITY and the picked harness
		expect(editUserCalls.at(1)?.[1]).toMatchObject({
			kind: "ai",
			name: "Ada's Assistant",
			role: "assistant",
			agentCategory: "individual",
			ownerUserId: "u-founder",
			identity: ASSISTANT_IDENTITY,
			runConfig: { harnessType: "claude-code" },
		});

		// 3. the team agent, no identity
		expect(editUserCalls.at(2)?.[1]).toMatchObject({
			kind: "ai",
			name: "my-repo Agent",
			role: "agent",
			agentCategory: "team",
			team: { name: "my-repo" },
			runConfig: { harnessType: "claude-code" },
		});
		expect(editUserCalls.at(2)?.[1]).not.toHaveProperty("identity");
	});
});
