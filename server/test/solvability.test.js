/**
 * The property that decides whether the game feels broken.
 *
 * A child holding 35¢ while the bakery refuses to bake a 35¢ tray has no move.
 * They cannot deduce that, they cannot fix it, and they will conclude the game
 * is cheating — so this is not a nice-to-have, it is the difference between a
 * game and a bug with a scoreboard.
 *
 * Checked across many seeded games rather than by reading `chooseSpawn`,
 * because the failure mode is emergent: the dealer is fine in isolation and
 * starves somebody once four hands, a full belt and an incinerator are all
 * competing for the same slot 0.
 */

import { strict as assert } from 'node:assert'
import { describe, it } from 'node:test'

import { MATCH_WINDOW_MS, TICK_MS } from '../src/game/config.js'
import { createCursor } from '../src/game/rng.js'
import { step } from '../src/game/step.js'
import { newGame } from './helpers.js'

const GAMES = 1000
const GAME_MS = 20000

/**
 * Play one game with random-but-legal intents and return the longest any hand
 * went without a tray at its price being somewhere on a belt.
 *
 * The target and waste limit are lifted out of reach on purpose: a game that
 * ends after nine seconds proves nothing about a twelve-second window, and
 * random play loses very fast.
 */
function longestStarvation(seed, playerCount) {
    let state = newGame({ count: playerCount, difficulty: 'easy', seed })
    state.target = 10000
    state.wasteLimit = 10000

    const cursor = createCursor(seed ^ 0x5f5f)

    /** `playerId -> the last time a tray at that hand's price was on a belt`. */
    const lastSeen = new Map(Object.keys(state.players).map(id => [id, 0]))
    let worst = 0

    for (let elapsed = 0; elapsed < GAME_MS; elapsed += TICK_MS) {
        state = step(state, TICK_MS, randomIntents(cursor, state)).state

        const onBelts = new Set(state.belts
            .flatMap(belt => belt.slots)
            .filter(Boolean)
            .map(id => state.items[id]?.price))

        for (const player of Object.values(state.players)) {
            if (!player.hand.length) continue

            // A hand dealt this instant starts its own clock, so a served player
            // is not charged for the wait their predecessor had already run up.
            const since = Math.max(lastSeen.get(player.id) ?? 0, player.handDealtAtMs)

            if (onBelts.has(player.handValue)) lastSeen.set(player.id, state.elapsedMs)
            else worst = Math.max(worst, state.elapsedMs - since)
        }
    }

    return worst
}

/**
 * Legal noise: sometimes grab a tray, sometimes the right one, mostly nothing.
 *
 * Both halves matter. Grabbing wrongly exercises the cooldown and the waste
 * path; grabbing rightly forces a re-deal, which is what puts a *new* hand into
 * the queue and makes starvation possible in the first place.
 */
function randomIntents(cursor, state) {
    if (!cursor.chance(0.06)) return []

    const players = Object.values(state.players).filter(player => player.hand.length)
    const items = Object.values(state.items).filter(item => item.state === 'traveling')
    if (!players.length || !items.length) return []

    const player = cursor.pick(players)
    const wanted = items.filter(item => item.price === player.handValue)

    // Half the time play well, so hands actually turn over.
    const item = wanted.length && cursor.chance(0.5) ? cursor.pick(wanted) : cursor.pick(items)

    return [{
        type: 'action/claim',
        playerId: player.id,
        itemId: item.id,
        receivedAtMs: state.elapsedMs,
    }]
}

/**
 * The adversarial driver: whoever cannot afford a tray grabs it anyway, so
 * every reservation on the belt is destroyed the moment it appears. It is the
 * worst thing four children can do to each other without cheating.
 */
function destroyEverything(state) {
    const item = Object.values(state.items).find(one => one.state === 'traveling')
    if (!item) return []

    const wrong = Object.values(state.players)
        .find(player => player.hand.length
            && player.handValue !== item.price
            && state.elapsedMs >= player.cooldownUntilMs)

    if (!wrong) return []

    return [{
        type: 'action/claim',
        playerId: wrong.id,
        itemId: item.id,
        receivedAtMs: state.elapsedMs,
    }]
}

describe('solvability', () => {
    it(`no hand waits longer than the match window across ${GAMES} seeded games`, () => {
        let worst = 0
        let worstSeed = 0

        for (let seed = 1; seed <= GAMES; seed += 1) {
            // 2-4 players, cycled, so the crowded case is covered too: four
            // hands on one belt is where the dealer has the least room.
            const starved = longestStarvation(seed, 2 + (seed % 3))

            if (starved > worst) {
                worst = starved
                worstSeed = seed
            }
        }

        assert.ok(
            worst <= MATCH_WINDOW_MS,
            `seed ${worstSeed} starved a hand for ${worst}ms, over the ${MATCH_WINDOW_MS}ms window`,
        )
    })

    it('does not rebake the same player while the others wait', () => {
        // The bug this pins down: every opening hand is dealt at `elapsedMs` 0,
        // so ordering the spawn queue by when a hand arrived left all three
        // players tied and the tiebreak fell to insertion order. p1's tray was
        // then destroyed by somebody grabbing it wrongly, p1 went straight back
        // to the front of a queue they had never left, and p2 and p3 never saw
        // a tray they could buy for the entire game.
        let state = newGame({ count: 3, difficulty: 'easy', seed: 1 })
        state.target = 10000
        state.wasteLimit = 10000

        const baked = new Set()

        for (let elapsed = 0; elapsed < 20000; elapsed += TICK_MS) {
            const result = step(state, TICK_MS, destroyEverything(state))
            state = result.state

            for (const event of result.events) {
                if (event.type === 'item/spawned') baked.add(event.payload.item.price)
            }
        }

        const wanted = new Set(Object.values(state.players).map(player => player.handValue))
        for (const value of wanted) {
            assert.ok(baked.has(value), `nothing was ever baked at ${value}, the queue starved somebody`)
        }
    })

    it('replays identically from the same seed and the same intents', () => {
        // This is what makes "that spawn looked unfair" a test rather than an
        // argument, so it is worth asserting rather than assuming.
        const play = () => {
            let state = newGame({ count: 3, difficulty: 'medium', seed: 99 })
            for (let i = 0; i < 200; i += 1) state = step(state, TICK_MS, []).state
            return JSON.stringify(state)
        }

        assert.equal(play(), play())
    })

    it('leaves the state it was handed untouched', () => {
        const state = newGame({ count: 2, seed: 4 })
        const before = JSON.stringify(state)

        step(state, 5000, [])

        assert.equal(JSON.stringify(state), before, 'step() mutated its input')
    })
})
