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
 * The screen is one frame, laid out once against 1280x692 design pixels and
 * then scaled to fit the display — a hundred-chart whose cells drift with
 * the viewport is no use for pointing at, and a layout that rearranges itself
 * per size is a different lesson at every size. Everything inside is positioned
 * against that box: chrome in a bar along the top, the narrator below it on the
 * left, the chart hanging off the right edge, and the pile, the question and
 * the answer in the space between them.
 *
 * The height is what the design turns on. Read the constants below downwards
 * and they add up to it: bar, gap, chart, dead space.
 *
 * Three modes run in order, and each hands over only when the student has an
 * answer marked right:
 *
 *   instruction — the lesson demonstrates. It narrates, boxes the pile, turns
 *                 the coins over, counts them, walks the chart calling out the
 *                 running total a coin at a time, and fills the answer in. The
 *                 student presses Check Answer.
 *   guided      — the same shape with the doing handed over. Each beat waits
 *                 for the taps it asked for before the next line is spoken.
 *   freeplay    — ten piles, one at a time, no scaffolding.
 *
 * Answering is two beats throughout, not one. The typed number goes onto the
 * chart first as an outline star — the student's claim, staked before it is
 * judged — and only then does the count run.
 */

/** Design width. Every number in this file and in `lesson.css` is one of these. */
const DESIGN_WIDTH = 1280

/**
 * The chrome bar across the top, and the dark blue it leaves round the rest.
 * The border is a hairline: the frame is meant to read as an edge rather than
 * as a mount, and the toolbar above it already carries the same colour.
 */
const TOOLBAR_HEIGHT = 20
const BORDER = 1

/** Where the white panel starts: one border below the bar. */
const PANEL_TOP = TOOLBAR_HEIGHT + BORDER

/** The chart, and the size of one cell. */
const GRID_ROWS = 10
const GRID_COLS = 10
const GRID_CELL = 64

/**
 * Gap between the chart's cells and the frame on the three sides it touches —
 * above, right, below. Measured to the *cells*, not to the chart's box: the SVG
 * pads itself by a couple of pixels so its border stroke is not clipped, and
 * `loadProblem()` takes that padding back off both offsets, so the gap is the
 * same 15 on every side rather than 15 down one and 17 across another.
 */
const GRID_INSET = 15

/**
 * Where the lesson proper starts: the chart's own inset below the panel's top
 * edge. The narrator's band and the chart's first row of cells both begin on
 * this line — the student's eye moves between a line being spoken and the cell
 * it is about, so the two start level.
 */
const CONTENT_TOP = PANEL_TOP + GRID_INSET

/**
 * The design height, derived rather than typed so the arithmetic cannot drift:
 * 20 of bar, 1 of border, 15 of inset, 640 of chart, 15 of inset, 1 of border —
 * 692. The chart is what the height is for, so everything round it is what
 * gives way when they disagree; 1280 x 692 is a little wider than 16:9 as a
 * result, and the way back to 16:9 is a taller bar rather than a bigger cell.
 */
const DESIGN_HEIGHT = CONTENT_TOP + GRID_ROWS * GRID_CELL + GRID_INSET + BORDER

/**
 * A quarter's diameter, which is the chart's cell size on purpose: a coin
 * landing on the chart is then the size of the coin it came from in the pile.
 * Smaller coins keep their real proportions against it — the ratios in
 * `coin.css` scale off this value, so a dime never grows to a quarter's width.
 */
const COIN_SIZE = GRID_CELL

/** Where the pile starts, from the design box's top. The narrator has the rest. */
const PILE_TOP = 200

/** Coins per row in the pile, and the gap between them. */
const PILE_COLUMNS = 5
const PILE_GAP = 15

/**
 * Never draw the frame shorter than this many real pixels. Scaling below it
 * makes a lesson nobody can read, so the scale stops here and the stage clips
 * and scrolls instead.
 */
const MIN_FRAME_HEIGHT = 400
const MIN_SCALE = MIN_FRAME_HEIGHT / DESIGN_HEIGHT

/**
 * Milliseconds between each coin landing on the chart. This is the replay that
 * runs when an answer is checked — a confirmation, not a lesson, so it moves at
 * a pace that does not make the student sit through the count again.
 */
const SKIP_DELAY = 550

