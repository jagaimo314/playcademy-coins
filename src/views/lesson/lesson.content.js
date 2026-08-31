/**
 * Lesson content as data, kept out of the view so the flow logic and the
 * teaching script can change independently.
 *
 * KC taught: skip-counting a pile of coins that are all the same denomination.
 * Prerequisites assumed mastered: counting objects, knowing each coin's value,
 * and skip-counting by 5s and 10s in the abstract.
 *
 * SCAFFOLD: the script beats and the first problems below show the intended
 * shape. The full 10-problem set and the narration copy still need writing.
 */

import { valueOf } from '../../lib/money.js'

export const LESSON_ID = 'skip-count-like-denomination'

/** Sub-skills each problem is tagged with, so diagnostics can point somewhere. */
export const KC = Object.freeze({
    NICKELS_BY_5: 'skip-count-nickels-by-5',
    DIMES_BY_10: 'skip-count-dimes-by-10',
    QUARTERS_BY_25: 'skip-count-quarters-by-25',
    PENNIES_BY_1: 'count-pennies-by-1',
})

/** The instruction phase, in order. Each beat is narrated and shown. */
export const SCRIPT = [
    {
        id: 'hook',
        say: 'These coins are all the same. We can count them a fast way.',
        // TODO: show a pile of four nickels
    },
    {
        id: 'model',
        say: 'Each nickel is five cents. So we count by fives: five, ten, fifteen, twenty.',
        // TODO: light each coin as its running total is spoken
    },
    {
        id: 'guided',
        say: 'Your turn. Count these dimes with me.',
        // TODO: student taps each coin, running total appears
    },
]

/** Build one problem. `expected` is derived, never hand-typed. */
function problem({ id, denomination, count, kc }) {
    const step = valueOf(denomination)

    return {
        id,
        denomination,
        count,
        step,
        kc,
        expected: step * count,
        prompt: 'How much is this worth?',
    }
}

/** The 10 mastery problems. SCAFFOLD: 3 of 10 written. */
export const PROBLEMS = [
    problem({ id: 'p1', denomination: 'nickel', count: 3, kc: KC.NICKELS_BY_5 }),
    problem({ id: 'p2', denomination: 'dime', count: 4, kc: KC.DIMES_BY_10 }),
    problem({ id: 'p3', denomination: 'quarter', count: 3, kc: KC.QUARTERS_BY_25 }),
    // TODO: p4-p10. Cover every denomination, vary the count, and include at
    // least one pile large enough that counting by 1s becomes visibly slow.
]

export const PROBLEM_COUNT = 10
