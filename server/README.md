# server/

The multiplayer backend for the Bakery. Not built yet.

The client talks to it only through the adapter interface in
[`docs/multiplayer-contract.md`](../docs/multiplayer-contract.md), and currently runs
against `src/views/bakery/net/fake-room-adapter.js` — an in-memory stand-in with
no network.

When this lands it gets its own `package.json`, so the frontend build stays
independent of it.
