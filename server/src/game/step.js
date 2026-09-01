/**
 * The one place the rules live.
 *
 *     step(state, dtMs, intents) -> { state, events }
 *
 * No timers, no sockets, no `Date.now()`, no `Math.random()`. Time arrives as
 * `dtMs` and chance arrives from the seed carried in `state`. `room.js` is the
 * only thing in `server/` that owns a real interval and a real socket.
 *
 * That buys three things. The rules are unit-testable with no network. A whole
 * game replays deterministically from `(seed, intents[])`, so "that spawn looked
 * unfair" becomes a test with a seed number in it. And the walkthrough has
 * exactly one file to read.
 */

import { advanceBelts } from './belts.js'
import { resolveClaim } from './claims.js'
import { createCursor } from './rng.js'

const ERROR_MESSAGES = {
    ITEM_GONE: 'That one is already gone!',
    CLAIM_COOLDOWN: 'Wait a moment before you grab again.',
    INVALID_ACTION: 'That is not something you can do right now.',
}

/**
 * Advance the game by `dtMs`.
 *
 * `state` is not modified. It is cloned once at the top and the clone is what
 * everything below writes to — structural sharing would be faster and would
 * also mean a caller holding last tick's state could watch it change under
 * them, which is precisely the bug determinism is supposed to rule out. The
 * state is small and JSON-able by construction (see `state.js`), so at 20 Hz
 * the clone does not register.
 */
export function step(state, dtMs, intents = []) {
    if (state.outcome) return { state, events: [] }

    const next = structuredClone(state)
    const cursor = createCursor(next.seed)
    const events = []

    next.elapsedMs += dtMs

    // Intents first, at the top of the tick, before anything moves. A tray at
    // the mouth is therefore still grabbable on the tick it would fall — the
    // generous reading, and the one a child expects from what they can see.
    applyIntents(next, cursor, intents, events)

    advanceBelts(next, dtMs, cursor, events)

    emitScoreIfChanged(state, next, events)
    checkOutcome(next, events)

    next.seed = cursor.seed
    return { state: next, events }
}

/**
 * Apply this tick's intents in server arrival order.
 *
 * Ties — two intents stamped at the same millisecond — break by `playerId`.
 * That is deterministic and cannot be gamed, which arrival order alone is not
 * once two claims land inside the same millisecond. A more generous scheme
 * exists (a one-tick claim window resolved by earliest client timestamp,
 * clamped to RTT/2), but arrival order is the honest default: it is explainable
 * to a seven-year-old and it cannot be won by lying about your clock.
 */
function applyIntents(state, cursor, intents, events) {
    const ordered = [...intents].sort((a, b) =>
        a.receivedAtMs - b.receivedAtMs || (a.playerId < b.playerId ? -1 : 1))

    for (const intent of ordered) {
        if (intent.type !== 'action/claim') continue

        const code = resolveClaim(state, cursor, intent, events)

        if (code) {
            events.push({
                type: 'error',
                to: intent.playerId,
                payload: { code, message: ERROR_MESSAGES[code] ?? 'That did not work.' },
            })
        }
    }
}

/**
 * One `score/patch` per tick, and only when something in it actually moved.
 *
 * Emitted here rather than at each of the three sites that can change a counter
 * — a claim, a wrong grab, a tray falling into the fire — so a tick that does
 * two of them sends one message rather than two contradictory-looking ones.
 */
function emitScoreIfChanged(before, after, events) {
    const scoresOf = state => Object.values(state.players).map(player => player.score).join(',')

    const changed = before.served !== after.served
        || before.wasted !== after.wasted
        || scoresOf(before) !== scoresOf(after)

    if (!changed) return

    events.push({
        type: 'score/patch',
        payload: {
            served: after.served,
            wasted: after.wasted,
            target: after.target,
            wasteLimit: after.wasteLimit,
            scores: Object.fromEntries(
                Object.values(after.players).map(player => [player.id, player.score])),
        },
    })
}

/**
 * Win and loss, checked in that order.
 *
 * Serving the last tray and wasting the last one on the same tick is a win. The
 * game is co-operative and the children have just hit their target; ending it
 * on the loss would be technically defensible and would feel like a cheat.
 */
function checkOutcome(state, events) {
    if (state.served < state.target && state.wasted < state.wasteLimit) return

    state.outcome = state.served >= state.target ? 'win' : 'loss'

    events.push({
        type: 'game/ended',
        payload: {
            outcome: state.outcome,
            results: {
                served: state.served,
                wasted: state.wasted,
                target: state.target,
                wasteLimit: state.wasteLimit,
                players: Object.values(state.players).map(player => ({
                    id: player.id,
                    name: player.name,
                    colorSlot: player.colorSlot,
                    score: player.score,
                    // The brief asks us to say what went wrong and where the
                    // student needs help. This is that, per child, straight out
                    // of the lesson's own taxonomy.
                    errors: { ...player.errors },
                })),
            },
        },
    })
}
