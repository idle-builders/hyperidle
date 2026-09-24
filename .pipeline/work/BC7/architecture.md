# BC7 — architecture: the empty install and the bundled plugins

planner/opus, 2026-09-24, base `3407cb98f` (worktree `feature/opinions-out`). A proposal only:
nothing below is on the record until the tree's planner accepts it. The plan
(`.pipeline/work/BC7/plan.md`) owns what is wanted; this file says how, in the terms a builder
needs.

## 0. Reconciliation — plan against the code

Checked at file:line; census claims re-read before use. Agreements are not listed.

1. **The empty instruction does not "decide for itself" today.** Plan: the assistant "wakes with
   what happened and an empty instruction, and decides for itself". Code tells every subscription
   session "Speak only if the subscription's instruction above asks you to"
   (`run-orchestration/src/provisioner.ts:1579`, fallback `:628`). With nine empty prompts the
   assistant is told never to speak. The composer already drops the Instruction block for a null
   prompt (`context.ts:489-491`; probe: `context-assembly-prompt.test.ts` "omits the Instruction
   block…" green, log `scratchpad/bc7/arch-probe-null.log`). Fix is prompt text (§6.1). No ruling
   needed.
2. **Double wakes, caused by this item.** Verified by reading. A person's message in their 1:1
   thread with the assistant wakes it twice: the thread turn (`thread-actions.ts:1192-1224`,
   `agentsToWake` in `domain-model/src/actions/thread.ts:503-517` wakes the other side of a
   two-member thread) and the `thread.message` subscription (`subscription-fire.ts:215-233`: the
   actor is the person, the assistant is a member, so `search_threads` reaches). The same shape
   happens for `thread.created` on a first message, `task.changed` when a task is handed to the
   assistant (`task-actions.ts:818` emit, then dispatch `:826-833`), and a verdict on its review.
   Also the assistant would wake on its **own creation**: its nine rows are inserted in the same
   transaction as the `user.created` row (`user-actions.ts:903-935`), and `reaches` answers true
   for `row.id === subscriber.id` (`subscription-fire.ts:139`). Two sessions per DM means two
   answers. Fix in §4.2 (D-wake). Technical; no ruling needed, but it changes wake rules for every
   subscriber, so it is a decision.
3. **"Into the team of whoever installs it" vs "the librarian's plugin is installed
   factory-wide".** Both are in the plan; nothing in a manifest says which a plugin is. Install
   scope is one column on the one `plugins` row (`framework/db/src/schema.ts:977-978`); agents get
   `teamId` from it (`platform-actions.ts:614`). Proposed: one optional manifest field,
   `extensions["io.hyperidle"].installScope: "team" | "factory"` (default `team`),
   `document-management` sets `factory` (§5.3, D-scope). An interpretation, not new product —
   flagged in the reply.
4. **`plugin_contributions` scope column is not needed.** The `plugins` table has one row per
   plugin id (`schema.ts:973`), and a reinstall for another scope already *moves* the plugin: the
   old scope's agents go inactive and its subscriptions are removed (`platform-actions.ts:646-660`,
   ids hash the scope, `plugin-installer.ts:309-336`). BC6's "can drop another team's row" is that
   move. A plugin lives in one scope at a time; a second team sees it as installed, not
   available. No schema change (D-scope).
5. **Remote server never runs the boot seed** (`applications/remote-server/src/create-server.ts`
   has no `applyFactoryCoreState`; it needs `db:bootstrap:pg`). Unchanged by this item.
6. **The review paragraph is stale in two facts.** It says "`send_message` with type \"review\""
   (`provisioner.ts:1057`); the input is a `review` field `{ title, reasoning[], artifacts? }`
   (`thread.ts:120-131,302`), and it names the bare tool, which a small model cannot call
   (`provisioner.ts:604-613` lore). It is also composed at `:1159`, before the adapter is picked
   at `:1182`, so it cannot name the literal tool yet (§6.1).
7. **Harness at install can be absent.** "Runnable at once" needs a ready harness at install
   time. With none, the agents land without run config and the install still succeeds; they
   become runnable by the ordinary agent edit. Stated, not solved.
