# Coin Sums

Teaching K–2 kids to count coins, then letting them practise together in a multiplayer bake sale.
Built for the Playcademy take-home: a knowledge graph, one lesson taken from it, and a multiplayer
game that unlocks when the lesson is finished.

**Play it:** https://playcademy-coins.onrender.com/

It is on a free instance, so the first load can take up to a minute while the server wakes up.

## Playing the bake sale on your own

The game needs at least two players. One person can still see all of it from a single machine:

1. Finish the lesson, or press **Dev: mark lesson complete** in the lesson's toolbar. That button is
   left in on purpose so the game can be reached without sitting through the whole lesson first.
2. Go to the Bake Sale. The lobby shows a four-letter code.
3. Open a **second tab** at the same URL, type the code under "Got a friend's code?", and join.
4. Press **I am ready** in both tabs, then **Start** in the first one.

Two tabs in the same browser is fine — joining by code is deliberately ungated, so only the host
needs the lesson finished.

The lesson is narrated through the browser's own speech synthesis. It needs no key and no network,
and every spoken line is also captioned, so the lesson works with the sound off or on a browser with
no voice installed.

## The three parts

| Part | Where |
| --- | --- |
| The knowledge graph | `docs/coin-sums-knowledge-graph.html`, linked from the menu |
| The lesson | `#/lesson` — narrated instruction, guided practice, then ten problems |
| The multiplayer game | `#/bakery` — hosting is gated on finishing the lesson |

## Running it locally

```bash
npm install
npm run dev                      # frontend on :5173
```

```bash
npm --prefix server install
npm --prefix server start        # backend on :8787
```

The dev server proxies `/ws` to the backend, so the client asks for the socket on its own origin in
development exactly as it does in production. Without the backend running the lobby simply reports
that it is still connecting.

To run it the way it is deployed — one process serving both the page and the socket:

```bash
npm run build
npm --prefix server start        # the whole game at http://localhost:8787
```

`npm --prefix server run start:solo` allows a room of one, which is useful for driving a belt by
hand.

## Tests

```bash
npm --prefix server test         # 54 tests, 10 suites, no sockets opened
```

The game rules are a pure function, so the backend is tested without a network. The frontend has no
test runner; each hard component has a manual page instead, opened directly in dev:

| Page | Covers |
| --- | --- |
| `/src/components/test/coins.html` | Every denomination on every face, plus a live flip |
| `/src/components/test/skipCountGrid.html` | All three grids, plus 24 self-checks |
| `/src/components/test/conveyorBelt.html` | The belt and trays at four widths, plus 23 self-checks |
| `/src/components/test/goods.html` | Every good on its tray, a framed lane, plus 17 self-checks |
| `/src/components/test/playerWallet.html` | Four hands on sliders — no coin may leave its box |

## Layout

```
src/
├─ main.js router.js routes.js   boot, hash router, route table and guards
├─ views/                        one folder per screen — home, lesson, bakery
├─ components/                   shared UI — coin, belt, tray, wallet, duct, meter
├─ assets/                       the only raster art: coin faces and baked goods
├─ state/                        observable store + versioned localStorage
├─ lib/                          pure functions, no DOM
└─ styles/                       tokens.css, base.css
server/                          the authoritative backend — rules, rooms, transport
docs/                            the write-ups and the design record
```

Imports flow one way: `views → components → lib`, with `state` reachable from views only.

## Write-ups

| Document | Covers |
| --- | --- |
| `docs/LEARNING.pdf` | The knowledge graph, the KC breakdowns, the lesson flow and the diagnosis |
| `docs/FRONTEND.pdf` | Components, asset generation, the bake sale art direction, gamification |
| `docs/MULTIPLAYER.pdf` | The authoritative server, rooms, the belt, and the dealer |

`docs/` also holds the design record the build was written against: `overview.md`,
`architecture.md`, `multiplayer-contract.md` and `bakery-backend-plan.md`, plus the original brief
in `take-home.html`.
