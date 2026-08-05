import { MemoryRouter } from "react-router-dom";
import { KnowledgeList } from "../../../../../../layers/web/src/pages/KnowledgeList.js";

const items = [
  { id:"k1",topic:"Security",title:"Passkey rollout principles",body:"Preserve active sessions.",format:"markdown",status:"needs_human",version:1,updatedBy:"agent-1",scopeKind:"team",scopeId:"team-1",createdAt:"2026-07-20T10:00:00Z",updatedAt:"2026-07-23T10:00:00Z",signals:{accessCount30d:14,citationCount:3,relevanceScore:.92,attentionScore:87} },
  { id:"k2",topic:"Operations",title:"Incident response handoff",body:"Escalation steps.",format:"markdown",status:"draft",version:1,updatedBy:"user-1",scopeKind:"user",scopeId:"user-1",createdAt:"2026-07-18T10:00:00Z",updatedAt:"2026-07-22T10:00:00Z",signals:null }
];
function Mocked({ mode }:{mode:"populated"|"loading"|"error"}) {
  if (mode === "populated") globalThis.fetch = async (input) => {
    const url=String(input);
    const body=url.includes("/api/auth/me")?{id:"user-1",name:"Tobias",email:"t@example.com",avatarUrl:null,teamId:"team-1"}:{items};
    return new Response(JSON.stringify(body),{status:200,headers:{"Content-Type":"application/json"}});
  };
  return <MemoryRouter>{mode==="loading"?<KnowledgeList loading />:mode==="error"?<KnowledgeList error={{message:"Network request failed",onRetry:()=>{}}}/>:<KnowledgeList />}</MemoryRouter>;
}
export default { title: "AU20 Real/KnowledgeList" };
export function Populated(){return <Mocked mode="populated"/>}
export function Loading(){return <Mocked mode="loading"/>}
export function Error(){return <Mocked mode="error"/>}
