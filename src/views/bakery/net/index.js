import { createFakeRoomAdapter } from './fake-room-adapter.js'

/**
 * The single place the transport is chosen. Swapping to a real backend is one
 * import change here; nothing in `bakery.view.js` moves.
 */
export function createRoomAdapter(options) {
    return createFakeRoomAdapter(options)
}
