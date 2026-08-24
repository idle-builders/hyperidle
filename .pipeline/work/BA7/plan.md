# BA7 — Several people sign in to one shared backend

## Work package

**Outcome.** A team runs one backend, and each person signs in to it through the organisation's identity
provider. The system knows which human is acting, which team they belong to, and shows them their own
work — instead of treating every caller as the same single owner.

**Why this matters.** This is the deployment the product is for, and the one conversation depends on:
conversation between humans only means anything when there is more than one human. Today the shared
deployment surface exists but the identity underneath it does not, so every consequence of "who is
acting" is either missing or faked. Two concrete defects already found: the unscoped conversation list
returns every human's direct-message threads to any caller, and ship confirmations are addressed to a
hardcoded first-human-by-insertion-order.

**What exists today.** Authentication is a single team API key, plus tokens for live connections and
workers. A half-built invite-and-claim flow with its own login sessions is gated behind an environment
variable nothing sets, has no client, and is being deleted. There is **no identity-provider integration
anywhere in the repository**. Teams and membership exist and are real. A just-in-time user creation
function exists and is the right shape for provisioning a person on first sign-in.

**Missing delta.** Sign-in through an identity provider, an acting human derived from it, and the
scoping consequences that follow.

**Depends on.** None. This work package removes the invite and login-session machinery as part of
replacing it; that machinery must not be deleted separately beforehand, or there is no access mechanism
in the interval.

**Confirmed still standing (2026-08-24).** The cleanup passes honoured that constraint. Eleven symbols
convicted for deletion are deliberately still on the tree and are this package's to remove once the
provider replaces them: `createInvite`, `claimInvite`, `InviteRole`, `INVITE_ROLES`, `INVITE_CODE_TTL_MS`
and `NewInviteCode` (the invite half, which the OIDC ruling kills outright), and `createLoginSession`,
`validateBearerToken`, `revokeLoginSession`, `LOGIN_SESSION_TTL_MS` and `NewLoginSession` (the session
half, which a shared backend still needs in some form). Splitting those two halves is this package's
call, not a mechanical deletion — see `work/AU43/UNFINISHED.md`.

**Complexity.** L

**Engineering tier.** mvp

**Pre-build.** Refinement required — "who can see what" across several teams on one backend is the
load-bearing unresolved question, and it must be settled before it is built. Architecture required
after it.

**Constraints.**
- No home-grown password, invite, or session-minting machinery. Identity comes from the provider.
- Agent and worker authentication continues to work unchanged; this changes how humans are identified,
  not how machines are.
- This is not permissions infrastructure. Knowing who is acting and scoping what they see is in scope;
  roles, grants and an authorisation policy layer are not.
- A single-person install must remain usable without configuring an identity provider.

**Out of scope.** Role-based permissions. Organisation-level administration screens. Billing or seat
management. Cross-organisation federation.

## Acceptance criteria

- A person can sign in to a shared backend through an identity provider and is provisioned on first
  sign-in without an invitation.
- The system can name the human behind a request, and work attributed to a person is attributed to the
  signed-in human rather than a default.
- A person sees their own direct-message threads and not other people's.
- Notifications and confirmations addressed to a person reach that person, not a hardcoded first user.
- Agents and workers authenticate exactly as they did before.
- An install with no identity provider configured remains usable by one person.

## Validation scenarios

- Given a configured identity provider, when a new colleague signs in for the first time, then they get
  an account and can see their team's work without anyone inviting them.
- Given two people signed in to one backend, when one lists their conversations, then the other person's
  direct messages are not among them.
- Given a bet owned by a team, when it ships, then the confirmation goes to that team rather than to a
  fixed user.
