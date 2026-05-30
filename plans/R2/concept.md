# R2 Concept Assessment: Work-First Landing

## Verdict: No new or reshaped domain concepts

R2 is a pure simplification of existing UI and logic. It removes fields and sections from SetupFlow, removes the product picker from BetCreateDialog, and changes the post-setup redirect target. Every noun involved already exists with stable identities:

- **User** (human, kind="human") -- identity unchanged; email becomes optional at setup time but remains in the schema and editable via Settings.
- **Product** -- created silently with defaults during setup; the entity, its schema, and its 1:1 Team relationship are unchanged.
- **Team** -- still auto-created alongside Product via POST /api/products; unchanged.
- **Bet** -- BetCreateDialog simplification removes the product picker but the Bet still belongs to a Product; the productId is resolved automatically (first/only product). The Bet entity is unchanged.
- **Setup** -- not a domain primitive. It is a one-time UI flow, not a persisted entity.

## Probes Applied

| Probe | Finding |
|-------|---------|
| Does R2 introduce a new noun? | No. User, Product, Team, Bet all pre-exist. |
| Does R2 change the identity of an existing noun? | No. All IDs, schemas, and relationships are unchanged. |
| Does R2 change essential properties? | No. It makes some fields optional at setup time but they remain in the schema. Email moves from "required at setup" to "editable in Settings". Product name gets a default. |
| Does R2 change lifecycle? | No. User creation, Product+Team creation, and Bet creation lifecycles are preserved. |
| Does R2 change authority boundaries? | No. The same entities are created by the same API endpoints with the same auth rules. |
| Does R2 create vocabulary collisions? | No. "Default product" is a computed default, not a new concept. |

## Concept: "Default Product"

The one thing worth noting: R2 introduces the behavior of auto-selecting a "default product" when creating a bet. This is NOT a new entity or field in the schema. It is a UI-layer resolution: "if only one product exists, use it implicitly." This is a presentation concern, not a domain concept. No `isDefault` column, no `defaultProductId` on the user. Just `products[0]` when `products.length === 1`.

If multiple products exist in the future, the BetCreateDialog will need to restore the product picker or introduce explicit default-product selection. That is a future R2 follow-up, not an R2 concern.

## Conclusion

No `/concept` deep-dive required. Proceed directly to `/design`.
