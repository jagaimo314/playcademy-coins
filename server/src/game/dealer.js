/**
 * Hands, prices and the guarantee that the game stays solvable.
 *
 * This is the part that decides whether the bakery is fun, and it is the
 * strongest reason spawning is server-side rather than per-client: keeping
 * every hand matchable is a scheduling problem *across* belts, so it has to
 * live where the belts are.
 *
 * Coin maths comes from the frontend's `lib/money.js`, imported rather than
 * copied. `lib/` is pure and DOM-free by the dependency rule, so it runs in Node
 * with no shim — and `sumCoins` means precisely the same thing on both sides of
 * the wire. Duplicating denomination values across a client and a server is how
 * you ship a game that disagrees with itself about what a dime is worth.
 */

import { COINS, sumCoins, valueOf } from '../../../src/lib/money.js'
import { ERROR_TYPES } from '../../../src/views/lesson/diagnostics.js'
import { MAX_HAND_COINS, difficultyConfig } from './config.js'

/** Denomination ids, largest first — the order a child is taught to count in. */
const BY_VALUE_DESC = [...COINS].sort((a, b) => b.value - a.value)

/**
 * How a coin may be broken into smaller ones, for adding variety to a hand that
 * greedy change-making would otherwise render as a fistful of quarters. Each
 * entry costs `replacement.length - 1` extra coins against the hand's budget.
 */
const BREAKS = Object.freeze({
    quarter: Object.freeze(['dime', 'dime', 'nickel']),
    dime: Object.freeze(['nickel', 'nickel']),
    nickel: Object.freeze(['penny', 'penny', 'penny', 'penny', 'penny']),
})

/**
 * The chance a spawn slot is used at all when no hand is waiting for a match.
 *
 * Not 1. A belt with a tray in every slot is a solid wall of trays, and the
 * whole reason `conveyor-belt` leaves a gap inside each slot is so a child can
 * tell which one they are pointing at. Gaps in the *occupancy* do the same job
 * at a larger scale, and they give a jam somewhere to form once M3 shuts the
 * doors.
 */
const DECOY_SPAWN_CHANCE = 0.7

/**
 * Deal a hand for one player.
 *
 * `taken` is the set of values already in play. Hands are dealt distinct-valued
 * across active players wherever the pool allows, so a tray is normally
 * unambiguous — two kids reaching for the same 30¢ tray because they are both
 * holding 30¢ is a race the game should not be creating on purpose.
 *
 * The retry is bounded and then gives up rather than looping: at 4 players on
 * easy the pool of legal values is small enough that a collision is sometimes
 * genuinely unavoidable, and a duplicate hand is a mild annoyance where a hung
 * tick is a dead game.
 */
export function dealHand(cursor, difficulty, taken = new Set()) {
    const { hand: rules } = difficultyConfig(difficulty)

    let fallback = null

    for (let attempt = 0; attempt < 24; attempt += 1) {
        const coins = rules.mixed ? mixedHand(cursor, rules) : singleDenominationHand(cursor, rules)
        if (!coins) continue

        const value = sumCoins(coins)
        if (!taken.has(value)) return { coins, value }

        fallback ??= { coins, value }
    }

    return fallback ?? { coins: ['nickel'], value: 5 }
}

/**
 * One denomination, skip-counted. Exactly the knowledge component the lesson
 * teaches, which is what makes easy mode continuous with the lesson rather than
 * a new thing to learn under time pressure.
 */
function singleDenominationHand(cursor, { minValue, maxValue }) {
    const legal = []

    for (const { id, value } of COINS) {
        const lowest = Math.max(1, Math.ceil(minValue / value))
        const highest = Math.min(MAX_HAND_COINS, Math.floor(maxValue / value))

        for (let count = lowest; count <= highest; count += 1) legal.push({ id, count })
    }

    if (!legal.length) return null

    const { id, count } = cursor.pick(legal)
    return Array.from({ length: count }, () => id)
}

/**
 * A mixed hand, built value-first: choose what it should be worth, then make
 * that value in coins.
 *
 * Building it the other way round — adding coins until the total looks about
 * right — sounds simpler and is not: the total lands wherever it lands, so the
 * range has to be enforced by rejection, and rejection loops are how a tick
 * starts taking an unbounded amount of time.
 */
function mixedHand(cursor, { minValue, maxValue }) {
    const value = cursor.int(minValue, maxValue)
    const coins = makeChange(value)

    // US denominations are canonical, so greedy is always minimal — but minimal
    // for 99¢ is nine coins, which is why the budget below is not tighter.
    if (!coins || coins.length > MAX_HAND_COINS) return null

    return addVariety(cursor, coins)
}

/** Greedy change-making. Canonical denominations, so this is minimal by construction. */
function makeChange(value) {
    const coins = []
    let left = value

    for (const { id, value: unit } of BY_VALUE_DESC) {
        while (left >= unit) {
            coins.push(id)
            left -= unit
        }
    }

    return left === 0 ? coins : null
}

/**
 * Break a few coins down, while the hand's budget allows.
 *
 * Without this every mixed hand is the minimal one, so 40¢ is always a quarter,
 * a dime and a nickel and never four dimes — and the child learns the shape of
 * the greedy algorithm instead of learning to add. The total never changes, so
 * the value chosen above survives untouched.
 */
