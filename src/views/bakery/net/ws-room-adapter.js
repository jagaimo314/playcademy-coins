import { createEmitter } from '../../../lib/emitter.js'
import { normalizeCode } from '../../../lib/room-code.js'

/**
 * The real transport: one WebSocket to the bakery server.
 *
 * Same shape as `fake-room-adapter.js` — `host`, `join`, `send`, `on`, `leave`,
 * `status` — because that is the whole contract the Bakery view is allowed to
 * know about networking. The fake is not thrown away now this exists; it keeps
 * the view buildable offline and is what `net/index.js` falls back to.
 *
 * Everything above this file deals in `{ type, payload }`. Everything below it
 * is frames and reconnects.
 */

/**
 * In dev the frontend is on Vite's `:5173` and the server on `:8787`, so the
 * URL has to be given. In production one process serves both, so the socket is
 * simply this page's origin with the scheme swapped — no config, no CORS, and
 * nothing to get wrong at deploy time.
 */
function defaultUrl() {
    const configured = import.meta.env?.VITE_WS_URL
    if (configured) return configured

    const { protocol, host } = globalThis.location
    return `${protocol === 'https:' ? 'wss:' : 'ws:'}//${host}/ws`
}

/** Where a resume token lives. `sessionStorage`, so it dies with the tab. */
const TOKEN_KEY = 'pc.bakery.resume'

export function createWsRoomAdapter({ url = defaultUrl(), syncIntervalMs = 10000 } = {}) {
    const emitter = createEmitter()

    let socket = null
    let status = 'idle'
    let syncTimer = null

    /**
     * The last five round trips, smallest first. The *minimum* is used rather
     * than the mean because a slow sample is always a queueing delay and never
     * a clock difference — averaging them in would drag the estimate towards
     * whatever the network was doing at the time.
     *
     * Used only to lag-compensate claims. Nothing about rendering depends on
     * it: the belt is told its occupancy and predicts nothing.
     */
    let offsets = []

    function setStatus(next) {
        if (status === next) return
        status = next
        emitter.emit('status', status)
    }

    function open() {
        return new Promise((resolve, reject) => {
            setStatus('connecting')
            socket = new WebSocket(url)

            socket.addEventListener('open', () => {
                setStatus('open')
                resolve()
            })

            socket.addEventListener('message', event => receive(event.data))

            socket.addEventListener('close', () => {
                stopSync()
                setStatus('closed')
                emitter.emit('transport/closed', {})
            })

            socket.addEventListener('error', () => {
                // `error` never carries a reason in browsers, and `close`
                // always follows it. Rejecting here is what turns a refused
                // connection into a message the lobby can render.
                if (status === 'connecting') reject(new Error('Could not reach the bakery.'))
            })
        })
    }

    function receive(raw) {
        let message

        try {
            message = JSON.parse(raw)
        } catch {
            return
        }

        if (!message || typeof message.type !== 'string') return

        if (message.type === 'time/sync') {
            recordSync(message.payload)
            return
        }

        // Remember the token the moment it arrives, not when the view gets
        // round to it — a tab that closes between the two would lose the seat.
        if (message.type === 'room/joined' && message.payload?.resumeToken) {
            try {
                globalThis.sessionStorage?.setItem(TOKEN_KEY, message.payload.resumeToken)
            } catch {
                // Private browsing can refuse. Losing a reconnect is survivable;
                // failing to join over it is not.
            }
        }

        emitter.emit(message.type, message.payload ?? {})
    }

    function raw(type, payload) {
        if (socket?.readyState !== WebSocket.OPEN) return
        socket.send(JSON.stringify({ type, payload }))
    }

    /* ----------------------------------------------------------- clock sync */

    function startSync() {
        raw('time/sync', { t0: Date.now() })
        syncTimer = setInterval(() => raw('time/sync', { t0: Date.now() }), syncIntervalMs)
    }

    function stopSync() {
        clearInterval(syncTimer)
        syncTimer = null
    }

    function recordSync({ t0, t1 }) {
        const rtt = Date.now() - t0
        offsets = [...offsets, { rtt, offset: t1 - (t0 + rtt / 2) }]
            .sort((a, b) => a.rtt - b.rtt)
            .slice(0, 5)
    }

    /** Our best guess at the server's clock, for stamping a claim. */
    function serverNow() {
        return Date.now() + (offsets[0]?.offset ?? 0)
    }

    /* --------------------------------------------------------------- public */

    /**
     * Both `host` and `join` are "open a socket, say one thing, wait for
     * `room/joined`". The difference is a single message type, so they share
     * everything else — including the error path, which is the part that
     * actually has to be right.
     */
    function enter(type, payload) {
        return open().then(() => new Promise((resolve, reject) => {
            const offJoined = emitter.on('room/joined', message => {
                offJoined()
                offError()

                // Only now. `room/host` and `room/join` are the only messages a
                // socket may send before it is in a room, so starting the sync
                // on `open` earned an immediate INVALID_ACTION — which then
                // rejected this very promise and left a working lobby looking
                // like a failed connection.
                startSync()

                resolve({ code: message.code, playerId: message.playerId, colorSlot: message.colorSlot })
            })

            const offError = emitter.on('error', message => {
                offJoined()
                offError()
                setStatus('closed')
                reject(Object.assign(new Error(message.message ?? 'That did not work.'),
                    { code: message.code }))
            })

            raw(type, payload)
        }))
    }

    return {
        get status() {
            return status
        },

        host({ playerName = 'You' } = {}) {
            return enter('room/host', { playerName })
        },

        join({ code, playerName = 'You' } = {}) {
            let resumeToken = null

            try {
                resumeToken = globalThis.sessionStorage?.getItem(TOKEN_KEY) ?? null
            } catch {
                resumeToken = null
            }

            return enter('room/join', { code: normalizeCode(code), playerName, resumeToken })
        },

        /**
         * Send an intent. A claim is stamped with our best estimate of the
         * server's clock — the server does not currently trust it (arrival order
         * decides), but sending it is what makes the more generous scheme
         * available later without a protocol change.
         */
        send(type, payload = {}) {
            if (type === 'action/claim') raw(type, { ...payload, atClientMs: serverNow() })
            else raw(type, payload)
        },

        on(type, handler) {
            return emitter.on(type, handler)
        },

        leave() {
            stopSync()
            emitter.clear()
            socket?.close()
            socket = null
            setStatus('closed')
        },
    }
}
