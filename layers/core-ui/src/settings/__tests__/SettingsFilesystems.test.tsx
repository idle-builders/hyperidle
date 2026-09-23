/**
 * SettingsFilesystems reads the caller's folders off `open_user`.
 */

import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SettingsFilesystems } from "../SettingsFilesystems.js";

const { callMock } = vi.hoisted(() => ({ callMock: vi.fn() }));
vi.mock("../../services/call.js", () => ({ call: callMock }));

afterEach(() => {
	vi.restoreAllMocks();
});

describe("SettingsFilesystems", () => {
	it("calls open_user and renders the caller's folders", async () => {
		callMock.mockReset();
		callMock.mockImplementation((name: string) => {
			expect(name).toBe("open_user");
			return Promise.resolve({
				ok: true,
				data: {
					user: { id: "me", kind: "human", name: "Me", team: { id: "team-1", name: "Acme" } },
					runsOn: [],
					runConfig: null,
					documentIds: [],
					folders: [
						{
							id: "fs-1",
							teamId: "team-1",
							source: "github",
							kind: "code",
							connectionId: "conn-1",
							resourceRef: { kind: "code", repo: "acme/storefront", branch: "main" },
							writeback: "git",
							state: "reachable",
							createdAt: "2026-01-01T00:00:00.000Z",
						},
					],
					subscriptions: [],
					connections: null,
					behaviour: null,
					inbox: null,
				},
			});
		});

		render(<SettingsFilesystems />);

		await waitFor(() => {
			expect(screen.getByText("acme/storefront")).toBeInTheDocument();
		});
		expect(callMock).toHaveBeenCalledWith("open_user", {});
		expect(screen.getByText("@main")).toBeInTheDocument();
	});

	it("renders an empty state when the caller has no folders", async () => {
		callMock.mockReset();
		callMock.mockResolvedValue({
			ok: true,
			data: {
				user: { id: "me", kind: "human", name: "Me", team: { id: "team-1", name: "Acme" } },
				runsOn: [],
				runConfig: null,
				documentIds: [],
				folders: [],
				subscriptions: [],
				connections: null,
				behaviour: null,
				inbox: null,
			},
		});

		render(<SettingsFilesystems />);

		await waitFor(() => {
			expect(screen.getByText("No filesystems registered yet.")).toBeInTheDocument();
		});
	});
});
