# `components/coin`

The most reused component in the app. The Lesson counts piles of these; the Bakery will
hand them over at a till. Everything else about a coin — its value, its name, how a list
of them sums — lives in `lib/money.js`, not here. **This folder only draws.**

| File | What it is |
| --- | --- |
| `coin.js` | `createCoin()` — the component. |
| `coin-faces.js` | The artwork. Pure SVG builders, no component knowledge. |
| `coin.css` | Sizing, metal, faces, captions, plus the shared `.pc-coin-row`. |

## The handle

```js
const coin = createCoin({ denomination, displayType, selected, caption, onClick })

coin.el                     // root element — the caller mounts it
coin.denomination           // 'penny' | 'nickel' | 'dime' | 'quarter'
coin.value                  // face value in cents
coin.displayType            // getter: the face showing right now
coin.update({ selected, caption, displayType })
coin.flipCoin(changeTo?)    // → Promise<face showing>
coin.destroy()
```

## The three display types

`Generic`, `Heads`, `Tails` — exported as `DISPLAY_TYPES`.

- **`Generic`** is the *value* side: no artwork, a plain gold disc with `5¢` as text. It
  is the abstract "a coin" token, not a particular coin, which is why it drops the metal
  colour for gold whatever the denomination.
- **`Heads` / `Tails`** are the *picture* sides: hand-drawn SVG filling the disc, in the
  coin's own metal. The value text is hidden.

The pairing matters pedagogically. The Lesson rests its piles on `Heads` and flips them to
`Generic` and back to say "remember, five cents" — the value is *revealed*, then gone
again, because reading a coin from its picture is the skill being taught. Never put value
text on the artwork.

`flipCoin()` notes:

- Flips **queue** rather than interrupt, so a double-tap lands on the face you would
  predict instead of tearing mid-animation.
- With no argument it toggles `Heads` ↔ `Tails`. **`Generic` has no other side** — a
  bare `flipCoin()` on a Generic coin is a no-op that resolves immediately. Pass the
  target face explicitly when you need a Generic coin to move.
- It always resolves, even on a page that has stopped painting (backgrounded tab), because
  both halves await through `animationSettled()` from `lib/dom.js`. **Do not replace those
  with a raw `await animation.finished`** — a caller sequencing flips would deadlock.
- Honours `prefers-reduced-motion` by swapping the face with no animation.

## Gotchas

**`onClick` is fixed at construction.** It decides whether the root is a `<button>` or a
`<div>`, so `update()` cannot make a coin interactive or inert later. If interactivity
changes, rebuild the coin. (`coin-pile` does exactly this — it takes `onCoinTap` at
construction and the Lesson rebuilds the pile per problem.) To vary *what* a tap means
without rebuilding, pass a stable handler that dispatches through a mutable reference —
see how `lesson.view.js` swaps meaning per beat.

**`update()` handles three keys only**: `selected`, `caption`, `displayType`. Not
`denomination` — that is structural, so rebuild.

**Never set `width`/`height` on `.pc-coin`.** Size comes from `--pc-coin-size` (a quarter)
scaled by each coin's `--pc-coin-ratio`, which is its real diameter against a quarter's. A
pile keeps the proportions a child sees in their hand. Raise `--pc-coin-size` on an
ancestor to scale a whole pile in step. The one place that overrides this is the chart's
ghost coin (`.pc-currencygrid__ghost .pc-coin`), which must fit a fixed cell.

**`caption` is the running-total slot** — `update({ caption: '15¢' })` writes under the
coin, `caption: null` clears it. The Lesson uses it twice per problem: ordinals while the
pile is counted, then running cents while it is skip-counted.

## Accessibility

- The accessible name is `"nickel, 5¢"` and is set from `lib/money.js`, so it stays right
  when the artwork changes. Artwork is `aria-hidden`.
- `is-selected` is a visible outline **and** sets `aria-pressed` on interactive coins.
  Never let the outline be the only signal that a coin has been counted — pair it with a
  caption, as the Lesson does.
- Interactive coins are real `<button>`s, so they are keyboard-reachable for free. Keep it
  that way: if you add a click target, add it as a button, not a click handler on a div.

## Changing things

**A new denomination** touches three places: `COINS` in `lib/money.js` (the source of
truth), a `--pc-coin-ratio` / metal block in `coin.css`, and `HEADS` + `TAILS` entries in
`coin-faces.js`. Miss the last and `createCoinArt` returns `null`, which renders as a bare
metal disc rather than throwing.

**New artwork** is authored in a `0 0 100 100` field inscribed in the disc, built with the
`path`/`line`/`circle`/`ellipse`/`rect`/`group`/`mirrored` helpers at the top of
`coin-faces.js`. Take colour from the `--pc-coin-*` custom properties — never a literal —
so a penny's art is copper and a dime's is silver from one drawing. Portraits start from
the shared `PROFILE` bust and add the one feature a child can name.

## Who uses it

- `components/coin-pile` — rows of coins, plus the boundary/flip gestures the Lesson needs.
- `components/SkipCountCurrencyGrid` — a ghosted coin per interval, inside a
  `foreignObject`. `.pc-currencygrid__ghost` resizes it to the cell and hides
  `.pc-coin__face`, because the cell label already shows the running total.
- `src/components/test/coins.html` — every denomination × every face, plus a live flip.
  Open it after any change here.
