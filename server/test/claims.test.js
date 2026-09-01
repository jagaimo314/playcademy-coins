import { strict as assert } from 'node:assert'
import { describe, it } from 'node:test'

import { CLAIM_COOLDOWN_MS } from '../src/game/config.js'
import { step } from '../src/game/step.js'
import { eventsOfType, fillBelt, newGame } from './helpers.js'

/** Put a tray at `price` on the belt, out of the mouth's way, and return its id. */
function plant(state, price, slot = 3) {
    const id = `x${slot}`
    state.items[id] = {
        id,
        beltId: state.belts[0].id,
        price,
        state: 'traveling',
        forPlayerId: null,
        errorType: null,
    }
    state.belts[0].slots[slot] = id
    return id
}

const claim = (playerId, itemId, receivedAtMs = 0) =>
    ({ type: 'action/claim', playerId, itemId, receivedAtMs })

describe('claiming', () => {
    it('serves a tray whose price matches the hand, and deals a new one', () => {
        const state = newGame()
        state.belts[0].slots.fill(null)
        const itemId = plant(state, state.players.p1.handValue)
        const before = state.players.p1.hand

        const { state: after, events } = step(state, 50, [claim('p1', itemId)])
        const [resolved] = eventsOfType(events, 'item/resolved')

        assert.equal(resolved.payload.outcome, 'served')
        assert.equal(resolved.payload.byPlayerId, 'p1')
        assert.equal(after.served, 1)
        assert.equal(after.players.p1.score, 1)
        assert.notDeepEqual(after.players.p1.hand, before, 'the hand is swapped')
        assert.equal(eventsOfType(events, 'hand/dealt').length, 1)
    })

    it('wastes a wrong grab, keeps the hand, and starts a cooldown', () => {
        const state = newGame()
        state.belts[0].slots.fill(null)

        const value = state.players.p1.handValue
        const itemId = plant(state, value === 99 ? value - 1 : value + 1)
        const before = [...state.players.p1.hand]

        const { state: after, events } = step(state, 50, [claim('p1', itemId)])
        const [resolved] = eventsOfType(events, 'item/resolved')

        assert.equal(resolved.payload.outcome, 'wasted')
        assert.equal(after.wasted, 1)
        assert.deepEqual(after.players.p1.hand, before, 'a wrong grab does not rescue you from the sum')
        assert.equal(after.players.p1.cooldownUntilMs, after.elapsedMs + CLAIM_COOLDOWN_MS)
        assert.ok(resolved.payload.errorType, 'the mistake is classified, not just counted')
    })

    it('refuses a second grab while that player is on cooldown', () => {
        const state = newGame()
        state.belts[0].slots.fill(null)

        const value = state.players.p1.handValue
        const first = plant(state, value === 99 ? value - 1 : value + 1, 3)
        const afterWrong = step(state, 50, [claim('p1', first)]).state

        const second = plant(afterWrong, afterWrong.players.p1.handValue, 4)
        const { state: after, events } = step(afterWrong, 50, [claim('p1', second)])

        const [error] = eventsOfType(events, 'error')
        assert.equal(error.payload.code, 'CLAIM_COOLDOWN')
        assert.equal(error.to, 'p1')
        assert.equal(after.served, 0, 'the tray is untouched')
    })

    it('lets the cooldown expire', () => {
        const state = newGame()
        state.belts[0].slots.fill(null)
        state.players.p1.cooldownUntilMs = state.elapsedMs + CLAIM_COOLDOWN_MS

        let current = state
        for (let elapsed = 0; elapsed < CLAIM_COOLDOWN_MS + 100; elapsed += 50) {
            current = step(current, 50, []).state
        }

        const itemId = plant(current, current.players.p1.handValue, 2)
        const { events } = step(current, 50, [claim('p1', itemId)])

        assert.equal(eventsOfType(events, 'error').length, 0)
        assert.equal(eventsOfType(events, 'item/resolved')[0].payload.outcome, 'served')
    })

    it('gives one tray to one player, and ITEM_GONE to the loser', () => {
        // Both hands set to the same value on purpose: the contested case is the
        // only one where "who grabbed it first" has to have an answer at all.
        const state = newGame()
        state.belts[0].slots.fill(null)
        state.players.p2.hand = [...state.players.p1.hand]
        state.players.p2.handValue = state.players.p1.handValue

        const itemId = plant(state, state.players.p1.handValue)

        const { state: after, events } = step(state, 50, [
            claim('p2', itemId, 1200),
            claim('p1', itemId, 1000),
        ])

        const resolved = eventsOfType(events, 'item/resolved')
        assert.equal(resolved.length, 1, 'the tray resolves exactly once')
        assert.equal(resolved[0].payload.byPlayerId, 'p1', 'earlier arrival wins')

        const [error] = eventsOfType(events, 'error')
        assert.equal(error.payload.code, 'ITEM_GONE')
        assert.equal(error.to, 'p2')
        assert.equal(after.served, 1)
    })

    it('breaks a same-millisecond tie by playerId, not by arrival luck', () => {
        const state = newGame()
        state.belts[0].slots.fill(null)
        state.players.p2.hand = [...state.players.p1.hand]
        state.players.p2.handValue = state.players.p1.handValue

        const itemId = plant(state, state.players.p1.handValue)

        const { events } = step(state, 50, [
            claim('p2', itemId, 1000),
            claim('p1', itemId, 1000),
        ])

        assert.equal(eventsOfType(events, 'item/resolved')[0].payload.byPlayerId, 'p1')
    })

    it('rejects a claim on a tray that is already gone', () => {
        const state = newGame()
        state.belts[0].slots.fill(null)

        const { events } = step(state, 50, [claim('p1', 'no-such-tray')])
        assert.equal(eventsOfType(events, 'error')[0].payload.code, 'ITEM_GONE')
    })

    it('sends one score/patch per tick however many claims land in it', () => {
        const state = newGame()
        state.belts[0].slots.fill(null)

        const one = plant(state, state.players.p1.handValue, 2)
        const two = plant(state, state.players.p2.handValue, 4)

        const { events } = step(state, 50, [claim('p1', one, 1), claim('p2', two, 2)])

        assert.equal(eventsOfType(events, 'item/resolved').length, 2)
        assert.equal(eventsOfType(events, 'score/patch').length, 1)
    })
})

