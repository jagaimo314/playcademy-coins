import { animationSettled, el, prefersReducedMotion } from '../../lib/dom.js'
import { coin as lookup, formatCents } from '../../lib/money.js'
import { createCoinArt, DISPLAY_TYPES, isDisplayType, OPPOSITE_DISPLAY_TYPE } from './coin-faces.js'
import './coin.css'

export { DISPLAY_TYPES }

/** Half of a flip: the squash in, then the stretch back out. */
const FLIP_HALF_MS = 110

/**
 * A single coin. Used by both the Lesson (piles to skip-count) and the Bakery
 * (coins to hand over), which is exactly why it lives in `components/`.
 *
 * Presentational only: it reports clicks upward and holds no state of its own
 * beyond what the caller passes in — plus which face it is currently showing,
 * which it owns because `flipCoin()` changes it.
 */
export function createCoin({
    denomination,
    selected = false,
    onClick = null,
    /** Running total shown under the coin during skip-counting. */
    caption = null,
    /** `'Generic'` (the plain value disc), `'Heads'`, or `'Tails'`. */
    displayType = 'Generic',
}) {
    const { label, value } = lookup(denomination)
    const interactive = typeof onClick === 'function'

    if (!isDisplayType(displayType)) {
        throw new Error(`Unknown coin displayType: ${displayType}`)
    }

    let currentDisplayType = displayType
    let art = null

    const face = el('span', { class: 'pc-coin__face' }, formatCents(value))
    const captionEl = el('span', { class: 'pc-coin__caption' })

    const root = el(interactive ? 'button' : 'div', {
        type: interactive ? 'button' : null,
        class: ['pc-coin', `pc-coin--${denomination}`],
        'aria-label': `${label}, ${formatCents(value)}`,
        onClick: interactive ? () => onClick(denomination) : null,
    }, [face, captionEl])

    function setDisplayType(next) {
        if (!isDisplayType(next)) throw new Error(`Unknown coin displayType: ${next}`)

        currentDisplayType = next
        root.dataset.displayType = next

        art?.remove()
        art = createCoinArt(denomination, next)
        // Behind the caption, so a running total still reads over the artwork.
        if (art) root.prepend(art)

        face.hidden = art !== null
    }

    function update(next = {}) {
        if (next.selected !== undefined) {
            root.classList.toggle('is-selected', next.selected)
            if (interactive) root.setAttribute('aria-pressed', String(next.selected))
        }

        if (next.caption !== undefined) {
            captionEl.textContent = next.caption ?? ''
            captionEl.hidden = next.caption === null
        }

        if (next.displayType !== undefined) setDisplayType(next.displayType)
    }

    async function runFlip(changeTo) {
        const next = changeTo ?? OPPOSITE_DISPLAY_TYPE[currentDisplayType]
        if (!isDisplayType(next)) throw new Error(`Unknown coin displayType: ${next}`)

        // Nothing to show. A Generic coin has no other side, and flipping to the
        // face already up would just wobble.
        if (next === currentDisplayType) return currentDisplayType

        if (prefersReducedMotion()) {
            setDisplayType(next)
            return next
        }

        // Squash to nothing, swap the face out of sight, spring back. Faked in
        // 2D on purpose: no perspective to set up, and it reads as a flip.
        //
        // Both halves are awaited through `animationSettled`: a caller
        // sequencing flips must land on the new face even on a page that has
        // stopped painting, where the animations would otherwise never finish.
        const squash = root.animate(
            [{ transform: 'scaleX(1)' }, { transform: 'scaleX(0)' }],
            { duration: FLIP_HALF_MS, easing: 'ease-in', fill: 'forwards' },
        )
        await animationSettled(squash)

        setDisplayType(next)

        const stretch = root.animate(
            [{ transform: 'scaleX(0)' }, { transform: 'scaleX(1)' }],
            { duration: FLIP_HALF_MS, easing: 'ease-out' },
        )
        squash.cancel()
        await animationSettled(stretch)

        return next
    }

    // Flips queue rather than interrupt each other, so a double-tap lands on
    // the face you would predict instead of tearing mid-animation.
    let queue = Promise.resolve(currentDisplayType)

    /**
     * Turn the coin over. With `changeTo`, flips to that face; without it,
     * `Heads` <-> `Tails` and `Generic` stays put. Resolves with the face
     * showing once the animation finishes.
     */
    function flipCoin(changeTo) {
        queue = queue.then(() => runFlip(changeTo), () => runFlip(changeTo))
        return queue
    }

    update({ selected, caption })
    setDisplayType(displayType)

    return {
        el: root,
        denomination,
        value,
        get displayType() { return currentDisplayType },
        update,
        flipCoin,
        destroy() {
            root.remove()
        },
    }
}
