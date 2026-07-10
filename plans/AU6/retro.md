# AU6 Retro

AU6 was initially under-scoped: the first pass introduced a facade but left production-shaped code resolving and naming local request consumers. A source-kind test was not enough proof for the acceptance criterion "every LLM-capable path enters via the agent-layer boundary."

The fix was to add the static guard first, watch it fail on the known blockers, then move server app-runtime and decomposition execution to `executeAgentRunRequest`. Legacy Fabric copies are no longer public production consumers; compatibility tests inject an explicit boundary-shaped executor instead of relying on the global consumer registry.

Retained registry definitions are now test compatibility only. Production bootstrap does not register `setProvisionSessionFn`, `setAgentSessionRequestConsumerFn`, or a request creator hook, and the AU6 lint guard proves no production code outside the registry definitions uses those execution hooks.
