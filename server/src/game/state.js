/**
 * Game state shapes, and the one function that builds a fresh one.
 *
 * Everything here is plain JSON-able data: no class instances, no functions, no
 * `Map`s. That is not tidiness for its own sake — `step()` clones state every
 * tick, and `room/state` puts a filtered copy of it on the wire, and both of
 * those get much worse the moment something in here stops being serialisable.
 */

import {
    DEFAULT_DIFFICULTY,
    SERVE_TARGET,
    SLOT_COUNT,
    WASTE_LIMIT,
    difficultyConfig,
    resolveSetup,
} from './config.js'
import { dealHand } from './dealer.js'
import { createCursor } from './rng.js'

/**
 * Build a game for a room that has just started.
 *
 * `players` arrives as the room's membership — `{ id, name, colorSlot }` — and
 * comes back enriched with everything the simulation owns. The room never
 * writes to those fields afterwards; it asks `step()` to.
 */
export function createGame({ players, difficulty = DEFAULT_DIFFICULTY, seed }) {
    difficultyConfig(difficulty)

    const playerCount = players.length
    const setup = resolveSetup(playerCount, difficulty)
    const cursor = createCursor(seed)

    const state = {
        seed,
        difficulty,
        elapsedMs: 0,

        // The setup the game is actually running, resolved once at start rather
        // than re-read from the difficulty table every tick — a game whose rules
        // changed under it mid-play would be unexplainable.
        beltCount: setup.beltCount,
        advanceMs: setup.advanceMs,
        doorsOpen: setup.doorsOpen,
        wasteOnExit: setup.wasteOnExit,

        belts: Array.from({ length: setup.beltCount }, (_, index) => createBelt(index, setup)),

        /** `itemId -> item`. An object, not a Map, so it survives a clone and the wire. */
        items: {},
        nextItemNumber: 1,

        players: {},

        served: 0,
        wasted: 0,
        target: SERVE_TARGET(playerCount),
        wasteLimit: WASTE_LIMIT(playerCount),

        outcome: null,
    }

    // Dealt in one pass with a shared `taken` set, which is what makes the
    // opening hands distinct from each other rather than merely distinct from
    // whatever happened to be dealt first.
    const taken = new Set()

    for (const player of players) {
        const { coins, value } = dealHand(cursor, difficulty, taken)
        taken.add(value)
        state.players[player.id] = createPlayer(player, coins, value)
    }

    state.seed = cursor.seed
    return state
}

/**
 * Beats are per belt and **staggered** by a phase offset, so three belts never
 * lurch in unison. One synchronised jolt across the whole bakery reads as the
 * page stuttering rather than as machinery running.
 *
 * The offset is carried as a head start on the accumulator rather than as a
 * delay to subtract later; the belt then needs no special case on its first
 * beat.
 */
function createBelt(index, setup) {
    return {
        id: `b${index + 1}`,
        slots: new Array(SLOT_COUNT).fill(null),
        accMs: (setup.advanceMs * index) / setup.beltCount,
        jammed: false,
    }
}

function createPlayer({ id, name, colorSlot }, coins, value) {
    return {
        id,
        name,
        colorSlot,
        connected: true,

        hand: coins,
        /**
         * **Never leaves the process.** `hand/dealt` carries coin ids only, and
         * `room/state` strips this field — see `publicGame()`. Sending it would
         * put the answer in devtools, and the sum *is* the exercise.
         */
        handValue: value,
        handDealtAtMs: 0,
        pendingMatchItemId: null,
        /**
         * Since when this player has had no tray reserved for them.
         *
         * Deliberately *not* the same as `handDealtAtMs`, and the difference is
         * load-bearing. Every opening hand is dealt at 0, so ordering the spawn
         * queue by when a hand arrived leaves four players permanently tied and
         * the tiebreak falls to insertion order — which means the first player
         * is rebaked every time their tray is destroyed, and everybody else
         * starves for the whole game. Waiting time has to be measured from when
         * the *reservation* was lost, not from when the hand was dealt.
         */
        matchWaitingSinceMs: 0,

        score: 0,
        cooldownUntilMs: 0,
        /** `errorType -> count`, the same taxonomy the lesson reports on. */
        errors: {},
    }
}

export function createItem(state, { beltId, price, forPlayerId, errorType }) {
    const id = `i${state.nextItemNumber}`
    state.nextItemNumber += 1

    return {
        id,
        beltId,
        price,
        /** `traveling -> claiming -> served | wasted`. */
        state: 'traveling',
        /** Set when this tray is somebody's reserved match. */
        forPlayerId: forPlayerId ?? null,
        /** Set when it is a decoy: which mistake it is baited for. */
        errorType: errorType ?? null,
    }
}

/**
 * The view of a game a client is allowed to see.
 *
 * One rule, and it is the whole reason this function exists rather than the
 * room sending `state` straight out: **`handValue` never crosses the wire.**
 * Prices are the opposite — they are printed on the tray in 40px type, so they
 * go over in the clear.
 */
export function publicGame(state) {
    if (!state) return null

    return {
        difficulty: state.difficulty,
        elapsedMs: state.elapsedMs,
        advanceMs: state.advanceMs,
        doorsOpen: state.doorsOpen,

        belts: state.belts.map(belt => ({
            id: belt.id,
            slots: [...belt.slots],
            jammed: belt.jammed,
        })),

        items: Object.fromEntries(Object.values(state.items)
            .filter(item => item.state === 'traveling' || item.state === 'claiming')
            .map(item => [item.id, { id: item.id, beltId: item.beltId, price: item.price }])),

        players: Object.fromEntries(Object.values(state.players).map(player => [player.id, {
            id: player.id,
            name: player.name,
            colorSlot: player.colorSlot,
            connected: player.connected,
            coins: [...player.hand],
            score: player.score,
            cooldownUntilMs: player.cooldownUntilMs,
        }])),

        served: state.served,
        wasted: state.wasted,
        target: state.target,
        wasteLimit: state.wasteLimit,
        outcome: state.outcome,
    }
}
