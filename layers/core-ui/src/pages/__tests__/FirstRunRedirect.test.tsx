/**
 * BC5 T10 — FirstRunRedirect reads `search_users({ kind: "human" })`: a
 * human with a team means setup is done → /work, else → /setup
 * (architecture.md §7).
 */

import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FirstRunRedirect } from "../FirstRunRedirect.js";

const { callMock } = vi.hoisted(() => ({ callMock: vi.fn() }));
vi.mock("../../services/call.js", () => ({ call: callMock }));

afterEach(() => {
	vi.restoreAllMocks();
});

function renderAt(): ReturnType<typeof render> {
	return render(
		<MemoryRouter initialEntries={["/"]}>
			<Routes>
				<Route path="/" element={<FirstRunRedirect />} />
				<Route path="/work" element={<div>Work</div>} />
				<Route path="/setup" element={<div>Setup</div>} />
			</Routes>
		</MemoryRouter>,
	);
}

describe("FirstRunRedirect", () => {
	it("redirects to /work when a human with a team exists", async () => {
		callMock.mockResolvedValue({
			ok: true,
			data: [{ id: "u1", kind: "human", name: "Ada", team: { id: "t1", name: "Acme" } }],
		});

		renderAt();

		await waitFor(() => {
			expect(screen.getByText("Work")).toBeInTheDocument();
		});
		expect(callMock).toHaveBeenCalledWith("search_users", { kind: "human" });
	});

	it("redirects to /setup when no human exists", async () => {
		callMock.mockResolvedValue({ ok: true, data: [] });

		renderAt();

		await waitFor(() => {
			expect(screen.getByText("Setup")).toBeInTheDocument();
		});
	});

	it("redirects to /setup when a human exists but has no team", async () => {
		callMock.mockResolvedValue({
			ok: true,
			data: [{ id: "u1", kind: "human", name: "Ada", team: null }],
		});

		renderAt();

		await waitFor(() => {
			expect(screen.getByText("Setup")).toBeInTheDocument();
		});
	});

	it("redirects to /setup on a failed call", async () => {
		callMock.mockResolvedValue({ ok: false, problems: [{ code: "server_error", message: "no" }] });

		renderAt();

		await waitFor(() => {
			expect(screen.getByText("Setup")).toBeInTheDocument();
		});
	});
});
