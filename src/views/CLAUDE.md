# `views/`

One folder per screen. Views are **not** shared with each other — they navigate, they never
import or call one another.

```js
export function createLessonView({ params, store, navigate }) {
    const root = /* build DOM */
    return { el: root, destroy() { /* ... */ } }
}
```

`params` is a `URLSearchParams`, `store` is the observable store, `navigate(path)` goes
somewhere else. The router (`src/router.js`) owns the mount point and the lifecycle: it
calls `destroy()` on the outgoing view **before** mounting the incoming one, then moves
focus to the mount.

Views may import anything. Nothing may import a view.

## Route guards live in `routes.js`, not here

A route entry declares a `guard` that returns a redirect path. Hosting a bakery is gated on
`lesson.completed`; joining by `?code=` is not, because an invited kid should always be able
to accept. Putting the gate in the table is what stops a hand-typed URL from skipping the
menu — **do not re-implement a gate inside a view.**

## State

Views read the store and pass values down; components never touch it.

Only the keys in `PERSISTENT_KEYS` (`state/persistence.js`) survive a reload —
`lesson.completed`, `lesson.report`, `player.name`. Adding a persisted key means editing
that list *and* `DEFAULTS`. Everything else in the store is in-memory: current problem,
network status, live game state. The server is authoritative for anything multiplayer.

`lesson.completed` is the Bakery's unlock. Only finishing the Lesson's ten free-play
puzzles should set it for real. The Lesson also carries a **"Dev: mark lesson complete"**
button so the gate can be exercised without sitting through the lesson — delete it before
shipping.

## A component only this view will use belongs in this folder

Not in `components/`. That is the rule that keeps the shared set honest.

## `lesson/`

The largest view by a distance. Three modes run in order, and each hands over only when the
student has an answer marked right:

| Mode | What happens |
| --- | --- |
| `instruction` | The lesson demonstrates on `INSTRUCTION_PROBLEM`: narrates, boxes the pile, flips the coins to their value side, counts them one by one, walks the chart, fills the answer in. The student presses Check Answer. |
| `guided` | The same shape with the doing handed over. Each beat waits for the taps it asked for before the next line is spoken. |
| `freeplay` | `FREEPLAY_PROBLEMS` — ten piles, one at a time, no scaffolding. Finishing them sets `lesson.completed`. |

| File | Holds |
| --- | --- |
| `lesson.content.js` | Problems and narration, as data. No DOM. |
| `lesson.view.js` | Layout, the mode machine, and what each beat *does*. |
| `diagnostics.js` | Wrong-answer classification and the report. **Written and tested by hand, not yet wired into the view.** |
| `lesson.css` | The frame and everything positioned against it. |

### Copy lives in content, behaviour lives in the view

A script beat is `{ id, say }` where `say` is a function of the problem. The animation it
runs is looked up by `id` in `INSTRUCTION_MOVES` / `GUIDED_MOVES` in the view. Edit wording
without touching the view; edit choreography without touching the copy.

Narration lines are written *against the problem* (`plural(p)`, `p.step`, `p.expected`) and
never typed out, so swapping which pile the lesson opens on cannot leave it saying
"nickels" over a heap of dimes. Values are spelled `5 cents`, not `5¢` — this text is read
aloud as often as it is read.

### The flow, and how not to break it

`playBeat` says a line and runs the beat's move **together** — the animation is what the
sentence is describing — and moves on only when both are done. Two floors and two ceilings
keep it honest, and all four exist because something really does go wrong without them:

- A **dwell floor** per line, so a muted or unsupported voice does not flick the captions
  past unread. Speech alone cannot pace the beats.
- A **speech ceiling** (`SPEECH_CAP_MS`), because a voice that never fires `end` would
  stall the lesson forever.
- Script animations awaited through `animationSettled()`, never `animation.finished`.
- A **gate** for anything waiting on the student. `openGate()` records it in `pendingGate`
  so `destroy()` can settle it — an unsettled gate holds every closure in the view alive.

Two rules when editing this flow:

1. **After every `await`, check `cancelled` before touching the DOM.** The view can be
   destroyed mid-count, and `grid.animateSkipCount()` resolves `false` when it was reset or
   torn down rather than finishing.
2. **Open a gate inside the beat that enables the control, not after it.** Enable Check
   Answer and *then* create the gate and a fast tap lands in the gap and is lost forever.

