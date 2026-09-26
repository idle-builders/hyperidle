/**
 * AppShell: the persistent Sidebar + main layout, settings state-swap,
 * global search navigation, and the Sidebar's live thread/document fast-nav
 * lists.
 *
 * `call` is mocked file-wide with a default that passes through to the real
 * implementation (so components that fetch through `call` still work off the
 * `global.fetch` stub each describe sets up); describes that need specific
 * `call` responses (the Sidebar's thread/document lists) override it.
 */

import type { ThreadListRow } from "@hyperidle/domain-model";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { JSX } from "react";
import { createMemoryRouter, RouterProvider, useOutletContext } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppShell } from "../layouts/AppShell";
import { Conversations } from "../pages/Conversations";
import { SettingsPage } from "../pages/SettingsPage";

const { callMock } = vi.hoisted(() => ({ callMock: vi.fn() }));
vi.mock("../services/call.js", () => ({ call: (...args: unknown[]) => callMock(...args) }));

beforeEach(async () => {
	const actual = await vi.importActual<typeof import("../services/call.js")>("../services/call.js");
	callMock.mockImplementation(actual.call);
});

afterEach(() => {
	vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Layout, view switching, settings toggle, global search navigation
// ---------------------------------------------------------------------------

describe("AppShell", () => {
	const STUB_SETTINGS = {
		profile: { name: "Founder", avatarUrl: null },
		teams: [],
		users: [],
		notifications: {
			reviewAlerts: true,
			blockerAlerts: true,
			quietHoursStart: "22:00",
			quietHoursEnd: "08:00",
			mutedTeams: [],
		},
	};

	function stubApiFetch(): void {
		global.fetch = vi.fn(async (input: RequestInfo | URL) => {
			const url =
				typeof input === "string"
					? input
					: input instanceof URL
						? input.href
						: (input as Request).url;
			if (url.includes("/api/settings")) {
				return { ok: true, json: async () => STUB_SETTINGS } as unknown as Response;
			}
			return {
				ok: true,
				json: async () => ({ threads: [], nextCursor: null }),
			} as unknown as Response;
		}) as unknown as typeof fetch;
	}

	function renderShell(
		initialPath = "/conversations",
		childContent = "Test Page Content",
	): ReturnType<typeof render> {
		stubApiFetch();
		const router = createMemoryRouter(
			[
				{
					path: "/",
					element: <AppShell />,
					children: [
						{ path: "conversations", element: <div>{childContent}</div> },
						{ path: "conversations/:threadId", element: <div>{childContent}</div> },
						{ path: "work", element: <div>Work Page</div> },
						{ path: "work/portfolio", element: <div>Portfolio Page</div> },
						{ path: "work/team", element: <div>Team Page</div> },
						{ path: "documents", element: <div>Documents Page</div> },
						{ path: "settings", element: <div>Settings Page</div> },
					],
				},
			],
			{ initialEntries: [initialPath] },
		);
		return render(<RouterProvider router={router} />);
	}

	it("renders the shell layout with Sidebar + main regions and the outlet content", async () => {
		const { container } = renderShell();
		await waitFor(() => {
			expect(container.querySelector("[data-ds-shell='Sidebar']")).toBeInTheDocument();
			expect(screen.getByTestId("main-content")).toBeInTheDocument();
			expect(screen.getByText("Test Page Content")).toBeInTheDocument();
		});
	});

	it("renders the Conversations section link in the sidebar", async () => {
		renderShell("/conversations");
		await waitFor(() => {
			expect(screen.getByRole("link", { name: /conversations/i })).toBeInTheDocument();
		});
	});

	it("switches views when clicking a sidebar section link", async () => {
		const user = userEvent.setup();
		renderShell("/conversations");

		await waitFor(() => {
			expect(screen.getByText("Test Page Content")).toBeInTheDocument();
		});

		await user.click(screen.getByRole("link", { name: /work/i }));

		await waitFor(() => {
			expect(screen.getByText("Work Page")).toBeInTheDocument();
		});
	});

	it("opens settings in Main when the settings button is clicked, keeping the domain navigator", async () => {
		const user = userEvent.setup();
		renderShell("/conversations");

		await waitFor(() => {
			expect(screen.getByRole("button", { name: /settings/i })).toBeInTheDocument();
		});
		await user.click(screen.getByRole("button", { name: /settings/i }));

		await waitFor(() => {
			expect(screen.getByRole("button", { name: /settings/i })).toHaveAttribute(
				"aria-current",
				"page",
			);
			expect(screen.getByRole("link", { name: /^conversations$/i })).toBeInTheDocument();
		});
	});

	describe("global search navigation by type", () => {
		function renderShellWithProbes(initialPath = "/conversations"): {
			user: ReturnType<typeof userEvent.setup>;
			router: ReturnType<typeof createMemoryRouter>;
		} {
			const user = userEvent.setup();
			const router = createMemoryRouter(
				[
					{
						path: "/",
						element: <AppShell />,
						children: [
							{ path: "conversations", element: <div>Conversations Queue Page</div> },
							{
								path: "conversations/:threadId",
								element: <div data-testid="conversations-target">Conversations Detail Page</div>,
							},
							{ path: "work/portfolio", element: <div>Portfolio Page</div> },
							{ path: "work/team", element: <div>Team Page</div> },
							{
								path: "work/task/:taskId",
								element: <div data-testid="work-task-target">Work Task Target</div>,
							},
							{ path: "documents", element: <div>Documents Page</div> },
							{
								path: "documents/:documentId",
								element: <div data-testid="document-target">Document Target</div>,
							},
						],
					},
				],
				{ initialEntries: [initialPath] },
			);
			render(<RouterProvider router={router} />);
			return { user, router };
		}

		beforeEach(() => {
			global.fetch = vi.fn().mockResolvedValue({
				ok: true,
				json: () =>
					Promise.resolve({
						conversations: [],
						work: [{ id: "b42", title: "Bet Fortytwo", team: "HyperIdle", state: "in_progress" }],
						documents: [{ id: "k7", title: "Arch doc", status: "active", timestamp: "now" }],
					}),
			}) as typeof fetch;
		});

		it("navigates a work result to /work/task/{id}", async () => {
			const { user, router } = renderShellWithProbes();
			await user.keyboard("{Meta>}k{/Meta}");
			const input = await screen.findByPlaceholderText(/search conversations/i);
			await user.type(input, "Bet");
			await waitFor(() => expect(screen.getByText("Bet Fortytwo")).toBeInTheDocument());
			await user.click(screen.getByText("Bet Fortytwo"));
			await waitFor(() => {
				expect(router.state.location.pathname).toBe("/work/task/b42");
			});
		});

		it("navigates a document result to /documents/{id}", async () => {
			const { user, router } = renderShellWithProbes();
			await user.keyboard("{Meta>}k{/Meta}");
			const input = await screen.findByPlaceholderText(/search conversations/i);
			await user.type(input, "Arch");
			await waitFor(() => expect(screen.getByText("Arch doc")).toBeInTheDocument());
			await user.click(screen.getByText("Arch doc"));
			await waitFor(() => {
				expect(router.state.location.pathname).toBe("/documents/k7");
			});
		});

		it("navigates a conversation result to /conversations/:id", async () => {
			(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
				ok: true,
				json: () =>
					Promise.resolve({
						conversations: [
							{ id: "c9", title: "Review session", snippet: "...", timestamp: "1m ago", kind: "review" },
						],
						work: [],
						documents: [],
					}),
			});
			const { user, router } = renderShellWithProbes("/documents");
			await user.keyboard("{Meta>}k{/Meta}");
			const input = await screen.findByPlaceholderText(/search conversations/i);
			await user.type(input, "Review");
			await waitFor(() => expect(screen.getByText("Review session")).toBeInTheDocument());
			await user.click(screen.getByText("Review session"));
			await waitFor(() => {
				expect(router.state.location.pathname).toBe("/conversations/c9");
			});
		});
	});
});

// ---------------------------------------------------------------------------
// Sidebar thread list wiring
// ---------------------------------------------------------------------------

describe("AppShell wires the thread list into the Sidebar Conversations section", () => {
	const NOW_ISO = "2026-04-30T12:00:00.000Z";
	const WITHIN_24H = "2026-04-30T10:00:00.000Z";

	function row(overrides: Partial<ThreadListRow>): ThreadListRow {
		return {
			id: overrides.id ?? "t1",
			hostKind: overrides.hostKind ?? "team",
			hostId: overrides.hostId ?? "h-1",
			initiatorId: overrides.initiatorId ?? "u-founder",
			members: overrides.members ?? ["u-founder", "agent-1"],
			title: overrides.title ?? null,
			computedTitle: overrides.computedTitle ?? "Thread",
			pinned: overrides.pinned ?? false,
			resolvedAt: overrides.resolvedAt ?? null,
			deletedAt: overrides.deletedAt ?? null,
			lastActiveAt: overrides.lastActiveAt ?? NOW_ISO,
			createdAt: overrides.createdAt ?? NOW_ISO,
			hasUnresolvedReview: overrides.hasUnresolvedReview ?? false,
			lastMessagePreview: overrides.lastMessagePreview ?? null,
		};
	}

	const SEVEN_THREADS: ThreadListRow[] = [
		row({ id: "coach", hostKind: "user", pinned: true }),
		row({ id: "a1", hasUnresolvedReview: true }),
		row({ id: "a2", hasUnresolvedReview: true }),
		row({ id: "a3", hasUnresolvedReview: true }),
		row({ id: "a4", hasUnresolvedReview: true }),
		row({ id: "r1", resolvedAt: WITHIN_24H }),
		row({ id: "r2", resolvedAt: WITHIN_24H }),
	];

	function setCallMock(threads: ThreadListRow[]): void {
		callMock.mockImplementation(async (action: string) => {
			if (action === "search_threads") return { ok: true, data: threads };
			if (action === "open_user") {
				return {
					ok: true,
					data: {
						user: { id: "u-founder-test", name: "Founder", avatarUrl: null, team: null },
						runsOn: [],
						runConfig: null,
						documentIds: [],
						folders: [],
						subscriptions: [],
						connections: null,
						inbox: null,
					},
				};
			}
			return { ok: true, data: [] };
		});
		global.fetch = vi.fn(async () => ({ ok: true, json: async () => ({}) }) as Response) as unknown as typeof fetch;
	}

	function MainStub(): JSX.Element {
		const ctx = useOutletContext<{ selectedThreadId: string | null } | undefined>();
		return <div data-testid="main-stub">selected:{ctx?.selectedThreadId ?? "none"}</div>;
	}

	function ThreadsStatusStub(): JSX.Element {
		const ctx = useOutletContext<{ threadsStatus?: string } | undefined>();
		return <div data-testid="threads-status-stub">{ctx?.threadsStatus ?? "none"}</div>;
	}

	function renderShell(initialPath = "/conversations"): { router: ReturnType<typeof createMemoryRouter> } {
		const router = createMemoryRouter(
			[
				{
					path: "/",
					element: <AppShell />,
					children: [
						{ path: "conversations", element: <MainStub /> },
						{ path: "conversations/:threadId", element: <MainStub /> },
					],
				},
			],
			{ initialEntries: [initialPath] },
		);
		render(<RouterProvider router={router} />);
		return { router };
	}

	beforeEach(() => setCallMock(SEVEN_THREADS));

	it("renders up to 5 sidebar thread items, as data-thread-id items (not ThreadRow)", async () => {
		renderShell();
		await waitFor(() => {
			expect(document.querySelectorAll("[data-thread-id]").length).toBe(5);
		});
	});

	it("clicking a sidebar thread item navigates to /conversations/:threadId and updates the main pane", async () => {
		const user = userEvent.setup();
		const { router } = renderShell();
		await waitFor(() => {
			expect(document.querySelectorAll("[data-thread-id]").length).toBe(5);
		});

		expect(screen.getByTestId("main-stub")).toHaveTextContent("selected:none");

		const firstItem = document.querySelectorAll("[data-thread-id]")[0] as HTMLElement;
		await user.click(firstItem.querySelector("a") ?? firstItem);

		await waitFor(() => {
			expect(router.state.location.pathname).toMatch(/^\/conversations\/.+$/);
		});
		await waitFor(() => {
			expect(screen.getByTestId("main-stub").textContent).not.toBe("selected:none");
		});
	});

	it("clicking a sidebar thread item marks it selected (aria-current=page)", async () => {
		const user = userEvent.setup();
		renderShell();
		await waitFor(() => {
			expect(document.querySelectorAll("[data-thread-id]").length).toBe(5);
		});
		const firstItem = document.querySelector("[data-thread-id]") as HTMLElement;
		await user.click(firstItem.querySelector("a") ?? firstItem);
		await waitFor(() => {
			expect(document.querySelector("[data-thread-id][aria-current='page']")).not.toBeNull();
		});
	});

	it("shows 'No threads yet' when there are no threads", async () => {
		setCallMock([]);
		renderShell();
		await waitFor(() => {
			expect(screen.getByText(/no threads yet/i)).toBeInTheDocument();
		});
	});

	it("shows 'Couldn't load threads' (not the empty copy) when the user fetch fails", async () => {
		callMock.mockImplementation(async (action: string) => {
			if (action === "open_user") return { ok: false, problems: [{ code: "boom", message: "Network error" }] };
			return { ok: true, data: [] };
		});
		renderShell();
		await waitFor(() => {
			expect(screen.queryByText(/no threads yet/i)).not.toBeInTheDocument();
			expect(screen.getByText(/couldn't load threads/i)).toBeInTheDocument();
		});
	});

	it("passes threadsStatus='error' (not 'ready') through Outlet context when the user fetch fails", async () => {
		callMock.mockImplementation(async (action: string) => {
			if (action === "open_user") return { ok: false, problems: [{ code: "boom", message: "Network error" }] };
			return { ok: true, data: [] };
		});
		const router = createMemoryRouter(
			[{ path: "/", element: <AppShell />, children: [{ path: "conversations", element: <ThreadsStatusStub /> }] }],
			{ initialEntries: ["/conversations"] },
		);
		render(<RouterProvider router={router} />);
		await waitFor(() => {
			expect(screen.getByTestId("threads-status-stub").textContent).toBe("error");
		});
	});
});

// ---------------------------------------------------------------------------
// Sidebar Knowledge fast-nav list
// ---------------------------------------------------------------------------

describe("AppShell sidebar Knowledge fast-nav list", () => {
	function docRow(overrides: Record<string, unknown>): Record<string, unknown> {
		return {
			id: "d1",
			title: "Untitled",
			body: "",
			format: "markdown",
			status: "active",
			slot: "ordinary",
			scopeKind: "team",
			scopeId: "team-1",
			parentKind: null,
			parentId: null,
			position: 0,
			version: 1,
			updatedBy: "agent",
			createdAt: "2025-01-01T00:00:00.000Z",
			updatedAt: "2025-01-02T00:00:00.000Z",
			readCount: 0,
			lastReadAt: null,
			sessionUseCount: 0,
			lastUsedAt: null,
			as: "document",
			...overrides,
		};
	}

	beforeEach(() => {
		callMock.mockImplementation(async (action: string) => {
			if (action === "search_documents") {
				return {
					ok: true,
					data: [
						docRow({ id: "k1", title: "Auth" }),
						docRow({ id: "k-skill", title: "write-tests-skill", slot: "skill", parentKind: "agent", parentId: "agent-1" }),
					],
				};
			}
			return { ok: true, data: [] };
		});
		global.fetch = vi.fn(async () => ({ ok: true, json: async () => ({ threads: [], nextCursor: null }) })) as unknown as typeof fetch;
	});

	function renderShellAt(initialPath: string): ReturnType<typeof createMemoryRouter> {
		const router = createMemoryRouter(
			[
				{
					path: "/",
					element: <AppShell />,
					children: [
						{ path: "conversations", element: <div>Conversations Page</div> },
						{ path: "documents", element: <div data-testid="document-page">Documents Page</div> },
						{ path: "documents/:documentId", element: <div>Detail</div> },
					],
				},
			],
			{ initialEntries: [initialPath] },
		);
		render(<RouterProvider router={router} />);
		return router;
	}

	it("comes from search_documents, shows ordinary items, and never a skill or rule", async () => {
		renderShellAt("/documents");
		await waitFor(() => {
			expect(callMock).toHaveBeenCalledWith("search_documents", { inTree: true, limit: 50 });
		});
		expect(await screen.findByText("Auth")).toBeInTheDocument();
		expect(screen.queryByText("write-tests-skill")).not.toBeInTheDocument();
	});

	it("marks the Knowledge section active on /documents, labeled exactly 'Knowledge'", async () => {
		renderShellAt("/documents");
		await waitFor(() => {
			expect(screen.getByTestId("document-page")).toBeInTheDocument();
		});
		expect(
			document.querySelector("[data-section='knowledge'][data-active='true']"),
		).toBeInTheDocument();
		// Exact-equality name match (not a substring/regex) — founder ruling 3.
		expect(screen.getByRole("link", { name: "Knowledge" })).toBeInTheDocument();
	});
});

// ---------------------------------------------------------------------------
// Settings state-swap
// ---------------------------------------------------------------------------

describe("AppShell settings", () => {
	function renderShell(initialPath = "/conversations"): ReturnType<typeof render> {
		const router = createMemoryRouter(
			[
				{
					path: "/",
					element: <AppShell />,
					children: [
						{ path: "conversations", element: <div>Conversations Page</div> },
						{ path: "conversations/:threadId", element: <div>Conversations Page</div> },
						{ path: "work/portfolio", element: <div>Portfolio Page</div> },
						{ path: "work/team", element: <div>Team Page</div> },
						{ path: "documents", element: <div>Document Page</div> },
						{ path: "settings", element: <SettingsPage /> },
					],
				},
			],
			{ initialEntries: [initialPath] },
		);
		return render(<RouterProvider router={router} />);
	}

	beforeEach(() => {
		global.fetch = vi.fn().mockImplementation((url: unknown) => {
			const urlStr = typeof url === "string" ? url : String(url);
			if (urlStr.includes("/api/actions/search_users")) {
				return Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true, data: [] }) });
			}
			if (urlStr.includes("/api/actions/open_user")) {
				return Promise.resolve({
					ok: true,
					json: () =>
						Promise.resolve({
							ok: true,
							data: {
								user: {
									id: "u-founder",
									kind: "human",
									name: "Test Founder",
									role: "founder",
									status: "active",
									avatarUrl: null,
									team: null,
									edges: [],
								},
								runsOn: [],
								runConfig: null,
								documentIds: [],
								folders: [],
								subscriptions: [],
								connections: null,
								inbox: null,
							},
						}),
				});
			}
			if (urlStr.includes("/api/actions/edit_user")) {
				return Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true, data: {} }) });
			}
			if (urlStr.includes("/api/org")) {
				return Promise.resolve({ ok: true, json: () => Promise.resolve({ edges: [], users: [] }) });
			}
			if (urlStr.includes("/api/harnesses")) {
				return Promise.resolve({
					ok: true,
					json: () =>
						Promise.resolve([
							{
								type: "opencode",
								name: "OpenCode",
								kind: "local",
								accessMode: "api-gateway",
								authAction: { kind: "enter_api_key", label: "Enter API key" },
								discovery: { state: "ready" },
								models: [],
								runtime: {
									preCompactionTrigger: false,
									subAgents: false,
									mcpSupport: false,
									modelProviders: ["anthropic"],
									fileEditing: false,
									toolUse: false,
								},
								modelProviders: ["anthropic"],
							},
						]),
				});
			}
			if (urlStr.includes("/api/agents")) {
				return Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
			}
			return Promise.resolve({
				ok: true,
				json: () =>
					Promise.resolve({
						conversations: [],
						work: [],
						documents: [],
						threads: [],
						nextCursor: null,
						id: "u-founder",
						name: "Test Founder",
						avatarUrl: null,
						profile: { name: "Test Founder", avatarUrl: null },
						teams: [],
						users: [],
						notifications: {
							reviewAlerts: true,
							blockerAlerts: true,
							quietHoursStart: "22:00",
							quietHoursEnd: "08:00",
							mutedTeams: [],
						},
					}),
			});
		}) as typeof fetch;
	});

	it("settings button selects Settings and opens the stacked settings sections in Main", async () => {
		const user = userEvent.setup();
		renderShell();

		await waitFor(() => {
			expect(screen.getByRole("button", { name: /settings/i })).toBeInTheDocument();
		});
		await user.click(screen.getByRole("button", { name: /settings/i }));

		await waitFor(() => {
			expect(screen.getByRole("button", { name: /settings/i })).toHaveAttribute("aria-current", "page");
			for (const label of ["Profile", "Org chart", "Worker", "Plugins", "Notifications", "Appearance", "Agents", "Backend"]) {
				expect(screen.getAllByText(label).length).toBeGreaterThanOrEqual(1);
			}
		});
	});

	it("main-content is not aria-hidden while settings is open (screen readers reach the forms)", async () => {
		const user = userEvent.setup();
		renderShell();
		await waitFor(() => {
			expect(screen.getByTestId("main-content")).toBeInTheDocument();
		});
		await user.click(screen.getByRole("button", { name: /settings/i }));
		await waitFor(() => {
			expect(screen.getByRole("button", { name: /settings/i })).toHaveAttribute("aria-current", "page");
		});
		expect(screen.getByTestId("main-content").getAttribute("aria-hidden")).toBeNull();
	});

	it("settings is not a modal dialog with tabs (the old tab-based SettingsPanel is gone)", async () => {
		const user = userEvent.setup();
		renderShell();
		await waitFor(() => {
			expect(screen.getByRole("button", { name: /settings/i })).toBeInTheDocument();
		});
		await user.click(screen.getByRole("button", { name: /settings/i }));
		await waitFor(() => {
			expect(screen.getAllByText("Settings").length).toBeGreaterThanOrEqual(1);
		});
		const tabBasedSettingsDialog = screen
			.queryAllByRole("dialog", { name: /settings/i })
			.find((d) => d.querySelector('[role="tablist"]') !== null);
		expect(tabBasedSettingsDialog).toBeUndefined();
	});

	it("Command-K while Settings is open closes Settings and opens search", async () => {
		const user = userEvent.setup();
		renderShell();
		await waitFor(() => {
			expect(screen.getByRole("button", { name: /settings/i })).toBeInTheDocument();
		});
		await user.click(screen.getByRole("button", { name: /settings/i }));
		await waitFor(() => {
			expect(screen.getByRole("button", { name: /settings/i })).toHaveAttribute("aria-current", "page");
		});

		await user.keyboard("{Meta>}k{/Meta}");

		await waitFor(() => {
			expect(screen.getByRole("button", { name: /settings/i })).not.toHaveAttribute("aria-current");
		});
		await waitFor(() => {
			expect(screen.getByRole("dialog", { name: /global search/i })).toBeInTheDocument();
		});
	});

	it("Escape key closes settings", async () => {
		const user = userEvent.setup();
		renderShell();
		await waitFor(() => {
			expect(screen.getByRole("button", { name: /settings/i })).toBeInTheDocument();
		});
		await user.click(screen.getByRole("button", { name: /settings/i }));
		await waitFor(() => {
			expect(screen.getAllByText("Settings").length).toBeGreaterThanOrEqual(1);
		});

		await user.keyboard("{Escape}");

		await waitFor(() => {
			expect(screen.queryByText("Settings")).not.toBeInTheDocument();
		});
	});

	// Bug: the settings-level Escape handler ran in the capture phase on
	// document, ahead of a Combobox's own bubble-phase Escape handling, so the
	// first Escape while a Settings combobox was open closed all of Settings
	// instead of just the dropdown.
	it("Escape with an open combobox closes the dropdown first, without leaving Settings", async () => {
		const user = userEvent.setup();
		renderShell();
		await waitFor(() => {
			expect(screen.getByRole("button", { name: /settings/i })).toBeInTheDocument();
		});
		await user.click(screen.getByRole("button", { name: /settings/i }));

		await waitFor(() => {
			expect(screen.getByTestId("add-edge-btn")).toBeInTheDocument();
		});
		await user.click(screen.getByTestId("add-edge-btn"));

		const fromTrigger = await screen.findByRole("combobox", { name: /^from/i });
		await user.click(fromTrigger);

		await waitFor(() => {
			expect(document.getElementById("org-from-list")).toBeInTheDocument();
		});

		await user.keyboard("{Escape}");

		await waitFor(() => {
			expect(document.getElementById("org-from-list")).not.toBeInTheDocument();
		});
		expect(screen.getAllByText("Settings").length).toBeGreaterThanOrEqual(1);
		expect(document.activeElement).toBe(fromTrigger);

		await user.keyboard("{Escape}");

		await waitFor(() => {
			expect(screen.queryByText("Settings")).not.toBeInTheDocument();
		});
	});

	// Regression: the guard previously walked every ancestor up to <body> and
	// matched if that ancestor CONTAINED any open combobox anywhere on the
	// page — which body always does, so it matched no matter where focus was.
	// Clicking outside a Combobox does not close it (documented limitation),
	// so focus can genuinely sit outside the popover while it is still open.
	it("Escape closes Settings when focus is outside an open combobox popover", async () => {
		const user = userEvent.setup();
		renderShell();
		await waitFor(() => {
			expect(screen.getByRole("button", { name: /settings/i })).toBeInTheDocument();
		});
		await user.click(screen.getByRole("button", { name: /settings/i }));

		await waitFor(() => {
			expect(screen.getByTestId("add-edge-btn")).toBeInTheDocument();
		});
		await user.click(screen.getByTestId("add-edge-btn"));

		const fromTrigger = await screen.findByRole("combobox", { name: /^from/i });
		await user.click(fromTrigger);

		await waitFor(() => {
			expect(document.getElementById("org-from-list")).toBeInTheDocument();
		});

		(document.activeElement as HTMLElement).blur();
		expect(document.activeElement).toBe(document.body);
		expect(document.getElementById("org-from-list")).toBeInTheDocument();

		await user.keyboard("{Escape}");

		await waitFor(() => {
			expect(screen.queryByText("Settings")).not.toBeInTheDocument();
		});
	});

	it("shows the Profile section's Display name field in Main when settings is open", async () => {
		const user = userEvent.setup();
		renderShell();
		await waitFor(() => {
			expect(screen.getByRole("button", { name: /settings/i })).toBeInTheDocument();
		});
		await user.click(screen.getByRole("button", { name: /settings/i }));
		await waitFor(() => {
			expect(screen.getByLabelText(/display name/i)).toBeInTheDocument();
		});
	});
});

