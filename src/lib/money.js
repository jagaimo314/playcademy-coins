/**
 * Coin domain. Pure functions, no DOM.
 *
 * Scope note: dollar bills are out of scope for this project. Everything is
 * counted in whole cents, so there is no floating point anywhere.
 */

export const CENT = '\u00A2'

/** The four coins, ordered smallest to largest. */
export const COINS = Object.freeze([
    Object.freeze({ id: 'penny', value: 1, label: 'penny', plural: 'pennies' }),
    Object.freeze({ id: 'nickel', value: 5, label: 'nickel', plural: 'nickels' }),
    Object.freeze({ id: 'dime', value: 10, label: 'dime', plural: 'dimes' }),
    Object.freeze({ id: 'quarter', value: 25, label: 'quarter', plural: 'quarters' }),
])

const BY_ID = new Map(COINS.map(coin => [coin.id, coin]))
const BY_VALUE = new Map(COINS.map(coin => [coin.value, coin]))

/** Look up a coin by id. Throws on an unknown id — this is a programming error. */
export function coin(id) {
    const found = BY_ID.get(id)
    if (!found) throw new Error(`Unknown coin id: ${id}`)
    return found
}

/** Face value of a coin, in cents. */
export function valueOf(id) {
    return coin(id).value
}

/**
 * The coin worth exactly this many cents, or `null` if none is. The inverse
 * of `valueOf`, and unlike it a *question* rather than a lookup: the diagnostics
 * ask it of a number the student produced, so "no coin is worth that" is an
 * answer and not a programming error.
 */
export function coinByValue(cents) {
    return BY_VALUE.get(cents) ?? null
}

/** Total value of a list of coin ids, in cents. */
export function sumCoins(ids) {
    return ids.reduce((total, id) => total + valueOf(id), 0)
}

/**
 * Total value of a `{ [coinId]: count }` tally, in cents.
 * `{ dime: 3, penny: 2 }` -> 32
 */
export function sumTally(tally) {
    return Object.entries(tally)
        .reduce((total, [id, count]) => total + valueOf(id) * count, 0)
}

/** Expand a tally into a flat list of coin ids, ordered smallest to largest. */
export function tallyToCoins(tally) {
    return COINS.flatMap(({ id }) => Array.from({ length: tally[id] ?? 0 }, () => id))
}

/** Collapse a list of coin ids into a `{ [coinId]: count }` tally. */
export function coinsToTally(ids) {
    return ids.reduce((tally, id) => {
        tally[id] = (tally[id] ?? 0) + 1
        return tally
    }, {})
}

/**
 * The running totals a student says out loud when skip-counting a pile of one
 * denomination. This is the spine of the lesson.
 *
 *   skipCountSequence('nickel', 4) -> [5, 10, 15, 20]
 */
export function skipCountSequence(id, count) {
    const step = valueOf(id)
    return Array.from({ length: count }, (_, i) => step * (i + 1))
}

/** `35` -> `"35¢"`. Always cent notation, which is what a K-2 kid reads. */
export function formatCents(cents) {
    return `${cents}${CENT}`
}

/** `35` -> `"35¢"`, `150` -> `"$1.50"`. For totals that can exceed a dollar. */
export function formatMoney(cents) {
    if (cents < 100) return formatCents(cents)
    return `$${(cents / 100).toFixed(2)}`
}

/** `3, 'nickel'` -> `"3 nickels"`. Handles the pennies/penny irregular. */
export function describeCount(count, id) {
    const { label, plural } = coin(id)
    return `${count} ${count === 1 ? label : plural}`
}

/**
 * Parse a typed answer into cents. Answers are free text from a 6-year-old,
 * so accept the shapes they actually produce: "35", "35c", "35¢", " 35 ".
 * Returns `null` when the input is not a whole number of cents.
 */
export function parseAnswer(input) {
    const cleaned = String(input).trim().toLowerCase()
        .replace(/[$\s,]/g, '')
        .replace(/(cents|cent|c|\u00A2)$/, '')

    if (!/^\d+$/.test(cleaned)) return null
    return Number.parseInt(cleaned, 10)
}
