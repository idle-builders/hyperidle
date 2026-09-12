# BA5 — The filesystem works · Architecture, phase 2: Google Drive

Phase 1 is built and merged into this branch (`f807f8252`). This document is phase 2 only: a Google Drive
folder as one more **kind of filesystem**, placed and put back through `rclone`. It adds nothing to the hold,
the notification, Check's plumbing, the Add dialog's frame, or teardown — every one of those is reused as
built, and each reuse is cited below rather than restated.

Every `file:line` is against this branch's working tree, read 2026-09-12. Re-check a line before building on
it. `UNVERIFIED` marks what I could not check.

**The three rulings this document is built on**

- We assemble, we never build. No OAuth flow, no client registration, no reconciliation loop. `rclone` owns
  its login; we drive it and we tell the agent how to drive it.
- Work gets out **by kind**: for Drive the agent runs `rclone copy` itself, exactly as it runs `git push`
  for a repository. HyperIdle never syncs, never pushes on the agent's behalf, never runs anything at teardown.
- Google-native Docs/Sheets/Slides are **not files**. They are excluded from the copy, said plainly to the
  agent and to the person, and left to a future Drive *tool*.

---

## 0. Map: what phase 2 owes, and where it lives

| Obligation (plan `## How it works`) | Where | Section |
|---|---|---|
| "A **Google Drive** folder is copied down with `rclone`" | a third `resourceRef` variant + `DriveFolderAdapter` | §1, §2 |
| "the agent puts its changes back with `rclone` itself, as it pushes git" | one more branch in `describeMountedFilesystems` | §3 |
| "Each filesystem knows which CLIs it needs. *Check* asks each one…" | `checkFilesystem`'s drive branch, over an `RcloneRunner` port | §4 |
| "`rclone` needs a one-time Google setup the person does" | the Add dialog's Drive branch + every Check reason + the doc | §5 |
| "cannot be put in place → the agent's sessions hold, one notification" | **nothing new** — `FilesystemMountFailure` → `admitSession` Phase 4.5 → `recordFilesystemNeedsAttention`, unchanged | §2.5 |
| "a resumed session reuses its workspace" | the adapter recognises an already-placed folder | §2.4 |
| "Google Docs and Sheets are not files; editing them is a tool's job" | `--drive-skip-gdocs` + the instruction sentence + the doc | §3.2 |
| "whether its login then expires weekly is checked in phase 2" | it is a Check failure with an actionable reason; the weekly part is a **manual** G3 observation | §4.3, §9.4, §11.1 |

---

## 1. Contracts

### 1.1 The shape of a Drive filesystem

One new `resourceRef` variant. Nothing else about the row is new.

| Field | Value for a Drive filesystem | Why |
|---|---|---|
| `kind` | `"doc_set"` | It is a document set. The existing product vocabulary already covers it (`schema.ts:1122`), and the POST enum (`routes/filesystems.ts:98`) stays closed at two values |
| `source` | `"gdrive"` | Derived, display only. Already a documented value (`schema.ts:1118-1121`) and already labelled "Google Drive" in the UI (`SettingsFilesystems.tsx:74`) |
| `connectionId` | always `null` | rclone holds its own login. The existing rule already rejects a `connectionId` for anything but an `https://github.com/` repo (`routes/filesystems.ts:169-177`) — no change |
| `resourceRef` | `{ kind: "drive", remote, path }` | **new** |

```ts
// the union, today at filesystems/src/filesystem-shape.ts:24 and run-orchestration/src/mounter.ts:44
  | { kind: "code"; repo: string; branch: string }
  | { kind: "doc_set"; folder: string }
  | { kind: "drive"; remote: string; path: string }   // NEW
```

`remote` is the **rclone remote name** the person configured (`rclone config`), without the `:`. `path` is the
folder inside that remote. They are two fields, not one `remote:path` string, so nothing ever has to parse a
colon back out and so the UI can ask two questions. The composed argv element is `` `${remote}:${path}` ``.

**Why not a new `kind`.** `kind` is the *product* axis (code work vs document work) and a Drive folder is
document work. Adding `kind: "drive"` would fork the Zod enum, the UI tag, the docs' kind vocabulary and
`schema.ts:1122`'s comment for no gain. Adapter selection moves onto `resourceRef.kind` instead (§2.1), which
is where the placement decision actually belongs.

**Locked decisions:**

- `path` is required and non-empty. There is no "the whole Drive" filesystem — copying a person's entire Drive
  into a session workspace is not something any AC asks for (§11.3).
- `remote` must match `^[A-Za-z0-9._-]+$` and `path` must contain no newline and no NUL. This is the same
  idiom as `BRANCH_NAME` (`routes/filesystems.ts:104-105`) and it is what closes argv injection: because
  `remote` cannot start with `-`, the composed `remote:path` element can never be read as a flag.

### 1.2 The rclone port and its one implementation

Declared structurally in `run-orchestration` (Mechanism C, the same idiom the file already documents at
`mounter-ports.ts:1-26`), implemented at the layer root beside `git-runner.ts` and `cli-status.ts`.

```ts
// layers/agent-orchestration/run-orchestration/src/mounter-ports.ts — ADD
export type RcloneFailureCode = "not_installed" | "directory_not_found" | "failed";

export type RcloneOutcome<T> =
	| { readonly ok: true; readonly value: T }
	| { readonly ok: false; readonly code: RcloneFailureCode; readonly reason: string };

export interface RcloneRunner {
	/** `rclone listremotes` → configured remote names, trailing `:` stripped. */
	listRemotes(): Promise<RcloneOutcome<readonly string[]>>;
	/** `rclone lsjson --stat <remote>:<path>` → whether the item is a directory. */
	statPath(remote: string, path: string): Promise<RcloneOutcome<{ readonly isDir: boolean }>>;
	/** `rclone copy <remote>:<path> <destination> --drive-skip-gdocs` */
	copyDown(remote: string, path: string, destination: string): Promise<RcloneOutcome<void>>;
}
```

