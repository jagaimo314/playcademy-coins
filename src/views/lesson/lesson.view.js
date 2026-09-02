import { el } from '../../lib/dom.js'
import { CENT, describeCount, formatCents, skipCountSequence } from '../../lib/money.js'
import { createAnswerInput } from '../../components/answer-input/answer-input.js'
import { createCoinPile } from '../../components/coin-pile/coin-pile.js'
import { createNarrator } from '../../components/narrator/narrator.js'
import { createProgressBar } from '../../components/progress-bar/progress-bar.js'
import { SkipCountCurrencyGrid } from '../../components/SkipCountCurrencyGrid.js'
import {
    FREEPLAY_PROBLEMS,
    GUIDED_PROBLEM,
    GUIDED_SCRIPT,
    INSTRUCTION_PROBLEM,
    INSTRUCTION_SCRIPT,
} from './lesson.content.js'
import './lesson.css'

/**
 * The skip-count-by-like-denomination lesson.
 *
 * The screen is a fixed 1200x800 frame so the geometry is the same on every
 * display — a hundred-chart whose cells drift with the viewport is no use for
 * pointing at. Everything inside is positioned against that frame: the narrator
 * top left, the chart hanging off the right edge, and the pile, the question
 * and the answer in the space between them.
 *
 * Three modes run in order, and each hands over only when the student has an
 * answer marked right:
 *
 *   instruction — the lesson demonstrates. It narrates, boxes the pile, turns
 *                 the coins over, counts them, walks the chart, and fills the
 *                 answer in. The student presses Check Answer.
 *   guided      — the same shape with the doing handed over. Each beat waits
 *                 for the taps it asked for before the next line is spoken.
 *   freeplay    — ten piles, one at a time, no scaffolding.
 *
 * Answering is two beats throughout, not one. The typed number goes onto the
 * chart first as an outline star — the student's claim, staked before it is
 * judged — and only then does the count run.
 */

/** The frame every lesson element lives inside. */
const FRAME = Object.freeze({ width: 1200, height: 800 })

/** Gap between the chart's right edge and the frame's. */
const GRID_INSET = 15

/** Where the pile starts, from the frame's top edge. The narrator has the rest. */
const PILE_TOP = 200

/** Coins per row in the pile, and the gap between them. */
const PILE_COLUMNS = 5
const PILE_GAP = 15

/**
 * A quarter's diameter and the chart's cell, deliberately the same number: a
 * coin landing on the chart is then the size of the coin it came from in the
 * pile. Smaller coins keep their real proportions against it — the ratios in
 * `coin.css` scale off this value, so a dime never grows to a quarter's width.
 */
const COIN_SIZE = 70
const GRID_CELL = COIN_SIZE

/** Milliseconds between each coin landing on the chart. */
const SKIP_DELAY = 550

/** How long each coin holds its boundary while the pile is being counted. */
const COUNT_STEP_MS = 700

/**
 * How long a right answer is left alone before the lesson moves on. The next
 * problem builds a new chart, so without this the green star the student just
 * earned is wiped in the same breath it appears.
 */
const CELEBRATE_MS = 1000

/**
 * Floor on how long a narrated line stays up. Speech is muted, unsupported or
 * simply switched off often enough that the beats cannot be paced by it alone —
 * the caption has to be readable on its own.
 */
const DWELL_BASE_MS = 900
const DWELL_PER_CHAR_MS = 45

/** Ceiling on waiting for speech: a voice that never fires `end` must not stall. */
const SPEECH_CAP_MS = 14000

/** What each mode is called on screen. `freeplay` counts the puzzles instead. */
const MODE_LABELS = Object.freeze({
    instruction: 'Instruction',
    guided: 'Guided',
    freeplay: 'Free play',
})

const delay = ms => new Promise(resolve => setTimeout(resolve, ms))

/**
 * The card the lesson opens and closes on: the whole frame given over to a
 * title, a line of copy and exactly one button.
 *
 * Both ends want the same thing — one decision and nothing else on screen — so
 * they are one card rather than two that drift apart. The opening one exists
 * because browsers refuse to speak before a user gesture; the closing one
 * because being finished is not another narrated line to scroll past.
 */
function createLessonCard({ title, body, button }) {
    return el('div', { class: 'pc-lesson__card' },
        el('div', { class: 'pc-lesson__card-inner pc-card' }, [
            el('h1', {}, title),
            el('p', {}, body),
            button,
        ]))
}

