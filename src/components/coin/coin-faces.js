import { svg } from '../../lib/dom.js'

/**
 * Coin artwork. One simplistic illustration per (denomination, side).
 *
 * These are hand-drawn approximations, not renders of the real mint designs:
 * flat shapes, one shade of the coin's metal, ink outlines, so they sit inside
 * the same visual language as the rest of the app and stay legible at 3.4rem.
 * Each one is built as SVG nodes — no innerHTML, and no image files to load —
 * and takes its colours from the `--pc-coin-*` custom properties on the coin,
 * so a penny's art is copper and a dime's is silver without a second copy.
 *
 * Deliberately no value text on the art: reading the coin from its picture is
 * the skill the lesson teaches. The number stays in the accessible name (and in
 * the caption, when the caller passes one).
 */

/** The three faces a coin can show. `Generic` is the plain value disc. */
export const DISPLAY_TYPES = Object.freeze(['Generic', 'Heads', 'Tails'])

/** `Heads` <-> `Tails`; `Generic` has no other side to turn to. */
export const OPPOSITE_DISPLAY_TYPE = Object.freeze({
    Generic: 'Generic',
    Heads: 'Tails',
    Tails: 'Heads',
})

export function isDisplayType(value) {
    return DISPLAY_TYPES.includes(value)
}

// --- drawing helpers -------------------------------------------------------
// Everything is authored in a 0 0 100 100 field, inscribed in the coin's disc.

const FILLED = { fill: 'var(--pc-coin-shade)', stroke: 'var(--pc-ink)', 'stroke-width': 2.4, 'stroke-linejoin': 'round' }
const LINE = { fill: 'none', stroke: 'var(--pc-ink)', 'stroke-width': 2.4, 'stroke-linecap': 'round' }

const path = (d, props = FILLED) => svg('path', { d, ...props })
const line = d => path(d, LINE)
const circle = (cx, cy, r, props = FILLED) => svg('circle', { cx, cy, r, ...props })
const ellipse = (cx, cy, rx, ry, props = FILLED) => svg('ellipse', { cx, cy, rx, ry, ...props })
const rect = (x, y, width, height, props = FILLED) =>
    svg('rect', { x, y, width, height, rx: 1.5, ...props })
const group = (children, props = {}) => svg('g', props, children)

/** Mirror a shape across the vertical centre line — wings, branches, columns. */
const mirrored = children => group(children, { transform: 'translate(100 0) scale(-1 1)' })

/** The faint inner ring that reads as a milled edge. */
const rim = () => circle(50, 50, 44, { fill: 'none', stroke: 'var(--pc-ink)', 'stroke-width': 1.6, opacity: 0.28 })

// --- heads: a profile bust, one accent each --------------------------------

/**
 * The shared profile bust, drawn facing right. Every portrait coin starts here
 * and adds the one feature a child can actually name: Lincoln's beard,
 * Washington's wig.
 */
const PROFILE = 'M 34 88 L 33 62 C 25 55 24 34 34 26 C 41 19 55 17 62 25'
    + ' C 67 31 69 37 69 44 L 74 53 L 66 56 C 69 59 68 63 64 66'
    + ' C 60 71 51 73 44 70 C 42 74 43 82 44 88 Z'

/**
 * Lincoln looks right on the real penny and everyone else looks left, so the
 * other three get the same drawing mirrored.
 */
const profile = (accents, facing = 'left') => {
    const bust = [path(PROFILE), ...accents]
    return facing === 'right' ? group(bust) : mirrored(bust)
}

const HEADS = {
    // Lincoln: the beard is the whole tell.
    penny: () => profile([
        path('M 41 62 C 47 71 57 72 64 66 C 67 74 61 84 51 84 C 43 84 39 70 41 62 Z'),
        line('M 38 30 C 45 24 55 24 61 28'),
    ], 'right'),

    // Jefferson: hair gathered down the back into a ribboned queue.
    nickel: () => profile([
        path('M 32 44 C 24 50 20 63 24 73 C 28 79 35 77 34 70 C 30 62 30 52 35 47 Z'),
        line('M 25 64 L 33 62'),
        line('M 25 70 L 34 68'),
    ]),

    // Roosevelt: bare head, so a swept part and a shirt collar carry it.
    dime: () => profile([
        line('M 36 30 C 45 23 56 24 63 30'),
        line('M 40 88 L 47 78 L 54 88'),
    ]),

    // Washington: the wig — a rolled curl over the ear above a bagged queue.
    quarter: () => profile([
        path('M 33 40 C 23 47 21 64 27 73 C 32 79 39 76 38 69 C 33 61 32 48 36 43 Z'),
        circle(33, 52, 7),
        line('M 27 76 L 35 74'),
    ]),
}

// --- tails: the building or emblem on the reverse --------------------------

/** One leafy sprig up the left side; the dime's reverse pairs it with its mirror. */
const branch = () => group([
    line('M 26 82 C 20 68 21 52 28 42'),
    ellipse(22, 74, 6, 4),
    ellipse(21, 63, 6, 4),
    ellipse(23, 52, 6, 4),
])

/** One outstretched wing; the eagle is this shape and its mirror. */
const wing = () => path('M 46 46 C 34 34 20 33 11 43 C 22 46 30 53 37 64 C 42 59 45 52 46 46 Z')

const TAILS = {
    // Lincoln Memorial: steps, colonnade, cornice.
    penny: () => group([
        rect(16, 78, 68, 6),
        rect(21, 71, 58, 7),
        ...[27, 36, 45, 54, 63].map(x => rect(x, 45, 6, 26)),
        rect(19, 37, 62, 8),
        rect(15, 29, 70, 8),
    ]),

    // Monticello: dome over a pedimented portico.
    nickel: () => group([
        path('M 41 34 A 9 9 0 0 1 59 34 Z'),
        line('M 50 25 L 50 20'),
        path('M 20 51 L 50 33 L 80 51 Z'),
        ...[27, 39, 51, 63].map(x => rect(x, 51, 7, 21)),
        rect(17, 72, 66, 8),
    ]),

    // Torch between two branches.
    dime: () => group([
        path('M 50 12 C 43 23 40 32 43 39 C 46 44 54 44 57 39 C 60 32 57 23 50 12 Z'),
        rect(42, 40, 16, 7),
        rect(45, 47, 10, 37),
        branch(),
        mirrored([branch()]),
    ]),

    // Eagle, wings out.
    quarter: () => group([
        wing(),
        mirrored([wing()]),
        path('M 44 70 L 50 86 L 56 70 Z'),
        path('M 50 40 C 57 45 59 57 50 73 C 41 57 43 45 50 40 Z'),
        circle(50, 32, 8),
        path('M 57 30 L 67 34 L 57 37 Z'),
    ]),
}

/**
 * Build the artwork for one coin face, or `null` for `Generic` (which is drawn
 * with plain text and needs no art). Marked `aria-hidden`: the coin's own
 * `aria-label` already names the coin and its value.
 */
export function createCoinArt(denomination, displayType) {
    const side = displayType === 'Heads' ? HEADS : displayType === 'Tails' ? TAILS : null
    const draw = side?.[denomination]
    if (!draw) return null

    return svg('svg', {
        class: 'pc-coin__art',
        viewBox: '0 0 100 100',
        'aria-hidden': 'true',
        focusable: 'false',
    }, [rim(), draw()])
}