8. **Plugin agents emit no `user.created`** — the installer raw-inserts (`factory-writers.ts:20`,
   `platform-actions.ts:606`), so the assistant never hears a plugin arrive. Pre-existing, left.
9. **Desktop never wires plugin MCP servers** (`applications/desktop/src/create-server.ts`
   omits `getPluginMcpContributions`; remote-server `:352` has it). Neither bundled plugin ships
   `mcp.json`; out of scope, left as found.
10. **A maintainer rule file names the dead folder**: `.claude/rules/docs.md:11` lists
    `system-prompts/`. Pipeline runs may not edit rule files — the founder's edit.
11. `harness_descriptor` stays: a manifest may contribute it (`CONFIGURATION_KINDS`,
    `configuration.ts`), it just has no reader. The founder kept the configuration layer; not a
    dead kind nobody can contribute.
12. Census slip: `ReviewPage.tsx` is at `layers/core-ui/src/pages/review/ReviewPage.tsx:55`;
    `AgentAddDialog.tsx` is at `layers/core-ui/src/pages/AgentAddDialog.tsx:48`. Thread members
    already carry `isAgent` (`thread.ts:214`), so the `role === "agent"` fallbacks
    (`Conversations.tsx:86,98`) are dead and ReviewPage's is wrong.

## 1. Contracts (what crosses a boundary)

- `search_users` (`domain-model/src/actions/user.ts` declaration unchanged): its run omits rows
  with `role = "system"` unless the caller names them in `ids` (D-actor).
- `ObjectChangeEvent` (`framework/event-bus/src/events.ts:343-351`) gains
  `readonly woke?: readonly string[]` — the agents this change's own path already started work
  for. In memory only, like `cascade`. `objectEvent(row, opts)` takes it in `opts` (D-wake).
- `search_plugins` output: `z.array(z.union([PluginViewSchema, AvailablePluginViewSchema]))`.
  `AvailablePluginViewSchema = { id, name, version, description: string|null, state: "available",
  installScope: "team"|"factory" }`; `id` is the manifest `name`. Input `state` filter accepts
  `"enabled"|"disabled"|"available"`; `ids`/`text` match both kinds. `edit_plugin`'s own `state`
  stays `enabled|disabled`; its output stays `PluginView` (D-plugins).
- `edit_plugin` source gains `{ kind: "bundled", name: string, scope: PluginScope }` (strict).
  The server resolves the folder; no path from the caller. folder/git/zip unchanged.
- Manifest: `extensions["io.hyperidle"].installScope?: "team" | "factory"`, parsed in
  `plugin-manifest.ts`, anything else a warning and `team`.
- Settings module deps (`PlatformActionsDeps`, `platform-actions.ts:155`) gain
  `bundledPluginsDir?: string`, `runConfig: { read, write }` (structural mirror of
  `AgentOrchestrationRunConfigPort`, `framework/api-contract/src/agent-orchestration-port.ts:218`),
  and `firstAvailableHarness?: (db) => Promise<{ harnessType; modelId?; modelProvider? } | null>`.
  Bound in `layers/core-api/src/actions/compose.ts:253-300` from `agentOrchestration.runConfig`
  and the adapter pool (the same sources `buildUserActionsDeps` uses, `:334-356`).
- `bundledPluginsDir` rides the same path as `pluginsBaseDir`: `createServer` (desktop, remote) →
  `bootCoreApi` → `AppOptions` (`layers/core-api/src/app.ts:211,336`) → `buildCoreActions`
  bindings (`compose.ts:401,418`).

## 2. Migration `0091_drop_unfiled_grouping_roots.sql`

Hand-written, plus its `_journal.json` entry (idx 91, `when` after 1790072881807). One statement:

```sql
DELETE FROM "documents" d
WHERE d."id" IN ('ki-mig-root-product', 'ki-mig-root-practices', 'ki-mig-root-general')
  AND d."version" = 1
  AND NOT EXISTS (SELECT 1 FROM "documents" c WHERE c."parent_kind" = 'document' AND c."parent_id" = d."id")
  AND NOT EXISTS (SELECT 1 FROM "tasks" t WHERE t."source_document_id" = d."id");
```

