# Reconciliation — approved plan vs. live code (2026-08-30)

## Finding 1 — `product` is Team, not the layer vocabulary

**Question.** The plan says `product` and `practice` are "the layer vocabulary in
disguise" and both migrate to `factory`. Is that true?

**Method.** Read `layers/core-ui/src/utils/scope-labels.ts`,
`framework/domain-model/src/types.ts` (`scopeKindToLabel`, `SCOPES_REQUIRING_ID`),
and the seeded rows in `tools/setup/src/demo-world/knowledge.ts`.

**Result.** `product` displays as **Team** everywhere (`@lore AE1`: U1 renamed
Products to Teams, `scopeKindToLabel("product")` returns "Team", the Team filter
pill is `["team", "product"]`). Seeded product-scoped rows carry `scopeId:
TEAM_ID` — the id is already a team id.

**Verdict.** `product` migrates to `team`, keeping `scopeId` unchanged. Migrating
it to `factory` would publish every team's product knowledge to the whole factory.
**Contradicts the plan.**

## Finding 2 — `practice` is live role-scoped knowledge

**Question.** Same, for `practice`.

**Method.** Read `layers/core-api/src/routes/knowledge.ts` (scope-name
resolution), `layers/core-api/knowledge/src/session-knowledge-assembler.ts`,
`role-community-map.ts`, and the seeded rows.

**Result.** `practice` is a first-class, user-selectable scope — the "Role" option
in `SCOPE_CREATE_OPTIONS`, added deliberately by AV3 A2. Its `scopeId` is an agent
role id (seeded values: `builder`, `designer`, `growth`, `product_manager`,
`qa_engineer`), resolved for display through `roleLabel`. Context assembly uses it
to give an agent the knowledge for its role (`computeRoleMatch`,
`communityForRole`).

**Verdict.** Not dead vocabulary. Deleting it removes a live capability — role
knowledge reaching the agents that hold that role — unless that selection is
rebuilt. **Contradicts the plan.** Needs a founder decision; see the amendment
raised in conversation.

## Finding 3 — `KnowledgeKind` is declared twice

`framework/domain-model/src/knowledge.ts` and
`layers/core-api/knowledge/src/types.ts` each declare a `KnowledgeKind` with
different members. Both die with `kind`; noting it so the deletion covers both.
