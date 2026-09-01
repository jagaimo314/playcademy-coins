# Bakery backend plan

**Status: M0–M2 built, M3–M5 planned.** This is the concrete plan for `server/`, derived from
the frontend described below. It extends — and in a few places pins down — the provisional contract in
[multiplayer-contract.md](multiplayer-contract.md). Where the two disagree, this doc wins and
that one gets amended.

**Amended:** belts advance in discrete slots rather than gliding continuously. The earlier
frame-streaming motion model is superseded throughout — see
[Motion](#motion-discrete-slots-advanced-on-a-beat).

## The frontend it has to serve

A fixed 1200×800 frame, three horizontal bands:

| Band | Contents |
| --- | --- |
| Base (`y 640–800`) | Up to 4 colour-coded player panels — red, blue, green, yellow. Each holds that player's **hand**: a set of coins the kid must sum. |
| Bakery (`y 60–620`) | 1–3 **conveyor belts**, advancing left → right one slot at a time, carrying trays of baked goods. Each tray has a **price** printed at its base. |
| Right edge (`x 1080–1200`) | The **incinerator**. Doors open → food that reaches it is destroyed. Doors closed → food stops and backs up the belt. |

The loop: each player grabs the tray whose price equals the value of their own hand. Correct →
a point, and that player's hand is swapped for a new one. Wrong → the food is wasted. Co-op
mode: `n` players together must serve `5n` items before wasting `5n`.

### What that forces server-side

1. **Belt motion** — one beat for everyone. If each client ran its own belt, two kids would
   see the same tray in different slots and "who grabbed it first" would be unanswerable.
2. **Claiming** — the only contested resource in the game. Must be resolved in one place.
3. **Hand and price generation** — the game has to stay *solvable* (every hand needs a matching
   price to actually arrive) and *fair* (nobody's match can be starved). That is a scheduling
   problem across belts, so it belongs where the belts are.
4. **The two shared counters** — served and wasted. These are the win/lose condition; a client
   must never be able to increment them.

Everything else — layout, art, animation, easing, sound — stays on the client. The server never
learns a pixel: a belt is an ordered array of **slots**, and the server reasons only about which
slot holds which tray. The client maps a slot index into its own geometry. The `u` figures below
are that mapping, quoted for the client's benefit; nothing server-side computes with them.

## Rules the server owns

Pinned numbers so the implementation is unambiguous. All live in `server/src/game/config.js`.

| Rule | Value |
| --- | --- |
| Players per room | 2–4 (`ROOM_FULL` at 4; solo allowed in dev via a bot) |
| Belts | `clamp(ceil(n / 2), 1, 3)`, capped further by difficulty |
| Serve target | `5 × n` |
| Waste limit | `5 × n` |
| Slots per belt | 8, indexed 0 at the oven to 7 at the mouth; pitch `0.1 u` (120px) |
| Belt advance interval | easy 3000ms, medium 2000ms, hard 1300ms per slot (≈21s / 14s / 9s end to end) |
| Incinerator mouth | slot 7 |
| Hop duration | 260ms of each interval, client-side only; the tray rests for the remainder |
| Wrong-grab cooldown | 1500ms, that player only |
| Claimable slots | any of 0–7, item state `traveling` |
| Panel colours | red, blue, green, yellow — handed out in that order |

One tray per slot, so the old minimum-gap rule is now structural rather than enforced.

**Why the pitch is 120px and not the 160 an earlier draft carried.** Eight slots at 160 span
1280px, which overruns the 1200 frame and swallows the incinerator whole. The slot *count* is
load-bearing — the end-to-end times above are seven advances × the interval — so the pitch is
what gives. At 120 a belt spans 960px and sits at `x 60–1020`, leaving 60px of margin at the
oven end and a 60px run-up to the incinerator at 1080. The edges breathe, and a tray at the
mouth reads as *approaching* the fire rather than already in it.

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
  order at the top of the tick. With stepped belts this rate no longer buys motion smoothness —
  it is purely the resolution at which two claims can be told apart, plus the granularity of
  cooldowns and door timers.
- **Advance belts on their own beat**, not on the tick. Each belt carries an accumulator; when it
  crosses its interval the belt steps once and broadcasts. Between beats there is nothing to say.
- **Emit discrete events immediately** (`item/spawned`, `item/resolved`, `hand/dealt`,
  `score/patch`) rather than making the client diff frames to notice a tray vanished.
- **Phases:** `lobby → playing → ended`, plus `paused` when every player is disconnected —
  freezing beats burning the belts down while a kid's wifi drops.

### Motion: discrete slots, advanced on a beat

A belt is an ordered array of **8 slots**, indexed `0` at the oven end to `7` at the incinerator
mouth, and a slot holds at most one tray. Trays do not glide. On each **advance beat** every tray
moves forward exactly one slot, or holds if the slot ahead is occupied. Between beats nothing
moves.

Server-side the move is instantaneous — one array shift per belt per beat. The visible hop is
client-side decoration, played over `HOP_MS` (260ms) at the top of the beat, after which the tray
sits still for the remaining ~1–2.7s. **That resting period is the point.** A second grader aiming
at a stationary tray is aiming at a target rather than leading a moving one, and "which tray did
you tap" has an unambiguous answer at every moment.

This is why the earlier continuous design is gone. Streaming 10 Hz frames of authoritative `u` and
extrapolating client-side existed to reconcile smooth motion against a jam's per-item history of
stalls. With slots there is nothing to reconcile: a tray is in a slot or it is not, the client is
told which, and no position is ever predicted. The interpolation buffer, the
snap-if-off-by-more-than-a-tray-width rule and the easing all go away with it.

Cost: one `belt/advanced` per belt per beat — eight ids and a jam flag, ≈200B — at most one beat
per 1300ms. Under 500B/s for a full room against roughly 44KB/s for the continuous design. The
frame-trimming fallback (integer `u`, positional arrays) is not needed at all.

**Beats are per belt and staggered**, by a phase offset of `interval × beltIndex / beltCount`, so
three belts never lurch in unison. One synchronised lurch across the whole bakery reads as a
stutter in the page rather than as machinery.

**Claims address an `itemId`, not a slot**, so the claim wire format is untouched by any of this,
and a claim sent mid-hop still resolves against occupancy the server settled at the beat.

**Clock sync** survives, but only for lag-compensated claims — not for rendering, which no longer
predicts anything. A `time/sync` round trip on connect and every 10s, keeping the minimum-RTT
sample of the last five to estimate offset.

### Jams

Occupancy *is* the jam rule; there is no separate cap to compute.

```
canAdvance(i)          = slots[i + 1] === null    // i < MOUTH_SLOT
canAdvance(MOUTH_SLOT) = doorsOpen                // the mouth empties into the fire
```

**Resolve each belt from the mouth backwards** (slot 7 first, then 6, 5, …). Iterating from the
oven end instead lets the loop catch up with a tray it has already moved and walk it several slots
in one beat — the conveyor equivalent of reading your own writes.

Doors closed → the lead tray holds at slot 7 and the rest stack up behind it, one per beat. When
slot 0 is still occupied at the next beat the belt is full: spawning is suppressed and
`belt/jammed` goes out so the client can show the oven backing up. Nothing is wasted — throughput
just dies, which is the intended easy-mode pressure.

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
| `item/spawned` | `{ beltId, item }` | Spawns land in slot 0 on a beat, so this rides alongside that belt's `belt/advanced`. |
| `belt/advanced` | `{ t, beltId, slots: [itemId \| null], jammed }` | One per belt per beat. Full occupancy rather than a diff — eight entries cost less than reconciling a patch, and a dropped message self-heals on the next beat. |
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
| Tab backgrounded | Hop animations stall and `belt/advanced` messages queue. On resume the client applies only the newest occupancy per belt and snaps trays into place. No catch-up hops. |
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

`CLAUDE.md` says there is no test runner in this repo. That is true of the *frontend*, and it
stays true: `node:test` belongs to `server/`, is declared in `server/package.json`, runs with
`npm test` from inside `server/`, and reaches nothing above it. The frontend's verification is
unchanged — a clean `npm run build` and the manual pages reporting zero failures.

## Milestones

Split by side, because the client half is much smaller than it once was. The belt, the tray and
the wallet already exist, so M1's client work is the hop and the mirror rather than three
components from scratch — and the incinerator, the one component still missing, correctly lands
at M3 with the doors it exists to show.

| # | Server | Client | Done when |
| --- | --- | --- | --- |
| **M0** | ws bootstrap, room registry, codes, host/join, `player/ready`, `colorSlot` assignment, `resumeToken` issued | `net/ws-room-adapter.js` behind the existing `net/index.js` swap; the lobby sends ready and start | Two browsers reach the same lobby over a real socket, and the fake adapter still drives the same view. |
| **M1** | `config.js`, `state.js`, seeded `rng.js`, pure `step()`, `belts.js` motion with staggered beats, one belt, spawn into slot 0 | The hop; the id→tray mirror; the belt mounted in the frame at the settled pitch | A tray hops down one belt in two browsers in lockstep. No claiming. |
| **M2** | `dealer.js` — hands, prices, decoys drawn from the lesson's taxonomy, `pendingMatchItemId`; `claims.js`; served/wasted; win and loss | Wallets wired to `hand/dealt`; claim on tap with the optimistic reach and rollback; score and end states | **The game is playable.** The hand's value has still never left the server. |
| **M3** | Doors, jams, `wasteOnExit`, the difficulty table, 2–3 belts, player-count scaling | The incinerator component; the jam affordance at the oven | The three difficulties play differently. |
| **M4** | Disconnect grace, host migration, `paused`, rate limits, `time/sync` | Reconnect from `sessionStorage`; the backgrounded-tab snap — newest occupancy per belt, no catch-up hops | Pull the wifi mid-game and come back to the same hand. |
| **M5** | `bot.js`, deterministic replay from `(seed, intents[])` | — | The game demos solo, and the protocol diagram is drawn for `MULTIPLAYER.pdf`. |

M0–M2 is the part that has to work. M3 onward is difficulty and durability.

**What M2 runs with, pending M3.** One belt, doors pinned open, `wasteOnExit: 'matched'`. The
occupancy rule in `belts.js` is written in full — `canAdvance(MOUTH_SLOT) = doorsOpen` — so
closing the doors at M3 produces jams with no change to the motion code. Until then the mouth
always empties and a belt cannot back up, which is why the jam affordance is M3's client work
and not M1's.

## Frontend seams this assumes

An earlier draft put these view-local under `views/bakery/game/`. **They live in
`src/components/` instead**, built as independent components against their own test pages
before any server existed — `components/CLAUDE.md` carries the reasoning for the exception to
the two-views bar. Three of the four are already done:

| Seam | State |
| --- | --- |
| `components/conveyor-belt/` | **Built.** Slots, `setSlotItems()` taking a whole occupancy, `slotCenter()`, and the detach-not-destroy seam a claimed tray needs. Written to this plan's model already: nothing interpolates a position, because the belt is *told* the occupancy. |
| `components/conveyor-item/` | **Built.** Price plate, pointer and keyboard activation, `update({ price, selected })` that re-prices without replacing the node. |
| `components/player-wallet/` | **Built.** `colorSlot` colours, coin ids in, and the hand's value never shown, summed, or put in the accessible name. |
| incinerator | **M3.** The only component this build still needs, and M3 is where doors and exit waste first mean anything. It talks to a belt in belt coordinates through `slotCenter()`. |

What is left is composition, and it lives in `views/bakery/game/`:

- **The hop**, played on each `belt/advanced`. `conveyor-belt` owns slot geometry, so it owns
  the animation too — `setSlotItems(next, { animate: true })`. Await it with
  `animationSettled()` from `lib/dom.js`, never `animation.finished` — a backgrounded tab never
  settles the latter and the belt would deadlock. There is no interpolation buffer and no
  prediction; the client is told the occupancy and animates to it.
- **The id→tray mirror.** `belt/advanced` carries `itemId`s; `setSlotItems()` takes tray
  *instances*. Something has to hold the map between them, and that something is also what owns
  a claimed tray for the rest of its flight once the belt has detached it. It is a local mirror,
  deliberately not the store: this state is ephemeral and server-owned, and nothing outside the
  Bakery may read it.
- **Claim on click/tap of a tray**, with the optimistic reach animation and rollback above.
- `net/ws-room-adapter.js`, implementing the existing adapter interface plus `time/sync`.

## Open questions

- Should a wrong grab cost both a waste *and* a cooldown, or is the cooldown enough? Two levers
  on one mistake may be harsh even for a second grader. Tunable; needs a kid in front of it.
- Is 260ms the right hop, and should a tray be claimable *during* it? Claims address an `itemId`,
  so a mid-hop claim already resolves correctly — but a tray that can be tapped while sliding
  hands back some of the aiming problem the stepped belt exists to remove.
- Can a player grab the tray reserved as another player's match? Currently yes — it is co-op,
  and the dealer re-schedules. The alternative (reserved trays dimmed for everyone else) is
  friendlier but leaks information about other players' hands.
- Do prices ever exceed 99¢? Currently no, matching the lesson's scope. `formatMoney` already
  handles dollars if that changes.
- Is `wasteOnExit: 'matched'` legible to a kid, or does food falling into the fire need to
  always look like a loss?
