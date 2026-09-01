/**
 * SettingsSkillsAndRules component tests.
 *
 * Lists own create and delete; the knowledge content view owns read and
 * update. This surface is the human-side equivalent of a plugin's batch
 * install, and it is what makes removing the role selector from the
 * knowledge content view safe.
 */
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { JSX } from "react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SettingsSkillsAndRules } from "../SettingsSkillsAndRules.js";

vi.mock("../../services/api-fetch.js", () => ({
	apiFetch: vi.fn(),
}));

const ITEMS = [
	{ id: "ki-skill-1", title: "write-tests", role: "skill", status: "active" },
	{ id: "ki-rule-1", title: "no-console", role: "rule", status: "active" },
	{ id: "ki-ordinary-1", title: "meeting notes", role: "ordinary", status: "active" },
	{ id: "ki-prompt-1", title: "Routine — prompt", role: "prompt", status: "active" },
	{ id: "ki-skill-archived", title: "retired-skill", role: "skill", status: "archived" },
];

/** Captures the current route so a navigate() call can be asserted on. */
function LocationProbe(): JSX.Element {
	const location = useLocation();
	return <div data-testid="location-probe">{location.pathname}</div>;
}

function renderSurface() {
	return render(
		<MemoryRouter initialEntries={["/settings"]}>
			<Routes>
				<Route
					path="/settings"
					element={
						<>
							<SettingsSkillsAndRules />
							<LocationProbe />
						</>
					}
				/>
				<Route path="/knowledge/:id" element={<LocationProbe />} />
			</Routes>
		</MemoryRouter>,
	);
}

describe("SettingsSkillsAndRules", () => {
	let apiFetch: ReturnType<typeof vi.fn>;

	beforeEach(async () => {
		const module = await import("../../services/api-fetch.js");
		apiFetch = module.apiFetch as ReturnType<typeof vi.fn>;
		apiFetch.mockImplementation((url: string, init?: RequestInit) => {
			if (url === "/api/knowledge" && (!init || init.method === undefined)) {
				return Promise.resolve({
					ok: true,
					json: () => Promise.resolve({ items: ITEMS }),
				});
			}
			return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
		});
	});

	afterEach(() => {
		vi.clearAllMocks();
	});

	it("lists skill and rule rows, and nothing else", async () => {
		renderSurface();

		expect(await screen.findByText("write-tests")).toBeInTheDocument();
		expect(screen.getByText("no-console")).toBeInTheDocument();
		expect(screen.queryByText("meeting notes")).not.toBeInTheDocument();
		expect(screen.queryByText("Routine — prompt")).not.toBeInTheDocument();
	});

	it("excludes archived items from the list", async () => {
		renderSurface();

		await screen.findByText("write-tests");
		expect(screen.queryByText("retired-skill")).not.toBeInTheDocument();
	});

	it("each row links to the real knowledge content view", async () => {
		const user = userEvent.setup();
		renderSurface();

		const row = await screen.findByText("write-tests");
		await user.click(row);

		await waitFor(() => {
			expect(screen.getByTestId("location-probe")).toHaveTextContent("/knowledge/ki-skill-1");
		});
	});

	it("creates a skill: posts role and status:'active', then navigates to the new item", async () => {
		apiFetch.mockImplementation((url: string, init?: RequestInit) => {
			if (url === "/api/knowledge" && init?.method === "POST") {
				return Promise.resolve({
					ok: true,
					status: 201,
					json: () => Promise.resolve({ id: "ki-new-skill" }),
				});
			}
			if (url === "/api/knowledge") {
				return Promise.resolve({ ok: true, json: () => Promise.resolve({ items: ITEMS }) });
			}
			return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
		});

		const user = userEvent.setup();
		renderSurface();
		await screen.findByText("write-tests");

		await user.type(screen.getByLabelText(/title/i), "new-skill-title");
		await user.selectOptions(screen.getByLabelText(/type/i), "skill");
		await user.click(screen.getByRole("button", { name: /create/i }));

		await waitFor(() => {
			const postCall = (apiFetch.mock.calls as Array<[string, RequestInit | undefined]>).find(
				([url, init]) => url === "/api/knowledge" && init?.method === "POST",
			);
			expect(postCall).toBeDefined();
			const body = JSON.parse(String(postCall?.[1]?.body)) as Record<string, unknown>;
			expect(body).toMatchObject({
				title: "new-skill-title",
				role: "skill",
				status: "active",
				format: "markdown",
				scopeKind: "factory",
			});
		});

		await waitFor(() => {
			expect(screen.getByTestId("location-probe")).toHaveTextContent("/knowledge/ki-new-skill");
		});
	});

	it("deletes: posts to /archive and the row leaves the list", async () => {
		let archived = false;
		apiFetch.mockImplementation((url: string, init?: RequestInit) => {
			if (url === "/api/knowledge/ki-skill-1/archive" && init?.method === "POST") {
				archived = true;
				return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
			}
			if (url === "/api/knowledge") {
				const items = archived ? ITEMS.filter((i) => i.id !== "ki-skill-1") : ITEMS;
				return Promise.resolve({ ok: true, json: () => Promise.resolve({ items }) });
			}
			return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
		});

		const user = userEvent.setup();
		renderSurface();
		const row = await screen.findByText("write-tests");
		const rowContainer = row.closest("[data-testid='skill-rule-row']") as HTMLElement;
		await user.click(within(rowContainer).getByRole("button", { name: /delete/i }));

		await waitFor(() => {
			expect(screen.queryByText("write-tests")).not.toBeInTheDocument();
		});
	});

	it("delete error: shows the failure and the row stays", async () => {
		apiFetch.mockImplementation((url: string, init?: RequestInit) => {
			if (url === "/api/knowledge/ki-skill-1/archive" && init?.method === "POST") {
				return Promise.resolve({
					ok: false,
					status: 500,
					json: () => Promise.resolve({ error: "Could not delete it: boom" }),
				});
			}
			if (url === "/api/knowledge") {
				return Promise.resolve({ ok: true, json: () => Promise.resolve({ items: ITEMS }) });
			}
			return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
		});

		const user = userEvent.setup();
		renderSurface();
		const row = await screen.findByText("write-tests");
		const rowContainer = row.closest("[data-testid='skill-rule-row']") as HTMLElement;
		await user.click(within(rowContainer).getByRole("button", { name: /delete/i }));

		expect(await screen.findByRole("alert")).toHaveTextContent("Could not delete it: boom");
		expect(screen.getByText("write-tests")).toBeInTheDocument();
	});
});
