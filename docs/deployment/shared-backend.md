# Shared Backend (cluster)

The **Shared Backend** is the headless HyperIdle server run as a single **tenant** on the team's shared Kubernetes cluster, so the whole team collaborates against **one dataset** instead of per-person embedded islands. It is for **internal usage only** — not a public cloud / SaaS offering.

Desktop clients connect in **shared mode**: set a server URL in Settings → Backend; the desktop loads the server's URL, stores the key in the OS keychain (`shared_backend_key` via safeStorage, `applications/desktop/src/safe-credentials.ts`), and starts no embedded server. The server validates shared-mode clients against `GET /api/health/auth`.

## Shape

- **Profile:** runs `HYPERIDLE_PROFILE=cloud` (Postgres via `DATABASE_URL`, network-exposed, mandatory `HYPERIDLE_API_KEY` — `applications/remote-server/src/validate-startup-env.ts`). No new profile is introduced.
- **Stateless compute:** all durable state in Postgres; pod rootfs read-only, writes go only to the `/tmp` and `/data` emptyDir mounts (`HYPERIDLE_WORKSPACES_DIR=/data/workspaces`). Replicas are interchangeable.
- **Serves SPA + API:** one Hono server serves the web bundle at `/` (`HYPERIDLE_STATIC_DIR=/app/layers/core-ui/dist`) and the API at `/api/*`. Runs **no agents** — agents stay on user machines or remote workers.
- **Auth:** one **shared team `HYPERIDLE_API_KEY`** (K8s secret `app-secrets`), validated by clients against `GET /api/health/auth`.

## "Always latest" = latest **release**, not latest commit

A release is marked by **bumping the root `package.json` `version`** in a PR. When that PR merges to `main`, `deploy.yml` builds the image, publishes it to GHCR (`ghcr.io/ambrovia/hyperidle`), and rolls the new backend onto the cluster. Merges that don't change `version` are a no-op. See [releases.md](./releases.md).

## Provisioning (once) vs Deploy (every release)

| | Provisioning — founder/infra, one-time | Deploy — CI, every release |
|---|---|---|
| **SQL** | Schema + role + `database-url` secret via infra Terraform | Additive-only table migrations in the `migrate` init-container (`framework/db/src/migrate-pg.ts`) |
| **Auth** | `KUBE_*` GitHub secrets from Terraform output; `HYPERIDLE_API_KEY` secret via admin kubeconfig | Pod reads secrets via `secretKeyRef` |
| **CI** | Store `KUBE_*` secrets, confirm GHCR perms | `deploy.yml`: version gate → build → push → `helm upgrade --install` |

A Deploy **never provisions** — it consumes what provisioning created and applies additive migrations.

## Factory bootstrap

`applyFactoryCoreState` (`layers/core-api/src/bootstrap/factory-state.ts`) writes the one row every HyperIdle instance needs: the hidden `system:propagation` actor. It seeds no agent, no roster and no personas — those come from the welcome screen and plugins. It is idempotent.

The server calls it on every boot (`applications/remote-server/src/create-server.ts`), so both the VPS Docker Compose stack and the Helm chart get the required row without a separate bootstrap step.

## Artifacts (this repo)

- `Dockerfile.deploy` — production image (web SPA built in, server via tsx, non-root, read-only-rootfs safe).
- `deploy/chart/` — Helm chart (deployment + service + ingress, migrate init-container).
- `.github/workflows/deploy.yml` — triggers on push to `main` gated by a root `package.json` version change: build → push GHCR → `helm upgrade --install`.

## First deploy — one-time provisioning (founder/infra, NOT CI)

1. **Tenant** — schema + role + secrets already created by infra Terraform. Confirm: `kubectl -n hyperidle get secret`.
2. **Deployer creds → GitHub secrets:** `KUBE_TOKEN`, `KUBE_CA_CERT`, `KUBE_SERVER` on `ambrovia/hyperidle`.
3. **Shared API key** (admin kubeconfig):
   ```bash
   kubectl create secret generic app-secrets -n hyperidle \
     --from-literal=HYPERIDLE_API_KEY=$(openssl rand -hex 32)
   ```
   Distribute that key to each desktop client's shared-mode config.
4. **Ingress host** — `ingress.enabled` is off by default. Add a real host to the tenant allowlist, set `ingress.host` + `ingress.enabled: true`.

To ship a release: bump `version` in the root `package.json` and merge to `main`. `deploy.yml` builds, publishes, and deploys automatically.

## Reference

- Cloud profile internals: [self-hosting.md](./self-hosting.md)
- Release flow: [releases.md](./releases.md)
