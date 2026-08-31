/**
 * Wrong-answer classification.
 *
 * The brief asks us to detect *what* a student got wrong and *where* they need
 * help — not to remediate it. So every wrong answer is mapped to an error type,
 * and the lesson's output is a report of which sub-skills are shaky.
 *
 * SCAFFOLD: the error types below are the intended taxonomy. `classify` handles
 * the mechanical cases; the rest land in UNKNOWN until the lesson content is
 * final and we know which mistakes actually show up.
 */

export const ERROR_TYPES = Object.freeze({
    /** Answered the number of coins, not their value. "4 dimes" -> 4. */
    COUNTED_COINS_NOT_VALUE: 'counted-coins-not-value',

    /** Skip-counted with the wrong step. Counted dimes by 5s. */
    WRONG_DENOMINATION_VALUE: 'wrong-denomination-value',

    /** Right step, one term too many or too few. 4 nickels -> 15 or 25. */
    OFF_BY_ONE_COIN: 'off-by-one-coin',

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
 * @param {object} attempt
 * @param {number|null} attempt.answer   Parsed cents, or null if unparseable.
 * @param {string} attempt.raw           What the student actually typed.
 * @param {object} attempt.problem       The problem, from lesson.content.js.
 * @returns {{ correct: boolean, errorType: string|null, kc: string }}
 */
export function classify({ answer, raw, problem }) {
    const { expected, denomination, count, kc } = problem

    if (answer === expected) {
        return { correct: true, errorType: null, kc }
    }

    if (answer === null || raw.trim() === '') {
        return { correct: false, errorType: ERROR_TYPES.UNPARSEABLE, kc }
    }

    const step = problem.step

    if (answer === count) {
        return { correct: false, errorType: ERROR_TYPES.COUNTED_COINS_NOT_VALUE, kc }
    }

    if (answer === expected - step || answer === expected + step) {
        return { correct: false, errorType: ERROR_TYPES.OFF_BY_ONE_COIN, kc }
    }

    // A clean multiple of the count, but not of this coin's value: they used
    // another denomination's step. Counted dimes by 5s, say.
    if (count > 0 && answer % count === 0 && answer / count !== step) {
        return { correct: false, errorType: ERROR_TYPES.WRONG_DENOMINATION_VALUE, kc }
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
