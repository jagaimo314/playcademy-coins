/**
 * The wire: one envelope shape, a heartbeat, and a rate limit.
 *
 * Nothing in here knows what a bakery is. It turns frames into
 * `{ type, payload }` and back, and it refuses to let a socket flood the room
 * layer. Everything above it can then assume it is being handed well-formed,
 * reasonably-paced messages.
 */

/** `{ type, payload }`, types namespaced with `/`. Same envelope on both sides. */
export function encode(type, payload = {}) {
    return JSON.stringify({ type, payload })
}

/**
 * Parse a frame, or return `null`.
 *
 * Everything that arrives here came off the network, so every branch is a real
 * case rather than a defensive one: malformed JSON, a bare array, a missing
 * type. `null` means "drop it" — there is nobody sensible to report a
 * syntactically broken frame to, since the reply itself would have to guess at
 * a protocol the sender has already shown it is not speaking.
 */
export function decode(raw) {
    let parsed

    try {
        parsed = JSON.parse(typeof raw === 'string' ? raw : raw.toString('utf8'))
    } catch {
        return null
    }

    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null
    if (typeof parsed.type !== 'string') return null

    const payload = parsed.payload
    const safe = payload && typeof payload === 'object' && !Array.isArray(payload) ? payload : {}

    return { type: parsed.type, payload: safe }
}

/**
 * A sliding-window rate limit, per socket.
 *
 * The claim intent is the one a scripted client could spray, and `wasted` is a
 * *shared* budget — so an unthrottled claim path is not merely a performance
 * question, it is a way for one modified client to end the game for four
 * children. The in-game cooldown already makes brute-forcing a losing strategy;
 * this makes it an impossible one.
 *
 * Timestamps are kept rather than a counter with a reset, so ten claims at the
 * end of one window and ten at the start of the next cannot slip through as
 * twenty in a millisecond.
 */
export function createRateLimiter({ limit = 10, windowMs = 1000 } = {}) {
    const stamps = []

    return {
        /** True if this call is allowed. Records it when it is. */
        allow(nowMs) {
            while (stamps.length && nowMs - stamps[0] >= windowMs) stamps.shift()
            if (stamps.length >= limit) return false

            stamps.push(nowMs)
            return true
        },
    }
}

/**
 * Ping every socket on an interval and close the ones that stopped answering.
 *
 * A TCP connection to a tablet that went into a bag does not report itself as
 * closed — it just stops. Without this the room keeps a player slot alive for a
 * child who is not there, and at four players that is a quarter of the
 * `5n` target waiting on somebody in a bag.
 */
export function createHeartbeat(server, { intervalMs = 15000 } = {}) {
    const timer = setInterval(() => {
        for (const socket of server.clients) {
            if (socket.isAlive === false) {
                socket.terminate()
                continue
            }

            socket.isAlive = false
            socket.ping()
        }
    }, intervalMs)

    // Otherwise the process cannot exit while this is scheduled, which mostly
    // shows up as tests that pass and then hang.
    timer.unref?.()

    return { stop: () => clearInterval(timer) }
}
