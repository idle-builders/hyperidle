# Huddles — build plan

Architecture pass, 2026-10-31, checked against main `dd9efe7b5`. Goes with
[concept.md](concept.md). Pieces 1-2 (speech/record) are on main; pieces 3 and 4
are on branch `feat/T-dyh78h-huddle-call`; piece 5 (agents) is not yet built.

## Two foundations that do not exist yet

1. **People are not told apart on a shared server.** One team key, and every
   caller becomes the first human row (`layers/core-api/src/middleware/auth.ts:46-52`,
   `docs/architecture/security.md` "Trust mode"). Two people on one server are
   the same user. A call between people needs each person to be themselves: who
   to send call setup to, and whose name goes on each spoken message. This is
   **BA7 "Several people sign in to one shared backend"** — registered, not
   refined, open question "who can see what across teams".
2. **A shared server runs no agents.** The worker link exists on the server
   (`/ws/worker`), but no app runs the client (`RemoteWorkerClient` is built only
   in tests; `docs/deployment/index.md` "Where agents run"). Agents on a call
   need it. Not registered anywhere.

The laptop app has one person, so it can never have a huddle. The **record
button and the speech-to-text under it need neither foundation** and work on the
laptop app today.

## Pieces, in dependency order

### 1. Speech-to-text on the Mac — needs nothing

- **Helper:** a small Swift program, `applications/desktop/native/speech/`.
  Apple's `SFSpeechRecognizer` with on-device recognition required. Reads raw
  16 kHz mono 16-bit audio on stdin; writes one JSON line per result on stdout:
  `{"kind":"partial"|"final","text":string}` or `{"kind":"error","message":string}`.
  About 2 seconds of silence ends an utterance → `final`.
- **Built only on a Mac** (`swiftc` in `__scripts__/build-local.sh` and
  `release.sh`), placed in `extraResources` as `speech-helper`, signed with
  hardened runtime. `bundle.ts` stays untouched, so the Linux CI `verify` is
  unaffected. Dev runs find it at a repo path, like plugins (`main.ts:359-364`).
- **Main process:** new `speech.ts` with `registerSpeechHandlers()`, called next
  to `registerCommonIpcHandlers` in both boot paths. `speech:start` /
  `speech:stop` (invoke), `speech:frame` (send, no reply), results pushed back
  on `speech:text` (`webContents.send`). One helper process per start.
- **Preload:** `window.__HYPERIDLE__.speech?: { start(), push(frame), stop(),
  onText(cb) → unsubscribe }`; the raw IPC event never reaches the page. Same
  optional type in `layers/core-ui/src/api.ts`.
- **Mic access:** `com.apple.security.device.audio-input` in
  `build/entitlements.mac.plist`; `mac.extendInfo` with
  `NSMicrophoneUsageDescription` and `NSSpeechRecognitionUsageDescription` in
  `electron-builder.yml`; `session.setPermissionRequestHandler` allowing audio
  `media` for the app's own page.
- **Page side:** `layers/core-ui/src/speech.ts` — given a mic track, an
  AudioWorklet turns it into 16 kHz frames and pushes them. Mic requested with
  echo removal and noise suppression on; a huddle passes in the same cleaned
  track the call sends.
- **Probe first (unverified):** (a) a helper started by the app gets speech
  permission through HyperIdle.app; (b) on-device recognition runs on macOS 15
  with no network; (c) on-device has no one-minute cutoff. If any fails, stop
  and bring whisper.cpp to the founder as the replacement.
- **Not now:** `SpeechAnalyzer` (macOS 26). This Mac's SDK cannot build it; add it
  on evidence that the older recognizer is not good enough.

### 2. Record button — needs 1

- `Composer.tsx`: a record button in `composer-row`, between the format bar and
  Send, shown only when `window.__HYPERIDLE__?.speech` exists (hidden in a
  browser). Press to start, press to stop; each `final` text goes in at the caret
  through the existing `change()` helper. Sending stays manual.
- Proof: the packaged app on this Mac — dictate, see the words in the box, send.

### 3. Huddle in the thread — needs BA7

