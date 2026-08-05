import { MemoryRouter } from "react-router-dom";
import { Empty, WithContextRefs } from "../../../../../../layers/web/src/shell/AssistantOverlay.stories.js";
export default { title: "AU20 Real/Assistant" };
const response={thread:{id:"assistant-1",hostKind:"user",hostId:"user-1",initiatorId:"user-1",participants:["user-1","assistant"],pinned:false,resolvedAt:null,lastActiveAt:"2026-07-23T10:00:00Z",createdAt:"2026-07-23T10:00:00Z"},messages:[],identities:{"user-1":{name:"Tobias"},assistant:{name:"Assistant",isAgent:true}}};
function mock(){globalThis.fetch=async()=>new Response(JSON.stringify(response),{status:200,headers:{"Content-Type":"application/json"}})}
export function EmptyState(){mock();return <MemoryRouter><Empty/></MemoryRouter>}
export function ContextState(){mock();return <MemoryRouter><WithContextRefs/></MemoryRouter>}
