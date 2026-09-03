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
| `instruction` | The lesson demonstrates on `INSTRUCTION_PROBLEM`: narrates, boxes the pile, flips the coins to their value side, counts them one by one, walks the chart calling out the running total as each coin lands — "5", "10", "15" — then fills the answer in. The student presses Check Answer. |
| `guided` | The same shape with the doing handed over. The coins are tapped one at a time to identify them and to count them, and each of those beats waits for its taps. The chart is **not** tapped: skip counting it is the skill being practised, so the student reads it and types where they landed. |
| `freeplay` | `FREEPLAY_PROBLEMS` — ten piles, one at a time, no scaffolding. Finishing them sets `lesson.completed`. |

| File | Holds |
| --- | --- |
| `lesson.content.js` | Problems and narration, as data. No DOM. |
| `lesson.view.js` | Layout, the mode machine, and what each beat *does*. |
| `diagnostics.js` | Wrong-answer classification and the report. `classify()` is wired — `check()` calls it and the student reads the diagnosis. `buildReport()` is **not**: nothing records the attempts yet. |
| `lesson.css` | The frame and everything positioned against it. |

### Copy lives in content, behaviour lives in the view

A script beat is `{ id, say }` where `say` is a function of the problem. The animation it
runs is looked up by `id` in `INSTRUCTION_MOVES` / `GUIDED_MOVES` in the view. Edit wording
without touching the view; edit choreography without touching the copy.

**A beat may omit `say` entirely**, which means "the move does the talking". Instruction's
`skip-count-callout` is the one that does: it says a number per coin as each lands rather
than one sentence over the whole run, so there is no line for the script to hold and
`playBeat` skips the speech and the dwell and waits only on the move. Do not give such a
beat a placeholder line — an empty caption would blank the one before it.

Narration lines are written *against the problem* (`plural(p)`, `p.step`, `p.expected`) and
never typed out, so swapping which pile the lesson opens on cannot leave it saying
"nickels" over a heap of dimes. Values are spelled `5 cents`, not `5¢` — this text is read
aloud as often as it is read.

### The flow, and how not to break it

`playBeat` says a line and runs the beat's move **together** — the animation is what the
sentence is describing — and moves on only when both are done. Two floors and two ceilings
keep it honest, and all four exist because something really does go wrong without them:

- A **dwell floor** per line, so a muted or unsupported voice does not flick the captions
  past unread. Speech alone cannot pace the beats. `SKIP_CALLOUT_MS` is the same idea one
  level down, per *coin* rather than per line: the chart's callout waits for the slower of
  the voice and 1.5s, so a slow voice pushes the next coin out rather than being cancelled
  mid-word by it. Every `narrator.say()` cancels the utterance before it, which is what
  makes that a floor and not a cadence.
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
   The beat that *waits* on a gate need not be the beat that opened it — guided's
   `skip-count` opens the field and arms the gate, and the `answer` beat after it awaits
   `armedAnswer`, so the reminder to press Check Answer is spoken over the typing instead
   of after it. Do not "tidy" that by moving the arming down a beat.

### The frame

One **1280×692 design box**, laid out once and then scaled to the display — a hundred-chart
whose cells drift with the viewport is no use for pointing at, and a layout that rearranges
itself per size is a different lesson at every size. Every offset in `lesson.css` is a
design pixel measured from that box; the window only decides how big a design pixel is.

**The vertical arithmetic is the design, and it has to add up**: 20 of toolbar, 1 of border,
15 of inset, 640 of chart (ten cells of 64), 15 of inset, 1 of border — 692. `DESIGN_HEIGHT`
is derived from those constants rather than typed, so the sum cannot drift. The chart is what
the height is *for*, so everything round it is what gives way when they disagree — which is
why the box came off 16:9 when the border went to a hairline, and why the way back to 16:9 is
a taller toolbar rather than a bigger cell.

**`PANEL_TOP` and `CONTENT_TOP` are different lines, and the gap between them is the point.**
The white panel starts one border below the bar; the chart's cells and the narrator's band
both start `GRID_INSET` lower, so the chart keeps the same 15 from the frame above it as it
does to the right and below. Putting the panel on `CONTENT_TOP` instead would paint that gap
in the border's colour and give the frame a 16px top edge against a 1px hairline everywhere
else.

**The work column is the tightest part of that budget, and a wrong answer is what tightens
it.** Fifteen nickels is three rows of coins, and under them go the question, the field, the
button, the diagnosis and the Retry that clears it — 491 design pixels for all of it. That
is why `lesson.css` trims the label's line-height, the field's padding and the row gap, and
why the diagnosis lines in `lesson.content.js` have a **length budget: about 110 characters,
which is two lines at the hint's 34rem**. Three lines overflows the panel on `p9`. If a new
diagnosis needs more words, find the pixels first — do not let the message run off the frame,
which is what the old 15-number "count along" tail was quietly doing before the diagnosis
replaced it.

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
- The chart is placed by its **cells**, not its box, and `GRID_INSET` is measured to the
  cells too. The SVG pads itself by `PAD` so its border stroke is not clipped, and
  `loadProblem()` takes that padding back off *both* offsets — `--pc-lesson-chart-top` and
  `--pc-lesson-chart-right` — which is what makes the gap above the chart and the gap beside
  it the same gap, and puts the first row of cells on `CONTENT_TOP` and the last on 676. The
  work column measures against `--pc-lesson-chart-right` for the same reason: the inset the
  design asks for is 2px short of where the chart's box actually starts.
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

`game/` holds the floor: a **1280×720 design box**, scaled to the display by a
`ResizeObserver`. It was the Lesson's box too until the Lesson's frame was reworked — a
hairline border, a 64 cell and a gap round the chart — and came out at 692. The two are the
same 1280 across and 28 apart down, and the intent is still one box per app rather than one
per screen, so move them together.
Its vertical budget is *derived* from named band constants rather than typed, so the sum
cannot drift: toolbar, belt bay (three lanes at a 124 pitch), counter, panels. The belt run
is a fixed width and the server's `slotCount` divides it, which is why `slotPitchPx` off the
wire is advisory — the belt fills the room it is given.

It also holds the **id-to-tray mirror**.
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