### The frame

One **1280×720 design box**, laid out once and then scaled to the display — a hundred-chart
whose cells drift with the viewport is no use for pointing at, and a layout that rearranges
itself per size is a different lesson at every size. Every offset in `lesson.css` is a
design pixel measured from that box; the window only decides how big a design pixel is.

**The vertical arithmetic is the design, and it has to add up**: 20 of toolbar, 10 of gap,
680 of chart (ten cells of 68), 10 of dead space — 720, which against 1280 across is 16:9.
`DESIGN_HEIGHT` is derived from those constants rather than typed, so the sum cannot drift;
a cell size other than 68 trades the aspect ratio for something else.

Load-bearing, all of it:

- `.pc-lesson-stage` is `position: fixed`, which is how the view escapes `#app`'s centred
  60rem column, and it is the box the `ResizeObserver` measures.
- **Height leads the scale, width holds a veto** — a frame wider than the window puts the
  chart off the side of it — and the floor beats both: below `MIN_FRAME_HEIGHT` (400 real
  pixels) the frame stops shrinking and the stage clips and scrolls instead.
- `.pc-lesson__fit` exists because a transform takes up **no layout**. It carries the
  scaled footprint so centring and scrolling have something to work with, and it gets
  `margin: auto`: `justify-content: center` would push the left edge somewhere the
  scrollbar cannot reach on a small display.
- The chart is placed by its **cells**, not its box. The SVG pads itself so its border
  stroke is not clipped, and `loadProblem()` takes that padding back off the offset — which
  is what puts the first row of cells on `CONTENT_TOP` and the last on 710.
- The dark blue border is one background, the frame's own, with the white
  `.pc-lesson__panel` inset over it. The panel is **decorative** — everything positions
  against the design box, not against the panel — which is what lets the toolbar's colour
  read as a border on all four sides.
- The 20px toolbar's controls give up `--pc-tap-min` and the hard shadows. They are chrome
  for whoever is running the lesson rather than part of it, and they scale with the frame.

`?mode=guided|freeplay` skips ahead — a stand-in for resuming, and the only way to reach a
later mode without playing the earlier ones.

## `home/`

Done. A menu, plus the unlock gate and code validation. It subscribes to
`lesson.completed` and **unsubscribes in `destroy()`** — copy that pattern for any view
that watches the store.

## `bakery/`

Playable. The lobby and the game both run against the real backend in `server/` over a
WebSocket. `docs/bakery-backend-plan.md` is the design record for both halves.

**The transport is chosen in exactly one place: `net/index.js`.** It returns the real
`ws-room-adapter` by default and the in-memory fake under `VITE_USE_FAKE_ROOM=1`; nothing in
`bakery.view.js` knows which it got. The fake was not deleted when the real one landed — it is
what keeps the view buildable and demoable with no server running.

**The server is authoritative, and this view is a renderer.** It forwards what its player did
and draws what it is told back. It computes no score, no position and no outcome, and a hand's
*value* never crosses the wire — `hand/dealt` carries coin ids and the sum stays on the
server, because that sum is the exercise.

`game/` holds the floor: the frame's three bands, and the **id-to-tray mirror**.
`belt/advanced` carries `itemId`s while `conveyor-belt.setSlotItems()` takes tray *instances*,
so something has to hold the correspondence — and that same something owns a tray's flight
once the belt has let go of it. It is a local mirror and deliberately **not** the store: this
state is ephemeral and server-owned, and the store is for what outlives a view.

**A tray is detached by the belt, then destroyed by us.** `conveyor-belt` lifts out a tray
that has left its occupancy but does not dispose of it, because a claimed one still has a
flight to its buyer's panel and a wasted one still has to fall. On the belt, the belt owns it;
off the belt, this view does — and every one of those flights ends in `destroy()`.

## `destroy()` checklist

The router will call it. Everything below leaks past the element if you forget:

- [ ] Store subscriptions — call the unsubscribe returned by `store.subscribe`.
- [ ] `narrator.destroy()` — speech is page-global and keeps talking over the next view.
- [ ] Timers, and any pending gate (`pendingGate?.settle(false)`).
- [ ] A `cancelled` flag set first, so in-flight async work stops writing to dead DOM.
- [ ] Every child component's own `destroy()` — including ones rebuilt per problem.
- [ ] `root.remove()`.
