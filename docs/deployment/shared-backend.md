# Shared Backend (cluster)

The **Shared Backend** is the headless HyperIdle server run as a single **tenant** on the team's shared Kubernetes cluster, so the whole team collaborates against **one dataset** instead of per-person embedded islands. It is for **internal usage only** — not a public cloud / SaaS offering.

Desktop clients join at first start: "Join a team on a server" takes the server's address and signs the person in through the server's sign-in service in their browser. `POST /api/join` checks the sign-in, makes that person and hands back their own key, which the app keeps encrypted (`person_key` via Electron `safeStorage`, `applications/desktop/src/safe-credentials.ts`) before reopening on the server's address; it starts no server of its own. Every request carries the person's key, so the server knows who each caller is; `GET /api/health/auth` checks a key by hand. See [deployment](./index.md) for the desktop side.

## Shape

- **Profile:** runs `HYPERIDLE_PROFILE=cloud` (Postgres via `DATABASE_URL`, network-exposed, mandatory `HYPERIDLE_API_KEY` — `applications/remote-server/src/validate-startup-env.ts`). No new profile is introduced.
- **Stateless compute:** all durable state in Postgres; pod rootfs read-only, writes go only to the `/tmp` and `/data` emptyDir mounts (`HYPERIDLE_WORKSPACES_DIR=/data/workspaces`). Replicas are interchangeable.
- **Serves SPA + API:** one Hono server serves the web bundle at `/` (`HYPERIDLE_STATIC_DIR=/app/layers/core-ui/dist`) and the API at `/api/*`. Runs **no agents** — it takes sessions only from a worker connected over `/ws/worker`, and no app in this repo runs one (see [where agents run](./index.md)).
- **Auth:** each person's own key, handed out when they join by signing in with Zitadel. The chart sets `HYPERIDLE_SIGN_IN_ISSUER` and `HYPERIDLE_SIGN_IN_CLIENT_ID`; who may sign in is set in Zitadel. The server's own `HYPERIDLE_API_KEY` (K8s secret `app-secrets`) is for workers and checks by hand.

## Where a deployment lives

This repository holds what any deployment needs: `Dockerfile.deploy` and the chart in `deploy/chart/`. A running deployment lives in its own **private deployment repository**, which pins the HyperIdle version it runs and holds its own values (image, host, sign-in client) and its cluster credential. Nothing in this repository deploys anywhere.

The deployment repository builds the image from the pinned version, then runs `helm upgrade --install` with its values. Changing the pin is how a deployment moves to a new release.

## What the platform provides (once)

| | Provided by the platform | Supplied by the deployment repository |
|---|---|---|
| **Database** | Schema, role, `database-url` and `pg-ca-cert` secrets | — (migrations run in the `migrate` init-container, `framework/db/src/migrate-pg.ts`) |
| **Server key** | `app-secrets` with `HYPERIDLE_API_KEY` | — |
| **Sign-in** | A Zitadel instance with a native client allowing `http://127.0.0.1:52817/callback` and the user's info in its ID token | `signIn.issuer`, `signIn.clientId` |
| **Edge** | A host the namespace may claim, routed to the cluster's ingress with HTTPS at the edge | `ingress.enabled`, `ingress.host` |
| **Deploy access** | A namespace-scoped deployer credential that cannot read Secrets | Kept as a secret of the deployment repository |
| **Images** | The `ghcr-pull` pull secret | `image.repository`, `image.tag` (the commit SHA) |

A deploy **never provisions** — it consumes what the platform created and applies additive migrations.

## Factory bootstrap

`applyFactoryCoreState` (`layers/core-api/src/bootstrap/factory-state.ts`) writes the one row every HyperIdle instance needs: the hidden `system:propagation` actor. It seeds no agent, no roster and no personas — those come from first start and plugins. It is idempotent.

The server calls it on every boot (`applications/remote-server/src/create-server.ts`), so both the VPS Docker Compose stack and the Helm chart get the required row without a separate bootstrap step.

## Artifacts (this repo)

- `Dockerfile.deploy` — production image (web SPA built in, server via tsx, non-root, read-only-rootfs safe).
- `deploy/chart/` — Helm chart (deployment + service + ingress, migrate init-container). It requires `image.repository` and `image.tag`; everything that names one deployment comes from that deployment's values.

## Reference

- Cloud profile internals: [self-hosting.md](./self-hosting.md)
- Release flow: [releases.md](./releases.md)
