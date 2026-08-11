# AZ3 — Loading, empty and failure are told apart

## Work package

**Outcome.** A user can tell the difference between "still loading", "nothing here yet" and "we could not load this", and can retry a failure without reloading the app.

**Why this matters.** When every data request fails, the knowledge surface currently renders a confident empty state — "Your knowledge base is empty · Create first item" — and the sidebar says "No teams yet" / "No knowledge yet" while requests are merely in flight. The product asserts a user's data does not exist when the server is down or slow. That is a trust failure, not a cosmetic one: a user who believes their knowledge base was wiped does not file a bug, they leave.

**What exists today.** Surfaces branch on "have data / have no data" and collapse both loading and failure into the no-data branch. The design system provides an error state and an empty state; the failure branch is simply not wired in most places. Skeletons exist on some surfaces but do not resemble the content they stand in for, and one surface exposes a raw HTTP status code as its entire error message.

**Missing delta.** Three distinct states, told apart everywhere data is fetched, with a way out of the failure state.

**Depends on.** None.

**Complexity.** M

**Engineering tier.** mvp

**Pre-build.** Not required — the design system already owns the empty and error presentations; this is adoption of an approved pattern. An architecture round still precedes the build — see the execution procedure below.

**Execution procedure (human-approved).** Skip the pipeline's standard phase set. One agent runs an architecture round first and stops; the founder reviews and approves it before any code is written. The same agent then builds in a single session — tests, then code. When it is done, one fresh agent reviews it, one round only. No refinement, design or critique phase, and no further human gate after the architecture approval. Founder decision, 2026-08-11: this is the approved procedure for this work package and the orchestrator does not add phases to it.

**Constraints.** Error messaging is written for a user, not a developer; no status codes or exception text in user-facing copy.

**Out of scope.** Retry/backoff policy at the network layer, request rate limiting, offline support.

## Acceptance criteria

- When a data request fails, the surface states that loading failed and offers a retry.
- A failed request never renders copy asserting that a collection is empty.
- While a request is in flight, the surface renders a loading state rather than an empty state.
- Activating retry re-issues the request and renders the outcome without a full page reload.
- Sidebar lists distinguish the same three states as the main surfaces they mirror.
- User-facing failure copy contains no status code, exception text or internal identifier.
- A loading placeholder occupies the same regions as the content it replaces, so content does not jump on arrival.

## Validation scenarios

- Given the server returns errors for every request, when the user opens the knowledge surface, then it reports a load failure with a retry and never says the knowledge base is empty.
- Given a slow network, when the user opens the team page, then a loading state shows until data arrives and the sidebar does not claim there are no teams.
- Given a failed load, when the user activates retry and the request then succeeds, then the content renders in place.
