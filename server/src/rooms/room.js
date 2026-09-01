/**
 * One bakery: who is in it, what phase it is in, and the only real interval in
 * the whole server.
 *
 * This is the boundary between the outside world and `step()`. Everything below
 * it is pure and replayable; everything about it is timers, sockets and
 * membership. Keeping that line sharp is what makes the game rules testable
 * without a network, and it is why this file is the only one that calls
 * `Date.now()` or `setInterval`.
 *
 * It does not import `ws`. A player is whoever handed us a `send` function at
 * join time, so the tests drive a room with plain closures and the transport
 * layer stays swappable.
 */

import {
    DEFAULT_DIFFICULTY,
    MAX_PLAYERS,
    MIN_PLAYERS,
    PLAYER_COLORS,
    SLOT_COUNT,
    SLOT_PITCH_PX,
    TICK_MS,
    HOP_MS,
    DIFFICULTIES,
} from '../game/config.js'
import { createGame, publicGame } from '../game/state.js'
import { randomSeed } from '../game/rng.js'
import { step } from '../game/step.js'
import { createRateLimiter } from '../transport/socket.js'
import { newPlayerId, newResumeToken } from '../transport/session.js'

const ERRORS = {
    ROOM_FULL: 'This bakery is full.',
    GAME_IN_PROGRESS: 'That game has already started.',
    NOT_HOST: 'Only the baker who opened the room can start it.',
    NOT_ENOUGH_PLAYERS: 'You need a friend before you can start.',
    INVALID_ACTION: 'That is not something you can do right now.',
    RATE_LIMITED: 'Slow down a moment.',
}

