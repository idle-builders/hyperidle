import { RuleTester } from "eslint";
import { describe, it } from "vitest";
import { requireFocusOnInteractive } from "../require-focus-on-interactive.js";
import { ruleTester } from "./setup.js";

RuleTester.describe = describe as unknown as typeof RuleTester.describe;
RuleTester.it = it as unknown as typeof RuleTester.it;

ruleTester.run("require-focus-on-interactive", requireFocusOnInteractive, {
	valid: [
		{
			filename: "Foo.tsx",
			code: "const J = <button onClick={()=>{}} />;",
		},
		{
			filename: "Foo.tsx",
			code: "const J = <div onClick={()=>{}} tabIndex={0} role='button' />;",
		},
		{
			filename: "Foo.tsx",
			code: "const J = <span onClick={()=>{}} className='focus-visible:ring-2' />;",
		},
		{
			filename: "Foo.tsx",
			code: "const J = <div className='hi' />;",
		},
	],
	invalid: [
		{
			filename: "Foo.tsx",
			code: "const J = <div onClick={()=>{}} />;",
			errors: [{ messageId: "needsFocus" }],
		},
		{
			filename: "Foo.tsx",
			code: "const J = <span onClick={()=>{}} className='hi' />;",
			errors: [{ messageId: "needsFocus" }],
		},
		{
			filename: "Foo.tsx",
			code: "const J = <div onClick={()=>{}} className='p-2' />;",
			errors: [{ messageId: "needsFocus" }],
		},
	],
});
