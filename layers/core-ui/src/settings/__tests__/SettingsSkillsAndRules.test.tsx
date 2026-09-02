/**
 * SettingsSkillsAndRules component tests.
 *
 * Lists own create and delete; the knowledge content view owns read and
 * update. This surface is the human-side equivalent of a plugin's batch
 * install, and it is what makes removing the role selector from the
 * knowledge content view safe.
 */
import { render, screen, waitFor } from "@testing-library/react";
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
	 * href> (UI-080's usual contract). The Delete button is a real button in
	 * `actions`, which Row's href mode forbids nesting — an earlier version of
	 * this test asserted the opposite and passed while Delete was completely
	 * broken in the packaged app (a real anchor swallowed the "Delete" click
	 * as navigation before it ever reached handleDelete). Clicking the row
	 * still navigates, just via onClick/navigate() instead of a native link —
	 * the named trade is losing ⌘-click/middle-click/"copy link" for this
	 * list.
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
	 * Founder call: no double confirmation. A plain "Delete" button in the
	 * row's `actions` deletes on the first click — no kebab, no Menu, no
	 * inline Confirm/Cancel step (that FR-10 shape is what SettingsAgents'
	 * own rows still use, via RowDeleteAction; this list deliberately does
	 * not).
	 *
	 * @lore knowledge-attachment-slot: this replaces the old kebab/confirm
	 * test, which stayed green through four broken fix attempts because
	 * jsdom's `userEvent.click()` never reproduces real anchor navigation —
	 * see `knowledge-role-delete.spec.ts` for the real-Chromium coverage of
	 * that failure mode. The removal here is optimistic (see
	 * KnowledgeRoleList.tsx's `removedIds`), so the row is gone from the DOM
	 * immediately on click, before the archive request resolves.
	 */
	it("deletes: one click posts to /archive and removes the row immediately", async () => {
		const user = userEvent.setup();
		renderSurface();
		await screen.findByText("write-tests");

		await user.click(screen.getByRole("button", { name: /delete write-tests/i }));

		await waitFor(() => {
			expect(screen.queryByText("write-tests")).not.toBeInTheDocument();
		});

		// The archive request is what "delete" means — confirm it was actually
		// issued, for this item's id, not just that the row happens to be gone.
		const archiveCall = (apiFetch.mock.calls as Array<[string, RequestInit | undefined]>).find(
			([url, init]) => url === "/api/knowledge/ki-skill-1/archive" && init?.method === "POST",
		);
		expect(archiveCall).toBeDefined();

		// Delete never navigates — the row's own onClick is a separate path.
		expect(screen.getByTestId("location-probe")).toHaveTextContent("/settings");
	});

	/**
	 * @lore knowledge-attachment-slot: the optimistic-restore path — nothing
	 * covered this before the rewrite. `handleDelete` removes the row
	 * immediately, then `restore(id)` puts it back if the archive call
	 * itself fails, so a real failure is visible (the row reappears, not a
	 * silently-broken delete) rather than trusting the optimistic remove.
	 */
	it("delete error: shows the failure and the row comes back", async () => {
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
		await screen.findByText("write-tests");

		await user.click(screen.getByRole("button", { name: /delete write-tests/i }));

		// The failed archive restores the row (removed optimistically on click,
		// put back once the request comes back not-ok) and surfaces the error.
		expect(await screen.findByRole("alert")).toHaveTextContent("Could not delete it: boom");
		expect(screen.getByText("write-tests")).toBeInTheDocument();
	});
});
