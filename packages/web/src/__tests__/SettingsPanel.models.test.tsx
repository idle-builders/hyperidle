/**
 * L10 — Settings → Models & Keys tab.
 *
 * Verifies the masked-secret pattern, the rotate-key happy path, and the
 * error path. The component talks to the same `/api/first-run/api-key`
 * endpoint as the first-run flow, so a green ping persists immediately.
 */
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { SettingsPanel } from "../components/SettingsPanel";
import { DEFAULT_SETTINGS } from "../fixtures/app-shell-data";

function mockFetch(map: {
	statusBody?: Record<string, unknown>;
	apiKeyResult?: { ok: true; last4: string } | { ok: false; status: number; message: string };
}): void {
	globalThis.fetch = (async (input: RequestInfo | URL) => {
		const url = typeof input === "string" ? input : input.toString();
		if (url.endsWith("/api/first-run/status")) {
			return new Response(JSON.stringify(map.statusBody ?? {}), {
				status: 200,
				headers: { "Content-Type": "application/json" },
			});
		}
		if (url.endsWith("/api/first-run/api-key")) {
			const r = map.apiKeyResult ?? { ok: true as const, last4: "1234" };
			const body = r.ok
				? { ok: true, status: 200, last4: r.last4 }
				: { ok: false, status: r.status, message: r.message };
			return new Response(JSON.stringify(body), {
				status: 200,
				headers: { "Content-Type": "application/json" },
			});
		}
		return new Response("not found", { status: 404 });
	}) as typeof fetch;
}

describe("SettingsPanel — Models & Keys tab (L10)", () => {
	const originalFetch = globalThis.fetch;
	const defaultProps = {
		open: true,
		onClose: () => {},
		onSave: async () => {},
		settings: DEFAULT_SETTINGS,
	};

	beforeEach(() => {
		// noop
	});

	afterEach(() => {
		globalThis.fetch = originalFetch;
	});

	it("displays the masked stored key when one is configured", async () => {
		mockFetch({ statusBody: { apiKeyLast4: "9zZQ" } });
		const user = userEvent.setup();
		render(<SettingsPanel {...defaultProps} />);
		await user.click(screen.getByRole("tab", { name: "Models & Keys" }));
		await waitFor(() => {
			expect(screen.getByTestId("settings-models-current-key")).toHaveTextContent(/9zZQ$/);
		});
	});

	it("rotates the key on a successful test ping", async () => {
		mockFetch({
			statusBody: { apiKeyLast4: "1111" },
			apiKeyResult: { ok: true, last4: "5678" },
		});
		const user = userEvent.setup();
		render(<SettingsPanel {...defaultProps} />);
		await user.click(screen.getByRole("tab", { name: "Models & Keys" }));
		await waitFor(() => {
			expect(screen.getByTestId("settings-models-current-key")).toHaveTextContent(/1111$/);
		});
		await user.type(screen.getByTestId("settings-models-input"), "sk-ant-newkey5678");
		await user.click(screen.getByTestId("settings-models-test"));
		await waitFor(() => {
			expect(screen.getByTestId("settings-models-success")).toBeInTheDocument();
			expect(screen.getByTestId("settings-models-current-key")).toHaveTextContent(/5678$/);
		});
	});

	it("shows an error when the test ping fails", async () => {
		mockFetch({
			statusBody: { apiKeyLast4: "1111" },
			apiKeyResult: { ok: false, status: 401, message: "authentication_error" },
		});
		const user = userEvent.setup();
		render(<SettingsPanel {...defaultProps} />);
		await user.click(screen.getByRole("tab", { name: "Models & Keys" }));
		await user.type(screen.getByTestId("settings-models-input"), "sk-ant-bad");
		await user.click(screen.getByTestId("settings-models-test"));
		await waitFor(() => {
			expect(screen.getByTestId("settings-models-error")).toHaveTextContent(/test failed/i);
		});
		// Old key remains stored.
		expect(screen.getByTestId("settings-models-current-key")).toHaveTextContent(/1111$/);
	});
});
