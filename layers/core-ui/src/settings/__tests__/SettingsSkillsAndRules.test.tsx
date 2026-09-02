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

	/**
	 * @lore knowledge-attachment-slot: this row is deliberately NOT a real <a
	 * href> (UI-080's usual contract). RowDeleteAction's kebab/Menu/confirm are
	 * real buttons in `actions`, which Row's href mode forbids nesting — the
	 * earlier version of this test asserted the opposite and passed while
	 * Delete was completely broken in the packaged app (a real anchor
	 * swallowed the "Delete" click as navigation before the confirm step ever
	 * ran). Clicking the row still navigates, just via onClick/navigate()
	 * instead of a native link — the named trade is losing ⌘-click/middle-
	 * click/"copy link" for this list.
	 */
	it("clicking a row navigates to its knowledge content view, but not via a real <a>", async () => {
		const user = userEvent.setup();
		renderSurface();

		const row = await screen.findByText("write-tests");
		expect(row.closest("a")).toBeNull();

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

	/**
	 * FR-10 shape (RowDeleteAction): kebab "..." → Menu → "Delete" → row flips
	 * to inline "Confirm delete?"/"Cancel" → second click confirms. Same flow
	 * X3-SettingsAgents.test.tsx proves for SettingsAgents' own rows.
	 *
	 * @lore knowledge-attachment-slot: this is the exact regression a mocked
	 * router could not catch before — clicking "Delete" the FIRST time must
	 * only flip the row to Confirm/Cancel, never leave "/settings". The row is
	 * a real link no longer (see the "not via a real <a>" test above), so this
	 * navigation check is meaningful here: it goes through router `navigate()`
	 * (a plain JS call visible to LocationProbe), not a native anchor click
	 * jsdom silently no-ops. If Menu's item click stops stopping propagation
	 * again, this assertion is what would catch it — clicking "Delete" would
	 * bubble to the row's own onClick and fire navigate() before the confirm
	 * step is ever reached.
	 */
	async function deleteRow(user: ReturnType<typeof userEvent.setup>, rowContainer: HTMLElement) {
		await user.click(
			within(rowContainer).getByRole("button", { name: /actions for write-tests/i }),
		);
		await waitFor(() => screen.getByRole("menuitem", { name: /^delete$/i }));
		await user.click(screen.getByRole("menuitem", { name: /^delete$/i }));
		// The first "Delete" click must only arm the confirm step — it must
		// NOT have navigated the row away already.
		expect(screen.getByTestId("location-probe")).toHaveTextContent("/settings");
		await waitFor(() => within(rowContainer).getByRole("button", { name: /confirm delete\?/i }));
		await user.click(within(rowContainer).getByRole("button", { name: /confirm delete\?/i }));
	}

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
		const rowContainer = row.closest("[data-testid='knowledge-role-row']") as HTMLElement;
		await deleteRow(user, rowContainer);

		await waitFor(() => {
			expect(screen.queryByText("write-tests")).not.toBeInTheDocument();
		});

		// The archive request is what "delete" means — confirm it was actually
		// issued, for this item's id, not just that the row happens to be gone.
		const archiveCall = (apiFetch.mock.calls as Array<[string, RequestInit | undefined]>).find(
			([url, init]) => url === "/api/knowledge/ki-skill-1/archive" && init?.method === "POST",
		);
		expect(archiveCall).toBeDefined();

		// And the whole flow stayed on /settings — Delete must never navigate.
		expect(screen.getByTestId("location-probe")).toHaveTextContent("/settings");
	});

	/**
	 * @lore knowledge-attachment-slot: the boxed ItemList variant sets
	 * overflow-hidden (for its rounded-corner clip) — a single-item list is
	 * all "last row", so a menu positioned absolute inside that container has
	 * no room below the row to open into and gets clipped at the box edge,
	 * with "Delete" invisible. This is the common fresh-install shape.
	 * RowDeleteAction's Menu now anchors and portals into #overlay-root
	 * instead of rendering as a DOM descendant of the boxed container, so it
	 * can never be clipped by that ancestor's overflow-hidden regardless of
	 * where the row sits in the box.
	 */
	it("with a single-item boxed list, the open menu is not a DOM descendant of the clipping list container", async () => {
		apiFetch.mockImplementation((url: string, init?: RequestInit) => {
			if (url === "/api/knowledge" && (!init || init.method === undefined)) {
				return Promise.resolve({
					ok: true,
					json: () => Promise.resolve({ items: [ITEMS[0]] }),
				});
			}
			return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
		});

		const user = userEvent.setup();
		renderSurface();
		const row = await screen.findByText("write-tests");
		const rowContainer = row.closest("[data-testid='knowledge-role-row']") as HTMLElement;
		const listContainer = document.querySelector('[data-ds-component="ItemList"]') as HTMLElement;
		expect(listContainer).not.toBeNull();
		expect(listContainer.contains(rowContainer)).toBe(true);

		await user.click(
			within(rowContainer).getByRole("button", { name: /actions for write-tests/i }),
		);

		const menu = await screen.findByRole("menu");
		expect(listContainer.contains(menu)).toBe(false);
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
		const rowContainer = row.closest("[data-testid='knowledge-role-row']") as HTMLElement;
		await deleteRow(user, rowContainer);

		expect(await screen.findByRole("alert")).toHaveTextContent("Could not delete it: boom");
		expect(screen.getByText("write-tests")).toBeInTheDocument();
	});
});
