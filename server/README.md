# server/

The authoritative multiplayer backend for the Bakery. Built to
[`docs/bakery-backend-plan.md`](../docs/bakery-backend-plan.md) — read that first; it is the
design record and this is the code.

**M0–M2 are built.** The lobby, the belt, the dealer and claim resolution all work end to
end, and the game is playable two-up in two browsers. M3 (doors, jams, the difficulty table,
2–3 belts, the incinerator), M4 (reconnect grace, pause) and M5 (the bot client) are not.
The milestone table in the plan says what is where.

```bash
npm --prefix server install
```

```bash
npm --prefix server test
```

```bash
npm --prefix server start
```

`start` serves the built `dist/` and upgrades `/ws` on the same origin, so
`npm run build` at the repo root and then `http://localhost:8787` is the whole game with no
Vite involved. Against the Vite dev server on `:5173`, point the client at the backend with
`VITE_WS_URL=ws://localhost:8787/ws` instead.

`npm --prefix server run start:solo` allows a room of one. The game is co-operative and
`5n` with `n = 1` is not really the game, so it is off by default — but it is the only way to
drive a belt by hand until the bot client lands at M5.

## What is where

| Path | Holds |
| --- | --- |
| `src/index.js` | The process: HTTP, the `/ws` upgrade, static `dist/`. |
| `src/transport/` | Envelope encode/decode, heartbeat, per-player rate limit, ids and resume tokens. |
| `src/rooms/` | Code issuing and room GC; membership, phases, host migration, and the tick driver. |
| `src/game/` | The rules. `step.js` is pure and is the only place they live. |
| `test/` | `node:test`, over `step()` and over `room.js`. No sockets are opened. |

**`step(state, dtMs, intents)` is pure.** No timers, no sockets, no `Date.now()`, no
`Math.random()` — time arrives as `dtMs`, chance from the seed carried in state. `room.js` is
the only file with a real interval and a real socket. That is what makes the rules testable
with no network and a whole game replayable from `(seed, intents[])`.

**Coin maths is imported, not copied.** `src/lib/money.js` and the error taxonomy in
`src/views/lesson/diagnostics.js` are pure and DOM-free, so they run here unchanged. A server
that kept its own idea of what a dime is worth is a server that will eventually disagree with
the client in front of a child.

## The test runner

The root `CLAUDE.md` says this repo has no test runner. That is true of the *frontend* and
stays true. `node:test` belongs to this folder, is declared in `server/package.json`, and
reaches nothing above it — the frontend is still verified by a clean `npm run build` and the
manual component pages reporting zero failures.