No factory. `createGitRunner` takes a cwd because git is repository-scoped (`git-runner.ts:255`); rclone is
not, so the runner is one value, injected directly.

```ts
// layers/agent-orchestration/src/rclone-runner.ts — NEW
export function createRcloneRunner(): RcloneRunner;
```

It mirrors `git-runner.ts` verb for verb:

- `spawn("rclone", argv, { env: buildRcloneEnv() })`, never `execSync`, never a shell (`git-runner.ts:201-250`).
- **Env allow-list**, never `process.env` (`git-runner.ts:176-197`, `cli-status.ts:22-31`):
  `PATH, HOME, XDG_CONFIG_HOME, USER, LOGNAME, LANG, LC_ALL, LC_CTYPE, TZ, TMPDIR`.
  `XDG_CONFIG_HOME` is in the list **because rclone reads it before `~/.config`** — it is the third entry in
  rclone's config-file precedence list, ahead of `~/.config/rclone/rclone.conf`
  (<https://rclone.org/docs/#config-config-file>, fetched 2026-09-12). Without it HyperIdle's rclone and the
  person's own shell could resolve two different configs and disagree about whether a remote exists. The
  allow-list also means a stray `RCLONE_*` variable in HyperIdle's own environment cannot change behaviour —
  rclone maps every option to one (<https://rclone.org/docs/#environment-variables>).
- Every call carries `--ask-password=false` (default is `true`, <https://rclone.org/flags/>). An **encrypted**
  rclone config otherwise prompts on stdin and hangs the drain. This is the exact counterpart of
  `GIT_TERMINAL_PROMPT=0` / `GIT_ASKPASS=/bin/false` (`git-runner.ts:193-194`): a credential we cannot supply
  must fail fast, never wait.
- **Exit-code mapping**, from rclone's documented list (<https://rclone.org/docs/#list-of-exit-codes>, fetched
  2026-09-12): `0` → ok; `3` (*Directory not found*) → `directory_not_found`; anything else → `failed` with
  the stderr tail. A spawn `ENOENT` → `not_installed`, the same detection rule phase 1 already uses
  (`cli-status.ts:45-47`, `git-runner.ts:272-274`). **Only 0 and 3 are given meaning** — the rest of the table
  is not load-bearing, so a version that renumbers something cannot silently mis-report.
- Every string that leaves the runner goes through `redactSecrets(text, [])` (`redact-secrets.ts:17`). rclone
  is never handed a secret by us, so there is no literal-secret list; the URL-userinfo and token-shape passes
  still apply, because rclone error text can echo a config value.
- Timeouts: `listRemotes` and `statPath` 30 s; `copyDown` 600 000 ms, the same ceiling a first clone gets
  (`git-runner.ts:137`). The drain awaits admission, so a large first copy delays the queue exactly as a large
  first clone already does (phase 1 §17.8 — the known limit is unchanged, not widened).
- `argv` is logged, never stdout (`git-runner.ts:207`).

**Why `lsjson --stat` and not `lsd`/`ls`.** rclone's own docs: "If `--stat` is set then the output is not an
array of items, but instead a single JSON blob will be returned about the item pointed to. This will return an
error if the item isn't found" (<https://rclone.org/commands/rclone_lsjson/>, fetched 2026-09-12). The
bucket-backend caveat in that sentence does not apply to Drive. One call answers both "does it exist" and "is
it a folder".

**Why `listremotes` plain, not `--json`.** We compare each output line, trimmed, with a trailing `:` stripped,
against `remote`. That is tolerant of both output spellings across versions; `--json` is newer and we cannot
verify which rclone the person has. No parse, no dependency on a format.

### 1.3 Changed contracts, by owner

| Contract | Package | Change |
|---|---|---|
| `Filesystem.resourceRef` | `@hyperidle/filesystems` (`filesystem-shape.ts:24`) | + the `drive` variant |
| `Filesystem.resourceRef` | `@hyperidle/run-orchestration` (`mounter.ts:44`) | + the `drive` variant (structural twin, kept identical) |
| `RcloneRunner`, `RcloneOutcome` | `@hyperidle/run-orchestration` (`mounter-ports.ts`) | new, exported through `index.ts` beside `MountingGitRunnerFactory` (`index.ts:88`) |
| `AdapterDeps` | `@hyperidle/run-orchestration` (`mounter.ts:51-55`) | + `readonly rclone?: RcloneRunner`. Optional, with the same meaning `keptCopiesRoot?` already has at `:53-54`: absent → a Drive filesystem cannot be placed and says so |
| `FilesystemCheckDeps` | `@hyperidle/run-orchestration` (`filesystem-check.ts:21-26`) | + `readonly rclone: RcloneRunner`, **required** — Check must never silently skip the drive branch |
| `ProvisionSessionDeps.filesystemCheckDeps` | `@hyperidle/run-orchestration` (`provisioner.ts:853`) | the `Pick<…>` gains `"rclone"` |
| `createRcloneRunner` | `layers/agent-orchestration/src/rclone-runner.ts` | new |
| `POST /api/filesystems` body | `layers/agent-orchestration/src/routes/filesystems.ts:86-101` | `resourceRefSchema` gains `driveRefSchema`; `deriveSource` (`:132-137`) returns `"gdrive"` for it; `validateRegisterBody` (`:147-179`) gains the `remote`/`path` rules |
| Add-filesystem dialog | `layers/core-ui/src/settings/SettingsFilesystems.tsx:98-282` | a third Kind option and its two fields (§5) |

**No new crossing is created, so no governance edit is needed.**

- The route already imports `@hyperidle/filesystems` and `@hyperidle/run-orchestration`
  (`routes/filesystems.ts:39-54`) and the layer root's own `git-runner`/`cli-status` (`:57-59`);
  `createRcloneRunner` is the same shape of import from the same place.
- Boot already composes the mounter and the check deps in one place (`boot.ts:330-340`); `rclone` is one more
  field in that literal — wiring within one layer, which is what `buildProvisioningReads` exists to do.
- **Spawning `rclone` from `layers/agent-orchestration/src/` is legal.** The one-runtime-door clause covers
  *agent* CLIs only: the detector's binary set is `{"claude","codex","opencode","cursor-agent"}`
  (`tools/governance/src/lib/crossing-detectors.ts:620`). `git` and `gh` are already spawned from this exact
  directory for the same reason.
- No new HTTP endpoint, no new event, no new table, no new package → `architecture.json` and
  `table-owners.json` are untouched.

---

## 2. Placement

### 2.1 Selection moves onto `resourceRef.kind`

`selectMountAdapter` (`mounter.ts:330-337`) today branches on `filesystem.kind` and then on
`CLOUD_SOURCES.has(fs.source)` (`:49`). It becomes:

```ts
const ref = filesystem.resourceRef;
if (ref.kind === "code")    return new GitRepositoryAdapter(deps);
if (ref.kind === "drive")   return new DriveFolderAdapter(deps);
if (ref.kind === "doc_set") return new LocalFolderAdapter();
return new UnsupportedFilesystemAdapter();   // a corrupt or unknown ref — honest reason, never a silent mount
```

The ref is what actually decides how a filesystem is placed; `kind` and `source` are registry facts for
display. This removes the last reader of `CLOUD_SOURCES` and of `CloudNotBuiltAdapter`'s source-shaped
message — see §7.

### 2.2 The adapter

`DriveFolderAdapter` in `mounter.ts`, beside the two that are there.

```
mount({ filesystem, workspacePath, folderName }):
  ref must be kind "drive"                       → else { ok:false, reason:"Expected drive resourceRef" }
  destination = <workspacePath>/<folderName>
  if destination exists:
      it is a directory  → ADOPT  (§2.4)
      anything else      → { ok:false, reason:"folder '<folderName>' already exists in the workspace" }
  if !deps.rclone        → { ok:false, reason:"this server cannot reach Google Drive" }
  mkdirSync(destination, { recursive: true })    // an EMPTY Drive folder must still give the agent a folder
  outcome = deps.rclone.copyDown(ref.remote, ref.path, destination)
  if !outcome.ok         → { ok:false, reason: driveReason(outcome, ref) }     (§4.2 — one phrasing, both callers)
  → { ok:true, mounted: { filesystem, folder: destination, trustedPath: destination,
                          agentEnv: {}, adopted: false } }
```

- **`rclone copy`, never `sync`, never `bisync`.** `copy` "Doesn't delete files from the destination"
  (<https://rclone.org/commands/rclone_copy/>, fetched 2026-09-12) and it copies *the contents* of the source
  directory into the destination, which is the shape we want. `sync` and `bisync` are the two verbs that can
  delete a person's Drive files; neither is ever used, in either direction.
- **`mkdirSync` before the copy** because rclone creates the destination only when it has something to put
  there. Without it an empty Drive folder produces no folder at all and the agent's instructions would point
  at a path that does not exist.
- **`agentEnv` is empty.** The agent's own `rclone` reads the person's config through `HOME`, which the
  harness adapters already pass (phase 1 §1, `harness-registry/src/adapter-pool.ts:407`). This is the same
  inheritance that makes `gh` work, and it is why Drive needs no credential plumbing at all.
- **`trustedPath` is the copied folder**, because for Drive the real content *is* inside the workspace. It
  feeds `trustedPaths` unchanged (`provisioner.ts:1687-1696`).
- **`unmount` is a no-op**, like the folder adapter's (`mounter.ts:146-149`). HyperIdle never copies anything
  back. Changes the agent did not put back are lost with the workspace — the same deal an uncommitted change
  in a git worktree already gets (`worktree remove --force`), and the instructions say so in words (§3).

### 2.3 Folder naming and the rest of placement

`baseFolderName` (`filesystem-provisioning.ts:133-140`) gains the `drive` branch: the last segment of `path`,
reduced to `[A-Za-z0-9._-]` by the existing `reduceToFolderChars` (`:128-131`). Everything downstream —
`computeFolderNames` collision handling against `SANDBOX_SCAFFOLDING_PATHS` and sibling filesystems
(`:150-165`), the loop that mounts each filesystem (`:208-235`), `excludeMountedFolders`
(`mounter.ts:372-381`) — needs no change and gets none.

### 2.4 A resumed workspace that already holds the content

The directory exists ⇒ **adopt it and copy nothing**: return `{ ok: true, adopted: true }` with the same
`folder`/`trustedPath`. Re-copying would overwrite whatever the agent had changed and not yet put back.

There is no marker file and no manifest. A session workspace is created and owned by HyperIdle for that
session; the only writer inside `<workspace>/<folderName>` is the agent. On a resume (`workspace.adopt`,
`provisioner.ts:1209`) a directory at the computed folder name is by construction the one this filesystem
placed. A marker file would have to live *inside* the folder, and the agent's `rclone copy` back up would then
upload it into the person's Drive — a worse answer than no marker.

Anything at that path that is **not** a directory is the existing collision error, byte-identical in wording to
the folder adapter's (`mounter.ts:124`).

### 2.5 When placement fails — nothing new is built

`mountFilesystemsForAgent` already throws `FilesystemMountFailure` carrying the filesystem, the reason and the
mounts this admission made (`filesystem-provisioning.ts:114-125, 225-233`). `admitSession`'s Phase 4.5 already
unmounts those, releases the adapter, destroys the workspace unless resuming, re-runs `checkFilesystem` for a
better-phrased reason, calls `markNeedsAttention` and throws `FilesystemUnavailableError`
(`provisioner.ts:1270-1305`). `recordFilesystemNeedsAttention` already emits **once per episode**
(`filesystem-attention.ts:41-42`), the drain already excludes held agents, and the core subscriber already
sends the one notification.

Phase 2 adds **one line** to that path: `filesystemLabel` (`filesystem-attention.ts:24-33`) gains a `drive`
branch returning `` `${remote}:${path}` `` so the notice names the Drive folder instead of falling through to
the filesystem id (`:32`).

---

## 3. Getting the work out

### 3.1 What the agent is told

`describeOne` (`filesystem-instructions.ts:9-23`) gains a `drive` branch. The facts to state; the builder may
tune the wording:

> `` `<folder>/` `` — a copy of the Google Drive folder `<remote>:<path>`. Your changes stay on this machine
> until you put them back: `rclone copy <folder> <remote>:<path>`. That adds and updates files in Drive and
> never deletes anything there. Google Docs, Sheets and Slides that live in this folder are **not** here —
> they are not files, and this filesystem does not carry them.

This mirrors the git branches at `:18` and `:20` exactly: where it is, what it is, and the one command that
gets the work out. Nothing else in the prompt path changes — the section is still appended at
`provisioner.ts:1610`.

`MountedFilesystem` carries `folder` and the ref, so the sentence is rendered from data the record already
holds. No new field.

### 3.2 What a `.gdoc` means, and how we stay honest about it

Two different things are called "a Google Doc on disk", and the product has to be straight about both.

**Through `rclone` (this phase).** rclone does not produce `.gdoc` stubs. By default it *exports* a Google Doc
to `docx,xlsx,pptx,svg` (<https://rclone.org/drive/#import-export-of-google-documents>, fetched 2026-09-12).
That default is a trap for us: the same page states that rclone "will not convert any files by default, since
the conversion is lossy", so a `Notes.docx` the agent edits and copies back lands in Drive as **a new plain
docx file sitting next to the Google Doc it came from** — not an edit of the document. The agent would believe
it had revised the doc. That is the fabricated-success failure mode, on the person's real data.

**So we pass `--drive-skip-gdocs`** on the copy: "If given, gdocs practically become invisible to rclone"
(<https://rclone.org/flags/>, fetched 2026-09-12). A Google-native file is not copied, is not seen, and is not
silently half-edited. The instruction sentence says so, and the registry row's description says so. Editing a
Google Doc is a *tool's* job — a future Drive tool that speaks the Docs API — not a filesystem's. That is the
ruling, and this is what it looks like in code.

**Through Google Drive for desktop (already supported, nothing to build).** That product mounts Drive as an
ordinary local folder, and there a Google-native file *is* a `.gdoc`/`.gsheet` stub: a small JSON pointer with
a URL and **no content** (`research.md:113-116`). An agent reading one gets a link, not a document. That path
already works today through the plain folder filesystem and needs no integration; the honest statement about
it belongs in the doc (§10), not in code.

---

## 4. Detection and Check

### 4.1 What proves a Drive filesystem is usable

`checkFilesystem` (`filesystem-check.ts:109-117`) dispatches on `ref.kind === "drive"` **before** the
`doc_set` branch. Three steps, first failure wins — the same "reach the resource, ask the CLI only when the
answer says so" order phase 1 uses for git (`:73-107`):

1. `rclone listremotes` → `not_installed` ⇒ reason 1; otherwise the list must contain `remote` ⇒ else reason 2.
2. `rclone lsjson --stat <remote>:<path>` → `directory_not_found` ⇒ reason 3; `failed` ⇒ reason 5.
3. the returned blob's `IsDir` must be true ⇒ else reason 4. Otherwise ok.

Step 1 is the part that is genuinely *detection* — is the CLI there, is the remote configured — and it is
surfaced as **this filesystem's reason text**, not as a separate CLI list, exactly as phase 1 decided
("Install the GitHub CLI (gh)…" lives in the reason, `filesystem-check.ts:36-37`).

### 4.2 The exact reason strings

One helper, `driveReason(outcome, ref)`, used by both Check and the adapter so a person never sees two
different sentences about the same failure:

| # | Situation | Reason |
|---|---|---|
| 1 | `rclone` not on `PATH` | ``Install rclone, then run `rclone config` to add your Google Drive remote — HyperIdle copies Drive folders through it`` |
| 2 | rclone present, no such remote | ``No rclone remote named `<remote>`. Run `rclone config` to add one. Google makes you create your own OAuth client the first time; rclone's Google Drive setup walks you through it`` |
| 3 | exit 3, directory not found | ``Folder `<path>` is not in the `<remote>` Drive remote`` |
| 4 | the item is a file | ``` `<remote>:<path>` is a file, not a folder ``` |
| 5 | anything else | ``rclone could not reach `<remote>:<path>`: <redacted stderr tail>. If your Drive login expired, run `rclone config reconnect <remote>:`` ` |
| 6 | no rclone port wired at all (server without one) | `this server cannot reach Google Drive` |

Reason 5 deliberately does not try to classify an auth failure from stderr text. Every authentication outcome —
a revoked client, a 7-day testing-mode expiry (`research.md:111`), a withdrawn grant — has the same fix, and
`rclone config reconnect remote:` is the documented command for it
(<https://rclone.org/commands/rclone_config_reconnect/>, fetched 2026-09-12). Matching on rclone's English
would be a guess that rots; naming the fix is true whatever the wording.

### 4.3 Where Check runs — unchanged

`runCheckAndPersist` (`routes/filesystems.ts:183-209`) already runs Check on registration and on
`POST /:id/check`, and already routes a failure through `recordFilesystemNeedsAttention` and a pass through
`markFilesystemReachable`. It needs one edit: pass `rclone: createRcloneRunner()` into the deps literal at
`:193-197`. Boot's `filesystemCheckDeps` (`boot.ts:336-339`) gets the same field.

That is the whole Check change. A Drive filesystem registered on a machine without rclone lands
`needs_attention` with reason 1 at registration, and if it is already picked for an agent it holds that
agent's sessions with one notification — all of it phase 1's machinery, reached with no new code.

---

## 5. The setup the person does, stated plainly

**We cannot script the Google half.** Every serious Drive CLI requires the person to create a Google Cloud
project and their own OAuth client, and there is no Google API that automates creating one
(`research.md:104-111`); rclone's shared client retires during 2026, so bringing your own is required rather
than recommended. A client left in "Testing" status issues refresh tokens that expire after seven days. None of
this is something HyperIdle can remove, and pretending otherwise in the UI would be the lie.

So it is said in three places, each at the moment it matters:

1. **In the Add dialog**, when Kind = Google Drive, one line under the fields:
   > Drive runs through rclone. Install it, run `rclone config`, and create your own Google OAuth client once —
   > Google requires one per person, and rclone's Google Drive setup walks you through it. Then put the remote
   > name here.
2. **In the reason**, on the row, the moment a piece of it is missing — reasons 1, 2 and 5 above. This is the
   one a person actually reads, because it appears exactly when they are stuck.
3. **In the doc**, `docs/process-layer/filesystem-primitive.md` (§10), as the durable account.

There is no wizard, no installer, no "connect Google" button, and no Connection row for Drive. Making that
setup pleasant is the separately-proposed later item ("Install the CLIs a workspace needs, and guide login
through them", `plan.md:103`), and phase 2 must not start it.

### 5.1 The dialog's Drive branch

`AddFilesystemDialog` (`SettingsFilesystems.tsx:98-282`) — the frame, the submit path, the error line and the
`apiFetch` call are all reused unchanged.

- The Kind `Select` (`:237-246`) gains `{ value: "drive", label: "Google Drive" }`, and the component's local
  state widens from `"code" | "doc_set"` to include `"drive"` (`:104`).
- For `drive`, the single Location `Input` is replaced by two: **Remote** (placeholder `gdrive`) and **Folder
  in Drive** (placeholder `Projects/Acme`). The Branch input and the GitHub-token `Select` stay hidden, as they
  already are for `doc_set` (`:259`, `:268`).
- The submitted body (`:172-181`) becomes
  `{ teamId, kind: "doc_set", connectionId: null, resourceRef: { kind: "drive", remote, path } }`.
- `inspect-path` is not called for Drive — there is no local path to inspect (`:139-154` already returns early
  for anything that is not a local `code` path).
- `resourceDisplay` (`:82-85`) gains `` `${remote}:${path}` ``; the row's `Tag` already renders
  `source` = "Google Drive" (`:74`) and `kind` = "doc_set", and the Check button and reason line
  (`:413-433`) work as they are.
- `SettingsFilesystems.stories.tsx` gains a populated Drive row and a Drive row in `needs_attention` with a
  real reason string. Populated real state only — no skeleton, no empty variant.

---

## 6. Schema

**None.** No migration, no journal entry.

`filesystems.resource_ref` is `text` holding JSON (`framework/db/src/schema.ts:1128-1129`), `source` and `kind` are
open-vocabulary `text` (`:1121`, `:1123`), and `state`/`attention_reason` already carry everything the hold
needs after migration 0082. A Drive filesystem is a row of the existing shape with a new JSON body. No column,
no constraint, no backfill, no table-owner change.

---

## 7. Deletions

Found by scanning, not by memory. Every scan below must find something; an empty result is a failure.

```sh
rg -n -a 'CLOUD_SOURCES|CloudNotBuiltAdapter' layers -g '!**/node_modules/**' -g '!**/dist/**' || { echo "scan found nothing"; exit 1; }
rg -n -a "kind === \"doc_set\"|kind !== \"doc_set\"|fs\.kind|filesystem\.kind" layers/agent-orchestration -g '!**/node_modules/**' -g '!**/dist/**' || { echo "scan found nothing"; exit 1; }
rg -n -a 'gdrive|dropbox|s3' layers/agent-orchestration layers/core-ui/src/settings -g '!**/node_modules/**' -g '!**/dist/**' || { echo "scan found nothing"; exit 1; }
rg -n -a 'resourceRef' layers framework applications tools -g '!**/node_modules/**' -g '!**/dist/**' || { echo "scan found nothing"; exit 1; }
```

| Goes | Where | Why it is dead after phase 2 |
|---|---|---|
| `CLOUD_SOURCES` | `mounter.ts:49` | its only reader is the `source` branch of `selectMountAdapter` (`:333`), which §2.1 replaces with a `resourceRef.kind` branch |
| `CloudNotBuiltAdapter`'s source-shaped message and its `source` constructor argument | `mounter.ts:94-105` | nothing selects it by source any more. The class survives **only** as the fallback for a `resourceRef` whose `kind` is none of the three — a corrupt or pre-existing row — with a reason that says that and not "built in its connector WP". The builder names it |
| the `kind`-shaped fallback `CloudNotBuiltAdapter(\`${kind}:${source}\`)` | `mounter.ts:336` | replaced by the ref-shaped fallback |
| `"Expected doc_set resourceRef"` guard | `mounter.ts:110-111` | **kept** — it is now the type-narrowing guard for a ref-selected adapter, not a dead branch. Do not delete |
| `dropbox` / `s3` as product concepts | anywhere the scan finds them outside a type's open vocabulary | `deriveSource` (`routes/filesystems.ts:132-137`) has never been able to produce either; if the scan finds no other producer, they go with `CLOUD_SOURCES`. **If the scan finds a producer, stop and say so** rather than deleting a live path |

The full-migration rule applies: these go in the same change that makes them dead, with no alias and no
compatibility branch. `knip` decides anything the scans leave ambiguous.

---

## 8. Build order

One builder, in sequence. Each leaf ends with `npm run check`, `npm run lint`, `npm run test` and
`npm run test:integration:service -- <touched files>` green. All leaves land in one PR, on top of phase 1.

1. **D1 — the rclone runner.** `mounter-ports.ts`'s `RcloneRunner`/`RcloneOutcome`, `rclone-runner.ts` with
   its env allow-list, `--ask-password=false`, exit-code mapping, redaction and timeouts; exported from
   `run-orchestration`'s `index.ts`. No product behaviour changes. V1, V5. *No dependency.*
2. **D2 — the `drive` ref, end to end but not yet placed.** The union at both type sites, `driveRefSchema`
   and the `remote`/`path` rules, `deriveSource` → `"gdrive"`, `filesystemLabel`'s drive branch,
   `baseFolderName`'s drive branch, `checkFilesystem`'s drive branch and `driveReason`, `rclone` into
   `FilesystemCheckDeps` / the `provisioner` `Pick` / the route deps / `boot`. After D2 a Drive filesystem
   registers, Check tells the truth, and a placement attempt fails with an honest "not placed" reason that
   holds the agent — which is the correct behaviour for a filesystem that cannot be placed, not a stub. V2,
   V4. *After D1.*
3. **D3 — the adapter.** `DriveFolderAdapter`, selection by `resourceRef.kind`, adoption, the `mkdirSync`,
   `rclone` on `AdapterDeps` and in `boot.ts`'s mounter literal, the instructions branch, and the §7
   deletions. V3, V6. *After D2.*
4. **D4 — the surface.** The dialog's Kind option and two fields, the setup line, `resourceDisplay`, the
   stories. V7. *After D2 (the body shape).*
5. **D5 — the documentation** made false by phases 1 and 2 (§10). Prose only. *Last.*

**Harness obligation.** D3 changes session provisioning, so `npm run test:integration:harness` must be run
locally and green before ship (`.pipeline/rules/testing.md`; it has no CI job).

---

## 9. Verification

### 9.1 The constraint that shapes this section

`rclone` is **not installed on this machine** (checked 2026-09-12: `which rclone` → not found) and is not on
the GitHub-hosted Ubuntu runner (UNVERIFIED — I could not confirm the runner image inventory; the design does
not depend on it either way). So:

- **No test in the per-merge service lane may require `rclone`, the network, or a Google account.**
- The real-binary proof goes in the **local-only** lane, gated so an absent binary hard-fails rather than
  skipping to green, and it uses a **local-backend rclone remote** — a real rclone binary, a real config file,
  a real `copy`, and zero network.
- The rest is unit-tested against the injected `RcloneRunner` port, which is legitimate: the port is a
  declared seam that `checkFilesystem` already uses the same way for `ghAuthStatus`
  (`filesystem-check.integration.test.ts:15-25` records exactly this reasoning for phase 1).

**Routing the local-only test.** Add its path explicitly to `HARNESS_INCLUDE`
(`vitest.integration.config.ts:21-49`). The precedent and the reason are already written there at `:32-36`:
without an explicit entry "the file matches the service lane's `layers/**` include and hard-fails CI where the
binaries are absent". Gate it with a `requireBinary("rclone")` helper in the package's own `__tests__/`,
copying the ten-line shape of `layers/agent-orchestration/connections/src/__tests__/require-binary.ts:31-40`
(itself a copy of harness-registry's — per-package copies are the established pattern here; §11.5 notes it).

### 9.2 Tests

| # | Behaviour | File · lane | Asserts | Red if reverted |
|---|---|---|---|---|
| V1 | exit-code and env contract of the runner | `run-orchestration/src/__tests__/rclone-runner.integration.test.ts` · **local-only** | against real rclone + a `local`-type remote in a stubbed `HOME`: `listRemotes` returns the configured name; `statPath` of a real subfolder → `isDir:true`; of a missing one → `directory_not_found`; with `PATH` stripped of rclone → `not_installed`; `--drive-skip-gdocs` is accepted against a local backend | exit 3 mapped to `failed`; `ENOENT` not special-cased; `XDG_CONFIG_HOME` dropped from the allow-list (a config placed there stops being found) |
| V2 | Check's drive branch, every reason | `run-orchestration/src/__tests__/filesystem-check.test.ts` (new unit file) · unit | with a fake `RcloneRunner`: not-installed → reason 1; remote absent from the list → reason 2; `directory_not_found` → reason 3; `isDir:false` → reason 4; `failed` → reason 5 containing `rclone config reconnect`; all-ok → `{ok:true, reason:null}` | the order changed so `statPath` runs before the remote is known; any reason string that stops naming its fix |
| V3 | the adapter | `run-orchestration/src/__tests__/drive-folder-adapter.test.ts` · unit (real temp dirs, fake runner) | fresh workspace → destination created, `copyDown` called once with `(remote, path, destination)`, result carries `folder === trustedPath === destination`, `agentEnv` empty, `adopted:false`; an **empty** source → the folder still exists; **second mount into the same workspace** → `adopted:true`, `copyDown` **not called again**; a file at the path → the collision reason; `copyDown` failing → `{ok:false}` with the §4.2 reason; `unmount` touches nothing | adoption removed (copy runs twice and clobbers); `mkdirSync` removed (empty folder vanishes); `unmount` made to copy back |
| V4 | registration + Check + hold, through the real DB and app | `agent-orchestration/src/routes/__tests__/…filesystems…integration.test.ts` (extend the existing file the scan finds) · **service** | with `PATH` stubbed to exclude rclone — the `pathWithoutGh()` idiom at `filesystem-check.integration.test.ts:59-65` — POST a drive ref → 201, `source:"gdrive"`, state `needs_attention`, reason 1; **exactly one** `filesystem_needs_attention` event whose label is `remote:path`; a second `POST /:id/check` → still one event, reason refreshed; POST with `remote` containing `/` or a leading `-` → 400 | the drive branch never reached (state stays `attached`); `filesystemLabel` not extended (the notice names a UUID); the remote charset rule dropped |
| V5 | placement failure holds the agent, not the task | covered by phase 1's existing hold test — **extend its fixture with a drive filesystem** rather than writing a second one · service | task stays `accepted`, request returns to `pending`, no `sessions` row, one notification | any new drive-specific hold path |
| V6 | real rclone places a real folder | `run-orchestration/src/__tests__/drive-folder-adapter.integration.test.ts` · **local-only** | real rclone + local remote: `mount` copies the seeded tree into `<workspace>/<name>`, file contents match; a second `mount` with a new session id adopts and leaves a locally-created file untouched; the agent's own way out works — `rclone copy <folder> <remote>:<path>` puts a new file into the remote directory | `copy` swapped for `sync` (the locally-created file would be deleted on the way up); adoption removed |
| V7 | the surface | `core-ui/src/__tests__/settings-filesystems.test.tsx` (extend) · component | choosing Google Drive shows Remote + Folder and hides Branch and the token select; submitting posts `kind:"doc_set"` with `resourceRef {kind:"drive",remote,path}` and `connectionId:null`; a Drive row renders `remote:path`, the "Google Drive" tag and its `attentionReason` | the body shape drifting from §1.1; the setup line dropped |
| V8 | the instructions | `run-orchestration/src/__tests__/filesystem-instructions.test.ts` (extend) · unit | a drive mount's section names the folder, the remote, the exact `rclone copy` command, "never deletes", and that Google Docs are not included | the gdocs sentence dropped; the command reversed (destination and source swapped — which would be a delete-shaped instruction) |

### 9.3 The one piece of end-to-end evidence

V6 is the cheapest thing that would catch a broken wire: the real binary, a real copy, a real round trip
back up, through the adapter's own entry point. It runs locally and it is the reason the local-only lane entry
exists.

### 9.4 What only a real Google account can prove — manual, at G3

On the packaged desktop app, with a real Drive account and a real OAuth client:

1. `rclone config` from scratch, following only what the dialog's setup line says — the one-time Google step is
   genuinely completable from that text.
2. Register the Drive folder → Check passes, row shows *Reachable*.
3. Pick it for an agent, run a session → the folder is in the workspace with the real files; **a Google Doc in
   that Drive folder is not among them**; the agent's `AGENTS.md` carries the `rclone copy` sentence.
4. The agent copies its change back → it appears in Drive; a file the agent deleted locally is **still** in
   Drive (proving `copy`, not `sync`).
5. Resume the session → the folder is adopted, the agent's un-copied work is still there.
6. Break it — rename the Drive folder, or `rclone config disconnect` — → Check fails with reason 3 or 5, the row
   is *needs attention*, the task stays ready, **one** notification, and the sessions start after Check passes.
7. The 7-day question: if the OAuth client is left in Testing status, record whether the login is still good a
   week later. This is an observation to write down, not a gate.

---

## 10. Documentation made false

`docs/process-layer/filesystem-primitive.md` is authoritative and already stale for phase 1 (`plan.md:97-98`);
phase 2 adds to the list. Fix in D5:

- `:3` and `:107` — "AO2 (mount + capture)" and the primitive's own summary: capture is gone (phase 1), and a
  Drive folder is now a placed filesystem, not a promise.
- `:26` and `:28` — the table row "Cloud drive (lookup) … no edit-and-syncback" and "No Drive/Dropbox two-way
  sync engine exists" need re-reading together: the second sentence stays **true** and load-bearing (we build
  no sync engine, in either direction), the first needs to say that the *authoring* case is a filesystem placed
  by `rclone copy` and put back by the agent.
- `:34`, `:88`, `:108` — "`source` … derived from the Connection" is false for Drive: a Drive filesystem has
  **no** Connection at all, because rclone owns its own login. Say that, and say the one-time Google setup
  there.
- `:28` also names `framework/filesystem-contract/src/filesystem.ts` and
  `layers/core-api/src/routes/filesystems.ts` — both moved long ago. Repoint at the real files.
- Add the Google-native paragraph: `--drive-skip-gdocs` through rclone, `.gdoc` stubs through Google Drive for
  desktop, and "editing them is a tool's job".

`docs/architecture/connection-model.md` needs no Drive edit — Drive deliberately creates no connection.

---

## 11. Things the plan left unclear

1. **"whether its login then expires weekly is checked in phase 2."** It cannot be checked by code: a
   7-day expiry is a property of an OAuth client left in Testing status (`research.md:111`), and it surfaces
   to us only as a failed rclone call. What phase 2 ships is an actionable reason (§4.2 reason 5) and a
   recorded manual observation (§9.4 step 7). If the maintainer wanted a *scheduled* re-check, that is a new
   outcome — nothing retries a broken filesystem on its own is an explicit plan ruling — and it would need an
   amendment.
2. **Nothing tells the agent to copy back before the session ends.** The instruction is in `AGENTS.md`; no
   mechanism enforces it, and teardown deletes the workspace. That is deliberate (the same deal an uncommitted
   git change gets) but it is a real way for an agent's work to disappear, and it is the first thing a live run
   is likely to expose. Flagged, not designed around.
3. **No "whole Drive" filesystem.** `path` is required (§1.1). If someone wants their Drive root, the honest
   answer is "make a folder" — but the plan does not say, so this is my call, reversible in one Zod line.
4. **`kind` and `resourceRef.kind` can still contradict each other** on POST — `kind:"code"` with a `doc_set`
   ref is accepted today and no check catches it. After §2.1 the mismatch is harmless (placement follows the
   ref), so I did not add a cross-check: it would be a mechanism with no AC behind it. Worth a line in a later
   tidy.
5. **A third copy of `requireBinary`** lands in `run-orchestration/src/__tests__/` (§9.1). Two already exist,
   per-package, so this follows the pattern rather than inventing one — but three copies is a consolidation the
   maintainer may want to call, and it is not mine to call inside this item.
6. **Google Drive for desktop is the other Drive path** and it already works through the plain folder
   filesystem with zero integration (`research.md:113-116`). Phase 2 does not surface it anywhere — a person
   would have to know to point a Folder filesystem at `~/Library/CloudStorage/…`. Whether the dialog should say
   so is a product question, not an architecture one.
7. **`UNVERIFIED`: whether the GitHub-hosted Ubuntu runner ships `rclone`.** The design does not depend on it —
   every per-merge test either stubs `PATH` to exclude rclone or injects the port — but if it turns out to be
   present, V4's `PATH`-stubbing is what keeps that test deterministic, and it must not be relaxed.

---

## 12. Size check

Added lines. Deletions are not counted (§7 removes roughly 25 production lines).

| Area | Production | Tests |
|---|---|---|
| `RcloneRunner` port + `rclone-runner.ts` (env, flags, exit mapping, redaction, timeouts) | ~140 | — |
| The `drive` ref through both type sites, Zod, `deriveSource`, `validateRegisterBody`, `filesystemLabel`, `baseFolderName` | ~65 | — |
| `checkFilesystem`'s drive branch + `driveReason` + its six strings | ~55 | ~110 (V2) |
| `DriveFolderAdapter`, selection by ref kind, adoption, fallback adapter reword | ~75 | ~130 (V3) |
| Instructions branch | ~15 | ~25 (V8) |
| Wiring: `AdapterDeps`, `FilesystemCheckDeps`, the provisioner `Pick`, route deps, `boot.ts`, `index.ts` | ~25 | — |
| UI: Kind option, two fields, setup line, `resourceDisplay`, stories | ~95 | ~60 (V7) |
| Route/registration/hold through the real DB (V4, V5 fixture) | — | ~110 |
| Local-only real-rclone lane (V1, V6) + `require-binary` copy + config-file harness | — | ~170 |
| **Total** | **~470** | **~605** |

**About 1,000–1,150 added lines — at the stop line, and quite possibly over it.** Reporting it as at the line
rather than under it, because a range whose top is 1,150 is not honestly "under 1,000".

What drives it, and the smallest honest cut if the maintainer wants one:

- **The assumption that costs most: a real Add-dialog branch for Drive in this phase** (~155 with its tests).
  The plan's "Surfaces" list was written for phase 1 and does not name a Drive dialog. Cutting it leaves Drive
  registerable by API only — the same cut phase 1 offered as (a) and the maintainer declined there. This is the
  one cut I would take if a cut is wanted; it reaches ~850.
- **The local-only real-rclone lane** (~170). Cutting it would leave the rclone driving code proven only
  against a fake, which is the mock-validation trap on the one integration point this whole phase exists to
  drive. I would not cut it.
- **Six distinct reason strings** (~40 with tests). They are what §5 promises the person; collapsing them to
  two would make the product worse at exactly the moment it is hardest to use.

No cut that keeps the plan's Drive proof gets meaningfully below ~850, and the maintainer already accepted
~2,000–2,400 for phases 1+2 together (`plan.md:91-92`), which this total sits inside. **The maintainer's word
is needed before D1 starts.**
