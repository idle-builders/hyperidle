# BA5 — research record

Working material behind the decisions in `plan.md`. Gathered 2026-09-10 by two web-research passes and
one repository pass; every claim in the source reports carried a URL or a file:line. Kept here so the
plan stays at its budget.

> **Superseded in part, 2026-09-11.** Everything below about rclone's OAuth client, Drive scopes, CASA
> assessments and a bisync engine assumed HyperIdle would set up Drive authentication and sync. It never
> does: auth belongs to each service's CLI, a PAT is only a convenience, and no sync engine is built
> (maintainer, restating `docs/architecture/connection-model.md`). The build-vs-adopt verdict and the
> vendor remote-workspace findings stand. Kept as a record only.

## Build vs adopt — answered 2026-09-10

Raised by the maintainer: build this, or adopt an agent sandbox/container system? **Build.** Evidence:

- **No hosted sandbox passes the self-host test.** E2B, Modal, Fly, Cloudflare, Runloop, Morph,
  Blaxel, Northflank, Vercel — all closed hosted runtimes whose "open source" is the *client SDK*.
  Daytona, the one AGPL self-hostable sandbox, **went closed-source in June 2026** and its repo is
  unmaintained. E2B's own local-dev path needs Linux + KVM + hugepages + the NBD kernel module.
- **They solve the execution environment and barely touch the content pipeline.** Of ~15 platforms:
  4 have a first-class private-repo-clone API, **zero** do anything for Google Drive, **zero** have a
  diff API. Nobody sells the part that is actually hard here.
- **Plain host directories are what the serious local players ship.** OpenAI's Agents SDK recommends
  `UnixLocalSandboxClient` for local; Imbue's Sculptor (a desktop app for coding agents) defaults to a
  **git worktree on the host** with Docker opt-in under Experimental.
- **Prior art confirms the maintainer's writeback ruling.** Every mature product — Codex cloud, Claude
  Code on the web, Cursor, Devin, Copilot, Jules — clones with a scoped token and returns work as a
  **pushed branch plus a pull request**. None syncs a local working tree; none ingests Drive as a
  workspace.

**Isolation is available and cheap, but not now.** `anthropics/sandbox-runtime` (Apache-2.0, v0.0.75)
and `nono` (Apache-2.0) wrap any child process using `sandbox-exec` / bubblewrap — an npm install, not
infrastructure, and adopting one would not change the architecture because it wraps the process this
repo already spawns. Per `ETHOS.md` §2 isolation is not earned yet. Recorded as available.

**Google Drive carries costs no code decision removes:**
- `rclone` (MIT, single static binary, bundlable) with `bisync` is the sync engine. Do **not** use a
  FUSE mount: macFUSE forbids bundling with commercial software and WinFsp is GPLv3.
- rclone's shared Google client ID **retires during 2026**, so every user brings their own OAuth client.
- Scope decides the bill: `drive.file` is non-sensitive; `drive` / `drive.readonly` are **restricted**,
  requiring OAuth verification plus a **CASA assessment repeated every 12 months** (~$540–4,500/yr,
  third-party). **Unverified and load-bearing:** whether Google's folder Picker grants `drive.file` to
  the files *inside* the chosen folder. Test before choosing.
- Google-native files are the leak no tool fixes: Drive writes `.gdoc`/`.gsheet` pointer stubs, so an
  agent reads a URL, not a document. rclone can export to `docx`, but writing back is lossy.

## Where the workspace lives — answered 2026-09-10

Maintainer hypothesis: *"most of the harnesses these days have remote workspaces, so maybe we just rely
on this for now."* **It does not hold. One of the four qualifies.**

- **Cursor** — the only one a program can drive end to end: documented REST API, inline `mcpServers` and
  `envVars`, SSE stream, follow-up runs, artifacts. Caveats: public beta, v1 webhooks not shipped.
- **Claude Code** — richest cloud product, no public session API, no output stream, no long-lived token,
  and **an explicit ToS prohibition**: developers "may not collect, store, or intermediate Claude.ai
  credentials or session tokens", nor "pay for, resell, or intermediate Claude usage on their end users'
  behalf". The carve-out is decisive: an end user signing in to the **unmodified** binary is expressly
  allowed, "including where a platform hosts Claude Code". **What this repo does today is the permitted
  shape; the proposed one is the forbidden shape.**
