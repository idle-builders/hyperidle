## Foundation

- **Tailwind CSS + DaisyUI** (community, not big-tech), configured with two custom themes `lucid-dark` and `lucid-light`. System preference is respected when no explicit theme is set.
- **Behavior gaps** (focus trap in modals, collision-aware floating elements): `focus-trap-react` + `@floating-ui/react`.
- **Data utilities** (virtual lists, tables when needed): `@tanstack/react-*`, pulled in only when a page demands it.

That is the entire dependency surface for the UI layer.

---
