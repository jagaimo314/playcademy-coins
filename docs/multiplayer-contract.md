# Multiplayer contract

**Status: provisional.** The transport is deliberately undecided. This doc defines the room model, the message contract, and the client-side adapter interface, so the Bakery view can be built and tested against a fake adapter before any server exists. Swapping in a real transport should touch one file.

## Room model

- A **room** is created by a host and identified by a short **code** the host reads aloud to friends.
- The code is 4 characters, uppercase, drawn from an alphabet with the ambiguous glyphs removed (no `O`/`0`, no `I`/`1`/`L`). Kids type these.
- A room holds 2 or more **players**. One is the host.
- Rooms are ephemeral. They live as long as the game does and are dropped when empty. Nothing is persisted server-side.
- **The server is authoritative** for game state. Clients send intents, not results — a client must never be able to declare itself the winner.

## Client adapter interface

The only thing the Bakery view is allowed to know about networking:

```js
export function createRoomAdapter() {
  return {
    // Create a room. Resolves with the code to share.
    host({ playerName }),          // → Promise<{ code, playerId }>

    // Join an existing room by code.
    join({ code, playerName }),    // → Promise<{ playerId }>

    // Send an intent to the server.
    send(type, payload),           // → void

    // Subscribe to a server message type. Returns an unsubscribe function.
    on(type, handler),             // → () => void

    // Leave and tear down the connection.
    leave(),                       // → void

    // 'idle' | 'connecting' | 'open' | 'reconnecting' | 'closed'
    get status(),
  };
}
```

Two implementations are planned:

- **`fakeRoomAdapter`** — in-memory, no network. Simulates a second player on a timer. Lets the whole Bakery view be built and demoed offline. Build this first.
- **A real adapter** — whatever transport wins. Same shape.

`bakery.view.js` imports the adapter through a single module so the choice is one import swap.

## Message contract

Two envelopes, both `{ type, payload }`. Types are namespaced with `/`.

### Client → server (intents)

| Type | Payload | Meaning |
| --- | --- | --- |
| `player/ready` | `{ ready }` | Toggle ready state in the lobby. |
| `game/start` | — | Host only. Begin the game. |
| `action/*` | game-specific | A player action. Concrete actions are defined once the game design is fixed. |
| `ping` | `{ t }` | Liveness / latency probe. |

### Server → client (events)

| Type | Payload | Meaning |
| --- | --- | --- |
| `room/state` | `{ code, players, phase, game }` | Full snapshot. Sent on join and after any change the client cannot derive. |
| `player/joined` | `{ player }` | Someone arrived. |
| `player/left` | `{ playerId }` | Someone left or dropped. |
| `game/started` | `{ game }` | Phase moved to `playing`. |
| `game/patch` | partial `game` | Incremental state update. |
| `game/ended` | `{ results }` | Final state. |
| `error` | `{ code, message }` | `ROOM_NOT_FOUND`, `ROOM_FULL`, `GAME_IN_PROGRESS`, `INVALID_ACTION`. |

`phase` is one of `lobby`, `playing`, `ended`.

**Snapshot-plus-patch, not event-sourcing.** A client that misses messages — a reconnect, a backgrounded tab, a flaky school wifi connection — recovers by asking for `room/state` rather than by replaying history. Simpler to reason about and much easier to demo.

## Things that must work

The brief says the multiplayer has to actually work and be explainable on a walkthrough. That means the unglamorous cases:

- **A player disconnects mid-game.** The room survives; the others keep playing.
- **The host disconnects.** Either host migrates to another player, or the room ends cleanly. Pick one and say which.
- **A bad code is entered.** Clear, kid-readable error — not a stack trace, not a silent no-op.
- **Reconnect.** A dropped client rejoins the same room and gets a fresh `room/state`.
- **Two players act simultaneously.** The server resolves order; ties are decided server-side, never client-side.

## Deferred decisions

- Transport: raw WebSocket vs. a hosted realtime service.
- Hosting for the backend.
- Whether player identity persists across sessions or is per-room and disposable.
- The concrete `action/*` set — blocked on the game design.