- **Codex** — experimental CLI over an undocumented `chatgpt.com/backend-api` endpoint, consumer ChatGPT
  auth, no streaming, no programmatic follow-up. The API-key tier has "no cloud-based features".
- **opencode** — no vendor cloud exists.

**And none of them accepts an arbitrary file upload at launch.** This repo's core move — prepare a
working directory, write `AGENTS.md`, `.mcp.json` and `context/` into it, then start the agent — does
not transfer. Cursor comes closest and still cannot take a `context/` directory. The vendor clouds are
git-remote-shaped: no local folder, no document folder.

**Decision: the workspace is the local computer.** Keep spawning the unmodified binaries. If a remote
workspace is wanted later, build one running this same code path — Anthropic's `ccpool_` self-hosted
environments and Cursor's `env.type: "machine"|"pool"` workers both keep the vendor control plane and
put execution on hardware you own, so they become compatible targets rather than competitors.

**What this unlocks — sync is only needed for Drive.** The workspace keeps today's per-session
lifetime; making it outlive the session is **BA12**'s, registered separately under its own founder rule,
and this package does not absorb it.

| Filesystem | Workspace | Work back out |
|---|---|---|
| local git repo | worktree of the real repo | agent commits (shared object store) and pushes |
| remote repo (private) | clone with the connection's token | agent commits and pushes |
| local folder | the folder itself | already in place — nothing to sync |
| Google Drive folder | `rclone bisync` into a directory | **the only case needing a sync engine** |


## Self-authenticating CLIs — researched 2026-09-11

Against the rule: we build no OAuth and no syncer; each service's official CLI owns its login.

**GitHub — `gh` fits completely** (installed 2.92.0; latest 2.100.0, 2026-09-03).
- `gh auth login` stores the token in the OS keychain / Credential Manager / Secret Service (plain-file fallback).
  Any program running as the same user can call `gh`, which reads it itself.
- `gh auth status`: exit 1 when not logged in, 4 = needs login. `--json` **always exits 0** — use the exit code, or parse.
  `--hostname` narrows to one host.
- `GH_TOKEN` (then `GITHUB_TOKEN`) **overrides** the stored login. Verified: `gh auth git-credential` with
  `GH_TOKEN=x` answers `username=x-access-token` / `password=x`. **Plain git does not read `GH_TOKEN`** (verified: exit 128).
- `gh auth setup-git` writes `credential.https://github.com.helper = !<abs path>/gh auth git-credential` into the
  **global** `~/.gitconfig` — the person's own action. We must not run it for them (AN2 rule: never write real `$HOME`).
  The same helper setting can be passed to one process through `GIT_CONFIG_COUNT/KEY_n/VALUE_n`, no file written.
- GitLab `glab` has login and status but **no git-credential command** — plain `git push` to GitLab over HTTPS needs
  another route. Not confirmed against a binary.

**Google Drive — no CLI meets the rule cleanly in 2026.**
- **Google ships no official Drive CLI.** `googleworkspace/cli` (`gws`, v0.22.5, 2026-03-31) sits in Google's org
  but states it is "not an officially supported Google product", and needs a user-made OAuth client.
- **Every serious Drive CLI needs the user to create their own Google Cloud project and OAuth client**: `rclone`
  (v1.75.1; its shared client retires during 2026 and an own client is now "required rather than merely
  recommended"), `gog`/gogcli (v0.39.1), `glotlabs/gdrive` (stale, 2025-02). `prasmussen/gdrive` is archived,
  `odeke-em/drive` dead. There is no Google API to automate creating that client.
- A user-made client in "Testing" status gets **login tokens that expire after 7 days** (Google OAuth docs).
- `gcloud` has no Drive commands.
- **Google Drive for desktop** puts Drive on disk as an ordinary folder (macOS `~/Library/CloudStorage/...`,
  Windows virtual drive), handling its own login. The existing local-folder support covers it with no integration.
  Limits: **no Linux client**; Google-native Docs/Sheets/Slides appear as `.gdoc`/`.gsheet` **link stubs with no
  content**, so an agent cannot read or edit them as files. Mirroring mode is safer than streaming for an agent.
- No Drive CLI was installed here; every Drive claim comes from docs, not a binary.
