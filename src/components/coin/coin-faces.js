import { svg } from '../../lib/dom.js'
import dimeHeadsUrl from '../../assets/coins/dime-heads.png'
import dimeTailsUrl from '../../assets/coins/dime-tails.png'
import nickelHeadsUrl from '../../assets/coins/nickel-heads.png'
import nickelTailsUrl from '../../assets/coins/nickel-tails.png'
import pennyHeadsUrl from '../../assets/coins/penny-heads.png'
import pennyTailsUrl from '../../assets/coins/penny-tails.png'
import quarterHeadsUrl from '../../assets/coins/quarter-heads.png'
import quarterTailsUrl from '../../assets/coins/quarter-tails.png'

/**
 * Coin artwork. One illustration per (denomination, side), supplied as art
 * rather than drawn in code.
 *
 * These replace the hand-built SVG approximations the component started with.
 * The drawn versions could carry a beard and a colonnade but not the lettering,
 * the date, or the shape of the actual portrait — and a child matching the coin
 * on the screen to the one in their hand needs those. The supplied set is line
 * art on a transparent ground in a single ink, so the disc's metal still shows
 * through from CSS and the coin reads as copper or silver without a second copy
 * of each drawing.
 *
 * The art is still delivered inside an `<svg>` rather than as a bare `<img>`:
 * `SkipCountCurrencyGrid` scales a coin to a chart cell, and a viewBox'd `<svg>`
 * fits to whatever box it is given regardless of the file's pixel size.
 *
 * Each file is 320x320 with the coin inscribed in it, rim included — which is
 * why nothing here draws a rim of its own any more.
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

/** The two picture sides, in the order a coin turns between them. */
export const PICTURE_FACES = Object.freeze(['Heads', 'Tails'])

/**
 * `count` faces, each landing heads or tails on its own.
 *
 * Coins tipped out of a pocket land both ways, and a pile that is all heads
 * quietly teaches the wrong lesson: that a nickel is *the portrait*. The value
 * is the coin, either way up, and mixing the pile is what makes that the thing
 * being recognised rather than one picture repeated five times.
 *
 * Returned as an array rather than rolled per coin, because the same faces have
 * to appear twice — once in the pile, once on the chart the pile is counted onto
 * — and a coin that changed sides between the two would read as a different coin.
 */
export function randomFaces(count) {
    return Array.from({ length: count }, () => PICTURE_FACES[Math.random() < 0.5 ? 0 : 1])
}

/**
 * The artwork, by face then denomination. `Generic` has no entry — it is drawn
 * with plain text and needs no art.
 */
const COIN_ART = Object.freeze({
    Heads: Object.freeze({
        penny: pennyHeadsUrl,
        nickel: nickelHeadsUrl,
        dime: dimeHeadsUrl,
        quarter: quarterHeadsUrl,
    }),
    Tails: Object.freeze({
        penny: pennyTailsUrl,
        nickel: nickelTailsUrl,
        dime: dimeTailsUrl,
        quarter: quarterTailsUrl,
    }),
})

/**
 * Build the artwork for one coin face, or `null` for `Generic` (and for any
 * denomination with no art on file). Marked `aria-hidden`: the coin's own
 * `aria-label` already names the coin and its value.
 */
export function createCoinArt(denomination, displayType) {
    const url = COIN_ART[displayType]?.[denomination]
    if (!url) return null

    return svg('svg', {
        class: 'pc-coin__art',
        viewBox: '0 0 100 100',
        'aria-hidden': 'true',
        focusable: 'false',
    }, [
        svg('image', {
            href: url,
            x: 0,
            y: 0,
            width: 100,
            height: 100,
            // The file is square and already inscribed in its box, so the
            // default `preserveAspectRatio` lands it exactly on the disc.
        }),
    ])
}
