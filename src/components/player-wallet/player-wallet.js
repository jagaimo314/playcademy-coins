import { clear, el } from '../../lib/dom.js'
import { COINS, coinsToTally, describeCount } from '../../lib/money.js'
import { createCoin } from '../coin/coin.js'
import './player-wallet.css'

/**
 * The four panel colours the server hands out. `room/joined` carries a
 * `colorSlot` of exactly these, assigned so two kids in a room never share one —
 * see docs/bakery-backend-plan.md.
 *
 * **The order is load-bearing, not cosmetic.** The server assigns by index, so
 * this list and `PLAYER_COLORS` in `server/src/game/config.js` have to agree or
 * the first player to join is red on one side and blue on the other.
 *
 * "yellow" is drawn in the palette's gold. There is no separate yellow token,
 * and gold is the warm slot the brief's own page uses.
 */
export const PLAYER_COLORS = Object.freeze(['red', 'blue', 'green', 'yellow'])

/**
 * Chrome, in pixels. JS owns these rather than the stylesheet because the coin
 * fit below has to subtract them from the configured box, and a number that
 * lived only in CSS would drift out from under that maths. They are published
 * back out as custom properties, the way `Grid` publishes its cell size.
 */
const TAB_HEIGHT = 26
const PADDING = 10

/**
 * Coins never grow past this, however much room a small hand is given. 80px is
 * the `--pc-coin-size` default of 5rem: without a ceiling a hand of two would
 * draw itself in dinner plates while the player beside it counted buttons, and
 * comparing the two panels is half of what the kids are doing.
 */
const MAX_COIN_SIZE = 80

/**
 * Each coin's diameter against a quarter's — the same numbers `coin.css` sets as
 * `--pc-coin-ratio`, restated here because the fit has to measure a hand before
 * any of it is in a document to measure. **The two lists must agree; move one
 * and move the other.**
 */
const COIN_RATIOS = Object.freeze({
    penny: 0.78,
    nickel: 0.87,
    dime: 0.73,
    quarter: 1,
})

/**
 * One player's hand: a colour-coded rounded rect with their name on a tab at the
 * top left, holding the coins they have to sum.
 *
 * The box is a fixed `width` x `height`, because the Bakery's base band splits
 * into up to four equal slices and a slice does not move when a hand changes
 * size. So the coins are what gives: they are scaled *together* to the largest
 * size that still fits, which keeps every one of them at its true diameter
 * against a quarter. A hand of two pennies and a nickel still reads as two small
 * discs and one big one. That relative sizing is the point of the panel — it is
 * one of the few cues a child has for telling coins apart before they can name
 * them, and a layout that stretched coins to fill a box would destroy it.
 *
 * Coins rest on `Heads`. The Generic face prints the value on the disc, which
 * would hand the kid the answer to the sum they are here to do.
 *
 * Presentational: it holds nothing but the hand it was given, and the value of
 * that hand is deliberately never shown, summed, or put in the accessible name.
 */
export function createPlayerWallet({
    name,
    /** One of `PLAYER_COLORS` — the server's `colorSlot`. */
    color,
    /** The hand, as coin ids. Drawn in the order given. */
    coins = [],
    width = 280,
    height = 150,
    /** Thickness of the colour-coded border, in pixels. */
    borderWidth = 6,
    /** Gap between coins, in pixels. */
    gap = 6,
    /** The face the hand rests on. Leave it be unless you mean to reveal values. */
    displayType = 'Heads',
}) {
    if (!PLAYER_COLORS.includes(color)) {
        throw new Error(`Unknown player wallet color: ${color}`)
    }

    let hand = [...coins]
    let instances = []
    let coinSize = 0

    const nameEl = el('span', { class: 'pc-wallet__name' }, name)
    const rows = el('div', { class: 'pc-wallet__coins' })

    const root = el('div', {
        // A group rather than an image: every coin names itself, so a child on a
        // screen reader can walk the hand coin by coin, which is the same
        // counting the sighted child does by eye.
        role: 'group',
        class: ['pc-wallet', `pc-wallet--${color}`],
    }, [
        el('div', { class: 'pc-wallet__tab' }, nameEl),
        rows,
    ])

    /** Publish the configured box to CSS. Custom properties need setProperty. */
    function applyGeometry() {
        const properties = {
            '--pc-wallet-width': `${width}px`,
            '--pc-wallet-height': `${height}px`,
            '--pc-wallet-border': `${borderWidth}px`,
            '--pc-wallet-tab-height': `${TAB_HEIGHT}px`,
            '--pc-wallet-padding': `${PADDING}px`,
            '--pc-wallet-gap': `${gap}px`,
        }

        for (const [property, value] of Object.entries(properties)) {
            root.style.setProperty(property, value)
        }
    }

    /** What is left for coins once border, padding and the name tab are taken out. */
    function innerBox() {
        return {
            width: width - 2 * (borderWidth + PADDING),
            height: height - 2 * (borderWidth + PADDING) - TAB_HEIGHT,
        }
    }

    function draw() {
        for (const instance of instances) instance.destroy()
        clear(rows)

        const ratios = hand.map(id => ratioOf(id))
        const box = innerBox()

        coinSize = fitCoinSize(ratios, { ...box, gap, max: MAX_COIN_SIZE })
        rows.style.setProperty('--pc-coin-size', `${coinSize}px`)

        instances = hand.map(id => createCoin({ denomination: id, displayType }))

        for (const row of packRows(ratios, coinSize, box.width, gap)) {
            rows.append(el('div', { class: 'pc-wallet__row' },
                row.indices.map(index => instances[index].el)))
        }

        root.setAttribute('aria-label', describeHand(name, color, hand))
    }

    applyGeometry()
    draw()

    return {
        el: root,
        color,
        get name() { return name },
        get coins() { return [...hand] },
        /** The fitted quarter diameter, in pixels. Every coin is a fraction of it. */
        get coinSize() { return coinSize },

        /**
         * `coins` swaps the hand — the Bakery deals a fresh one on every correct
         * grab — and re-fits it. `width` / `height` re-fit without touching the
         * hand. Every key rebuilds the coins, so this is a per-event call, not a
         * per-frame one.
         */
        update(next = {}) {
            if (next.name !== undefined) {
                name = next.name
                nameEl.textContent = name
            }

            if (next.width !== undefined) width = next.width
            if (next.height !== undefined) height = next.height
            if (next.borderWidth !== undefined) borderWidth = next.borderWidth
            if (next.gap !== undefined) gap = next.gap
            if (next.displayType !== undefined) displayType = next.displayType
            if (next.coins !== undefined) hand = [...next.coins]

            applyGeometry()
            draw()
        },

        destroy() {
            for (const instance of instances) instance.destroy()
            instances = []
            root.remove()
        },
    }
}

