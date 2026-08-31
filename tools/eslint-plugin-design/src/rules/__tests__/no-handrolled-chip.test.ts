import { RuleTester } from "eslint";
import { describe, it } from "vitest";
import { noHandrolledChip } from "../no-handrolled-chip.js";
import { ruleTester } from "./setup.js";

RuleTester.describe = describe as unknown as typeof RuleTester.describe;
RuleTester.it = it as unknown as typeof RuleTester.it;

// A pill radius AND a fill, on an element that is neither a control tag nor
// one of the design-system chip components, under layers/core-ui/src/**.
// Both halves are required — a pill without a fill is an outline, a fill
// without a pill is a surface.
ruleTester.run("no-handrolled-chip", noHandrolledChip, {
	valid: [
		// Outside layers/core-ui/src — nothing else in the repo is in scope.
		{
			filename: "framework/design-system/src/Avatar.tsx",
			code: 'const J = <span className="rounded-full bg-[var(--surface-container)]" />;',
		},
		// A design-system chip component used correctly.
		{
			filename: "layers/core-ui/src/pages/Foo.tsx",
			code: 'const J = <Tag className="rounded-full bg-[var(--surface-container)]" />;',
		},
		{
			filename: "layers/core-ui/src/pages/Foo.tsx",
			code: 'const J = <StatusChip className="rounded-[var(--r-pill)] bg-[var(--status-error)]" />;',
		},
		// A pill-shaped control belongs to no-handrolled-control, not here —
		// otherwise one migration produces two findings on one element.
		{
			filename: "layers/core-ui/src/pages/Foo.tsx",
			code: 'const J = <button className="rounded-full bg-[var(--surface-container)]" />;',
		},
		// Pill radius, no fill — an outline pill, not a chip.
		{
			filename: "layers/core-ui/src/pages/Foo.tsx",
			code: 'const J = <span className="rounded-full border-[var(--border-subtle)]" />;',
		},
		// Fill, no pill radius — a surface, not a chip.
		{
			filename: "layers/core-ui/src/pages/Foo.tsx",
			code: 'const J = <div className="rounded-[var(--r-default)] bg-[var(--surface-container)]" />;',
		},
		// A bare fill on a bare element.
		{
			filename: "layers/core-ui/src/pages/Foo.tsx",
			code: 'const J = <div className="flex items-center gap-[6px]" />;',
		},
		// Test/story files are not product surfaces — same exclusion as
		// no-handrolled-control.
		{
			filename: "layers/core-ui/src/__tests__/foundation.component.test.tsx",
			code: 'const J = <span className="rounded-full bg-[var(--surface-container)]" />;',
		},
		{
			filename: "layers/core-ui/src/pages/Foo.stories.tsx",
			code: 'const J = <span className="rounded-full bg-[var(--surface-container)]" />;',
		},
	],
	invalid: [
		// rounded-full + a surface fill on a <span>.
		{
			filename: "layers/core-ui/src/pages/Foo.tsx",
			code: 'const J = <span className="rounded-full bg-[var(--surface-container)] px-[6px]" />;',
			errors: [{ messageId: "handrolledChip" }],
		},
		// The token pill spelling + a status fill on a <div>.
		{
			filename: "layers/core-ui/src/components/Foo.tsx",
			code: 'const J = <div className="rounded-[var(--r-pill)] bg-[var(--status-error)]" />;',
			errors: [{ messageId: "handrolledChip" }],
		},
		// rounded-[9999px], the third pill spelling, + a color-mix() fill.
		{
			filename: "layers/core-ui/src/pages/Foo.tsx",
			code: 'const J = <span className="rounded-[9999px] bg-[color-mix(in_oklab,var(--accent-primary)_12%,transparent)]" />;',
			errors: [{ messageId: "handrolledChip" }],
		},
		// A routed link component is not a design-system chip.
		{
			filename: "layers/core-ui/src/shell/Foo.tsx",
			code: 'const J = <RRLink className="rounded-full bg-[var(--accent-primary)]" />;',
			errors: [{ messageId: "handrolledChip" }],
		},
		// Variant prefixes are stripped before matching.
		{
			filename: "layers/core-ui/src/pages/Foo.tsx",
			code: 'const J = <span className="lg:rounded-full hover:bg-[var(--surface-elevated)]" />;',
			errors: [{ messageId: "handrolledChip" }],
		},
		// One report per element, not one per matching class token.
		{
			filename: "layers/core-ui/src/pages/Foo.tsx",
			code: 'const J = <span className="rounded-full rounded-[var(--r-pill)] bg-[var(--surface-container)] bg-[var(--surface-elevated)]" />;',
			errors: [{ messageId: "handrolledChip" }],
		},
		// The array + .join(" ") pattern must be caught (deep collector).
		{
			filename: "layers/core-ui/src/pages/Foo.tsx",
			code: 'const J = <span className={["rounded-full", "bg-[var(--surface-container)]"].join(" ")} />;',
			errors: [{ messageId: "handrolledChip" }],
		},
		// A chip's class string built in a same-file `const` before reaching
		// className must be followed through the identifier.
		{
			filename: "layers/core-ui/src/pages/Foo.tsx",
			code: 'const PILL = "rounded-full bg-[var(--surface-container)]"; const J = <span className={PILL} />;',
			errors: [{ messageId: "handrolledChip" }],
		},
	],
});