Guard, in words: a root goes only if nothing was ever filed under it, no task was made from it,
and nobody edited it (every edit bumps `version`, `document-store.ts:248,549`). Reads do not count.
No other cleanup (no deployments exist). `knowledge_app_projection` is already gone (0086:116).
Demo seed stops relying on these ids (§3).

## 3. Boot

- `layers/core-api/src/bootstrap/factory-state.ts` keeps its name and callers (desktop
  `main.ts:419-422`, `tools/setup/src/factory-bootstrap-runner.ts:24`, via it `setup-cli.ts`,
  `bootstrap-pg.ts`, `seed-pg-cli.ts`) and shrinks to the one `system:propagation` insert,
  returning `Promise<void>`. Deleted: `SYSTEM_ASSISTANT`, the System Agent insert,
  `listFactoryAgents` (`user/src/factory-writers.ts:29-38`, export `user/src/index.ts:57`), the
  dangling comment `agent-orchestration/src/index.ts:25-27`, stale lore in both files.
- `search_users` hides the actor (D-actor). Chosen over a `kind` change (every `kind === "ai"`
  check on sender/actor paths would need auditing) and over a status (recipients filter by
  `active` but the agents list does not, `SettingsAgents.tsx:181`). `role = "system"` is already
  the structural marker (`user-actions.ts:1051`). The e2e expectation "agent names are listed
  (system:propagation excluded)" (`core-ui/__e2e__/X3-agent-config.spec.ts:115`) then holds.
- Demo (`tools/setup`, development world): the four `seed-agent-cos` references
  (`demo-fixture.ts:279,307,320,336`) point at the founder's assistant `ast-${founderId}` the demo
  already seeds (`:218`); `demo-world/documents.ts:43-51` inserts its own three roots instead of
  using the migration's.

## 4. Welcome and wake

### 4.1 Welcome (`layers/core-ui/src/pages/SetupFlow.tsx:325-364`)

Two `edit_user` calls. (1) unchanged: person + team + folder. (2) the assistant:
`{ kind: "ai", name: \`${name}'s Assistant\`, role: "assistant", agentCategory: "individual",
ownerUserId, runConfig: primaryHarness, subscriptions: { add: OBJECT_EVENTS.map(event => ({ event })) } }`
— no `identity`, no `prompt`. Verified: `AddSubscriptionSchema` makes `prompt` optional
(`user.ts:458-465`); no prompt means no document (`user-actions.ts:965`); `agent_not_runnable`
checks kind/status only (`user-actions.ts:550-559`), and the owned agent is `active`. The third
call (team agent) goes. `ASSISTANT_IDENTITY` (`user.ts:57-64`, re-export `index.ts:176,198`)
goes. Stale comments `SetupFlow.tsx:11,167-169,353` go.

### 4.2 Wake rules (D-wake)

- **A change that itself starts an agent's work names it on its event; that agent's
  subscriptions skip that change.** Writers: `thread-actions.ts` — compute the turn's `woken` list
  (the `listByIds` + `agentsToWake` now at `:1193-1201`) *before* `emitObjectEvents` (`:1148`),
  add the review's sender when the send carries a verdict, and pass `woke` on every row that send
  emits (created, message, resolve); the intent-recording loop stays after, unchanged.
  `task-actions.ts:818` — pass `woke: [dispatch.ownerAgentId]` when a dispatch follows. Reader:
  `subscription-fire.ts:224` filters out `event.woke`.
- **A subscription hears only changes that happen after it exists:** the same filter drops
  subscriptions with `createdAt >= change.at`. Stops the assistant waking on its own creation.
- Never self-wake (`:224`) stays.

## 5. Bundled plugins

### 5.1 Build and location

- `applications/desktop/electron-builder.yml:57-63` extraResources gains
  `from: "../../plugins"`, `to: "plugins"`.
- Desktop `main.ts` sets `HYPERIDLE_BUNDLED_PLUGINS_DIR` beside `HYPERIDLE_STATIC_DIR` (`:443`):
  packaged `path.join(process.resourcesPath, "plugins")`, dev the repo `plugins/` (same split as
  `migrate.ts:30-43`). Both `create-server.ts` read it in the branch that sets `pluginsBaseDir`
  (desktop `:149-162`, remote `:225-242`); remote falls back to the repo `plugins/` resolved from
  its own file (the image has `/app/plugins`, `Dockerfile.deploy:25,42`). Both `CreateServerDeps`
  accept `bundledPluginsDir?` so tests can pass one. Invariant: `bundledPluginsDir` is never
  `pluginsBaseDir` (install `rmSync`s its destination).
