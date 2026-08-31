import { svg } from '../lib/dom.js'
import { coin, describeCount, formatCents } from '../lib/money.js'
import { createCoin } from './coin/coin.js'
import { SkipCountGrid } from './SkipCountGrid.js'
import './SkipCountCurrencyGrid.css'

/**
 * A skip-count grid in cents. Cells read `1¢ … 100¢`, and the indicator at each
 * interval is a ghosted coin of the denomination being counted.
 *
 * That pairing is the teaching point: the coin lands on 5¢, 10¢, 15¢, so the
 * kid sees a nickel *is* five steps of the chart rather than a symbol to
 * memorise. The interval is therefore the coin's face value — it is not a
 * separate knob, and any `skipInterval` passed in is ignored.
 */
export class SkipCountCurrencyGrid extends SkipCountGrid {
    /** Coin components built for the indicators, kept so they can be destroyed. */
    #coins = []

    constructor({
        /** Which coin is being counted: `'penny' | 'nickel' | 'dime' | 'quarter'`. */
        denomination = 'nickel',
        /** How many coins this grid counts. Indicators stop after this many. */
        numCoins = 5,
        ...gridOptions
    } = {}) {
        // Throws on an unknown denomination, before any drawing happens.
        const { value } = coin(denomination)

        if (!Number.isInteger(numCoins) || numCoins < 0) {
            throw new RangeError(`numCoins must be a non-negative integer, got ${numCoins}`)
        }

        super({ ...gridOptions, skipInterval: value, maxMarks: numCoins })

        this.denomination = denomination
        this.numCoins = numCoins

        if (new.target === SkipCountCurrencyGrid) this.draw()
    }

    /** Face value of the coin being counted, in cents. */
    get value() {
        return coin(this.denomination).value
    }

    /** What the full count comes to, in cents. */
    get total() {
        return this.value * this.numCoins
    }

    /** Running total after `n` coins, in cents. Handy for narration. */
    totalAfter(numRevealed) {
        return this.value * numRevealed
    }

    /* ------------------------------------------------------------------- hooks */

    formatCellLabel(cell) {
        return formatCents(cell)
    }

    /**
     * A ghosted instance of the real coin component, rather than a lookalike —
     * the coin a kid sees on the chart should be the coin they see in the pile.
     */
    createSkipIndicator() {
        const size = this.cellSize
        const instance = createCoin({ denomination: this.denomination })

        this.#coins.push(instance)

        return svg('foreignObject', {
            class: 'pc-currencygrid__ghost',
            x: -size / 2,
            y: -size / 2,
            width: size,
            height: size,
        }, instance.el)
    }

    describe() {
        const counted = describeCount(this.numCoins, this.denomination)
        return `${this.numRows} by ${this.numCols} grid, counting ${counted} by ${formatCents(this.value)}`
    }

    draw() {
        // The previous coins go out with the layer `super.draw()` clears.
        this.#coins = []
        return super.draw()
    }

    destroy() {
        for (const instance of this.#coins) instance.destroy()
        this.#coins = []
        super.destroy()
    }
}
