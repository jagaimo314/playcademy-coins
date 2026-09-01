/**
 * Shared scaffolding for the game tests.
 *
 * Every test here drives `step()` directly with no sockets and no timers, which
 * is the whole reason `step()` is pure. Time is whatever `dtMs` we say it is.
 */

import { MOUTH_SLOT, SLOT_COUNT } from '../src/game/config.js'
import { createGame } from '../src/game/state.js'
import { step } from '../src/game/step.js'

/** A game with `count` players, on a fixed seed so a failure is reproducible. */
export function newGame({ count = 2, difficulty = 'medium', seed = 12345 } = {}) {
    const players = Array.from({ length: count }, (_, index) => ({
        id: `p${index + 1}`,
        name: `Player ${index + 1}`,
        colorSlot: ['red', 'blue', 'green', 'yellow'][index],
    }))

    return createGame({ players, difficulty, seed })
}

/**
 * Run the simulation for `ms` in `TICK_MS`-sized pieces, collecting events.
 *
 * Stepping in real tick sizes rather than one big jump matters: cooldowns and
 * door timers are resolved per tick, so a single `step(state, 10000)` would
 * exercise a code path nothing in production ever takes.
 */
export function run(state, ms, { intentsAt = () => [], tickMs = 50 } = {}) {
    let current = state
    const events = []

    for (let elapsed = 0; elapsed < ms; elapsed += tickMs) {
        const result = step(current, tickMs, intentsAt(current, elapsed))
        current = result.state
        events.push(...result.events)
    }

    return { state: current, events }
}

export const eventsOfType = (events, type) =>
    events.filter(event => event.type === type)

/** The first tray on a belt, oven end first. Most tests just want "a tray". */
export function firstItem(state, beltIndex = 0) {
    const found = state.belts[beltIndex].slots.find(Boolean)
    return found ? state.items[found] : null
}

/** Fill a belt from the oven end with trays at the given prices. */
export function fillBelt(state, prices, beltIndex = 0) {
    const belt = state.belts[beltIndex]

    prices.forEach((price, slot) => {
        const id = `t${slot}`
        state.items[id] = {
            id,
            beltId: belt.id,
            price,
            state: 'traveling',
            forPlayerId: null,
            errorType: null,
        }
        belt.slots[slot] = id
    })

    return belt
}

export { MOUTH_SLOT, SLOT_COUNT }
