# Bake Sale UI — implementation plan

Bring the Bakery view up to the art direction proven in `docs/bake-sale-mockup.html`.

**How to use this.** Work top to bottom. Every section marked **W\<n\>** is a work item with the
files it touches, the contract it must preserve, and the traps in it. The numbers in §4 are the
design; do not re-derive them, and do not round them "to something nicer" — the mockup's vertical
budget adds to exactly 720 and the belt pitch was chosen against the tray width.

**The target is fidelity to the mockup**, not an interpretation of it. When this document and the
mockup disagree, the mockup wins and this document is wrong — say so rather than splitting the
difference.

---

## 1. Ground rules

These come from the repo's own `CLAUDE.md` files and are not up for negotiation in this work:

- **No semicolons.** 4-space indent, single quotes, trailing commas in multi-line literals.
- **No `innerHTML`.** Build nodes with `el()` / `svg()` from `lib/dom.js`. Room codes and player
  names come off the wire.
- **Named exports.** `kebab-case.js` files, `createThing()` factories, views suffixed `.view.js`.
- **No raw hex outside `styles/tokens.css`.**
- **Everything is whole cents.** No floating point in money, ever. `lib/money.js` stays the single
  source of truth.
- **The server is authoritative.** This view renders what it is told and forwards what its player
  did. It computes no score, no position, no outcome, and a hand's *value* never crosses the wire.
- **Comments explain why, not what.** Match the surrounding density — this codebase is heavily
  commented and the comments carry design reasoning. A comment restating the line below it is worse
  than none. British spelling in prose, American in identifiers.
- **`animationSettled()` from `lib/dom.js`, never `animation.finished`.** An animation only advances
  while the page paints, so `finished` never settles in a backgrounded tab and rejects when
  cancelled. Anything awaiting one raw will deadlock.
- **`el()`'s `style` prop supports `--custom` properties** via `setProperty`.
  `Object.assign(node.style, …)` drops them silently.
- **`destroy()` is where this app leaks.** Follow the checklist in `views/CLAUDE.md`.
- **Accessibility floor:** never encode meaning in colour alone, honour `prefers-reduced-motion`,
  keep focus visible, label every control, keep hit targets at `--pc-tap-min`.

There is no test runner and no linter for the frontend. Verification is a clean `npm run build`, the
manual test pages reporting zero failures, and the app driven in a browser. `server/` has its own
`node:test` suite and **this work must not touch `server/` at all.**

---

## 2. The one deliberate deviation: raster goods

`docs/architecture.md` and `components/coin/CLAUDE.md` establish that artwork in this app is
hand-built SVG with no image files to load. **The six baked goods break that rule on purpose.**

They are PNG cutouts with transparent backgrounds, in a flat-fill style with heavy ink outlines.
They were chosen over drawn SVG because the art direction is being settled from supplied reference
art, and re-deriving that art as paths would freeze it before it is final.

**Scope the deviation precisely, and write that scope into a comment where the assets are loaded:**

- **Goods are raster and nothing else is.** The belts and the trays stay SVG, drawn with `svg()`
  from `lib/dom.js` exactly as they are now; a good is an `<image>` inside the tray's group. The new
  chrome that is not on a belt — ducts, counter, meters — is DOM and CSS.
- **The coins are the counterpart to this exception, not another instance of it.** They stay
  hand-built SVG and stay pixel-identical to the Lesson's. The goods are Bakery-only and may follow
  the Bakery's art direction; the coins are shared and may not. See §7.
- No other image file enters the app.
- The goods are addressed through **one module** (`lib/goods.js`, W1) so that replacing them with
  SVG later is a change to that module and nothing else.

Say this in `docs/architecture.md` too — a rule with an undocumented exception reads as a bug.

---

## 3. Reference material

| Path | What it is |
| --- | --- |
| `docs/bake-sale-mockup.html` | **The target.** Open it. It carries the frame *and* a styling-guide section with the full swatch table, its provenance, and the rules. |
| `docs/bake-sale-assets/*.png` | The six goods, background already removed, already scaled to a common yardstick. |
| `docs/multiplayer-contract.md` | Room and message contract. Unchanged by this work. |
| `docs/bakery-backend-plan.md` | The belt/slot model the client mirrors. Unchanged by this work. |

