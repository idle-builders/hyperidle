import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
const root = process.argv[2];
const pkgs = new Map();
(function scan(dir, d){ for (const e of readdirSync(dir,{withFileTypes:true})) { if(!e.isDirectory()||e.name==="node_modules"||e.name==="dist")continue; const p=join(dir,e.name), pj=join(p,"package.json");
 if(existsSync(pj)){const j=JSON.parse(readFileSync(pj,"utf8")); if(j.name)pkgs.set(j.name,{dir:p.replace(root+"/",""),deps:Object.keys(j.dependencies??{}),dev:Object.keys(j.devDependencies??{})});}
 if(d<2)scan(p,d+1);} })(join(root,"packages"),0);
const byDir = new Map([...pkgs].map(([n,p])=>[p.dir,n]));
function tclosure(name, includeDev){ const seen=new Set(), st=[name];
 while(st.length){const n=st.pop(); if(seen.has(n))continue; const p=pkgs.get(n); if(!p)continue; seen.add(n);
  for(const d of p.deps) if(pkgs.has(d)) st.push(d);
  if(includeDev) for(const d of p.dev) if(pkgs.has(d)) st.push(d); }
 seen.delete(name); return seen; }
const owners = process.argv.slice(3);
for (const od of owners) {
  const on = byDir.get(od);
  if(!on){console.log(`?? no package at ${od}`);continue;}
  const c = tclosure(on,false), cd = tclosure(on,true);
  console.log(`\nOWNER ${on} (${od})\n  deps-closure (${c.size}): ${[...c].sort().join(", ")}`);
  const extra=[...cd].filter(x=>!c.has(x));
  if(extra.length) console.log(`  +dev only: ${extra.sort().join(", ")}`);
}
