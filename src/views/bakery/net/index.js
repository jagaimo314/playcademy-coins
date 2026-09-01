import { createFakeRoomAdapter } from './fake-room-adapter.js'
import { createWsRoomAdapter } from './ws-room-adapter.js'

/**
 * The single place the transport is chosen. Swapping backends is one change
 * here; nothing in `bakery.view.js` moves.
 *
 * The real adapter is the default now that the server exists. The fake is kept
 * rather than deleted — it is what lets the whole Bakery view be built, demoed
 * and tested with no server running, which matters for CI and for anybody
 * opening this repo without a terminal spare. `VITE_USE_FAKE_ROOM=1` picks it.
 */
export function createRoomAdapter(options = {}) {
    const fake = options.fake ?? import.meta.env?.VITE_USE_FAKE_ROOM === '1'

    return fake ? createFakeRoomAdapter(options) : createWsRoomAdapter(options)
}