The mockup is a static frame built to be read, not lifted. Its CSS is a specification — copy the
values, not the class names. Names in this repo are `pc-`-prefixed and BEM-ish; the mockup's are
`bs-`.

---

## 4. Layout spec

### 4.1 The frame

**1280 × 720**, replacing the current `FRAME = { width: 1200, height: 800 }` in `bakery-game.js`.

This also aligns the Bakery with the Lesson, which is already laid out against a 1280×720 design
box — two screens in one app should not have two design boxes. Keep the existing fixed-stage
technique: a `position: fixed` stage holding the frame, `margin: auto` for centring (not
`justify-content: center`, which pushes the left edge somewhere no scrollbar can reach), and a
`ResizeObserver` scaling to the display.

### 4.2 The vertical budget

Derive these from named constants; **do not type the sums.** They add to 720 and must keep adding
to 720.

| Band | y | Height | Holds |
| --- | --- | --- | --- |
| Toolbar | 0 | 64 | Two segmented meters |
| Belt bay | 64 | 368 | Three lanes at 124 pitch |
| Counter top | 440 | 22 | The slab |
| Counter face | 462 | — | Runs to the frame bottom, behind the panels |
| Player panels | 516 | 190 | Four hands |
| *(frame bottom)* | 720 | | |

Lane tops: **72, 196, 320** — `LANE_PITCH = 124`, first lane 8px below the toolbar.
Per lane: tray box **86** tall, belt band **26** tall, 12 of gap to the next lane.

### 4.3 Horizontal

```
DUCT_W        = 20        both ends, flush to the frame edge
BELT_X0       = -6        the band runs past the frame on both sides,
BELT_X1       = 1286        so its capped end is always hidden in a slot
PANEL_MARGIN  = 20
PANEL_GAP     = 12
PANEL_W       = 301       (1280 - 40 - 36) / 4
PANEL_H       = 190
```

### 4.4 The tray

Authored so the deck's **underside is the belt line**. A deck floating above the band reads as a
shelf, and a shelf does not move.

```
TRAY_W        = 100       at TRAY_PITCH 148
FOOD_W/H      = 84 / 72   the box a good is fitted into, bottom-aligned
DECK_Y/H      = 70 / 16   the tray board — its bottom edge IS the band top
CARD_Y/H/W    = 78 / 30 / 72   the price card, overhanging the deck's front
TRAY_H        = 86        = DECK_Y + DECK_H; the card overhangs below it
BAND_H        = 26
```

Price type: **22px**, display face, weight 800, ink on `--pc-card`.

### 4.5 Coins

Unchanged geometry (`--pc-coin-size` scaled by each coin's real diameter ratio: quarter 1, nickel
0.87, penny 0.78, dime 0.73). The mockup runs `--pc-coin-size: 58px` inside a 301×190 panel with a
28px name tab, 36px top padding and 10px row gap.

---

## 5. Token additions — `styles/tokens.css`

Append a block. Do not remove or rename anything already there; the Lesson and Home use it.

```css
/* --- bakery: the goods ------------------------------------------------- */
/* Sampled from the reference art, not chosen. Provenance is in
 * docs/bake-sale-mockup.html's styling guide. */
--pc-food-crust: #ECB06B;
--pc-food-crust-light: #F2BC8C;
--pc-food-pink: #F5A8BD;
--pc-food-pink-deep: #EC91AC;
--pc-food-choc: #6C4231;
--pc-food-choc-deep: #593529;
--pc-food-blue: #85BCDB;
--pc-food-sponge: #F6EA94;
--pc-food-cream: #F6F0D2;
--pc-food-berry: #A93246;

/* --- bakery: the room -------------------------------------------------- */
--pc-backroom: #D3E3F5;      /* the wall behind the belts */
--pc-duct-deep: #7C8DA3;     /* the waste lip */
--pc-steel: #B9C6D6;         /* tray decks */
--pc-card: #FFF8EC;          /* price cards — warm white, not the app white */
--pc-counter-top: #E0A469;
--pc-counter-face: #CF8E58;
--pc-counter-deep: #A96635;
```

