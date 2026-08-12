import { RuleTester } from "eslint";
import { describe, it } from "vitest";
import { radiusTokenOnly } from "../radius-token-only.js";
import { ruleTester } from "./setup.js";

RuleTester.describe = describe as unknown as typeof RuleTester.describe;
RuleTester.it = it as unknown as typeof RuleTester.it;

// AZ7 Set 4: the only permitted radius spellings are rounded-none (0px) and
// the three --r-* tokens (subtle/default/pill). Everything else — named
// Tailwind radii, arbitrary pixel values, and rounded-full (the pill's OTHER
// spelling) — is a violation.
ruleTester.run("radius-token-only", radiusTokenOnly, {
	valid: [
		{ filename: "Foo.tsx", code: 'const J = <div className="rounded-none" />;' },
		{ filename: "Foo.tsx", code: 'const J = <div className="rounded-[var(--r-subtle)]" />;' },
		{ filename: "Foo.tsx", code: 'const J = <div className="rounded-[var(--r-default)]" />;' },
		{ filename: "Foo.tsx", code: 'const J = <div className="rounded-[var(--r-pill)]" />;' },
		// Side/corner infix on a token spelling stays valid.
		{ filename: "Foo.tsx", code: 'const J = <div className="rounded-t-[var(--r-default)]" />;' },
		{ filename: "Foo.tsx", code: 'const J = <div className="rounded-tl-[var(--r-subtle)]" />;' },
		// A non-radius class is untouched.
		{ filename: "Foo.tsx", code: 'const J = <div className="flex items-center" />;' },
		// The array + .join(" ") pattern — must resolve through the deep
		// collector to the SAME predicate as a plain string literal.
		{
			filename: "Foo.tsx",
			code: 'const J = <div className={["rounded-[var(--r-subtle)]", "border"].join(" ")} />;',
		},
		// AQ-011 form-control exemption: Checkbox.tsx may use an off-scale,
		// non-token radius on its own box — the rule is fully off for this file.
		{
			filename: "framework/design-system/src/Checkbox.tsx",
			code: 'const J = <div className="rounded-[6px]" />;',
		},
		// AZ7 review-round-2 NEW-1: the deliberately conservative boundary of
		// createConstIdentifierResolver — a `let` is never followed, even when
		// it happens to hold a token-legal string, because the resolver cannot
		// prove it isn't reassigned to something else elsewhere.
		{
			filename: "Foo.tsx",
			code: 'let cls = "rounded-full"; cls = "rounded-[var(--r-pill)]"; const J = <div className={cls} />;',
		},
	],
	invalid: [
		// AZ7 N3 (review round 1): the exemption is keyed to the design
		// system's OWN Checkbox.tsx path, not the bare filename — a
		// same-named file anywhere else in the repo (a page-local component,
		// a test fixture) must NOT inherit the exemption.
		{
			filename: "layers/core-ui/src/pages/knowledge/Checkbox.tsx",
			code: 'const J = <div className="rounded-[6px]" />;',
			errors: [{ messageId: "notAToken" }],
		},
		// rounded-full — the pill's second, now-forbidden spelling (Trade-off 1).
		{
			filename: "Foo.tsx",
			code: 'const J = <div className="rounded-full" />;',
			errors: [{ messageId: "notAToken" }],
		},
		// Named off-scale radii.
		{
			filename: "Foo.tsx",
			code: 'const J = <div className="rounded" />;',
			errors: [{ messageId: "notAToken" }],
		},
		{
			filename: "Foo.tsx",
			code: 'const J = <div className="rounded-lg" />;',
			errors: [{ messageId: "notAToken" }],
		},
		{
			filename: "Foo.tsx",
			code: 'const J = <div className="rounded-2xl" />;',
			errors: [{ messageId: "notAToken" }],
		},
		// Arbitrary pixel radii, even ones that land on the Hearth scale by value.
		{
			filename: "Foo.tsx",
			code: 'const J = <div className="rounded-[10px]" />;',
			errors: [{ messageId: "notAToken" }],
		},
		{
			filename: "Foo.tsx",
			code: 'const J = <div className="rounded-[9999px]" />;',
			errors: [{ messageId: "notAToken" }],
		},
		// A non-token bracket value that is not even a radius token reference.
		{
			filename: "Foo.tsx",
			code: 'const J = <div className="rounded-[var(--other-token)]" />;',
			errors: [{ messageId: "notAToken" }],
		},
		// The array + .join(" ") pattern must be caught — this is the exact
		// shape that let Checkbox.tsx's rounded-[6px] pass the old
		// no-off-scale-radius rule undetected (util.ts collectClassStringsFromExpressionDeep lore).
		{
			filename: "Foo.tsx",
			code: 'const J = <div className={["rounded-[6px]", "border"].join(" ")} />;',
			errors: [{ messageId: "notAToken" }],
		},
		// AZ7 review-round-2 NEW-1: CommentRow.tsx’s exact shape — a ternary
		// of two class strings assigned to a `const`, only THEN passed to
		// className. Reproduces `avatarClass` (both branches carry
		// `rounded-full`); must report through the identifier.
		{
			filename: "Foo.tsx",
			code: 'const isAgent = true; const avatarClass = isAgent ? "rounded-full bg-a" : "rounded-full bg-b"; const J = <span className={avatarClass} />;',
			errors: [{ messageId: "notAToken" }, { messageId: "notAToken" }],
		},
		// A module-level extracted class-string constant — the more common
		// real-world shape the repo sweep found (e.g. ArtifactStackItem.tsx’s
		// PILL, ErrorState.tsx’s RETRY_BTN_CLASS).
		{
			filename: "Foo.tsx",
			code: 'const PILL = "rounded-full"; const J = <span className={PILL} />;',
			errors: [{ messageId: "notAToken" }],
		},
		// A template-literal interpolation of an identifier — Avatar.tsx’s
		// shape (a `${colorClass}` inside a template literal className).
		{
			filename: "Foo.tsx",
			code: 'const colorClass = "rounded-full"; const J = <div className={`inline-flex ${colorClass}`} />;',
			errors: [{ messageId: "notAToken" }],
		},
	],
});
