# Visual evaluation

Read by `/design` and `/review`. Slot: `visual`.

**Judge the running application.** Not the source, not a component in isolation, not a lint result.
Drive the real app, get it into the real state, and look at it.

TSX is the single design source of truth: each component has exactly one `.tsx`, and its
`.stories.tsx` story IS the design artifact. There are no HTML reference files.

## 1. Drive the app

- **Web** — `npm run dev` (port 5173), then the browser tools: navigate, click through, screenshot.
  `.claude/launch.json` has `hyperidle` (API on 3001 + web) and `web-only`.
- **Packaged desktop** — the Electron build is a native app; the browser tools cannot drive it. Use
  computer-use, the way `/desktop-smoke-test` does.

Reach the state that matters — the route the user lands on, real seeded data, the interaction under
change. A surface judged on its empty state has not been judged.

## 2. Look at the pixels

Take the screenshot and read it. Reading code is not a visual check, and neither is a green lint.
Where a number settles an argument, pull it from the DOM alongside — computed styles, class lists,
resolved token values, the `data-ds-component` markers.

## 3. Compare, numerically when it helps

When there is something to compare against — before vs after, the reference story, the same surface in
the other theme or at another viewport — capture both and diff them:

```
npx playwright screenshot --viewport-size=1280,800 http://localhost:5173/<route> before.png
npx --yes pixelmatch before.png after.png diff.png 0.1
```

`pixelmatch` prints the changed-pixel count and error percentage and writes `diff.png` showing where.
Neither tool is a repo dependency; both run on demand. Use the diff to answer "did anything else move"
— it is a measurement you take, not a verdict on taste.

## 4. Where the images go

The scratchpad. **No image enters the repo, a commit, a pull request or main** — the finding travels as
words and numbers. And no image comparison gets wired into `verify` or CI: committed reference frames
were tried once and reverted, because they are binary churn, 1px-fragile across platforms, and drag
Docker into a gate that must run locally.

## 5. Founder review of the live render

The primary gate for anything visually novel or high-exposure, and it belongs in the plan as a hard
stop. The founder annotates the render; the real TSX is revised until approved. Never auto-approve
because a tool would not start, and never offer a passing lint in its place.

## 6. The component viewer — isolation only

For one component away from the app, the viewer ships with the pipeline plugin:

```
node "$CLAUDE_PLUGIN_ROOT/skills/design/viewer/launch.mjs" . --port 6006
```

(Codex exposes the same path as `$PLUGIN_ROOT`.) It copies itself to `<repo-root>/viewer/` — gitignored,
never committed — and serves the stories under `layers/core-ui/src/**`. Pass the port; its default
is 5173, the app's own. `.pipeline/viewer.config.json` is what makes it work here: story globs, the CSS
entry (`layers/core-ui/src/index.css`, which pulls in Tailwind, DaisyUI and the tokens) and the
`tailwind-v4` toolchain. It does not read `designSystem.path` for any of that — without the config it
finds no stories and renders unstyled. Reload once after changing that config.

**The viewer lies about spacing.** Its own `viewer.css` opens with an unlayered
`*, *::before, *::after { margin: 0; padding: 0 }`, and unlayered CSS beats Tailwind v4's
`@layer utilities` regardless of specificity — so every `p-*`, `px-*`, `m-*` utility is nulled there.
Proven on `Button`: `px-[18px]` in the class list, computed `padding-left: 0px`, while gap, min-height,
radius and colour all resolve correctly. Spacing gets judged in the app, never here.

## 7. What the lints add

- `npm run lint` runs the design rule set with `--max-warnings=0` — every rule is `error` or `off`,
  and any warning fails the build. Severities live in
  `tools/eslint-plugin-design/src/hearth-config.ts`; read it before claiming a rule protects you.
- `npm run check` catches a removed or renamed component variant — the quietest way a story stops
  representing its component.

There is no automated painted-pixel gate in this repo, and nothing above implies building one.

## Non-negotiable

- Every custom component has a `.stories.tsx`. The story is what the founder review renders.
- Never call a UI change done without having looked at the running app.