describe('winning and losing', () => {
    it('ends in a win on the target serve', () => {
        const state = newGame()
        state.belts[0].slots.fill(null)
        state.served = state.target - 1

        const itemId = plant(state, state.players.p1.handValue)
        const { state: after, events } = step(state, 50, [claim('p1', itemId)])

        const [ended] = eventsOfType(events, 'game/ended')
        assert.equal(ended.payload.outcome, 'win')
        assert.equal(after.outcome, 'win')
    })

    it('ends in a loss on the waste limit, and reports what each child got wrong', () => {
        const state = newGame()
        state.belts[0].slots.fill(null)
        state.wasted = state.wasteLimit - 1

        const value = state.players.p1.handValue
        const itemId = plant(state, value === 99 ? value - 1 : value + 1)
        const { events } = step(state, 50, [claim('p1', itemId)])

        const [ended] = eventsOfType(events, 'game/ended')
        assert.equal(ended.payload.outcome, 'loss')

        const p1 = ended.payload.results.players.find(one => one.id === 'p1')
        assert.ok(Object.keys(p1.errors).length, 'the report names the error type')
    })

    it('calls a simultaneous win and loss a win', () => {
        const state = newGame()
        state.belts[0].slots.fill(null)
        state.served = state.target - 1
        state.wasted = state.wasteLimit - 1

        const itemId = plant(state, state.players.p1.handValue)
        const { events } = step(state, 50, [claim('p1', itemId)])

        assert.equal(eventsOfType(events, 'game/ended')[0].payload.outcome, 'win')
    })

    it('goes quiet once the game is over', () => {
        const state = newGame()
        state.outcome = 'win'

        const { events } = step(state, 5000, [])
        assert.equal(events.length, 0)
    })
})
