## Shared Backend (cluster)

The **Shared Backend** is the headless HyperIdle server (Hono API + fabric) run as a
single **tenant** on the team's shared Kubernetes cluster
(`/Users/tg/Development/infra`), so the whole team collaborates against **one
dataset** instead of each person running an embedded-SQLite island. It is for
**internal usage only** — not a public cloud / SaaS offering.

It is the deployed form of the desktop client's existing **shared mode**
(`bootSharedMode`, `validateSharedBackendKey`, `--backend-mode=shared`): the
desktop connects to a `serverUrl` and starts no embedded server. This page is
the ground-truth summary; the locked concept lives in
[`plans/shared-backend-deploy/concept.md`](../../plans/shared-backend-deploy/concept.md).

### Shape

- **Profile:** runs `HYPERIDLE_PROFILE=cloud` (Postgres via `DATABASE_URL`,
  network-exposed, mandatory `HYPERIDLE_API_KEY`). No new profile is introduced.
- **Stateless compute:** all durable state in the shared Postgres schema; pod
  rootfs read-only, only `/tmp` writable. Replicas are interchangeable.
- **Serves SPA + API:** one Hono server serves the web bundle at `/`
  (`HYPERIDLE_STATIC_DIR`) and the API at `/api/*`. Desktop shared-mode clients
  `loadURL()` the root. Runs **no agents** (no `ANTHROPIC_API_KEY` in the pod —
  agents stay on the user's machine).
- **Auth:** one **shared team `HYPERIDLE_API_KEY`**, validated by clients against
  `/api/health/auth`. Never the laptop dev default on a network-exposed instance.

### "Always latest" = latest **release**, not latest commit

A release is marked by **bumping the root `package.json` `version`** in a PR. When
that PR merges to `main`, `deploy.yml` detects the changed version and — in one
automatic chain — builds the image, publishes it to GHCR, tags the commit
`vX.Y.Z`, and rolls the new backend + SPA onto the cluster. Merges that don't
change `version` are a no-op, so the shared dataset advances on a deliberate
cadence rather than on every commit. A (container) **Release** is an immutable
GHCR image; a **Deploy** is one `helm upgrade --install` revision.

### Provisioning (once) vs Deploy (every release)

| | Provisioning — founder/infra, one-time | Deploy — CI, every release |
|---|---|---|
| **SQL** | Schema + role + `database-url` secret via infra **Terraform** | Drizzle **table migrations** in the migrate init-container (additive-only) |
| **Auth** | `KUBE_*` GitHub secrets from Terraform output; `HYPERIDLE_API_KEY` secret via admin kubeconfig | Pod **reads** secrets via `secretKeyRef` |
| **CI** | Store `KUBE_*` secrets, confirm GHCR perms | `deploy.yml`: tag → build → push → `helm upgrade --install` (driver=configmap) |

A Deploy **never provisions** — it consumes what provisioning created and applies
additive migrations. The deployer ServiceAccount stays least-privilege (no Secret
reads, no deletes); don't widen RBAC to make a deploy easier.

### What it is NOT

Not the desktop app · not a public/SaaS web offering (serves the SPA only to the
team behind a shared key) · not an agent runtime · not stateful compute · "latest"
is not every commit.

### Artifacts (this repo)

- `Dockerfile.deploy` — production image (web SPA built in, server via tsx, non-root, read-only-rootfs safe).
- `chart/` — Helm chart (deployment + service + ingress, migrate init-container).
- `.github/workflows/deploy.yml` — tag (`v*`) → build → push GHCR → `helm upgrade --install`.

### First deploy — one-time provisioning (founder/infra, NOT CI)

A Deploy never provisions — do these once before the first tag:

1. **Tenant (schema + role + `database-url`/`pg-ca-cert`/`ghcr-pull` secrets)** — already
   created by infra Terraform (`terraform/main/modules/tenant`). Confirm the `hyperidle`
   namespace + secrets exist: `kubectl -n hyperidle get secret`.
2. **Deployer creds → GitHub secrets** (infra repo, see tenant guide Step 1):
   `KUBE_TOKEN`, `KUBE_CA_CERT`, `KUBE_SERVER` on `ambrovia/hyperidle`.
3. **Shared API key** (admin kubeconfig — deployer SA can't write Secrets):
   ```bash
   kubectl create secret generic app-secrets -n hyperidle \
     --from-literal=HYPERIDLE_API_KEY=$(openssl rand -hex 32)
   ```
   Distribute that key to each desktop client's shared-mode config.
4. **Ingress host** — set `chart/values.yaml` `ingress.host` to the real internal
   domain (must be in the tenant domain allowlist), point its DNS at the ingress
   floating IP. cert-manager issues TLS automatically.

Then, to ship a release: bump `version` in the root `package.json` in a PR and
merge it to `main`. `deploy.yml` builds, publishes, tags `vX.Y.Z`, and deploys
automatically. (Manual re-deploy/rollback: run the workflow via `workflow_dispatch`
with a ref.)

### Reference

- Tenant contract (namespace, secrets, RBAC, Helm, Dockerfile, ingress):
  `/Users/tg/Development/infra/docs/tenant-deployment-guide.md`
- Cloud profile internals: [cloud.md](./cloud.md)
- Locked concept: [`plans/shared-backend-deploy/concept.md`](../../plans/shared-backend-deploy/concept.md)
