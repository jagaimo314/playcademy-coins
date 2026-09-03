import { el } from '../../lib/dom.js'
import './duct.css'

/**
 * The opening a belt runs through, at one end of one lane.
 *
 * It is a *cut in the wall*, not an object sitting on it: flat ink, hard edges,
 * no radius, no shadow, no gradient, no ribs. An earlier pass drew these as
 * 104px rounded housings with pulleys inside and they dominated the frame — the
 * belt is what the eye should follow, and a housing big enough to be a machine
 * is big enough to be the subject.
 *
 * The whole job is the layering. Mounted above the belts, a duct is what makes a
 * belt *run through* the wall rather than stop at it, so a tray arriving has
 * come from somewhere and a tray leaving has gone somewhere. The belt draws a
 * slot of overscan past each end for exactly this reason.
 */
export function createDuct({
    /**
     * `in` is the oven end, `out` the waste end. The two ends of a belt mean
     * opposite things — straight out of the oven, and gone to waste — so they
     * differ by the light at the lip and not only by which side they are on.
     */
    side = 'in',
    /** How deep the opening is, in frame pixels: a lane's tray plus its band. */
    height,
}) {
    if (side !== 'in' && side !== 'out') {
        throw new RangeError(`side must be 'in' or 'out', got ${side}`)
    }
    if (!(height > 0)) throw new RangeError(`height must be > 0, got ${height}`)

    const root = el('div', {
        class: ['pc-duct', `pc-duct--${side}`],
        style: { height: `${height}px` },
        // Scenery. The belt already names itself and its occupancy; an opening
        // in a wall has nothing of its own to say.
        'aria-hidden': 'true',
    }, el('span', { class: 'pc-duct__lip' }))

    return {
        el: root,

        destroy() {
            root.remove()
        },
    }
}
