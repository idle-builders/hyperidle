## 1. System Overview

HyperIdle is an OS for your agent factory. Its process layer sits between agent harnesses (which run agents) and human interfaces (which present work). It does not call models, execute tools, or manage conversations — those are harness responsibilities. HyperIdle manages the organizational structure: who works on what, what they know, how they coordinate, and how humans stay in the loop.

```
┌─────────────────────────────────────────────────────────────────┐
│                     HUMAN INTERFACE                              │
│  The Factory (Electron desktop app)                             │
│  ┌──────────────┐ ┌───────────────┐ ┌─────────────────────┐     │
│  │Conversations │ │ Work          │ │ Knowledge           │     │
│  │ (Threads,    │ │ (Bets, Tasks, │ │ (Items, Scopes,     │     │
│  │  Messages,   │ │  Sessions)    │ │  Curation)          │     │
│  │  Actions)    │ │               │ │                     │     │
│  └──────┬───────┘ └───────┬───────┘ └──────────┬──────────┘     │
│         │                 │                    │                 │
│         └─────────────────┼────────────────────┘                 │
│                           │                                      │
│                    ┌──────┴──────┐                                │
│                    │  API Layer  │                                │
│                    └──────┬──────┘                                │
└───────────────────────────┼──────────────────────────────────────┘
                             │
┌────────────────────────────┼─────────────────────────────────────┐
│                     META LAYER (Kernel + Fabric)                  │
│                                                                   │
│  ┌──────────────┐  ┌──────────────┐  ┌────────────────────────┐  │
│  │ Router       │  │ Scheduler    │  │ Knowledge Fabric       │  │
│  │              │  │              │  │                        │  │
│  │ Items →      │  │ Routines,    │  │ L0 Session (TOON)     │  │
│  │ Views        │  │ Rhythms,     │  │ L1 Task (SQLite)      │  │
│  │              │  │ Dependency   │  │ L2 Product (md+SQLite) │  │
│  │              │  │ watcher      │  │ L3 Practice (SQLite)   │  │
│  │              │  │              │  │ L4 Factory (markdown)  │  │
│  └──────┬───────┘  └──────┬───────┘  └──────────┬─────────────┘  │
│         │                 │                     │                 │
│  ┌──────┴─────────────────┴─────────────────────┴──────────────┐ │
│  │                   Primitive Store                            │ │
│  │  Users · Bets · Tasks · Sessions · Teams · Routines ·       │ │
│  │  Threads · Messages · Knowledge Items       (SQLite)        │ │
│  └─────────────────────────┬───────────────────────────────────┘ │
└────────────────────────────┼─────────────────────────────────────┘
                             │
┌────────────────────────────┼─────────────────────────────────────┐
│                     AGENT RUNTIME                                 │
│                                                                   │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐    │
│  │ Workspace    │  │ Harness      │  │ Observability        │    │
│  │ Adapter      │  │ Adapter      │  │ Adapter              │    │
│  │              │  │              │  │                      │    │
│  │ Local (host  │  │ Claude SDK   │  │ Console / no-op /    │    │
│  │ working dir) │  │              │  │ OTel (planned)       │    │
│  └──────────────┘  └──────────────┘  └──────────────────────┘    │
└──────────────────────────────────────────────────────────────────┘
```

The layering is strict. Arrows point down (dependency direction). The Human Interface depends on the Meta Layer. The Meta Layer depends on the Agent Runtime adapters. No layer reaches past its neighbor.

The Meta Layer is split into two packages at the code level: **Kernel** (stable protocols — routing, persistence, events) and **Fabric** (volatile heuristics — scoring, propagation, notifications). The kernel never imports from fabric; fabric subscribes to kernel events.

---
