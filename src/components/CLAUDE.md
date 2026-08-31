# `components/`

Shared, view-agnostic UI. See `docs/architecture.md` for the contract this folder
implements; what follows is the working detail.

**The bar for living here: two views genuinely need it.** A component only the Lesson will
ever use belongs in `views/lesson/`, not here. That rule is what keeps this folder
meaningful — keep it small on purpose.

**Imports flow one way.** A component may import `lib/`. It must never import from
`views/`, and must never read the store. Views read state and pass values down;
components report back through callbacks passed in (`onClick`, `onSubmit`, `onReveal`).

## Inventory

| Component | Purpose |
| --- | --- |
| [`coin/`](coin/CLAUDE.md) | One coin. The most reused thing in the app — **read its own CLAUDE.md before touching it or anything that draws coins.** |
| `coin-pile/` | Rows of one denomination, plus the gestures the Lesson teaches with: a boundary round the pile, a boundary round one coin, flipping the pile to its value side and back. |
| `answer-input/` | The typed-answer field. The brief forbids multiple choice, so this is how every answer is given. |
| `narrator/` | Web Speech API wrapper. Always renders the spoken text as a caption too. |
| `primary-button/` | The app's main button. A disabled one renders its reason. |
| `progress-bar/` | Position through a set of steps. Shows position, not score, on purpose. |
| `Grid.js` | Plain SVG grid: lines, plus cell ↔ row/col maths in any reading `direction`. |
| `SkipCountGrid.js` | `Grid` + cell labels, interval indicators, the reveal animation, cell highlights, and the student's answer star. |
| `SkipCountCurrencyGrid.js` | `SkipCountGrid` in cents, with a ghosted real coin as each indicator. |

## Two shapes, and when to use which

**Factory function — the default.** `createThing(props)` returns `{ el, update?, destroy }`.
No classes, no base class, no lifecycle framework.

**Class — only the grid family.** `Grid → SkipCountGrid → SkipCountCurrencyGrid` are
classes because inheritance is the actual design: subclasses override drawing hooks
(`formatCellLabel`, `createSkipIndicator`, `describe`) and reuse the geometry beneath.
This is a deliberate divergence from the factory rule in `docs/architecture.md`, and it
does not license new classes elsewhere. If you are reaching for one, you probably want a
factory that composes.

### The subclass trap

`draw()` calls overridable hooks, so it cannot run until the *most derived* constructor has
set its own fields. Every class in the chain therefore ends its constructor with:

```js
if (new.target === SkipCountCurrencyGrid) this.draw()
```

Add a subclass and it needs the same guard with its own name — otherwise the parent draws
first, calling your hooks before your fields exist.

## Rules that bite

**Never mount yourself.** Hand back `el`; the caller decides where it goes. This is what
makes the same component work in the Lesson's fixed frame and in the Bakery's flow layout.

**`destroy()` is mandatory** when a component holds anything beyond its own subtree —
timers, window listeners, `speechSynthesis`, network subscriptions, **or child components**.
`coin-pile` destroys its coins; `SkipCountCurrencyGrid` destroys its ghost coins;
`narrator` cancels page-global speech. Removing the element is not enough.

**Build DOM with `el()` / `svg()` from `lib/dom.js`. No `innerHTML` anywhere** — room codes
and player names arrive off the wire.

`lib/dom.js` also gives you two things worth knowing:

- **`style` accepts `--custom` properties** and routes them through `setProperty`. That is
  how `Grid` publishes `--pc-grid-cell` so its CSS can scale labels with the cell.
  `Object.assign(node.style, …)` silently drops custom properties — do not go back to it.
- **`animationSettled(animation)`** — await this, never `animation.finished` directly, for
  any script-driven animation a sequence depends on. An animation only advances while the
  page is painting; `finished` simply never settles when it is not (backgrounded tab), and
  rejects outright when cancelled. `coin` and `coin-pile` both go through it.

## CSS

- One stylesheet per component, imported by its JS module, so Vite pulls in only what the
  loaded views use.
- Root class matches the component (`.pc-coin`, `.pc-pile`, `.pc-skipgrid__*`). Elements
  are `__element`, state is `.is-state`. **No global selectors from a component file.**
- Colour, spacing, radius and type come from `styles/tokens.css`. No raw hex outside that
  file. `Grid.css` / `SkipCountGrid.css` add literal fallbacks (`var(--pc-ink, #1B2336)`)
  on purpose — those grids are meant to survive being dropped into a page that has not
  loaded the tokens. Follow that only where the same is true.
- A component's own layout is its business; where it sits is the caller's. `coin-pile`
  owns its rows-of-five grid, the Lesson owns where the pile is.

## Accessibility floor

Non-negotiable, and cheap if done as you go:

- **Never encode meaning in colour alone.** The answer star turns green or red *and*
  `SkipCountGrid.describeAnswer()` puts the verdict into the grid's `aria-label`;
  `answer-input` colours its border *and* writes a hint. Match that.
- Honour `prefers-reduced-motion`. CSS rules in `base.css` cover CSS animation; anything
  driven from script must check `prefersReducedMotion()` itself.
- Label every control, keep focus visible, and keep hit targets at `--pc-tap-min` — these
  are K–2 hands, often on a tablet.

## Before you finish

Open the manual test pages with `npm run dev` (they are not routes; nothing imports them):

- `/src/components/test/skipCountGrid.html` — all three grids, plus 22 self-checks that
  must report 0 failures. Any change to grid geometry or cell numbering goes through here.
- `/src/components/test/coins.html` — every denomination on every face, plus a live flip.

Then `npm run build` and check it is clean.
