# Session log — Bake Sale art direction

A record of how the Bakery's art direction was settled, 2 – 3 September 2026.

Prompts are verbatim, including typos. Pasted reference images are not reproduced — each is noted
by the asset it became, in `docs/bake-sale-assets/`.

**What the session produced:**

| Artefact | Path |
| --- | --- |
| The mockup and its styling guide | `docs/bake-sale-mockup.html` |
| Six baked goods, cut out and scaled | `docs/bake-sale-assets/*.png` |
| The implementation plan | `docs/bake-sale-ui-plan.md` |

---

## 1 · The brief

> I want to create a mockup of a 2D game that does the following:
> Description: Players are at a "bake sale". They each have money in their wallets and they have to
> buy something that costs that exact match. In the back, is up to 3 vertically stacked conveyor
> belts with baked goods: Chocolate cookies, cupcakes, Slices of cake, loaves of bread, fruit tarts,
> flans, etc.
>
> It is a 1280x720 screen.
> At the bottom there is a set of 4 player panels. Each panel has a set of coins that defines how
> much money they have.
> Above the panel is a representation of a bakery counter (cash register, short glass sneeze guard,
> etc).
> Above the counter is 1-3 conveyor belts (depending on the number of players (assume 3). The
> conveyor belts flow from left to right, bringing the food in and out of ducts.
> The conveyor belts are loaded with food. Each food item is in a separate tray. Each tray has
> affixed to it a price (The price must be readable as it is the functional element here).
> Above that, in a UX toolbar are two progress bars. "Items purchased (3/10)" Items wasted (4/10)
>
> We are targeting a simplistic art direction with clear black outlines and a colorful palette. Some
> of the documentation in this folder references SVG but for now, disregard that as we determine the
> art direction first.
>
> I've pasted a potential reference image for the food.

*[attached: stock sheet of six baked goods — cake slice, cherry pie, cupcake, macaron, brownie,
fruit tart]*

**Asked three questions** before building: how the coins should read, how literal the counter should
be, and what the deliverable was.

**Answered:** match the app's coin component · full counter band · static HTML mockup, no
interaction.

**Built** a first mockup — and got the approach wrong. It reused `conveyor-item`'s tray geometry,
`conveyor-belt`'s band classes, `player-wallet`'s panel structure and `bakery-game`'s layout bands,
and drew everything in SVG.

---

## 2 · Start over

> It looks like you may be referencing existing components beyond the coin which is explicitly what
> I don't want you to do. This should start over with a fresh context. Don't use SVG. Use the given
> png of foods as a color palette and extrapolate an overall styling guide.
>
> the rest of the original prompt still stands. With one other update.
> Remove the cash register and the glass case on the counter they take up too much space.
>
> Before building anything re-iterate what you are planning on doing.

**Sampled the palette** rather than picking one — k-means per item on the reference sheet, with the
background and outlines masked out. That produced sixteen fills with provenance (`#ECB06B` is the
pie shell, `#AEA3C2` is the tart's blueberry) and one finding: the reference outlines in a **warm**
near-black `#180C0A`, while the app inks in a **cool** `#1B2336`. Two different art directions.

**Restated the plan** and asked two questions the palette work had surfaced.

**Answered:** coin art is the one SVG exception, so the mockup's coins are literally the app's
coins · warm food, cool chrome — food gets the reference palette, the machinery stays in the app's
blues, and the counter's warmth becomes the boundary between them.

---

## 3 · Use the reference art, don't draw

> Finally, don't make your own food yet. Punch out the assets from the provided reference image and
> use those. We can build the food around it later

**Cut out six assets** — background flood-filled from the border (so whites *inside* an item
survive), watermark strip cropped, each trimmed to its bounding box.

**Built the mockup**: 1280×720, everything CSS except the coin faces and the goods.
Three structural decisions came out of building it:

- **A tray's deck rides *on* the belt**, with the price card hung over its front edge. A deck
  floating above the band reads as a shelf, and a shelf does not move.
- **The meters are ten discrete cells**, not a smooth fill. A K–2 kid can count cells; nobody can
  read a bar that is 30% along.
- **Every wallet total has an exact match on a belt** — 28¢, 45¢, 19¢, 42¢ — so the matching
  mechanic is demonstrated rather than implied.

Delivered with a styling guide: the swatch tables with provenance, six rules, what is drawn how, and
the open questions.

---

## 4 · The cake, three ways

> Now let's iterate on the cake to make it our own. The slice needs to sit on the tray. Create three
> variants that match that criteria

**Diagnosed the problem first.** The stock slice's base rises 18px across its width and only **14%**
of it is level — it is drawn in a mild perspective, so on a horizontal deck one corner lands and the
rest hangs.

**Found the second half of the answer**: a level base alone still reads as hovering. What turns a
level base into a resting one is a **contact shadow**, and it is the cheapest part of the drawing.

**Drew three**, all CSS, all 100% level footprint, one per belt so they could be judged at real size
in context: **A — Elevation** (survives smallest), **B — Three-quarter** (the only one that reads as
a solid standing on something, and it pays in height), **C — Squared slice** (most distinct
silhouette; at 76px the wedges can be confused with the pie).

Two implementation notes worth keeping: `clip-path` is applied *after* `filter`, so an outline made
of drop-shadows has to sit on a **parent** of the clipped shape or it clips its own outline away —
and chained drop-shadows **spike at acute vertices**, which threw a stray line off B's top face
until its recession was steepened.

---

## 5 · Not that — this

> I need you to update the assets to match the perspective of the game. For example the cake should
> look like this:

*[attached: revised cake — flat elevation, inset layer bands, frosting swirl → `cake.png`]*

> Can you provide a similar transformation to the brownie?

Started measuring the reference's construction in detail. **That was the wrong move** — the answer
was to use the supplied art, not to reverse-engineer a rule from it.

> no you are thinking way too hard about all of this, and your asset manipulation and creation is
> sub par. We'll figure out a different.
>
> Update the cake.png with the reference from my previous prompt.
> Then update the brownie reference with this one:
>
> Cut out the gray background

*[attached: revised brownie → `brownie.png`]*

**Cut out both, reverted the CSS cake variants**, and the mockup went back to being a frame that
shows supplied art rather than art it generated.

---

## 6 · The rest of the set

Four more, each the same operation: flood-fill the grey from the border, trim, and scale to the
set's own yardstick — the cake and brownie are both drawn at **≈33 px per real cm**, so every
subsequent asset was scaled from its real-world size rather than eyeballed.

> Here's a fruit tart alternate art. Remove the gray background and scale it so it fits in line with
> the cake and brownie:

*[→ `tart.png`, 264×117 — an 8cm tart]*

Flagged at this point: the tray fits each good with `object-fit: contain`, so a wide flat object
gets scaled to its width and ends up short while a tall one fills the height. Relative sizes are
normalised away on the belt.

> And here's the pie to make the same update:

*[→ `pie.png`, 297×188 — a 9cm slice; longest of the set, correctly shorter than the cake]*

> Here's the macron update:

*[→ `macaron.png`, 149×105 — a 4.5cm macaron, smallest in the set]*

> Update the cupcake to use this asset . You will have to delete the gray background.

*[→ `cupcake.png`, 190×259 — the last stock asset replaced]*

**Final set, all on one yardstick:**

| | | | | | |
| --- | --- | --- | --- | --- | --- |
| macaron | cupcake | cake | brownie | tart | pie |
| 149×105 | 190×259 | 215×216 | 240×97 | 264×117 | 297×188 |

---

## 7 · Corrections

> Can you force the macron scale down by 50% when on the tray it reads as too large

Built as a **per-good override**, not a one-off — `GOOD_SCALE = {'macaron': .5}`, applied about the
good's own base (`transform-origin: bottom center`) so a shrunk item still stands on the deck
instead of floating. Root cause: `background-size: contain` fits every good to the same box, which
flatters the small ones.

> Can you do a pass on the ducts that the conveyor belts feed into. They seem too chunky, Pull them
> back so they only extend 10 pixels into the scene. Make hard edges

Ducts went from 104px rounded housings to 10px flat ink slots — no radius, no shadow, no gradient,
no ribs. The oven/waste distinction survived as a coloured lip so the two ends still do not rely on
position alone.

Two knock-ons the pullback exposed and that were fixed rather than left: the **pulleys** had been
sized against the old housing and were left floating in the open reading as debris, so they went;
and the bottom belt was **cutting a price card exactly in half** at the frame edge, showing "0¢" for
a 60¢ tray.

> Maybe 10 pixels was too extreme, let's have them extend 20 pixels

20px, with the lip bumped 2px → 3px to stay proportionate.

> For the ducts have the conveyor belts run behind them and be layered behind the ducts. It should
> appear as if the conveyor belt feeds into the duct

The fix was **not** the layering — the duct's `z-index` was already in front. The belt simply
stopped at the duct's inner edge, so there was nothing to occlude. It now runs from −6 to 1286, past
the frame on both sides, so its capped end is always hidden inside a slot.

---

## 8 · The plan

> Can you make a plan to incorporate this art direction into the ui for the actual bakery game in
> the playcademy folder.
>
> The Player-Wallets should be relatively untouched, but we'll need to code new visuals for the
> ducts and the counters. The behavior of the conveyor belts running from one duct to the other. A
> refactor of the trays. A means to handle these new assets. It is critical that the game will use
> these new assets which will purposefully deviate from the otherwise SVG intent of the game. This
> is fine for now.
>
> The Deliverable for this is a MD plan that I can feed into a Claude Code instance to build out the
> ui for the multiplayer game based off of the mockup we've build here with high fidelity for the
> mockup

**Read the code first** — `bakery-game.js`, `conveyor-belt.js`, `views/CLAUDE.md`, the multiplayer
contract — so the plan targeted what is there rather than a guess at it. Three findings shaped it:

- The refactor is **contained**, because `createConveyorBelt` and `createConveyorItem` can keep their
  exact public shape. `bakery-game.js` barely moves.
- **The goods have no wire identity.** `item/spawned` carries `{ id, price }` and nothing else, but
  there are now six pastries. Derived as a pure hash of the item id — stable across clients, so four
  kids comparing screens see the same tray — with a server-side `kind` field flagged as the real
  long-term home.
- The SVG viewBox is what forces a fresh bake to **fade in rather than slide**. The first draft
  proposed converting the belt to DOM to escape it.

---

## 9 · Two hard boundaries

> The coin's must not be touched by this plan. The coins are reused across another lesson so they
> need to be kept consistent for that lesson even if that does come at odds to the art asset. And
> yes, don't adopt the mockup's warm ink either.
>
> Update the plan with that decision. Did you make any other judgement calls when building this
> plan?

Both moved from open questions to hard constraints. The coin boundary was written with its
*reason* — shared with the Lesson, where reading the coin is the exercise — and with the escape
hatches named so an implementer cannot reach for them: no Bakery-scoped override, no wrapper class,
no filter, no redraw. The one lever it keeps is setting `--pc-coin-size` on an ancestor.

**Ten judgement calls disclosed**, ranked by cost to reverse. The consequential ones: converting the
belt to DOM; demoting the server's `slotPitchPx` to advisory; deciding end slots must not be
occluded (so the game will *not* match the mockup at the edges); the frame moving 1200×800 →
1280×720; deleting `INCINERATOR_X`, a hook for planned M3 work; removing the pulleys.

---

## 10 · Keep the SVG

> Let's keep that SVG. I think we can extend the conveyor belt outside of the bounds of the screen
> so the fade in of a new item is hidden and the user only sees it on the next step when it slides
> into view.
>
> Remove the bought chip. I don't think we need it.
>
> The rest of the calls seem good. Go ahead and update the plan. Then present it to me as a set of
> steps and milestones that a Claude Code instance would handle

**The overscan is a better fix than the rewrite.** The viewBox widens by one slot at each end, the
inner group's translate absorbs it so belt-local x=0 is still slot 0 — nothing that calls
`slotCenter()` moves — and a tray absent from the previous occupancy animates from an off-stage
`entryCenter()` into its slot with the opacity ramp front-loaded, fully opaque before it clears the
duct. The belt's own CSS subtracts the overscan so the caller never learns it exists.

The one technical objection to staying in SVG — standing a raster good on a deck — dissolved on
`preserveAspectRatio="xMidYMax meet"`, which is exactly `object-fit: contain` plus
`object-position: bottom center`.

Bought chip cut. Plan reorganised into **six milestones**, each leaving the app building and
running: Foundations → Tray → Belt → Room → Floor → Hardening.

---

## Decision ledger

| Decision | Where it landed |
| --- | --- |
| Food warm, machinery cool, one ink | Styling guide |
| Palette sampled from reference, never chosen | Styling guide, with per-swatch provenance |
| Goods are raster; everything else stays SVG | Plan §2 |
| Coins untouchable — shared with the Lesson | Plan §7, hard boundary |
| App ink stays `#1B2336`, not the mockup's warm `#201611` | Plan §5, settled |
| Coin metals stay as shipped | Plan §5 + §7, settled |
| No cash register, no glass case | Plan W4 |
| Ducts are 20px hard-edged slots, not housings | Plan W3 |
| Belt runs past the frame and behind the ducts | Plan W6 |
| Belt viewBox overscans so spawns slide, not pop | Plan W6 |
| Per-good scale correction on the tray | Plan W1 |
| Good identity derived from item id, not the wire | Plan W1 + §9 |
| Bought chip cut | Plan W9 |
| Pulleys removed | Plan W6 |

## Still open

1. The good's identity belongs on the wire as a `kind` field, server-side.
2. Six goods across twenty-four slots repeats three or four times on screen — grow the set to about
   twelve, or accept that the price does all the identifying.
3. The cutouts are placeholders and need licensing or a redraw. Cookies, bread and flan are named in
   the brief and are not in the set.
