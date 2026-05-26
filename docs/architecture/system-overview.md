## 1. System Overview

HyperIdle is a meta layer that sits between agent harnesses (which run agents) and human interfaces (which present work). It does not call models, execute tools, or manage conversations — those are harness responsibilities. HyperIdle manages the organizational structure: who works on what, what they know, how they coordinate, and how humans stay in the loop.

```
┌─────────────────────────────────────────────────────────────────┐
│                     HUMAN INTERFACE                              │
│  The Factory (PWA + optional Tauri shell)                       │
│  ┌──────────┐ ┌──────────┐ ┌───────────┐ ┌─────────────────┐   │
│  │Conversa-  │ │ Rail     │ │ Work      │ │ Knowledge       │   │
│  │ tions     │ │ (HUD)   │ │ (Bets,    │ │ (Wiki)          │   │
│  │ (Review,  │ │          │ │  Tasks)   │ │                 │   │
│  │  Chat,    │ │          │ │           │ │                 │   │
│  │  Coach)   │ │          │ │           │ │                 │   │
│  └─────┬─────┘ └────┬─────┘ └─────┬─────┘ └──────┬──────────┘   │
│        │            │             │               │              │
│        └────────────┴──────┬──────┴───────────────┘              │
│                            │                                     │
│                     ┌──────┴──────┐                               │
│                     │  API Layer  │                               │
│                     └──────┬──────┘                               │
└────────────────────────────┼─────────────────────────────────────┘
                             │
┌────────────────────────────┼─────────────────────────────────────┐
│                     META LAYER                                    │
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
│  │  Bets · Tasks · Sessions · Teams · Routines · Inbox · Items │ │
│  │                     (SQLite)                                │ │
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
│  │ Docker/E2B/  │  │ Claude SDK/  │  │ Console / no-op /    │    │
│  │ Daytona/Git  │  │ Letta/Goose/ │  │ OTel (planned)       │    │
│  │              │  │ OpenHands    │  │                      │    │
│  └──────────────┘  └──────────────┘  └──────────────────────┘    │
└──────────────────────────────────────────────────────────────────┘
```

The layering is strict. Arrows point down (dependency direction). The Human Interface depends on the Meta Layer. The Meta Layer depends on the Agent Runtime adapters. No layer reaches past its neighbor.

---
