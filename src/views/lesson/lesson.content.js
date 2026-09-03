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

import {
    coin,
    coinByValue,
    describeCount,
    formatCents,
    skipCountSequence,
    valueOf,
} from '../../lib/money.js'
import { ERROR_TYPES } from './diagnostics.js'

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
    problem({ id: 'p7', denomination: 'penny', count: 7, kc: KC.PENNIES_BY_1 }),
    problem({ id: 'p8', denomination: 'dime', count: 10, kc: KC.DIMES_BY_10 }),
    problem({ id: 'p9', denomination: 'nickel', count: 15, kc: KC.NICKELS_BY_5 }),
    problem({ id: 'p10', denomination: 'quarter', count: 3, kc: KC.QUARTERS_BY_25 }),
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
    // No line of its own: the move narrates itself, one number per coin as it
    // lands — "5", "10", "15" — which is the count being said out loud rather
    // than a sentence about it. A beat with no `say` is the view's signal to
    // run the move and leave the talking to it.
    {
        id: 'skip-count-callout',
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
        say: p => `Now skip count by pointing where each ${singular(p)} lands. `
            + 'Take the number you ended on and type it in the box.',
    },
    // Spoken over the typing rather than before it, which is why this one is a
    // reminder and not an instruction: the field opened on the line above.
    {
        id: 'answer',
        say: () => 'Remember to Check Answer when you are done.',
    },
]

/* --------------------------------------------------------------- diagnosis */

/*
 * What a wrong answer is told, for the three mistakes that leave a signature a
 * typed number can be read for. Each line names what the student appears to
 * have done and then the one fact that would have fixed it — it is a diagnosis
 * spoken back to a six-year-old, so it says what happened and never that they
 * are wrong.
 *
 * Unlike the narration these lines are read and not spoken, so they use `5¢`
 * rather than "5 cents" — the same notation as the chart they are about.
 *
 * The fourth bucket has no entry on purpose. A broken count and a number lost
 * on the way to the keyboard look identical in the digits, and guessing between
 * them out loud would tell the student something untrue about themselves.
 */
const MISTAKE_COPY = Object.freeze({
    [ERROR_TYPES.COUNTED_COINS_NOT_VALUE]: ({ problem }) =>
        'That is how many coins there are, not what they are worth. '
        + `One ${singular(problem)} is worth ${formatCents(problem.step)}.`,

    // The implied step is always a real coin here — that is what separates this
    // mistake from a miscount — so it can be named, which is the whole point:
    // the method was right and the coin it was applied to was not.
    [ERROR_TYPES.WRONG_DENOMINATION_VALUE]: ({ problem, impliedStep }) =>
        `You counted by ${impliedStep}s — that is what a ${coinByValue(impliedStep).label} `
        + `is worth. One ${singular(problem)} is worth ${formatCents(problem.step)}.`,

    [ERROR_TYPES.MISCOUNTED_COINS]: ({ problem, impliedCount }) => impliedCount === 0
        ? `You did not count by ${problem.step}s at all. `
            + `There ${theseCoins(problem)} to count.`
        : `You counted by ${problem.step}s ${times(impliedCount)}, `
            + `but there ${theseCoins(problem)}.`,
})

/** `1` -> "once", `2` -> "twice", `7` -> "7 times". */
function times(n) {
    if (n === 1) return 'once'
    if (n === 2) return 'twice'
    return `${n} times`
}

/** "are 5 nickels", "is only 1 quarter" — the verb has to agree with the pile. */
function theseCoins({ count, denomination }) {
    const described = describeCount(count, denomination)
    return count === 1 ? `is only ${described}` : `are ${described}`
}

/**
 * How many terms of the count a message is willing to print. Fifteen numbers in
 * a row is not something a six-year-old reads, and a list that runs to the end
 * hands over the answer to a problem they are about to try again.
 */
const TAIL_TERMS = 4

/** "Count along with the coins: 5, 10, 15, 20, and keep counting by 5s." */
function countAlong({ denomination, count, step }) {
    const said = skipCountSequence(denomination, count)
    const shown = said.slice(0, TAIL_TERMS).join(', ')

    return said.length > TAIL_TERMS
        ? `Count along with the coins: ${shown}, and keep counting by ${step}s.`
        : `Count along with the coins: ${shown}.`
}

/**
 * What a wrong answer is told.
 *
 * Where the number carries a signature, that diagnosis is the whole message: it
 * already says what the student did and the one fact that undoes it, and adding
 * the count underneath would bury it. Where it does not, there is nothing true
 * to say about the mistake, so the message falls back to the count itself —
 * which is all we have when we cannot say what happened.
 *
 * Takes a whole `classify()` result rather than an error type, because two of
 * the three diagnoses need what the classifier worked out on the way: which
 * step the answer implies, and how many of them.
 */
export function explainWrongAnswer(result, problem) {
    const line = MISTAKE_COPY[result.errorType]

    return line
        ? line({ ...result, problem })
        : `Not quite. ${countAlong(problem)}`
}