/** Throws on an unknown id here, where the message says wallet, not three frames deep. */
function ratioOf(id) {
    const ratio = COIN_RATIOS[id]
    if (ratio === undefined) throw new Error(`Unknown coin id in wallet hand: ${id}`)
    return ratio
}

/**
 * Lay coins out left to right, wrapping when the next one would not fit.
 *
 * Greedy, which is what a flex row does anyway — but done here, in numbers, so
 * that the rows rendered are the exact rows the fit was checked against, rather
 * than wherever the browser decided to break. Sub-pixel widths and a promise of
 * a fixed box do not survive guessing.
 */
function packRows(ratios, size, width, gap) {
    const rows = []
    let row = null

    for (const [index, ratio] of ratios.entries()) {
        const coinWidth = size * ratio

        if (row && row.width + gap + coinWidth <= width) {
            row.width += gap + coinWidth
            row.tallest = Math.max(row.tallest, ratio)
            row.indices.push(index)
        } else {
            row = { width: coinWidth, tallest: ratio, indices: [index] }
            rows.push(row)
        }
    }

    return rows
}

/** Whether a packing stays inside the box. A row is as tall as its biggest coin. */
function fitsBox(rows, size, { width, height }, gap) {
    if (!rows.length) return true

    let total = gap * (rows.length - 1)

    for (const row of rows) {
        // A coin too wide for the box wraps onto a row of its own and still
        // overflows, so width is checked per row rather than only at the wrap.
        if (row.width > width) return false
        total += size * row.tallest
    }

    return total <= height
}

/**
 * The largest quarter diameter at which the whole hand still fits the box.
 *
 * Bisection rather than algebra: the row count steps as the coins scale, so
 * there is no closed form — but "fits" only ever crosses from true to false as
 * the size grows, which is all bisection needs. Twenty halvings land an 80px
 * range inside a ten-thousandth of a pixel, far finer than anything that
 * reaches a screen.
 */
function fitCoinSize(ratios, { width, height, gap, max }) {
    if (!ratios.length || width <= 0 || height <= 0) return 0

    const box = { width, height }
    if (fitsBox(packRows(ratios, max, width, gap), max, box, gap)) return max

    let small = 0
    let large = max

    for (let i = 0; i < 20; i += 1) {
        const mid = (small + large) / 2
        if (fitsBox(packRows(ratios, mid, width, gap), mid, box, gap)) small = mid
        else large = mid
    }

    return small
}

/**
 * "Hank, red player. Hand: 10 nickels."
 *
 * The colour goes in the name because it is how the game refers to a player out
 * loud, and a panel identified only by the colour of its border is identified by
 * nothing at all to a child who cannot see it.
 *
 * Denominations are listed largest first whatever order the hand is drawn in —
 * that is the order a child is taught to count in. The total is not given; it is
 * the question.
 */
function describeHand(name, color, hand) {
    const who = `${name}, ${color} player.`

    if (!hand.length) return `${who} Hand: empty.`

    const tally = coinsToTally(hand)
    const parts = [...COINS]
        .sort((a, b) => b.value - a.value)
        .filter(({ id }) => tally[id])
        .map(({ id }) => describeCount(tally[id], id))

    return `${who} Hand: ${parts.join(', ')}.`
}
