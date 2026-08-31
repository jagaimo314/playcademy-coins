import { svg } from '../lib/dom.js'
import './Grid.css'

/**
 * A plain SVG grid: intersecting lines for rows and columns, plus the maths for
 * turning a cell number into a position and back.
 *
 * The interesting part is `direction`. A hundred-chart is read left-to-right
 * then top-to-bottom, but a number line climbing a wall is read bottom-to-top,
 * and both shapes show up in K-2 material. Rather than hard-code one reading
 * order, every cell <-> row/col conversion goes through it.
 *
 * Presentational only. It owns no state beyond its geometry; subclasses draw
 * into `backgroundLayer` (under the lines) and `contentLayer` (over them).
 */

/** Without this the boundary stroke clips against the viewBox edge. */
const PAD = 2

const HORIZONTAL = new Set(['right', 'left'])
const VERTICAL = new Set(['down', 'up'])

/** Tokens that count backwards along their own axis. */
const REVERSED = new Set(['left', 'up'])

export class Grid {
    constructor({
        numRows = 10,
        numCols = 10,
        cellSize = 40,
        /**
         * Two tokens: the axis cells are counted along first, then the axis the
         * count steps down. `"right down"` is a hundred-chart; `"down right"`
         * numbers the first column top-to-bottom before moving right.
         */
        direction = 'right down',
        /** Draw a border around the outer bounds of the grid. */
        isBounded = true,
    } = {}) {
        assertPositiveInt(numRows, 'numRows')
        assertPositiveInt(numCols, 'numCols')
        if (!(cellSize > 0)) throw new RangeError(`cellSize must be > 0, got ${cellSize}`)

        this.numRows = numRows
        this.numCols = numCols
        this.cellSize = cellSize
        this.isBounded = isBounded

        // { major, minor }, each `{ axis: 'row' | 'col', token }`.
        this.direction = parseDirection(direction)

        this.#render()
    }

    /* --------------------------------------------------------------- geometry */

    /** Total cells in the grid. */
    get cellCount() {
        return this.numRows * this.numCols
    }

    /** Width of the drawn grid, excluding padding. */
    get width() {
        return this.numCols * this.cellSize
    }

    /** Height of the drawn grid, excluding padding. */
    get height() {
        return this.numRows * this.cellSize
    }

    /**
     * Cell number (1-based) at a zero-based row/column. Accepts either two
     * arguments or a single `{ row, col }`.
     *
     *   calcCellByRowCol(0, 0)               // "right down" -> 1
     *   calcCellByRowCol({ row: 1, col: 0 }) // "right down" -> 11
     */
    calcCellByRowCol(row, col) {
        if (row !== null && typeof row === 'object') ({ row, col } = row)

        this.#assertInBounds(row, col)

        const { major, minor } = this.direction
        const majorIndex = this.#indexAlong(major, row, col)
        const minorIndex = this.#indexAlong(minor, row, col)

        return minorIndex * this.#countAlong(major) + majorIndex + 1
    }

