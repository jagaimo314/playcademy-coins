import { el } from '../../lib/dom.js'
import { coin as lookup, formatCents } from '../../lib/money.js'
import './coin.css'

/**
 * A single coin. Used by both the Lesson (piles to skip-count) and the Bakery
 * (coins to hand over), which is exactly why it lives in `components/`.
 *
 * Presentational only: it reports clicks upward and holds no state of its own
 * beyond what the caller passes in.
 */
export function createCoin({
    denomination,
    selected = false,
    onClick = null,
    /** Running total shown under the coin during skip-counting. */
    caption = null,
}) {
    const { label, value } = lookup(denomination)
    const interactive = typeof onClick === 'function'

    const face = el('span', { class: 'pc-coin__face' }, formatCents(value))
    const captionEl = el('span', { class: 'pc-coin__caption' })

    const root = el(interactive ? 'button' : 'div', {
        type: interactive ? 'button' : null,
        class: ['pc-coin', `pc-coin--${denomination}`],
        'aria-label': `${label}, ${formatCents(value)}`,
        onClick: interactive ? () => onClick(denomination) : null,
    }, [face, captionEl])

    function update(next = {}) {
        if (next.selected !== undefined) {
            root.classList.toggle('is-selected', next.selected)
            if (interactive) root.setAttribute('aria-pressed', String(next.selected))
        }

        if (next.caption !== undefined) {
            captionEl.textContent = next.caption ?? ''
            captionEl.hidden = next.caption === null
        }
    }

    update({ selected, caption })

    return {
        el: root,
        denomination,
        value,
        update,
        destroy() {
            root.remove()
        },
    }
}
