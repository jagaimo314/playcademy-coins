import { createEmitter } from '../../../lib/emitter.js'
import { generateCode, normalizeCode, isValidCode } from '../../../lib/room-code.js'

/**
 * In-memory implementation of the room adapter contract
 * (see docs/multiplayer-contract.md). No network, no server.
 *
 * This exists so the whole Bakery view can be built, demoed, and tested before
 * a backend is chosen. It fakes a second player arriving shortly after you
 * open a room, so the lobby has something to render.
 */
export function createFakeRoomAdapter({ joinDelayMs = 1200 } = {}) {
    const emitter = createEmitter()
    const timers = new Set()

    let status = 'idle'
    let room = null

    function later(fn, ms) {
        const id = setTimeout(() => {
            timers.delete(id)
            fn()
        }, ms)
        timers.add(id)
        return id
    }

    function broadcastState() {
        emitter.emit('room/state', structuredClone(room))
    }

    function makePlayer(name, isHost) {
        return { id: `p-${timers.size}-${name}`, name, isHost, ready: false }
    }

    return {
        get status() {
            return status
        },

        host({ playerName = 'You' } = {}) {
            status = 'connecting'
            const code = generateCode()
            const me = makePlayer(playerName, true)

            room = { code, phase: 'lobby', players: [me], game: null }
            status = 'open'

            // A friend turns up a moment later.
            later(() => {
                if (!room) return
                const friend = makePlayer('Sam', false)
                room.players.push(friend)
                emitter.emit('player/joined', { player: friend })
                broadcastState()
            }, joinDelayMs)

            later(broadcastState, 0)

            return Promise.resolve({ code, playerId: me.id })
        },

        join({ code, playerName = 'You' } = {}) {
            const normalized = normalizeCode(code)

            if (!isValidCode(normalized)) {
                status = 'closed'
                return Promise.reject(
                    Object.assign(new Error('That bakery code is not right.'), { code: 'ROOM_NOT_FOUND' }),
                )
            }

            status = 'connecting'
            const host = makePlayer('Sam', true)
            const me = makePlayer(playerName, false)

            room = { code: normalized, phase: 'lobby', players: [host, me], game: null }
            status = 'open'

            later(broadcastState, 0)

            return Promise.resolve({ playerId: me.id })
        },

        send(type, payload) {
            // TODO: the real adapter forwards to the server. The fake echoes the
            // few intents the lobby needs so the UI can be exercised.
            if (type === 'game/start' && room) {
                room.phase = 'playing'
                emitter.emit('game/started', { game: room.game })
                broadcastState()
                return
            }

            console.debug('[fake-adapter] unhandled intent', type, payload)
        },

        on(type, handler) {
            return emitter.on(type, handler)
        },

        leave() {
            for (const id of timers) clearTimeout(id)
            timers.clear()
            emitter.clear()
            room = null
            status = 'closed'
        },
    }
}