- Missing or empty folder → no available rows; not an error.

### 5.2 search and install

- `searchRun` lists `bundledPluginsDir` entries (directories only), parses each manifest,
  skips any whose id has a non-removed `plugins` row, and appends the rest as available rows. A
  removed plugin is a tombstone row, so it reappears as available.
- `installRun` for `bundled`: the name must equal one directory name from that same listing
  (exact string match, no join before the match), else `install_failed` "No bundled plugin
  named …". Then the ordinary folder install with the resolved path.
- Fold in: `fetchPlugin` moves inside the try in `installPlugin` (`plugin-installer.ts:464`), and
  its throw becomes `{ ok: false, reason }` → `install_failed`, never a 500.

### 5.3 Team and harness (D-scope, D-harness)

- Agents land as today: team scope → `teamId` = the scope's team; factory → no team
  (`platform-actions.ts:614`). The UI's Install uses the row's `installScope`: `team` → the
  viewer's own team (`open_user({})` → `user.team.id`), `factory` → `{ kind: "factory", teamId: null }`.
  `plugins/document-management/plugin.json` gains `"installScope": "factory"`; role-personas
  keeps the default.
- Harness: after Phase 1 commits (`platform-actions.ts:602-641`), for each contributed agent the
  installer calls `deps.runConfig.read(id)`; if it has no harness, `deps.runConfig.write(id, pick)`
  with `pick = await deps.firstAvailableHarness(ctx.db)`. `firstAvailableHarness` (compose.ts) =
  first descriptor from the adapter pool whose `discovery.state === "ready"` and whose type is not
  in `readServerConfig(db).harnessDisabled`, through `derivePrimaryHarness`
  (`framework/harness-capability/src/harness/derive-primary-harness.ts:30`) — the welcome
  screen's own choice (`SetupFlow.tsx:83-85,190-192`). No pick → no write. A person's later
  harness edit is never overwritten on reinstall. In process, core → orchestration through the
  port; orchestration reads nothing.

### 5.4 UI (`layers/core-ui/src/settings/SettingsPlugins.tsx`)

One list: available rows render name, version, description and an Install button; installed rows
unchanged. The install form (git/zip/folder + scope) stays. Empty-state copy names the bundled
rows when there are none installed. Reload after install as today.

## 6. Prompt construction and leftovers

### 6.1 Prompt text (D-review)

- Review paragraph becomes `reviewOrientation(sendMessageToolName)`, composed after the adapter
  pick (`provisioner.ts:1182`) with `literalToolNamerForAdapterType`. Facts it must state, each
  checked against code before writing: nothing stops you; you judge when work deserves a
  person's agreement; ask by calling `<literal send_message>` with a `review` of `title`, short
  `reasoning` points and `artifacts` when you have evidence; it goes to the conversation you were
  called from, else to your person; that call ends your session; a person approves or declines
  and you are brought back with their answer (`buildVerdictMessage`, `:1423-1435`); a decline
  declines the approach, not the task.
- Subscription return line (`:1579` and fallback `:628`): with an instruction, as today; without
  one, "Nobody has written an instruction for this event yet — decide for yourself whether it
  needs anything from you." followed by the `return_status` call.
- `context.ts:357`: drop "use write_session_notes tool" (keep the `task-notes.md` line only if the
  sandbox still writes that file). `return-status-tool.ts:113`: list the return set from
  `RETURN_ACTION_NAMES` (`edit_task`, `send_message`), not `submit_review`/`reply`.

### 6.2 Leftovers

- `role: "builder"` → `"agent"` (the server default for an agent, `user-actions.ts:865`):
  `SettingsAgents.tsx:160,354`, `pages/AgentAddDialog.tsx:48`.
- `Conversations.tsx:86,98` → `identity.isAgent`; `pages/review/ReviewPage.tsx:55` →
  `identity?.isAgent === true`.
