# BB6 — Model settings belong to the harness

## Work package

**Outcome.** Model settings are per harness. Someone opens a harness and sees the models that harness
offers and whatever it needs to authenticate — a key for the ones that take a key, its own sign-in for
the ones that bring their own. The product-wide three-tier model gateway, and the credential machinery
that existed only to feed it, are gone.

**Why this matters.** Founder ruling: model settings should be there for the harness, not just for one
built-in gateway. Today `SettingsModels` configures three abstract tiers — `reasoning`, `workhorse`,
`fast` — each mapped to a provider, a model and a key. That abstraction existed because one in-process
gateway served every agent; with that gone it describes nothing a person can act on, while the real
question — "which models can this harness of mine actually run, and what does it need from me?" — has no
home. The cost of leaving it is a settings screen that configures a thing that no longer exists, and
credential code kept alive for it.

**What exists today.** `layers/core-ui/src/settings/SettingsModels.tsx` (381 lines) renders the three
tiers and auto-saves them. Behind it: `ModelGatewayConfig` / `ModelTierConfig` / `BUILT_IN_GATEWAY_CONFIG`
and the static `MODEL_CATALOG` in `framework/domain-model/src/model-gateway.ts`; `resolveModel` in
`layers/core-api/credentials/src/resolve-model.ts`; the credential names `anthropic_api_key`,
`openrouter_api_key` and `openai_compatible_api_key` with their store, routes and env seeding. Alongside
it, `SettingsHarnesses` already lists harnesses and renders a per-harness detail pane — the shape this WP
needs already exists, with a built-in special case that BB5 removed.

By the time this runs, three things have already changed the picture: model lists come from the harness
(BB1), model delivery no longer goes through `resolveModel` (BB2), and a stored key is consumed by a
named harness (BB3). So this WP is not deciding what replaces the gateway — it is retiring what is left
of it and giving the per-harness settings their proper home.

**Missing delta.** A per-harness settings surface that shows that harness's models and its own auth
requirement, and the removal of the tier abstraction plus whatever credential code has no consumer left.

**Depends on.** BB5 — what is genuinely dead in the credential and gateway code is only knowable once the
built-in harness is actually gone. Swept earlier, it is guesswork about which parts still have a
consumer.

**Complexity.** M

**Engineering tier.** production — declared for this WP (per-plan convention). It touches stored
credentials.

**Pre-build.** **Design pass required.** A settings section is being replaced, not adjusted: three tier
rows become a per-harness view whose content differs by harness — some need a key, some need a sign-in,
some need neither — and it has to sit coherently beside the harness list that already exists. Whether
this becomes part of the harness detail pane or stays a separate section is the decision.

**Constraints.**

- Every remaining credential must have a named consumer. A key kept "in case" is deleted.
- Full and destructive: no compatibility path for the retired tier configuration.
- A stored key that a harness still consumes must survive the change and keep working; a person does not
  re-enter a key they already gave.
- The per-harness view reads from discovery. It does not reintroduce a written-down model list.

**Out of scope.** Per-agent model selection in the agent editor, which already works and is BB1/BB2's.
Adding new credential kinds or new providers. Reworking the credential store's encryption or its
Electron-specific path.

## Acceptance criteria

1. Model settings are per harness: each harness shows the models it offers and what it needs to
   authenticate, and nothing presents a product-wide model configuration.
2. The three-tier model configuration is gone from the interface, the stored configuration and the code.
3. Every credential the product still stores has a named consumer; those that had only the removed
   gateway are gone, along with their routes, storage and seeding.
4. A key someone already entered for a harness that still uses it keeps working across the change without
   re-entry.
5. No model list shown in settings comes from a written-down catalogue.
6. Documentation made false by the removal is corrected.

## Validation scenarios

- Given a workspace using opencode with a stored key, when settings are opened, then that harness shows
  its own models and the key it holds, and agents keep running without re-entering it.
- Given a workspace using claude signed in through its own login, when settings are opened, then it shows
  its models and its sign-in state, and asks for no key.
- Given settings are browsed end to end, when looking for model configuration, then there is no
  product-wide tier configuration anywhere.
- Given a database that held the retired tier configuration, when it is upgraded, then nothing reads it
  and no agent's behaviour changes.
- Given every credential the product can store, when each is traced, then each has a consumer that reads
  it.
