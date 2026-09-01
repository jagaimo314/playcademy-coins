/**
 * Every live room, by code.
 *
 * Rooms are ephemeral by contract — they live as long as the game does and are
 * dropped when empty — so this is a `Map` and there is no database, no Redis
 * and nothing to migrate. When the process restarts, every bakery is gone, and
 * that is the intended behaviour rather than a limitation to apologise for.
 */

import { CODE_ALPHABET, CODE_LENGTH } from '../../../src/lib/room-code.js'

/**
 * How long an empty room is kept before it is swept.
 *
 * Not zero. The host is briefly the only player and a refresh empties the room
 * for a moment; dropping it instantly would mean a child who reloaded the page
 * came back to `ROOM_NOT_FOUND` holding a code they had just read out to three
 * friends.
 */
const EMPTY_ROOM_TTL_MS = 30000

const SWEEP_INTERVAL_MS = 5000

export function createRegistry({ now = () => Date.now() } = {}) {
    const rooms = new Map()
    /** `code -> the timestamp it went empty`. Absent means it is not empty. */
    const emptySince = new Map()

    /**
     * Codes are issued here rather than by the client's `generateCode()`,
     * because only this side can promise uniqueness. The client keeps its copy
     * for the fake adapter and for tests, where a collision costs nothing.
     */
    function issueCode() {
        for (let attempt = 0; attempt < 100; attempt += 1) {
            const bytes = new Uint32Array(CODE_LENGTH)
            crypto.getRandomValues(bytes)

            const code = Array.from(bytes, byte => CODE_ALPHABET[byte % CODE_ALPHABET.length]).join('')
            if (!rooms.has(code)) return code
        }

        // 30^4 is 810,000 codes. A hundred consecutive collisions means the
        // bakery is impossibly full, not that we were unlucky.
        throw new Error('Could not issue a free room code')
    }

    function add(room) {
        rooms.set(room.code, room)
        emptySince.set(room.code, now())
        return room
    }

    function markActivity(code) {
        const room = rooms.get(code)
        if (!room) return

        if (room.playerCount > 0) emptySince.delete(code)
        else if (!emptySince.has(code)) emptySince.set(code, now())
    }

    function drop(code) {
        const room = rooms.get(code)
        rooms.delete(code)
        emptySince.delete(code)
        room?.destroy()
    }

    function sweep() {
        const cutoff = now() - EMPTY_ROOM_TTL_MS

        for (const [code, since] of emptySince) {
            if (since <= cutoff) drop(code)
        }
    }

    const timer = setInterval(sweep, SWEEP_INTERVAL_MS)
    timer.unref?.()

    return {
        issueCode,
        add,
        markActivity,
        drop,
        sweep,

        get(code) {
            return rooms.get(code) ?? null
        },

        get size() {
            return rooms.size
        },

        /** Every room, for the health endpoint and for tests. */
        list() {
            return [...rooms.values()]
        },

        stop() {
            clearInterval(timer)
            for (const room of rooms.values()) room.destroy()
            rooms.clear()
            emptySince.clear()
        },
    }
}
