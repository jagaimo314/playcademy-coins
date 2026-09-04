# Playcademy — Coin Sums

Teaching K–2 kids to count coins, then letting them practise together in a multiplayer
bakery game. Three screens: a menu, a lesson on skip-counting a pile of one denomination,
and the bakery.

Vanilla JS, ES modules, no framework. Vite bundles and serves — it does not change how the
source is written. There are **no runtime dependencies**; adding one needs justifying.

## Commands

```bash
npm install
```

```bash
npm run dev
```

```bash
npm run build
```

`npm run preview` serves the built bundle. Dev runs on `:5173`.

There is **no test runner and no linter** for the frontend. Verification is: a clean
`npm run build`, the grid test page reporting zero failures, and the app driven in a
browser.

`server/` is the exception, and it is a real one: it has its own `package.json`, its own
`node:test` suite, and reaches nothing above itself.

```bash
npm --prefix server test
``` Two manual pages exist for that (not routes — nothing imports them, open them
directly in dev):

| Page | Covers |
| --- | --- |
| `/src/components/test/skipCountGrid.html` | All three grids, plus **24 self-checks that must report 0 failures**. |
| `/src/components/test/coins.html` | Every denomination on every face, plus a live flip. |
| `/src/components/test/conveyorBelt.html` | The Bakery's belt and trays, plus **19 self-checks that must report 0 failures**. |

## Where things are

```
src/
├─ main.js            boot store → start router
├─ router.js          hash router; owns the view lifecycle
├─ routes.js          route table + guards
├─ views/             one folder per screen        → views/CLAUDE.md
├─ components/        shared UI                    → components/CLAUDE.md
│  └─ coin/           the most reused component    → components/coin/CLAUDE.md
├─ state/             observable store + localStorage
├─ lib/               pure functions, no DOM
└─ styles/            tokens.css, base.css
docs/                 the design record
server/               the multiplayer backend  -> server/README.md
```

**Imports flow one way.** `views → components → lib`, with `state` reachable from views.
`lib/` imports nothing from the app. `components/` may import `lib/` and must never import
a view or read the store. A component only one view will ever use belongs in that view's
folder, not in `components/`.

`lib/money.js` is the single source of truth for coins — denominations, values, plurals,
formatting, sums, answer parsing. **Everything is whole cents; there is no floating point
anywhere.** Dollar bills are out of scope.

## Read the docs

`docs/` is the design record and is canonical for anything structural. Read in this order:

| Doc | What it covers |
| --- | --- |
| `docs/take-home.html` | The original brief — source of truth for requirements. |
| `docs/overview.md` | The three views, navigation rules, audience constraints. |
| `docs/architecture.md` | Folder structure, routing, view/component contracts, state, styling. |
| `docs/multiplayer-contract.md` | Room/message contract and the network adapter interface. |

Three places where the code has moved past the docs:

- `docs/README.md`'s status table still calls the Lesson a shell. It is now built: three
  modes, narrated instruction, guided practice, ten free-play puzzles.
- `docs/architecture.md` says "no classes". The `Grid → SkipCountGrid →
  SkipCountCurrencyGrid` family is a deliberate exception, explained in
  `components/CLAUDE.md`. It is not a licence for new classes elsewhere.
- **`LEARNING.pdf`'s Remediation table has been superseded on one mistake.** It calls the
  third one `off-by-one-coin`, detected as `answer === expected ± step`. The code
  generalises it: any whole number of *this* coin's steps is a miscount
  (`MISCOUNTED_COINS`), because counting by 5s eleven times is the same broken sub-skill as
  counting by 5s three times. That makes `wrong-denomination-value` the more specific claim
  and it is now checked **first** — and only when the step the answer implies is a real
  coin's value, which is what settles the doc's "Order of checks" example far better than
  its own answer did. Two nickels answered as 20 is a dime's step taken twice, not four 5s.
  The PDF is a build artefact and has not been regenerated.

## Constraints from the brief

These are requirements, not preferences:

- **No multiple choice.** Every answer is typed.
- **Narrated direct instruction.** Free TTS via the browser's `speechSynthesis` — no key,
  no network. Browsers refuse to speak before a user gesture, which is why the Lesson opens
  on a Start tap.
- **The Lesson ends in 10 problems** testing mastery.
- **A wrong answer must be diagnosed** — what went wrong and where the student needs help.
  Detection only; remediation is out of scope. `views/lesson/diagnostics.js` does the
  classifying, and the Lesson says the diagnosis back to the student for the three mistakes
  that leave a signature in the typed number, with a **Retry** under it that clears the
  board. Pressing it is the only way on — the field locks on a wrong answer, because that
  answer is still staked on the chart and a second one typed over it would be read against
  the first. What is still unwired is the *report*: `buildReport()` and the per-attempt record
  the summary screen and `lesson.report` are meant to carry.
- **The Bakery unlocks when the Lesson is complete**, and the gate is real: the route guard
  refuses to host a room with the flag unset. Joining someone else's room by code is
  deliberately ungated - an invited kid can always accept.
- **The server is authoritative.** The Bakery client renders what it is told and forwards what
  its player did. It never computes a score, a position or an outcome; a hand's *value* is
  never sent to any client, not even its owner's, because that sum is the exercise.

Audience: a K–2 kid who can read English and type, and knows nothing else. Large hit
targets, no dense text, no timed pressure in the lesson, and errors that never read as
punishment.

## House style

Match the surrounding code; there is no formatter to fall back on.

- **No semicolons.** 4-space indent, single quotes, trailing commas in multi-line literals.
- Named exports. Default exports only for a module with exactly one obvious thing in it.
- `kebab-case.js` files; views carry a `.view.js` suffix; factories are `createThing()`.
  The grid components (`Grid.js`, `SkipCountGrid.js`, `SkipCountCurrencyGrid.js`) are
  PascalCase and sit directly in `components/` — an inconsistency, left alone rather than
  churned.
- **No `innerHTML`.** Build nodes with `el()` / `svg()` from `lib/dom.js`. Room codes and
  player names come off the wire.
- No raw hex outside `styles/tokens.css`.
- Prose in comments uses British spelling (colour, centred, behaviour); identifiers use
  American (`normalizeCode`, `color`).

**Comments explain *why*, not what.** This codebase is unusually heavily commented and the
comments carry design reasoning — why the coin's ratio is its real diameter, why guards
live in the route table, why the answer star is separate from the count. Match that
density and that register. A comment restating the line below it is worse than none.

## Accessibility floor

Enforced throughout, and cheap if done as you go: never encode meaning in colour alone
(pair it with text and the accessible name), honour `prefers-reduced-motion`, keep focus
visible, label every control, and keep hit targets at `--pc-tap-min`.

## Things that will trip you up

- **Script-driven animations need `animationSettled()`** from `lib/dom.js`, not
  `animation.finished`. An animation only advances while the page paints, so `finished`
  never settles in a backgrounded tab, and rejects when cancelled. Anything awaiting one
  raw will deadlock.
- **`el()`'s `style` prop supports `--custom` properties** via `setProperty`.
  `Object.assign(node.style, …)` drops them silently — that bug cost the grid its label
  scaling once already.
- The Lesson is laid out against a **1280×692 design box** and scaled to the display by a
  `ResizeObserver`; its stage is `position: fixed`, which is how it escapes `#app`'s
  centred 60rem column. Every offset inside is a design pixel measured from that box, and
  the box's height is derived from the toolbar / gap / chart / dead-space constants rather
  than typed — see `views/CLAUDE.md`.
- `destroy()` is where this app leaks. See the checklist in `views/CLAUDE.md`.
