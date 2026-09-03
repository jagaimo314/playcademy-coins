import { el } from '../../lib/dom.js'
import './bakery-counter.css'

/**
 * Depth of the slab. Lives here rather than in the stylesheet because the face
 * has to start exactly where the slab ends, and a second copy of the number in
 * CSS is how that seam opens up. Published back out for the CSS to spend — the
 * same arrangement `player-wallet` uses for its own geometry.
 */
const SLAB_H = 22

/** How far the counter bleeds past each frame edge, so no seam shows at a corner. */
const BLEED = 4

/**
 * The horizon of the picture.
 *
 * Everything above it is the back room — cool, machinery, the server's business.
 * Everything below belongs to a player. A child reads three planes off this
 * without a single perspective line: the cool wall behind, the warm wood of the
 * counter, and their own white panel in front of it.
 *
 * Two parts, because the slab overhangs its own face and the picture only works
 * if it says so. No cash register and no glass case: an earlier pass had both,
 * and they cost more vertical space than they earned. That space belongs to the
 * trays and the panels now.
 */
export function createBakeryCounter({
    /** Where the slab's top edge sits, in frame pixels. The face runs from under it. */
    top,
}) {
    if (!Number.isFinite(top)) throw new RangeError(`top must be a number, got ${top}`)

    const root = el('div', {
        class: 'pc-counter',
        style: {
            '--pc-counter-y': `${top}px`,
            '--pc-counter-slab': `${SLAB_H}px`,
            '--pc-counter-bleed': `${BLEED}px`,
        },
        // Scenery. It is the boundary the panels below already announce
        // themselves against, and it has nothing of its own to say.
        'aria-hidden': 'true',
    }, [
        el('div', { class: 'pc-counter__top' }),
        el('div', { class: 'pc-counter__face' }),
    ])

    return {
        el: root,
        /** The slab's depth, so a caller laying out the frame need not assume it. */
        slabHeight: SLAB_H,

        destroy() {
            root.remove()
        },
    }
}
