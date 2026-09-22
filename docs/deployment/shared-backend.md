# Shared Backend (cluster)

The **Shared Backend** is the headless HyperIdle server (Hono API + fabric) run as a
single **tenant** on the team's shared Kubernetes cluster
(`/Users/tg/Development/infra`), so the whole team collaborates against **one
dataset** instead of per-person embedded islands. It is for **internal usage
only** — not a public cloud / SaaS offering.

It is the deployed form of the desktop client's existing **shared mode**
(`bootSharedMode`, `validateSharedBackendKey`, `--backend-mode=shared` —
`applications/desktop/src/main.ts`, `applications/desktop/src/credential-validator.ts`):
the desktop connects to a `serverUrl` and starts no embedded server.

## Shape

- **Profile:** runs `HYPERIDLE_PROFILE=cloud` (Postgres via `DATABASE_URL`,
  network-exposed, mandatory `HYPERIDLE_API_KEY` —
  `framework/host-process/src/validate-env.ts`). No new profile is introduced. Cloud
  profile internals: [self-hosting.md](./self-hosting.md).
- **Stateless compute:** all durable state in the shared Postgres schema; pod
  rootfs read-only, writes go only to the `/tmp` and `/data` emptyDir mounts
  (`HYPERIDLE_WORKSPACES_DIR=/data/workspaces`). Replicas are interchangeable.
- **Serves SPA + API:** one Hono server serves the web bundle at `/`
  (`HYPERIDLE_STATIC_DIR=/app/layers/core-ui/dist`) and the API at `/api/*`.
  Desktop shared-mode clients `loadURL()` the root. Runs **no agents** — no LLM
  key in the pod; agents stay on the user's machine.
- **Auth:** one **shared team `HYPERIDLE_API_KEY`** (K8s secret `app-secrets`),
  validated by clients against `GET /api/health/auth`. Never the laptop dev
  default on a network-exposed instance.

## "Always latest" = latest **release**, not latest commit

A release is marked by **bumping the root `package.json` `version`** in a PR.
When that PR merges to `main`, `deploy.yml`'s version gate detects the change
and — in one automatic chain — builds the image, publishes it to GHCR
(`ghcr.io/ambrovia/hyperidle`, SHA tag is the immutable deploy target), and
rolls the new backend + SPA onto the cluster. Merges that don't change
`version` are a no-op, so the shared dataset advances on a deliberate cadence
rather than on every commit. A (container) **Release** is an immutable GHCR
image; a **Deploy** is one `helm upgrade --install` revision.

The `vX.Y.Z` git tag is **not** created by `deploy.yml` — `release.yml` owns it
(created when the staged desktop release publishes), so the two merge-triggered
workflows never race on the same tag. See [releases.md](./releases.md).

## Provisioning (once) vs Deploy (every release)

| | Provisioning — founder/infra, one-time | Deploy — CI, every release |
|---|---|---|
| **SQL** | Schema + role + `database-url` secret via infra **Terraform** | Additive-only **table migrations** in the `migrate` init-container (`framework/db/src/migrate-pg.ts` — custom runner, not drizzle-kit: the tenant role can't `CREATE SCHEMA`) |
| **Auth** | `KUBE_*` GitHub secrets from Terraform output; `HYPERIDLE_API_KEY` secret via admin kubeconfig | Pod **reads** secrets via `secretKeyRef` |
| **CI** | Store `KUBE_*` secrets, confirm GHCR perms | `deploy.yml`: version gate → build → push → `helm upgrade --install` (`HELM_DRIVER=configmap`) |

A Deploy **never provisions** — it consumes what provisioning created and
applies additive migrations. The deployer ServiceAccount stays least-privilege
(no Secret reads, no deletes; Helm state lives in ConfigMaps); don't widen RBAC
to make a deploy easier.

## Factory bootstrap (AF17)

The **factory bootstrap** (`applyFactoryCoreState` +
`applyFactoryRunConfigDefaults`, two layer faces —
`layers/core-api/src/bootstrap/factory-state.ts` and
`layers/agent-orchestration/src/factory-run-config.ts`) is the team-agnostic
baseline row-set every HyperIdle instance needs to function: the
`system:propagation` identity, the System Agent singleton, the AH2 runnable
defaults, and the `scope_kind="factory"` principle. It seeds no roster and no
personas — those come from plugins (BA9d retired the facilitator agents; BA9g
removed the roster concept from the core). It is **idempotent** (safe
to re-run) and **carries no user-facing `team_id`**. It runs on every desktop
launch after the desktop migrate step (`applications/desktop/src/main.ts`),
which calls the two faces directly, in order.

**Gap:** `tools/setup/src/bootstrap-pg.ts` (the deploy-time bootstrap CLI,
meant to run as a second init-container after migrate) is **not wired into the
Helm chart** — cloud deploys currently skip factory bootstrap.

Factory bootstrap is **not** team provisioning and **not** demo data:

- A user's own **team** and its **agent roster** are created by **onboarding / `create_team`**, provisioned per-team with an `ownerRole` resolved from the team roster at provision time — never factory-seeded. Plugin-provided routines (`document-decay`, `document-triage`, `post-task-retro`) are seeded by the document-management plugin on team creation.
- The bootstrap **never** creates a user-facing team, human, or assistant (local
  or shared). Demo/example world-state lives only in tests / stories / e2e /
  `setup-cli` demo mode, under a neutral fictional name.

## Artifacts (this repo)

- `Dockerfile.deploy` — production image (web SPA built in, server via tsx, non-root, read-only-rootfs safe).
- `chart/` — Helm chart (deployment + service + ingress, migrate init-container).
- `.github/workflows/deploy.yml` — triggers on push to `main` gated by a root `package.json` version change (plus `workflow_dispatch`): build → push GHCR → `helm upgrade --install`.

## First deploy — one-time provisioning (founder/infra, NOT CI)

A Deploy never provisions — do these once before the first release:

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
4. **Ingress host** — `ingress.enabled` is **off by default**: the tenant's
   `platform.infra/allowed-hosts` allowlist gates Ingress hostnames via a
   ValidatingAdmissionPolicy, so an un-allowlisted host fails the whole helm
   apply. Add a real host (e.g. `api.hyperidle.org`) to the tenant allowlist,
   set `ingress.host` + `ingress.enabled: true`, and point DNS at the ingress
   floating IP. Until then the backend runs and is reachable in-cluster via the
   Service.

**Postgres TLS note.** The tenant `DATABASE_URL` uses `sslmode=verify-ca` against
the cluster's self-signed Postgres whose cert SANs don't include the primary
ClusterIP name. The app honors verify-ca semantics (trust the CA, skip the
hostname check) via `framework/db/src/pg-ssl.ts` — used by both the runtime
connection and the migrate init-container (which also sets
`NODE_EXTRA_CA_CERTS=/etc/ssl/pg/ca.crt`).

Then, to ship a release: bump `version` in the root `package.json` in a PR and
merge it to `main`. `deploy.yml` builds, publishes, and deploys automatically
(the `vX.Y.Z` tag comes from `release.yml`). Manual re-deploy/rollback: run the
workflow via `workflow_dispatch` with a ref.

## Reference

- Tenant contract (namespace, secrets, RBAC, Helm, Dockerfile, ingress):
  `docs/tenant-deployment-guide.md` in the `infra` repo (`/Users/tg/Development/infra` locally)
- Cloud profile internals: [self-hosting.md](./self-hosting.md)
- Release flow + tag ownership: [releases.md](./releases.md)