export function createLessonView({ store, navigate, params }) {
    const narrator = createNarrator()
    const progress = createProgressBar({
        value: 0,
        max: FREEPLAY_PROBLEMS.length,
        label: 'Puzzles finished',
    })

    /** The pile and the chart are rebuilt per problem; these hold their place. */
    const pileHolder = el('div', { class: 'pc-lesson__pile' })
    const chartHolder = el('div', { class: 'pc-lesson__chart' })

    const modeLabel = el('p', { class: 'pc-lesson__mode' })

    let problem = null
    let pile = null
    let grid = null

    /** Set true by `destroy()`. Every await point in the flow checks it. */
    let cancelled = false
    let checking = false

    /** What a tap on a coin means right now. Rewritten by each guided beat. */
    let onCoinTap = null

    /** Set while the chart is counting, to caption the pile as it goes. */
    let onGridReveal = null

    /** The promise the flow is currently parked on, so teardown can settle it. */
    let pendingGate = null

    /** Set while a beat is waiting for an answer to come back right. */
    let answerGate = null

    /* ------------------------------------------------------------- the board */

    const answer = createAnswerInput({
        label: 'is worth',
        placeholder: '?',
        suffix: CENT,
        submitLabel: 'Check Answer',
        variant: 'stacked',
        onSubmit: async ({ cents }) => {
            if (!await check(cents)) return

            const opened = answerGate
            answerGate = null
            opened?.settle()
        },
    })

    /**
     * Stake the answer on the chart, run the count, then judge it. Resolves
     * true only when the answer was right, which is what every mode gates on.
     */
    async function check(cents) {
        if (checking) return false

        checking = true
        answer.update({ disabled: true })

        const placed = grid.markAnswer(cents, 'pending')

        if (!placed) {
            answer.setStatus('hint',
                `${formatCents(cents)} is off the chart — it stops at ${formatCents(grid.cellCount)}.`)
        }

        const finished = await grid.animateSkipCount(SKIP_DELAY)

        // The view went away mid-count; there is nothing left to write to.
        if (cancelled) return false

        if (!finished) {
            checking = false
            answer.update({ disabled: false })
            return false
        }

        const isCorrect = cents === problem.expected
        if (placed) grid.setAnswerStatus(isCorrect ? 'correct' : 'wrong')

        if (isCorrect) {
            answer.setStatus('correct',
                `Yes! ${describeCount(problem.count, problem.denomination)} is ${formatCents(problem.expected)}.`)
        } else {
            const said = skipCountSequence(problem.denomination, problem.count).join(', ')

            // An off-chart answer has no red star to explain itself, so the
            // message has to carry that on its own.
            answer.setStatus('wrong', placed
                ? `Not quite. Count along with the coins: ${said}.`
                : `${formatCents(cents)} is off the chart. Count along with the coins: ${said}.`)
        }

        checking = false
        // A right answer stays put until the next problem is loaded; a wrong one
        // hands the field straight back.
        if (!isCorrect) {
            answer.update({ disabled: false })
            answer.focus()
            return false
        }

        // Hold on the green star. Whatever comes next — the following beat or
        // the next puzzle — is what takes it away.
        await delay(CELEBRATE_MS)

        return !cancelled
    }

    /**
     * Swap in a problem: new pile, new chart. Both are rebuilt rather than
     * reconfigured — a chart takes its skip interval from its denomination at
     * construction, so a new denomination is a new chart.
     */
    function loadProblem(next, { interactive = false } = {}) {
        problem = next

        pile?.destroy()
        grid?.destroy()

        pile = createCoinPile({
            denomination: next.denomination,
            count: next.count,
            columns: PILE_COLUMNS,
            gap: PILE_GAP,
            onCoinTap: interactive ? index => onCoinTap?.(index) : null,
        })

        grid = new SkipCountCurrencyGrid({
            numRows: 10,
            numCols: 10,
            cellSize: GRID_CELL,
            denomination: next.denomination,
            numCoins: next.count,
            onReveal: event => onGridReveal?.(event),
        })

        pileHolder.appendChild(pile.el)
        chartHolder.appendChild(grid.el)

        // The work column fills whatever the chart leaves it, so it has to be
        // told how wide the chart came out.
        frame.style.setProperty('--pc-lesson-grid-width', `${grid.el.getAttribute('width')}px`)

        answer.clear()
        answer.update({ disabled: true })
    }

    /* ----------------------------------------------------------- beat runner */

    /**
     * Park the flow until something opens the gate — a tap, a right answer, or
     * teardown. Never rejects; the flow checks `cancelled` after every await.
     */
    function openGate() {
        let settle = () => {}
        const done = new Promise(resolve => { settle = resolve })

        pendingGate = { done, settle }

        return pendingGate
    }

    /** Wait until an answer comes back marked right. */
    function awaitCorrectAnswer() {
        const gate = openGate()
        answerGate = gate

        return gate.done
    }

    /**
     * Say a line, run whatever the beat does, and move on only when both have
     * finished. They run together on purpose: the animation is what the
     * sentence is describing.
     */
    async function playBeat(beat, moves) {
        const line = beat.say(problem)

        await Promise.all([
            Promise.race([narrator.say(line), delay(SPEECH_CAP_MS)]),
            delay(DWELL_BASE_MS + line.length * DWELL_PER_CHAR_MS),
            moves[beat.id]?.(),
        ])

        return !cancelled
    }

    async function playScript(script, moves) {
        for (const beat of script) {
            if (cancelled) return false
            if (!await playBeat(beat, moves)) return false
        }

        return true
    }

    /* ----------------------------------------------------------- instruction */

    /** Draw a boundary round each coin in turn, numbering them as we go. */
    async function countPileForThem() {
        pile.reset()

        for (let index = 0; index < problem.count; index += 1) {
            if (cancelled) return
            pile.markCoin(index, { selected: true, caption: String(index + 1) })
            await delay(COUNT_STEP_MS)
        }
    }

    const INSTRUCTION_MOVES = {
        identify: async () => {
            await pile.revealBox()
            if (cancelled) return
            await pile.peekAll('Generic')
        },

        'count-coins': () => countPileForThem(),

        'skip-count': async () => {
            // Wipe the ordinals off the pile: the same coins are about to be
            // walked a second time, and what they carried the first time round
            // is not what they stand for now.
            pile.reset()

            // The running total is read off the chart, not printed on the coin.
            // Two numbers on one coin — the ordinal it just had and the total it
            // now stands for — is the exact confusion skip-counting is meant to
            // clear up, so the coin only says "counted".
            onGridReveal = ({ cell, index }) => {
                grid.highlightCell(cell)
                pile.markCoin(index, { selected: true })
            }

            await grid.animateSkipCount(SKIP_DELAY)
            onGridReveal = null
        },

        total: () => { answer.setValue(problem.expected) },

        check: () => {
            answer.update({ disabled: false })
            answer.focus()

            // The gate opens inside the beat, not after it, so a fast tap on
            // Check Answer cannot land in the gap between the two.
            return awaitCorrectAnswer()
        },
    }

    function runInstruction() {
        loadProblem(INSTRUCTION_PROBLEM)
        return playScript(INSTRUCTION_SCRIPT, INSTRUCTION_MOVES)
    }

    /* ---------------------------------------------------------------- guided */

    /**
     * Hand the pile over: every tap marks one coin, and the beat ends when the
     * whole pile has been marked. `label` is called with how many coins are
     * already done and returns what this tap writes under the coin — `null` for
     * no caption at all, or `false` to refuse the tap.
     */
    function tapEveryCoin(label) {
        pile.reset()

        const tapped = new Set()
        const gate = openGate()

        onCoinTap = index => {
            if (tapped.has(index)) return

            const caption = label(tapped.size)
            if (caption === false) return

            tapped.add(index)
            pile.markCoin(index, { selected: true, caption })

            if (tapped.size === problem.count) gate.settle()
        }

        return gate.done
    }

    const GUIDED_MOVES = {
        // Tapping turns a coin over to its value side — the student checking
        // their own memory rather than being told the answer again.
        yours: () => { onCoinTap = index => pile.peekCoin(index) },

        'count-coins': () => tapEveryCoin(alreadyTapped => String(alreadyTapped + 1)),

        // The same gesture, one level up: each tap now lands a coin on the
        // chart. The running total lives there and only there — the coin says it
        // has been counted and nothing more.
        'skip-count': () => tapEveryCoin(() => {
            const cell = grid.revealNext()
            if (cell === null) return false

            grid.highlightCell(cell)
            return null
        }),

        answer: () => {
            onCoinTap = null
            answer.update({ disabled: false })
            answer.focus()

            return awaitCorrectAnswer()
        },
    }

    function runGuided() {
        loadProblem(GUIDED_PROBLEM, { interactive: true })
        return playScript(GUIDED_SCRIPT, GUIDED_MOVES)
    }

    /* -------------------------------------------------------------- freeplay */

    async function runFreeplay() {
        for (const [index, next] of FREEPLAY_PROBLEMS.entries()) {
            if (cancelled) return false

            loadProblem(next)
            progress.update({ value: index })
            modeLabel.textContent = `Puzzle ${index + 1} of ${FREEPLAY_PROBLEMS.length}`

            answer.update({ disabled: false })

            await Promise.all([
                Promise.race([narrator.say(next.prompt), delay(SPEECH_CAP_MS)]),
                // The gate is opened in the same tick the field is enabled, so
                // there is no window in which an answer can be missed.
                awaitCorrectAnswer(),
            ])
        }

        progress.update({ value: FREEPLAY_PROBLEMS.length })

        return !cancelled
    }

    /* ------------------------------------------------------------ the phases */

    const PHASES = [
        { mode: 'instruction', run: runInstruction },
        { mode: 'guided', run: runGuided },
        { mode: 'freeplay', run: runFreeplay },
    ]

    /**
     * Close the lesson on the same card it opened on. The line is still spoken,
     * but it does not live in the narrator's caption band: every other line of
     * the lesson has passed through there and gone, and the one that says the
     * student is finished — and carries the way out — has to stay put.
     */
    function showFinishedCard() {
        const backButton = el('button', {
            type: 'button',
            class: 'pc-button pc-button--blue',
            onClick: () => navigate('/'),
        }, 'Back to menu')

        frame.appendChild(createLessonCard({
            title: 'You did it!',
            body: 'You counted every pile. The Bakery is open now.',
            button: backButton,
        }))

        // Nobody touched a control to get here, so the focus has to be moved
        // deliberately — the button is the only thing left to do.
        backButton.focus()
    }

    async function run(from) {
        const start = Math.max(0, PHASES.findIndex(phase => phase.mode === from))

        for (const phase of PHASES.slice(start)) {
            frame.dataset.mode = phase.mode
            modeLabel.textContent = MODE_LABELS[phase.mode]

            if (!await phase.run()) return
        }

        frame.dataset.mode = 'done'
        answer.update({ disabled: true })
        modeLabel.textContent = 'All done'

        // The Bakery gate opens here, and only here — finishing the ten is what
        // the lesson is for.
        store.set('lesson.completed', true)

        showFinishedCard()

        await narrator.say('You did it! You counted every pile. The Bakery is open now.')
    }

    /* ----------------------------------------------------------------- frame */

    // Speech is blocked until the first gesture, so the lesson opens on a tap
    // rather than auto-playing.
    const startButton = el('button', {
        type: 'button',
        class: 'pc-button pc-button--blue',
        onClick: () => {
            startCard.remove()

            // `?mode=guided|freeplay` skips ahead. A stand-in for resuming,
            // and the only way to reach a later mode without sitting through
            // the earlier ones.
            run(params?.get('mode') ?? 'instruction').catch(() => {
                if (!cancelled) narrator.say('Something went wrong. Reload the page to start again.')
            })
        },
    }, 'Start')

    const startCard = createLessonCard({
        title: 'Counting coins that match',
        body: 'We will count a pile of coins the fast way.',
        button: startButton,
    })

    const frame = el('div', {
        class: 'pc-lesson__frame',
        dataset: { mode: 'instruction' },
        style: {
            width: `${FRAME.width}px`,
            height: `${FRAME.height}px`,
            '--pc-lesson-grid-inset': `${GRID_INSET}px`,
            '--pc-lesson-pile-top': `${PILE_TOP}px`,
            '--pc-coin-size': `${COIN_SIZE}px`,
        },
    }, [
        el('div', { class: 'pc-lesson__narration' }, narrator.el),
        el('div', { class: 'pc-lesson__work' }, [pileHolder, answer.el]),
        chartHolder,

        el('div', { class: 'pc-lesson__status' }, [modeLabel, progress.el]),

        // Not lesson furniture: the way back out, plus the unlock the Bakery
        // gate needs before anyone has sat through all ten puzzles.
        el('div', { class: 'pc-lesson__footer' }, [
            el('button', {
                type: 'button',
                class: 'pc-button pc-button--quiet pc-lesson__exit',
                onClick: () => navigate('/'),
            }, 'Back to menu'),
            el('button', {
                type: 'button',
                class: 'pc-button pc-button--quiet pc-lesson__exit',
                onClick: () => {
                    store.set('lesson.completed', true)
                    navigate('/')
                },
            }, 'Dev: mark lesson complete'),
        ]),

        startCard,
    ])

    // Fixed rather than in the document flow: the frame is a fixed size by
    // design, so it is centred against the viewport, not against #app's column.
    const root = el('section', { class: 'pc-lesson-stage' }, frame)

    loadProblem(INSTRUCTION_PROBLEM)

    return {
        el: root,
        destroy() {
            cancelled = true
            // Whatever the flow is parked on, let it go — an unsettled gate
            // holds every closure in this view alive.
            pendingGate?.settle(false)

            // The narrator holds page-global speech state — it must be torn
            // down explicitly or it keeps talking over the next view.
            narrator.destroy()
            progress.destroy()
            answer.destroy()
            pile?.destroy()
            grid?.destroy()
            root.remove()
        },
    }
}
