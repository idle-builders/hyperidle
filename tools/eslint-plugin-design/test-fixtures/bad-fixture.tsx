/**
 * Bad fixture: triggers EVERY design/* rule. Some rules fire multiple times
 * (one per anti-pattern variant) by design — see fixtures.test.ts which
 * deduplicates by rule id and asserts every rule is present.
 *
 * Each violation is annotated with `// expect: design/<rule-name>` so it is
 * obvious from the source which line targets which rule.
 *
 * design/require-ds-attribute and design/require-stories-sibling are
 * filename-scoped and exercised by their own unit tests + the dedicated
 * sibling-fixtures directory.
 *
 * U10 Hearth update: rounded-2xl is now ON-SCALE — uses rounded-3xl here instead.
 * The radius-token-only arbitrary case uses rounded-[4px] (still off-scale).
 *
 * AZ7 E6: no-off-scale-radius was replaced by radius-token-only (the old
 * rule's allowlist permitted rounded-full; the new rule permits only
 * rounded-none or a --r-* token). rounded-md and rounded-3xl remain
 * violations under the new rule too — neither is rounded-none nor a token.
 */

import type { JSX } from "react";

export const Bad = (): JSX.Element => (
	<div onClick={() => {}}>
		{" "}
		{/* expect: design/require-focus-on-interactive */}
		<span style={{ color: "#ff00aa" }} /> {/* expect: design/no-hardcoded-color */}
		<span className="p-[5px]" /> {/* expect: design/no-off-grid-spacing */}
		<span className="rounded-[4px]" /> {/* expect: design/radius-token-only (arbitrary — not a --r-* token) */}
		<span className="rounded-md" /> {/* expect: design/radius-token-only (named — not a --r-* token) */}
		<span className="text-[22px]" /> {/* expect: design/no-off-scale-font-size */}
		<span className="rounded-3xl" />{" "}
		{/* expect: design/no-ai-aesthetic (rounded3xl) + radius-token-only */}
		<span className="backdrop-blur-md" /> {/* expect: design/no-ai-aesthetic (backdropBlur) */}
		<h1 className="bg-clip-text text-transparent" />{" "}
		{/* expect: design/no-ai-aesthetic (gradientText) */}
		<span className="bg-blue-500" /> {/* expect: design/no-raw-tailwind-color */}
		<p>Lorem ipsum dolor sit amet</p> {/* expect: design/no-ai-aesthetic (loremIpsum) */}
		<h2>Effortless workflows</h2> {/* expect: design/no-ai-aesthetic (marketingCopy) */}
	</div>
);
