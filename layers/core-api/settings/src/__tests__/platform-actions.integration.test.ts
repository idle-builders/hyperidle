/**
 * The platform module — `search_plugins`/`edit_plugin` own the whole plugin
 * lifecycle. Real PGlite via the `{ db }`
 * fixture. `deps.agents`/`deps.subscriptions` are backed by real queries
 * against the real `users`/`subscriptions` tables — the same crossing
 * `compose.ts` binds in production, built here with raw drizzle rather than
 * importing `@hyperidle/user` (this package may not depend on it).
 * `deps.editDocument`/`deps.searchDocuments` are the REAL
 * `@hyperidle/document` actions, not a stub — the one genuinely external
 * crossing this module has, and the phase-discipline this whole module
 * exists to protect only means something against the real thing.
 */
import { existsSync, mkdirSync, mkdtempSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	changes,
	documents,
	type HyperIdleDb,
	plugins,
	subscriptions,
	teams,
	users,
	type WriteExecutor,
} from "@hyperidle/db";
import { describe, expect, test } from "@hyperidle/db/test-fixtures";
import { createDocumentActions, type DocumentActionsDeps } from "@hyperidle/document";
import { EventBus } from "@hyperidle/event-bus";
import { eq, inArray } from "drizzle-orm";
import {
	type Action,
	type ActionContext,
	createPlatformActions,
	type PlatformActionsDeps,
} from "../platform-actions.js";
import { markDetached } from "../plugin-contributions.js";

const NOW = "2026-01-01T00:00:00.000Z";

async function seedFounder(db: HyperIdleDb): Promise<void> {
	await db
		.insert(users)
		.values({
			id: "u-founder",
			kind: "human",
			name: "Founder",
			role: "founder",
			status: "active",
			createdAt: NOW,
		})
		.onConflictDoNothing();
}

/** The real document actions, wired with raw-drizzle deps — the same
 * standalone shape `compose.ts`'s `buildStandaloneDocumentActions` uses.
 * `openParent` is unreachable here (this module never parents a document to
 * a task/thread). */
function realDocumentActions(): readonly Action[] {
	const deps: DocumentActionsDeps = {
		changes: {
			appendChange: async (exec: WriteExecutor, row) => {
				await exec.insert(changes).values(row);
			},
		},
		users: {
			getUserById: async (exec, id) => {
				const [row] = await exec.select().from(users).where(eq(users.id, id)).limit(1);
				return row;
			},
			listOwnedBy: async (exec, ownerId) =>
				exec.select().from(users).where(eq(users.ownerUserId, ownerId)),
		},
		org: {
			getTeam: async (exec, q) => {
				const [row] = await exec.select().from(teams).where(eq(teams.id, q.id)).limit(1);
				return row;
			},
		},
		openParent: () => {
			throw new Error("platform-actions test: openParent is unreachable");
		},
		systemParentExists: async (exec, kind, id) => {
			if (kind === "agent") {
				const [row] = await exec
					.select({ id: users.id })
					.from(users)
					.where(eq(users.id, id))
					.limit(1);
				return row !== undefined;
			}
			const [row] = await exec
				.select({ id: subscriptions.id })
				.from(subscriptions)
				.where(eq(subscriptions.id, id))
				.limit(1);
			return row !== undefined;
		},
		onBodyChanged: (exec, documentId) =>
			markDetached(exec, { kind: "document", entityId: documentId, ts: new Date().toISOString() }),
	};
	return createDocumentActions(deps) as readonly Action[];
}

function runnerFor<I, O>(
	actions: readonly Action[],
	name: string,
): (ctx: ActionContext, input: I) => Promise<import("@hyperidle/domain-model").ActionResult<O>> {
	const found = actions.find((a) => a.declaration.name === name);
	if (!found) throw new Error(`no "${name}" action in the bag`);
	return found.run as never;
}

interface DocRow {
	readonly document: { readonly id: string; readonly body: string; readonly status: string };
}

