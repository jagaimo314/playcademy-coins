import { append, clear, svg } from '../lib/dom.js'
import { starPoints } from '../lib/geometry.js'
import { Grid } from './Grid.js'
import './SkipCountGrid.css'

/** The three states an answer star can be in. */
const ANSWER_STATUSES = Object.freeze(['pending', 'correct', 'wrong'])

/** How the answer star reads out loud, so its colour is never the only cue. */
const ANSWER_WORDS = Object.freeze({
    pending: 'not checked yet',
    correct: 'correct',
    wrong: 'wrong',
})

/**
 * A grid that knows how to be counted: every cell carries a label, and a circle
 * indicator sits on every `skipInterval`-th cell — the 5, 10, 15, 20 a student
 * says out loud. The indicators start hidden so `animateSkipCount()` can walk
 * them one at a time, which is the whole point of the component: the kid sees
 * the rhythm of the count, not just the answer.
 *
 * It also holds the student's answer: `markAnswer()` puts a star on the cell
 * they typed, and `setAnswerStatus()` turns it green or red once the count has
 * run. The star is deliberately separate from the count, so replaying the count
 * leaves the answer sitting where it was put.
 *
 * Two hooks exist for subclasses, and both are called during `draw()`:
 *   - `formatCellLabel(cell)`          — what a cell reads
 *   - `createSkipIndicator(cell, i)`   — what appears at each interval
 */
export class SkipCountGrid extends Grid {
    /** cell -> the <g> whose `is-revealed` class drives the reveal. */
    #marks = new Map()
    /** cell -> highlight rect, created on first highlight. */
    #fills = new Map()

    /** The answer star: the <g> carrying its status class, or null. */
    #answer = null
    #answerCell = null
    #answerStatus = null

    #timer = null
    #settle = null

    constructor({
        /** Steps between each count. 5 nickels, 10 dimes, 25 quarters. */
        skipInterval = 5,
        /** Cap on how many indicators are placed. `null` fills the grid. */
        maxMarks = null,
        showLabels = true,
        /** Called after each reveal with `{ cell, index, count }`. */
        onReveal = null,
        ...gridOptions
    } = {}) {
        super(gridOptions)

        if (!Number.isInteger(skipInterval) || skipInterval < 1) {
            throw new RangeError(`skipInterval must be a positive integer, got ${skipInterval}`)
        }

        this.skipInterval = skipInterval
        this.maxMarks = maxMarks
        this.showLabels = showLabels
        this.onReveal = onReveal

        // Drawing reads overridable hooks, so it has to wait until the most
        // derived constructor has set its own fields. Every subclass ends its
        // constructor with the same guard.
        if (new.target === SkipCountGrid) this.draw()
    }

    /** The cells an indicator lands on, in counting order. */
    get skipCells() {
        const cells = []

        for (let cell = this.skipInterval; cell <= this.cellCount; cell += this.skipInterval) {
            cells.push(cell)
        }

        return this.maxMarks === null ? cells : cells.slice(0, this.maxMarks)
    }

    /** How many indicators are currently showing. */
    get revealedCount() {
        let count = 0
        for (const mark of this.#marks.values()) {
            if (mark.classList.contains('is-revealed')) count += 1
        }
        return count
    }

    get isAnimating() {
        return this.#timer !== null
    }

    /** The cell the answer star sits on, or `null` when nothing is marked. */
    get answerCell() {
        return this.#answerCell
    }

    /** `'pending' | 'correct' | 'wrong'`, or `null` when nothing is marked. */
    get answerStatus() {
        return this.#answerStatus
    }

    /* ------------------------------------------------------------------- hooks */

    /** What a cell reads. */
    formatCellLabel(cell) {
        return String(cell)
    }

    /**
     * The mark shown at an interval. Returned nodes are positioned by the
     * caller, so draw around the origin.
     */
    createSkipIndicator() {
        return svg('circle', { class: 'pc-skipgrid__circle', cx: 0, cy: 0, r: this.cellSize * 0.4 })
    }

    describe() {
        return [
            super.describe(),
            `counting by ${this.skipInterval}`,
            this.describeAnswer(),
        ].filter(Boolean).join(', ')
    }

