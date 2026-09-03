import { strict as assert } from 'node:assert'
import { describe, it } from 'node:test'

import { sumCoins } from '../../src/lib/money.js'
import { ERROR_TYPES } from '../../src/views/lesson/diagnostics.js'
import { DIFFICULTIES, MAX_HAND_COINS } from '../src/game/config.js'
import { classifyGrab, dealHand, decoyPrice } from '../src/game/dealer.js'
import { createCursor } from '../src/game/rng.js'
import { publicGame } from '../src/game/state.js'
import { newGame } from './helpers.js'

describe('hands', () => {
    for (const [name, rules] of Object.entries(DIFFICULTIES)) {
        it(`${name}: stays inside its value range and its coin budget`, () => {
            const cursor = createCursor(7)

            for (let i = 0; i < 500; i += 1) {
                const { coins, value } = dealHand(cursor, name)

                assert.equal(value, sumCoins(coins), 'the stated value is the hand')
                assert.ok(value >= rules.hand.minValue, `${value} >= ${rules.hand.minValue}`)
                assert.ok(value <= rules.hand.maxValue, `${value} <= ${rules.hand.maxValue}`)
                assert.ok(coins.length <= MAX_HAND_COINS, `${coins.length} coins is too many to read`)
                assert.ok(coins.length > 0)
            }
        })
    }

    it('easy deals one denomination — exactly what the lesson taught', () => {
        const cursor = createCursor(11)

        for (let i = 0; i < 300; i += 1) {
            const { coins } = dealHand(cursor, 'easy')
            assert.equal(new Set(coins).size, 1, `mixed hand on easy: ${coins.join(', ')}`)
        }
    })

    it('mixed difficulties actually mix, rather than always dealing minimal change', () => {
        const cursor = createCursor(3)
        let mixed = 0

        for (let i = 0; i < 300; i += 1) {
            if (new Set(dealHand(cursor, 'hard').coins).size > 1) mixed += 1
        }

        assert.ok(mixed > 200, `only ${mixed}/300 hands were mixed`)
    })

    it('avoids a value already in play when the pool allows it', () => {
        const cursor = createCursor(5)
        const taken = new Set([25])
        let collisions = 0

        for (let i = 0; i < 200; i += 1) {
            if (dealHand(cursor, 'medium', taken).value === 25) collisions += 1
        }

        assert.equal(collisions, 0, 'a taken value was dealt anyway')
    })

    it('deals the opening hands distinct from each other', () => {
        for (let seed = 0; seed < 50; seed += 1) {
            const state = newGame({ count: 4, difficulty: 'medium', seed })
            const values = Object.values(state.players).map(player => player.handValue)

            assert.equal(new Set(values).size, 4, `seed ${seed} dealt a duplicate`)
        }
    })
})

describe('decoys', () => {
    it('are never the answer, and are always a real price', () => {
        const cursor = createCursor(21)

        for (let i = 0; i < 500; i += 1) {
            const { coins, value } = dealHand(cursor, 'medium')
            const decoy = decoyPrice(cursor, coins, value)
            if (!decoy) continue

            assert.notEqual(decoy.price, value, 'a decoy that matches is a free tray')
            assert.ok(decoy.price >= 1 && decoy.price <= 99, `${decoy.price} is off the menu`)
            assert.ok(Object.values(ERROR_TYPES).includes(decoy.errorType))
        }
    })

    it('draw on the mistake the lesson is already looking for', () => {
        const cursor = createCursor(2)
        const seen = new Set()

        for (let i = 0; i < 400; i += 1) {
            const { coins, value } = dealHand(cursor, 'medium')
            const decoy = decoyPrice(cursor, coins, value)
            if (decoy) seen.add(decoy.errorType)
        }

        assert.ok(seen.has(ERROR_TYPES.MISCOUNTED_COINS))
        assert.ok(seen.has(ERROR_TYPES.WRONG_DENOMINATION_VALUE))
    })
})

describe('classifying a wrong grab', () => {
    it('names counting the coins instead of their value', () => {
        // Four dimes is 40; answering 4 is the classic.
        const hand = ['dime', 'dime', 'dime', 'dime']
        assert.equal(classifyGrab(4, hand, 40), ERROR_TYPES.COUNTED_COINS_NOT_VALUE)
    })

    it('names one coin too many or too few', () => {
        const hand = ['nickel', 'nickel', 'nickel', 'nickel']
        assert.equal(classifyGrab(15, hand, 20), ERROR_TYPES.MISCOUNTED_COINS)
        assert.equal(classifyGrab(25, hand, 20), ERROR_TYPES.MISCOUNTED_COINS)
    })

    it('names skip-counting the whole pile with the wrong step', () => {
        // Four dimes counted by fives.
        const hand = ['dime', 'dime', 'dime', 'dime']
        assert.equal(classifyGrab(20, hand, 40), ERROR_TYPES.WRONG_DENOMINATION_VALUE)
    })

    it('names one denomination mistaken for another inside a mixed hand', () => {
        // A quarter, two dimes and a nickel is 50. Read the *quarter* as a dime
        // and the total comes out at 35 — a number nothing else in the taxonomy
        // reaches from this hand, which is the point of the case: it can only be
        // found by comparing two denominations, and an earlier version of this
        // check compared each denomination with itself and so found nothing.
        const hand = ['quarter', 'dime', 'dime', 'nickel']

        assert.equal(classifyGrab(35, hand, 50), ERROR_TYPES.WRONG_DENOMINATION_VALUE)

        // Guard the guard: if a simpler explanation ever reaches 35 from this
        // hand, the assertion above stops testing what it says it does.
        for (const unit of [1, 5, 10, 25]) {
            assert.notEqual(hand.length * unit, 35, 'a whole-pile miscount reaches it')
            assert.notEqual(50 + unit, 35, 'one coin too many reaches it')
            assert.notEqual(50 - unit, 35, 'one coin too few reaches it')
        }
    })

    it('names transposed digits', () => {
        const hand = ['quarter', 'dime', 'dime', 'penny', 'penny', 'penny', 'penny']
        assert.equal(classifyGrab(94, hand, 49), ERROR_TYPES.TRANSPOSED_DIGITS)
    })

    it('returns nothing at all for a correct grab', () => {
        assert.equal(classifyGrab(40, ['dime', 'dime', 'dime', 'dime'], 40), null)
    })
})

describe('what crosses the wire', () => {
    it('never sends what a hand is worth, not even to its owner', () => {
        const state = newGame({ count: 4 })
        state.players.p1.handValue = 4242

        const wire = JSON.stringify(publicGame(state))

        assert.ok(!wire.includes('handValue'), 'handValue appeared on the wire')
        assert.ok(!wire.includes('4242'), 'the sum itself leaked')
        assert.ok(wire.includes('coins'), 'but the coins themselves do go over')
    })
})
