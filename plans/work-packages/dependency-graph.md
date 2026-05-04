# Implementation Tracks & Dependency Graph

Nine implementation tracks plus one design-synthesis adoption track. Within each track, stories are sequential. Tracks run in parallel where dependencies allow.

Critical path: **A1 → A2 → B1 → B2 → B4 → C3 → D5 → E6 → UI-00 → UI-10 → UI-20 → UI-30 → UI-31 → UI-32 → UI-40 → G1 → G2 → G3 → G4 → H4**

Parallel windows:
- B (Knowledge Fabric) and C (Process Primitives) fully parallel after A2.
- E (API Layer) starts after A3.
- D (Agent Runtime) needs B2 + C3 before starting.
- UI starts after E6 (all endpoints).
- G (Facilitators) needs D4 + B4 + C5.
- H (Operations) can start once D5 core loop works.

```
A1 ─► A2 ─► A3
      │      │
      ├──────┼─► B1 ─► B2 ─► B3 ─► B4 ─► B5 ─► B6
      │      │
      ├──────┼─► C1 ─► C2 ─► C3 ─► C4 ─► C5 ─► C6 ─► C7
      │      │
      │      ├─► E1 ─► E2 ─► E3 ─► E4 ─► E5 ─► E6
      │      │         │                         │
      │      │         │                         └─► UI-00 ─► UI-10 ─► UI-20 ─► UI-30 ─► UI-31 ─► UI-40 ─► UI-50
      │      │         │                              │      │      │      │      │                    │
      │      │         │                              └──────┘      │      │      └─── UI-32 ─────────┘
      │      │         │                                           UI-42  UI-45 (parallel with UI-31/32)
      │      │
      ├──────┼───────────────────────► D1 ─► D2 ─► D3 ─► D4 ─► D5
      │      │                                              │
      │      └──────────────────────────────────────────────┼─► G1 ─► G2 ─► G3 ─► G4
      │                                                     │
      └─────────────────────────────────────────────────────┴─► H1 ─► H2 ─► H3 ─► H4
```
