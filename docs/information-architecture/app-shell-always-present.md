## 1. App Shell (Always Present)

The shell is the fixed frame around every view. It provides:

1. **View switching** — navigation between Conversations, Work, and Knowledge
2. **Per-view sub-navigation** — contextual filtering/browsing for the active view
3. **Main content** — the active view's content
4. **Ambient awareness** — system state (blockers, cost burn, unread counts) accessible without leaving the current view

The specific layout structure (sidebar vs. top-nav, left vs. right, panels vs. overlays) is a design-time decision. The requirement is that these four capabilities are always reachable.

### 1.1 Settings (Overlay)

Settings opens as an overlay. Press Escape to close and return to the previous view.

Seven settings sections:

| Section | Information | Actions |
|---|---|---|
| **Profile** | Name, email | Edit name and email |
| **Org Chart** | Review routing edges between users/agents | Add, edit, delete routing edges (direct, function, team mechanisms) |
| **Credentials** | API keys and shared credentials | Add/remove credentials; desktop uses safeStorage, shared uses encrypted DB |
| **Notifications** | Per-type toggles (review, cost, blocker), quiet hours (HH:MM), per-product mute | Toggle on/off, set times |
| **Appearance** | Density (auto/compact/default/comfortable), theme (light/dark/system) | Select options |
| **Products** | Product list with active/archived status | Toggle active/archived |
| **Backend** | Current backend mode, desktop-only gate | View mode, switch button with restart warning |

---
