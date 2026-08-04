import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
const root = process.argv[2];
const pkgs = new Map();
(function scan(dir,d){for(const e of readdirSync(dir,{withFileTypes:true})){if(!e.isDirectory()||e.name==="node_modules"||e.name==="dist")continue;const p=join(dir,e.name),pj=join(p,"package.json");
 if(existsSync(pj)){const j=JSON.parse(readFileSync(pj,"utf8"));if(j.name)pkgs.set(j.name,{dir:p.replace(root+"/",""),deps:Object.keys(j.dependencies??{}),dev:Object.keys(j.devDependencies??{})});}
 if(d<2)scan(p,d+1);}})(join(root,"packages"),0);
// root package.json too
const rj=JSON.parse(readFileSync(join(root,"package.json"),"utf8"));
const rootDeps=[...Object.keys(rj.dependencies??{}),...Object.keys(rj.devDependencies??{})];

const dependents = new Map([...pkgs.keys()].map(n=>[n,new Set()]));
for (const [n,p] of pkgs) for (const d of [...p.deps,...p.dev]) if(dependents.has(d)) dependents.get(d).add(n);
for (const d of rootDeps) if(dependents.has(d)) dependents.get(d).add("<repo root package.json>");

// nesting: package B nests under A if B.dir startsWith A.dir + "/"
function nested(name){ const a=pkgs.get(name).dir; return [...pkgs].filter(([n,p])=>n!==name&&p.dir.startsWith(a+"/")).map(([n])=>n); }

console.log("PKG".padEnd(34),"DIRECT DEPENDENTS".padEnd(6),"  NESTED-WITH-DEPENDENTS  => ROOT?");
for (const [n,p] of [...pkgs].sort()) {
  const dd=[...dependents.get(n)];
  const nn=nested(n).filter(x=>dependents.get(x).size>0);
  const isRoot = dd.length===0 && nn.length===0;
  console.log(n.padEnd(34), String(dd.length).padEnd(6), (nn.join(",")||"-").padEnd(60), isRoot?"** ROOT (unscanned) **":"scanned");
}
