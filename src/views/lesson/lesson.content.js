/**
 * Lesson content as data, kept out of the view so the flow logic and the
 * teaching script can change independently.
 *
 * KC taught: skip-counting a pile of coins that are all the same denomination.
 * Prerequisites assumed mastered: counting objects, knowing each coin's value,
 * and skip-counting by 5s and 10s in the abstract.
 *
 * The lesson runs in three modes, in order:
 *   instruction — the teacher demonstrates on `INSTRUCTION_PROBLEM`
 *   guided      — the student is walked through `GUIDED_PROBLEM`
 *   freeplay    — the student completes `FREEPLAY_PROBLEMS` alone
 */

import { coin, describeCount, valueOf } from '../../lib/money.js'

export const LESSON_ID = 'skip-count-like-denomination'

/** Sub-skills each problem is tagged with, so diagnostics can point somewhere. */
export const KC = Object.freeze({
    NICKELS_BY_5: 'skip-count-nickels-by-5',
    DIMES_BY_10: 'skip-count-dimes-by-10',
    QUARTERS_BY_25: 'skip-count-quarters-by-25',
    PENNIES_BY_1: 'count-pennies-by-1',
})

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

/** The 2 problems for instruction and guided practice, followed by 10 mastery problems*/
export const PROBLEMS = [
    problem({ id: 'p1', denomination: 'nickel', count: 3, kc: KC.NICKELS_BY_5 }),
    problem({ id: 'p2', denomination: 'dime', count: 4, kc: KC.DIMES_BY_10 }),
    problem({ id: 'p3', denomination: 'nickel', count: 5, kc: KC.NICKELS_BY_5 }),
    problem({ id: 'p4', denomination: 'quarter', count: 1, kc: KC.QUARTERS_BY_25 }),
    problem({ id: 'p5', denomination: 'dime', count: 5, kc: KC.DIMES_BY_10 }),
    problem({ id: 'p6', denomination: 'quarter', count: 2, kc: KC.QUARTERS_BY_25 }),
    problem({ id: 'p7', denomination: 'penny', count: 5, kc: KC.PENNIES_BY_1 }),
    problem({ id: 'p8', denomination: 'dime', count: 10, kc: KC.DIMES_BY_10 }),
    problem({ id: 'p9', denomination: 'quarter', count: 3, kc: KC.QUARTERS_BY_25 }),
    problem({ id: 'p10', denomination: 'nickel', count: 15, kc: KC.NICKELS_BY_5 }),
    problem({ id: 'p11', denomination: 'dime', count: 8, kc: KC.DIMES_BY_10 }),
    problem({ id: 'p12', denomination: 'nickel', count: 7, kc: KC.NICKELS_BY_5 }),
]

/** The problem the lesson demonstrates on. */
export const INSTRUCTION_PROBLEM = PROBLEMS[0]

/** The problem the student is walked through. */
export const GUIDED_PROBLEM = PROBLEMS[1]

/** The problems the student completes on their own. */
export const FREEPLAY_PROBLEMS = PROBLEMS.slice(2)

export const PROBLEM_COUNT = FREEPLAY_PROBLEMS.length

/** Look up a problem by id. Returns `undefined` for an unknown one. */
export function problemById(id) {
    return PROBLEMS.find(item => item.id === id)
}

/* --------------------------------------------------------------- narration */

const plural = ({ denomination }) => coin(denomination).plural
const singular = ({ denomination }) => coin(denomination).label

/*
 * Every line is written against the problem rather than typed out, so swapping
 * which pile the lesson opens on cannot leave the narration saying "nickels"
 * over a heap of dimes. Values are spelled "5 cents", not "5¢" — this text is
 * read aloud as often as it is read.
 *
 * The animation each beat runs is keyed off its `id` in the view. Copy lives
 * here; behaviour lives there.
 */

/** The instruction phase, in order. The lesson plays this; the student watches. */
export const INSTRUCTION_SCRIPT = [
    {
        id: 'intro',
        say: () => 'We are going to skip count by coins.',
    },
    {
        id: 'identify',
        say: p => `These are ${plural(p)}. Remember ${plural(p)} are worth ${p.step} cents. `
            + `We are going to count by ${p.step}s.`,
    },
    {
        id: 'count-coins',
        say: p => `Let's count the number of ${plural(p)}, `
            + `so we know how many times to count by ${p.step}.`,
    },
    {
        id: 'skip-count',
        say: p => `Now let's count by ${p.step}, ${p.count} times.`,
    },
    {
        id: 'total',
        say: p => `${describeCount(p.count, p.denomination)} are worth ${p.expected} cents.`,
    },
    {
        id: 'check',
        say: () => 'Press the Check Answer button to check.',
    },
]

/** The guided phase, in order. Each beat waits for the student to do the work. */
export const GUIDED_SCRIPT = [
    {
        id: 'yours',
        say: p => `It's your turn now. These are ${plural(p)}. `
            + `Remember how much a ${singular(p)} is worth. Tap one to check.`,
    },
    {
        id: 'count-coins',
        say: p => `Now count the number of ${plural(p)} in front of you. Tap each one.`,
    },
    {
        id: 'skip-count',
        say: p => 'Use the graph on the right and skip count, '
            + `pointing at the place each ${singular(p)} lands.`,
    },
    {
        id: 'answer',
        say: p => `Now type how much ${describeCount(p.count, p.denomination)} are worth, `
            + 'and check your answer.',
    },
]