**Two things the mockup does that this work does *not* do. Both are settled; do not revisit them,
and do not "improve" them in passing.**

1. **The ink stays `--pc-ink` `#1B2336`.** The mockup inks in a warm near-black `#201611`, sampled
   off the reference art's own outlines. Adopting it would repaint the Lesson and Home, which is far
   outside this work. The Bakery will read slightly cooler than the mockup. That is correct.
2. **The coin metals stay exactly as shipped** — `--pc-coin-copper-deep: #AF6A3B`,
   `--pc-coin-silver-deep: #A2AEBF`. The mockup darkens them because the shipped pair sits close to
   its own metal at 58px. **It does not matter.** See §7: the coins are shared with the Lesson and
   consistency there outranks matching the art. Do not add a Bakery-scoped override either — a coin
   that is one colour in the Lesson and another in the Bakery is the exact failure this rule exists
   to prevent.

---

## 6. Work items

### W1 — Asset pipeline · `src/lib/goods.js`, `src/assets/goods/`

**New.** Copy the six PNGs from `docs/bake-sale-assets/` to `src/assets/goods/`.

Import them through Vite (`import cakeUrl from '../assets/goods/cake.png'`), **not** via `public/`.
Vite fingerprints the URL and fails the build on a missing file; `public/` does neither.

```js
/**
 * The baked goods.
 *
 * These are the app's only image files, and the only place it departs from the
 * hand-built-SVG rule the rest of the artwork follows — see docs/architecture.md.
 * The departure is deliberate and it is confined to this module: swapping the
 * set for drawn SVG later is a change here and nowhere else.
 */
export const GOODS = Object.freeze(['macaron', 'cupcake', 'cake', 'brownie', 'tart', 'pie'])

/**
 * `scale` is a per-good correction on the tray. Every good is fitted to the same
 * box, which flatters the small ones - a macaron ends up the size of a slice of
 * pie. The box is right for most of them, so the correction is per good rather
 * than global.
 */
export const GOOD_ART = Object.freeze({
    macaron: { url: macaronUrl, scale: 0.5 },
    cupcake: { url: cupcakeUrl, scale: 1 },
    cake:    { url: cakeUrl,    scale: 1 },
    brownie: { url: brownieUrl, scale: 1 },
    tart:    { url: tartUrl,    scale: 1 },
    pie:     { url: pieUrl,     scale: 1 },
})

/**
 * Which pastry a tray shows.
 *
 * The wire has no `kind` on an item - see docs/multiplayer-contract.md - so it is
 * derived from the id. A *pure function of the id* rather than a random pick,
 * because every player has to see the same pastry on the same tray: four kids
 * round a table comparing screens is the actual test.
 *
 * FNV-1a, for a spread that does not clump on sequential ids.
 */
export function goodFor(itemId) {
    let hash = 0x811c9dc5
    for (let i = 0; i < itemId.length; i += 1) {
        hash ^= itemId.charCodeAt(i)
        hash = Math.imul(hash, 0x01000193) >>> 0
    }
    return GOODS[hash % GOODS.length]
}
```

**Trap.** Six goods across three belts of eight slots means the same pastry appears three or four
times on screen. That is expected and acceptable — the **price** is what identifies a tray, not the
picture. Do not add jitter to "fix" it; a tray whose picture changed between renders would be worse.

### W2 — `styles/tokens.css`

Per §5. Append only.

### W3 — `components/duct/` — **new**

The opening a belt runs through. **20px wide, hard-edged, flush to the frame edge.**

```js
createDuct({ side, height })   // side: 'in' | 'out'
  → { el, destroy() }
```

- A flat ink rectangle. **No border-radius, no box-shadow, no gradient, no ribs.** It is a cut in
  the wall, not an object sitting on it. An earlier pass had these as 104px rounded housings and
  they dominated the frame.
- A **3px lip** inset 3px from the inner edge: `--pc-gold-deep` on the oven end, `--pc-duct-deep` on
  the waste end. The two ends of a belt mean opposite things — straight out of the oven, and gone
  to waste — so they must differ by more than which side they are on.
- `z-index` above the belts and trays. This is the whole job: **the belt runs behind it.**
- `aria-hidden`. The belt already names itself and its occupancy; a duct has nothing to say.

