# Folders

A folder is a team-registered file source given to zero or more agents. It is not a document and not a connection — it is a real directory or repository mounted into the agent's sandbox.

Source: `layers/agent-orchestration/filesystems/src/filesystem-shape.ts`, `layers/agent-orchestration/run-orchestration/src/mounter.ts`.

## Fields

From `FolderViewSchema` (`actions/user.ts`):

- `id`, `teamId`, `source` (open text: "local", "github", …), `kind` (`code | doc_set`).
- `connectionId` — optional; a remote clone uses this to authenticate.
- `resourceRef` — `{ kind: "code", repo, branch }` or `{ kind: "doc_set", folder }`.
- `writeback` — `git | file | none`.
- `state` — `attached | reachable | needs_attention`.
- `createdAt`.

## Kinds

- `code` — a git repository. Mounted as a git worktree (local repo) or a shallow clone (remote via connection).
- `doc_set` — a local folder. Mounted as a symlink into the sandbox.

Cloud sources (gdrive, dropbox, s3) are not implemented — mount attempts for those return an error. Kind is a closed enum for writes (`code | doc_set`).

## States

- `attached` — registered but not yet confirmed reachable.
- `reachable` — accessible.
- `needs_attention` — mount failed or the source is unreachable. Each session's mount sets `reachable` or `needs_attention` from what it found, and the folder's row on a user's page says "Not found on this computer" (or "Cannot be reached with its service").

## Mounting

At session start, each folder given to the agent is mounted into the sandbox:

- **Local `code` folder** → git worktree (a branch named `agent/<sessionId>` is created in the repo).
- **Remote `code` folder** (has `connectionId`) → shallow clone (`depth: 1`).
- **Local `doc_set`** → symlink into the sandbox (`ref.folder` symlinked under the sandbox path).

The `knowledge/` tree inside the sandbox is not a folder. Folders are separate mounts alongside it.

## Writeback

`writeback` is a per-folder setting. `git` commits changes; `file` writes them directly; `none` leaves them. The watcher that backs this lives in `run-orchestration`; it does not share the `knowledge/` writeback path.

## Giving and taking

`edit_user({ folders: { give: [id], take: [id] } })` assigns or removes a folder from an agent; a folder can only be given to an agent of the folder's team. `add` creates a new folder in the team registry — the user's only team, or the one named by `team` when they are in several; `remove` deletes it from the registry.

## Difference from tools and documents

A folder is not a tool (connection) and not a document. Connections are service integrations (token or MCP server). Documents are rows in the `documents` table. A folder is a filesystem path the agent can read and write.
