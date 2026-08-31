# Bakery backend plan

**Status: proposed.** This is the concrete plan for `server/`, derived from the frontend
described below. It extends — and in a few places pins down — the provisional contract in
[multiplayer-contract.md](multiplayer-contract.md). Where the two disagree, this doc wins and
that one gets amended.

## The frontend it has to serve

A fixed 1200×800 frame, three horizontal bands:

| Band | Contents |
| --- | --- |
| Base (`y 640–800`) | Up to 4 colour-coded player panels — red, blue, green, yellow. Each holds that player's **hand**: a set of coins the kid must sum. |
| Bakery (`y 60–620`) | 1–3 **conveyor belts**, moving left → right, carrying trays of baked goods. Each tray has a **price** printed at its base. |
| Right edge (`x 1080–1200`) | The **incinerator**. Doors open → food that reaches it is destroyed. Doors closed → food stops and backs up the belt. |

The loop: each player grabs the tray whose price equals the value of their own hand. Correct →
a point, and that player's hand is swapped for a new one. Wrong → the food is wasted. Co-op
mode: `n` players together must serve `5n` items before wasting `5n`.

### What that forces server-side

1. **Belt motion** — one clock for everyone. If each client ran its own belt, two kids would
   see the same tray in different places and "who grabbed it first" would be unanswerable.