- Delete `docs/system-prompts/`; fix `eslint.config.ts:533-534,578` (message: prompt text arrives
  from a plugin or the person, never a const in a route or tool handler), `tools/eval/src/seeding.ts:9`,
  `CLAUDE.md:124`, lore in setup tests / `demo-fixture.ts:350`.
- `agent-identity.ts:67-88`: drop the dead `updatedBy === "scaffold"` branch and its lore.
- Stale comments: `framework/db/src/schema.ts:66,71`, `desktop/src/main.ts:409-410`,
  `factory-writers.ts:1-10`.
- Docs: `docs/architecture/plugins.md:6-9` (fresh install) and `:106-114` (bundled, available,
  install scope, harness at install); `docs/guides/user/getting-started.md:52`;
  `docs/deployment/shared-backend.md:66`.

## 7. Verification

Red first per task. The one end-to-end evidence (integrate task):

- **Service integration**, `layers/core-api/src/__tests__/fresh-install.integration.test.ts`,
  core-api `{ db, app }` fixtures with an app built with `bundledPluginsDir` = the repo
  `plugins/` and an adapter pool reader whose `describe()` returns one ready descriptor.
  `applyFactoryCoreState` → the two welcome calls → assert: `search_users({kind:"ai"})` is one
  agent (the assistant, owned, no team, run config = the pick), nine subscriptions one per
  `OBJECT_EVENTS`, no prompt documents, zero tasks/threads/ordinary documents; a person's DM to the
  assistant records exactly one intent (thread turn, none `subscription_run`).
  `search_plugins({})` → two available rows; `edit_plugin` bundled `role-personas` team scope →
  seven active agents on the team, each with run config = the pick; bundled
  `document-management` factory scope → librarian with no team; removing role-personas → it is
  available again; bundled name `../role-personas` → `install_failed`.
- Migration: a `framework/db` integration test migrates to head and asserts the roots are gone,
  and a pre-0091 DB with a child under General keeps General.
- Harness lane (local, all four per `testing.md`): one case in
  `layers/core-api/src/__tests__/subscription-wake-live-harness.integration.test.ts` with no
  prompt — the session ends returned (not `not_returned`, not crashed) and its assembled prompt
  has "What happened" and no Instruction block.
- **Packaged-app walk** (manual, recorded): `build:local`, userData DB moved aside, launch →
  welcome → agents list shows only the assistant (no "Propagation System", no "System Agent") →
  Documents empty → Settings › Plugins shows Role personas and Document management as available
  → Install role-personas → seven agents on the team, a profile shows the harness → Install
  document-management → librarian with no team → remove role-personas → available again.

## 8. Security

Surfaces reached, per `.pipeline/rules/security.md` (earned, not preemptive):

- `edit_plugin` bundled name: a signed-in caller or agent names a folder. Abuse case: `../x` or an
  absolute path. Closed by exact match against the server's own directory listing before any path
  is built. folder/git/zip still take any path/URL from a signed-in caller — unchanged, trusted
  as today.
- Installer copying into userData: unchanged (`persistPlugin`, id = validated manifest name).
  New invariant: the bundled source dir is never the install destination.
- Agents created with run config: the harness is one this machine already runs and is logged
  into; no credential is read or written. A plugin is code the person chose to install; not gated.
- Migration deleting rows: three fixed ids, guarded; no user content can match.
- `search_users` hiding the actor is presentation, not access control; `open_user` still answers.
- Untouched: auth, MCP session tokens, the keychain, sandboxes, artifact isolation.

## 9. Proposed tasks

Scopes do not overlap; A, B, C can run in parallel; D needs all three.