// ---------------------------------------------------------------------------
// Conversations error/loading states, reached through AppShell's Outlet context
// ---------------------------------------------------------------------------

describe("AppShell + Conversations: thread list error/loading states", () => {
	const STUB_USER = { id: "u-founder-test", name: "Founder", avatarUrl: null };
	const OPEN_USER_RESULT = {
		ok: true,
		data: {
			user: { ...STUB_USER, team: null },
			runsOn: [],
			runConfig: null,
			documentIds: [],
			folders: [],
			subscriptions: [],
			connections: null,
			inbox: null,
		},
	};

	function renderShellAt(initialPath: string): void {
		const router = createMemoryRouter(
			[
				{
					path: "/",
					element: <AppShell />,
					children: [
						{ path: "conversations", element: <Conversations /> },
						{ path: "conversations/:threadId", element: <Conversations /> },
					],
				},
			],
			{ initialEntries: [initialPath] },
		);
		render(<RouterProvider router={router} />);
	}

	beforeEach(() => {
		global.fetch = vi.fn(async () => ({ ok: true, json: async () => ({}) }) as Response) as unknown as typeof fetch;
	});

	it("shows the thread-sections error state when search_threads fails", async () => {
		callMock.mockImplementation(async (action: string) => {
			if (action === "search_threads") return { ok: false, problems: [{ code: "boom", message: "boom", path: "" }] };
			if (action === "open_user") return OPEN_USER_RESULT;
			return { ok: true, data: [] };
		});
		renderShellAt("/conversations");
		await screen.findByTestId("thread-sections-error");
	});

	it("shows the thread-sections loading state while search_threads is in flight", async () => {
		callMock.mockImplementation(async (action: string) => {
			if (action === "search_threads") return new Promise(() => {});
			if (action === "open_user") return OPEN_USER_RESULT;
			return { ok: true, data: [] };
		});
		renderShellAt("/conversations");
		await screen.findByTestId("thread-sections-loading");
		expect(screen.queryByTestId("thread-sections-error")).not.toBeInTheDocument();
	});
});
