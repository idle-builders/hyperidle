# Track S: Shared Mode

Make HyperIdle work for more than one person on one instance — per-user identity, execution that can leave the current machine, and the shared-server experience that makes multi-user feel designed rather than bolted on.

**Shipped foundation.** S1 (per-user authentication — login sessions), S2 (remote execution via HarnessAdapter) and S4 (desktop-as-worker) are merged.

---

## Work package registry

| ID | Title | Type | Complexity | Depends | Status |
|---|---|---|---|---|---|
| S3 | Shared mode UX: a login screen, presence indicators showing who is online, and a setup flow that actually saves its choices | frontend | L | S1 (shipped) | unbuilt — carried from the legacy track file. S1 shipped the login-session backend and S2/S4 shipped remote execution, but the shared-server surface on top of them was never built, so multi-user reads as bolted on. Its second declared dependency was a setup flow registered as "P4" in the pre-0.8 layout; the setup flow has since shipped and been reworked by AV1 — re-scope the setup half against what AV1 actually built before starting. |

## Dependency graph

- `S3` → `S1` (shipped): renders the login and presence surface over the per-user auth and login-session model S1 established.
- Cross-track: `AV1` (track AV, shipped) reworked onboarding and the setup flow. S3's "setup flow that saves its choices" overlaps it — confirm what is genuinely left before building.