**A — A fresh install is empty underneath the welcome screen.** Goal: boot seeds only the
system actor, which no list of users shows; migration 0091 removes the three grouping roots where
nothing was filed; the welcome screen makes one agent, the person's assistant, with nine empty
subscriptions and no identity; the builder defaults, the role-string checks, the dead prompt
folder and every stale reference named in §3, §4.1 and §6.2 are gone. Scope:
`layers/core-api/src/bootstrap/`, `layers/core-api/user/src/{factory-writers,index,user-actions,agent-identity}.ts`,
`layers/agent-orchestration/src/index.ts`, `framework/db/drizzle/0091_*` + `meta/_journal.json`,
`framework/db/src/schema.ts` (comments), `framework/domain-model/src/{actions/user.ts,index.ts}`,
`layers/core-ui/src/pages/{SetupFlow,AgentAddDialog,Conversations}.tsx`,
`layers/core-ui/src/pages/review/ReviewPage.tsx`, `layers/core-ui/src/settings/SettingsAgents.tsx`,
`tools/setup/`, `tools/eval/src/seeding.ts`, `docs/system-prompts/`, `eslint.config.ts`,
`CLAUDE.md`, `docs/guides/user/getting-started.md`, `docs/deployment/shared-backend.md`, and the
tests that assert the old boot/welcome. Needs: none. Size: ~70 new production lines, ~300
deleted (+89 docs).

**B — An agent subscribed to everything is woken once, and knows what to do with an empty
instruction.** Goal: D-wake (§4.2) and the prompt text of §6.1 — rewritten review paragraph with
the literal tool name, the empty-instruction line, the two stale tool names. Scope:
`framework/event-bus/src/events.ts`, `layers/core-api/thread/src/thread-actions.ts`,
`layers/core-api/task/src/task-actions.ts`, `layers/core-api/user/src/subscription-fire.ts`,
`layers/agent-orchestration/run-orchestration/src/{provisioner,context}.ts`,
`layers/agent-execution/harness-registry/src/return-status-tool.ts`, their tests, and
`layers/core-api/src/__tests__/subscription-wake-live-harness.integration.test.ts` (harness lane
run by the builder, all four). Needs: none. Size: ~70 new, ~25 deleted.

**C — The bundled plugins ship in the app and install from Settings › Plugins, runnable at
once.** Goal: §1 plugin contracts, §5 in full, the installer fetch fix, `plugins.md`. Scope:
`framework/domain-model/src/actions/platform.ts`,
`layers/core-api/settings/src/{platform-actions,plugin-installer,plugin-fetch,plugin-manifest}.ts`,
`layers/core-api/src/{actions/compose.ts,app.ts,boot.ts}`,
`applications/desktop/{electron-builder.yml,src/main.ts,src/create-server.ts}`,
`applications/remote-server/src/create-server.ts`, `plugins/document-management/plugin.json`,
`layers/core-ui/src/settings/SettingsPlugins.tsx` (+ story), `docs/architecture/plugins.md`, their
tests. Needs: none. Size: ~300 new, ~10 deleted.

**D — Integrate: a fresh install proven end to end.** Goal: §7's service integration test green,
the migration test green, the packaged-app walk done and recorded, `verify` + full fast suite +
service integration green. Scope: `layers/core-api/src/__tests__/fresh-install.integration.test.ts`,
`framework/db/src/__tests__/` (migration 0091 test). Needs: A, B, C. Size: 0 production.

Total: ~440 new production lines, well under 1,000; ~335 deleted plus the docs folder.

## 10. Proposed decisions

- **D-actor** — Boot keeps inserting only `system:propagation` through `applyFactoryCoreState`;
  `search_users` omits `role = "system"` rows unless named in `ids`. Binds A, D.
- **D-roots** — Migration 0091 deletes each 0080 root only when version is 1, no document is
  filed under it and no task names it as source; nothing else is cleaned. Binds A, D.
- **D-wake** — A change that itself starts an agent's work carries that agent in its event's
  in-memory `woke` list and that agent's subscriptions skip it; a subscription fires only for
  changes after its own `createdAt`. Binds B, D.
- **D-plugins** — `search_plugins` returns installed and available rows in one list
  (`state: "available"` row shape of §1); `edit_plugin` installs a bundled plugin by
  `{ kind: "bundled", name, scope }`, the server resolving the folder by exact match in its own
  listing; `bundledPluginsDir` rides beside `pluginsBaseDir` from `createServer`. Binds C, D.
- **D-scope** — A manifest's `installScope` (`team` default, `factory` for document-management)
  decides the Install button's scope; a plugin is installed in one scope at a time and a
  reinstall elsewhere moves it, as today; no scope column. Binds C, D.
- **D-harness** — At install, each contributed agent without a harness gets the first ready,
  not-disabled harness via `derivePrimaryHarness`, written post-commit through
  `AgentOrchestrationPort.runConfig.write`; none available → no run config, install still
  succeeds. Binds C, D.