    /**
     * Zero-based `{ row, col }` of a 1-based cell number.
     * The inverse of `calcCellByRowCol`.
     */
    calcRowColByCell(cell) {
        this.#assertCell(cell)

        const { major, minor } = this.direction
        const majorCount = this.#countAlong(major)
        const index = cell - 1

        // Position along each axis, flipped back into row/col space.
        const along = {
            [major.axis]: flip(major.token, index % majorCount, majorCount),
            [minor.axis]: flip(minor.token, Math.floor(index / majorCount), this.#countAlong(minor)),
        }

        return { row: along.row, col: along.col }
    }

    /**
     * Centre of a cell, in the grid's own coordinates — which is also the
     * coordinate space of `backgroundLayer` and `contentLayer`, so anything
     * drawn there can use these numbers directly.
     */
    calcCellCenter(cell) {
        const { row, col } = this.calcRowColByCell(cell)

        return {
            x: col * this.cellSize + this.cellSize / 2,
            y: row * this.cellSize + this.cellSize / 2,
        }
    }

    /* ----------------------------------------------------------------- render */

    /**
     * The SVG's accessible name. Subclasses add their own detail — which is why
     * `#render()` does not call this: it runs before a subclass has its fields.
     */
    describe() {
        return `${this.numRows} by ${this.numCols} grid`
    }

    /** Re-read `describe()` onto the root. Called at the end of every draw. */
    applyLabel() {
        this.el.setAttribute('aria-label', this.describe())
    }

    mount(parent) {
        parent.appendChild(this.el)
        return this
    }

    destroy() {
        this.el.remove()
    }

    #render() {
        const { cellSize, width, height } = this

        const lines = []

        for (let col = 1; col < this.numCols; col++) {
            const x = col * cellSize
            lines.push(svg('line', { class: 'pc-grid__line', x1: x, y1: 0, x2: x, y2: height }))
        }

        for (let row = 1; row < this.numRows; row++) {
            const y = row * cellSize
            lines.push(svg('line', { class: 'pc-grid__line', x1: 0, y1: y, x2: width, y2: y }))
        }

        this.backgroundLayer = svg('g', { class: 'pc-grid__background' })
        this.linesLayer = svg('g', { class: 'pc-grid__lines' }, lines)
        this.contentLayer = svg('g', { class: 'pc-grid__content' })

        this.border = this.isBounded
            ? svg('rect', { class: 'pc-grid__border', x: 0, y: 0, width, height })
            : null

        this.el = svg('svg', {
            class: 'pc-grid',
            viewBox: `0 0 ${width + PAD * 2} ${height + PAD * 2}`,
            width: width + PAD * 2,
            height: height + PAD * 2,
            role: 'img',
            // Base wording only; every draw refreshes it through `applyLabel()`.
            'aria-label': `${this.numRows} by ${this.numCols} grid`,
            style: { '--pc-grid-cell': `${cellSize}px` },
        }, svg('g', { transform: `translate(${PAD} ${PAD})` }, [
            this.backgroundLayer,
            this.linesLayer,
            this.contentLayer,
            this.border,
        ]))
    }

    /* ---------------------------------------------------------------- private */

    #countAlong({ axis }) {
        return axis === 'col' ? this.numCols : this.numRows
    }

    #indexAlong(part, row, col) {
        const value = part.axis === 'col' ? col : row
        return flip(part.token, value, this.#countAlong(part))
    }

    #assertInBounds(row, col) {
        if (!Number.isInteger(row) || row < 0 || row >= this.numRows) {
            throw new RangeError(`row out of bounds: ${row}`)
        }
        if (!Number.isInteger(col) || col < 0 || col >= this.numCols) {
            throw new RangeError(`col out of bounds: ${col}`)
        }
    }

    #assertCell(cell) {
        if (!Number.isInteger(cell) || cell < 1 || cell > this.cellCount) {
            throw new RangeError(`cell out of bounds: ${cell}`)
        }
    }
}

/** `"right down"` -> `{ major: { axis: 'col', token }, minor: { axis: 'row', token } }`. */
function parseDirection(direction) {
    const tokens = String(direction).trim().toLowerCase().split(/\s+/)

    if (tokens.length === 2) {
        const [first, second] = tokens

        if (HORIZONTAL.has(first) && VERTICAL.has(second)) {
            return { major: { axis: 'col', token: first }, minor: { axis: 'row', token: second } }
        }

        if (VERTICAL.has(first) && HORIZONTAL.has(second)) {
            return { major: { axis: 'row', token: first }, minor: { axis: 'col', token: second } }
        }
    }

    throw new Error(
        `Invalid direction: "${direction}". Expected one horizontal and one `
        + 'vertical token, e.g. "right down" or "up right".',
    )
}

/** Reverse an index along its axis when that axis counts backwards. Self-inverse. */
function flip(token, value, count) {
    return REVERSED.has(token) ? count - 1 - value : value
}

function assertPositiveInt(value, name) {
    if (!Number.isInteger(value) || value < 1) {
        throw new RangeError(`${name} must be a positive integer, got ${value}`)
    }
}
