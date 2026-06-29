import { RuleTester } from "eslint";
import { describe, it } from "vitest";
import { noAiAesthetic } from "../no-ai-aesthetic.js";
import { ruleTester } from "./setup.js";

RuleTester.describe = describe as unknown as typeof RuleTester.describe;
RuleTester.it = it as unknown as typeof RuleTester.it;

// U10 Hearth update: rounded-2xl (16px) is now ON-SCALE (maps to --r-default).
// Only rounded-3xl (24px) remains an AI-aesthetic tell.
ruleTester.run("no-ai-aesthetic", noAiAesthetic, {
	valid: [
		{
			filename: "Card.tsx",
			code: 'const J = <div className="rounded-[10px] bg-surface-1 shadow-sm" />;',
		},
		{
			// shadow-lg allowed inside Modal.tsx (basename match)
			filename: "Modal.tsx",
			code: 'const J = <div className="shadow-lg" />;',
		},
		{
			// shadow-lg allowed inside Sheet.tsx (basename match)
			filename: "Sheet.tsx",
			code: 'const J = <div className="shadow-lg" />;',
		},
		{
			filename: "Foo.tsx",
			code: 'const J = <div className="rounded-full" />;',
		},
		{
			// Realistic product copy passes marketing scan
			filename: "Foo.tsx",
			code: "const J = <h1>Pitch review</h1>;",
		},
		{
			// "Effortless" inside a code block / lowercase usage doesn't fire — only PascalCase superlatives
			filename: "Foo.tsx",
			code: "const J = <p>This was effortless to read.</p>;",
		},
		// U10 Hearth: rounded-2xl (16px) is NOW on-scale — must NOT fire
		{
			filename: "Foo.tsx",
			code: 'const J = <div className="rounded-2xl" />;',
		},
		{
			// cn() variant with rounded-2xl also must NOT fire
			filename: "Foo.tsx",
			code: 'const J = <div className={cn("rounded-2xl", "bg-surface-1")} />;',
		},
	],
	invalid: [
		// rounded-3xl is still an AI-aesthetic tell
		{
			filename: "Foo.tsx",
			code: 'const J = <div className="rounded-3xl" />;',
			errors: [{ messageId: "rounded3xl" }],
		},
		{
			filename: "Foo.tsx",
			code: 'const J = <div className="bg-gradient-to-r from-indigo-500 to-purple-500" />;',
			errors: [{ messageId: "gradientBg" }],
		},
		// Tailwind v4 bg-linear-* and bg-radial-* variants also fire
		{
			filename: "Foo.tsx",
			code: 'const J = <div className="bg-linear-to-r from-indigo-500 to-purple-500" />;',
			errors: [{ messageId: "gradientBg" }],
		},
		{
			filename: "Foo.tsx",
			code: 'const J = <div className="bg-radial-at-center from-violet-500 to-fuchsia-500" />;',
			errors: [{ messageId: "gradientBg" }],
		},
		{
			filename: "Foo.tsx",
			code: 'const J = <div className="backdrop-blur-md" />;',
			errors: [{ messageId: "backdropBlur" }],
		},
		// SEV-1 #2: heavy-shadow filename heuristic must use BASENAME — a file
		// containing "Modal" anywhere in its path (not the basename) must NOT
		// be exempt. The legacy substring regex accepted this; the new rule rejects.
		{
			filename: "BetCardModalSummary.tsx",
			code: 'const J = <div className="shadow-xl" />;',
			errors: [{ messageId: "heavyShadow" }],
		},
		{
			filename: "pages/dialog-bar/Card.tsx",
			code: 'const J = <div className="shadow-xl" />;',
			errors: [{ messageId: "heavyShadow" }],
		},
		{
			filename: "Card.tsx",
			code: 'const J = <div className="shadow-xl" />;',
			errors: [{ messageId: "heavyShadow" }],
		},
		{
			filename: "Heading.tsx",
			code: 'const J = <h1 className="bg-clip-text text-transparent" />;',
			errors: [{ messageId: "gradientText" }],
		},
		// SEV-1 #1 expansion: Lorem ipsum in JSX text node fires.
		{
			filename: "Foo.tsx",
			code: "const J = <p>Lorem ipsum dolor sit amet</p>;",
			errors: [{ messageId: "loremIpsum" }],
		},
		// "Click here" placeholder copy fires.
		{
			filename: "Foo.tsx",
			code: "const J = <a>Click here to continue</a>;",
			errors: [{ messageId: "loremIpsum" }],
		},
		// Marketing superlative fires.
		{
			filename: "Foo.tsx",
			code: "const J = <h1>Effortless workflows</h1>;",
			errors: [{ messageId: "marketingCopy" }],
		},
		{
			filename: "Foo.tsx",
			code: "const J = <h2>Powerful automation</h2>;",
			errors: [{ messageId: "marketingCopy" }],
		},
		// Oversized padding tell #3.
		{
			filename: "Foo.tsx",
			code: 'const J = <div className="p-12" />;',
			errors: [{ messageId: "oversizedPadding" }],
		},
		// Leading emoji tell #5.
		{
			filename: "NavItem.tsx",
			code: "const J = <button>🚀 Launch</button>;",
			errors: [{ messageId: "leadingEmoji" }],
		},
		// cn()/clsx() rounded-3xl variant fires
		{
			filename: "Foo.tsx",
			code: 'const J = <div className={cn("rounded-3xl", "bg-surface-1")} />;',
			errors: [{ messageId: "rounded3xl" }],
		},
	],
});
