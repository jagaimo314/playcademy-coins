# Docs

Reference material for the Playcademy take-home build. Read in this order.

| Doc | What it covers |
| --- | --- |
| [take-home.html](take-home.html) | The original assignment brief (source of truth for requirements). |
| [overview.md](overview.md) | What we are building: the three views, navigation rules, and how they map to the brief. |
| [architecture.md](architecture.md) | Folder structure, routing, view lifecycle, component contract, state, tooling. |
| [multiplayer-contract.md](multiplayer-contract.md) | Transport-agnostic room/message contract and the client-side network adapter interface. |
| [bakery-backend-plan.md](bakery-backend-plan.md) | The Bakery game design and the plan for `server/`: authoritative loop, protocol additions, content generation, milestones. |

## Decisions already made

- **Vanilla JS, ES6 modules.** No frontend framework. Native `class`, `import`/`export`, template literals, `async`/`await`.
- **SPA with a hash router.** One `index.html`; views mount and unmount into a single root element.
- **Vite** as the build tool. It bundles and serves only — the source stays vanilla.
- **Multiplayer transport is deferred.** We define the contract now and pick the implementation later.

## Status

Scaffolded and running. `npm install && npm run dev`.

| Piece | State |
| --- | --- |
| Build, router, store, persistence | Done. |
| `lib/` — `dom`, `emitter`, `money`, `room-code` | Done. |
| Shared components — coin, button, answer-input, narrator, progress-bar | Done. |
| Home view | Done, including the unlock gate and code validation. |
| Lesson view | Shell. Components wired; teaching flow, content, and scoring not built. |
| Bakery view | Lobby works against an in-memory fake adapter. No game, no backend. |
| Knowledge graph (Part 1) | Not started. |

The Lesson view carries a temporary **"Dev: mark lesson complete"** button so the Bakery
unlock can be exercised before the lesson exists. Delete it once the summary screen sets
`lesson.completed` for real.