### W4 — `components/bakery-counter/` — **new**

```js
createBakeryCounter({ top })   // → { el, destroy() }
```

The horizon of the picture: everything above it is the back room, everything below belongs to a
player. Two parts:

- **Top slab**, 22px, `--pc-counter-top` with an 8px lighter band along its own top edge, ink
  border, 8px radius, and `box-shadow: 0 5px 0 -1px` in ink at 30% — the slab overhangs its own
  face and the shadow is what says so.
- **Face**, from 462 to the frame bottom: `--pc-counter-face` with plank separators every 148px in
  ink at 18%, and a white 16% highlight in the top 6px.

Both bleed 4px past each frame edge so no seam shows at the corners.

**No cash register and no glass case.** An earlier pass had both; they cost more vertical space than
they earned, and that space now belongs to the trays and the panels. Do not add them back.

`aria-hidden` — it is scenery.

### W5 — `components/conveyor-item/` — **refactor, stays SVG**

It remains an SVG `<g>` drawn in its own coordinates with the origin at its top-left corner, which
is what lets `conveyor-belt` place it with a single translate. It never positions itself.

**Keep the handle exactly as it is.** `bakery-game.js` depends on all of it:

```js
createConveyorItem({ price, trayWidth, onClick, selected, good })
  → { el, width, height, get price, get selected, update({ price, selected, good }), destroy() }
```

Changes:

- New optional `good` (a key from `GOODS`). When absent, fall back to a bare deck so a tray without
  art still renders and still prices.
- The `goodsFill` prop and the `DEBUG_FILLS` price-derived colour square **go away.** The comment
  above them calls them a placeholder "standing in until there is real bakery art". This is that.
- **Keep the existing proportion pattern.** Every part is a fraction of `trayWidth`, so one number
  scales the whole tray and the height is derived from the parts rather than pinned separately. New
  fractions, from §4.4 at `TRAY_W = 100`:

  ```js
  const FOOD_W = 0.84, FOOD_H = 0.72   // the box a good is fitted into
  const DECK_Y = 0.70, DECK_H = 0.16   // the deck's underside IS the belt line
  const CARD_Y = 0.78, CARD_H = 0.30, CARD_W = 0.72
  ```

- `TRAY_ASPECT` is no longer one ratio, because the price card overhangs the tray's ride height.
  Export **two** and update the import in `conveyor-belt.js`:
  - `TRAY_RIDE_ASPECT = DECK_Y + DECK_H` — what sits on the band.
  - `TRAY_FULL_ASPECT = CARD_Y + CARD_H` — including the overhanging card; what reserves headroom.
- Child order: **deck → good → card.** The good's shadow has to fall on the deck.
- The good is `svg('image', { href, x, y, width, height, preserveAspectRatio: 'xMidYMax meet' })`.
  **`xMidYMax meet` is the SVG equivalent of `object-fit: contain` plus
  `object-position: bottom center`** — it is why this works in SVG at all, and it is what stands a
  good of any proportion on the deck.
- Per-good scale (`GOOD_ART[good].scale`) shrinks the image box **about its own bottom edge**, so a
  shrunk good still stands on the deck rather than floating above it:

  ```js
  const w = FOOD_W * trayWidth * scale
  const h = FOOD_H * trayWidth * scale
  const x = (trayWidth - w) / 2
  const y = (FOOD_H * trayWidth) - h        // bottom edge fixed
  ```

- Keep the transparent full-tray hit rect. A tray is mostly empty space between the good, the deck
  and the card, and an SVG group only catches pointer events where it is actually painted — a tap
  landing in a gap and missing the tray it is obviously aimed at is a real problem for a six-year-old
  on a tablet.
- Keep the ring drawn for selection **and** for keyboard focus in different colours; SVG takes
  `:focus-visible` unevenly across browsers and a focus indicator is not something to leave to
  chance.
- Keep `role="button"` + `tabindex` when interactive, `role="img"` when not, `aria-pressed`, and the
  `, chosen` suffix in the accessible name. Selection is drawn in colour, so it has to be said.
