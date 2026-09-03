import { svg } from '../../lib/dom.js'
import { goodArt } from '../../lib/goods.js'
import { formatCents } from '../../lib/money.js'
import './conveyor-item.css'

/**
 * Tray proportions, each a fraction of `trayWidth`, so one number scales the
 * whole tray in proportion — the same trick `--pc-coin-size` plays for coins.
 * The overall height is derived from these parts rather than pinned separately,
 * so it cannot drift out of step with them.
 *
 * The numbers are the mockup's, at its 100-unit tray. See docs/bake-sale-mockup.html.
 */
const FOOD_W = 0.84     /* the box a good is fitted into */
const FOOD_H = 0.72
const DECK_Y = 0.70     /* the board it stands on */
const DECK_H = 0.16
const CARD_Y = 0.78     /* the price card, overhanging the deck's front */
const CARD_H = 0.30
const CARD_W = 0.72

/**
 * A tray has two heights, because the price card overhangs its ride height.
 *
 * `RIDE` is what sits on the band: the deck's *underside* is the belt line, so
 * this is the number the belt measures its band from. A deck floating above the
 * band reads as a shelf, and a shelf does not move.
 *
 * `FULL` is everything the tray draws, card included — the tray's real bounds,
 * which is what the hit target covers and what the selection ring wraps.
 */
export const TRAY_RIDE_ASPECT = DECK_Y + DECK_H
export const TRAY_FULL_ASPECT = CARD_Y + CARD_H

/**
 * One tray on a conveyor belt: a baked good standing on a deck, with its price
 * on a card affixed to the front. The price is the whole exercise — a player
 * grabs the tray whose price equals the value of the coins in their hand — so it
 * is the one thing drawn to be legible from across a classroom.
 *
 * An SVG `<g>` drawn in its own coordinates with the origin at its top-left
 * corner, which is what lets `conveyor-belt` place it with a single translate.
 * It never positions itself.
 *
 * Presentational: it reports taps upward and owns no state beyond what it has
 * been told to draw. The server owns which tray exists and where.
 */
