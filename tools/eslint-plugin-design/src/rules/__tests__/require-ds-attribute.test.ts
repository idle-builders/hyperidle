import { RuleTester } from "eslint";
import { describe, it } from "vitest";
import { requireDsAttribute } from "../require-ds-attribute.js";
import { ruleTester } from "./setup.js";

RuleTester.describe = describe as unknown as typeof RuleTester.describe;
RuleTester.it = it as unknown as typeof RuleTester.it;

const inDS = "/abs/framework/design-system/src/Foo.tsx";
const elsewhere = "/abs/layers/web/src/Foo.tsx";

ruleTester.run("require-ds-attribute", requireDsAttribute, {
	valid: [
		{
			// Outside design-system: rule does not fire.
			filename: elsewhere,
			code: "export default function Foo(){return <div />;}",
		},
		{
			filename: inDS,
			code: "import {dsProps} from './ds-attrs';\nexport default function Foo(){return <div {...dsProps('Foo','1')} />;}",
		},
		{
			filename: inDS,
			code: "export default function Foo(){return <div data-ds-component='Foo' />;}",
		},
		{
			filename: inDS,
			code: "import {dsProps} from './ds-attrs';\nconst Foo=()=> <span {...dsProps('Foo','2')} />;\nexport default Foo;",
		},
	],
	invalid: [
		{
			filename: inDS,
			code: "export default function Foo(){return <div />;}",
			errors: [{ messageId: "missing" }],
		},
		{
			filename: inDS,
			code: "const Foo=()=> <div className='hi' />;\nexport default Foo;",
			errors: [{ messageId: "missing" }],
		},
		{
			filename: inDS,
			code: "export default function Foo(){return <><span /></>;}",
			errors: [{ messageId: "missing" }],
		},
	],
});