- `href` on `<image>`: set the plain `href` attribute. Do **not** add `xlink:href`; it is deprecated
  and every browser this targets reads `href`.

**Trap.** `svg()` in `lib/dom.js` creates elements in the SVG namespace. An `<image>` built with
`el()` instead will silently render nothing.

### W6 — `components/conveyor-belt/` — **refactor, stays SVG**

**The one structural change: the belt's drawing area extends a full slot beyond each end of its
run, and that overscan hangs off the frame.**

This is what fixes the spawn. The current file explains the problem in a comment: a tray that was
not on the belt a moment ago *fades in where it stands*, because the belt is an `<svg>` with a
viewBox and anything starting outside that box is hard-clipped by it. With the box extended, there
is somewhere off-stage for a tray to start — so a fresh bake **slides in from beyond the oven end**,
and the fade that makes its first frame honest happens where nobody can see it. Delete that comment
and replace it with why the overscan exists.

**Keep the handle exactly as it is.** `bakery-game.js` uses every field:

```js
createConveyorBelt({ slotWidth, slotCount, slotItems })
  → { el, width, height, slotWidth, slotCount, trayWidth,
      slotCenter(index), setSlotItems(next, { animate, duration }),
      get slotItems, itemAt(index), destroy() }
```

**Preserve all of this — it is load-bearing and hard-won:**

- **Slots, not positions.** Nothing interpolates. A tray is in a slot or it is not, and the client is
  *told* the occupancy rather than predicting it. Mapping a slot index to pixels is this component's
  only geometry job.
- `setSlotItems()` takes **full occupancy, not a diff**, so a dropped message self-heals on the next
  beat rather than leaving the belt quietly wrong.
- Trays that leave are **detached, not destroyed** — a claimed one still has a flight to fly and the
  caller owns that. Only `destroy()` disposes of trays.
- `place()` sets the final transform **before** the hop runs, so the hop only ever animates *back to
  a truthful position*. Cancelled, backgrounded, or never run, the belt still shows what the server
  sent. That property is what makes the hop decoration rather than state.
- The transform is written as a **CSS transform, not the SVG presentation attribute** — the hop
  animates the CSS property, and a presentation attribute would be overridden mid-flight and snap
  back when the animation cleared. One representation, no fighting.
- Every flight awaited through `animationSettled(flight, duration + 200)`.
- `HOP_MS = 260` stays, and stays short. The server advances instantly and the tray then *rests* for
  the remainder of the interval; that stillness is the point of a stepped belt, and a leisurely hop
  spends it.
- The accessible name carries occupancy: `Conveyor belt, 8 slots, 5 trays`.

**New geometry:**

- `OVERSCAN = slotWidth` at each end. The viewBox widens to
  `runWidth + 2 * OVERSCAN + 2 * PAD`, and the inner group translates by `OVERSCAN + PAD` instead of
  `PAD`. **Belt-local x = 0 stays the left edge of slot 0**, so `slotCenter()` and every caller of
  it are untouched.
- The belt's own CSS absorbs the offset: `left: calc(var(--pc-belt-x) - var(--pc-belt-overscan))`,
  with the component setting `--pc-belt-overscan`. `bakery-game.js` keeps passing the run's intended
  left edge and never learns the overscan exists. **Do not make the caller subtract it** — that is
  the version of this that drifts.
- The **band** spans the whole overscan, so it runs off both sides of the frame and under the ducts.
  Its rounded, stroked end is out in the overscan where the frame clips it.
- Two new positions for entry and exit, outside the slot range and reachable by name rather than by
  index arithmetic:

  ```js
  entryCenter()   // { x: -OVERSCAN / 2, y: deckY }   beyond the oven end
  exitCenter()    // { x: runWidth + OVERSCAN / 2, y: deckY }
  ```

  **Leave `slotCenter()` strict** — it must keep throwing on an out-of-range index, because
  `bakery-game.js` positions a flight from it and a silent off-belt answer there would put a tray in
  the wrong place on screen.

**The spawn, which is the point of all of the above.** In `hop()`, a tray absent from `before` no
longer fades in place. It animates **from `entryCenter()` to its slot**, with the opacity ramp
front-loaded so it is fully opaque well before it clears the duct:

