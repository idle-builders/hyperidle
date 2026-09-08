# BA15 — Usage is read from the harness's own files, never from inside a session

## What we need

Token usage and tool calls are not supposed to be collected from inside the session; they can be collected statically from the files the harness writes, the way https://github.com/getagentseal/codeburn does — it works without ever having to open a session. Delete the complete in-session token count and tool usage collection, which by its own definition is garbage and needs to be completely redone, and rebuild it as static collection from those files.
