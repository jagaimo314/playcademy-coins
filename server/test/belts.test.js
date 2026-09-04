import { strict as assert } from 'node:assert'
import { describe, it } from 'node:test'

import { MOUTH_SLOT, SLOT_COUNT, beltCountFor } from '../src/game/config.js'
import { step } from '../src/game/step.js'
import { eventsOfType, fillBelt, newGame, run } from './helpers.js'

describe('belt motion', () => {
    it('advances one slot per beat, and no further', () => {
        const state = newGame({ difficulty: 'medium' })
        state.belts[0].slots.fill(null)
        fillBelt(state, [30])

        const after = step(state, state.advanceMs, []).state

        assert.equal(after.belts[0].slots[1], 't0')
        assert.equal(after.belts[0].slots[2], null, 'one slot, not two')
    })

    it('does not move between beats', () => {
        const state = newGame({ difficulty: 'medium' })
        state.belts[0].slots.fill(null)
        fillBelt(state, [30])

        const after = run(state, state.advanceMs - 100).state
        assert.equal(after.belts[0].slots[0], 't0')
    })

    it('resolves from the mouth backwards, so no tray moves twice in a beat', () => {
        // Four trays nose to tail. Resolving from the oven end instead would let
        // the loop catch up with a tray it has already moved and walk it several
        // slots at once, which is the bug this ordering exists to prevent.
        const state = newGame({ difficulty: 'medium' })
        state.belts[0].slots.fill(null)
        fillBelt(state, [10, 20, 30, 40])
        state.doorsOpen = false

        const after = step(state, state.advanceMs, []).state

        // Slot 0 is whatever the oven just baked, so the assertion is about the
        // four that were already on the belt: each moved exactly one place.
        assert.deepEqual(after.belts[0].slots.slice(1, 5), ['t0', 't1', 't2', 't3'])
    })

    it('backs up behind closed doors, one tray per beat, wasting nothing', () => {
        const state = newGame({ difficulty: 'medium' })
        state.belts[0].slots.fill(null)
        state.doorsOpen = false

        // Lead tray already at the mouth, one behind it.
        const belt = state.belts[0]
        fillBelt(state, [])
        state.items.lead = { id: 'lead', beltId: belt.id, price: 30, state: 'traveling', forPlayerId: null, errorType: null }
        state.items.next = { id: 'next', beltId: belt.id, price: 40, state: 'traveling', forPlayerId: null, errorType: null }
        belt.slots[MOUTH_SLOT] = 'lead'
        belt.slots[MOUTH_SLOT - 2] = 'next'

        const after = step(state, state.advanceMs, []).state

        assert.equal(after.belts[0].slots[MOUTH_SLOT], 'lead', 'lead holds at the mouth')
        assert.equal(after.belts[0].slots[MOUTH_SLOT - 1], 'next', 'the one behind closes up')
        assert.equal(after.wasted, 0, 'a closed door wastes nothing')
    })

    it('reports jammed once the oven has nowhere to put the next tray', () => {
        const state = newGame({ difficulty: 'medium' })
        // The jam rule is per belt, and a room now has more than one. Reduce to
        // a single lane so "a full belt bakes nothing" stays a claim about the
        // jammed belt rather than about whichever other lane still had room.
        state.belts = state.belts.slice(0, 1)
        state.beltCount = 1

        state.doorsOpen = false
        state.belts[0].slots.fill(null)
        fillBelt(state, Array.from({ length: SLOT_COUNT }, (_, i) => 10 + i))

        const { state: after, events } = step(state, state.advanceMs, [])
        const [advanced] = eventsOfType(events, 'belt/advanced')

        assert.equal(advanced.payload.jammed, true)
        assert.equal(after.belts[0].jammed, true)
        assert.equal(eventsOfType(events, 'item/spawned').length, 0, 'a full belt bakes nothing')
    })

    it('empties the mouth into the fire when the doors are open', () => {
        const state = newGame({ difficulty: 'medium' })
        state.belts[0].slots.fill(null)
        state.doorsOpen = true
        state.wasteOnExit = 'all'

        const belt = state.belts[0]
        state.items.gone = { id: 'gone', beltId: belt.id, price: 99, state: 'traveling', forPlayerId: null, errorType: null }
        belt.slots[MOUTH_SLOT] = 'gone'

        const { state: after, events } = step(state, state.advanceMs, [])
        const [resolved] = eventsOfType(events, 'item/resolved')

        assert.equal(after.belts[0].slots[MOUTH_SLOT], null)
        assert.equal(resolved.payload.outcome, 'wasted')
        assert.equal(resolved.payload.reason, 'incinerated')
        assert.equal(after.wasted, 1)
    })

    it("wasteOnExit 'matched' charges for food somebody could have bought, and nothing else", () => {
        const state = newGame({ difficulty: 'medium' })
        state.belts[0].slots.fill(null)
        state.wasteOnExit = 'matched'

        const belt = state.belts[0]
        const liveValue = state.players.p1.handValue

        // A decoy nobody is holding coins for. Free.
        state.items.decoy = { id: 'decoy', beltId: belt.id, price: pickUnmatched(state), state: 'traveling', forPlayerId: null, errorType: null }
        belt.slots[MOUTH_SLOT] = 'decoy'

        const first = step(state, state.advanceMs, []).state
        assert.equal(first.wasted, 0, 'a decoy falling in the fire is free')

        // Food priced at a live hand. That is a loss.
        first.belts[0].slots.fill(null)
        first.items.real = { id: 'real', beltId: belt.id, price: liveValue, state: 'traveling', forPlayerId: null, errorType: null }
        first.belts[0].slots[MOUTH_SLOT] = 'real'

        const second = step(first, first.advanceMs, []).state
        assert.equal(second.wasted, 1, 'food somebody could have bought is not')
    })

    it('staggers beats across belts so they never lurch in unison', () => {
        // Four seats is what buys the third belt, and three belts is the case
        // worth asserting: one synchronised jolt across the whole bakery reads
        // as the page stuttering rather than as machinery running.
        const state = newGame({ count: 4, difficulty: 'hard' })

        assert.equal(state.belts.length, 3)

        const offsets = state.belts.map(belt => belt.accMs)
        assert.equal(new Set(offsets).size, 3, 'three distinct phase offsets')
    })
})

/*
 * Belts are dealt by how many children are at the counter, not by tier. Two
 * players on one belt is a queue — long stretches where nothing on screen is
 * worth either hand, and the one tray that is becomes a race rather than two
 * parallel problems.
 */
describe('belts by player count', () => {
    for (const [count, expected] of [[2, 2], [3, 2], [4, 3]]) {
        it(`${count} players get ${expected} belts`, () => {
            // The tier the client actually starts a room on.
            const state = newGame({ count, difficulty: 'easy' })

            assert.equal(state.beltCount, expected)
            assert.equal(state.belts.length, expected, 'the array agrees with the count')
            assert.equal(new Set(state.belts.map(belt => belt.id)).size, expected, 'distinct ids')
        })
    }

    it('never exceeds what the tier allows', () => {
        // `easy` is the shipped tier and permits all three; a tier that capped
        // belts lower would still be honoured rather than overridden here.
        assert.equal(beltCountFor(4, 'easy'), 3)
        assert.equal(beltCountFor(4, 'medium'), 2, 'medium caps at two')
    })
})

/** A price no live hand is worth — so a tray at it is genuinely unbuyable. */
function pickUnmatched(state) {
    const live = new Set(Object.values(state.players).map(player => player.handValue))
    for (let price = 1; price <= 99; price += 1) if (!live.has(price)) return price
    throw new Error('no unmatched price available')
}
