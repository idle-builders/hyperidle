/**
 * SettingsSkillsAndRules component tests.
 *
 * Lists own create and delete; the document content view owns read and
 * update. This surface is the human-side equivalent of a plugin's batch
 * install, and it is what makes removing the slot selector from the
 * document content view safe.
 *
 * @lore BC4: repointed off raw `apiFetch`/`GET /api/knowledge` onto
 * `useDocuments`/`call("edit_document", …)`.
 */
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { JSX } from "react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { UseDocumentsResult } from "../../hooks/useDocuments.js";
import { SettingsSkillsAndRules } from "../SettingsSkillsAndRules.js";

vi.mock("../../hooks/useDocuments.js", () => ({
	useDocuments: vi.fn(),
}));

vi.mock("../../services/call.js", () => ({
	call: vi.fn(),
}));

import { useDocuments } from "../../hooks/useDocuments.js";
import { call } from "../../services/call.js";

const ITEMS = [
	{ id: "ki-skill-1", title: "write-tests", slot: "skill", status: "active" },
	{ id: "ki-skill-archived", title: "retired-skill", slot: "skill", status: "archived" },
];
const RULE_ITEMS = [{ id: "ki-rule-1", title: "no-console", slot: "rule", status: "active" }];

function documentsResult(
	documents: typeof ITEMS,
	overrides: Partial<UseDocumentsResult> = {},
): UseDocumentsResult {
	return {
		status: "ready",
		documents: documents as UseDocumentsResult["documents"],
		error: null,
		retry: vi.fn(),
		...overrides,
	};
}

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
				<Route path="/documents/:id" element={<LocationProbe />} />
			</Routes>
		</MemoryRouter>,
	);
}

describe("SettingsSkillsAndRules", () => {
	beforeEach(() => {
		vi.mocked(useDocuments).mockImplementation((filter) => {
			if (filter?.slot === "skill") return documentsResult(ITEMS);
			if (filter?.slot === "rule") return documentsResult(RULE_ITEMS);
			return documentsResult([]);
		});
	});

	afterEach(() => {
		vi.clearAllMocks();
	});

	it("lists skill and rule rows, and nothing else", async () => {
		renderSurface();

		expect(await screen.findByText("write-tests")).toBeInTheDocument();
		expect(screen.getByText("no-console")).toBeInTheDocument();
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
	it("clicking a row navigates to its document content view, but not via a real <a>", async () => {
		const user = userEvent.setup();
		renderSurface();

		const row = await screen.findByText("write-tests");
		expect(row.closest("a")).toBeNull();

		await user.click(row);

		await waitFor(() => {
			expect(screen.getByTestId("location-probe")).toHaveTextContent("/documents/ki-skill-1");
		});
	});

	it("creates a skill: calls edit_document with slot and status:'active', then navigates to the new item", async () => {
		vi.mocked(call).mockResolvedValue({
			ok: true,
			data: {
				document: { id: "ki-new-skill" },
				ancestors: [],
				children: [],
				siblings: [],
				scopeName: "Factory",
			},
		} as Awaited<ReturnType<typeof call>>);

		const user = userEvent.setup();
		renderSurface();
		await screen.findByText("write-tests");

		await user.type(screen.getByLabelText(/title/i), "new-skill-title");
		await user.selectOptions(screen.getByLabelText(/type/i), "skill");
		await user.click(screen.getByRole("button", { name: /create/i }));

		await waitFor(() => {
			expect(call).toHaveBeenCalledWith("edit_document", {
				title: "new-skill-title",
				body: "",
				format: "markdown",
				status: "active",
				scopeKind: "factory",
				slot: "skill",
			});
		});

		await waitFor(() => {
			expect(screen.getByTestId("location-probe")).toHaveTextContent("/documents/ki-new-skill");
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
	 * DocumentSlotList.tsx's `removedIds`), so the row is gone from the DOM
	 * immediately on click, before the archive request resolves.
	 */
	it("deletes: one click calls edit_document({status:'archived'}) and removes the row immediately", async () => {
		vi.mocked(call).mockResolvedValue({ ok: true } as Awaited<ReturnType<typeof call>>);

		const user = userEvent.setup();
		renderSurface();
		await screen.findByText("write-tests");

		await user.click(screen.getByRole("button", { name: /delete write-tests/i }));

		await waitFor(() => {
			expect(screen.queryByText("write-tests")).not.toBeInTheDocument();
		});

		// The archive call is what "delete" means — confirm it was actually
		// issued, for this item's id, not just that the row happens to be gone.
		expect(call).toHaveBeenCalledWith("edit_document", { id: "ki-skill-1", status: "archived" });

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
		vi.mocked(call).mockResolvedValue({
			ok: false,
			problems: [{ code: "boom", message: "Could not delete it: boom" }],
		} as Awaited<ReturnType<typeof call>>);

		const user = userEvent.setup();
		renderSurface();
		await screen.findByText("write-tests");

		await user.click(screen.getByRole("button", { name: /delete write-tests/i }));

		// The failed archive restores the row (removed optimistically on click,
		// put back once the call comes back not-ok) and surfaces the error.
		expect(await screen.findByRole("alert")).toHaveTextContent("Could not delete it: boom");
		expect(screen.getByText("write-tests")).toBeInTheDocument();
	});
});