## 11. Critique amendments (D-c2gwsp: a plugin installs per team, independently)

Overrides §0.4, §1, §5.2–5.3, §7, §9 C and D, and D-scope where they conflict.

1. **One `plugins` row per install; the row id is the install id.** `plugins.id` stays the primary
   key (`schema.ts:973`; FKs `plugin_configuration_defaults.plugin_id` 0044:39,
   `plugin_contributions.plugin_id` 0072:16 keep pointing at it). Its value becomes: the manifest
   name for a factory install, `<name>@<teamId>` for a team install. A manifest name can never
   contain `@` (`plugin-manifest.ts:52-59`), so the two forms cannot collide, and `builtin` stays
   `builtin`. `plugins.name` (today a copy of the id, `plugin-installer.ts:504`) is the manifest
   name and the key `search_plugins` matches bundled folders against. New unique index
   `plugins_name_scope_uq (name, scope_kind, scope_team_id)`; no column moves. Chosen over a
   surrogate hash or a composite key: every reader keys on `plugins.id` and `edit_plugin` takes
   `id`; a readable install id keeps all of them unchanged in shape. Every hash input that today
   takes `plugin.id` takes `plugin.name` instead — `agentItemId`/`subscriptionItemId`/`skillItemId`
   (`platform-actions.ts:558,570,587,607,622,627` and `readPluginDocumentSource` `:397-414`,
   passed `existing.name` at `:763`), `namespacedKey`/`defaultId`
   (`plugin-installer.ts:154-163,201-204,402-405`) — so contributed ids, config keys and
   `manifestKeyOf` (`platform-actions.ts:431`) stay as they are; `recordContribution`,
   `contributionId`, `listContributions`, `removeStaleDefaults` and the defaults upsert on
   `(plugin_id, kind, key)` (`:216-224`) take the install id — one row set per install, no
   collision. `search_plugins`/`edit_plugin` ids are install ids; the UI already keys rows on
   `plugin.id` (`SettingsPlugins.tsx:392`). `edit_plugin`'s `id` stays one field (a row id), not
   id + scope — the row already knows its scope.
2. **Migration.** The folders delete stays `0091_drop_unfiled_grouping_roots.sql` (§2). The plugin
   conversion is `0092_plugin_install_per_scope.sql`: re-add the two FKs above with
   `ON UPDATE CASCADE` (drop + add; `plugin_contributions` keeps `ON DELETE cascade`,
   defaults keep `restrict`); `UPDATE plugins SET id = id || '@' || scope_team_id WHERE
   scope_kind = 'team'`; create the unique index. Child `plugin_id` values follow by cascade;
   child primary keys that embed the old id (`pc_…`, `pcd_…`) stay unique and are not rewritten —
   a reinstall upserts on `(plugin_id, kind, key)`, never on that id. Both migrations and the
   `schema.ts` index line live in one new task M (§11.6) because A and C would otherwise both edit
   `meta/_journal.json`.
3. **Install path on disk: one folder per install** — `persistPlugin(…, installId)`
   (`plugin-installer.ts:437-446`), i.e. `<pluginsBaseDir>/<name>` or `<name>@<teamId>`. Invariant:
   the `rmSync` at `:441` only ever removes this install's own folder, so a second team's install
   never deletes the folder a first team's restore reads (`platform-actions.ts:762`). Same content
   twice on disk is the price; nothing shares.
