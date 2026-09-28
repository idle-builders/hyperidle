# Releases

## Release pipeline (unified)

One version bump, carried by one PR, releases **both** surfaces on merge:

- **Backend** → built image to GHCR + deployed to the shared cluster (`deploy.yml`).
- **Desktop** → notarized DMG published to `hyperidle-releases` + Homebrew (`release.yml` → `desktop-release.yml`).

The DMG is built + notarized **locally** (Apple signing must run on a Mac), but everything else — publish, mirror, Homebrew, cluster deploy — happens in **CI on merge**.

### Version source of truth

The root `package.json` `version` is canonical. Two derived sources must match it (enforced inline in `.github/workflows/release-guard.yml`):

| Source | Why it must match |
|---|---|
| `applications/desktop/package.json` | electron-builder names the DMG `HyperIdle-<version>-arm64.dmg` |
| `deploy/chart/Chart.yaml` `appVersion` | the deployed backend reports this version |

`applications/desktop/__scripts__/release.sh` bumps all three together.

### Flow

```
LOCAL (Mac)                          PR                         MERGE → CI (CD)
───────────                          ──                         ───────────────
release.sh <version>                 version bump (×3)          deploy.yml:
  bump root+desktop+chart            release-manifest.json        build image → GHCR
  build+sign+notarize DMG    ─────►  (sha256 of the DMG)  ─────►  helm upgrade → cluster
  upload DMG to DRAFT                                           release.yml:
    release v<version> (private,     Release Guard check:         publish the draft release
    hidden)                            version bumped ⇒           → release: published
  write release-manifest.json          staged DMG must exist     desktop-release.yml:
                                       + sha256 must match         mirror DMG → hyperidle-releases
                                       else the PR is RED          dispatch → homebrew-tap cask
```

The Release Guard also runs `test:full`, `test:integration:service`, and the full e2e suite on version-bump PRs.

### Cutting a release

```bash
# 1. Local: build + notarize + stage (uploads the DMG to a hidden draft release)
./applications/desktop/__scripts__/release.sh <version>

# 2. Commit what it changed and open a PR
git add -A && git commit -m "release: HyperIdle v<version>"
gh pr create --base main --fill

# 3. Merge once green. CD does the rest:
#    backend → cluster, desktop → hyperidle-releases + Homebrew.
```

### Why this shape

- **Notarization stays local.** Apple signing needs the Developer ID cert in the keychain; those creds stay off CI.
- **The PR carries proof, not the binary.** A ~200 MB DMG never enters git. It's staged on a draft release, and the PR commits its `sha256`. The Release Guard fails any version bump whose DMG wasn't staged.

### Workflows

| Workflow | Trigger | Does |
|---|---|---|
| `release-guard.yml` | PR to main | If version bumped: require the staged DMG + matching sha256; run `test:full`, `test:integration:service`, full e2e. |
| `deploy.yml` | push to main (version bump) | Build image → GHCR → `helm upgrade` → cluster. |
| `release.yml` | push to main (version bump) | Publish the staged draft release → emits `release: published`. |
| `desktop-release.yml` | `release: published` | Mirror DMG → `hyperidle-releases`; dispatch cask update → `homebrew-tap`. |

### Provisioning / secrets (one-time)

- Backend: `KUBE_TOKEN`/`KUBE_CA_CERT`/`KUBE_SERVER` + namespace secrets — see [shared-backend.md](./shared-backend.md).
- Desktop: `RELEASES_TOKEN` (push to `hyperidle-releases`), `HOMEBREW_TAP_TOKEN` (dispatch to `homebrew-tap`). Apple creds (`APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID`) stay **local** in `.env`.
