/**
 * How a review points into a page it cannot see. A `data:` preview runs sealed in the app box, so
 * HyperIdle never reads its document; this small script runs inside the page and answers by
 * message: what is at a spot, where a pinned element is now, how tall the page is. Everything it
 * says is checked as data — a page that lies only moves pins on its own page.
 */

/** A box in the page's own view, in pixels. */
export interface Box {
	readonly top: number;
	readonly left: number;
	readonly width: number;
	readonly height: number;
}

export type Told =
	| { readonly told: "size"; readonly height: number }
	| { readonly told: "where"; readonly at: Readonly<Record<string, Box>> }
	| {
			readonly told: "point";
			readonly for: "hover" | "click";
			readonly selector: string;
			readonly words: string;
			readonly element: string;
			readonly box: Box;
	  };

export type Ask =
	| {
			readonly ask: "point";
			readonly for: "hover" | "click";
			readonly x: number;
			readonly y: number;
	  }
	| { readonly ask: "where"; readonly selectors: readonly string[] };

const TAG = "hyperidle-pin";

/** Runs first in the page, before the page's own script. Answers only the window two frames up. */
export const POINTER = `<script>(function(){
var up=parent.parent,asked=[];
function say(m){m.tag="${TAG}";up.postMessage(m,"*");}
function box(r){return{top:r.top,left:r.left,width:r.width,height:r.height};}
function words(el){var r=document.createRange();r.selectNodeContents(el);var b=r.getBoundingClientRect();return box(b.width>0?b:el.getBoundingClientRect());}
function sel(el){var s=[];for(var e=el;e&&e.tagName!=="BODY"&&e.tagName!=="HTML";){if(e.id){s.unshift("#"+CSS.escape(e.id));break;}var t=e.tagName.toLowerCase(),p=e.parentElement,same=p?[].filter.call(p.children,function(c){return c.tagName===e.tagName;}):[];s.unshift(same.length>1?t+":nth-of-type("+(same.indexOf(e)+1)+")":t);e=p;}return s.join(" > ")||"body";}
function where(){var at={};for(var i=0;i<asked.length;i++){var el=null;try{el=document.querySelector(asked[i]);}catch(e){}if(el)at[asked[i]]=words(el);}say({told:"where",at:at});}
function size(){var b=document.body,s=getComputedStyle(b);say({told:"size",height:Math.ceil(b.offsetHeight+parseFloat(s.marginTop)+parseFloat(s.marginBottom))});where();}
addEventListener("message",function(e){var m=e.data;if(e.source!==up||!m||m.tag!=="${TAG}")return;
if(m.ask==="where"){asked=[].concat(m.selectors);where();}
if(m.ask==="point"){var el=document.elementFromPoint(m.x,m.y);if(el)say({told:"point",for:m.for,selector:sel(el),words:(el.textContent||"").slice(0,200),element:el.tagName.toLowerCase(),box:box(el.getBoundingClientRect())});}});
new ResizeObserver(size).observe(document.body);
addEventListener("scroll",where,true);
})();</script>`;

/** Sends an ask to the page. */
export function ask(page: Window, a: Ask): void {
	page.postMessage({ ...a, tag: TAG }, "*");
}

const num = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const text = (v: unknown, max: number): v is string => typeof v === "string" && v.length <= max;

function readBox(v: unknown): Box | null {
	if (typeof v !== "object" || v === null) return null;
	const { top, left, width, height } = v as Record<string, unknown>;
	return num(top) && num(left) && num(width) && num(height) ? { top, left, width, height } : null;
}

/** What the page said, or null when it is not a well-formed answer. */
export function readTold(data: unknown): Told | null {
	if (typeof data !== "object" || data === null) return null;
	const m = data as Record<string, unknown>;
	if (m.tag !== TAG) return null;
	if (m.told === "size") return num(m.height) ? { told: "size", height: m.height } : null;
	if (m.told === "where") {
		if (typeof m.at !== "object" || m.at === null) return null;
		const at: Record<string, Box> = {};
		for (const [k, v] of Object.entries(m.at)) {
			const b = readBox(v);
			if (b && text(k, 2000)) at[k] = b;
		}
		return { told: "where", at };
	}
	if (m.told === "point") {
		const b = readBox(m.box);
		if (!(b && (m.for === "hover" || m.for === "click"))) return null;
		if (!(text(m.selector, 2000) && text(m.words, 200) && text(m.element, 40))) return null;
		return {
			told: "point",
			for: m.for,
			selector: m.selector,
			words: m.words,
			element: m.element,
			box: b,
		};
	}
	return null;
}