export function createConveyorItem({
    /** Price in whole cents. Everything in this app is cents; never a float. */
    price,
    /** Width in the belt's user units. Height follows from `TRAY_FULL_ASPECT`. */
    trayWidth = 120,
    /** Called with the price when the tray is activated. Omit for a display tray. */
    onClick = null,
    /**
     * Which pastry stands on the deck — a key from `lib/goods.js`. Omitted
     * leaves a bare deck, so a tray with no art still renders and still prices.
     * The price is what identifies a tray; the picture is dressing.
     */
    good = null,
    selected = false,
}) {
    assertPrice(price)
    if (!(trayWidth > 0)) throw new RangeError(`trayWidth must be > 0, got ${trayWidth}`)

    const interactive = typeof onClick === 'function'

    let currentPrice = price
    let currentGood = good
    let isSelected = selected

    const height = TRAY_FULL_ASPECT * trayWidth
    const deckY = DECK_Y * trayWidth
    const deckHeight = DECK_H * trayWidth
    const cardWidth = CARD_W * trayWidth
    const cardHeight = CARD_H * trayWidth
    const cardY = CARD_Y * trayWidth

    /*
     * `xMidYMax meet` is the SVG spelling of `object-fit: contain` plus
     * `object-position: bottom center`, and it is the whole reason a raster good
     * can be dropped into a drawn tray at all: the six cutouts differ in
     * proportion, and fitting them to a common box would stretch a macaron into
     * the shape of a pie.
     *
     * The node exists whether or not there is a good to draw — an `<image>` with
     * no `href` paints nothing — which keeps the child order fixed so `update()`
     * never has to re-stack the tray.
     */
    const foodImage = svg('image', {
        class: 'pc-tray__good',
        preserveAspectRatio: 'xMidYMax meet',
    })
    fitGood()

    const priceText = svg('text', {
        class: 'pc-tray__price',
        x: trayWidth / 2,
        y: cardY + cardHeight / 2,
        'text-anchor': 'middle',
        'dominant-baseline': 'central',
    }, formatCents(currentPrice))

    /*
     * Shown for selection *and* for keyboard focus, in different colours. SVG
     * elements take a `:focus-visible` outline unevenly across browsers, and a
     * focus indicator is not something to leave to chance.
     */
    const ring = svg('rect', {
        class: 'pc-tray__ring',
        x: -3,
        y: -3,
        width: trayWidth + 6,
        height: height + 6,
        rx: deckHeight,
    })

    /*
     * A tray is mostly empty space between the good, the deck and the card, and
     * an SVG group only catches pointer events where it is actually painted.
     * Without a transparent hit target, a tap that lands in a gap misses the
     * tray it is obviously aimed at — a real problem for a six-year-old on a
     * tablet.
     */
    const hit = interactive
        ? svg('rect', { class: 'pc-tray__hit', x: 0, y: 0, width: trayWidth, height })
        : null

    /*
     * Deck, then good, then card. The good's shadow has to fall on the deck, and
     * the card is affixed to the deck's front and so covers it.
     */
    const root = svg('g', {
        class: ['pc-tray', isSelected && 'is-selected'],
        style: { '--pc-tray-width': `${trayWidth}px` },
        // A tray that can be grabbed is a button and needs to be reachable by
        // keyboard; one that is only on show is a picture.
        role: interactive ? 'button' : 'img',
        tabindex: interactive ? 0 : null,
        'aria-label': describe(),
        'aria-pressed': interactive ? String(isSelected) : null,
        onClick: interactive ? () => onClick(currentPrice) : null,
        onKeydown: interactive ? handleKeydown : null,
    }, [
        hit,
        ring,
        svg('rect', {
            class: 'pc-tray__deck',
            x: 0,
            y: deckY,
            width: trayWidth,
            height: deckHeight,
            rx: deckHeight * 0.32,
        }),
        // The lit top of the deck, as a second flat band rather than a gradient.
        // Flat fills and hard edges are the art direction, not a shortcut.
        svg('rect', {
            class: 'pc-tray__deck-lit',
            x: 0,
            y: deckY,
            width: trayWidth,
            height: deckHeight * 0.4,
            rx: deckHeight * 0.32,
        }),
        foodImage,
        svg('rect', {
            class: 'pc-tray__card',
            x: (trayWidth - cardWidth) / 2,
            y: cardY,
            width: cardWidth,
            height: cardHeight,
            rx: cardHeight / 3,
        }),
        priceText,
    ])

    /**
     * Size and place the good's image box.
     *
     * `scale` shrinks the box **about its own bottom edge**, so a shrunk good
     * still stands on the deck rather than floating above it. Every good is
     * fitted to one box, which flatters the small ones; the correction is what
     * keeps a macaron from ending up the size of a slice of pie.
     */
    function fitGood() {
        if (currentGood === null) {
            foodImage.removeAttribute('href')
            return
        }

        const { url, scale } = goodArt(currentGood)
        const box = FOOD_H * trayWidth
        const width = FOOD_W * trayWidth * scale
        const drawn = box * scale

        // The plain `href`. Not `xlink:href` as well — it is deprecated, and
        // every browser this app targets reads the plain one.
        foodImage.setAttribute('href', url)
        foodImage.setAttribute('x', String((trayWidth - width) / 2))
        foodImage.setAttribute('y', String(box - drawn))
        foodImage.setAttribute('width', String(width))
        foodImage.setAttribute('height', String(drawn))
    }

    /** Selection is drawn in colour, so it has to be said in words as well. */
    function describe() {
        return `Tray, ${formatCents(currentPrice)}${isSelected ? ', chosen' : ''}`
    }

    function handleKeydown(event) {
        if (event.key !== 'Enter' && event.key !== ' ') return

        // Space scrolls the page otherwise, which on a belt is disorienting.
        event.preventDefault()
        onClick(currentPrice)
    }

    return {
        el: root,
        /** Bounds in the belt's user units — what the belt centres a tray by. */
        width: trayWidth,
        height,

        /**
         * Where the tray's underside is, which is *not* its full height: the
         * price card hangs below the deck. Anything standing a tray on a surface
         * measures by this, or the card ends up on the belt line and the deck
         * floats a third of a tray above it.
         */
        rideHeight: TRAY_RIDE_ASPECT * trayWidth,

        get price() {
            return currentPrice
        },

        get selected() {
            return isSelected
        },

        /**
         * Re-price, re-dress or re-mark the tray in place. Repricing keeps the
         * same node, so a tray mid-hop is not yanked out from under its own
         * animation.
         */
        update(next = {}) {
            if (next.price !== undefined) {
                assertPrice(next.price)
                currentPrice = next.price
                priceText.textContent = formatCents(currentPrice)
            }

            if (next.good !== undefined) {
                currentGood = next.good
                fitGood()
            }

            if (next.selected !== undefined) {
                isSelected = next.selected
                root.classList.toggle('is-selected', isSelected)
                if (interactive) root.setAttribute('aria-pressed', String(isSelected))
            }

            root.setAttribute('aria-label', describe())
        },

        destroy() {
            root.remove()
        },
    }
}

function assertPrice(price) {
    if (!Number.isInteger(price) || price < 0) {
        throw new RangeError(`price must be a whole number of cents, got ${price}`)
    }
}
