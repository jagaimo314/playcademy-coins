import { append, clear, svg } from '../lib/dom.js'
import { Grid } from './Grid.js'
import './SkipCountGrid.css'

/**
 * A grid that knows how to be counted: every cell carries a label, and a circle
 * indicator sits on every `skipInterval`-th cell — the 5, 10, 15, 20 a student
 * says out loud. The indicators start hidden so `animateSkipCount()` can walk
 * them one at a time, which is the whole point of the component: the kid sees
 * the rhythm of the count, not just the answer.
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
        return `${super.describe()}, counting by ${this.skipInterval}`
    }

    /* -------------------------------------------------------------------- draw */

    /** Build labels and indicators. Safe to call again after changing options. */
    draw() {
        this.resetSkipCount()

        clear(this.backgroundLayer)
        clear(this.contentLayer)
        this.#marks.clear()
        this.#fills.clear()

        // Indicators sit under the labels so a number stays readable on top of
        // whatever the subclass draws.
        this.indicatorLayer = svg('g', { class: 'pc-skipgrid__indicators' })
        this.labelLayer = svg('g', { class: 'pc-skipgrid__labels' })
        append(this.contentLayer, [this.indicatorLayer, this.labelLayer])

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

    /** Hide every indicator again and stop any count in progress. */
    resetSkipCount() {
        this.#cancel()

        for (const mark of this.#marks.values()) {
            mark.classList.remove('is-revealed')
        }

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