- **Start** = `send_message {threadId, huddle: {}}`, a new message body (like a
  review card). Stored as message `type: "huddle"`, payload
  `{startedAt, endedAt: null, people: [{id, joinedAt, leftAt}]}`; the starter is
  joined. Refused when: the actor is an agent; the thread has no other human
  member; a huddle is already live there (the app joins it instead).
- **Join / leave** = `adjust_thread {id, message: {id, huddle: "join"|"leave"}}`,
  next to the existing `resolved` / `change` message patches. The last one out
  sets `endedAt`. Joining an ended huddle is refused. Only people join; agents
  never appear in `people`.
- **Folding marks:** every message posted to a thread while its huddle is live
  gets `payload.huddle = <huddle message id>`, set by the server
  (`messageBodyOf` + `plainPayloadSchema`). No input field and no separate
  *spoken* mark — spoken and typed during the call both fold in.
- **Ring:** `subscription-fire` `concerned()` treats a new huddle message as
  concerning every other human member → one inbox row each. The app shows
  "Anna started a huddle — Join" from the existing `user:<id>` push.
- **Dropped connection:** when a person's last websocket closes and they are in a
  live huddle, the server leaves it for them (the hub already knows each socket's
  person; one server process, so in-memory is enough).
- **Fold:** `thread-timeline.ts` gets an entry kind `huddle` = the huddle message
  plus the messages marked with it. `Thread.tsx` shows one line
  "Huddle · Anna, Tom, Builder · 12 min"; open while live and you are on it.
  Follows the existing "Worked 12m · 2 sessions" fold.
- **Button:** Huddle in `thread-head` when another human is a member and the
  desktop bridge is there.

### 4. Live audio — needs 3

- **Call setup messages** ride the existing websocket. New client message
  `{type:"signal", huddleId, to, data}` in `layers/core-api/src/routes/ws.ts`:
  relayed only when sender and `to` are both joined to that live huddle, to the
  `user:<to>` topic as `{type:"signal", from, data}`. `live.ts` gets an
  `onSignal` listener. The server never reads `data`.
- **Audio:** `layers/core-ui/src/huddle-call.ts` — one direct connection per
  other person (WebRTC), the later joiner calls the earlier ones. Public STUN
  (Cloudflare). No relay server until a real call fails.
- **Call strip:** people with a speaking ring (audio level), muted mark, mute,
  leave, mic and speaker pickers; the thread's agents with the existing working
  dot.
- **Writing it down:** the cleaned mic track feeds piece 1; each `final` text is
  posted with `send_message`. Muted = track off and speech stopped.
- **Desktop app only.** A browser needs the shared server on HTTPS (its ingress
  is off by default); not now.

### 5. Agents on the call — needs 4 and an agent-running shared server

- **Spoken names:** before posting, the app turns a member's name said without
  "@" into "@Name" (pure function, table test). The server's mention reading is
  text-only, so this is all it takes.
- **Let the person finish:** the ~2 s pause that ends a spoken message is the
  wait. No server timer.
- **One answer at a time:** a mention while the agent runs in that thread already
  goes into its live run (steering, Claude Code and Codex). While it only waits,
  each mention queues its own turn today. Change the thread-turn key to
  `<threadId>:<agentId>` so a newer waiting turn replaces the older one — the
  newer one already includes the older message. This changes every thread, not
  only huddles.

## How it is proven

- Pieces 1–2: the packaged app on this Mac, recorded as a manual check.
- Pieces 3–5: two packaged desktop apps, two people signed in as themselves, one
  shared server: start, ring, join, hear each other, see words appear and fold,
  name an agent once → one written answer. No CI lane can do audio; recorded
  manual check.
- Logic with its own rule gets unit tests at its home: the fold
  (`thread-timeline.test.ts`), huddle invariants (thread actions), signal relay
  check, name-to-mention.

## Docs this makes false

`docs/objects/thread.md` (huddle message, join/leave patch, fold mark),
`docs/deployment/index.md` (mic and speech permission), the user guide.

## Size

About 1,100 new lines across all five pieces, near the 1,000 bar; each piece is
well under. Pieces 1–2 alone are about 300.
