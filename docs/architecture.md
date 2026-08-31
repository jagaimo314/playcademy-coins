# Frontend architecture

Vanilla JS, ES6 modules, no framework. Vite bundles and serves; it does not change how the source is written.

## Folder structure

```
/
├─ index.html                  # the only HTML file — SPA shell
├─ package.json
├─ vite.config.js
├─ public/                     # copied verbatim: coin art, audio, favicon
├─ src/
│  ├─ main.js                  # entry point: boot store, register routes, start router
│  ├─ router.js                # hash router
│  ├─ routes.js                # route table: pattern → view factory
│  │
│  ├─ views/                   # one folder per view; NOT shared between views
│  │  ├─ home/
│  │  │  ├─ home.view.js
│  │  │  └─ home.css
│  │  ├─ lesson/
│  │  │  ├─ lesson.view.js     # orchestrates the instruction → practice flow
│  │  │  ├─ lesson.content.js  # narration script + the 10 problems, as data
│  │  │  ├─ diagnostics.js     # classifies wrong answers into error types
│  │  │  └─ lesson.css
│  │  └─ bakery/
│  │     ├─ bakery.view.js
│  │     ├─ net/               # network adapter implementation (see multiplayer-contract.md)
│  │     └─ bakery.css
│  │
│  ├─ components/              # shared, view-agnostic, independently usable
│  │  ├─ coin/
│  │  ├─ primary-button/
│  │  ├─ answer-input/
│  │  ├─ narrator/             # Web Speech API wrapper
│  │  └─ progress-bar/
│  │
│  ├─ state/
│  │  ├─ store.js              # tiny observable store
│  │  └─ persistence.js        # localStorage read/write, versioned key
│  │
│  ├─ lib/                     # pure functions, no DOM
│  │  ├─ dom.js                # el() element helper
│  │  ├─ emitter.js            # minimal event emitter
│  │  └─ money.js              # coin denominations, values, formatting, sums
│  │
│  └─ styles/
│     ├─ tokens.css            # CSS custom properties: colour, spacing, type
│     └─ base.css              # reset + element defaults
│
├─ server/                     # multiplayer backend — empty for now
└─ docs/
```

### The dependency rule

Imports flow one way only:

```
views → components → lib
  ↓         ↓
      state
```

- **`lib/`** imports nothing from the app. Pure, testable, no DOM.
- **`components/`** may import `lib/`. It must not import from `views/` or know which view is rendering it.
- **`views/`** may import anything.
- **A component that only one view will ever use belongs in that view's folder, not in `components/`.**

That last rule is what keeps `components/` meaningful. The shared set is small on purpose: the coin, the button, the typed-answer input, the narrator, the progress bar. Those are the pieces the Lesson and the Bakery genuinely both need.

## Component contract

Every shared component is a **factory function** returning a small handle. No classes, no base class, no lifecycle framework.

```js
// components/coin/coin.js
export function createCoin({ denomination, onClick }) {
  const el = /* build DOM */;

  return {
    el,                        // the root HTMLElement — caller decides where it goes
    update(next) { /* ... */ },// re-render from new props
    destroy() { /* ... */ },   // remove listeners, cancel timers, drop refs
  };
}
```

Rules:

- **The component never mounts itself.** It hands back `el`; the caller appends it. This is what makes a component reusable across views with different layouts.
- **`destroy()` is mandatory** if the component attaches anything outside its own subtree — window listeners, timers, `speechSynthesis` utterances, network subscriptions. Removing the element is not enough.
- **Communication out is via callbacks passed in** (`onClick`, `onSubmit`), not global events. Components do not read the store; views read the store and pass values down.
- **Styles are scoped by a root class** matching the component name (`.pc-coin`). No global selectors from a component file.

## View contract

A view is the same shape as a component, one level up:

```js
// views/home/home.view.js
export function createHomeView({ params, store }) {
  const el = /* ... */;
  return { el, destroy() { /* ... */ } };
}
```

The router owns the mount point and the lifecycle: it calls `destroy()` on the outgoing view *before* mounting the incoming one. Views never call each other; they navigate.

## Routing

Hash-based, so any static host works with no server rewrite rules.

| Route | View | Notes |
| --- | --- | --- |
| `#/` | Home | Default. Unknown routes redirect here. |
| `#/lesson` | Lesson | |
| `#/bakery` | Bakery | Hosts a new room. Guarded on lesson completion. |
| `#/bakery?code=XXXX` | Bakery | Joins an existing room. |

The router is roughly 60 lines: listen to `hashchange`, parse `#/path?query`, match against the route table, destroy the current view, mount the new one, scroll to top.

**Route guards** live in the route table, not inside the views — a route entry can declare a `guard` that returns a redirect target. The Bakery *host* path is guarded on the lesson-complete flag so a typed URL cannot skip the menu.

## State

One tiny observable store. No Redux, no reducers.

```js
store.get('lesson.completed');
store.set('lesson.completed', true);
const off = store.subscribe('lesson.completed', value => { /* ... */ });
```

Two categories of state, kept apart:

- **Persistent** — survives reload, written through to `localStorage` under a single versioned key (`playcademy.v1`). Right now this is essentially just lesson progress and the diagnostic report.
- **Ephemeral** — in memory only. Live game state, current problem index, network status. Never persisted; the server is authoritative for anything multiplayer.

Persisted state is read once at boot and validated. A shape mismatch resets to defaults rather than throwing — a kid should never hit a blank screen because of a stale key.

## Styling

Plain CSS. `styles/tokens.css` holds custom properties for colour, spacing, radius, and type scale; everything else references them. Component CSS lives next to the component and is imported by its JS module, so Vite pulls in only what the loaded views use.

The take-home brief's own page has a strong visual identity — rounded sans headings, hard offset shadows, a sky/blue/green/gold palette. Matching it is a cheap, legible win for `FRONTEND.pdf`.

Accessibility floor: honour `prefers-reduced-motion`, keep focus visible, label every control, and never encode meaning in colour alone.

## Tooling

- **Vite**, vanilla template. `npm run dev` for HMR, `npm run build` for a static bundle, `npm run preview` to check the build.
- Output is a static bundle deployable to any static host.
- No frontend runtime dependencies. If one becomes necessary, it gets justified in `FRONTEND.pdf`.
- `server/` will get its own `package.json` when the backend lands, so the frontend build stays independent of it.

## Conventions

- ES modules everywhere; no CommonJS, no globals.
- Named exports. Default exports only for a module with exactly one obvious thing in it.
- Files are `kebab-case.js`; view files carry a `.view.js` suffix.
- Factory functions are `createThing()`.
- No `innerHTML` with interpolated user or network data — build nodes with the `el()` helper. Room codes and player names come off the wire.
