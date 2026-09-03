/**
 * The baked goods.
 *
 * These are the app's only image files, and the only place the artwork departs
 * from the hand-built-SVG rule the rest of it follows — see docs/architecture.md.
 * The departure is deliberate and it is confined to this module: the art
 * direction is being settled from supplied reference art, and re-deriving that
 * art as paths would freeze it before it is final. Swapping the set for drawn
 * SVG later is a change here and nowhere else.
 *
 * Scope of the exception, precisely: goods are raster and *nothing else is*.
 * The belts and trays stay SVG, the room chrome is DOM and CSS, and the coins
 * stay hand-built and shared with the Lesson.
 *
 * Pure data and pure functions, no DOM.
 */

import brownieUrl from '../assets/goods/brownie.png'
import cakeUrl from '../assets/goods/cake.png'
import cupcakeUrl from '../assets/goods/cupcake.png'
import macaronUrl from '../assets/goods/macaron.png'
import pieUrl from '../assets/goods/pie.png'
import tartUrl from '../assets/goods/tart.png'

/** The set, in no meaningful order — nothing may depend on the ordering but `goodFor()`. */
export const GOODS = Object.freeze(['macaron', 'cupcake', 'cake', 'brownie', 'tart', 'pie'])

/**
 * Artwork per good.
 *
 * `scale` is a correction applied on the tray. Every good is fitted to the same
 * box, which flatters the small ones — a macaron otherwise ends up the size of a
 * slice of pie. The box is right for most of them, so the correction is per good
 * rather than global.
 */
export const GOOD_ART = Object.freeze({
    macaron: Object.freeze({ url: macaronUrl, scale: 0.5 }),
    cupcake: Object.freeze({ url: cupcakeUrl, scale: 1 }),
    cake: Object.freeze({ url: cakeUrl, scale: 1 }),
    brownie: Object.freeze({ url: brownieUrl, scale: 1 }),
    tart: Object.freeze({ url: tartUrl, scale: 1 }),
    pie: Object.freeze({ url: pieUrl, scale: 1 }),
})

/** Look up a good's artwork. Throws on an unknown key — this is a programming error. */
export function goodArt(good) {
    const art = GOOD_ART[good]
    if (!art) throw new Error(`Unknown good: ${good}`)
    return art
}

/**
 * Which pastry a tray shows.
 *
 * The wire carries no `kind` on an item — see docs/multiplayer-contract.md — so
 * it is derived from the id. A *pure function of the id* rather than a random
 * pick, because every player has to see the same pastry on the same tray: four
 * kids round a table comparing screens is the actual test.
 *
 * FNV-1a, for a spread that does not clump on sequential ids.
 *
 * Six goods across three belts of eight slots means the same pastry appears
 * three or four times on screen. That is expected: the *price* is what
 * identifies a tray, not the picture. Do not add jitter to break it up — a tray
 * whose picture changed between renders would be worse than a repeated one.
 */
export function goodFor(itemId) {
    const id = String(itemId)
    let hash = 0x811c9dc5
    for (let i = 0; i < id.length; i += 1) {
        hash ^= id.charCodeAt(i)
        hash = Math.imul(hash, 0x01000193) >>> 0
    }
    return GOODS[hash % GOODS.length]
}
