import { svg } from '../../lib/dom.js'
import { formatCents } from '../../lib/money.js'
import './conveyor-item.css'

/**
 * Tray proportions, each a fraction of `trayWidth`, so one number scales the
 * whole tray in proportion — the same trick `--pc-coin-size` plays for coins.
 * The overall height is derived from these parts rather than pinned separately,
 * so it cannot drift out of step with them.
 */
const GOODS = 0.5   /* the square of baked goods */
const DECK = 0.15   /* the board they rest on */
const GAP = 0.03    /* deck to price plate */
const PLATE_W = 0.68
const PLATE_H = 0.28

/** A tray's height as a multiple of its width. */
export const TRAY_ASPECT = GOODS + DECK + GAP + PLATE_H

/**
 * Placeholder fills, standing in until there is real bakery art. A tray has to
 * be *distinguishable* at a glance long before it is pretty, so the colour is
 * derived from the price: two trays at the same price always look the same, and
 * a belt of decoys does not read as one long stripe.
 *
 * Token names only — there is no raw hex outside `styles/tokens.css`.
 */
const DEBUG_FILLS = ['--pc-blue', '--pc-green', '--pc-gold', '--pc-red']

const debugFill = price => `var(${DEBUG_FILLS[price % DEBUG_FILLS.length]})`

/**
 * One tray on a conveyor belt: a graphic of baked goods over a price printed at
 * its base. The price is the whole exercise — a player grabs the tray whose
 * price equals the value of the coins in their hand — so it is the one thing
 * drawn to be legible from across a classroom.
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
    /** Width in the belt's user units. Height follows from `TRAY_ASPECT`. */
    trayWidth = 120,
    /** Called with the price when the tray is activated. Omit for a display tray. */
    onClick = null,
    /** Override the placeholder fill with any CSS colour. */
    goodsFill = null,
    selected = false,
}) {
    assertPrice(price)
    if (!(trayWidth > 0)) throw new RangeError(`trayWidth must be > 0, got ${trayWidth}`)

    const interactive = typeof onClick === 'function'

    let currentPrice = price
    let isSelected = selected

    const height = TRAY_ASPECT * trayWidth
    const goodsSide = GOODS * trayWidth
    const plateWidth = PLATE_W * trayWidth
    const plateHeight = PLATE_H * trayWidth
    const plateY = (GOODS + DECK + GAP) * trayWidth

    const goods = svg('rect', {
        class: 'pc-tray__goods',
        x: (trayWidth - goodsSide) / 2,
        y: 0,
        width: goodsSide,
        height: goodsSide,
        rx: goodsSide * 0.12,
    })

    const priceText = svg('text', {
        class: 'pc-tray__price',
        x: trayWidth / 2,
        y: plateY + plateHeight / 2,
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
        rx: DECK * trayWidth,
    })

    /*
     * A tray is mostly empty space between the goods, the deck and the plate,
     * and an SVG group only catches pointer events where it is actually
     * painted. Without a transparent hit target, a tap that lands in a gap
     * misses the tray it is obviously aimed at — a real problem for a
     * six-year-old on a tablet.
     */
    const hit = interactive
        ? svg('rect', { class: 'pc-tray__hit', x: 0, y: 0, width: trayWidth, height })
        : null

    const root = svg('g', {
        class: ['pc-tray', isSelected && 'is-selected'],
        style: { '--pc-tray-width': `${trayWidth}px`, '--pc-tray-goods': goodsFill ?? debugFill(currentPrice) },
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
        goods,
        svg('rect', {
            class: 'pc-tray__deck',
            x: 0,
            y: GOODS * trayWidth,
            width: trayWidth,
            height: DECK * trayWidth,
            rx: (DECK * trayWidth) / 2,
        }),
        svg('rect', {
            class: 'pc-tray__plate',
            x: (trayWidth - plateWidth) / 2,
            y: plateY,
            width: plateWidth,
            height: plateHeight,
            rx: plateHeight / 3,
        }),
        priceText,
    ])

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

        get price() {
            return currentPrice
        },

        get selected() {
            return isSelected
        },

        /**
         * Re-price or re-mark the tray in place. Repricing keeps the same node,
         * so a tray mid-hop is not yanked out from under its own animation.
         */
        update(next = {}) {
            if (next.price !== undefined) {
                assertPrice(next.price)
                currentPrice = next.price
                priceText.textContent = formatCents(currentPrice)
                if (goodsFill === null) root.style.setProperty('--pc-tray-goods', debugFill(currentPrice))
            }

            if (next.goodsFill !== undefined) {
                goodsFill = next.goodsFill
                root.style.setProperty('--pc-tray-goods', goodsFill ?? debugFill(currentPrice))
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
