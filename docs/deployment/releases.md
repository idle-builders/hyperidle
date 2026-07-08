# Releases

## Release pipeline (unified)

One version bump, carried by one PR, releases **both** surfaces on merge:

- **Backend** → built image to GHCR + deployed to the shared cluster (`deploy.yml`).
- **Desktop** → notarized DMG published to `hyperidle-releases` + Homebrew (`release.yml` → `desktop-release.yml`).

The DMG is built + notarized **locally** (Apple signing must run on a Mac), but
everything else — publish, mirror, Homebrew, cluster deploy — happens in **CI on
merge**. Nothing reaches users until the PR lands on `main`.

### Version source of truth

The root `package.json` `version` is canonical. Two derived sources must match it
(enforced by the Release Guard via `scripts/check-version-sync.ts`):

| Source | Why it must match |
|---|---|
| `packages/desktop/package.json` | electron-builder names the DMG `HyperIdle-<version>-arm64.dmg` |
| `chart/Chart.yaml` `appVersion` | the deployed backend reports this version |

`packages/desktop/scripts/release.sh` bumps all three together.

### Flow

```
LOCAL (Mac)                          PR                         MERGE → CI (CD)
───────────                          ──                         ───────────────
release.sh <v>                       version bump (×3)          deploy.yml:
  bump root+desktop+chart            release-manifest.json        build image → GHCR
  build+sign+notarize DMG    ─────►  (sha256 of the DMG)  ─────►  helm upgrade → cluster
  upload DMG to DRAFT                                           release.yml:
    release v<v> (private,           Release Guard check:         publish the draft release
    hidden)                            version bumped ⇒           → release: published
  write release-manifest.json          staged DMG must exist     desktop-release.yml:
                                       + sha256 must match         mirror DMG → hyperidle-releases
                                       else the PR is RED          dispatch → homebrew-tap cask
```

### Cutting a release

```bash
# 1. Local: build + notarize + stage (uploads the DMG to a hidden draft release)
./packages/desktop/scripts/release.sh 0.5.0

# 2. Commit what it changed and open a PR
git add -A && git commit -m "release: HyperIdle v0.5.0"
gh pr create --base main --fill

# 3. Merge once green. CD does the rest:
#    backend → cluster, desktop → hyperidle-releases + Homebrew.
```

### Why this shape

- **Notarization stays local.** Apple signing needs the Developer ID cert in the
  keychain; we keep those creds off CI. The DMG is the one artifact CI can't build.
- **The PR carries proof, not the binary.** A ~200 MB DMG never enters git (no LFS).
  It's staged on a **draft release in the private repo** (hidden — public only when
  CD mirrors it to `hyperidle-releases`), and the PR commits its `sha256`. The
  **Release Guard** check fails any version bump whose DMG wasn't staged, so a
  release can't merge half-built.
- **One merge, both surfaces.** `deploy.yml` (backend) and `release.yml` (desktop
  publish) both trigger on the same version bump. `release.yml` owns the git tag
  (created when it publishes the release) so the two don't race.

### Workflows

| Workflow | Trigger | Does |
|---|---|---|
| `release-guard.yml` | PR to main | If version bumped, require the staged DMG (draft release asset + matching sha256). |
| `deploy.yml` | push to main (version bump) | Build image → GHCR → `helm upgrade` → cluster. |
| `release.yml` | push to main (version bump) | Publish the staged draft release → emits `release: published`. |
| `desktop-release.yml` | `release: published` | Mirror DMG → `hyperidle-releases`; dispatch cask update → `homebrew-tap`. |

### Provisioning / secrets (one-time)

- Backend: `KUBE_TOKEN`/`KUBE_CA_CERT`/`KUBE_SERVER` + namespace secrets — see
  [shared-backend.md](./shared-backend.md).
- Desktop: `RELEASES_TOKEN` (push to `hyperidle-releases`), `HOMEBREW_TAP_TOKEN`
  (dispatch to `homebrew-tap`). Apple creds (`APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`,
  `APPLE_TEAM_ID`) stay **local** in `.env`.
