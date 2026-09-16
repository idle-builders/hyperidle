/**
 * BA5 T10 — SettingsFilesystems component tests.
 *
 * AC (architecture.md §10): the "+ Add filesystem" button opens a real dialog
 * that posts a body with no `writeback` field and with the chosen GitHub
 * connection; each row's Check button posts `/:id/check` and the row renders
 * the reason the response comes back with when the filesystem is not ok.
 */

import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SettingsFilesystems } from "../settings/SettingsFilesystems.js";

const TEAM_ACTUAL_ID = "team-actual-1";

interface FetchCall {
	url: string;
	method: string;
	body: Record<string, unknown> | null;
}

interface MockOptions {
	filesystems?: unknown[];
	connections?: unknown[];
	postFilesystemsResponse?: { status: number; body: unknown };
	checkResponse?: { status: number; body: unknown };
}

function setupFetchMock(opts: MockOptions = {}): { calls: FetchCall[] } {
	const calls: FetchCall[] = [];

	global.fetch = vi.fn().mockImplementation((input: string, init?: RequestInit) => {
		const url = String(input);
		const method = (init?.method ?? "GET").toUpperCase();
		let body: Record<string, unknown> | null = null;
		if (typeof init?.body === "string") {
			try {
				body = JSON.parse(init.body) as Record<string, unknown>;
			} catch {
				body = null;
			}
		}
		calls.push({ url, method, body });

		if (method === "GET" && url.includes("/api/org")) {
			return Promise.resolve({
				ok: true,
				json: async () => ({
					teams: [{ id: "team-1", name: "Acme", teamActualId: TEAM_ACTUAL_ID }],
				}),
			});
		}
		if (method === "GET" && url.includes("/api/filesystems")) {
			return Promise.resolve({
				ok: true,
				json: async () => ({ filesystems: opts.filesystems ?? [] }),
			});
		}
		if (method === "GET" && url.includes("/api/connections")) {
			return Promise.resolve({
				ok: true,
				json: async () => opts.connections ?? [],
			});
		}
		if (method === "POST" && url.includes("/api/filesystems/") && url.endsWith("/check")) {
			const resp = opts.checkResponse ?? {
				status: 200,
				body: { check: { ok: true, reason: null } },
			};
			return Promise.resolve({
				ok: resp.status < 400,
				status: resp.status,
				json: async () => resp.body,
			});
		}
		if (method === "POST" && url.includes("/api/filesystems")) {
			const resp = opts.postFilesystemsResponse ?? {
				status: 201,
				body: {
					filesystem: {
						id: "fs-new",
						teamId: TEAM_ACTUAL_ID,
						source: "github",
						kind: "code",
						connectionId: null,
						resourceRef: { kind: "code", repo: "https://github.com/acme/app", branch: "main" },
						state: "attached",
						attentionReason: null,
						createdAt: "2026-09-12T00:00:00.000Z",
					},
					check: { ok: true, reason: null },
				},
			};
			return Promise.resolve({
				ok: resp.status < 400,
				status: resp.status,
				json: async () => resp.body,
			});
		}

		return Promise.resolve({ ok: true, status: 200, json: async () => ({}) });
	}) as typeof fetch;

	return { calls };
}

