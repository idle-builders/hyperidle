#!/usr/bin/env node
// `--extract` emits exact source jobs. Default joins the checked-in decision map.
import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { basename, extname, join, relative, sep } from "node:path";
import ts from "typescript";

const wanted = new Set(["@hyperidle/core-ui", "@hyperidle/design-system"]);
function walk(dir) { return readdirSync(dir).sort().flatMap((n) => { const p=join(dir,n); return statSync(p).isDirectory()?walk(p):[p]; }); }
const packages=["layers","framework","applications","tools"].flatMap((r)=>walk(r).filter((p)=>basename(p)==="package.json")).map((path)=>({path,json:JSON.parse(readFileSync(path,"utf8"))})).filter(({json})=>wanted.has(json.name));
for(const name of wanted){const n=packages.filter(({json})=>json.name===name).length;if(n!==1)throw new Error(`package discovery for ${name}: expected 1, found ${n}`);}
const roots=packages.map(({path})=>join(path.slice(0,-"package.json".length),"src"));
function dev(path){const a=path.split(sep),n=basename(path);return a.some((p)=>p.startsWith("__"))||/\.(test|spec|stories)\.(ts|tsx)$/.test(n)||/^(vitest|playwright).*\.config\.ts$/.test(n);}
const files=roots.flatMap(walk).filter((p)=>[".ts",".tsx",".css"].includes(extname(p))&&!dev(p));
if(!files.length)throw new Error("motion discovery matched zero production files");
let currentSource, consts, helpers, resolvingHelpers;
function returnedExpressions(body){const result=[];const visit=node=>{if(ts.isReturnStatement(node)&&node.expression){result.push(node.expression);return;}if(node!==body&&ts.isFunctionLike(node))return;ts.forEachChild(node,visit);};visit(body);return result;}
function strings(node){
	if(!node)return[];
	if(ts.isStringLiteralLike(node)||ts.isNoSubstitutionTemplateLiteral(node))return[node.text];
	if(ts.isTemplateExpression(node))return[node.head.text,...node.templateSpans.flatMap((span)=>strings(span.expression).concat(span.literal.text))];
	if(ts.isConditionalExpression(node))return strings(node.whenTrue).concat(strings(node.whenFalse));
	if(ts.isBinaryExpression(node)&&node.operatorToken.kind===ts.SyntaxKind.PlusToken)return strings(node.left).concat(strings(node.right));
	if(ts.isIdentifier(node)&&consts.has(node.text))return strings(consts.get(node.text));
	if(ts.isArrayLiteralExpression(node))return node.elements.flatMap(strings);
	if(ts.isCallExpression(node)){
		if(ts.isPropertyAccessExpression(node.expression)&&node.expression.name.text==="trim")return strings(node.expression.expression);
		if(ts.isPropertyAccessExpression(node.expression)&&["join","filter"].includes(node.expression.name.text))return strings(node.expression.expression);
		if(ts.isIdentifier(node.expression)&&["cn","clsx","classnames","twMerge","twJoin","clickableProps"].includes(node.expression.text))return node.arguments.flatMap(strings);
		if(ts.isIdentifier(node.expression)&&helpers?.has(node.expression.text)&&!resolvingHelpers.has(node.expression.text)){resolvingHelpers.add(node.expression.text);const result=helpers.get(node.expression.text).flatMap(strings);resolvingHelpers.delete(node.expression.text);return result;}
	}
	return[];
}
function directStrings(node){
	if(!node)return[];
	if(ts.isStringLiteralLike(node)||ts.isNoSubstitutionTemplateLiteral(node))return[node.text];
	if(ts.isTemplateExpression(node))return[node.head.text,...node.templateSpans.map((span)=>span.literal.text)];
	if(ts.isConditionalExpression(node))return directStrings(node.whenTrue).concat(directStrings(node.whenFalse));
	if(ts.isBinaryExpression(node)&&node.operatorToken.kind===ts.SyntaxKind.PlusToken)return directStrings(node.left).concat(directStrings(node.right));
	if(ts.isArrayLiteralExpression(node))return node.elements.flatMap(directStrings);
	if(ts.isCallExpression(node)&&ts.isPropertyAccessExpression(node.expression)&&["join","filter"].includes(node.expression.name.text))return directStrings(node.expression.expression);
	return[];
}
function jobToken(token){
	const bare=token.replace(/^(?:[a-z0-9-]+:)+/,"");
	let m;
	if((m=bare.match(/^transition-(none|all|colors|opacity|shadow|transform|\[(.+)\])$/)))return{kind:"transition",value:m[2]??m[1],syntax:token};
	if((m=bare.match(/^\[transition:(.+)\]$/)))return{kind:"transition",value:m[1].replaceAll("_"," "),syntax:token};
	if((m=bare.match(/^animate-(spin|pulse|ping|bounce|\[(.+)\])$/)))return{kind:"animation",value:m[2]??m[1],syntax:token};
	if(bare==="scroll-smooth")return{kind:"smooth-scroll",value:"smooth",syntax:token};
	return null;
}
const jobs=[];
function namedScope(source,node){for(let current=node;current;current=current.parent){if(ts.isFunctionDeclaration(current)&&current.name)return current.name.text;if((ts.isFunctionExpression(current)||ts.isArrowFunction(current))&&ts.isVariableDeclaration(current.parent)&&ts.isIdentifier(current.parent.name))return current.parent.name.text;if(ts.isMethodDeclaration(current)&&current.name)return current.name.getText(source);}return"module";}
function add(path,source,node,tag,job,anchor=namedScope(source,node)){const p=source.getLineAndCharacterOfPosition(node.getStart(source));jobs.push({path:relative(".",path),line:p.line+1,anchor,tag,...job});}
for(const path of files.filter((p)=>[".ts",".tsx"].includes(extname(p)))){
	const raw=readFileSync(path,"utf8"),source=ts.createSourceFile(path,raw,ts.ScriptTarget.Latest,true,extname(path)===".tsx"?ts.ScriptKind.TSX:ts.ScriptKind.TS);currentSource=source;consts=new Map();helpers=new Map();resolvingHelpers=new Set();
	const collect=(n)=>{if(ts.isVariableDeclaration(n)&&ts.isIdentifier(n.name)&&n.initializer)consts.set(n.name.text,n.initializer);if(ts.isFunctionDeclaration(n)&&n.name&&n.body)helpers.set(n.name.text,returnedExpressions(n.body));if(ts.isVariableDeclaration(n)&&ts.isIdentifier(n.name)&&n.initializer&&(ts.isArrowFunction(n.initializer)||ts.isFunctionExpression(n.initializer))){const b=n.initializer.body;helpers.set(n.name.text,ts.isBlock(b)?returnedExpressions(b):[b]);}ts.forEachChild(n,collect);};collect(source);
	const visit=(node)=>{
		if(ts.isJsxOpeningElement(node)||ts.isJsxSelfClosingElement(node)){
			const transition=[],animation=[],states=[];
			for(const attr of node.attributes.properties){if(ts.isJsxSpreadAttribute(attr)){for(const token of strings(attr.expression).flatMap(s=>s.split(/\s+/))){const job=jobToken(token);if(job)(job.kind==="animation"?animation:transition).push(`${job.syntax}:${job.value}`);if(/(?:^|:)(?:hover|active|focus|focus-visible|focus-within|group-hover|data-\[[^\]]+\]|aria-\[[^\]]+\]):/.test(token)&&/(?:opacity|filter|translate|rotate|scale)-/.test(token))states.push(token);}continue;}if(!ts.isJsxAttribute(attr)||!ts.isIdentifier(attr.name))continue;
				if(attr.name.text==="className"){
					const value=attr.initializer&&ts.isJsxExpression(attr.initializer)?attr.initializer.expression:attr.initializer;
					for(const token of strings(value).flatMap((s)=>s.split(/\s+/))){const job=jobToken(token);if(job)(job.kind==="animation"?animation:transition).push(`${job.syntax}:${job.value}`);if(/(?:^|:)(?:hover|active|focus|focus-visible|focus-within|group-hover|data-\[[^\]]+\]|aria-\[[^\]]+\]):/.test(token)&&/(?:opacity|filter|translate|rotate|scale)-/.test(token))states.push(token);}
				}
				if(attr.name.text==="style"&&attr.initializer&&ts.isJsxExpression(attr.initializer)&&attr.initializer.expression&&ts.isObjectLiteralExpression(attr.initializer.expression)){
					const props=new Map();for(const p of attr.initializer.expression.properties)if(ts.isPropertyAssignment(p)){const k=ts.isIdentifier(p.name)||ts.isStringLiteral(p.name)?p.name.text:"";props.set(k,p.initializer.getText(source));}
					transition.push(...["transition","transitionProperty","transitionDuration","transitionTimingFunction"].filter((k)=>props.has(k)).map((k)=>`${k}:${props.get(k)}`));for(const k of ["opacity","filter","transform"])if(props.has(k)&&/[?:]/.test(props.get(k)))states.push(`style:${k}:${props.get(k)}`);
					animation.push(...["animation","animationName","animationDuration","animationTimingFunction"].filter((k)=>props.has(k)).map((k)=>`${k}:${props.get(k)}`));
				}
			}
			if(transition.length)add(path,source,node,node.tagName.getText(source),{kind:"transition",value:[...new Set(transition),...(states.length?[`states:${[...new Set(states)].join(",")}`]:[])].join(" | "),syntax:"jsx"});
			if(animation.length)add(path,source,node,node.tagName.getText(source),{kind:"animation",value:[...new Set(animation)].join(" | "),syntax:"jsx"});
		}
		if(ts.isCallExpression(node)&&ts.isPropertyAccessExpression(node.expression)&&["scrollIntoView","scrollTo","scrollBy"].includes(node.expression.name.text)){
			for(const arg of node.arguments)if(ts.isObjectLiteralExpression(arg))for(const p of arg.properties)if(ts.isPropertyAssignment(p)&&(ts.isIdentifier(p.name)||ts.isStringLiteral(p.name))&&p.name.text==="behavior"&&/smooth/.test(p.initializer.getText(source)))add(path,source,p,"call",{kind:"smooth-scroll",value:p.initializer.getText(source),syntax:node.expression.name.text});
		}
		ts.forEachChild(node,visit);
	};visit(source);
}
// Production .ts may export authored class strings without JSX (for example clickable.ts).
for(const path of files.filter((p)=>extname(p)===".ts")){
	const raw=readFileSync(path,"utf8"),source=ts.createSourceFile(path,raw,ts.ScriptTarget.Latest,true,ts.ScriptKind.TS);currentSource=source;consts=new Map();
	const collect=(n)=>{if(ts.isVariableDeclaration(n)&&ts.isIdentifier(n.name)&&n.initializer)consts.set(n.name.text,n.initializer);ts.forEachChild(n,collect);};collect(source);
	const visit=(node)=>{if(ts.isVariableDeclaration(node)&&node.initializer){const byKind=new Map();for(const token of directStrings(node.initializer).flatMap((s)=>s.split(/\s+/))){const job=jobToken(token);if(job){const parts=byKind.get(job.kind)??[];parts.push(`${job.syntax}:${job.value}`);byKind.set(job.kind,parts);}}for(const[kind,parts]of byKind)add(path,source,node,`ts:${node.name.getText(source)}`,{kind,value:[...new Set(parts)].join(" | "),syntax:"ts"},`ts:${node.name.getText(source)}`);}ts.forEachChild(node,visit);};visit(source);
}
for(const path of files.filter((p)=>extname(p)===".css")){
	const raw=readFileSync(path,"utf8"),text=raw.replace(/\/\*[\s\S]*?\*\//g,(m)=>"\n".repeat(m.split("\n").length-1));
	const source=ts.createSourceFile(path,text,ts.ScriptTarget.Latest,true,ts.ScriptKind.Unknown);
	for(const block of text.matchAll(/([^{}]+)\{([^{}]*)\}/g)){
		for(const d of block[2].matchAll(/(^|;)\s*((?:transition|animation)(?:-[a-z-]+)?|scroll-behavior)\s*:\s*([^;]+);/g)){
			const kind=d[2]==="scroll-behavior"?"smooth-scroll":d[2].startsWith("animation")?"animation":"transition";
			if(kind==="smooth-scroll"&&!/smooth/.test(d[3]))continue;
			const node={getStart:()=> (block.index??0)+(d.index??0)};
			add(path,source,node,`css:${block[1].trim().replace(/\s+/g," ")}`,{kind,value:`${d[2]}:${d[3].trim()}`,syntax:"css"});
		}
	}
}
if(!jobs.length)throw new Error("motion extraction matched zero jobs");
jobs.sort((a,b)=>a.path.localeCompare(b.path)||a.line-b.line||a.kind.localeCompare(b.kind)||a.value.localeCompare(b.value));
const occurrences=new Map();
for(const j of jobs){const fingerprint=createHash("sha256").update(`${j.kind}|${j.value}|${j.syntax}`).digest("hex").slice(0,12),base=`${j.path}::${j.anchor}::${j.tag}::${j.kind}::${fingerprint}`,n=occurrences.get(base)??0;occurrences.set(base,n+1);j.id=`${base}::${n+1}`;}
if(process.argv.includes("--extract")){console.log("site_id\tpath\tline\tanchor\ttag\tkind\tvalue\tsyntax");for(const j of jobs)console.log([j.id,j.path,j.line,j.anchor,j.tag,j.kind,j.value,j.syntax].join("\t"));process.exit(0);}
const lines=readFileSync(".pipeline/work/AZ16/motion-decisions.tsv","utf8").trimEnd().split("\n");if(lines[0]!=="site_id\tdestination\treason")throw new Error("invalid motion decision header");
const map=new Map();for(const line of lines.slice(1)){const[id,destination,reason]=line.split("\t");if(map.has(id))throw new Error(`duplicate motion decision ${id}`);map.set(id,{destination,reason});}
const valid=new Set(["feedback","move","spring","enter","activity","loading","busy","SNAP","REMOVE"]),ids=new Set(jobs.map((j)=>j.id));
const missing=jobs.filter((j)=>!map.has(j.id)),stale=[...map.keys()].filter((id)=>!ids.has(id)),invalid=[...map.values()].filter((v)=>!valid.has(v.destination));
const fingerprintDestinations=new Map();for(const j of jobs){const fingerprintId=j.id.replace(/::\d+$/,""),destination=map.get(j.id)?.destination,prior=fingerprintDestinations.get(fingerprintId);if(destination&&prior&&prior!==destination)invalid.push({destination:`conflict ${destination}`});if(destination)fingerprintDestinations.set(fingerprintId,destination);}
const report=["site_id\tpath\tline\tproblem",...missing.map(j=>`${j.id}\t${j.path}\t${j.line}\tunmapped source site`),...stale.map(id=>`${id}\t\t\tstale decision`),...invalid.map(v=>`\t\t\tinvalid destination ${v.destination}`)];writeFileSync(".pipeline/work/AZ16/motion-unmapped.tsv",`${report.join("\n")}\n`);
if(missing.length||stale.length||invalid.length)throw new Error(`motion decisions: unmapped=${missing.length}, stale=${stale.length}, invalid=${invalid.length}`);
console.log("site_id\tpath\tline\tanchor\ttag\tkind\tvalue\tsyntax\tdestination\treason");for(const j of jobs){const d=map.get(j.id);console.log([j.id,j.path,j.line,j.anchor,j.tag,j.kind,j.value,j.syntax,d.destination,d.reason].join("\t"));}