```js
item.el.animate([
    { transform: transformAt(item, entryCenter()), opacity: 0 },
    { transform: transformAt(item, entryCenter()), opacity: 1, offset: 0.35 },
    { transform: transformFor(item, index) },
], { duration, easing: 'ease-in-out' })
```

Under `prefers-reduced-motion` it is placed directly, as now.

**Do not add an exit slide.** A tray's departure is already owned by `item/resolved` and the view's
flight; two systems animating the same exit will fight, and the flight is the one that knows whether
the tray was served or wasted.

**Chrome, to the mockup:**

- Band: `--pc-ink-soft`, 2.5px ink stroke, 10px radius, plus a cast shadow beneath it so the belt
  sits in a room rather than being pasted onto it.
- Slot dividers stay — they are the boundaries a child counts trays between, not decoration. Keep
  them as lines; restyle to `--pc-sky` at 45%.
- Travel arrows: small chevrons in `--pc-sky` at 50%, **inset clear of both ducts** so none is
  half-eaten at a frame edge, and none drawn in the overscan.
- **The pulleys go.** They were sized against a 104px housing; against a 20px slot they float in the
  open and read as debris on the band. The dividers and the arrows already carry the motion.

**Sizing against the run:** the belt now fills a fixed run duct to duct, so pitch is derived from
`slotCount` rather than taken from the server's `slotPitchPx`, which becomes advisory. Keep reading
`slotCount` from the server. Keep a sanity `console.warn` in the spirit of the existing one: warn if
the derived `trayWidth` falls below ~70px, because below that the price stops being readable across
a classroom.

### W7 — `views/bakery/game/` — **refactor**

`bakery-game.js` changes little, because W5 and W6 both kept their handles and both stayed SVG.
Expect to touch:

- `FRAME` → `{ width: 1280, height: 720 }`.
- The band constants → §4.2. Derive `DESIGN_HEIGHT` from them; do not type 720.
- `INCINERATOR_X` and the `BELT_X + belt.width > INCINERATOR_X` warning → gone. The belt now spans
  the frame and the waste end is the right-hand duct.
- Mount **one duct pair per lane** (in + out), positioned from that lane's top, and the counter
  once. Both live in a layer above the belts — that layering is what makes the belt feed into the
  duct rather than stop at it.
- `buildBelts()`: lane tops are now the fixed 72 / 196 / 320 rather than an even share of a band.
  Keep the "spread over the band" shape if you prefer, but it must land on those three values for
  three belts, and on 196 for one.
- `makeTray()`: pass `good: goodFor(wire.id)`.
- The score bar → W8.
- `destinationFor()` keeps working unchanged — it already divides by the measured scale to convert
  client pixels back to frame pixels. **Do not "simplify" that division out.**
- `flyAway()` and `trayRect()` are **unchanged**. The flight holder still hosts an SVG canvas for
  the lifted `<g>`, which is what the existing note in `bakery-game.css` describes; that stays true
  and stays needed. Both outcomes still end in `destroy()`, and both still go through
  `animationSettled` — a backgrounded tab would otherwise leak the node and its listeners on every
  single tray.

`bakery-game.css` gets the room: `.pc-game__backroom` (the wall, with faint horizontal seams every
45px in ink at 5%), the counter, the duct layer, the new base band.

**Layer order, bottom to top:** backroom → belts (band, then trays) → ducts → counter → panels →
flight layer → overlay. A tray flying to a wallet must pass *over* the machinery, which is what the
existing flight layer is for; keep it above the counter.

### W8 — `components/progress-bar/` → segmented meter

The existing `createProgressBar` is a continuous fill. The mockup uses **ten discrete cells**: a K–2
kid can count cells and nobody can read a bar that is 30% along.

```js
createMeter({ label, value, total, tone })   // tone: 'good' | 'waste'
  → { el, update({ value, total }), destroy() }
```

- Label and `value/total` on one line above the track; track is a 22px pill, white, ink border, hard
  shadow, `total` cells with 3px gaps.
- `tone` sets the on-cell colour (`--pc-green` / `--pc-red`) and the count colour
  (`--pc-green-ink` / `--pc-red-deep`).
