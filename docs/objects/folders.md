# Folders

A folder is any top-level entry in an agent's space directory, except the reserved names the agent uses for its own working folders (`conversations`, `tasks`, `subscriptions`, `.claude`, `.codex`, `.codex-owner`). An entry is either a symlink to a real directory on this computer, or a real directory placed straight in the space.

Source: `layers/agent-orchestration/run-orchestration/src/space-folders.ts`.

## Fields

From `SpaceFolderView` (`@hyperidle/run-orchestration`):

- `name` — the entry's name inside the agent's space.
- `path` — the real target directory the entry resolves to.
- `isGit` — true when the target contains a `.git` directory (a git repository).
- `isMissing` — true when a symlink's target no longer exists on this computer.

## Mounting

At session start, `mountSpaceFolders` reads every non-reserved entry in the agent's space and mounts it into the working folder:

- **Git repository** (`isGit: true`) → git worktree at `<workingFolder>/<name>/`. The branch is `agent/<spaceBasename>/<taskOrConversationId>` — unique per agent so two agents mounting the same repo for the same task each get their own branch. Reuses an existing worktree on a second mount; re-attaches after `git worktree remove`.
- **Plain directory** (`isGit: false`) → symlink at `<workingFolder>/<name>` pointing at the real path.
- **Dangling symlink** (`isMissing: true`) → skipped; other folders still mount.

Returns `{ trustedPaths: string[] }` — the real paths of every successfully mounted folder.

Git worktrees in a task's working folder are removed when the task is done or killed; a worktree with uncommitted changes is left as-is. The branch itself always stays in the repository.

## Add and remove

`edit_user({ folders: { add: [{ path, name? }] } })` adds a symlink for the given path in the agent's space. `name` defaults to the path's basename. The agent's space is created on first add if it does not exist yet.

`edit_user({ folders: { remove: [name] } })` removes the named symlink. Only symlinks may be removed — a directory placed straight in the space refuses with `NOT_A_SYMLINK`; nothing real is ever deleted.

## Difference from connections and documents

A folder is not a connection (service integration) and not a document. Connections are service integrations (token or MCP server). Documents are rows in the `documents` table. A folder is a filesystem path the agent reads and writes through its working folder.
