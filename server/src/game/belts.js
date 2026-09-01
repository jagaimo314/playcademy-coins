/**
 * Belt motion: the advance beat, the jam rule, and what happens at the mouth.
 *
 * A belt is an ordered array of slots and a tray is in one or it is not. There
 * is no position to interpolate, nothing is predicted, and the client is simply
 * told the occupancy. Server-side an advance is one array shift; the visible hop
 * is client-side decoration played over `HOP_MS`, after which the tray rests for
 * the remainder of the interval.
 *
 * **That resting period is the point.** A second grader aiming at a stationary
 * tray is aiming at a target rather than leading a moving one, and "which tray
 * did you tap" has an unambiguous answer at every moment.
 */

import { MOUTH_SLOT } from './config.js'
import { chooseSpawn } from './dealer.js'
import { createItem } from './state.js'

/**
 * Run every belt's accumulator forward by `dtMs` and beat the ones that cross
 * their interval.
 *
 * The `while` rather than an `if` is not defensive padding: a room that was
 * paused, or a tick the event loop sat on, can hand us a `dtMs` covering more
 * than one interval, and a belt that silently dropped the extra beats would
 * drift permanently behind the clock everybody else is playing to.
 */
export function advanceBelts(state, dtMs, cursor, events) {
    for (const belt of state.belts) {
        belt.accMs += dtMs

        while (belt.accMs >= state.advanceMs) {
            belt.accMs -= state.advanceMs
            beat(state, belt, cursor, events)
        }
    }
}

/** One beat of one belt: exits, then the shift, then whatever the oven bakes. */
function beat(state, belt, cursor, events) {
    shift(state, belt, events)
    spawn(state, belt, cursor, events)

    // A belt is jammed when the oven has nowhere to put the next tray. Reported
    // as its own flag rather than inferred from the occupancy, because the
    // client draws the oven backing up and should not have to derive that.
    belt.jammed = belt.slots[0] !== null

    events.push({
        type: 'belt/advanced',
        payload: {
            t: state.elapsedMs,
            beltId: belt.id,
            slots: [...belt.slots],
            jammed: belt.jammed,
        },
    })
}

/**
 * Move every tray one slot towards the mouth, or hold it where the slot ahead
 * is occupied.
 *
 * **Resolved from the mouth backwards**, and that direction is load-bearing.
 * Iterating from the oven end instead lets the loop catch up with a tray it has
 * already moved this beat and walk it several slots at once — the conveyor
 * equivalent of reading your own writes.
 */
function shift(state, belt, events) {
    // The mouth first: it empties into the fire, or it does not, and either way
    // that is what decides whether slot 6 has anywhere to go.
    const atMouth = belt.slots[MOUTH_SLOT]

    if (atMouth && state.doorsOpen) {
        belt.slots[MOUTH_SLOT] = null
        exit(state, atMouth, events)
    }

    for (let index = MOUTH_SLOT - 1; index >= 0; index -= 1) {
        if (belt.slots[index] === null) continue
        if (belt.slots[index + 1] !== null) continue

        belt.slots[index + 1] = belt.slots[index]
        belt.slots[index] = null
    }
}

/**
 * A tray reaching an open incinerator.
 *
 * Whether it counts against the shared waste budget is `wasteOnExit`: food
 * somebody was holding the coins for is a loss, and a decoy nobody could have
 * bought is not. Without that distinction the waste counter is a stopwatch
 * rather than a measure of error — it would tick up on the belt's schedule
 * however well the children were playing.
 */
function exit(state, itemId, events) {
    const item = state.items[itemId]
    if (!item) return

    const matched = Object.values(state.players)
        .some(player => player.hand.length && player.handValue === item.price)

    const counts = state.wasteOnExit === 'all'
        || (state.wasteOnExit === 'matched' && matched)

    item.state = 'wasted'
    if (counts) state.wasted += 1

    // Whoever was waiting on this tray needs another one baked. Clearing the
    // reservation is what re-arms the dealer on the very next spawn.
    releaseReservation(state, item)

    events.push({
        type: 'item/resolved',
        payload: {
            itemId: item.id,
            outcome: 'wasted',
            reason: 'incinerated',
            counted: counts,
        },
    })

    delete state.items[item.id]
}

/** Bake into slot 0, if the oven has anywhere to put it and anything to bake. */
function spawn(state, belt, cursor, events) {
    if (belt.slots[0] !== null) return

    const choice = chooseSpawn(cursor, state)
    if (!choice) return

    const item = createItem(state, { beltId: belt.id, ...choice })

    state.items[item.id] = item
    belt.slots[0] = item.id

    if (choice.forPlayerId) {
        state.players[choice.forPlayerId].pendingMatchItemId = item.id
    }

    events.push({
        type: 'item/spawned',
        payload: {
            beltId: belt.id,
            item: { id: item.id, beltId: item.beltId, price: item.price },
        },
    })
}

/**
 * Drop the reservation an item was holding, wherever it went — incinerated,
 * claimed by its owner, or claimed by somebody else.
 *
 * Exported because `claims.js` needs the identical wording: a match that is
 * cleared in one place and forgotten in another is a hand that waits forever.
 */
export function releaseReservation(state, item) {
    if (!item.forPlayerId) return

    const owner = state.players[item.forPlayerId]
    if (!owner || owner.pendingMatchItemId !== item.id) return

    owner.pendingMatchItemId = null
    // The clock restarts here, not when the hand was dealt. A player whose tray
    // was just destroyed goes to the *back* of the spawn queue; without this
    // they are re-baked on the very next beat, every beat, and the other three
    // children never see a tray they can buy. See `matchWaitingSinceMs`.
    owner.matchWaitingSinceMs = state.elapsedMs
}