    /**
     * The answer star in words, so a screen reader gets the verdict a sighted
     * student reads off its colour. Empty when nothing is marked.
     */
    describeAnswer() {
        if (this.#answerCell === null) return ''
        return `answer star on ${this.formatCellLabel(this.#answerCell)}, ${ANSWER_WORDS[this.#answerStatus]}`
    }

    /* -------------------------------------------------------------------- draw */

    /** Build labels and indicators. Safe to call again after changing options. */
    draw() {
        this.resetSkipCount()

        clear(this.backgroundLayer)
        clear(this.contentLayer)
        this.#marks.clear()
        this.#fills.clear()

        // The star goes out with the layer it lived in.
        this.#answer = null
        this.#answerCell = null
        this.#answerStatus = null

        // Indicators sit under the labels so a number stays readable on top of
        // whatever the subclass draws. The answer star sits between the two:
        // over the coin it lands on, still under the running total.
        this.indicatorLayer = svg('g', { class: 'pc-skipgrid__indicators' })
        this.answerLayer = svg('g', { class: 'pc-skipgrid__answers' })
        this.labelLayer = svg('g', { class: 'pc-skipgrid__labels' })
        append(this.contentLayer, [this.indicatorLayer, this.answerLayer, this.labelLayer])

        if (this.showLabels) {
            for (let cell = 1; cell <= this.cellCount; cell += 1) {
                const { x, y } = this.calcCellCenter(cell)

                append(this.labelLayer, svg('text', {
                    class: 'pc-skipgrid__label',
                    x,
                    y,
                    'text-anchor': 'middle',
                    'dominant-baseline': 'central',
                }, this.formatCellLabel(cell)))
            }
        }

        this.skipCells.forEach((cell, index) => {
            const { x, y } = this.calcCellCenter(cell)

            // Outer group positions, inner group animates — a CSS transform on
            // the outer group would overwrite its translate attribute.
            const mark = svg('g', { class: 'pc-skipgrid__mark', 'data-cell': cell })
            append(mark, this.createSkipIndicator(cell, index))
            append(this.indicatorLayer, svg('g', { transform: `translate(${x} ${y})` }, mark))

            this.#marks.set(cell, mark)
        })

        this.applyLabel()

        return this
    }

    /* --------------------------------------------------------------- counting */

    /**
     * Reveal each indicator in turn, `skipDelay` milliseconds apart. The first
     * appears immediately so the tap feels answered; `skipDelay === 0` reveals
     * every indicator at once.
     *
     * Resolves `true` when the count finishes, or `false` if it was reset or
     * restarted partway through.
     */
    animateSkipCount(skipDelay = 500) {
        this.resetSkipCount()

        const cells = [...this.#marks.keys()]
        if (cells.length === 0) return Promise.resolve(true)

        if (!skipDelay) {
            cells.forEach((cell, index) => this.#reveal(cell, index))
            return Promise.resolve(true)
        }

        return new Promise(resolve => {
            this.#settle = resolve
            let index = 0

            const step = () => {
                this.#reveal(cells[index], index)
                index += 1

                if (index >= cells.length) {
                    this.#timer = null
                    this.#settle = null
                    resolve(true)
                    return
                }

                this.#timer = setTimeout(step, skipDelay)
            }

            step()
        })
    }

    /**
     * Reveal the next hidden indicator, in counting order. This is the same
     * count as `animateSkipCount()`, driven a step at a time by the student
     * rather than played to them — one tap, one coin landing on the chart.
     *
     * Returns the cell revealed, or `null` once the count is complete.
     */
    revealNext() {
        const cells = [...this.#marks.keys()]
        const index = this.revealedCount

        if (index >= cells.length) return null

        this.#reveal(cells[index], index)

        return cells[index]
    }

    /** Hide every indicator again and stop any count in progress. */
    resetSkipCount() {
        this.#cancel()

        for (const mark of this.#marks.values()) {
            mark.classList.remove('is-revealed')
        }

        return this
    }

    /* ----------------------------------------------------------------- answers */

    /**
     * Put the student's answer on the chart as a star outline on the cell they
     * typed, replacing any previous one. `status` starts at `'pending'` — the
     * answer is on the board but not yet judged — and `setAnswerStatus()` turns
     * it green or red once the count has run.
     *
     * Returns `false` for a cell off the end of the chart. There is nowhere to
     * draw such an answer, so the caller has to say something about it instead.
     */
    markAnswer(cell, status = 'pending') {
        this.clearAnswer()

        if (!Number.isInteger(cell) || cell < 1 || cell > this.cellCount) return false

        const { x, y } = this.calcCellCenter(cell)

        const star = svg('polygon', {
            class: 'pc-skipgrid__star',
            points: starPoints(this.cellSize * 0.46),
        })

        // Outer group positions, inner group pops in — same split as the marks.
        this.#answer = svg('g', { class: 'pc-skipgrid__answer', 'data-cell': cell },
            svg('g', { class: 'pc-skipgrid__star-pop' }, star))

        append(this.answerLayer, svg('g', { transform: `translate(${x} ${y})` }, this.#answer))
        this.#answerCell = cell

        this.setAnswerStatus(status)

        return true
    }

    /** Judge the star already on the chart, without moving it. */
    setAnswerStatus(status) {
        if (!ANSWER_STATUSES.includes(status)) {
            throw new Error(`Unknown answer status: ${status}`)
        }

        if (!this.#answer) return this

        this.#answerStatus = status

        for (const name of ANSWER_STATUSES) {
            this.#answer.classList.toggle(`is-${name}`, name === status)
        }

        this.applyLabel()

        return this
    }

    /** Take the answer star off the chart. */
    clearAnswer() {
        clear(this.answerLayer)

        this.#answer = null
        this.#answerCell = null
        this.#answerStatus = null

        this.applyLabel()

        return this
    }

    /* ------------------------------------------------------------ highlighting */

    /** Tint a cell. Used to point at the cell being counted or answered about. */
    highlightCell(cell, on = true) {
        const { row, col } = this.calcRowColByCell(cell)

        let fill = this.#fills.get(cell)

        if (!fill) {
            if (!on) return this

            fill = svg('rect', {
                class: 'pc-skipgrid__fill',
                x: col * this.cellSize,
                y: row * this.cellSize,
                width: this.cellSize,
                height: this.cellSize,
            })

            append(this.backgroundLayer, fill)
            this.#fills.set(cell, fill)
        }

        fill.classList.toggle('is-on', on)

        return this
    }

    clearHighlights() {
        for (const fill of this.#fills.values()) fill.classList.remove('is-on')
        return this
    }

    destroy() {
        this.#cancel()
        super.destroy()
    }

    /* ----------------------------------------------------------------- private */

    #reveal(cell, index) {
        this.#marks.get(cell)?.classList.add('is-revealed')
        this.onReveal?.({ cell, index, count: index + 1 })
    }

    #cancel() {
        if (this.#timer !== null) {
            clearTimeout(this.#timer)
            this.#timer = null
        }

        if (this.#settle) {
            const settle = this.#settle
            this.#settle = null
            settle(false)
        }
    }
}
