/**
 * Wrong-answer classification.
 *
 * The brief asks us to detect *what* a student got wrong and *where* they need
 * help — not to remediate it. So every wrong answer is mapped to an error type,
 * and the lesson's output is a report of which sub-skills are shaky.
 *
 * Three of the four mistakes leave a clean arithmetic signature in the typed
 * number and are separable without asking the student a single follow-up
 * question. The fourth is everything else, and it stays one bucket on purpose:
 * a broken count and a number lost between the chart and the keyboard produce
 * the same digits, and from those digits alone the two are indistinguishable.
 * Splitting it needs the count itself as evidence — see LEARNING.pdf.
 */

import { coinByValue } from '../../lib/money.js'

export const ERROR_TYPES = Object.freeze({
    /** Answered the number of coins, not their value. "4 dimes" -> 4. */
    COUNTED_COINS_NOT_VALUE: 'counted-coins-not-value',

    /** Skip-counted with another coin's step. Counted dimes by 5s. */
    WRONG_DENOMINATION_VALUE: 'wrong-denomination-value',

    /**
     * Counted by the right step, the wrong number of times. 4 nickels -> 15,
     * 25 or 45: every one of those is a whole number of 5s, just not four
     * of them.
     */
    MISCOUNTED_COINS: 'miscounted-coins',

    /** Right digits, wrong order. 45 -> 54. */
    TRANSPOSED_DIGITS: 'transposed-digits',

    /** Not a number at all. */
    UNPARSEABLE: 'unparseable',

    /** Wrong, and none of the above fits. */
    UNKNOWN: 'unknown',
})

/**
 * Classify one answer.
 *
 * The checks run in a fixed order, because some answers satisfy two of them and
 * the tie has to be broken deliberately rather than by whichever `if` came
 * first. Two ties are worth naming:
 *
 *   - Two nickels answered as 20 is both a whole number of 5s (four of them,
 *     so a miscount) and a dime's step taken twice — the right number of jumps
 *     of the wrong size. The second is the more specific claim and the more
 *     likely child: the *method* is intact and the coin's worth is not, which
 *     is a different lesson from losing count. So the wrong step is checked
 *     first, and a miscount is what is left when no real coin explains the
 *     answer.
 *   - Five nickels answered as 5 is both the coin count and one jump of 5.
 *     Answering the number of coins is the mistake the brief singles out and
 *     the one with a name, so it goes first.
 *
 * @param {object} attempt
 * @param {number|null} attempt.answer   Parsed cents, or null if unparseable.
 * @param {string} attempt.raw           What the student actually typed.
 * @param {object} attempt.problem       The problem, from lesson.content.js.
 * @returns {{ correct: boolean, errorType: string|null, kc: string }}
 */
export function classify({ answer, raw, problem }) {
    const { expected, denomination, count, step, kc } = problem

    if (answer === expected) {
        return { correct: true, errorType: null, kc }
    }

    if (answer === null || raw.trim() === '') {
        return { correct: false, errorType: ERROR_TYPES.UNPARSEABLE, kc }
    }

    if (answer === count) {
        return { correct: false, errorType: ERROR_TYPES.COUNTED_COINS_NOT_VALUE, kc }
    }

    // The right number of jumps, of a size that belongs to some other coin.
    // Both halves matter: an answer that divides by the count but implies a
    // 4-cent step is not this mistake, because there is no 4-cent coin to
    // confuse this one with — that answer is a miscount below.
    if (count > 0 && answer % count === 0) {
        const implied = answer / count

        if (implied !== step && coinByValue(implied)) {
            return {
                correct: false,
                errorType: ERROR_TYPES.WRONG_DENOMINATION_VALUE,
                kc,
                impliedStep: implied,
            }
        }
    }

    // A whole number of *this* coin's steps, but not `count` of them. The coin
    // is understood and the counting is not, which is the whole diagnosis.
    if (answer % step === 0) {
        return {
            correct: false,
            errorType: ERROR_TYPES.MISCOUNTED_COINS,
            kc,
            impliedCount: answer / step,
        }
    }

    if (isTransposition(answer, expected)) {
        return { correct: false, errorType: ERROR_TYPES.TRANSPOSED_DIGITS, kc }
    }

    return { correct: false, errorType: ERROR_TYPES.UNKNOWN, kc, denomination }
}

/** Same digits, different order, and genuinely different numbers. */
function isTransposition(answer, expected) {
    const sort = n => String(n).split('').sort().join('')
    return answer !== expected && sort(answer) === sort(expected)
}

/**
 * Roll a set of classified attempts into the report the summary screen shows
 * and `lesson.report` persists.
 */
export function buildReport(attempts) {
    const wrong = attempts.filter(a => !a.correct)

    const byErrorType = {}
    const byKc = {}

    for (const attempt of wrong) {
        byErrorType[attempt.errorType] = (byErrorType[attempt.errorType] ?? 0) + 1
        byKc[attempt.kc] = (byKc[attempt.kc] ?? 0) + 1
    }

    return {
        total: attempts.length,
        correct: attempts.length - wrong.length,
        byErrorType,
        byKc,
        // Where the student needs help, worst first. This is the hand-off point
        // for remediation, which is out of scope.
        weakest: Object.entries(byKc)
            .sort((a, b) => b[1] - a[1])
            .map(([kc, misses]) => ({ kc, misses })),
    }
}