- **Colour is never alone.** The two meters differ by label, by position and by direction as well as
  by hue, and the track carries `role="img"` with `aria-label="Items purchased, 3 of 10"`.
- `total` comes off the wire (`game.target`, `game.wasteLimit`) and **is not always 10.** Cap the
  cells: above ~20, fall back to a continuous fill rather than drawing 60 slivers.
- Keep the old `createProgressBar` if anything else imports it; check first, and delete it if not.

### W9 — `components/player-wallet/` — **near-untouched**

Deliberately. It is the one thing in the frame that already works.

Only these:

- `width` / `height` from the caller → 301 × 190 (already parameterised; just new numbers).
- `--pc-coin-size` at **58px**, with 36px top padding under a 28px name tab and a 10px row gap.
- Add an outer `outline` in ink so the coloured accent band reads against the warm counter behind
  it. The panel currently relies on the accent alone, which was fine over sky and is weaker over
  wood.

The mockup shows a small "bought" chip in the tab row. **It is cut — do not build it.** It was an
invention of the mockup, not a requirement, and it would need per-player purchase state the wire
does not carry.

Do **not** touch the coin fit maths. Geometry comes into that component from JS as custom
properties precisely so the fit knows the border, padding and tab; a second copy in CSS is how it
breaks.

### W10 — Test pages

`src/components/test/` pages are not routes — nothing imports them, they are opened directly in dev.

- `conveyorBelt.html` — its **19 self-checks must still report 0 failures.** They assert SVG
  structure and the belt is still SVG, so most should survive untouched. The ones that will move are
  any asserting the viewBox or overall width, both of which grow by the overscan. Add checks for the
  two new ones: `entryCenter()` sits left of slot 0, and `slotCenter()` still throws out of range.
- `coins.html` — untouched.
- `skipCountGrid.html` — untouched, and its **22 self-checks must still report 0.**
- **New:** `goods.html` — every good on a tray at 1:1 and at 4×, plus one belt of eight running duct
  to duct, plus the counter. This is the page that catches a good that does not sit on its deck.

Update the table in the root `CLAUDE.md` with the new page.

---

## 7. What must not change

- `server/` — nothing in it, at all.
- `lib/money.js`, `lib/dom.js`, `lib/emitter.js`, `lib/room-code.js`.
- **`components/coin/` — nothing in it. Not `coin.js`, not `coin.css`, not `coin-faces.js`, and not
  the `--pc-coin-*` tokens that feed it.** This is a hard boundary, not a preference.

  The coin is **shared with the Lesson**, where counting a pile of them *is* the exercise. A coin
  that looks one way while a child is learning to read it and another way while they are spending it
  teaches them the wrong lesson. Consistency with the Lesson wins over consistency with the Bakery's
  art direction, and it wins even where the art direction is plainly better — the mockup's darker
  metals hold their portraits at 58px and the shipped ones are muddier, and the shipped ones stay
  anyway.

  Concretely, all of these are out of scope: changing a metal or its `-deep` shade; adding a
  Bakery-only override, wrapper class, or filter over a coin; redrawing a face; changing the
  diameter ratios; changing what `--pc-coin-size` means. The Bakery may only **set**
  `--pc-coin-size` on an ancestor, which is the documented way to scale a pile and the one lever it
  is entitled to.

  If the coins look wrong in the panel at 58px, that is a finding to report, not a thing to fix
  here.
- `components/coin-pile/`, `components/answer-input/`, `components/narrator/`, the grid family.
- `views/lesson/`, `views/home/`, `router.js`, `routes.js`, `state/`.
- `views/bakery/net/` — the adapter interface and the transport choice. `net/index.js` stays the one
  place the transport is picked.
- The message contract. **This is a UI change; the wire does not move.**

---

## 8. Verification

In order. Do not skip the third.

