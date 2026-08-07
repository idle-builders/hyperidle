# Requirements

Testable outcome statements for HyperIdle — what it does, how it must behave, and what platform constraints it must respect. Mechanism depth lives in the owning layer docs (linked per section); shapes are owned by `framework/db/src/schema.ts`.

- [users-and-their-modes-of-engagement.md](./users-and-their-modes-of-engagement.md) — `users.kind` model, six human interaction modes, agent engagement model, scope levels, and session dial-in.
- [functional-requirements.md](./functional-requirements.md) — outcome-level requirements for agents, bets, tasks, knowledge, items, sessions, and notifications; links to owning layer docs.
- [system-requirements.md](./system-requirements.md) — platform constraints and standing decisions: Electron + PGlite desktop, thread/verdict grammar, TOON codec, localhost auth. Architecture decisions log lives at [../architecture/decisions.md](../architecture/decisions.md).
- [usability-requirements.md](./usability-requirements.md) — behavioral UX requirements: three-view shell, keyboard shortcuts, drill-down navigation, notification digest, approval-rate trust, and usage transparency.