function buildDeps(overrides: Partial<PlatformActionsDeps> = {}): PlatformActionsDeps {
	const documentActions = realDocumentActions();
	return {
		agents: {
			insertIfAbsent: async (exec, values) => {
				await exec.insert(users).values(values).onConflictDoNothing();
			},
			setStatus: async (exec, ids, status) => {
				if (ids.length === 0) return;
				await exec
					.update(users)
					.set({ status })
					.where(inArray(users.id, [...ids]));
			},
			list: async (exec, ids) => {
				if (ids.length === 0) return [];
				return exec
					.select({ id: users.id, name: users.name })
					.from(users)
					.where(inArray(users.id, [...ids]));
			},
		},
		subscriptions: {
			insert: async (exec, values, opts) => {
				const row = {
					id: values.id,
					userId: values.userId,
					event: values.event,
					schedule: values.schedule,
					paused: false,
					nextRunAt: null,
					createdAt: values.createdAt,
					updatedAt: values.createdAt,
				};
				if (opts?.onConflictDoNothing) {
					await exec.insert(subscriptions).values(row).onConflictDoNothing();
				} else {
					await exec.insert(subscriptions).values(row);
				}
			},
			setLive: async (exec, ids, live) => {
				if (ids.length === 0) return;
				await exec
					.update(subscriptions)
					.set({ paused: !live, updatedAt: new Date().toISOString() })
					.where(inArray(subscriptions.id, [...ids]));
			},
			remove: async (exec, ids) => {
				if (ids.length === 0) return;
				await exec.delete(subscriptions).where(inArray(subscriptions.id, [...ids]));
			},
			get: async (exec, id) => {
				const [row] = await exec
					.select({ event: subscriptions.event, schedule: subscriptions.schedule })
					.from(subscriptions)
					.where(eq(subscriptions.id, id))
					.limit(1);
				return row ? { label: row.event ?? row.schedule ?? "" } : undefined;
			},
		},
		editDocument: runnerFor(documentActions, "edit_document"),
		searchDocuments: runnerFor(documentActions, "search_documents"),
		// No adapter pool here, so no harness is ever picked; the harness and the
		// viewer's team are proven through the layer's own composition
		// (`layers/core-api/src/routes/__tests__/plugins-bundled.integration.test.ts`).
		runConfig: {
			read: async () => ({ harnessType: null }),
			write: async () => {},
		},
		viewerTeamId: async () => null,
		teams: {
			exists: async (exec, teamId) => {
				const [row] = await exec
					.select({ id: teams.id })
					.from(teams)
					.where(eq(teams.id, teamId))
					.limit(1);
				return row !== undefined;
			},
		},
		...overrides,
	};
}

function ctxFor(db: HyperIdleDb, actor = "u-founder"): ActionContext {
	return { actor, db, eventBus: new EventBus(), now: NOW };
}

function typedActions(deps: PlatformActionsDeps): {
	readonly search: Action<
		import("@hyperidle/domain-model").SearchPluginsInput,
		import("@hyperidle/domain-model").PluginView[]
	>;
	readonly edit: Action<
		import("@hyperidle/domain-model").EditPluginInput,
		import("@hyperidle/domain-model").PluginView
	>;
} {
	const [search, edit] = createPlatformActions(deps);
	if (!(search && edit)) throw new Error("createPlatformActions: expected two actions");
	return { search: search as never, edit: edit as never };
}

/** A minimal plugin: one agent (with an identity file), one subscription
 * (with a prompt), one skill, and one MCP server in `mcp.json` — enough to
 * exercise every phase of the lifecycle. */
function makePlugin(pluginId: string): string {
	const dir = mkdtempSync(join(tmpdir(), "platform-actions-test-"));
	mkdirSync(join(dir, "skills", "sweep"), { recursive: true });
	writeFileSync(join(dir, "skills", "sweep", "SKILL.md"), "# Sweep\n\nDo the sweep.");
	writeFileSync(join(dir, "identity.md"), "# You are Builder\n\nYou build things.");
	writeFileSync(
		join(dir, "mcp.json"),
		JSON.stringify({ tracker: { url: "https://t.example/mcp" } }),
	);
	writeFileSync(
		join(dir, "plugin.json"),
		JSON.stringify({
			$schema: "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json",
			name: pluginId,
			version: "1.0.0",
			extensions: {
				"io.hyperidle": {
					agents: [
						{
							id: "builder",
							name: "Builder",
							role: "builder",
							agentCategory: "team",
							identity: "identity.md",
						},
					],
					subscriptions: [
						{
							id: "sweep-subscription",
							name: "Sweep Subscription",
							agentId: "builder",
							event: "task.changed",
							prompt: "Sweep the stale items.",
						},
					],
				},
			},
		}),
	);
	return dir;
}

