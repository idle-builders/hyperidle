# AU20 feasibility amendment — Cursor probe committed state

Before the format dependency, clean committed HEAD
`3bf55368712dfaf29ff6db883c0f1b67e0479f07` proved the lifecycle defect. The format
dependency is now committed at `ec9f7b39409baadc3b732e269cef7cdcfc51ec32`,
tree `801242ea1aacd30168d7f51c7626665c6c4a5bd1`, with formatted AR2 SHA-256
`40637c22d91d495e1b91d2176200974be65bf89386cd1a8849761d2e1c557e02`.
Targeted behavior remains 71/71; the probe must still exit 2 only because clean
committed scope is rejected.

**Verdict: GO.** Apply the clean/target/self state model to this probe only, retaining
staged and unstaged sets separately and rejecting their intersection so cancellation
cannot masquerade as an accepted scope.
