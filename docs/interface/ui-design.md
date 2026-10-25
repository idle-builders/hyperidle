# UI design

The app is `layers/core-ui`: plain React with Vite and React Router, styled with plain CSS. No
Tailwind, no DaisyUI, no component library, no CSS-in-JS. The document editor is TipTap, storing
Markdown. Design intent lives in `plans/design-restart/information-architecture.md`.

## Files

- `src/App.tsx` — the page addresses (see [navigation.md](navigation.md)).
- One file per screen: `Sidebar.tsx`, `Find.tsx`, `Thread.tsx`, `Judge.tsx` (a review),
  `Shift.tsx` (a task), `Think.tsx` (a document), `People.tsx` (a person or a team), `Plugins.tsx`,
  `Start.tsx` (first start), `Setup.tsx` (the dialogs on a person's page). Shared pieces sit beside
  them: `Composer.tsx`, `FormatBar.tsx`, `MentionPicker.tsx`, `Msg.tsx`, `Loop.tsx`,
  `ReviewPart.tsx`, `Failed.tsx`.
- What a screen works out from data — lists, words, order — is in a plain `.ts` file beside it
  (`sidebar-lists.ts`, `task-page.ts`, `review-page.ts`, …), with its unit tests next to it.

## Tokens and the skin

- `src/tokens.css` holds every raw value: colours, spacing, type, fonts. It is the only file allowed
  a raw colour.
- `src/app.css` holds the classes, written with `var(--…)` tokens only.
- One skin, Paper, in light and dark: `data-skin="paper"` and `data-mode="light" | "dark"` on
  `<html>`. Each viewer picks Light, Dark or Like this computer on their own page; the choice is
  kept in that browser only (`looks.ts`).
- The token check — `npm run lint:design-css`, part of `npm run lint`
  (`tools/repo-gates/src/design-css-gate.ts`) — fails on a raw colour outside `tokens.css` or on a
  token that is not defined. The rules for adding UI are in `.claude/rules/design-system.md`.

## Reading and writing data

- `api.ts` — one `call(action, input)` that posts to `/api/actions/<name>` with the API key. The
  actions are declared in `@hyperidle/domain-model`.
- `useAction.ts` — runs an action, keeps the last good answer, and runs it again when one of its
  topics is nudged. There is no cache: each screen asks for what it shows.
- `live.ts` — one WebSocket for the whole app. Topics: `conversations`, `tasks`, `documents`,
  `thread:<id>`, `task:<id>`, `document:<id>`, `user:<id>`. After a dropped connection every
  listener is nudged.
- No made-up data in production code. The demo world (`tools/setup/src/demo-world`) holds the
  story; it can be seeded into a database (`npm run setup -- --demo`) and the end-to-end tests run on it.

## Tests

Unit tests sit beside the `.ts` files they test. End-to-end tests (`layers/core-ui/__e2e__/`) drive
the real server on a fresh demo world with Playwright, locally. How tests are written:
`.claude/rules/testing.md`.