1. `npm run build` — clean, no warnings about unresolved asset imports.
2. `npm --prefix server test` — still green. It should not have been able to break; confirm anyway.
3. Open `src/components/test/conveyorBelt.html` and `skipCountGrid.html` in dev. **0 failures each.**
4. Open the new `goods.html`. Every good stands on its deck with no gap and no overlap.
5. Run the game against the fake adapter: `VITE_USE_FAKE_ROOM=1 npm run dev`. Watch a full round.
   - Trays hop one slot per beat and **rest** between beats.
   - A fresh bake **slides in from beyond the oven end**, already opaque by the time it clears
     the duct. No pop, no fade in view.
   - A tray leaving the right-hand end disappears behind that duct rather than popping.
   - A claimed tray flies to its buyer's panel, over the counter, and is gone.
   - Both meters fill in cells.
6. Compare against `docs/bake-sale-mockup.html` **side by side at the same zoom.** Band positions,
   tray size, price type size, panel size. This is the acceptance test.
7. Background the tab mid-round for 30 seconds, come back. Nothing is stuck; the belt is showing the
   server's occupancy. This is what `animationSettled` is for and it is the failure that will not
   show up any other way.
8. `prefers-reduced-motion` on: no hops, no flights, no slides, and the game still fully playable.
9. Tab through the frame: every tray reachable, focus visible, panels announce whose hand they are.

---

## 9. Open decisions — ask before assuming

*(The ink and the coin metals were open questions in an earlier draft. Both are now decided against
— see §5 and §7. They are not open and should not be re-raised.)*

1. **The goods have no wire identity.** W1 derives the pastry from the item id, which is stable
   across clients and needs no server change. The correct long-term home is a `kind` field on the
   item, set server-side. Flag it in `docs/multiplayer-contract.md` as a deferred decision; do not
   implement it here.
2. **Six goods, twenty-four slots.** The set repeats three or four times on screen. Either it grows
   to about twelve, or the goods formally stop carrying identity and the price does all the work.
   Worth settling before more art is commissioned.
3. **Licensing.** The six PNGs are placeholder cutouts. They need licensing or a redraw before this
   ships, and the set is missing cookies, bread and flan, all of which are named in the brief.

---

## 10. Milestones

Six. **Each one ends with the app building and running** — no milestone leaves the Bakery broken
for the next one to fix. Commit at each boundary.

### M1 · Foundations
**W1, W2.** Assets into `src/assets/goods/`, `lib/goods.js`, tokens appended.
Nothing renders differently yet.
> **Done when:** `npm run build` is clean and the six URLs are fingerprinted in the output. A
> deliberately misspelled import fails the build — if it doesn't, the assets are going through
> `public/` and that is wrong.

### M2 · The tray
**W5**, plus the new `goods.html` from W10.
> **Done when:** every good stands on its deck with no gap and no overlap, at 1:1 and at 4×. The
> macaron is visibly the smallest thing on a tray. Prices are legible at 1:1.

### M3 · The belt
**W6**, plus `conveyorBelt.html`.
> **Done when:** its self-checks report **0 failures**, and on `goods.html` a belt of eight runs with
> the band disappearing past both ends. A tray added to slot 0 **slides in from off-stage, already
> opaque** — no pop, no visible fade. `slotCenter()` still throws out of range.

### M4 · The room
**W3, W4.** Ducts and counter, mounted on `goods.html` first.
> **Done when:** a belt visibly feeds into a duct rather than stopping at one, and the two duct ends
> are distinguishable with the page in greyscale.

### M5 · The floor
**W7, W8, W9.** The real view: frame, bands, meters, panels.
> **Done when:** a full round runs on the fake adapter — trays hop and rest, a claim flies to its
> buyer's panel over the counter, both meters fill in cells — and the frame stands up **side by side
> with the mockup at the same zoom.** That comparison is the acceptance test.

### M6 · Hardening
No new features. §8 items 7–9, plus the docs.
> **Done when:** `prefers-reduced-motion` leaves the game fully playable with no motion; a tab
> backgrounded mid-round for 30s comes back unstuck and showing the server's occupancy; every tray
> is keyboard-reachable with visible focus; `npm --prefix server test` is green; and
> `docs/architecture.md` plus the root `CLAUDE.md` test-page table record the raster-goods exception
> and `goods.html`.

**Order within the milestones is fixed by dependency:** assets and tokens first because everything
reads them; the tray before the belt because the belt imports its aspect constants; `goods.html`
early, because it is the cheapest place to find out a good does not sit on its deck — much cheaper
than mounting the whole floor to discover it.
