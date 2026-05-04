/**
 * L15 — WorkTeam page-level integration: the request menu replaces the move handler.
 *
 * Source: L15-plan.md § 4.2 (`handleMoveTask` deleted; six new callbacks
 * wired) + § 12 protected row `WorkTeam.test.tsx`.
 *
 * Red phase: `WorkTeam.tsx` still defines `handleMoveTask` (lines 116-120)
 * and does NOT render a TaskActionsMenu trigger. These assertions go green
 * once /write-code strips the handler and wires the menu.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WorkTeam } from "../pages/WorkTeam";

const Filename = fileURLToPath(import.meta.url);
const Dirname = dirname(Filename);
const WorkTeamSource = readFileSync(join(Dirname, "..", "pages", "WorkTeam.tsx"), "utf8");

function renderPage(): ReturnType<typeof render> {
	return render(
		<MemoryRouter>
			<WorkTeam />
		</MemoryRouter>,
	);
}

describe("WorkTeam — handleMoveTask is removed (L15 § 4.2)", () => {
	it("source no longer defines `handleMoveTask`", () => {
		expect(WorkTeamSource).not.toMatch(/handleMoveTask/);
	});

	it("source no longer imports `COLUMN_TO_STATE` from Kanban", () => {
		expect(WorkTeamSource).not.toMatch(/COLUMN_TO_STATE/);
	});
});

describe("WorkTeam — TaskActionsMenu wiring (L15 § 4.2 / AC-2)", () => {
	let fetchSpy: ReturnType<typeof vi.spyOn>;

	beforeEach(() => {
		fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
			const url =
				typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
			// All POSTs in this test resolve to a synthetic 201.
			if (init?.method === "POST" && url.includes("/api/tasks/") && url.endsWith("/request")) {
				return new Response(
					JSON.stringify({
						message: { id: "m1", type: "plain", payload: { text: "Request stop" } },
						thread: { id: "thr1" },
					}),
					{ status: 201, headers: { "Content-Type": "application/json" } },
				);
			}
			return new Response("{}", { status: 200, headers: { "Content-Type": "application/json" } });
		});
	});

	afterEach(() => {
		fetchSpy.mockRestore();
	});

	it("opens the TaskActionsMenu and POSTs `request_stop` to /api/tasks/:id/request when the verb is clicked", async () => {
		const user = userEvent.setup();
		renderPage();

		// Open the menu on the first in_progress task. Every task card has
		// its own trigger, so we locate the trigger inside the card whose
		// title is the in_progress task ("Implement login endpoint" in the
		// fixture).
		const titleNode = await screen.findByText("Implement login endpoint");
		const card = titleNode.closest('[data-component="TaskCard"]') ?? titleNode.parentElement;
		if (!card) throw new Error("expected to find the task card");
		const trigger = card.querySelector('button[aria-label="Task actions"]');
		if (!(trigger instanceof HTMLElement)) {
			throw new Error("expected a Task actions trigger inside the card");
		}
		await user.click(trigger);

		const verbItem = await screen.findByRole("menuitem", { name: /request stop/i });
		await user.click(verbItem);

		await waitFor(() => {
			const calls = fetchSpy.mock.calls;
			const hit = calls.find(([input, init]) => {
				const url =
					typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
				return (
					typeof url === "string" &&
					url.includes("/api/tasks/") &&
					url.endsWith("/request") &&
					init?.method === "POST"
				);
			});
			expect(hit).toBeDefined();
			const [, init] = hit ?? [];
			const body = JSON.parse((init?.body as string) ?? "{}") as { verb: string };
			expect(body.verb).toBe("request_stop");
		});
	});
});