function addVariety(cursor, coins) {
    let out = [...coins]

    for (let round = 0; round < 3; round += 1) {
        const options = out
            .map((id, index) => ({ id, index }))
            .filter(({ id }) => BREAKS[id] && out.length + BREAKS[id].length - 1 <= MAX_HAND_COINS)

        if (!options.length || !cursor.chance(0.55)) break

        const { id, index } = cursor.pick(options)
        out = [...out.slice(0, index), ...BREAKS[id], ...out.slice(index + 1)]
    }

    // Largest first, matching how the wallet reads a hand out loud.
    return out.sort((a, b) => valueOf(b) - valueOf(a))
}

/**
 * Decide what price the next tray off the oven carries.
 *
 * Returns `{ price, forPlayerId, errorType }`, or `null` for "bake nothing this
 * beat". A tray reserved as somebody's match carries `forPlayerId`; a decoy
 * carries the error it is designed to catch.
 *
 * **A due match always outranks a decoy.** That ordering is the solvability
 * guarantee: the longest-waiting hand takes the next available slot, so no hand
 * can be starved by a run of unlucky rolls.
 */
export function chooseSpawn(cursor, state) {
    const waiting = Object.values(state.players)
        .filter(player => player.hand.length && player.pendingMatchItemId === null)
        .sort((a, b) => a.matchWaitingSinceMs - b.matchWaitingSinceMs || (a.id < b.id ? -1 : 1))

    if (waiting.length) {
        const player = waiting[0]
        return { price: player.handValue, forPlayerId: player.id, errorType: null }
    }

    if (!cursor.chance(DECOY_SPAWN_CHANCE)) return null

    const live = Object.values(state.players).filter(player => player.hand.length)
    if (!live.length) return null

    const target = cursor.pick(live)
    const decoy = decoyPrice(cursor, target.hand, target.handValue)

    return decoy && { price: decoy.price, forPlayerId: null, errorType: decoy.errorType }
}

/**
 * A wrong price that a child might plausibly arrive at from this hand, drawn
 * from the taxonomy `views/lesson/diagnostics.js` already classifies.
 *
 * This is what makes a wrong grab a *classified* wrong grab rather than a
 * wasted muffin: the game produces the same diagnostic signal as the lesson,
 * for free, because the wrong answers on the belt are the wrong answers the
 * lesson is already looking for.
 */
export function decoyPrice(cursor, hand, value) {
    const candidates = []
    const offer = (price, errorType) => {
        if (Number.isInteger(price) && price >= 1 && price <= 99 && price !== value) {
            candidates.push({ price, errorType })
        }
    }

    // Right step, one term too many or too few — so ± the value of a coin that
    // is actually in the hand, not a fixed ±1. That is the mixed-hand form of
    // a miscount; on the lesson's like-denomination pile the same error type
    // covers any wrong number of jumps, which a mixed hand has no notion of.
    for (const id of new Set(hand)) {
        offer(value + valueOf(id), ERROR_TYPES.MISCOUNTED_COINS)
        offer(value - valueOf(id), ERROR_TYPES.MISCOUNTED_COINS)
    }

    // Answered the number of coins instead of what they are worth.
    offer(hand.length, ERROR_TYPES.COUNTED_COINS_NOT_VALUE)

    // Right digits, wrong order.
    offer(transpose(value), ERROR_TYPES.TRANSPOSED_DIGITS)

    // Skip-counted with somebody else's step: the whole pile counted as if
    // every coin were the same denomination. "Counted the lot by fives."
    for (const { value: unit } of COINS) {
        offer(hand.length * unit, ERROR_TYPES.WRONG_DENOMINATION_VALUE)
    }

    // Or one denomination in the hand mistaken for another, with the rest
    // counted correctly — the mistake a mixed hand actually invites. It needs
    // both denominations: which coin was misread, and what it was misread as.
    for (const from of new Set(hand)) {
        for (const { id: to, value: unit } of COINS) {
            if (to === from) continue
            offer(recount(hand, from, unit), ERROR_TYPES.WRONG_DENOMINATION_VALUE)
        }
    }

    return candidates.length ? cursor.pick(candidates) : null
}

/**
 * Classify a wrong grab against the grabbing player's own hand.
 *
 * Deliberately *not* read off the item's `errorType`. A player can grab a tray
 * that was baked as somebody else's decoy, and in that case the item's tag
 * describes a mistake this child did not make. The diagnosis has to be about
 * the hand that was held.
 */
export function classifyGrab(price, hand, value) {
    if (price === value) return null
    if (price === hand.length) return ERROR_TYPES.COUNTED_COINS_NOT_VALUE

    for (const id of new Set(hand)) {
        if (price === value + valueOf(id) || price === value - valueOf(id)) {
            return ERROR_TYPES.MISCOUNTED_COINS
        }
    }

    for (const { value: unit } of COINS) {
        if (price === hand.length * unit) return ERROR_TYPES.WRONG_DENOMINATION_VALUE
    }

    for (const from of new Set(hand)) {
        for (const { id: to, value: unit } of COINS) {
            if (to === from) continue
            if (price === recount(hand, from, unit)) return ERROR_TYPES.WRONG_DENOMINATION_VALUE
        }
    }

    if (price === transpose(value)) return ERROR_TYPES.TRANSPOSED_DIGITS

    return ERROR_TYPES.UNKNOWN
}

/** The hand's value if every `from` coin were worth `unit` and the rest were right. */
function recount(hand, from, unit) {
    return hand.reduce((total, held) => total + (held === from ? unit : valueOf(held)), 0)
}

/** `45` -> `54`. Returns `null` when there is nothing to transpose. */
function transpose(value) {
    const digits = String(value)
    if (digits.length < 2) return null

    const flipped = Number.parseInt([...digits].reverse().join(''), 10)
    return flipped === value ? null : flipped
}