4. **`search_plugins` per viewer.** `searchRun` resolves the viewer's team through a new dep
   `viewerTeamId(db, actorId)` (bound in `compose.ts` from `findUser`, like `agents.list`). Installed
   rows: all non-removed rows, as today (a factory install and every team's install are visible to
   everyone; the row's `scope` says whose). Available rows: each bundled folder whose manifest has
   `installScope: "team"` and no non-removed row at `(name, team, viewerTeam)`; or
   `installScope: "factory"` and no non-removed row at `(name, factory)`. Another team's row leaves
   the plugin available to this team; a factory row makes it installed for everyone. A viewer with
   no team (an agent with no team, the librarian) sees only factory availability.
5. **remove / disable / enable / restore** act on one row by install id (`lookupPlugin`,
   `platform-actions.ts:504-520`; `enablePlugin`/`disablePlugin`/`removePlugin`,
   `plugin-installer.ts:616-660`) — unchanged code, now naturally per install. Contributed ids
   already include the scope (`plugin-installer.ts:276-291,309-336`), so two teams' agents,
   subscriptions, `ki_af_<agentId>`, `ki_rp_<subId>` and skill documents are distinct, and
   `plugin_contributions (plugin_id, kind, entity_id)` is unique per install. The remaining shared
   surface is `configuration_overrides (kind, key)` (`schema.ts:1082-1090`): a person's override of
   `role-personas/x` applies to every install of that plugin — overrides are install-wide today
   (BC5 accepted limit) and neither bundled plugin ships `contributions[]`; left as is.
   Also `installRun` no longer needs "move" semantics: a reinstall at the same `(name, scope)`
   hits the same row and upserts as today; a reinstall at another scope is a new row.
6. **`installScope` stays** (§0.3, §1): the Install button still has to choose the viewer's team
   or factory, and the librarian must land factory-wide. With per-team rows the field only picks
   the default scope; the folder/git/zip form keeps its explicit scope picker.
7. **Tasks and sizes.** New task **M — migrations 0091 and 0092 and the plugins unique index**:
   scope `framework/db/drizzle/0091_*`, `0092_*`, `meta/_journal.json`, `framework/db/src/schema.ts`
   (index line; the comment fixes of §6.2 move here too) + a `framework/db` migration test; needs
   none; ~40 new lines. A and C `need` M; A's scope drops the migration and `schema.ts`; D's
   migration test moves to M. Task C grows by ~60 (install id, per-viewer availability,
   `viewerTeamId` binding) to ~360 new; total ~500 new production lines. §7's service integration
   test adds: team A and team B each install bundled role-personas → fourteen active agents, seven
   per team, two `plugins` rows, two install folders; `search_plugins` as a team-B viewer before
   B's install lists role-personas available while team A's row is installed; removing team A's
   install leaves team B's seven agents active and its row enabled; installing document-management
   once at factory scope makes it installed for both viewers.

D-scope is replaced by: **D-install-row** — one `plugins` row per install, id = manifest name
(factory) or `<name>@<teamId>` (team), unique `(name, scope_kind, scope_team_id)`, one install
folder per row; hash inputs take the manifest name, registry and defaults take the install id;
availability is judged against the viewer's team; `installScope` picks the Install button's scope.

## 12. Second critique amendments (accepted by the planner; override §11 where they conflict)

1. **`defaultId` takes the install id.** `plugin_configuration_defaults.id` is the primary key
   (`plugin-installer.ts:154-155`, `pcd_<sha(pluginId\0kind\0key)>`); with the manifest name as
   input, two teams' installs of one plugin compute the same id under different `plugin_id` and the
   second insert raises on the PK, not on the `(plugin_id, kind, key)` conflict target. So:
   `defaultId(installId, kind, key)`; only the stored key (`namespacedKey` → `<name>/<key>`) keeps
   the manifest name, so `manifestKeyOf` (`platform-actions.ts:432`) and `pluginContributionKey`
   (`plugin-installer.ts:707`) are unchanged. A migrated team row keeps its old `pcd_` id; a
   same-team reinstall lands on the conflict target and updates in place.
2. **`viewerTeamId` = own team, else the owner's team** (the `teamsOf` rule of
   `subscription-fire.ts:83-90`, exported from the user module for compose to bind). A fresh
   install's only agent is owned with no team of its own; with `findUser` alone it would see only
   factory availability and could not offer its person "Role personas". A viewer with neither
   (the librarian) sees factory availability only.
3. **Migration 0092 guards:** `UPDATE plugins SET id = id || '@' || scope_team_id WHERE
   scope_kind = 'team' AND scope_team_id IS NOT NULL`; the 0072 auto-named constraint is
   `plugin_contributions_plugin_id_fkey`; `schema.ts` gains `onUpdate: "cascade"` on both FK
   declarations (`:1003`, `:1043`) beside the unique index. The reserved `builtin` row keeps
   `name ≠ id` as today (harmless).