describe("createPlatformActions", () => {
	describe("search_plugins", () => {
		test("no plugins installed answers an empty list", async ({ db }) => {
			const { search } = typedActions(buildDeps());
			const result = await search.run(ctxFor(db), {});
			if (!result.ok) throw new Error("expected ok");
			expect(result.data).toEqual([]);
		});

		test("lists an installed plugin with its contributions", async ({ db }) => {
			await seedFounder(db);
			const { search, edit } = typedActions(
				buildDeps({ pluginsBaseDir: mkdtempSync(join(tmpdir(), "platform-actions-store-")) }),
			);
			const dir = makePlugin("search-under-test");
			const installed = await edit.run(ctxFor(db), {
				source: { kind: "folder", path: dir, scope: { kind: "factory", teamId: null } },
			});
			if (!installed.ok) throw new Error(`install failed: ${JSON.stringify(installed.problems)}`);

			const result = await search.run(ctxFor(db), {});
			if (!result.ok) throw new Error("expected ok");
			const plugin = result.data.find((p) => p.id === "search-under-test");
			expect(plugin, "the installed plugin is listed").toBeDefined();
			expect(plugin?.state).toBe("enabled");
			const kinds = plugin?.contributions.map((c) => c.kind) ?? [];
			expect(kinds).toContain("agent");
			expect(kinds).toContain("subscription");
			expect(kinds).toContain("document");
			expect(plugin?.contributions.find((c) => c.kind === "mcp_server")).toMatchObject({
				entityId: "search-under-test/tracker",
				label: "tracker",
			});
		});

		test("filters by state and by text", async ({ db }) => {
			await seedFounder(db);
			const { search, edit } = typedActions(buildDeps());
			await edit.run(ctxFor(db), {
				source: {
					kind: "folder",
					path: makePlugin("alpha-plugin"),
					scope: { kind: "factory", teamId: null },
				},
			});
			await edit.run(ctxFor(db), {
				source: {
					kind: "folder",
					path: makePlugin("beta-plugin"),
					scope: { kind: "factory", teamId: null },
				},
			});
			await edit.run(ctxFor(db), { id: "beta-plugin", state: "disabled" });

			const enabledOnly = await search.run(ctxFor(db), { state: "enabled" });
			if (!enabledOnly.ok) throw new Error("expected ok");
			expect(enabledOnly.data.map((p) => p.id)).toEqual(["alpha-plugin"]);

			const byText = await search.run(ctxFor(db), { text: "beta" });
			if (!byText.ok) throw new Error("expected ok");
			expect(byText.data.map((p) => p.id)).toEqual(["beta-plugin"]);
		});
	});

	describe("edit_plugin — install", () => {
		test("materializes the agent, subscription and skill, all live", async ({ db }) => {
			await seedFounder(db);
			const { edit } = typedActions(buildDeps());
			const dir = makePlugin("install-under-test");

			const result = await edit.run(ctxFor(db), {
				source: { kind: "folder", path: dir, scope: { kind: "factory", teamId: null } },
			});
			if (!result.ok) throw new Error(`install failed: ${JSON.stringify(result.problems)}`);
			expect(result.data.id).toBe("install-under-test");
			expect(result.data.state).toBe("enabled");

			const agentContribution = result.data.contributions.find((c) => c.kind === "agent");
			const subscriptionContribution = result.data.contributions.find(
				(c) => c.kind === "subscription",
			);
			const documentContributions = result.data.contributions.filter((c) => c.kind === "document");
			expect(agentContribution?.label).toBe("Builder");
			expect(documentContributions.length).toBeGreaterThanOrEqual(2); // skill + agent identity + subscription prompt

			const [agentRow] = await db
				.select()
				.from(users)
				.where(eq(users.id, agentContribution?.entityId ?? ""));
			expect(agentRow?.status).toBe("active");

			const [subscriptionRow] = await db
				.select()
				.from(subscriptions)
				.where(eq(subscriptions.id, subscriptionContribution?.entityId ?? ""));
			expect(subscriptionRow).toBeDefined();

			for (const doc of documentContributions) {
				const [row] = await db.select().from(documents).where(eq(documents.id, doc.entityId));
				expect(row?.status, `document ${doc.entityId} must be active`).toBe("active");
			}
		});

		test("install_failed carries the installer's reason", async ({ db }) => {
			await seedFounder(db);
			const { edit } = typedActions(buildDeps());
			// A plugin.json missing the required "name" — `parsePluginManifest`
			// refuses it, so `installPlugin` answers `{ok:false, reason}` rather
			// than throwing.
			const dir = mkdtempSync(join(tmpdir(), "platform-actions-bad-manifest-"));
			writeFileSync(
				join(dir, "plugin.json"),
				JSON.stringify({
					$schema: "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json",
					version: "1.0.0",
				}),
			);
			const result = await edit.run(ctxFor(db), {
				source: { kind: "folder", path: dir, scope: { kind: "factory", teamId: null } },
			});
			expect(result.ok).toBe(false);
			if (result.ok) throw new Error("expected refusal");
			expect(result.problems[0]?.code).toBe("install_failed");
		});
	});

	describe("edit_plugin — enable/disable", () => {
		test("disable deactivates the agent, subscription and documents; enable revives them", async ({
			db,
		}) => {
			await seedFounder(db);
			const { edit } = typedActions(buildDeps());
			const install = await edit.run(ctxFor(db), {
				source: {
					kind: "folder",
					path: makePlugin("toggle-under-test"),
					scope: { kind: "factory", teamId: null },
				},
			});
			if (!install.ok) throw new Error("install failed");
			const agentId = install.data.contributions.find((c) => c.kind === "agent")?.entityId ?? "";

			const disabled = await edit.run(ctxFor(db), { id: "toggle-under-test", state: "disabled" });
			if (!disabled.ok) throw new Error("disable failed");
			expect(disabled.data.state).toBe("disabled");
			const [agentAfterDisable] = await db.select().from(users).where(eq(users.id, agentId));
			expect(agentAfterDisable?.status).toBe("inactive");
			const documentIds = disabled.data.contributions
				.filter((c) => c.kind === "document")
				.map((c) => c.entityId);
			for (const id of documentIds) {
				const [row] = await db.select().from(documents).where(eq(documents.id, id));
				expect(row?.status, `document ${id} must be archived`).toBe("archived");
			}

			const enabled = await edit.run(ctxFor(db), { id: "toggle-under-test", state: "enabled" });
			if (!enabled.ok) throw new Error("enable failed");
			expect(enabled.data.state).toBe("enabled");
			const [agentAfterEnable] = await db.select().from(users).where(eq(users.id, agentId));
			expect(agentAfterEnable?.status).toBe("active");
			for (const id of documentIds) {
				const [row] = await db.select().from(documents).where(eq(documents.id, id));
				expect(row?.status, `document ${id} must be active again`).toBe("active");
			}
		});
	});

	describe("edit_plugin — remove", () => {
		test("removes subscriptions, deactivates the agent, archives documents; the answer is the pre-remove view", async ({
			db,
		}) => {
			await seedFounder(db);
			const { edit } = typedActions(buildDeps());
			const install = await edit.run(ctxFor(db), {
				source: {
					kind: "folder",
					path: makePlugin("remove-under-test"),
					scope: { kind: "factory", teamId: null },
				},
			});
			if (!install.ok) throw new Error("install failed");
			const subscriptionId =
				install.data.contributions.find((c) => c.kind === "subscription")?.entityId ?? "";

			const result = await edit.run(ctxFor(db), { id: "remove-under-test", remove: true });
			if (!result.ok) throw new Error(`remove failed: ${JSON.stringify(result.problems)}`);
			// The pre-remove state — "removed" is not a member of PluginListState.
			expect(result.data.state).toBe("enabled");

			const subRow = await db
				.select()
				.from(subscriptions)
				.where(eq(subscriptions.id, subscriptionId));
			expect(subRow.length).toBe(0);

			// A second change on the now-removed plugin answers plugin_removed.
			const again = await edit.run(ctxFor(db), { id: "remove-under-test", state: "enabled" });
			expect(again.ok).toBe(false);
			if (again.ok) throw new Error("expected refusal");
			expect(again.problems[0]?.code).toBe("plugin_removed");
		});
	});

	describe("edit_plugin — restore", () => {
		test("a document contribution restores its plugin body over a person's edit", async ({
			db,
		}) => {
			await seedFounder(db);
			const dir = makePlugin("restore-under-test");
			const deps = buildDeps({
				pluginsBaseDir: mkdtempSync(join(tmpdir(), "platform-actions-store-")),
			});
			const { edit } = typedActions(deps);
			const install = await edit.run(ctxFor(db), {
				source: { kind: "folder", path: dir, scope: { kind: "factory", teamId: null } },
			});
			if (!install.ok) throw new Error(`install failed: ${JSON.stringify(install.problems)}`);
			const skillId = install.data.contributions.find(
				(c) => c.kind === "document" && c.label === "sweep",
			)?.entityId;
			expect(skillId, "the skill document exists").toBeDefined();

			const searchDocs = deps.searchDocuments as (
				ctx: ActionContext,
				input: unknown,
			) => Promise<{ ok: true; data: readonly DocRow["document"][] }>;
			const before = await searchDocs(ctxFor(db), { ids: [skillId] });
			const currentVersion = (before as unknown as { data: Array<{ version: number }> }).data[0]
				?.version;

			const edited = await deps.editDocument(ctxFor(db), {
				id: skillId as string,
				body: "My own version.",
				version: currentVersion,
			});
			if (!edited.ok) throw new Error(`edit failed: ${JSON.stringify(edited.problems)}`);
			expect(edited.data.document.body).toBe("My own version.");

			const restored = await edit.run(ctxFor(db), {
				id: "restore-under-test",
				restore: { contribution: skillId as string },
			});
			if (!restored.ok) throw new Error(`restore failed: ${JSON.stringify(restored.problems)}`);
			const restoredDoc = restored.data.contributions.find((c) => c.entityId === skillId);
			expect(restoredDoc?.detached).toBe(false);

			const after = await searchDocs(ctxFor(db), { ids: [skillId] });
			expect((after as unknown as { data: Array<{ body: string }> }).data[0]?.body).toBe(
				"# Sweep\n\nDo the sweep.",
			);
		});

		test("a document contribution with no recorded install path answers no_install_path", async ({
			db,
		}) => {
			await seedFounder(db);
			const { edit } = typedActions(buildDeps()); // no pluginsBaseDir
			const install = await edit.run(ctxFor(db), {
				source: {
					kind: "folder",
					path: makePlugin("no-install-path-under-test"),
					scope: { kind: "factory", teamId: null },
				},
			});
			if (!install.ok) throw new Error("install failed");
			const skillId = install.data.contributions.find(
				(c) => c.kind === "document" && c.label === "sweep",
			)?.entityId;

			const result = await edit.run(ctxFor(db), {
				id: "no-install-path-under-test",
				restore: { contribution: skillId as string },
			});
			expect(result.ok).toBe(false);
			if (result.ok) throw new Error("expected refusal");
			expect(result.problems[0]?.code).toBe("no_install_path");
		});

		test("restoring a contribution the plugin never made is unknown_contribution", async ({
			db,
		}) => {
			await seedFounder(db);
			const { edit } = typedActions(buildDeps());
			const install = await edit.run(ctxFor(db), {
				source: {
					kind: "folder",
					path: makePlugin("unknown-contribution-under-test"),
					scope: { kind: "factory", teamId: null },
				},
			});
			if (!install.ok) throw new Error("install failed");

			const result = await edit.run(ctxFor(db), {
				id: "unknown-contribution-under-test",
				restore: { contribution: "not-a-real-contribution" },
			});
			expect(result.ok).toBe(false);
			if (result.ok) throw new Error("expected refusal");
			expect(result.problems[0]?.code).toBe("unknown_contribution");
		});
	});

	describe("edit_plugin — not found", () => {
		test("an id that was never installed is unknown_plugin", async ({ db }) => {
			const { edit } = typedActions(buildDeps());
			const result = await edit.run(ctxFor(db), { id: "never-installed", state: "enabled" });
			expect(result.ok).toBe(false);
			if (result.ok) throw new Error("expected refusal");
			expect(result.problems[0]?.code).toBe("unknown_plugin");
		});
	});

	describe("edit_plugin — a team install", () => {
		test("a team id that is not a real team is unknown_team: no row, no folder, nothing outside the install root touched", async ({
			db,
		}) => {
			await seedFounder(db);
			const root = mkdtempSync(join(tmpdir(), "platform-actions-root-"));
			const pluginsBaseDir = join(root, "installed-plugins");
			mkdirSync(pluginsBaseDir);
			const outside = join(root, "precious");
			mkdirSync(outside);
			writeFileSync(join(outside, "keep.txt"), "not a plugin");
			const { edit } = typedActions(buildDeps({ pluginsBaseDir }));

			const result = await edit.run(ctxFor(db), {
				source: {
					kind: "folder",
					path: makePlugin("crafted-team"),
					scope: { kind: "team", teamId: "../../../precious" },
				},
			});

			expect(result.ok).toBe(false);
			if (!result.ok) expect(result.problems[0]?.code).toBe("unknown_team");
			expect(await db.select().from(plugins).where(eq(plugins.name, "crafted-team"))).toEqual([]);
			expect(readdirSync(pluginsBaseDir)).toEqual([]);
			expect(readdirSync(outside)).toEqual(["keep.txt"]);
			expect(existsSync(join(outside, "plugin.json"))).toBe(false);
		});
	});

	describe("edit_plugin — pure invariants surface through run", () => {
		test("no change field at all is one_change", async ({ db }) => {
			const { edit } = typedActions(buildDeps());
			const result = await edit.run(ctxFor(db), { id: "x" });
			expect(result.ok).toBe(false);
			if (result.ok) throw new Error("expected refusal");
			expect(result.problems.some((p) => p.code === "one_change")).toBe(true);
		});
	});
});