describe("SettingsFilesystems — Add filesystem dialog", () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("opens the dialog from the Add filesystem button", async () => {
		const user = userEvent.setup();
		setupFetchMock();
		render(<SettingsFilesystems />);

		await waitFor(() => {
			expect(screen.getByText(/no filesystems registered yet/i)).toBeInTheDocument();
		});

		await user.click(screen.getByRole("button", { name: /add a filesystem/i }));

		expect(screen.getByRole("dialog", { name: /add a filesystem/i })).toBeInTheDocument();
	});

	it("posts a body with no writeback field, carrying the chosen GitHub connection", async () => {
		const user = userEvent.setup();
		const { calls } = setupFetchMock({
			connections: [
				{ id: "sc-gh", service: "github", via: "API key", authSource: "token", removable: true },
			],
		});
		render(<SettingsFilesystems />);

		await waitFor(() => {
			expect(screen.getByText(/no filesystems registered yet/i)).toBeInTheDocument();
		});

		await user.click(screen.getByRole("button", { name: /add a filesystem/i }));
		const dialog = screen.getByRole("dialog", { name: /add a filesystem/i });

		await user.type(within(dialog).getByLabelText(/location/i), "https://github.com/acme/app");
		await user.type(within(dialog).getByLabelText(/branch/i), "main");

		await waitFor(() => {
			expect(within(dialog).getByLabelText(/github token/i)).toBeInTheDocument();
		});
		await user.selectOptions(within(dialog).getByLabelText(/github token/i), "sc-gh");

		await user.click(within(dialog).getByRole("button", { name: /^add$/i }));

		await waitFor(() => {
			expect(calls.some((c) => c.method === "POST" && c.url.includes("/api/filesystems"))).toBe(
				true,
			);
		});

		const postCall = calls.find(
			(c) => c.method === "POST" && c.url.includes("/api/filesystems") && !c.url.endsWith("/check"),
		);
		expect(postCall?.body).not.toBeNull();
		expect(postCall?.body).not.toHaveProperty("writeback");
		expect(postCall?.body?.connectionId).toBe("sc-gh");
		expect(postCall?.body?.teamId).toBe(TEAM_ACTUAL_ID);
	});

	it("V7: choosing Google Drive shows Remote + Folder and hides Branch and the token select", async () => {
		const user = userEvent.setup();
		setupFetchMock();
		render(<SettingsFilesystems />);

		await waitFor(() => {
			expect(screen.getByText(/no filesystems registered yet/i)).toBeInTheDocument();
		});
		await user.click(screen.getByRole("button", { name: /add a filesystem/i }));
		const dialog = screen.getByRole("dialog", { name: /add a filesystem/i });

		await user.selectOptions(within(dialog).getByLabelText(/^kind$/i), "drive");

		expect(within(dialog).getByLabelText(/^remote$/i)).toBeInTheDocument();
		expect(within(dialog).getByLabelText(/folder in drive/i)).toBeInTheDocument();
		expect(within(dialog).queryByLabelText(/^branch$/i)).not.toBeInTheDocument();
		expect(within(dialog).queryByLabelText(/github token/i)).not.toBeInTheDocument();
		expect(within(dialog).getByText(/drive runs through rclone/i)).toBeInTheDocument();
	});

	it("V7: submitting a Google Drive filesystem posts kind:'doc_set' with the drive resourceRef and connectionId:null", async () => {
		const user = userEvent.setup();
		const { calls } = setupFetchMock();
		render(<SettingsFilesystems />);

		await waitFor(() => {
			expect(screen.getByText(/no filesystems registered yet/i)).toBeInTheDocument();
		});
		await user.click(screen.getByRole("button", { name: /add a filesystem/i }));
		const dialog = screen.getByRole("dialog", { name: /add a filesystem/i });

		await user.selectOptions(within(dialog).getByLabelText(/^kind$/i), "drive");
		await user.type(within(dialog).getByLabelText(/^remote$/i), "gdrive");
		await user.type(within(dialog).getByLabelText(/folder in drive/i), "Projects/Acme");

		await user.click(within(dialog).getByRole("button", { name: /^add$/i }));

		await waitFor(() => {
			expect(calls.some((c) => c.method === "POST" && c.url.includes("/api/filesystems"))).toBe(
				true,
			);
		});

		const postCall = calls.find(
			(c) => c.method === "POST" && c.url.includes("/api/filesystems") && !c.url.endsWith("/check"),
		);
		expect(postCall?.body?.kind).toBe("doc_set");
		expect(postCall?.body?.connectionId).toBeNull();
		expect(postCall?.body?.resourceRef).toEqual({
			kind: "drive",
			remote: "gdrive",
			path: "Projects/Acme",
		});
	});
});

describe("SettingsFilesystems — Check", () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("Check posts /:id/check and renders the returned reason", async () => {
		const user = userEvent.setup();
		setupFetchMock({
			filesystems: [
				{
					id: "fs-1",
					teamId: TEAM_ACTUAL_ID,
					source: "github",
					kind: "code",
					connectionId: "sc-gh",
					resourceRef: { kind: "code", repo: "https://github.com/acme/app", branch: "main" },
					state: "attached",
					attentionReason: null,
					createdAt: "2026-09-12T00:00:00.000Z",
				},
			],
			checkResponse: {
				status: 200,
				body: {
					filesystem: {
						id: "fs-1",
						teamId: TEAM_ACTUAL_ID,
						source: "github",
						kind: "code",
						connectionId: "sc-gh",
						resourceRef: { kind: "code", repo: "https://github.com/acme/app", branch: "main" },
						state: "needs_attention",
						attentionReason: "The GitHub token was rejected. Replace it in Settings → Connections",
						createdAt: "2026-09-12T00:00:00.000Z",
					},
					check: {
						ok: false,
						reason: "The GitHub token was rejected. Replace it in Settings → Connections",
					},
				},
			},
		});
		render(<SettingsFilesystems />);

		await waitFor(() => {
			expect(screen.getByText("https://github.com/acme/app")).toBeInTheDocument();
		});

		await user.click(screen.getByRole("button", { name: /^check /i }));

		await waitFor(() => {
			expect(
				screen.getByText(/the github token was rejected\. replace it in settings/i),
			).toBeInTheDocument();
		});
	});
});

describe("SettingsFilesystems — a Drive row", () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("V7: renders remote:path, the Google Drive tag, and its attentionReason", async () => {
		setupFetchMock({
			filesystems: [
				{
					id: "fs-drive-1",
					teamId: TEAM_ACTUAL_ID,
					source: "gdrive",
					kind: "doc_set",
					connectionId: null,
					resourceRef: { kind: "drive", remote: "gdrive", path: "Projects/Acme" },
					state: "needs_attention",
					attentionReason:
						"No rclone remote named `gdrive`. Run `rclone config` to add one. Google makes you create your own OAuth client the first time; rclone's Google Drive setup walks you through it",
					createdAt: "2026-09-16T00:00:00.000Z",
				},
			],
		});
		render(<SettingsFilesystems />);

		await waitFor(() => {
			expect(screen.getByText("gdrive:Projects/Acme")).toBeInTheDocument();
		});
		expect(screen.getByText("Google Drive")).toBeInTheDocument();
		expect(screen.getByText(/no rclone remote named `gdrive`/i)).toBeInTheDocument();
	});
});
