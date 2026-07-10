/**
 * AW1 — cursor-agent is actionable when discovery reports ready/unauthenticated.
 */

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { SettingsHarnesses } from "../SettingsHarnesses.js";

const CURSOR_READY_DESCRIPTOR = {
	type: "cursor-agent",
	name: "Cursor Agent",
	kind: "local",
	accessMode: "provider-subscription-cli",
	discovery: {
		state: "ready",
		version: "2026.07.09",
		reason: "Authenticated and ready.",
	},
	authAction: {
		kind: "native_cli_login",
		label: "Log in to Cursor",
		command: ["cursor-agent", "login"],
	},
	runtime: {
		preCompactionTrigger: false,
		fileEditing: true,
		toolUse: true,
		mcpSupport: false,
		subAgents: false,
		modelProviders: [],
	},
	models: [],
	modelProviders: [],
};

function mockFetch(descriptors: unknown[] = [CURSOR_READY_DESCRIPTOR]): void {
	vi.stubGlobal(
		"fetch",
		vi.fn(async (url: string) => {
			if (url.endsWith("/api/harnesses")) {
				return {
					ok: true,
					json: async () => descriptors,
				};
			}
			if (url.endsWith("/api/server-config")) {
				return { ok: true, json: async () => ({ harnessDisabled: [] }) };
			}
			throw new Error(`unexpected fetch: ${url}`);
		}),
	);
}

describe("cursor-agent is actionable when supported", () => {
	it("renders cursor-agent row as ready with login command detail", async () => {
		mockFetch();
		const user = userEvent.setup();
		render(<SettingsHarnesses />);
		expect(await screen.findByText("Cursor Agent")).toBeInTheDocument();
		expect(screen.getByText(/authenticated and ready/i)).toBeInTheDocument();
		await user.click(screen.getByText("Cursor Agent"));
		expect(await screen.findByText("cursor-agent login")).toBeInTheDocument();
	});
});
