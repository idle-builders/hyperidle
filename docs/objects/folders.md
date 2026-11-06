# Folders

A folder is a symlink in an agent's space directory that points at a real directory on this computer. It is not a document and not a connection — it is a filesystem path the agent can read and write.

Source: `layers/agent-orchestration/run-orchestration/src/space-folders.ts`.

## Fields

From `SpaceFolderView` (`@hyperidle/run-orchestration`):

- `name` — the entry's name inside the agent's space (the symlink's filename).
- `path` — the real target directory the symlink resolves to.
- `isGit` — true when the target contains a `.git` directory (a git repository).
- `isMissing` — true when the symlink target no longer exists on this computer.

## Mounting

At session start, `mountSpaceFolders` reads every symlink in the agent's space and mounts it into the working folder:

- **Git repository** (`isGit: true`) → git worktree at `<workingFolder>/<name>/`. The branch is `<workBranch>` (task-scoped). Reuses an existing worktree on a second mount; re-attaches after `git worktree remove`.
- **Plain directory** (`isGit: false`) → symlink at `<workingFolder>/<name>` pointing at the real path.
- **Dangling symlink** (`isMissing: true`) → skipped; other folders still mount.

Returns `{ trustedPaths: string[] }` — the real paths of every successfully mounted folder.

## Add and remove

`edit_user({ folders: { add: [{ path, name? }] } })` adds a symlink for the given path in the agent's space. `name` defaults to the path's basename. The agent's space is created on first add if it does not exist yet.

`edit_user({ folders: { remove: [name] } })` removes the named symlink. Only symlinks may be removed — real directories in the space are not touched.

## Difference from connections and documents

A folder is not a connection (service integration) and not a document. Connections are service integrations (token or MCP server). Documents are rows in the `documents` table. A folder is a filesystem path the agent reads and writes through its working folder.