/**
 * How long each coin holds the chart while the lesson calls out the running
 * total: "5", "10", "15". Slower than `SKIP_DELAY` because the student is
 * meant to say the numbers along with it, and a count that outruns the voice
 * teaches the rhythm of nothing.
 *
 * A floor rather than a cadence — see `countOnChartForThem()`. Note it is paid
 * per coin, so a pile much bigger than the instruction problem's three would
 * make this beat long enough to need rethinking rather than retiming.
 */
const SKIP_CALLOUT_MS = 1500

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

    /**
     * The last answer gate's promise, kept so a beat can wait on a gate an
     * *earlier* beat opened. Guided needs that: the line that asks the student
     * to type has to be the line that opens the field, and the reminder to
     * press Check Answer comes after it and is spoken over the typing.
     */
    let armedAnswer = null

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
            numRows: GRID_ROWS,
            numCols: GRID_COLS,
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

        // The chart is placed by its cells, not by its box. The SVG carries a
        // little padding so its border stroke is not clipped, and the design
        // measures GRID_INSET to the *cells* — so the padding comes off both
        // offsets rather than pushing the chart down and left by it.
        const pad = (Number(grid.el.getAttribute('height')) - grid.height) / 2
        frame.style.setProperty('--pc-lesson-chart-top', `${CONTENT_TOP - pad}px`)
        frame.style.setProperty('--pc-lesson-chart-right', `${GRID_INSET - pad}px`)

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
        armedAnswer = gate.done

        return armedAnswer
    }

    /**
     * Say a line, run whatever the beat does, and move on only when both have
     * finished. They run together on purpose: the animation is what the
     * sentence is describing.
     */
    async function playBeat(beat, moves) {
        const line = beat.say?.(problem)

        // A beat with no line of its own narrates from inside its move, a line
        // per step rather than one sentence over the whole run. There is no
        // sentence to pace against and no caption to hold, so the move is the
        // only thing to wait for.
        if (!line) {
            await moves[beat.id]?.()

            return !cancelled
        }

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

    /**
     * Walk the chart a coin at a time, calling out the running total as each
     * one lands: "5", "10", "15".
     *
     * Driven a step at a time through `revealNext()` rather than played by
     * `animateSkipCount()`, so the coin landing and the number said over it are
     * one statement and cannot drift apart — and so the pause between them is
     * this view's constant rather than a coincidence between a grid timer and a
     * narration timer.
     *
     * The pause is a **floor**: `Promise.all` waits for the slower of the voice
     * and the delay, so a voice that takes longer than `SKIP_CALLOUT_MS` pushes
     * the next coin out instead of being cut off mid-word by it. Every `say()`
     * cancels the utterance before it, which is what that would otherwise do.
     */
    async function countOnChartForThem() {
        grid.resetSkipCount()

        // Wipe the ordinals off the pile: the same coins are about to be walked
        // a second time, and what they carried the first time round is not what
        // they stand for now.
        pile.reset()

        // The running total is read off the chart, not printed on the coin. Two
        // numbers on one coin — the ordinal it just had and the total it now
        // stands for — is the exact confusion skip-counting is meant to clear
        // up, so the coin only says "counted".
        onGridReveal = ({ cell, index }) => {
            grid.highlightCell(cell)
            pile.markCoin(index, { selected: true })
        }

        try {
            for (;;) {
                // On a currency grid the cell *is* the running total in cents,
                // so the number to say comes off the reveal itself rather than
                // out of a second list that could fall out of step with it.
                const cell = grid.revealNext()

                // Out of chart: a pile with more coins than the chart has room
                // for has nothing left to land on and no number to say over it.
                if (cell === null) return

                await Promise.all([
                    Promise.race([narrator.say(String(cell)), delay(SPEECH_CAP_MS)]),
                    delay(SKIP_CALLOUT_MS),
                ])

                if (cancelled) return
            }
        } finally {
            // In a `finally` because the loop has three ways out. Left set, the
            // hook would still be marking pile coins when `check()` replays the
            // same count against a pile that has moved on.
            onGridReveal = null
        }
    }

    const INSTRUCTION_MOVES = {
        identify: async () => {
            await pile.revealBox()
            if (cancelled) return
            await pile.peekAll('Generic')
        },

        'count-coins': () => countPileForThem(),

        'skip-count-callout': () => countOnChartForThem(),

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

        // Nothing to tap here. Skip counting the chart is the skill being
        // practised, so the student does it by eye and by finger and types
        // where they landed — landing the coins for them, a tap at a time,
        // would be doing the counting on their behalf.
        'skip-count': () => {
            onCoinTap = null

            // The ordinals from the beat before are not what these coins stand
            // for now, and a pile still labelled 1 to 4 invites the answer 4.
            pile.reset()

            answer.update({ disabled: false })
            answer.focus()

            // Armed here rather than returned: this is the beat that opens the
            // field, so it is the beat that owns the gate, but the reminder on
            // the next line has to be spoken while the student is typing
            // rather than after they have finished. The beat below waits.
            awaitCorrectAnswer()
        },

        // Already answered by the time this line lands? Then the gate has been
        // settled and the reminder simply reads out and the phase ends.
        answer: () => armedAnswer ?? awaitCorrectAnswer(),
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

    /*
     * Everything that is not the lesson, in one 20px bar along the top: the way
     * back out, the unlock the Bakery gate needs before anyone has sat through
     * all ten puzzles, which mode is running and how far through the puzzles
     * the student is. Above the lesson rather than below it, so the white panel
     * underneath holds nothing but the work.
     */
    const toolbar = el('div', { class: 'pc-lesson__toolbar' }, [
        el('div', { class: 'pc-lesson__toolbar-group' }, [
            el('button', {
                type: 'button',
                class: 'pc-button pc-button--quiet',
                onClick: () => navigate('/'),
            }, 'Back to menu'),
            el('button', {
                type: 'button',
                class: 'pc-button pc-button--quiet',
                onClick: () => {
                    store.set('lesson.completed', true)
                    navigate('/')
                },
            }, 'Dev: mark lesson complete'),
        ]),
        el('div', { class: 'pc-lesson__toolbar-group' }, [modeLabel, progress.el]),
    ])

    const frame = el('div', {
        class: 'pc-lesson__frame',
        dataset: { mode: 'instruction' },
    }, [
        // First, so it is painted behind: the white ground, inset far enough on
        // every side to leave the toolbar's dark blue showing as a border.
        el('div', { class: 'pc-lesson__panel' }),

        toolbar,
        el('div', { class: 'pc-lesson__narration' }, narrator.el),
        el('div', { class: 'pc-lesson__work' }, [pileHolder, answer.el]),
        chartHolder,

        startCard,
    ])

    /*
     * The frame is scaled with a transform, which takes up no layout at all, so
     * the box that centring and scrolling can see has to be this one — sized to
     * what the frame comes out as once scaled.
     */
    const fitBox = el('div', { class: 'pc-lesson__fit' }, frame)

    // Fixed rather than in the document flow: the frame is a fixed size by
    // design, so it is centred against the viewport, not against #app's column.
    const root = el('section', {
        class: 'pc-lesson-stage',
        style: {
            '--pc-lesson-width': `${DESIGN_WIDTH}px`,
            '--pc-lesson-height': `${DESIGN_HEIGHT}px`,
            '--pc-lesson-toolbar-height': `${TOOLBAR_HEIGHT}px`,
            '--pc-lesson-border': `${BORDER}px`,
            '--pc-lesson-panel-top': `${PANEL_TOP}px`,
            '--pc-lesson-content-top': `${CONTENT_TOP}px`,
            '--pc-lesson-pile-top': `${PILE_TOP}px`,
            '--pc-coin-size': `${COIN_SIZE}px`,
        },
    }, fitBox)

    /**
     * Fit the design box to the display, and keep fitting it.
     *
     * Height leads: the design is a stack of heights that has to add up, so how
     * much height there is decides how big a design pixel gets to be. Width
     * still holds a veto, because a frame wider than the window puts the chart
     * off the side of it. The floor beats both — below `MIN_FRAME_HEIGHT` the
     * lesson stops shrinking and the stage clips and scrolls instead.
     */
    let scale = 0

    function fit() {
        const { clientWidth, clientHeight } = root

        // Not laid out yet; the observer will call again when it is.
        if (!clientWidth || !clientHeight) return

        const next = Math.max(
            MIN_SCALE,
            Math.min(clientHeight / DESIGN_HEIGHT, clientWidth / DESIGN_WIDTH),
        )

        // A scrollbar arriving or leaving changes the box that chose the scale,
        // which can otherwise chase itself round the observer a frame at a
        // time. Ignoring changes too small to see is what settles it.
        if (Math.abs(next - scale) < 0.002) return

        scale = next
        root.style.setProperty('--pc-lesson-scale', String(scale))
    }

    const resizes = new ResizeObserver(fit)
    resizes.observe(root)

    loadProblem(INSTRUCTION_PROBLEM)

    return {
        el: root,
        destroy() {
            cancelled = true
            resizes.disconnect()
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
