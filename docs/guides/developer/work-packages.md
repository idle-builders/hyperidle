## Work Packages

Stories are defined in `plans/work-packages/TRACK-*.md` files (A through J). Each track has numbered stories with acceptance criteria. Implementation follows TDD:

1. Read the acceptance criteria from the track file
2. Write failing tests (red)
3. Implement until tests pass (green)
4. Simplify (refactor)
5. Verify: `npm run check && npm run lint && npm run test`
