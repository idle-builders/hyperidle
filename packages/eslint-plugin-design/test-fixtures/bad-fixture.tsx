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
 */

export const Bad = (): JSX.Element => (
	<div onClick={() => {}}> {/* expect: design/require-focus-on-interactive */}
		<span style={{ color: "#ff00aa" }} /> {/* expect: design/no-hardcoded-color */}
		<span className="p-[5px]" /> {/* expect: design/no-off-grid-spacing */}
		<span className="rounded-[10px]" /> {/* expect: design/no-off-scale-radius (arbitrary) */}
		<span className="rounded-md" /> {/* expect: design/no-off-scale-radius (named) */}
		<span className="text-[17px]" /> {/* expect: design/no-off-scale-font-size */}
		<span className="rounded-2xl" /> {/* expect: design/no-ai-aesthetic (rounded2xl) + no-off-scale-radius */}
		<span className="backdrop-blur-md" /> {/* expect: design/no-ai-aesthetic (backdropBlur) */}
		<h1 className="bg-clip-text text-transparent" /> {/* expect: design/no-ai-aesthetic (gradientText) */}
		<span className="bg-blue-500" /> {/* expect: design/no-raw-tailwind-color */}
		<p>Lorem ipsum dolor sit amet</p> {/* expect: design/no-ai-aesthetic (loremIpsum) */}
		<h2>Effortless workflows</h2> {/* expect: design/no-ai-aesthetic (marketingCopy) */}
	</div>
);