export function createRoom({ code, allowSolo = false, now = () => Date.now() }) {
    /** Insertion-ordered, which is what makes host migration and colours deterministic. */
    const players = new Map()

    let phase = 'lobby'
    let game = null
    let difficulty = DEFAULT_DIFFICULTY

    /**
     * Claims that arrived since the last tick, stamped on arrival. Drained at
     * the top of every tick and handed to `step()` in one batch — which is what
     * makes "who grabbed it first" a question with a single answer rather than
     * a race between two socket callbacks.
     */
    let pending = []

    let timer = null
    let lastTickAt = 0

    /* ---------------------------------------------------------------- sending */

    function send(player, type, payload) {
        try {
            player.send(type, payload)
        } catch (error) {
            // A dead socket is normal — a child closed a tab. It must not take
            // the tick down with it, or one dropped player ends everyone's game.
            console.error(`[room ${code}] send to ${player.id} failed`, error.message)
        }
    }

    function broadcast(type, payload) {
        for (const player of players.values()) {
            if (player.connected) send(player, type, payload)
        }
    }

    function sendTo(playerId, type, payload) {
        const player = players.get(playerId)
        if (player?.connected) send(player, type, payload)
    }

    function fail(playerId, errorCode) {
        sendTo(playerId, 'error', { code: errorCode, message: ERRORS[errorCode] ?? 'That did not work.' })
    }

    /* ------------------------------------------------------------- membership */

    /**
     * The lowest colour not currently taken, so joining is reproducible: the
     * first child in a fresh room is always red. The order comes from
     * `config.js` and has to match the client's `PLAYER_COLORS` — see the note
     * there.
     */
    function freeColor() {
        const taken = new Set([...players.values()].map(player => player.colorSlot))
        return PLAYER_COLORS.find(color => !taken.has(color)) ?? PLAYER_COLORS[0]
    }

    function snapshot() {
        return {
            code,
            phase,
            players: [...players.values()].map(player => ({
                id: player.id,
                name: player.name,
                colorSlot: player.colorSlot,
                isHost: player.isHost,
                ready: player.ready,
                connected: player.connected,
            })),
            config: {
                difficulty,
                minPlayers: MIN_PLAYERS,
                maxPlayers: MAX_PLAYERS,
                // Quoted for the client's benefit only. Nothing server-side
                // computes with a pixel; the belt is an array of slots here and
                // the client maps an index into its own geometry.
                slotCount: SLOT_COUNT,
                slotPitchPx: SLOT_PITCH_PX,
                hopMs: HOP_MS,
                difficulties: Object.keys(DIFFICULTIES),
            },
            game: publicGame(game),
        }
    }

    function broadcastState() {
        broadcast('room/state', snapshot())
    }

    /**
     * Join, or rebind an existing slot with a resume token.
     *
     * The token path is checked first and deliberately bypasses both the full
     * check and the in-progress check: a child reconnecting to a seat they
     * already hold is not a new player, and refusing them because the room is
     * now full would be the cruellest possible reading of the rules.
     */
    function join({ playerName = 'Baker', resumeToken = null, send: sendFn }) {
        const existing = resumeToken
            && [...players.values()].find(player => player.resumeToken === resumeToken)

        if (existing) {
            existing.send = sendFn
            existing.connected = true
            existing.name = playerName || existing.name

            broadcast('player/connection', { playerId: existing.id, connected: true })
            broadcastState()

            return { ok: true, playerId: existing.id, resumeToken: existing.resumeToken, colorSlot: existing.colorSlot }
        }

        if (players.size >= MAX_PLAYERS) return { ok: false, code: 'ROOM_FULL' }
        if (phase !== 'lobby') return { ok: false, code: 'GAME_IN_PROGRESS' }

        const player = {
            id: newPlayerId(),
            name: playerName || 'Baker',
            colorSlot: freeColor(),
            // The first through the door hosts. The privilege is only "may press
            // start" — the server is authoritative, so nothing else depends on it.
            isHost: players.size === 0,
            ready: false,
            connected: true,
            joinedAtMs: now(),
            send: sendFn,
            resumeToken: newResumeToken(),
            claimLimiter: createRateLimiter({ limit: 10, windowMs: 1000 }),
        }

        players.set(player.id, player)

        broadcast('player/joined', {
            player: {
                id: player.id,
                name: player.name,
                colorSlot: player.colorSlot,
                isHost: player.isHost,
                ready: false,
                connected: true,
            },
        })
        broadcastState()

        return { ok: true, playerId: player.id, resumeToken: player.resumeToken, colorSlot: player.colorSlot }
    }

    /**
     * A socket closed.
     *
     * In the lobby the slot goes with it — there is no game to protect and a
     * ghost in the player list is just confusing. Mid-game the slot is kept and
     * greyed out instead, because the `5n` target is computed from the player
     * count and must not shift under the children still playing. Reaping that
     * slot after the 60s grace is M4.
     */
    function detach(playerId) {
        const player = players.get(playerId)
        if (!player) return

        player.connected = false
        player.send = () => {}

        if (phase === 'lobby') players.delete(playerId)

        migrateHostIfNeeded()

        broadcast('player/connection', { playerId, connected: false })
        if (phase === 'lobby') broadcast('player/left', { playerId })
        broadcastState()
    }

    /**
     * The host is the longest-connected player still here.
     *
     * A room whose host has gone is a room nobody can start, which in the lobby
     * is simply broken — so this is not deferred with the rest of the resilience
     * work. It is also nearly free precisely *because* the server is
     * authoritative: the host holds one privilege, so migrating it moves a
     * boolean and the game itself never notices.
     */
    function migrateHostIfNeeded() {
        const live = [...players.values()].filter(player => player.connected)
        if (!live.length || live.some(player => player.isHost)) return

        const heir = live.reduce((a, b) => (a.joinedAtMs <= b.joinedAtMs ? a : b))

        for (const player of players.values()) player.isHost = player.id === heir.id
    }

    /* ------------------------------------------------------------------ intents */

    function handle(playerId, type, payload) {
        const player = players.get(playerId)
        if (!player) return

        switch (type) {
            case 'player/ready':
                player.ready = Boolean(payload.ready)
                broadcastState()
                return

            case 'game/start':
                start(playerId, payload.difficulty)
                return

            case 'action/claim':
                claim(player, payload)
                return

            case 'room/state':
                // A client that missed messages asks for the snapshot rather
                // than replaying history. Snapshot-plus-patch, not event
                // sourcing — much easier to reason about and to demo.
                sendTo(playerId, 'room/state', snapshot())
                return

            case 'time/sync':
                // `t0` echoed untouched so the client can compute round-trip
                // time without trusting our clock about the outbound leg.
                sendTo(playerId, 'time/sync', { t0: payload.t0, t1: now() })
                return

            default:
                fail(playerId, 'INVALID_ACTION')
        }
    }

    function claim(player, payload) {
        if (phase !== 'playing') return fail(player.id, 'INVALID_ACTION')
        if (typeof payload.itemId !== 'string') return fail(player.id, 'INVALID_ACTION')

        // Cheap and blunt, and it happens before anything is queued: the point
        // is to stop a scripted client spraying the claim path, so the guard has
        // to sit in front of the queue rather than inside the tick.
        if (!player.claimLimiter.allow(now())) return fail(player.id, 'RATE_LIMITED')

        pending.push({
            type: 'action/claim',
            playerId: player.id,
            itemId: payload.itemId,
            receivedAtMs: now(),
        })
    }

    /* -------------------------------------------------------------------- game */

    function start(playerId, requested) {
        const player = players.get(playerId)

        if (!player?.isHost) return fail(playerId, 'NOT_HOST')
        if (phase !== 'lobby') return fail(playerId, 'GAME_IN_PROGRESS')

        const live = [...players.values()].filter(one => one.connected)
        if (live.length < MIN_PLAYERS && !allowSolo) return fail(playerId, 'NOT_ENOUGH_PLAYERS')

        if (requested && DIFFICULTIES[requested]) difficulty = requested

        game = createGame({ players: live, difficulty, seed: randomSeed() })
        phase = 'playing'

        broadcast('game/started', { config: snapshot().config, game: publicGame(game) })

        // The opening hands, sent as coin ids. The value stays on this side of
        // the wire — not even its owner is told what their hand is worth.
        for (const one of live) {
            broadcast('hand/dealt', { playerId: one.id, coins: [...game.players[one.id].hand] })
        }

        broadcastState()
        startTicking()
    }

    /**
     * The one interval in the server.
     *
     * `dtMs` is measured rather than assumed to be `TICK_MS`: the event loop
     * does not promise to come back on time, and a belt that advanced on tick
     * *count* would run slow on a busy process — meaning two children on
     * different machines would see the same tray in different slots, which is
     * the entire thing the authoritative simulation exists to prevent.
     */
    function startTicking() {
        if (timer) return

        lastTickAt = now()

        timer = setInterval(() => {
            const at = now()
            const dtMs = at - lastTickAt
            lastTickAt = at

            const intents = pending
            pending = []

            const result = step(game, dtMs, intents)
            game = result.state

            for (const event of result.events) {
                if (event.to) sendTo(event.to, event.type, event.payload)
                else broadcast(event.type, event.payload)
            }

            if (game.outcome) {
                phase = 'ended'
                stopTicking()
                broadcastState()
            }
        }, TICK_MS)

        timer.unref?.()
    }

    function stopTicking() {
        clearInterval(timer)
        timer = null
    }

    return {
        code,
        join,
        detach,
        handle,
        snapshot,

        get phase() {
            return phase
        },

        get playerCount() {
            return [...players.values()].filter(player => player.connected).length
        },

        destroy() {
            stopTicking()
            players.clear()
            game = null
        },
    }
}