2. **Claiming** — the only contested resource in the game. Must be resolved in one place.
3. **Hand and price generation** — the game has to stay *solvable* (every hand needs a matching
   price to actually arrive) and *fair* (nobody's match can be starved). That is a scheduling
   problem across belts, so it belongs where the belts are.
4. **The two shared counters** — served and wasted. These are the win/lose condition; a client
   must never be able to increment them.

Everything else — layout, art, animation, easing, sound — stays on the client. The server never
learns a pixel: it works in **normalized lane space**, `u ∈ [0,1]` along a belt, and the client
maps `u` to its own geometry.

## Rules the server owns

Pinned numbers so the implementation is unambiguous. All live in `server/src/game/config.js`.

| Rule | Value |
| --- | --- |
| Players per room | 2–4 (`ROOM_FULL` at 4; solo allowed in dev via a bot) |
| Belts | `clamp(ceil(n / 2), 1, 3)`, capped further by difficulty |
| Serve target | `5 × n` |
| Waste limit | `5 × n` |
| Tray travel time | easy 22s, medium 15s, hard 10s across the lane |
| Minimum tray gap | `0.14 u` (≈140px) |
| Incinerator mouth | `u = 0.94` |
| Wrong-grab cooldown | 1500ms, that player only |
| Claimable band | `0.02 ≤ u ≤ 0.94`, item state `traveling` |

**Hand values.** Easy: 5–25¢, all one denomination — exactly the KC the lesson teaches.
Medium: mixed, ≤ 50¢. Hard: mixed, ≤ 99¢. Hands are dealt **distinct-valued** across active
players wherever the pool allows, so a tray is normally unambiguous.

**Wrong grab.** The tray is wasted, the player keeps their hand, and that player is on cooldown
for 1500ms. The cooldown is load-bearing: without it, grabbing every tray until one sticks is
the optimal strategy, and wasted is a *shared* budget — one kid brute-forcing would end the
game for everyone.

**Exit waste.** A tray reaching an open incinerator counts as waste **only if its price matched
a live hand** — food somebody could have bought. Decoys falling in are free. Configurable per
difficulty as `wasteOnExit: 'none' | 'matched' | 'all'`; without this the waste counter is a
stopwatch rather than a measure of error.

**Doors.** Easy: closed — nothing is ever wasted at the exit, and the pressure comes from the
jam. Medium: cycling, open 8s / closed 8s. Hard: open.

## Stack

- **Node 22 + [`ws`](https://github.com/websockets/ws), one process, rooms in memory.** Rooms
  are ephemeral by contract; there is nothing to persist, so no database and no Redis.
- **Raw WebSocket, not a hosted realtime service.** The interesting part of this build is the
  authoritative simulation. A hosted service hands us presence and fan-out but we would still
  write the tick loop, and we would lose the ability to explain the whole path in a walkthrough.
- **One origin in production.** The same process serves the built `dist/` and upgrades `/ws`.
  One hosted URL for the brief, no CORS, no split deploy. In dev, Vite stays on `:5173` and the
  client reads `import.meta.env.VITE_WS_URL` (default `ws://localhost:8787/ws`).
- **`server/package.json` is its own**, so the frontend build stays independent, as
  [architecture.md](architecture.md) requires.
- **Coin maths is shared, not duplicated.** The server imports `../src/lib/money.js` directly.
  `lib/` is pure and DOM-free by the dependency rule, so this works in Node with no shim, and
  `sumTally` means the same thing on both sides of the wire. Duplicating denomination values
  across a client and a server is how you ship a game that disagrees with itself.

## Layout

```
server/
├─ package.json
├─ src/
│  ├─ index.js                # http server + ws upgrade; serves dist/ in prod
│  ├─ transport/
│  │  ├─ socket.js            # envelope encode/decode, heartbeat, per-player rate limit
│  │  └─ session.js           # playerId, resume token, disconnect grace timer
│  ├─ rooms/
│  │  ├─ registry.js          # code → room, uniqueness, empty-room GC
│  │  └─ room.js              # phases, membership, broadcast, host migration, tick driver
│  └─ game/
│     ├─ config.js            # the difficulty table above
│     ├─ state.js             # createGame(), state shapes
│     ├─ step.js              # PURE: (state, dtMs, intents) → { state, events }
│     ├─ belts.js             # motion, jams, exits
│     ├─ claims.js            # claim resolution
│     ├─ dealer.js            # hands, prices, decoys, guaranteed-match scheduling
│     └─ rng.js               # seeded mulberry32
└─ test/
```

**`step()` is pure, and the only place game rules live.**

```js
step(state, dtMs, intents) // → { state, events }
```

No timers, no sockets, no `Date.now()`, no `Math.random()` — time arrives as `dtMs`, chance
arrives from a seeded RNG carried in `state`. `room.js` is the only thing that owns a real
interval and a real socket. This buys three things: the rules are unit-testable with no
network, a whole game replays deterministically from `(seed, intents[])`, and the walkthrough
has exactly one file to read.

## The loop

- **Simulate at 20 Hz** (50ms). Intents that arrived since the last tick are applied in arrival
  order at the top of the tick.
- **Broadcast belt frames at 10 Hz.** Positions are cheap to interpolate and expensive to spam.
- **Emit discrete events immediately** (`item/spawned`, `item/resolved`, `hand/dealt`,
  `score/patch`) rather than making the client diff frames to notice a tray vanished.
- **Phases:** `lobby → playing → ended`, plus `paused` when every player is disconnected —
  freezing beats burning the belts down while a kid's wifi drops.

### Motion: authoritative frames plus client extrapolation

The tempting design is pure kinematics — send `{ spawnAtMs, speed }` once and let clients
compute `u` from the clock forever. It falls apart the moment the incinerator doors close: a jam
is a per-item history of stalls, and a claim in the middle of a jam re-shuffles everything
behind it. Reconstructing that client-side is more machinery than it saves.

So: **the server sends 10 Hz frames of authoritative `u`, and the client extrapolates from the
last two frames** at whatever framerate it renders. Snap on any frame that disagrees with the
prediction by more than a tray width; otherwise ease toward truth.

Cost: 3 belts × ~8 trays × ~45B of JSON ≈ 1.1KB per frame, ~11KB/s per client, ~44KB/s for a
full room. Fine. If it needs trimming, the frame goes to positional arrays with `u` as an
integer 0–1000 and drops roughly 4×.

**Clock sync** for extrapolation and for lag-compensated claims: a `time/sync` round trip on
connect and every 10s, keeping the minimum-RTT sample of the last five to estimate offset.

### Jams

Each tray has a cap on how far it may travel:

```
capU(i) = MOUTH_U - i * (TRAY_U + GAP_U)     // i = index in the blocked queue
u       = min(freeFlowU, capU(i))
```

Doors closed → the lead tray stops at the mouth and the rest stack behind it. When the queue
reaches the spawn point the belt is full: spawning is suppressed and `belt/jammed` goes out so
the client can show the oven backing up. Nothing is wasted — throughput just dies, which is the
intended easy-mode pressure.

### Claiming

Item state machine, server-side only:

```
traveling → claiming(playerId) → served | wasted → removed
```

`claiming` exists for one tick so the resolution is explicit and the client can start its reach
animation without owning the outcome.

Resolution, in order:

1. Item exists and is `traveling` inside the claimable band, else `ITEM_GONE`.
2. Player is not on cooldown, else `CLAIM_COOLDOWN`.
3. `item.price === handValue(player)` → `served++`, `player.score++`, deal a new hand.
4. Otherwise → `wasted++`, cooldown starts, hand unchanged.
5. Either way the item is removed and `item/resolved` is broadcast.

**Simultaneity.** Two players grabbing the same tray are resolved by server arrival order; the
first valid claim wins and the loser gets `ITEM_GONE`. Ties inside one tick break by `playerId`
— deterministic, never client-decided. A more generous option exists (a one-tick claim window
resolved by earliest client timestamp, clamped to RTT/2) and is worth a paragraph in
`MULTIPLAYER.pdf`, but arrival order is the honest default: it is explainable to a 7-year-old
and cannot be gamed by lying about your clock.

**Optimistic UI is allowed; optimistic scoring is not.** The client may animate the reach on
send, but the plate, the counters, and the hand only move on `item/resolved`. A rejected claim
rolls the tray back to the server's `u`.

## Content generation

This is the part that decides whether the game is fun, and the strongest reason spawning is
server-side.

**Solvability guarantee.** Every live hand holds a `pendingMatchItemId`. When a hand is dealt,
the dealer reserves the next available spawn slot within `matchWindowMs` (12s) for a tray at
exactly that price. If that tray is wasted, claimed by someone else, or falls into the
incinerator, the match is re-scheduled immediately. A kid can therefore never be stuck holding
35¢ while the belt refuses to produce a 35¢ tray — the failure mode that would make the whole
game feel broken.

**Decoys** fill the remaining slots, drawn from the error taxonomy the lesson already classifies
(`src/views/lesson/diagnostics.js`): `v ± 1` and `v ± 5` (off-by-one-coin), `v` with digits
transposed (transposed-digits), the *count* of coins in the hand (counted-coins-not-value), and
`v` re-counted with the wrong step (wrong-denomination-value). The game then produces the same
diagnostic signal as the lesson, for free — a wrong grab is a *classified* wrong grab, not just
a wasted muffin.

**The hand's value is never sent to any client — not even to its owner.** `hand/dealt` carries
coin ids only (`['dime', 'dime', 'nickel']`); the sum lives on the server. Sending it would put
the answer in devtools, and the sum *is* the exercise. Prices are the opposite: they are printed
on the tray, so they go over the wire in the clear.

**Seeded RNG.** One `mulberry32` stream per game, seed carried in `room/state`. Same seed plus
same intents replays the same game — which is how "that spawn looked unfair" becomes a test.

## Wire protocol

Same envelope as the existing contract: `{ type, payload }`, types namespaced with `/`.
Additions on top of that table:

### Client → server

| Type | Payload | Notes |
| --- | --- | --- |
| `room/host` | `{ playerName }` | First message on a fresh socket; resolves the adapter's `host()`. |
| `room/join` | `{ code, playerName, resumeToken? }` | With a token, rebinds an existing slot instead of creating one. |
| `player/ready` | `{ ready }` | |
| `game/start` | `{ difficulty }` | Host only, else `NOT_HOST`. |
| `action/claim` | `{ itemId, atClientMs }` | The only in-game intent. Rate-limited to 10/s. |
| `time/sync` | `{ t0 }` | |

### Server → client

| Type | Payload | Notes |
| --- | --- | --- |
| `room/joined` | `{ code, playerId, resumeToken, colorSlot }` | `colorSlot` is `red\|blue\|green\|yellow` — the server assigns panels so two kids never share a colour. |
| `room/state` | `{ code, phase, players, config, game }` | Full snapshot: on join, on reconnect, on request. |
| `player/connection` | `{ playerId, connected }` | A dropped player greys out; their slot and hand survive. |
| `game/started` | `{ config, game }` | |
| `item/spawned` | `{ beltId, item }` | |
| `belt/frame` | `{ t, belts: [{ id, items: [{ id, u, price, state }] }], jammed: [beltId] }` | 10 Hz. |
| `item/resolved` | `{ itemId, outcome, byPlayerId?, errorType? }` | `served \| wasted`. |
| `hand/dealt` | `{ playerId, coins: [coinId] }` | No value. Ever. |
| `score/patch` | `{ served, wasted, target, wasteLimit, scores }` | |
| `game/ended` | `{ outcome, results }` | `win \| loss`, plus per-player counts and error types. |
| `error` | `{ code, message }` | Adds `NOT_HOST`, `ITEM_GONE`, `CLAIM_COOLDOWN`, `RATE_LIMITED` to the existing codes. |

Snapshot-plus-patch is unchanged: a client that misses messages asks for `room/state` rather
than replaying history.

## The unglamorous cases

| Case | Behaviour |
| --- | --- |
| Player drops mid-game | Slot kept `connected: false` for a 60s grace. Their hand stays live so the `5n` target does not shift under the others. After the grace the slot is removed and target/limit are recomputed. |
| Host drops | **Host migrates** to the longest-connected remaining player. The host only holds the "start" privilege — the server is authoritative, so the game itself never notices. |
| Reconnect | `resumeToken` in `sessionStorage`; `room/join` with it rebinds the slot and replies with a fresh `room/state`. |
| Everyone drops | Phase → `paused`, sim frozen. Resumes on the first reconnect; the room is GC'd after 30s empty. |
| Bad code | `ROOM_NOT_FOUND` → the kid-readable copy the lobby already renders. |
| Tab backgrounded | `requestAnimationFrame` stalls and frames queue. On resume the client drops everything but the newest frame and snaps. No catch-up animation. |
| Scripted client | The server never trusts a position, a value, or a score. Claims are rate-limited and cooldown-checked. The worst a modified client achieves is grabbing trays it cannot afford — which costs its own team. |

## Testing

- **`node:test` over `step()`** — jams, exit waste, cooldowns, simultaneous claims, the
  solvability guarantee, win and loss. No sockets involved.
- **Property test:** across 1000 seeded games driven by random valid intents, no hand ever goes
  longer than `matchWindowMs` without a matching tray on a belt.
- **A headless bot client** in `server/test/bot.js` — connects over real WS and plays badly.
  Doubles as the way to demo the game solo and as the load check for 4 players × 3 belts.
- **The fake adapter stays.** `fake-room-adapter.js` is not thrown away when the real one lands;
  it keeps the Bakery view buildable offline and testable in CI.

## Milestones

| # | Deliverable |
| --- | --- |
| M0 | `server/` skeleton: ws bootstrap, room registry, codes, lobby at parity with the fake adapter. `ws-room-adapter.js` behind the existing `net/index.js` swap. |
| M1 | One belt end to end: spawn, motion, `belt/frame`, client render with extrapolation. No claiming yet. |
| M2 | Dealer + hands + guaranteed match; claim resolution; served/wasted; win and loss. The game is playable here. |
| M3 | Incinerator doors, jams, difficulty table, 2–3 belts, player-count scaling. |
| M4 | Resilience: reconnect, host migration, pause, rate limits, clock sync. |
| M5 | Bot client, deterministic replay log, protocol diagram for `MULTIPLAYER.pdf`. |

M0–M2 is the part that has to work. M3 onward is difficulty and durability.

## Frontend seams this assumes

All client-side, and all needed before M1 pays off:

- `views/bakery/game/` — belt, tray, hand panel, incinerator components. View-local, not
  shared, per the dependency rule.
- A **render loop decoupled from the network**: an interpolation buffer holding the last two
  `belt/frame`s, sampled by `requestAnimationFrame`.
- A **local mirror** of game state in the view — not the store, since it is ephemeral and
  server-owned — updated by events.
- **Claim on click/tap of a tray**, with the optimistic reach animation and rollback above.
- `net/ws-room-adapter.js`, implementing the existing adapter interface plus `time/sync`.

## Open questions

- Should a wrong grab cost both a waste *and* a cooldown, or is the cooldown enough? Two levers
  on one mistake may be harsh for K–2. Tunable; needs a kid in front of it.
- Can a player grab the tray reserved as another player's match? Currently yes — it is co-op,
  and the dealer re-schedules. The alternative (reserved trays dimmed for everyone else) is
  friendlier but leaks information about other players' hands.
- Do prices ever exceed 99¢? Currently no, matching the lesson's scope. `formatMoney` already
  handles dollars if that changes.
- Is `wasteOnExit: 'matched'` legible to a kid, or does food falling into the fire need to
  always look like a loss?
