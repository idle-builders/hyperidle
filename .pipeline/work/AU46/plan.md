# AU46 — An agent can work in a filesystem that needs credentials

## Work package

**Outcome.** A filesystem that requires authentication — a private repository, a hosted drive — can be
mounted into an agent's sandbox, and the agent can read and write it. Today only filesystems that need
no credentials work.

**Why this matters.** Most real work lives behind a credential. An agent that can only touch public or
local paths cannot do the work people actually have. The concept is already modelled throughout the
code, so the product currently claims a capability it does not have.

**What exists today.** The contract for an authenticated filesystem is fully modelled and entirely
inert: the authentication value is never constructed — both resolver implementations return nothing —
and never read, because the single production mount call passes no authentication at all. The resolver
interface has four members of which one is alive. Connections already exist as the credential path and
already store encrypted secrets, and a validate action exists to prove a connection works but has no
caller.

**Missing delta.** Make the resolver real, carry the resolved credential to the mount, and give someone
a way to confirm a connection works before an agent depends on it.

**Depends on.** None.

**Complexity.** M

**Engineering tier.** mvp

**Pre-build.** Architecture required — the credential must travel from a stored connection to a mount
inside a sandbox without the secret being baked into anything durable, and where that resolution happens
is a boundary decision, not an implementation detail.

**Constraints.**
- A resolved credential must not be written into any baked run payload, session record, or log.
- Failure to resolve a credential must present as a named, actionable failure on the filesystem, not as
  an empty or silently unmounted directory.

**Out of scope.** New filesystem kinds. Credential rotation and expiry handling. Per-agent credential
scoping beyond what connections already express.

## Acceptance criteria

- A filesystem configured against a connection that requires credentials mounts successfully into an
  agent's sandbox, and the agent can read and write it.
- A filesystem whose credential cannot be resolved reports that failure to the person who configured it.
- Someone can confirm from the product that a connection's credentials work.
- A resolved credential does not appear in any stored run payload or log.
- Filesystems that need no credentials continue to mount exactly as before.

## Validation scenarios

- Given a connection holding valid credentials for a private repository, when an agent runs with that
  filesystem mounted, then it can read the repository contents.
- Given a connection whose credentials have been revoked, when someone checks that connection, then they
  are told it no longer works.
- Given a filesystem that needs no credentials, when an agent mounts it, then nothing about its behaviour
  changed.
